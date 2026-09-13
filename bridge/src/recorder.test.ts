import { describe, expect, it } from 'vitest';
import { nextRecordingName, recordingName } from './recorder.ts';

const qualifying = {
  Key: 11365,
  Name: 'Qualifying',
  Meeting: { Name: 'Spanish Grand Prix' },
};
const race = { Key: 11369, Name: 'Race', Meeting: { Name: 'Spanish Grand Prix' } };
const dir = 'C:/F1/recordings';

describe('nextRecordingName', () => {
  it('opens the first recording from whatever the feed announces', () => {
    expect(nextRecordingName(null, qualifying)).toBe('11365-spanish-grand-prix-qualifying');
  });

  it('keeps the file while the session is the same', () => {
    const current = `${dir}/${recordingName(qualifying)}.jsonl`;
    expect(nextRecordingName(current, qualifying)).toBeNull();
  });

  it('moves to a new file when the feed switches from qualifying to the race', () => {
    // What race day looked like: the feed still announced Saturday's qualifying at 10:11.
    const current = `${dir}/${recordingName(qualifying)}.jsonl`;
    expect(nextRecordingName(current, race)).toBe('11369-spanish-grand-prix-race');
  });

  it('never moves an existing recording to an idle name when SessionInfo is missing', () => {
    const current = `${dir}/${recordingName(race)}.jsonl`;
    expect(nextRecordingName(current, undefined)).toBeNull();
    expect(nextRecordingName(current, {})).toBeNull();
  });
});
