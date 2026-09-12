import { describe, expect, it } from 'vitest';
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Interval, Lap, Pit, RaceControl, Stint } from '@/lib/openf1/types';
import { makeFixture } from '@/lib/replay/fixture';
import { collectStintLaps } from './stint-laps';

const T0 = Date.parse('2025-01-01T12:00:00.000Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

const LAP_TIME = 90;
const DRIVER = 4;

/** Lap N starts at (N-1)*90s, so lap boundaries are easy to reason about. */
function lap(lapNumber: number, overrides: Partial<Lap> = {}): Lap {
  return {
    date_start: at((lapNumber - 1) * LAP_TIME),
    driver_number: DRIVER,
    duration_sector_1: 30,
    duration_sector_2: 30,
    duration_sector_3: 30,
    i1_speed: 300,
    i2_speed: 310,
    is_pit_out_lap: false,
    lap_duration: LAP_TIME,
    lap_number: lapNumber,
    meeting_key: 1,
    segments_sector_1: null,
    segments_sector_2: null,
    segments_sector_3: null,
    session_key: 1,
    st_speed: 320,
    ...overrides,
  };
}

const stint: Stint = {
  compound: 'MEDIUM',
  driver_number: DRIVER,
  lap_end: 8,
  lap_start: 1,
  meeting_key: 1,
  session_key: 1,
  stint_number: 1,
  tyre_age_at_start: 0,
};

function makeDataset(parts: {
  laps: Lap[];
  pits?: Pit[];
  intervals?: Interval[];
  raceControl?: RaceControl[];
}): SessionDataset {
  return {
    ...makeFixture(),
    laps: parts.laps,
    stints: [stint],
    pits: parts.pits ?? [],
    intervals: parts.intervals ?? [],
    raceControl: parts.raceControl ?? [],
    positions: [],
  };
}

/** An interval sample mid-way through the given lap. */
function interval(lapNumber: number, value: number): Interval {
  return {
    date: at((lapNumber - 1) * LAP_TIME + 45),
    driver_number: DRIVER,
    gap_to_leader: value,
    interval: value,
    meeting_key: 1,
    session_key: 1,
  };
}

const eightCleanLaps = Array.from({ length: 8 }, (_, i) => lap(i + 1));

describe('collectStintLaps', () => {
  it('ages the tyre by one per lap and keeps every lap but the first', () => {
    const samples = collectStintLaps(makeDataset({ laps: eightCleanLaps }), DRIVER, stint);

    expect(samples).toHaveLength(8);
    expect(samples.map((s) => s.tyreAge)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Lap 1 is a standing start, never a representative flying lap.
    expect(samples[0]!.excluded).toBe('standing-start');
    expect(samples.slice(1).every((s) => s.excluded === null)).toBe(true);
  });

  it('prefers the specific pit reason over the lap-1 rule', () => {
    const laps = [...eightCleanLaps];
    laps[0] = lap(1, { is_pit_out_lap: true });
    const samples = collectStintLaps(makeDataset({ laps }), DRIVER, stint);
    expect(samples[0]!.excluded).toBe('pit-out');
  });

  it('carries a scrubbed set’s existing age into the stint', () => {
    const scrubbed: Stint = { ...stint, tyre_age_at_start: 3 };
    const dataset = { ...makeDataset({ laps: eightCleanLaps }), stints: [scrubbed] };
    const samples = collectStintLaps(dataset, DRIVER, scrubbed);
    expect(samples.map((s) => s.tyreAge)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('excludes the pit-out lap', () => {
    const laps = [...eightCleanLaps];
    laps[0] = lap(1, { is_pit_out_lap: true, lap_duration: 110 });

    const samples = collectStintLaps(makeDataset({ laps }), DRIVER, stint);
    expect(samples[0]!.excluded).toBe('pit-out');
    expect(samples.slice(1).every((s) => s.excluded === null)).toBe(true);
  });

  it('excludes the in-lap recorded in the pit feed', () => {
    // Verified against real data: pit.lap_number is the lap the driver entered on.
    const pits: Pit[] = [
      {
        date: at(7 * LAP_TIME),
        driver_number: DRIVER,
        lane_duration: 24,
        lap_number: 8,
        meeting_key: 1,
        pit_duration: 24,
        session_key: 1,
        stop_duration: 2.4,
      },
    ];
    const samples = collectStintLaps(makeDataset({ laps: eightCleanLaps, pits }), DRIVER, stint);
    expect(samples.find((s) => s.lapNumber === 8)!.excluded).toBe('pit-in');
  });

  it('ignores another driver’s pit stop', () => {
    const pits: Pit[] = [
      {
        date: at(7 * LAP_TIME),
        driver_number: 99,
        lane_duration: 24,
        lap_number: 8,
        meeting_key: 1,
        pit_duration: 24,
        session_key: 1,
        stop_duration: 2.4,
      },
    ];
    const samples = collectStintLaps(makeDataset({ laps: eightCleanLaps, pits }), DRIVER, stint);
    expect(samples.find((s) => s.lapNumber === 8)!.excluded).toBeNull();
  });

  it('excludes laps run under a safety car', () => {
    // Laps 4 and 5 span 270s-450s.
    const raceControl: RaceControl[] = [
      {
        category: 'SafetyCar',
        date: at(280),
        driver_number: null,
        flag: null,
        lap_number: 4,
        meeting_key: 1,
        message: 'SAFETY CAR DEPLOYED',
        qualifying_phase: null,
        scope: 'Track',
        sector: null,
        session_key: 1,
      },
      {
        category: 'SafetyCar',
        date: at(440),
        driver_number: null,
        flag: null,
        lap_number: 5,
        meeting_key: 1,
        message: 'SAFETY CAR IN THIS LAP',
        qualifying_phase: null,
        scope: 'Track',
        sector: null,
        session_key: 1,
      },
    ];

    const samples = collectStintLaps(
      makeDataset({ laps: eightCleanLaps, raceControl }),
      DRIVER,
      stint,
    );
    const excluded = samples.filter((s) => s.excluded === 'caution').map((s) => s.lapNumber);
    expect(excluded).toEqual([4, 5]);
  });

  it('excludes laps spent within a second of the car ahead', () => {
    const intervals = [interval(3, 0.6), interval(4, 0.9), interval(5, 2.4)];
    const samples = collectStintLaps(
      makeDataset({ laps: eightCleanLaps, intervals }),
      DRIVER,
      stint,
    );

    expect(samples.find((s) => s.lapNumber === 3)!.excluded).toBe('traffic');
    expect(samples.find((s) => s.lapNumber === 4)!.excluded).toBe('traffic');
    expect(samples.find((s) => s.lapNumber === 5)!.excluded).toBeNull();
  });

  it('keeps traffic laps when the caller opts out of the filter', () => {
    const intervals = [interval(3, 0.6)];
    const samples = collectStintLaps(
      makeDataset({ laps: eightCleanLaps, intervals }),
      DRIVER,
      stint,
      { excludeTraffic: false },
    );
    expect(samples.find((s) => s.lapNumber === 3)!.excluded).toBeNull();
  });

  it('treats a lapped car ahead as clean air, not traffic', () => {
    // A string interval means the car ahead is a lap up, so there is no dirty air.
    const intervals: Interval[] = [
      { ...interval(3, 0), interval: '+1 LAP', gap_to_leader: '+1 LAP' },
    ];
    const samples = collectStintLaps(
      makeDataset({ laps: eightCleanLaps, intervals }),
      DRIVER,
      stint,
    );
    expect(samples.find((s) => s.lapNumber === 3)!.excluded).toBeNull();
  });

  it('uses the median gap, so one brief lunge does not discard a clean lap', () => {
    // Four samples in lap 3: mostly clear, one moment close.
    const intervals: Interval[] = [
      { ...interval(3, 3.0), date: at(2 * LAP_TIME + 10) },
      { ...interval(3, 2.8), date: at(2 * LAP_TIME + 30) },
      { ...interval(3, 0.4), date: at(2 * LAP_TIME + 60) },
      { ...interval(3, 2.9), date: at(2 * LAP_TIME + 80) },
    ];
    const samples = collectStintLaps(
      makeDataset({ laps: eightCleanLaps, intervals }),
      DRIVER,
      stint,
    );
    expect(samples.find((s) => s.lapNumber === 3)!.excluded).toBeNull();
  });

  it('excludes a lap with no recorded time', () => {
    const laps = [...eightCleanLaps];
    laps[2] = lap(3, { lap_duration: null });
    const samples = collectStintLaps(makeDataset({ laps }), DRIVER, stint);
    expect(samples[2]!.excluded).toBe('no-time');
  });

  it('only returns laps inside the stint', () => {
    const laps = [...eightCleanLaps, lap(9), lap(10)];
    const samples = collectStintLaps(makeDataset({ laps }), DRIVER, stint);
    expect(samples.map((s) => s.lapNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('only returns laps belonging to the requested driver', () => {
    const laps = [...eightCleanLaps, { ...lap(2), driver_number: 99, lap_duration: 200 }];
    const samples = collectStintLaps(makeDataset({ laps }), DRIVER, stint);
    expect(samples).toHaveLength(8);
    expect(samples.every((s) => s.lapTime === LAP_TIME)).toBe(true);
  });

  it('applies the pit-out exclusion ahead of traffic', () => {
    // A lap can qualify for several exclusions; the more fundamental one wins.
    const laps = [...eightCleanLaps];
    laps[2] = lap(3, { is_pit_out_lap: true });
    const intervals = [interval(3, 0.5)];
    const samples = collectStintLaps(makeDataset({ laps, intervals }), DRIVER, stint);
    expect(samples[2]!.excluded).toBe('pit-out');
  });
});
