import { describe, expect, it } from 'vitest';
import { raceDistance } from './race-distance';

const T0 = Date.parse('2025-03-16T04:00:00Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

/** A leader doing `laps` laps of 90 s, plus a lapped car one lap down. */
function race(laps: number) {
  const rows = [];
  for (let n = 1; n <= laps; n += 1) {
    rows.push({ lap_number: n, date_start: at((n - 1) * 90) });
    if (n < laps) rows.push({ lap_number: n, date_start: at((n - 1) * 95) });
  }
  return rows;
}

describe('raceDistance', () => {
  it('ignores a lap started after the chequered flag', () => {
    /*
     * Australia 2025: 57 laps, but the data holds a lap 58 begun after the flag,
     * which made the strip read "Lap 57 of 58".
     */
    const laps = race(58);
    const chequered = { flag: 'CHEQUERED', date: at(57 * 90 - 1) };

    expect(raceDistance({ laps, raceControl: [chequered] })).toBe(57);
  });

  it('counts the final lap, which starts before the flag and ends after it', () => {
    const laps = race(53);
    const chequered = { flag: 'CHEQUERED', date: at(53 * 90) };

    expect(raceDistance({ laps, raceControl: [chequered] })).toBe(53);
  });

  it('uses the highest lap so far while the race is still running', () => {
    expect(raceDistance({ laps: race(30), raceControl: [] })).toBe(30);
  });

  it('skips laps with no start time once the flag is out', () => {
    const laps = [...race(10), { lap_number: 11, date_start: null }];
    const chequered = { flag: 'CHEQUERED', date: at(10 * 90) };

    expect(raceDistance({ laps, raceControl: [chequered] })).toBe(10);
  });

  it('is zero before any lap', () => {
    expect(raceDistance({ laps: [], raceControl: [] })).toBe(0);
  });
});
