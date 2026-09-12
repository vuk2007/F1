import { describe, expect, it } from 'vitest';
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Lap, Pit, Stint } from '@/lib/openf1/types';
import { makeFixture } from '@/lib/replay/fixture';
import { buildPaceComparison, paceDomain, paceKey } from './pace';

const T0 = Date.parse('2025-01-01T12:00:00.000Z');
const LAP_TIME = 90;

function lap(driver: number, lapNumber: number, duration: number | null, isPitOut = false): Lap {
  return {
    date_start: new Date(T0 + (lapNumber - 1) * LAP_TIME * 1000).toISOString(),
    driver_number: driver,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
    i1_speed: null,
    i2_speed: null,
    is_pit_out_lap: isPitOut,
    lap_duration: duration,
    lap_number: lapNumber,
    meeting_key: 1,
    segments_sector_1: null,
    segments_sector_2: null,
    segments_sector_3: null,
    session_key: 1,
    st_speed: null,
  };
}

function stint(driver: number, lapStart: number, lapEnd: number): Stint {
  return {
    compound: 'MEDIUM',
    driver_number: driver,
    lap_end: lapEnd,
    lap_start: lapStart,
    meeting_key: 1,
    session_key: 1,
    stint_number: 1,
    tyre_age_at_start: 0,
  };
}

/** Two drivers over ten laps; driver 2 is consistently half a second slower. */
function dataset(overrides: Partial<SessionDataset> = {}): SessionDataset {
  const laps: Lap[] = [];
  for (let n = 1; n <= 10; n += 1) {
    laps.push(lap(1, n, 90));
    laps.push(lap(2, n, 90.5));
  }
  return {
    ...makeFixture(),
    laps,
    stints: [stint(1, 1, 10), stint(2, 1, 10)],
    pits: [],
    intervals: [],
    positions: [],
    raceControl: [],
    ...overrides,
  };
}

describe('buildPaceComparison', () => {
  it('puts each driver in their own series, keyed by number', () => {
    const { rows, summaries } = buildPaceComparison(dataset(), [1, 2]);

    expect(summaries.map((s) => s.key)).toEqual([paceKey(1), paceKey(2)]);
    expect(rows[0]![paceKey(1)]).toBe(90);
    expect(rows[0]![paceKey(2)]).toBe(90.5);
  });

  it('measures the gap between two drivers', () => {
    const { summaries } = buildPaceComparison(dataset(), [1, 2]);

    expect(summaries[0]!.medianLap).toBeCloseTo(90, 6);
    expect(summaries[1]!.medianLap).toBeCloseTo(90.5, 6);
    expect(summaries[0]!.deltaToBest).toBeCloseTo(0, 6);
    expect(summaries[1]!.deltaToBest).toBeCloseTo(0.5, 6);
  });

  it('uses the median, so one lap in traffic does not move the answer', () => {
    const laps: Lap[] = [];
    for (let n = 1; n <= 10; n += 1) laps.push(lap(1, n, n === 5 ? 96 : 90));
    const { summaries } = buildPaceComparison(dataset({ laps, stints: [stint(1, 1, 10)] }), [1]);

    // A mean would read about 90.7; the median ignores the lost lap entirely.
    expect(summaries[0]!.medianLap).toBeCloseTo(90, 6);
  });

  it('excludes pit laps, so a driver who stopped is not called slow', () => {
    const laps: Lap[] = [];
    for (let n = 1; n <= 10; n += 1) laps.push(lap(1, n, n === 6 ? 112 : 90, n === 6));
    const pits: Pit[] = [
      {
        date: new Date(T0 + 4 * LAP_TIME * 1000).toISOString(),
        driver_number: 1,
        lane_duration: 22,
        lap_number: 5,
        meeting_key: 1,
        pit_duration: 22,
        session_key: 1,
        stop_duration: 2.4,
      },
    ];
    const { rows, summaries } = buildPaceComparison(
      dataset({ laps, pits, stints: [stint(1, 1, 10)] }),
      [1],
    );

    // Lap 5 is the in-lap and lap 6 the out-lap; neither belongs in a pace read.
    expect(rows.find((r) => r.lapNumber === 5)).toBeUndefined();
    expect(rows.find((r) => r.lapNumber === 6)).toBeUndefined();
    expect(summaries[0]!.medianLap).toBeCloseTo(90, 6);
  });

  it('measures deltas against the quickest driver on screen', () => {
    const laps: Lap[] = [];
    for (let n = 1; n <= 10; n += 1) {
      laps.push(lap(2, n, 90.5));
      laps.push(lap(3, n, 91.5));
    }
    const { summaries } = buildPaceComparison(
      dataset({ laps, stints: [stint(2, 1, 10), stint(3, 1, 10)] }),
      [2, 3],
    );

    // Driver 1 is absent, so 90.5 becomes the reference rather than 90.
    expect(summaries[0]!.deltaToBest).toBeCloseTo(0, 6);
    expect(summaries[1]!.deltaToBest).toBeCloseTo(1.0, 6);
  });

  it('reports a driver with no usable laps without breaking the others', () => {
    const laps: Lap[] = [];
    for (let n = 1; n <= 10; n += 1) laps.push(lap(1, n, 90));
    const { summaries } = buildPaceComparison(
      dataset({ laps, stints: [stint(1, 1, 10), stint(9, 1, 10)] }),
      [1, 9],
    );

    expect(summaries[1]!.cleanLaps).toBe(0);
    expect(summaries[1]!.medianLap).toBeNull();
    expect(summaries[1]!.deltaToBest).toBeNull();
    expect(summaries[0]!.medianLap).toBeCloseTo(90, 6);
  });

  it('returns nothing for an empty selection', () => {
    expect(buildPaceComparison(dataset(), [])).toEqual({ rows: [], summaries: [] });
  });

  it('orders rows by lap number', () => {
    const { rows } = buildPaceComparison(dataset(), [1, 2]);
    expect(rows.map((r) => r.lapNumber)).toEqual(
      [...rows.map((r) => r.lapNumber)].sort((a, b) => a - b),
    );
  });
});

describe('paceDomain', () => {
  it('frames the range the lap times actually occupy', () => {
    const rows = [
      { lapNumber: 1, d1: 90 },
      { lapNumber: 2, d1: 91 },
      { lapNumber: 3, d1: 90.5 },
    ];
    const [min, max] = paceDomain(rows, ['d1'], 0);
    expect(min).toBeLessThan(90);
    expect(max).toBeGreaterThan(91);
  });

  it('trims the slowest laps so tenths stay readable', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      lapNumber: i + 1,
      d1: i === 19 ? 120 : 90,
    }));
    const [, max] = paceDomain(rows, ['d1'], 0.1);
    // A 120s lap must not stretch the axis over a field running at 90.
    expect(max).toBeLessThan(95);
  });

  it('ignores series that are not on screen', () => {
    const rows = [{ lapNumber: 1, d1: 90, d2: 200 }];
    const [, max] = paceDomain(rows, ['d1'], 0);
    expect(max).toBeLessThan(100);
  });

  it('falls back sensibly with nothing to plot', () => {
    expect(paceDomain([], ['d1'])).toEqual([0, 1]);
  });
});
