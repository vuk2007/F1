import { describe, expect, it } from 'vitest';
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Lap, Stint } from '@/lib/openf1/types';
import { makeFixture } from '@/lib/replay/fixture';
import { bestLongRun, bestShortRun, classifyRuns, LONG_RUN_MIN_LAPS } from './runs';

const T0 = Date.parse('2025-01-01T12:00:00.000Z');
const DRIVER = 1;

/** Laps are laid end to end so their start times are ordered. */
let clock = 0;
function lap(lapNumber: number, duration: number | null, isPitOut = false, driver = DRIVER): Lap {
  const start = new Date(T0 + clock * 1000).toISOString();
  clock += duration ?? 100;
  return {
    date_start: start,
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

function stint(stintNumber: number, lapStart: number, lapEnd: number, compound: string): Stint {
  return {
    compound,
    driver_number: DRIVER,
    lap_end: lapEnd,
    lap_start: lapStart,
    meeting_key: 1,
    session_key: 1,
    stint_number: stintNumber,
    tyre_age_at_start: 0,
  };
}

function practiceDataset(laps: Lap[], stints: Stint[]): SessionDataset {
  const base = makeFixture();
  return {
    ...base,
    session: { ...base.session, session_type: 'Practice', session_name: 'Practice 2' },
    laps,
    stints,
    pits: [],
    intervals: [],
    positions: [],
    raceControl: [],
  };
}

/**
 * Mirrors the real shape of a practice session, taken from Verstappen's FP2 at
 * Monza 2025: a couple of short runs, then a long race simulation, each stint
 * bracketed by garage time and cool-down laps.
 */
function fp2Dataset(): SessionDataset {
  clock = 0;
  const laps: Lap[] = [
    // Stint 1: out lap, one push lap, in lap.
    lap(1, null, true),
    lap(2, 81.3),
    lap(3, 145.9),
    // Stint 2: long garage stop, then a 10-lap race simulation, then back in.
    lap(4, 568.7, true),
    lap(5, 84.2),
    lap(6, 83.7),
    lap(7, 83.6),
    lap(8, 84.4),
    lap(9, 84.5),
    lap(10, 83.5),
    lap(11, 83.5),
    lap(12, 84.7),
    lap(13, 83.6),
    lap(14, 83.4),
    lap(15, 130.5),
  ];
  const stints = [stint(1, 1, 3, 'SOFT'), stint(2, 4, 15, 'MEDIUM')];
  return practiceDataset(laps, stints);
}

describe('classifyRuns', () => {
  it('separates a qualifying simulation from a race simulation', () => {
    const runs = classifyRuns(fp2Dataset(), DRIVER);

    expect(runs).toHaveLength(2);
    expect(runs[0]!.kind).toBe('short');
    expect(runs[0]!.compound).toBe('SOFT');
    expect(runs[1]!.kind).toBe('long');
    expect(runs[1]!.compound).toBe('MEDIUM');
  });

  it('throws away garage time and cool-down laps', () => {
    const runs = classifyRuns(fp2Dataset(), DRIVER);
    const longRun = runs[1]!;

    // Ten genuine laps out of the twelve in the stint.
    expect(longRun.representativeLaps).toBe(10);
    // The 568s garage lap and the 130s cool-down lap are both gone.
    expect(longRun.samples.some((s) => s.lapTime === 568.7 && s.excluded !== null)).toBe(true);
    expect(longRun.samples.some((s) => s.lapTime === 130.5 && s.excluded === 'outlier')).toBe(true);
  });

  it('measures pace and consistency from the representative laps only', () => {
    const longRun = classifyRuns(fp2Dataset(), DRIVER)[1]!;

    expect(longRun.bestLap).toBeCloseTo(83.4, 6);
    // An average dragged toward 568s would be the giveaway that filtering failed.
    expect(longRun.averageLap!).toBeGreaterThan(83);
    expect(longRun.averageLap!).toBeLessThan(85);
    expect(longRun.consistency!).toBeLessThan(1);
  });

  it('fits degradation on a long run', () => {
    const longRun = classifyRuns(fp2Dataset(), DRIVER)[1]!;
    expect(longRun.degradation).not.toBeNull();
    expect(longRun.degradation!.cleanLaps).toBeGreaterThanOrEqual(LONG_RUN_MIN_LAPS);
  });

  it('does not pretend a two-lap run has a degradation rate', () => {
    const shortRun = classifyRuns(fp2Dataset(), DRIVER)[0]!;
    expect(shortRun.degradation).toBeNull();
    expect(shortRun.slope).toBeNull();
  });

  it('calls a stint with no usable laps an installation run', () => {
    clock = 0;
    /*
     * The reference laps from another car matter: "representative" is measured
     * against the session, so without anyone setting a real time there would be
     * nothing to judge a 900-second garage lap against.
     */
    const laps = [lap(1, null, true), lap(2, 900), lap(2, 82, false, 44), lap(3, 82.5, false, 44)];
    const dataset = practiceDataset(laps, [stint(1, 1, 2, 'HARD')]);
    const runs = classifyRuns(dataset, DRIVER);

    expect(runs[0]!.kind).toBe('installation');
    expect(runs[0]!.representativeLaps).toBe(0);
    expect(runs[0]!.bestLap).toBeNull();
    expect(runs[0]!.averageLap).toBeNull();
  });

  it('respects a custom representative threshold', () => {
    clock = 0;
    // Lap numbers start at 2: lap 1 is always excluded as a standing start or out lap.
    const laps = [lap(2, 80), lap(3, 84), lap(4, 90)];
    const dataset = practiceDataset(laps, [stint(1, 2, 4, 'SOFT')]);

    // Default 107% of the 80s session best is 85.6, so the 90s lap is out.
    expect(classifyRuns(dataset, DRIVER)[0]!.representativeLaps).toBe(2);
    // Tighten to 102% = 81.6 and only the 80s lap survives.
    expect(classifyRuns(dataset, DRIVER, { threshold: 1.02 })[0]!.representativeLaps).toBe(1);
  });

  it('ignores other drivers entirely', () => {
    const dataset = fp2Dataset();
    expect(classifyRuns(dataset, 99)).toEqual([]);
  });

  it('keeps every lap of the stint in samples, including the discarded ones', () => {
    const longRun = classifyRuns(fp2Dataset(), DRIVER)[1]!;
    // The UI shows why a lap was dropped, so nothing is silently removed.
    expect(longRun.samples).toHaveLength(12);
    expect(longRun.samples.filter((s) => s.excluded !== null)).toHaveLength(2);
  });
});

describe('bestLongRun and bestShortRun', () => {
  it('picks the longest race simulation and the quickest one-lap run', () => {
    const runs = classifyRuns(fp2Dataset(), DRIVER);
    expect(bestLongRun(runs)?.stintNumber).toBe(2);
    expect(bestShortRun(runs)?.stintNumber).toBe(1);
  });

  it('returns null when a session has no run of that kind', () => {
    clock = 0;
    const laps = [lap(1, 80), lap(2, 81)];
    const dataset = practiceDataset(laps, [stint(1, 1, 2, 'SOFT')]);
    const runs = classifyRuns(dataset, DRIVER);

    expect(bestLongRun(runs)).toBeNull();
    expect(bestShortRun(runs)?.stintNumber).toBe(1);
  });

  it('prefers the longer of two race simulations', () => {
    clock = 0;
    const laps: Lap[] = [];
    for (let i = 1; i <= 6; i += 1) laps.push(lap(i, 84));
    for (let i = 7; i <= 20; i += 1) laps.push(lap(i, 84));
    const dataset = practiceDataset(laps, [stint(1, 1, 6, 'SOFT'), stint(2, 7, 20, 'MEDIUM')]);

    const runs = classifyRuns(dataset, DRIVER);
    expect(bestLongRun(runs)?.stintNumber).toBe(2);
  });
});
