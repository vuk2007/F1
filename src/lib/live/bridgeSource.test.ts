import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeSource, type SocketLike } from './bridgeSource';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../bridge/fixtures/11365-spanish-grand-prix-qualifying-snapshot.json',
);
const snapshot = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>;

/** A socket the test drives by hand, standing in for the bridge. */
class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  #handlers = new Map<string, ((event: never) => void)[]>();

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.fire('close');
  }
  addEventListener(type: string, handler: (event: never) => void): void {
    const list = this.#handlers.get(type) ?? [];
    list.push(handler);
    this.#handlers.set(type, list);
  }
  fire(type: string, event?: unknown): void {
    for (const handler of this.#handlers.get(type) ?? []) {
      (handler as (e: unknown) => void)(event);
    }
  }
  deliver(message: unknown): void {
    this.fire('message', { data: JSON.stringify(message) });
  }
}

function makeSource(options: { throttleMs?: number } = {}) {
  const sockets: FakeSocket[] = [];
  let now = Date.parse('2026-09-12T14:30:00.000Z');

  const source = new BridgeSource({
    url: 'ws://localhost:8765',
    throttleMs: options.throttleMs ?? 1_000,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    now: () => now,
  });

  return {
    source,
    sockets,
    get socket() {
      return sockets[sockets.length - 1]!;
    },
    advance(ms: number) {
      now += ms;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BridgeSource', () => {
  it('starts disconnected and holds no dataset', () => {
    const { source } = makeSource();
    expect(source.state).toMatchObject({ connected: false, dataset: null });
  });

  it('reports the socket opening', () => {
    const harness = makeSource();
    harness.source.start();
    harness.socket.fire('open');

    expect(harness.source.state.connected).toBe(true);
    expect(harness.source.state.error).toBeNull();
  });

  it('builds a dataset from a snapshot, once the throttle elapses', () => {
    const harness = makeSource({ throttleMs: 1_000 });
    harness.source.start();
    harness.socket.fire('open');
    harness.socket.deliver({ type: 'snapshot', data: snapshot });

    // Nothing yet: rebuilding on every message would mean a fresh replay index and
    // a full re-render several times a second.
    expect(harness.source.state.dataset).toBeNull();

    vi.advanceTimersByTime(1_000);

    const dataset = harness.source.state.dataset;
    expect(dataset?.session.session_key).toBe(11365);
    expect(dataset?.drivers).toHaveLength(22);
  });

  it('coalesces a burst of deltas into one rebuild', () => {
    const harness = makeSource({ throttleMs: 1_000 });
    harness.source.start();
    harness.socket.fire('open');
    harness.socket.deliver({ type: 'snapshot', data: snapshot });

    const seen: (number | null)[] = [];
    harness.source.subscribe((state) => seen.push(state.counts.positions ?? null));

    for (let i = 0; i < 20; i += 1) {
      harness.socket.deliver({
        type: 'delta',
        topic: 'TrackStatus',
        data: { Status: '1', Message: 'AllClear' },
      });
    }
    vi.advanceTimersByTime(1_000);

    // One rebuild for twenty messages.
    const rebuilds = seen.filter((count) => count !== null);
    expect(rebuilds).toHaveLength(1);
  });

  it('applies a delta as the topic new value, not as a patch of it', () => {
    /*
     * The bridge has already merged, so replacing is right. Merging a merged value
     * into the previous one would resurrect fields the feed had just cleared — a
     * sector time that should have gone blank staying on screen, for instance.
     */
    const harness = makeSource({ throttleMs: 10 });
    harness.source.start();
    harness.socket.fire('open');
    harness.socket.deliver({ type: 'snapshot', data: snapshot });
    vi.advanceTimersByTime(10);

    harness.socket.deliver({
      type: 'delta',
      topic: 'WeatherData',
      data: { AirTemp: '22.0', TrackTemp: '30.0', Humidity: '60', Rainfall: '1' },
    });
    vi.advanceTimersByTime(10);

    const weather = harness.source.state.dataset!.weather;
    const latest = weather[weather.length - 1]!;
    expect(latest.air_temperature).toBeCloseTo(22, 3);
    expect(latest.rainfall).toBe(1);
    // Pressure was in the snapshot and is absent from this delta; because the
    // bridge sends merged values, its absence here means it is genuinely gone.
    expect(latest.pressure).toBeNull();
  });

  it('tracks when something last arrived', () => {
    const harness = makeSource({ throttleMs: 10 });
    harness.source.start();
    harness.socket.fire('open');

    expect(harness.source.state.lastMessageMs).toBeNull();

    harness.socket.deliver({ type: 'snapshot', data: snapshot });
    expect(harness.source.state.lastMessageMs).toBe(Date.parse('2026-09-12T14:30:00.000Z'));

    harness.advance(5_000);
    harness.socket.deliver({ type: 'delta', topic: 'Heartbeat', data: { Utc: 'x' } });
    expect(harness.source.state.lastMessageMs).toBe(Date.parse('2026-09-12T14:30:05.000Z'));
  });

  it('separates the bridge being up from the feed being up', () => {
    // Only one of the two is something the user can do anything about.
    const harness = makeSource();
    harness.source.start();
    harness.socket.fire('open');

    expect(harness.source.state.feedConnected).toBe(false);

    harness.socket.deliver({ type: 'status', connected: true });
    expect(harness.source.state).toMatchObject({ connected: true, feedConnected: true });

    harness.socket.deliver({ type: 'status', connected: false, detail: 'closed 1006' });
    expect(harness.source.state).toMatchObject({ connected: true, feedConnected: false });
  });

  it('reconnects with a backoff when the bridge goes away', () => {
    const harness = makeSource();
    harness.source.start();
    harness.socket.fire('open');
    expect(harness.sockets).toHaveLength(1);

    harness.socket.fire('close');
    expect(harness.source.state.connected).toBe(false);

    // First retry after a second.
    vi.advanceTimersByTime(999);
    expect(harness.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(harness.sockets).toHaveLength(2);

    // Second retry backs off to two seconds rather than hammering.
    harness.socket.fire('close');
    vi.advanceTimersByTime(1_000);
    expect(harness.sockets).toHaveLength(2);
    vi.advanceTimersByTime(1_000);
    expect(harness.sockets).toHaveLength(3);
  });

  it('resets the backoff after a successful connection', () => {
    const harness = makeSource();
    harness.source.start();
    harness.socket.fire('close');
    vi.advanceTimersByTime(1_000);
    harness.socket.fire('open');
    harness.socket.fire('close');

    // Back to a one-second wait, not the escalated one.
    vi.advanceTimersByTime(1_000);
    expect(harness.sockets).toHaveLength(3);
  });

  it('keeps what it has learned across a reconnect', () => {
    const harness = makeSource({ throttleMs: 10 });
    harness.source.start();
    harness.socket.fire('open');
    harness.socket.deliver({ type: 'snapshot', data: snapshot });
    vi.advanceTimersByTime(10);

    const before = harness.source.state.dataset!.raceControl.length;

    // The bridge resubscribes and re-sends the whole log.
    harness.socket.fire('close');
    vi.advanceTimersByTime(1_000);
    harness.socket.fire('open');
    harness.socket.deliver({ type: 'snapshot', data: snapshot });
    vi.advanceTimersByTime(10);

    // Keyed rows replace rather than double up.
    expect(harness.source.state.dataset!.raceControl).toHaveLength(before);
  });

  it('says what to check when there is no bridge to talk to', () => {
    const harness = makeSource();
    harness.source.start();
    harness.socket.fire('error');

    // A browser gives no detail on a socket error, so the message has to be useful
    // without one.
    expect(harness.source.state.error).toContain('pnpm bridge');
  });

  it('ignores a message that is not JSON', () => {
    const harness = makeSource();
    harness.source.start();
    harness.socket.fire('open');
    harness.socket.fire('message', { data: 'not json' });

    expect(harness.source.state.dataset).toBeNull();
  });

  it('tells the bridge which driver is on screen', () => {
    const harness = makeSource();
    harness.source.start();
    harness.socket.fire('open');
    harness.source.subscribeDriver(44);

    expect(JSON.parse(harness.socket.sent[0]!)).toEqual({
      type: 'subscribeDriver',
      driverNumber: 44,
    });
  });

  it('stops cleanly and schedules nothing more', () => {
    const harness = makeSource();
    harness.source.start();
    harness.socket.fire('open');
    harness.source.stop();

    expect(harness.socket.closed).toBe(true);
    // A close fired by our own stop must not start a reconnect loop.
    vi.advanceTimersByTime(30_000);
    expect(harness.sockets).toHaveLength(1);
  });

  it('exposes telemetry for a driver', () => {
    const harness = makeSource({ throttleMs: 10 });
    harness.source.start();
    harness.socket.fire('open');
    harness.socket.deliver({ type: 'snapshot', data: snapshot });
    harness.socket.deliver({
      type: 'delta',
      topic: 'CarData.z',
      data: {
        Entries: [
          {
            Utc: '2026-09-12T14:30:01.000Z',
            Cars: {
              '44': { Channels: { '0': 11000, '2': 280, '3': 7, '4': 99, '5': 0, '45': 0 } },
            },
          },
        ],
      },
    });
    vi.advanceTimersByTime(10);

    expect(harness.source.carDataFor(44)).toHaveLength(1);
    expect(harness.source.carDataFor(44)[0]?.speed).toBe(280);
  });
});
