/**
 * Ties the stint pieces together: collect laps, filter, fit, and fall back
 * gracefully when a stint is too compromised to analyse strictly.
 *
 * This is the single entry point the UI should use for degradation. Doing the
 * fallback here rather than in the UI keeps the rule in one tested place.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Stint } from '@/lib/openf1/types';
import { cautionPeriods, type CautionPeriod } from './caution';
import { collectStintLaps, type StintLapSample } from './stint-laps';
import {
  defaultFuelEffect,
  tyreDegradation,
  usableSlope,
  type DegradationResult,
} from './tyre-degradation';

/**
 * Below this many clean laps a fit is too fragile to be worth having, so we
 * rather relax the traffic filter than report nothing at all.
 */
const MIN_LAPS_BEFORE_FALLBACK = 5;

export interface StintAnalysis {
  stint: Stint;
  samples: StintLapSample[];
  degradation: DegradationResult;
  /**
   * True when the traffic filter had to be relaxed to get enough laps. The slope
   * then includes dirty-air laps and will tend to overstate degradation, so the
   * UI must say so.
   */
  relaxedTrafficFilter: boolean;
  /** Slope safe to feed into strategy maths; null when the fit is untrustworthy. */
  slope: number | null;
}

export interface AnalyseOptions {
  periods?: CautionPeriod[];
  /** Overrides the per-session-type default. */
  fuelEffectPerLap?: number;
  /** Overrides the representative lap-time ceiling. */
  maxLapTime?: number;
}

/**
 * The slowest lap time still counted as representative, or null in a race.
 *
 * Races are continuous: even a slow lap is a real racing lap and is filtered by
 * the pit and caution rules instead. Practice and qualifying are not — a stint
 * there routinely contains several hundred seconds of garage time and 130s
 * cool-down laps, which would otherwise be fitted as if they were pace.
 *
 * The ceiling is measured against the session's best lap, matching F1's own
 * 107% rule, rather than against the driver's own best, which breaks down for a
 * driver who never set a representative time.
 */
export function representativeLimit(
  dataset: SessionDataset,
  threshold = REPRESENTATIVE_THRESHOLD,
): number | null {
  if (dataset.session.session_type === 'Race') return null;

  let best: number | null = null;
  for (const lap of dataset.laps) {
    if (lap.lap_duration == null || lap.lap_duration <= 0) continue;
    if (best == null || lap.lap_duration < best) best = lap.lap_duration;
  }
  return best == null ? null : best * threshold;
}

/** F1's qualifying yardstick, reused as "was this lap a real effort". */
export const REPRESENTATIVE_THRESHOLD = 1.07;

export function analyseStint(
  dataset: SessionDataset,
  driverNumber: number,
  stint: Stint,
  options: AnalyseOptions = {},
): StintAnalysis {
  const periods = options.periods ?? cautionPeriods(dataset.raceControl);
  const fuelEffectPerLap =
    options.fuelEffectPerLap ?? defaultFuelEffect(dataset.session.session_type);

  const maxLapTime = options.maxLapTime ?? representativeLimit(dataset) ?? undefined;

  let samples = collectStintLaps(dataset, driverNumber, stint, { periods, maxLapTime });
  let degradation = tyreDegradation(samples, { fuelEffectPerLap });
  let relaxedTrafficFilter = false;

  if (degradation.cleanLaps < MIN_LAPS_BEFORE_FALLBACK) {
    const relaxed = collectStintLaps(dataset, driverNumber, stint, {
      periods,
      excludeTraffic: false,
      maxLapTime,
    });
    const relaxedFit = tyreDegradation(relaxed, { fuelEffectPerLap });
    // Only accept the fallback if it actually gives us more to work with.
    if (relaxedFit.cleanLaps > degradation.cleanLaps) {
      samples = relaxed;
      degradation = relaxedFit;
      relaxedTrafficFilter = true;
    }
  }

  return {
    stint,
    samples,
    degradation,
    relaxedTrafficFilter,
    slope: usableSlope(degradation),
  };
}

/** Every stint for one driver, in order. */
export function analyseDriverStints(
  dataset: SessionDataset,
  driverNumber: number,
  options: AnalyseOptions = {},
): StintAnalysis[] {
  const periods = options.periods ?? cautionPeriods(dataset.raceControl);
  return dataset.stints
    .filter((stint) => stint.driver_number === driverNumber)
    .sort((a, b) => a.stint_number - b.stint_number)
    .map((stint) => analyseStint(dataset, driverNumber, stint, { ...options, periods }));
}

/**
 * The lap time a car is actually doing right now, expressed as a base for
 * projections: `lapTime(age) = base + slope * age`.
 *
 * Why this exists rather than using the fit's intercept directly. The intercept
 * is the FUEL-CORRECTED lap time at tyre age zero, and the correction is
 * anchored to tyre age, not to race lap. Two cars in different stints therefore
 * sit on different fuel baselines: at Monza a car on lap 45 of its first stint
 * and a car eight laps into its second are about 37 x 0.055s apart for reasons
 * that have nothing to do with pace. Comparing intercepts made a car 6.5s behind
 * project as 16s ahead.
 *
 * Subtracting the fuel term at the current age re-anchors the number to the lap
 * time the car is really setting, which is comparable between cars. Projections
 * then add each car's own degradation; the fuel both continue to burn is common
 * to them and cancels in the difference.
 */
export function currentPaceBase(analysis: StintAnalysis, tyreAge: number): number | null {
  const { intercept, fuelEffectPerLap } = analysis.degradation;
  return intercept == null ? null : intercept - fuelEffectPerLap * tyreAge;
}

/** The lap time this car is setting right now, on the measured (uncorrected) scale. */
export function currentPace(analysis: StintAnalysis, tyreAge: number): number | null {
  const base = currentPaceBase(analysis, tyreAge);
  if (base == null || analysis.degradation.slope == null) return null;
  return base + analysis.degradation.slope * tyreAge;
}

/** The stint covering a lap, from an already-analysed list. */
export function stintAnalysisForLap(
  analyses: StintAnalysis[],
  lapNumber: number,
): StintAnalysis | undefined {
  return analyses.find((a) => lapNumber >= a.stint.lap_start && lapNumber <= a.stint.lap_end);
}
