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
}

export function analyseStint(
  dataset: SessionDataset,
  driverNumber: number,
  stint: Stint,
  options: AnalyseOptions = {},
): StintAnalysis {
  const periods = options.periods ?? cautionPeriods(dataset.raceControl);
  const fuelEffectPerLap =
    options.fuelEffectPerLap ?? defaultFuelEffect(dataset.session.session_type);

  let samples = collectStintLaps(dataset, driverNumber, stint, { periods });
  let degradation = tyreDegradation(samples, { fuelEffectPerLap });
  let relaxedTrafficFilter = false;

  if (degradation.cleanLaps < MIN_LAPS_BEFORE_FALLBACK) {
    const relaxed = collectStintLaps(dataset, driverNumber, stint, {
      periods,
      excludeTraffic: false,
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

/** The stint covering a lap, from an already-analysed list. */
export function stintAnalysisForLap(
  analyses: StintAnalysis[],
  lapNumber: number,
): StintAnalysis | undefined {
  return analyses.find((a) => lapNumber >= a.stint.lap_start && lapNumber <= a.stint.lap_end);
}
