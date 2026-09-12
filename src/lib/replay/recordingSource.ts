/**
 * Loads a bridge recording as a replay source.
 *
 * A session happens once. The bridge writes every message it saw to
 * `recordings/<session>.jsonl`, and this reads one back into the same
 * `SessionDataset` the OpenF1 loader produces — so a session can be replayed
 * offline as many times as the analysis needs, without waiting a week for another.
 *
 * Unlike the live path, this uses the **feed's own timestamps** rather than arrival
 * time. A recording's `received` field is when the bridge saw each message, which is
 * what makes a replay land on the same clock as the session it came from; reading it
 * with `Date.now()` would stamp a two-hour race as having happened in one second.
 *
 * Tolerances, in order of how likely each is to matter:
 *
 *  - **A truncated last line is expected**, not exceptional. The bridge is stopped
 *    with Ctrl+C mid-session and the final write may be half-flushed. JSONL is used
 *    precisely so everything before that still reads.
 *  - **A recording may hold several snapshots.** Each reconnect appends a fresh one.
 *    A snapshot replaces the feed state and is re-folded; the accumulator's keys mean
 *    the re-sent rows replace rather than duplicate.
 *  - **Blank lines are skipped**, since a text editor may have added one.
 */
import { DatasetAccumulator, type AccumulatorOptions } from '@/lib/live/accumulate';
import { FeedState } from '@/lib/live/feed-state';
import type { LapCount, SessionInfo, TimingData } from '@/lib/live/feed-types';
import {
  lapCountOf,
  normalizeTopic,
  snapshotObservedAtIso,
  type NormalizeContext,
} from '@/lib/live/normalize';
import type { SessionDataset } from '@/lib/openf1/dataset';

/** One line of a recording, as the bridge's `Recorder` writes it. */
export interface RecordedMessage {
  _id: number;
  type: 'snapshot' | 'delta';
  topic?: string;
  data: unknown;
  timestamp?: string;
  received: string;
}

export interface LoadRecordingResult {
  dataset: SessionDataset;
  /** Lines read, including the snapshots. */
  messages: number;
  /** Lines that could not be parsed. A trailing 1 is normal — see above. */
  skipped: number;
  counts: Record<string, number>;
}

export class RecordingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordingError';
  }
}

/**
 * Parses one line, returning null rather than throwing.
 *
 * The caller counts what it could not read and carries on, because one bad line in
 * a two-hour recording is not a reason to refuse the other hundred thousand.
 */
function parseLine(line: string): RecordedMessage | null {
  const text = line.trim();
  if (text === '') return null;

  try {
    const parsed = JSON.parse(text) as Partial<RecordedMessage>;
    if (parsed.type !== 'snapshot' && parsed.type !== 'delta') return null;
    return {
      _id: typeof parsed._id === 'number' ? parsed._id : 0,
      type: parsed.type,
      topic: typeof parsed.topic === 'string' ? parsed.topic : undefined,
      data: parsed.data,
      timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : undefined,
      received: typeof parsed.received === 'string' ? parsed.received : '',
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Folds a whole recording into a dataset.
 *
 * Takes the file's text rather than a path or a File, so it works the same in a
 * browser, in a test and in a script.
 */
export function loadRecording(text: string, options: AccumulatorOptions = {}): LoadRecordingResult {
  const feed = new FeedState();
  const accumulator = new DatasetAccumulator(options);

  let messages = 0;
  let skipped = 0;

  const contextAt = (receivedIso: string): NormalizeContext => {
    const info = feed.get('SessionInfo') as SessionInfo | undefined;
    const timing = feed.get('TimingData') as TimingData | undefined;

    return {
      sessionKey: info?.Key ?? 0,
      meetingKey: info?.Meeting?.Key ?? 0,
      atIso: receivedIso,
      lapNumber: lapCountOf(feed.get('LapCount') as LapCount | undefined),
      qualifyingPhase: timing?.SessionPart ?? null,
    };
  };

  for (const line of text.split('\n')) {
    const record = parseLine(line);
    if (record === null) {
      if (line.trim() !== '') skipped += 1;
      continue;
    }
    messages += 1;

    /*
     * A recording made before the process could stamp anything falls back to the
     * session start, which the snapshot itself supplies. Without a time, rows would
     * land at the epoch and sit outside the replay window entirely.
     */
    const receivedIso = record.received !== '' ? record.received : new Date(0).toISOString();

    if (record.type === 'snapshot') {
      if (!isRecord(record.data)) continue;
      feed.reset(record.data);
      // Same rule as the live path: an ended session's snapshot is its end, not
      // the moment the bridge happened to connect.
      const atIso = snapshotObservedAtIso(Date.parse(receivedIso), record.data);
      for (const topic of feed.topics()) {
        accumulator.apply(normalizeTopic(topic, feed.get(topic), contextAt(atIso)));
      }
      continue;
    }

    if (record.topic === undefined) continue;
    /*
     * Deltas are stored raw, so they are merged here — the same merge the bridge
     * ran live, which is why that function is shared rather than copied.
     */
    const merged = feed.apply(record.topic, record.data);
    accumulator.apply(normalizeTopic(record.topic, merged, contextAt(receivedIso)));
  }

  const dataset = accumulator.build();
  if (dataset === null) {
    throw new RecordingError(
      messages === 0
        ? 'That file holds no recorded messages.'
        : 'That recording has no SessionInfo, so there is no session to replay.',
    );
  }

  return { dataset, messages, skipped, counts: accumulator.counts() };
}

/** Reads a recording picked from a file input. */
export async function loadRecordingFile(file: File): Promise<LoadRecordingResult> {
  return loadRecording(await file.text());
}
