/**
 * The local WebSocket server the web app connects to.
 *
 * Protocol, from the bridge to the browser:
 *   { type: "snapshot", data }            the whole merged state, sent on connect
 *   { type: "delta", topic, data }        one topic's merged value after a patch
 *   { type: "status", connected, detail } whether the upstream feed is up
 *
 * and from the browser to the bridge:
 *   { type: "subscribeDriver", driverNumber }
 *
 * `delta` carries the topic's **merged** value rather than the raw patch. The
 * merge rules are unusual enough (see ../../src/lib/live/feed-state.ts) that doing
 * them once here is better than shipping them to every client — and it means a
 * client that joins mid-session and one that has been listening all along see the
 * same shapes.
 */
import { WebSocketServer, WebSocket } from 'ws';

export interface BridgeServerOptions {
  port: number;
  /** Called when a client connects, to get the state to send it. */
  snapshot: () => Record<string, unknown>;
  /**
   * Whether the upstream feed is currently up.
   *
   * Needed because `status` is otherwise only broadcast when it changes, so a
   * browser opened ten minutes into a session would never be told the feed was
   * fine and would sit there reporting it as down.
   */
  feedConnected: () => boolean;
}

interface Client {
  socket: WebSocket;
  /** Which driver this client is looking at, if it said. */
  driverNumber: number | null;
}

export class BridgeServer {
  #wss: WebSocketServer;
  #clients = new Set<Client>();
  #snapshot: () => Record<string, unknown>;
  #feedConnected: () => boolean;
  /** Resolves once the port is actually bound — see `url`. */
  #listening: Promise<void>;

  constructor(options: BridgeServerOptions) {
    this.#snapshot = options.snapshot;
    this.#feedConnected = options.feedConnected;
    this.#wss = new WebSocketServer({ port: options.port, host: '127.0.0.1' });
    this.#listening = new Promise((resolve, reject) => {
      this.#wss.once('listening', () => resolve());
      this.#wss.once('error', reject);
    });

    this.#wss.on('connection', (socket: WebSocket) => {
      const client: Client = { socket, driverNumber: null };
      this.#clients.add(client);

      send(socket, { type: 'snapshot', data: this.#snapshot() });
      // Straight after, so a client that joins mid-session knows where it stands.
      send(socket, { type: 'status', connected: this.#feedConnected() });

      socket.on('message', (payload: Buffer) => {
        let message: { type?: unknown; driverNumber?: unknown };
        try {
          message = JSON.parse(payload.toString('utf8')) as typeof message;
        } catch {
          return;
        }
        if (message.type === 'subscribeDriver' && typeof message.driverNumber === 'number') {
          /*
           * Recorded but not yet acted on. The obvious use is to stop forwarding
           * every car's telemetry, but the shape of CarData.z has not been seen
           * from a live session yet, and filtering on a guessed shape would drop
           * real data silently. It stays inert until a capture confirms it.
           */
          client.driverNumber = message.driverNumber;
        }
      });

      socket.on('close', () => this.#clients.delete(client));
      socket.on('error', () => this.#clients.delete(client));
    });
  }

  /**
   * The address to put in front of the user, so the port in use is never a
   * guess. Awaits `listening` first: read synchronously after the constructor it
   * reports port 0, because the bind has not happened yet.
   */
  async url(): Promise<string> {
    await this.#listening;
    const address = this.#wss.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    return `ws://localhost:${port}`;
  }

  get clientCount(): number {
    return this.#clients.size;
  }

  broadcastDelta(topic: string, data: unknown): void {
    this.#broadcast({ type: 'delta', topic, data });
  }

  broadcastSnapshot(): void {
    this.#broadcast({ type: 'snapshot', data: this.#snapshot() });
  }

  broadcastStatus(connected: boolean, detail?: string): void {
    this.#broadcast({ type: 'status', connected, detail });
  }

  #broadcast(message: unknown): void {
    const text = JSON.stringify(message);
    for (const client of this.#clients) {
      if (client.socket.readyState === WebSocket.OPEN) client.socket.send(text);
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.#clients) client.socket.close();
      this.#wss.close(() => resolve());
    });
  }
}

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
