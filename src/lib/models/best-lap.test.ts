import { describe, expect, it } from 'vitest';
import type { Lap } from '@/lib/openf1/types';
import { theoreticalBestByDriver, theoreticalBestLap } from './best-lap';

function lap(
  lapNumber: number,
  sectors: [number | null, number | null, number | null],
  duration: number | null,
  driver = 1,
): Lap {
  return {
    date_start: null,
    driver_number: driver,
    duration_sector_1: sectors[0],
    duration_sector_2: sectors[1],
    duration_sector_3: sectors[2],
    i1_speed: null,
    i2_speed: null,
    is_pit_out_lap: false,
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

describe('theoreticalBestLap', () => {
  it('sums the best sector from each part of the lap', () => {
    const result = theoreticalBestLap([
      lap(1, [27.1, 28.0, 27.0], 82.1),
      lap(2, [27.5, 27.5, 27.4], 82.4),
      lap(3, [27.3, 27.8, 26.9], 82.0),
    ]);

    expect(result.sector1).toEqual({ seconds: 27.1, lapNumber: 1 });
    expect(result.sector2).toEqual({ seconds: 27.5, lapNumber: 2 });
    expect(result.sector3).toEqual({ seconds: 26.9, lapNumber: 3 });
    expect(result.theoretical).toBeCloseTo(81.5, 3);
  });

  it('reports the time left on the table against the real best lap', () => {
    const result = theoreticalBestLap([
      lap(1, [27.1, 28.0, 27.0], 82.1),
      lap(2, [27.5, 27.5, 27.4], 82.4),
      lap(3, [27.3, 27.8, 26.9], 82.0),
    ]);
    expect(result.actualBest).toEqual({ seconds: 82.0, lapNumber: 3 });
    expect(result.timeLeftOnTable).toBeCloseTo(0.5, 3);
    expect(result.isPerfectLap).toBe(false);
  });

  it('recognises a lap that already strung the best sectors together', () => {
    const result = theoreticalBestLap([
      lap(1, [27.0, 27.5, 27.0], 81.5),
      lap(2, [27.4, 27.9, 27.3], 82.6),
    ]);
    expect(result.timeLeftOnTable).toBeCloseTo(0, 4);
    expect(result.isPerfectLap).toBe(true);
  });

  it('counts sectors from a lap that was never completed', () => {
    /*
     * An aborted lap still contains real sector times, and official timing counts
     * them. Lap 2 has a superb S1 but no lap time.
     */
    const result = theoreticalBestLap([
      lap(1, [27.5, 27.5, 27.5], 82.5),
      lap(2, [26.9, null, null], null),
    ]);
    expect(result.sector1).toEqual({ seconds: 26.9, lapNumber: 2 });
    expect(result.theoretical).toBeCloseTo(81.9, 3);
    // The best completed lap is still lap 1.
    expect(result.actualBest?.lapNumber).toBe(1);
  });

  it('ignores null, zero and negative sector times', () => {
    const result = theoreticalBestLap([
      lap(1, [27.5, 27.5, 27.5], 82.5),
      lap(2, [0, -1, null], null),
    ]);
    expect(result.sector1?.seconds).toBe(27.5);
    expect(result.sector2?.seconds).toBe(27.5);
  });

  it('returns nothing usable when a whole sector is missing', () => {
    const result = theoreticalBestLap([lap(1, [27.5, 27.5, null], null)]);
    expect(result.theoretical).toBeNull();
    expect(result.timeLeftOnTable).toBeNull();
  });

  it('handles an empty session', () => {
    const result = theoreticalBestLap([]);
    expect(result.theoretical).toBeNull();
    expect(result.actualBest).toBeNull();
    expect(result.isPerfectLap).toBe(false);
  });
});

describe('theoreticalBestByDriver', () => {
  const laps = [
    lap(1, [27.0, 27.0, 27.0], 81.0, 1),
    lap(2, [26.5, 27.0, 27.0], null, 1),
    lap(1, [28.0, 28.0, 28.0], 84.0, 44),
    lap(1, [null, null, null], null, 63),
  ];

  it('ranks drivers by theoretical best, quickest first', () => {
    const ranked = theoreticalBestByDriver(laps, [44, 1, 63]);
    expect(ranked.map((entry) => entry.driverNumber)).toEqual([1, 44, 63]);
    expect(ranked[0]!.best.theoretical).toBeCloseTo(80.5, 3);
  });

  it('sorts drivers with no usable time to the bottom', () => {
    const ranked = theoreticalBestByDriver(laps, [63, 1]);
    expect(ranked[ranked.length - 1]!.driverNumber).toBe(63);
    expect(ranked[ranked.length - 1]!.best.theoretical).toBeNull();
  });

  it('keeps each driver separate', () => {
    const ranked = theoreticalBestByDriver(laps, [44]);
    // Driver 1's quick sectors must not leak into driver 44's total.
    expect(ranked[0]!.best.theoretical).toBeCloseTo(84.0, 3);
  });
});
