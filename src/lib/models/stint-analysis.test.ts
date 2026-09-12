import { describe, expect, it } from 'vitest';
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Interval, Lap, Stint } from '@/lib/openf1/types';
import { makeFixture } from '@/lib/replay/fixture';
import {
  analyseDriverStints,
  analyseStint,
  currentPace,
  currentPaceBase,
  representativeLimit,
  stintAnalysisForLap,
} from './stint-analysis';
import { defaultFuelEffect, TYPICAL_FUEL_EFFECT_PER_LAP } from './tyre-degradation';

const T0 = Date.parse('2025-01-01T12:00:00.000Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const LAP_TIME = 90;
const DRIVER = 4;

function lap(lapNumber: number, duration: number): Lap {
  return {
    date_start: at((lapNumber - 1) * LAP_TIME),
    driver_number: DRIVER,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
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

const stint: Stint = {
  compound: 'MEDIUM',
  driver_number: DRIVER,
  lap_end: 10,
  lap_start: 1,
  meeting_key: 1,
  session_key: 1,
  stint_number: 1,
  tyre_age_at_start: 0,
};

/** Ten laps degrading at exactly 0.05 s/lap. */
const degradingLaps = Array.from({ length: 10 }, (_, i) => lap(i + 1, LAP_TIME + 0.05 * (i + 1)));

/** An interval sample mid-lap; 0 means "no car ahead". */
function interval(lapNumber: number, value: number | null): Interval {
  return {
    date: at((lapNumber - 1) * LAP_TIME + 45),
    driver_number: DRIVER,
    gap_to_leader: value,
    interval: value,
    meeting_key: 1,
    session_key: 1,
  };
}

function dataset(parts: {
  laps?: Lap[];
  intervals?: Interval[];
  stints?: Stint[];
  sessionType?: string;
}): SessionDataset {
  const base = makeFixture();
  return {
    ...base,
    session: { ...base.session, session_type: parts.sessionType ?? 'Race' },
    laps: parts.laps ?? degradingLaps,
    stints: parts.stints ?? [stint],
    pits: [],
    intervals: parts.intervals ?? [],
    positions: [],
    raceControl: [],
  };
}

describe('defaultFuelEffect', () => {
  it('corrects race stints and leaves other sessions alone', () => {
    expect(defaultFuelEffect('Race')).toBe(TYPICAL_FUEL_EFFECT_PER_LAP);
    expect(defaultFuelEffect('Qualifying')).toBe(0);
    expect(defaultFuelEffect('Practice')).toBe(0);
  });
});

describe('analyseStint', () => {
  it('applies the race fuel correction by default', () => {
    const result = analyseStint(dataset({}), DRIVER, stint);
    // Measured 0.05 s/lap, plus 0.055 of fuel burn hidden inside it.
    expect(result.degradation.fuelEffectPerLap).toBe(TYPICAL_FUEL_EFFECT_PER_LAP);
    expect(result.slope).toBeCloseTo(0.105, 6);
  });

  it('leaves qualifying uncorrected', () => {
    const result = analyseStint(dataset({ sessionType: 'Qualifying' }), DRIVER, stint);
    expect(result.degradation.fuelEffectPerLap).toBe(0);
    expect(result.slope).toBeCloseTo(0.05, 6);
  });

  it('honours an explicit fuel effect over the session default', () => {
    const result = analyseStint(dataset({}), DRIVER, stint, { fuelEffectPerLap: 0 });
    expect(result.slope).toBeCloseTo(0.05, 6);
  });

  it('treats an interval of 0 as clear air, not as traffic', () => {
    // A driver leading every lap: OpenF1 reports interval 0 because nobody is ahead.
    const intervals = degradingLaps.map((l) => interval(l.lap_number, 0));
    const result = analyseStint(dataset({ intervals }), DRIVER, stint);

    // Nine of ten: lap 1 is still excluded as a standing start.
    expect(result.degradation.cleanLaps).toBe(9);
    expect(result.relaxedTrafficFilter).toBe(false);
    expect(result.samples.filter((s) => s.excluded === 'traffic')).toHaveLength(0);
  });

  it('still excludes genuine dirty air while enough clean laps remain', () => {
    const intervals = [interval(1, 0.5), interval(2, 0.5), interval(3, 0.5)];
    const result = analyseStint(dataset({ intervals }), DRIVER, stint);

    expect(result.relaxedTrafficFilter).toBe(false);
    // Lap 1 is excluded as a standing start, so only 2 and 3 count as traffic.
    expect(result.samples.filter((s) => s.excluded === 'traffic').map((s) => s.lapNumber)).toEqual([
      2, 3,
    ]);
    expect(result.degradation.cleanLaps).toBe(7);
  });

  it('falls back when every single lap was spent in dirty air', () => {
    const intervals = degradingLaps.map((l) => interval(l.lap_number, 0.5));
    const result = analyseStint(dataset({ intervals }), DRIVER, stint);

    // Strict filtering would leave nothing at all, so the filter is relaxed and
    // the caller is told, because the resulting slope overstates degradation.
    expect(result.relaxedTrafficFilter).toBe(true);
    expect(result.degradation.cleanLaps).toBe(9);
  });

  it('relaxes the traffic filter rather than reporting nothing', () => {
    // Eight of ten laps in traffic leaves too few clean laps to fit.
    const intervals = degradingLaps
      .filter((l) => l.lap_number <= 8)
      .map((l) => interval(l.lap_number, 0.4));
    const result = analyseStint(dataset({ intervals }), DRIVER, stint);

    expect(result.relaxedTrafficFilter).toBe(true);
    expect(result.degradation.cleanLaps).toBe(9);
    expect(result.slope).toBeCloseTo(0.105, 6);
  });

  it('does not relax the filter when there are already enough clean laps', () => {
    const intervals = [interval(1, 0.4), interval(2, 0.4)];
    const result = analyseStint(dataset({ intervals }), DRIVER, stint);
    expect(result.relaxedTrafficFilter).toBe(false);
    expect(result.degradation.cleanLaps).toBe(8);
  });

  it('withholds the slope when the fit is untrustworthy', () => {
    // Wild scatter: a fit exists but must not be used for a strategy call.
    const noisy = [lap(1, 90), lap(2, 97), lap(3, 88), lap(4, 101), lap(5, 86), lap(6, 99)];
    const short: Stint = { ...stint, lap_end: 6 };
    const result = analyseStint(dataset({ laps: noisy, stints: [short] }), DRIVER, short);

    expect(result.degradation.confidence).toBe('none');
    expect(result.slope).toBeNull();
    // The raw number is still there for display and debugging.
    expect(result.degradation.slope).not.toBeNull();
  });
});

describe('representativeLimit', () => {
  it('is off during a race, where even a slow lap is a real racing lap', () => {
    expect(representativeLimit(dataset({}))).toBeNull();
  });

  it('is 107% of the session best outside a race', () => {
    // The fixture's quickest lap is 90.05.
    const limit = representativeLimit(dataset({ sessionType: 'Practice' }))!;
    expect(limit).toBeCloseTo(90.05 * 1.07, 4);
  });

  it('accepts a tighter threshold', () => {
    const limit = representativeLimit(dataset({ sessionType: 'Qualifying' }), 1.02)!;
    expect(limit).toBeCloseTo(90.05 * 1.02, 4);
  });
});

describe('practice filtering', () => {
  /** Ten racing laps plus a 400-second spell in the garage and a cool-down lap. */
  function practiceLaps(): Lap[] {
    const laps = degradingLaps.slice();
    laps.push(lap(11, 400));
    laps.push(lap(12, 150));
    return laps;
  }
  const longStint: Stint = { ...stint, lap_end: 12 };

  it('strips garage time and cool-down laps outside a race', () => {
    const data = dataset({
      laps: practiceLaps(),
      stints: [longStint],
      sessionType: 'Practice',
    });
    const result = analyseStint(data, DRIVER, longStint);

    // Lap 1 is the out lap; the 400s and 150s laps are both outliers.
    expect(result.degradation.cleanLaps).toBe(9);
    const outliers = result.samples.filter((s) => s.excluded === 'outlier');
    expect(outliers.map((s) => s.lapNumber)).toEqual([11, 12]);
  });

  it('keeps the slope sane once the garage laps are gone', () => {
    const data = dataset({
      laps: practiceLaps(),
      stints: [longStint],
      sessionType: 'Practice',
    });
    // Without the ceiling a 400s lap drags the fit to something absurd.
    expect(analyseStint(data, DRIVER, longStint).slope).toBeCloseTo(0.05, 4);
  });

  it('does not strip slow laps during a race', () => {
    const data = dataset({ laps: practiceLaps(), stints: [longStint], sessionType: 'Race' });
    const result = analyseStint(data, DRIVER, longStint);
    expect(result.samples.filter((s) => s.excluded === 'outlier').length).toBeLessThanOrEqual(1);
  });
});

describe('currentPaceBase and currentPace', () => {
  it('reports the lap time the car is actually setting', () => {
    // Laps run 90.05 up to 90.50, degrading 0.05 s/lap as measured.
    const analysis = analyseStint(dataset({}), DRIVER, stint);
    // At age 10 the measured lap time was 90 + 0.05 * 10 = 90.5.
    expect(currentPace(analysis, 10)).toBeCloseTo(90.5, 6);
  });

  it('gives a base that reproduces the measured pace when the slope is added', () => {
    const analysis = analyseStint(dataset({}), DRIVER, stint);
    const age = 7;
    const base = currentPaceBase(analysis, age)!;
    expect(base + analysis.degradation.slope! * age).toBeCloseTo(currentPace(analysis, age)!, 6);
  });

  it('differs from the raw intercept by exactly the fuel term', () => {
    const analysis = analyseStint(dataset({}), DRIVER, stint);
    const age = 20;
    const base = currentPaceBase(analysis, age)!;
    expect(analysis.degradation.intercept! - base).toBeCloseTo(
      TYPICAL_FUEL_EFFECT_PER_LAP * age,
      6,
    );
  });

  it('matches the intercept when no fuel correction is applied', () => {
    const analysis = analyseStint(dataset({ sessionType: 'Qualifying' }), DRIVER, stint);
    expect(currentPaceBase(analysis, 15)).toBeCloseTo(analysis.degradation.intercept!, 6);
  });

  it('returns null without a usable fit', () => {
    const short: Stint = { ...stint, lap_end: 2 };
    const analysis = analyseStint(dataset({ stints: [short] }), DRIVER, short);
    expect(currentPaceBase(analysis, 5)).toBeNull();
    expect(currentPace(analysis, 5)).toBeNull();
  });
});

describe('analyseDriverStints', () => {
  const twoStints: Stint[] = [
    { ...stint, lap_end: 5, stint_number: 1 },
    { ...stint, compound: 'HARD', lap_start: 6, lap_end: 10, stint_number: 2 },
  ];

  it('returns one analysis per stint, in order', () => {
    const analyses = analyseDriverStints(dataset({ stints: twoStints }), DRIVER);
    expect(analyses.map((a) => a.stint.stint_number)).toEqual([1, 2]);
    expect(analyses.map((a) => a.stint.compound)).toEqual(['MEDIUM', 'HARD']);
  });

  it('ignores other drivers', () => {
    expect(analyseDriverStints(dataset({ stints: twoStints }), 99)).toEqual([]);
  });
});

describe('stintAnalysisForLap', () => {
  const twoStints: Stint[] = [
    { ...stint, lap_end: 5, stint_number: 1 },
    { ...stint, compound: 'HARD', lap_start: 6, lap_end: 10, stint_number: 2 },
  ];
  const analyses = analyseDriverStints(dataset({ stints: twoStints }), DRIVER);

  it('finds the stint covering a lap', () => {
    expect(stintAnalysisForLap(analyses, 3)?.stint.stint_number).toBe(1);
    expect(stintAnalysisForLap(analyses, 6)?.stint.stint_number).toBe(2);
  });

  it('returns undefined outside every stint', () => {
    expect(stintAnalysisForLap(analyses, 99)).toBeUndefined();
  });
});
