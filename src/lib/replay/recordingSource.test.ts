import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Recorder, recordingName } from '../../../bridge/src/recorder';
import { RecordingError, loadRecording } from './recordingSource';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../bridge/fixtures/11365-spanish-grand-prix-qualifying-snapshot.json',
);
const snapshot = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>;

const RECEIVED = '2026-09-12T14:30:00.000Z';

/** A recording line, in the shape the bridge writes. */
function line(record: Record<string, unknown>): string {
  return `${JSON.stringify({ received: RECEIVED, ...record })}\n`;
}

const snapshotLine = line({ _id: 0, type: 'snapshot', data: snapshot });

describe('loadRecording', () => {
  it('rebuilds the session from a snapshot line', () => {
    const result = loadRecording(snapshotLine);

    expect(result.dataset.session.session_key).toBe(11365);
    expect(result.dataset.drivers).toHaveLength(22);
    expect(result.messages).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('merges raw deltas the way the bridge did live', () => {
    /*
     * Recordings store deltas raw, so the merge has to happen here. This is the
     * reason that merge lives in one shared file rather than in two copies: a
     * recording must replay into the state the live session actually produced.
     */
    const text =
      snapshotLine +
      line({
        _id: 1,
        type: 'delta',
        topic: 'WeatherData',
        data: { AirTemp: '19.5' },
      });

    const { dataset } = loadRecording(text);
    const latest = dataset.weather[dataset.weather.length - 1]!;

    expect(latest.air_temperature).toBeCloseTo(19.5, 3);
    // A partial patch, so everything it did not mention survives the merge.
    expect(latest.pressure).toBeCloseTo(942.7, 3);
  });

  it('appends a new race control message from a numeric-keyed patch', () => {
    const before = loadRecording(snapshotLine).dataset.raceControl.length;
    const text =
      snapshotLine +
      line({
        _id: 1,
        type: 'delta',
        topic: 'RaceControlMessages',
        data: {
          Messages: {
            '135': {
              Utc: '2026-09-12T14:50:00',
              Category: 'SafetyCar',
              Message: 'SAFETY CAR DEPLOYED',
            },
          },
        },
      });

    const { dataset } = loadRecording(text);

    expect(dataset.raceControl).toHaveLength(before + 1);
    // Found by time rather than by position: the log is sorted, and this message
    // lands in the middle of a session that ran on past 14:50.
    const added = dataset.raceControl.find((row) => row.message === 'SAFETY CAR DEPLOYED');
    expect(added?.date).toBe('2026-09-12T14:50:00.000Z');
    expect(added?.category).toBe('SafetyCar');
  });

  it('uses the recorded time rather than the time of reading', () => {
    // Reading a recording with Date.now() would stamp a two-hour session as having
    // happened in the instant the file was opened.
    const { dataset } = loadRecording(
      snapshotLine + line({ _id: 1, type: 'delta', topic: 'TrackStatus', data: { Status: '1' } }),
    );

    for (const row of dataset.weather) expect(row.date).toBe(RECEIVED);
  });

  it('survives a truncated last line, which is the normal way a recording ends', () => {
    /*
     * The bridge is stopped with Ctrl+C mid-session and the final write may be
     * half-flushed. Refusing the whole file over its last line would throw away the
     * session.
     */
    const text = `${snapshotLine}{"_id":1,"type":"delta","topic":"TrackStat`;
    const result = loadRecording(text);

    expect(result.dataset.drivers).toHaveLength(22);
    expect(result.skipped).toBe(1);
    expect(result.messages).toBe(1);
  });

  it('skips blank lines without counting them as damage', () => {
    const result = loadRecording(`\n${snapshotLine}\n\n`);
    expect(result.skipped).toBe(0);
    expect(result.messages).toBe(1);
  });

  it('handles a second snapshot from a reconnect without duplicating rows', () => {
    const once = loadRecording(snapshotLine).dataset;
    const twice = loadRecording(
      snapshotLine + line({ _id: 1, type: 'snapshot', data: snapshot }),
    ).dataset;

    expect(twice.raceControl).toHaveLength(once.raceControl.length);
    expect(twice.drivers).toHaveLength(22);
  });

  it('refuses a file with no session, and says which problem it is', () => {
    expect(() => loadRecording('')).toThrow(RecordingError);
    expect(() => loadRecording('')).toThrow(/no recorded messages/);

    // Messages, but never a SessionInfo: readable, and still not a session.
    const noSession = line({ _id: 0, type: 'delta', topic: 'TrackStatus', data: { Status: '1' } });
    expect(() => loadRecording(noSession)).toThrow(/no SessionInfo/);
  });

  it('ignores lines that are not recorder output', () => {
    const result = loadRecording(`${snapshotLine}{"hello":"world"}\n[1,2,3]\n`);
    expect(result.skipped).toBe(2);
    expect(result.dataset.drivers).toHaveLength(22);
  });
});

describe('a file written by the bridge and read back', () => {
  it('round-trips through the real Recorder', () => {
    /*
     * Using the bridge's own writer rather than a hand-made file. The two sides are
     * in different packages and nothing else forces their agreement: if the recorder
     * renamed a field, every hand-written test above would still pass while real
     * recordings stopped loading.
     */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pit-wall-recording-'));
    const recorder = new Recorder(dir, recordingName(snapshot.SessionInfo));

    recorder.write({ type: 'snapshot', data: snapshot });
    recorder.write({
      type: 'delta',
      topic: 'WeatherData',
      data: { AirTemp: '18.2' },
      timestamp: '2026-09-12T14:31:00Z',
    });

    // The stream is flushed on close, so read after it resolves.
    return recorder.close().then(() => {
      const result = loadRecording(fs.readFileSync(recorder.path, 'utf8'));

      expect(result.messages).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.dataset.session.session_key).toBe(11365);

      const latest = result.dataset.weather[result.dataset.weather.length - 1]!;
      expect(latest.air_temperature).toBeCloseTo(18.2, 3);

      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  it('names the file after the session', () => {
    expect(recordingName(snapshot.SessionInfo)).toBe('11365-spanish-grand-prix-qualifying');
  });
});
