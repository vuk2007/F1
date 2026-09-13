/**
 * Writes every message to `recordings/<session>.jsonl`, one JSON object per line.
 *
 * The point of this file is that a session happens once. If the normalizers are
 * wrong — and the first version of anything reading this feed will be wrong — a
 * recording lets the same two hours be replayed a hundred times offline instead
 * of waiting a week for the next session. It is also what makes a recording
 * loadable as a replay source in the web app.
 *
 * JSONL rather than one big JSON array so the file is valid after every line: if
 * the process is killed mid-session, everything written up to that point is still
 * readable.
 */
import fs from 'node:fs';
import path from 'node:path';

/** One line of a recording. */
export interface RecordedMessage {
  /**
   * Monotonic sequence number within the recording, starting at 0. The feed's
   * own timestamps are not reliably ordered across topics, so replay needs an
   * order that cannot be argued with.
   */
  _id: number;
  /** `snapshot` is the full state; `delta` is one topic's patch. */
  type: 'snapshot' | 'delta';
  topic?: string;
  data: unknown;
  /** The feed's timestamp, verbatim, when it sent one. */
  timestamp?: string;
  /** When the bridge received it, ISO 8601. Used to pace replay. */
  received: string;
}

function slug(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * A filename from the session itself: `<key>-<meeting>-<session>.jsonl`, e.g.
 * `9999-italian-grand-prix-practice-1.jsonl`. Falls back to a timestamp when
 * SessionInfo is absent, which happens when the feed is idle between events.
 */
export function recordingName(sessionInfo: unknown): string {
  const info = (sessionInfo ?? {}) as {
    Key?: unknown;
    Name?: unknown;
    Meeting?: { Name?: unknown };
  };
  const parts = [
    typeof info.Key === 'number' || typeof info.Key === 'string' ? String(info.Key) : '',
    slug(info.Meeting?.Name),
    slug(info.Name),
  ].filter((part) => part !== '');

  if (parts.length === 0) {
    return `idle-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  }
  return parts.join('-');
}

/**
 * The recording a session change should move to, or null to keep the current one.
 *
 * The feed keeps announcing the last session for hours after it ends — the bridge
 * started at 10:11 on race day still saw Saturday's qualifying — and switches to
 * the race while the socket stays open. Without this the race is appended to the
 * qualifying file, behind a snapshot that belongs to qualifying. An idle feed with
 * no SessionInfo never moves an existing recording.
 */
export function nextRecordingName(currentPath: string | null, sessionInfo: unknown): string | null {
  const name = recordingName(sessionInfo);
  if (name.startsWith('idle-') && currentPath != null) return null;
  if (currentPath != null && path.basename(currentPath, '.jsonl') === name) return null;
  return name;
}

export class Recorder {
  #stream: fs.WriteStream;
  #nextId = 0;
  readonly path: string;

  constructor(dir: string, name: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.path = path.join(dir, `${name}.jsonl`);
    /*
     * Appending rather than truncating: a reconnect part-way through a session
     * reuses the same name, and losing the first hour to a dropped socket would
     * defeat the purpose.
     */
    this.#stream = fs.createWriteStream(this.path, { flags: 'a' });
  }

  write(message: Omit<RecordedMessage, '_id' | 'received'>): void {
    const record: RecordedMessage = {
      _id: this.#nextId,
      received: new Date().toISOString(),
      ...message,
    };
    this.#nextId += 1;
    this.#stream.write(`${JSON.stringify(record)}\n`);
  }

  get count(): number {
    return this.#nextId;
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.#stream.end(resolve));
  }
}
