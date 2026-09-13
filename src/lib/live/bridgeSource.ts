/**
 * The live source: a WebSocket to the local bridge, turned into a `SessionDataset`.
 *
 * This owns the whole path — socket, merge, normalize, accumulate — and hands out
 * a finished dataset exactly as the OpenF1 loader does. It is deliberately free of
 * React so it can be tested against a fake socket; `use-live-source.ts` is the
 * thin hook that connects it to the store.
 *
 * **Rebuilds are throttled.** Timing updates arrive several times a second, and
 * every new dataset object means a fresh replay index and a re-render of the whole
 * page. Rows are folded in the moment they arrive, but a dataset is only rebuilt
 * on a timer — once a second is far finer than anything a person can read off a
 * timing screen.
 *
 * **The dataset carries no arrival timestamps of its own.** The bridge's delta
 * message is `{type, topic, data}`, so rows are stamped with the time they reached
 * this process. For a live session that is right to within the message latency.
 * A recording replays through `recordingSource.ts` instead, which has the feed's
 * own timestamps and uses those.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import { DatasetAccumulator, type AccumulatorOptions } from './accumulate';
import { FeedState } from './feed-state';
import type { LapCount, SessionInfo, TimingData } from './feed-types';
import {
  lapCountOf,
  normalizeTopic,
  snapshotObservedAtIso,
  type NormalizeContext,
} from './normalize';

export const DEFAULT_BRIDGE_URL = 'ws://localhost:8765';

/** Minimal shape of a WebSocket, so tests can supply their own. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open', handler: () => void): void;
  addEventListener(type: 'message', handler: (event: { data: unknown }) => void): void;
  addEventListener(type: 'close', handler: () => void): void;
  addEventListener(type: 'error', handler: () => void): void;
}

export interface BridgeSourceState {
  /** The socket to the bridge is open. */
  connected: boolean;
  /**
   * The bridge says its own connection to F1 is up. False while the bridge is
   * running but the feed is down — a distinction worth showing, since only one of
   * the two is something the user can fix.
   */
  feedConnected: boolean;
  /** When anything last arrived, epoch ms. Null before the first message. */
  lastMessageMs: number | null;
  /** Null until SessionInfo has arrived and a session can be built. */
  dataset: SessionDataset | null;
  counts: Record<string, number>;
  /** Set when the bridge cannot be reached at all. */
  error: string | null;
}

export interface BridgeSourceOptions extends AccumulatorOptions {
  url?: string;
  /** Minimum gap between dataset rebuilds, ms. */
  throttleMs?: number;
  /** Injectable for tests. Defaults to the global WebSocket. */
  createSocket?: (url: string) => SocketLike;
  /** Injectable for tests. */
  now?: () => number;
}

type Listener = (state: BridgeSourceState) => void;

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 15_000;

export class BridgeSource {
  #url: string;
  #throttleMs: number;
  #createSocket: (url: string) => SocketLike;
  #now: () => number;

  #feed = new FeedState();
  #accumulator: DatasetAccumulator;
  #accumulatorOptions: AccumulatorOptions;

  #socket: SocketLike | null = null;
  #listeners = new Set<Listener>();
  #rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #retryMs = MIN_RETRY_MS;
  #stopped = false;
  #dirty = false;
  /** Whether the session in the feed has started; see #noteSessionStatus. */
  #started = false;
  #statusSessionKey: number | null = null;

  #state: BridgeSourceState = {
    connected: false,
    feedConnected: false,
    lastMessageMs: null,
    dataset: null,
    counts: {},
    error: null,
  };

  constructor(options: BridgeSourceOptions = {}) {
    this.#url = options.url ?? DEFAULT_BRIDGE_URL;
    this.#throttleMs = options.throttleMs ?? 1_000;
    this.#now = options.now ?? (() => Date.now());
    this.#createSocket =
      options.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
    this.#accumulatorOptions = { telemetryLimit: options.telemetryLimit };
    this.#accumulator = new DatasetAccumulator(this.#accumulatorOptions);
  }

  get state(): BridgeSourceState {
    return this.#state;
  }

  /** Subscribes to state changes; returns the unsubscribe. */
  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start(): void {
    this.#stopped = false;
    this.#open();
  }

  stop(): void {
    this.#stopped = true;
    if (this.#rebuildTimer !== null) clearTimeout(this.#rebuildTimer);
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    this.#rebuildTimer = null;
    this.#retryTimer = null;
    this.#socket?.close();
    this.#socket = null;
  }

  /** Tells the bridge which driver is on screen. */
  subscribeDriver(driverNumber: number): void {
    try {
      this.#socket?.send(JSON.stringify({ type: 'subscribeDriver', driverNumber }));
    } catch {
      // A closed socket is not worth reporting; the reconnect will re-send.
    }
  }

  /** Telemetry for one driver, from the accumulator's rolling window. */
  carDataFor(driverNumber: number, fromMs?: number, toMs?: number) {
    return this.#accumulator.carDataFor(driverNumber, fromMs, toMs);
  }

  locationsFor(driverNumber: number, fromMs?: number, toMs?: number) {
    return this.#accumulator.locationsFor(driverNumber, fromMs, toMs);
  }

  #open(): void {
    if (this.#stopped) return;

    let socket: SocketLike;
    try {
      socket = this.#createSocket(this.#url);
    } catch (error) {
      this.#patch({ error: describe(error), connected: false });
      this.#scheduleRetry();
      return;
    }

    this.#socket = socket;

    socket.addEventListener('open', () => {
      this.#retryMs = MIN_RETRY_MS;
      this.#patch({ connected: true, error: null });
    });

    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') this.#handle(event.data);
    });

    socket.addEventListener('close', () => {
      this.#patch({ connected: false, feedConnected: false });
      this.#scheduleRetry();
    });

    socket.addEventListener('error', () => {
      /*
       * A browser gives no detail here for security reasons, so the message says
       * what to check rather than pretending to know what went wrong.
       */
      this.#patch({ error: `no bridge at ${this.#url} — is \`pnpm bridge\` running?` });
    });
  }

  #scheduleRetry(): void {
    if (this.#stopped || this.#retryTimer !== null) return;
    const delay = this.#retryMs;
    this.#retryMs = Math.min(this.#retryMs * 2, MAX_RETRY_MS);
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.#open();
    }, delay);
  }

  #handle(raw: string): void {
    let message: { type?: unknown; topic?: unknown; data?: unknown; connected?: unknown };
    try {
      message = JSON.parse(raw) as typeof message;
    } catch {
      return;
    }

    if (message.type === 'status') {
      this.#patch({ feedConnected: message.connected === true });
      return;
    }

    if (message.type === 'snapshot' && isRecord(message.data)) {
      this.#noteSessionStatus(message.data.SessionInfo, message.data.SessionStatus);
      /*
       * A snapshot means the bridge has (re)subscribed, so the feed state starts
       * again from scratch. The accumulator is kept: it holds everything already
       * seen, and its keys mean a re-sent row replaces rather than duplicates.
       */
      this.#feed.reset(message.data);
      const atIso = snapshotObservedAtIso(this.#now(), message.data);
      for (const topic of this.#feed.topics()) this.#fold(topic, this.#feed.get(topic), atIso);
      this.#touch();
      return;
    }

    if (message.type === 'delta' && typeof message.topic === 'string') {
      /*
       * The bridge sends the topic's already-merged value, so this replaces that
       * topic rather than patching it — merging a merged value into the previous
       * one would resurrect fields the feed had cleared.
       */
      this.#feed.reset({ ...this.#feed.all(), [message.topic]: message.data });
      if (message.topic === 'SessionStatus' || message.topic === 'SessionInfo') {
        this.#noteSessionStatus(this.#feed.get('SessionInfo'), this.#feed.get('SessionStatus'));
      }
      this.#fold(message.topic, message.data);
      this.#touch();
    }
  }

  /**
   * Tracks whether the race has actually started.
   *
   * Before the start, the feed announces the race's SessionInfo but still carries the
   * previous session's timing — on race day 2026, qualifying's laps, bests and tyre
   * stints, with SessionStatus "Inactive". Until "Started" (or "Aborted", a red flag
   * after the start) arrives, a race gets its running order and nothing else, and
   * on the start everything timing-derived gathered so far is thrown away.
   */
  #noteSessionStatus(info: unknown, status: unknown): void {
    const key = (info as SessionInfo | undefined)?.Key ?? null;
    if (key !== this.#statusSessionKey) {
      this.#statusSessionKey = key;
      this.#started = false;
    }
    const word = (status as { Status?: string } | undefined)?.Status?.trim().toLowerCase();
    const running = word === 'started' || word === 'aborted';
    if (running && !this.#started) {
      this.#started = true;
      this.#accumulator.clearTiming();
      this.#dirty = true;
    }
  }

  #fold(topic: string, value: unknown, atIso?: string): void {
    let rows = normalizeTopic(topic, value, this.#context(atIso));
    const info = this.#feed.get('SessionInfo') as SessionInfo | undefined;
    if (info?.Type === 'Race' && !this.#started) {
      // Pre-race: the running order only. See #noteSessionStatus.
      rows = { ...rows, laps: undefined, stints: undefined, pits: undefined, intervals: undefined };
    }
    this.#accumulator.apply(rows);
    this.#dirty = true;
  }

  #context(atIso?: string): NormalizeContext {
    const info = this.#feed.get('SessionInfo') as SessionInfo | undefined;
    const timing = this.#feed.get('TimingData') as TimingData | undefined;

    return {
      sessionKey: info?.Key ?? 0,
      meetingKey: info?.Meeting?.Key ?? 0,
      atIso: atIso ?? new Date(this.#now()).toISOString(),
      lapNumber: lapCountOf(this.#feed.get('LapCount') as LapCount | undefined),
      qualifyingPhase: info?.Type === 'Race' ? null : (timing?.SessionPart ?? null),
      sessionType: info?.Type ?? null,
    };
  }

  #touch(): void {
    this.#state = { ...this.#state, lastMessageMs: this.#now() };
    this.#scheduleRebuild();
  }

  #scheduleRebuild(): void {
    if (this.#stopped || this.#rebuildTimer !== null) return;
    this.#rebuildTimer = setTimeout(() => {
      this.#rebuildTimer = null;
      if (!this.#dirty) {
        this.#emit();
        return;
      }
      this.#dirty = false;
      this.#patch({
        dataset: this.#accumulator.build(),
        counts: this.#accumulator.counts(),
      });
    }, this.#throttleMs);
  }

  #patch(partial: Partial<BridgeSourceState>): void {
    this.#state = { ...this.#state, ...partial };
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.#state);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
