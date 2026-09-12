/**
 * The bridge: F1 live timing feed in, local WebSocket and a JSONL recording out.
 *
 * Run it with `pnpm bridge` on the machine watching the session. It is a plain
 * Node process, deliberately not part of the Next.js app — it needs a long-lived
 * outbound socket, which is the one thing a serverless deployment cannot hold.
 *
 * Outside a session the feed connects and then says almost nothing: a Heartbeat
 * every few seconds and no more. That is the feed working, not the bridge failing.
 */
import { openFeed, type FeedMessage } from './signalr.ts';
import { FeedState } from './snapshot.ts';
import { Recorder, recordingName } from './recorder.ts';
import { BridgeServer } from './server.ts';
import { TOPICS } from './topics.ts';
import { config } from './config.ts';

const state = new FeedState();
let recorder: Recorder | null = null;
let stopping = false;

const server = new BridgeServer({ port: config.port, snapshot: () => state.all() });

function log(message: string): void {
  console.log(`[bridge] ${new Date().toISOString().slice(11, 19)} ${message}`);
}

/**
 * Reconnect delay: 1s doubling to 30s. A session lasts hours and the socket will
 * drop at some point; backing off keeps a feed outage from turning into a tight
 * reconnect loop against F1's load balancer.
 */
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
let backoff = MIN_BACKOFF_MS;

function onMessage(message: FeedMessage): void {
  const merged = state.apply(message.topic, message.data);
  recorder?.write({
    type: 'delta',
    topic: message.topic,
    data: message.data,
    timestamp: message.timestamp,
  });
  server.broadcastDelta(message.topic, merged);
}

async function connect(): Promise<void> {
  if (stopping) return;

  try {
    const feed = await openFeed(
      TOPICS,
      {
        onMessage,
        onClose: (reason) => {
          log(`feed closed: ${reason}`);
          server.broadcastStatus(false, reason);
          if (!stopping) scheduleReconnect();
        },
      },
      // Nothing here yet; `pnpm bridge:capture` is what wants the raw frames.
      {},
    );

    backoff = MIN_BACKOFF_MS;
    state.reset(feed.snapshot);

    /*
     * The recording is named after the session, which is only known once the
     * snapshot has arrived. A reconnect reuses the same name and appends, so one
     * session stays one file however many times the socket drops.
     */
    if (!recorder) {
      recorder = new Recorder(config.recordingsDir, recordingName(feed.snapshot.SessionInfo));
      log(`recording to ${recorder.path}`);
    }
    recorder.write({ type: 'snapshot', data: feed.snapshot });

    server.broadcastSnapshot();
    server.broadcastStatus(true);

    const topics = state.topics();
    log(`subscribed — ${topics.length} topics in the snapshot: ${topics.join(', ')}`);
    if (!topics.includes('CarData.z')) {
      log('no telemetry in the snapshot, so no session is running. Waiting.');
    }
  } catch (error) {
    log(`connect failed: ${error instanceof Error ? error.message : String(error)}`);
    server.broadcastStatus(false, 'connect failed');
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  const delay = backoff;
  backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  log(`reconnecting in ${Math.round(delay / 1000)}s`);
  setTimeout(() => void connect(), delay).unref();
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`stopping — ${recorder?.count ?? 0} messages recorded`);
  await recorder?.close();
  await server.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

/*
 * A summary every 30s, because a working bridge is otherwise completely silent
 * and there is no way to tell it apart from a hung one.
 */
setInterval(() => {
  if (!stopping) log(`${recorder?.count ?? 0} messages · ${server.clientCount} client(s)`);
}, 30_000).unref();

try {
  log(`serving ${await server.url()} — recordings in ${config.recordingsDir}`);
} catch (error) {
  /*
   * Almost always EADDRINUSE from a second bridge, and worth saying plainly:
   * the failure is otherwise an unhandled rejection with no mention of the port.
   */
  console.error(
    `[bridge] could not listen on port ${config.port}: ` +
      `${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

void connect();
