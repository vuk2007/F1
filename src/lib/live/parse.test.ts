import { describe, expect, it } from 'vitest';
import {
  feedLocalToMs,
  feedUtcToIso,
  feedUtcToMs,
  parseDriverNumber,
  parseFeedBoolean,
  parseFeedNumber,
  parseFeedTime,
  parseGap,
  parseGmtOffsetSeconds,
  sessionBoundsMs,
} from './parse';

describe('parseFeedTime', () => {
  it('reads a lap time', () => {
    expect(parseFeedTime('1:31.824')).toBeCloseTo(91.824, 6);
  });

  it('reads a bare sector time', () => {
    expect(parseFeedTime('42.798')).toBeCloseTo(42.798, 6);
  });

  it('reads an hours:minutes:seconds duration', () => {
    expect(parseFeedTime('1:02:03.456')).toBeCloseTo(3723.456, 6);
  });

  it('treats an empty value as unknown rather than as zero', () => {
    // The feed blanks a sector while the car is in the pits. Reading that as 0
    // would make it the fastest sector of the session.
    expect(parseFeedTime('')).toBeNull();
    expect(parseFeedTime(undefined)).toBeNull();
    expect(parseFeedTime(null)).toBeNull();
  });

  it('refuses text that is not a duration', () => {
    expect(parseFeedTime('1 LAP')).toBeNull();
    expect(parseFeedTime('no time')).toBeNull();
    expect(parseFeedTime('1:2:3:4')).toBeNull();
  });
});

describe('parseGap', () => {
  it('reads a measured gap as seconds', () => {
    expect(parseGap('+0.258')).toBeCloseTo(0.258, 6);
    expect(parseGap('1.502')).toBeCloseTo(1.502, 6);
  });

  it('keeps a lapped car as a string', () => {
    /*
     * The one that matters. parseFloat("+1 LAP") is 1, which would put a lapped
     * car one second behind the leader — a plausible-looking number, so nothing
     * downstream would flag it.
     */
    expect(parseGap('+1 LAP')).toBe('+1 LAP');
    expect(parseGap('+2 LAPS')).toBe('+2 LAPS');
  });

  it('reads a negative gap, which is how a catching car is sent', () => {
    expect(parseGap('-0.4')).toBeCloseTo(-0.4, 6);
  });

  it('treats an empty gap as unknown', () => {
    expect(parseGap('')).toBeNull();
    expect(parseGap(undefined)).toBeNull();
  });
});

describe('parseFeedNumber', () => {
  it('reads the feed habit of sending numbers as strings', () => {
    expect(parseFeedNumber('31.4')).toBeCloseTo(31.4, 6);
    expect(parseFeedNumber('0')).toBe(0);
    expect(parseFeedNumber(163)).toBe(163);
  });

  it('rejects empty and non-numeric text', () => {
    expect(parseFeedNumber('')).toBeNull();
    expect(parseFeedNumber('1 LAP')).toBeNull();
    expect(parseFeedNumber(undefined)).toBeNull();
  });
});

describe('parseFeedBoolean', () => {
  it('reads the string booleans the feed sends for a new tyre set', () => {
    expect(parseFeedBoolean('true')).toBe(true);
    expect(parseFeedBoolean('false')).toBe(false);
    expect(parseFeedBoolean(true)).toBe(true);
    expect(parseFeedBoolean('')).toBeNull();
  });
});

describe('feedUtcToIso', () => {
  it('forces UTC when the feed omits the zone', () => {
    /*
     * The feed names the field Utc and then sends no zone. JavaScript reads that
     * as local time, so this test fails by exactly the machine's offset if the
     * 'Z' is ever dropped — and passes on a UTC machine, which is why it is here
     * rather than left to be noticed.
     */
    expect(feedUtcToIso('2026-09-12T13:46:18')).toBe('2026-09-12T13:46:18.000Z');
  });

  it('leaves a timestamp that already has a zone alone', () => {
    expect(feedUtcToIso('2026-09-12T13:46:11.613Z')).toBe('2026-09-12T13:46:11.613Z');
  });

  it('truncates the feed seven-digit fractional seconds to milliseconds', () => {
    expect(feedUtcToIso('2026-09-12T15:24:08.0731684Z')).toBe('2026-09-12T15:24:08.073Z');
  });

  it('returns null rather than an Invalid Date', () => {
    expect(feedUtcToIso('')).toBeNull();
    expect(feedUtcToIso('not a date')).toBeNull();
    expect(feedUtcToIso(undefined)).toBeNull();
  });

  it('gives epoch milliseconds too', () => {
    expect(feedUtcToMs('2026-09-12T13:46:18Z')).toBe(Date.parse('2026-09-12T13:46:18Z'));
    expect(feedUtcToMs('')).toBeNull();
  });
});

describe('parseGmtOffsetSeconds', () => {
  it('reads a positive offset', () => {
    expect(parseGmtOffsetSeconds('02:00:00')).toBe(7200);
  });

  it('reads a negative offset, as the Americas send', () => {
    expect(parseGmtOffsetSeconds('-03:00:00')).toBe(-10800);
  });

  it('reads a half-hour offset', () => {
    expect(parseGmtOffsetSeconds('05:30:00')).toBe(19800);
  });

  it('falls back to UTC rather than NaN', () => {
    expect(parseGmtOffsetSeconds('')).toBe(0);
    expect(parseGmtOffsetSeconds(undefined)).toBe(0);
    expect(parseGmtOffsetSeconds('nonsense')).toBe(0);
  });
});

describe('feedLocalToMs', () => {
  it('places a local start time on the real clock', () => {
    /*
     * From the committed capture: qualifying at Madrid started 16:00 local at
     * +02:00, and that session's StatusSeries recorded SessionStatus "Started" at
     * 14:00:00Z. This asserts against that recorded fact, not against arithmetic.
     */
    expect(feedLocalToMs('2026-09-12T16:00:00', '02:00:00')).toBe(
      Date.parse('2026-09-12T14:00:00Z'),
    );
  });

  it('handles an offset west of UTC', () => {
    expect(feedLocalToMs('2025-11-02T14:00:00', '-03:00:00')).toBe(
      Date.parse('2025-11-02T17:00:00Z'),
    );
  });

  it('treats a missing offset as UTC', () => {
    expect(feedLocalToMs('2026-09-12T16:00:00', undefined)).toBe(
      Date.parse('2026-09-12T16:00:00Z'),
    );
  });

  it('returns null for a missing date', () => {
    expect(feedLocalToMs(undefined, '02:00:00')).toBeNull();
    expect(feedLocalToMs('', '02:00:00')).toBeNull();
  });
});

describe('sessionBoundsMs', () => {
  it('reads both ends of the session', () => {
    const { startMs, endMs } = sessionBoundsMs({
      StartDate: '2026-09-12T16:00:00',
      EndDate: '2026-09-12T17:00:00',
      GmtOffset: '02:00:00',
    });

    expect(startMs).toBe(Date.parse('2026-09-12T14:00:00Z'));
    expect(endMs).toBe(Date.parse('2026-09-12T15:00:00Z'));
  });

  it('survives a snapshot with no SessionInfo', () => {
    expect(sessionBoundsMs(undefined)).toEqual({ startMs: null, endMs: null });
  });
});

describe('parseDriverNumber', () => {
  it('reads the string keys the feed uses for drivers', () => {
    expect(parseDriverNumber('44')).toBe(44);
    expect(parseDriverNumber('1')).toBe(1);
  });

  it('rejects anything that is not a car number', () => {
    expect(parseDriverNumber('0')).toBeNull();
    expect(parseDriverNumber('_kf')).toBeNull();
    expect(parseDriverNumber('4.4')).toBeNull();
    expect(parseDriverNumber(undefined)).toBeNull();
  });
});
