/**
 * Run classification for practice and qualifying.
 *
 * A practice session is not a race: it is a sequence of deliberate experiments.
 * A driver leaves the garage, does one or two flat-out laps on new softs, comes
 * back in; later they go out on mediums and sit there for fifteen laps. Those
 * two things answer completely different questions, and averaging them together
 * answers neither.
 *
 * So runs are classified by how many *representative* laps they contain:
 *   - short run  : a qualifying simulation. What the car can do over one lap.
 *   - long run   : a race simulation. What the tyres do over a stint.
 *
 * "Representative" is the hard part. Verified against Verstappen's FP2 at Monza
 * 2025, a single stint contained a 474-second lap (sitting in the garage), a
 * 130-second cool-down lap, and ten genuine race-simulation laps at 83-85s. Only
 * the last group says anything about pace, so laps outside a threshold of the
 * session's best are excluded before anything is counted.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Stint } from '@/lib/openf1/types';
import { cautionPeriods, type CautionPeriod } from './caution';
import type { StintLapSample } from './stint-laps';
import { analyseStint, representativeLimit } from './stint-analysis';
import type { DegradationResult } from './tyre-degradation';

export { REPRESENTATIVE_THRESHOLD } from './stint-analysis';

/** At or above this many representative laps, a run is a race simulation. */
export const LONG_RUN_MIN_LAPS = 5;

export type RunKind = 'short' | 'long' | 'installation';

export interface Run {
  stintNumber: number;
  compound: string | null;
  lapStart: number;
  lapEnd: number;
  kind: RunKind;
  /** Laps that count as representative pace. */
  representativeLaps: number;
  /** Every lap of the stint, annotated — including the ones thrown away. */
  samples: StintLapSample[];
  bestLap: number | null;
  /** Mean of the representative laps. */
  averageLap: number | null;
  /** Spread of the representative laps, in seconds. */
  consistency: number | null;
  /** Fitted degradation. Only meaningful, and only attempted, on a long run. */
  degradation: DegradationResult | null;
  /** Degradation safe to quote; null when the fit is weak or the run is short. */
  slope: number | null;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance);
}

export interface ClassifyOptions {
  periods?: CautionPeriod[];
  /** Overrides the 107% rule. */
  threshold?: number;
  fuelEffectPerLap?: number;
}

/**
 * Splits one driver's session into classified runs.
 *
 * The per-lap filtering is done by `analyseStint`, which outside a race already
 * drops laps beyond the representative ceiling. Classification is then simply a
 * question of how many usable laps survived.
 */
export function classifyRuns(
  dataset: SessionDataset,
  driverNumber: number,
  options: ClassifyOptions = {},
): Run[] {
  const periods = options.periods ?? cautionPeriods(dataset.raceControl);
  const maxLapTime =
    options.threshold != null
      ? (representativeLimit(dataset, options.threshold) ?? undefined)
      : undefined;

  const stints = dataset.stints
    .filter((stint) => stint.driver_number === driverNumber)
    .sort((a, b) => a.stint_number - b.stint_number);

  return stints.map((stint: Stint): Run => {
    const analysis = analyseStint(dataset, driverNumber, stint, {
      periods,
      fuelEffectPerLap: options.fuelEffectPerLap,
      maxLapTime,
    });

    const representative = analysis.samples.filter(
      (sample): sample is StintLapSample & { lapTime: number } =>
        sample.excluded === null && sample.lapTime != null,
    );
    const times = representative.map((sample) => sample.lapTime);

    const kind: RunKind =
      representative.length >= LONG_RUN_MIN_LAPS
        ? 'long'
        : representative.length >= 1
          ? 'short'
          : 'installation';

    // A one or two lap run has no degradation to measure; do not pretend it does.
    const isLong = kind === 'long';

    return {
      stintNumber: stint.stint_number,
      compound: stint.compound,
      lapStart: stint.lap_start,
      lapEnd: stint.lap_end,
      kind,
      representativeLaps: representative.length,
      samples: analysis.samples,
      bestLap: times.length > 0 ? Math.min(...times) : null,
      averageLap: times.length > 0 ? mean(times) : null,
      consistency: standardDeviation(times),
      degradation: isLong ? analysis.degradation : null,
      slope: isLong ? analysis.slope : null,
    };
  });
}

/** The longest race simulation a driver did, which is the one worth reading. */
export function bestLongRun(runs: Run[]): Run | null {
  const long = runs.filter((run) => run.kind === 'long');
  if (long.length === 0) return null;
  return long.reduce((best, run) =>
    run.representativeLaps > best.representativeLaps ? run : best,
  );
}

/** The quickest short run, i.e. the driver's qualifying simulation. */
export function bestShortRun(runs: Run[]): Run | null {
  const short = runs.filter((run) => run.kind === 'short' && run.bestLap != null);
  if (short.length === 0) return null;
  return short.reduce((best, run) => (run.bestLap! < best.bestLap! ? run : best));
}
