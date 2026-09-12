import { describe, expect, it } from 'vitest';
import { groupBy, lastIndexAtOrBefore, toTimed, valueAt, valuesUntil } from './timeline';

const timed = (...ts: number[]) => ts.map((t) => ({ t, value: t }));

describe('lastIndexAtOrBefore', () => {
  it('returns -1 when every record is in the future', () => {
    expect(lastIndexAtOrBefore(timed(10, 20, 30), 5)).toBe(-1);
  });

  it('returns -1 for an empty list', () => {
    expect(lastIndexAtOrBefore([], 100)).toBe(-1);
  });

  it('finds an exact match', () => {
    expect(lastIndexAtOrBefore(timed(10, 20, 30), 20)).toBe(1);
  });

  it('finds the record before a time that falls between records', () => {
    expect(lastIndexAtOrBefore(timed(10, 20, 30), 25)).toBe(1);
  });

  it('returns the final record for a time past the end', () => {
    expect(lastIndexAtOrBefore(timed(10, 20, 30), 9999)).toBe(2);
  });

  it('returns the last of several records sharing a timestamp', () => {
    expect(lastIndexAtOrBefore(timed(10, 10, 10), 10)).toBe(2);
  });

  it('agrees with a linear scan across a large list', () => {
    const items = timed(...Array.from({ length: 500 }, (_, i) => i * 2));
    for (const probe of [0, 1, 77, 500, 998, 999, 1000]) {
      const expected = items.reduce((acc, item, i) => (item.t <= probe ? i : acc), -1);
      expect(lastIndexAtOrBefore(items, probe)).toBe(expected);
    }
  });
});

describe('toTimed', () => {
  it('parses dates, sorts ascending, and drops unusable rows', () => {
    const rows = [
      { date: '2025-09-07T13:00:02.000Z' },
      { date: null },
      { date: '2025-09-07T13:00:01.000Z' },
      { date: 'not-a-date' },
    ];
    const result = toTimed(rows, (r) => r.date);
    expect(result).toHaveLength(2);
    expect(result[0]!.value.date).toBe('2025-09-07T13:00:01.000Z');
    expect(result[1]!.value.date).toBe('2025-09-07T13:00:02.000Z');
  });
});

describe('valueAt / valuesUntil', () => {
  it('returns the most recent value, or undefined before the first', () => {
    const items = timed(10, 20, 30);
    expect(valueAt(items, 25)).toBe(20);
    expect(valueAt(items, 5)).toBeUndefined();
  });

  it('returns every value up to and including the given time', () => {
    expect(valuesUntil(timed(10, 20, 30), 20)).toEqual([10, 20]);
    expect(valuesUntil(timed(10, 20, 30), 5)).toEqual([]);
  });
});

describe('groupBy', () => {
  it('groups while preserving order within each group', () => {
    const rows = [
      { n: 1, v: 'a' },
      { n: 2, v: 'b' },
      { n: 1, v: 'c' },
    ];
    const groups = groupBy(rows, (r) => r.n);
    expect(groups.get(1)?.map((r) => r.v)).toEqual(['a', 'c']);
    expect(groups.get(2)?.map((r) => r.v)).toEqual(['b']);
  });
});
