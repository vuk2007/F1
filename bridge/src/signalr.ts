/**
 * Client for the F1 live timing feed.
 *
 * The handshake below was copied from f1-dash's `signalr/src/lib.rs` and then
 * verified against the live endpoint before any of it was relied on (see
 * bridge/README.md). Two things are worth knowing because most of the
 * documentation floating around gets both wrong:
 *
 *  1. The endpoint is `/signalrcore` — SignalR Core, with the JSON hub protocol
 *     and 0x1e record separators. The older `/signalr` ASP.NET endpoint still
 *     exists but now answers 401 with `WWW-Authenticate: Basic`, so every guide
 *     describing `connectionData=[{"name":"Streaming"}]` is out of date.
 *  2. No authentication is needed on `/signalrcore`. The load balancer does want
 *     its own cookie though: an OPTIONS to /negotiate (which answers 405) sets
 *     AWSALBCORS, and that cookie is carried through negotiate and the socket so
 *     all three requests land on the same backend.
 */
import { WebSocket } from 'ws';
import { inflateTopic } from './inflate.ts';
import { isCompressed } from './topics.ts';

const BASE = 'livetiming.formula1.com/signalrcore';
/** SignalR Core terminates every frame with this, and may batch several. */
const RECORD_SEPARATOR = '';

const INVOCATION = 1;
const COMPLETION = 3;
const PING = 6;

/** One update for one topic. `data` is already inflated for `.z` topics. */
export interface FeedMessage {
  topic: string;
  data: unknown;
  /** The feed's own timestamp, not ours. Kept verbatim. */
  timestamp: string;
}

export interface Feed {
  /** The full state at subscribe time — SignalR's reply to `Subscribe`. */
  snapshot: Record<string, unknown>;
  close(): void;
}

export interface FeedHandlers {
  onMessage(message: FeedMessage): void;
  /** Fired once, whatever the reason. The caller decides whether to reconnect. */
  onClose(reason: string): void;
}

function cookiesFrom(response: Response): string {
  const jar: string[] = [];
  for (const line of response.headers.getSetCookie()) {
    const match = /^(AWSALBCORS|AWSALB)=([^;]+)/.exec(line);
    if (match) jar.push(`${match[1]}=${match[2]}`);
  }
  return jar.join('; ');
}

interface Negotiation {
  connectionToken: string;
  cookie: string;
}

async function negotiate(): Promise<Negotiation> {
  const url = `https://${BASE}/negotiate`;

  // Answers 405, which is fine: we are here for the Set-Cookie header.
  const preflight = await fetch(url, { method: 'OPTIONS' });
  let cookie = cookiesFrom(preflight);

  const response = await fetch(`${url}?negotiateVersion=1`, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  });
  if (!response.ok) {
    throw new Error(`negotiate failed: HTTP ${response.status} ${response.statusText}`);
  }
  if (!cookie) cookie = cookiesFrom(response);

  const body = (await response.json()) as { connectionToken?: string };
  if (!body.connectionToken) throw new Error('negotiate returned no connectionToken');

  return { connectionToken: body.connectionToken, cookie };
}

/** Every frame is JSON plus a trailing separator. */
function frame(value: unknown): string {
  return JSON.stringify(value) + RECORD_SEPARATOR;
}

function splitFrames(raw: string): string[] {
  return raw.split(RECORD_SEPARATOR).filter((part) => part.trim().length > 0);
}

/** The snapshot carries `.z` topics compressed too, in the same encoding. */
function inflateSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [topic, value] of Object.entries(snapshot)) {
    out[topic] = isCompressed(topic) ? inflateTopic(topic, value) : value;
  }
  return out;
}

/**
 * Connects, subscribes, and resolves once the server has sent the full snapshot.
 * Rejects if any step of that fails, so a caller only ever receives a feed that
 * is already delivering.
 */
export function openFeed(
  topics: readonly string[],
  handlers: FeedHandlers,
  options: { onRawFrame?: (raw: string) => void } = {},
): Promise<Feed> {
  return new Promise<Feed>((resolve, reject) => {
    let settled = false;
    let handshakeDone = false;
    let socket: WebSocket | null = null;
    let keepAlive: NodeJS.Timeout | null = null;

    const invocationId = '1';

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (keepAlive) clearInterval(keepAlive);
      socket?.close();
      reject(error);
    };

    negotiate()
      .then(({ connectionToken, cookie }) => {
        if (settled) return;

        const url = `wss://${BASE}?id=${encodeURIComponent(connectionToken)}`;
        socket = new WebSocket(url, {
          headers: {
            /*
             * The official client identifies itself this way, and f1-dash copies
             * it. Kept identical rather than sending a browser user agent.
             */
            'User-Agent': 'BestHTTP',
            'Accept-Encoding': 'gzip,identity',
            ...(cookie ? { Cookie: cookie } : {}),
          },
        });

        socket.on('open', () => {
          socket?.send(frame({ protocol: 'json', version: 1 }));
        });

        socket.on('error', (error: Error) => {
          if (settled) handlers.onClose(`socket error: ${error.message}`);
          else fail(error);
        });

        socket.on('close', (code: number, reasonBuffer: Buffer) => {
          if (keepAlive) clearInterval(keepAlive);
          const detail = reasonBuffer.length > 0 ? ` ${reasonBuffer.toString()}` : '';
          const reason = `closed ${code}${detail}`;
          if (settled) handlers.onClose(reason);
          else fail(new Error(reason));
        });

        socket.on('message', (payload: Buffer) => {
          const raw = payload.toString('utf8');
          options.onRawFrame?.(raw);

          for (const part of splitFrames(raw)) {
            let message: Record<string, unknown>;
            try {
              message = JSON.parse(part) as Record<string, unknown>;
            } catch {
              // One unparsable frame is not worth dropping the connection for.
              continue;
            }

            if (!handshakeDone) {
              if (typeof message.error === 'string') {
                fail(new Error(`handshake rejected: ${message.error}`));
                return;
              }
              // Success is an empty object, which reads like noise but is not.
              handshakeDone = true;
              socket?.send(
                frame({
                  type: INVOCATION,
                  invocationId,
                  target: 'Subscribe',
                  arguments: [topics],
                }),
              );
              continue;
            }

            if (message.type === COMPLETION && message.invocationId === invocationId) {
              if (typeof message.error === 'string') {
                fail(new Error(`Subscribe failed: ${message.error}`));
                return;
              }
              settled = true;
              const snapshot = inflateSnapshot((message.result ?? {}) as Record<string, unknown>);

              /* SignalR Core drops a connection that goes quiet in both directions. */
              keepAlive = setInterval(() => {
                if (socket?.readyState === WebSocket.OPEN) socket.send(frame({ type: PING }));
              }, 10_000);
              keepAlive.unref();

              resolve({
                snapshot,
                close: () => {
                  if (keepAlive) clearInterval(keepAlive);
                  socket?.close();
                },
              });
              continue;
            }

            if (message.type === PING) continue;

            if (message.type === INVOCATION && message.target === 'feed') {
              const args = message.arguments as [string, unknown, string] | undefined;
              if (!args) continue;
              const [topic, data, timestamp] = args;
              handlers.onMessage({
                topic,
                data: isCompressed(topic) ? inflateTopic(topic, data) : data,
                timestamp,
              });
            }
          }
        });
      })
      .catch((error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));
  });
}
