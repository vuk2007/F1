/**
 * Card 8 — practice and qualifying: what Friday and Saturday say about Sunday.
 *
 *  - **Race degradation per compound**, from long runs. Every practice stint with
 *    at least five clean laps (the prediction rules, plus F1's 107% cut to strip
 *    garage time and cool-down laps) gets a wear slope; a compound's figure is the
 *    median of its runs. A practice long run burns fuel too, which hides part of
 *    the wear, so the typical fuel effect is added back to make the figure
 *    comparable with a race's fuel-corrected wear.
 *  - **The Q3 cut-off**, from practice 3. The tenth-fastest lap in FP3 is taken as
 *    the starting point and the typical improvement from FP3 to Q2 is subtracted.
 *    That improvement is not a guess: `pnpm calibrate` measures it at every 2024 and
 *    2025 weekend that had both sessions and stores the median.
 *  - **Theoretical best against actual**: each driver's best sectors added up,
 *    against the best lap they strung together. Not a forecast, but the other half
 *    of the same question — how much faster could this car have gone.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import { theoreticalBestLap } from '../best-lap';
import { cautionPeriods } from '../caution';
import { linearFit } from '../regression';
import { TYPICAL_FUEL_EFFECT_PER_LAP } from '../tyre-degradation';
import { IntervalLookup, cleanOnly, predictionLaps } from './clean-laps';
import { confidenceFrom, type Confidence } from './confidence';

/** Clean laps a practice stint needs to count as a long run. */
export const LONG_RUN_LAPS = 5;
/** Session-wide ceiling for garage time and in-laps, as a multiple of the best lap. */
export const GARAGE_THRESHOLD = 1.15;
/** Position whose time decides who reaches Q3. */
export const Q3_CUTOFF_POSITION = 10;

export interface PracticeCompoundDegradation {
  compound: string;
  /** Predicted race wear, s/lap, fuel effect added back. */
  degPerLap: number | null;
  runs: number;
  laps: number;
  confidence: Confidence;
  enough: boolean;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * A lap more than this far above its own run's median is not race pace — a cool-
 * down lap, a lap stuck in traffic, a mistake.
 */
export const RUN_LAP_MARGIN_S = 1.5;

function runPaceLaps<T extends { lapTime: number }>(laps: T[]): T[] {
  const typical = median(laps.map((lap) => lap.lapTime));
  return typical == null ? [] : laps.filter((lap) => lap.lapTime <= typical + RUN_LAP_MARGIN_S);
}

export function practiceDegradation(session: SessionDataset): PracticeCompoundDegradation[] {
  const periods = cautionPeriods(session.raceControl);
  const intervals = new IntervalLookup(session.intervals);
  /*
   * Only garage time is cut session-wide, with a loose ceiling. F1's 107% rule is
   * the obvious filter and it is wrong here: at Bahrain 2025 FP2 the best lap was a
   * 1:30.505 qualifying simulation, putting 107% at 96.84 s, while every race
   * simulation ran at 97-99 s on a full tank. The rule removed every long run in
   * the session. Pace is instead judged against each run's own median, below.
   */
  const times = session.laps
    .map((lap) => lap.lap_duration)
    .filter((t): t is number => t != null && t > 0);
  const limit = times.length > 0 ? Math.min(...times) * GARAGE_THRESHOLD : Infinity;

  const byCompound = new Map<string, { slopes: number[]; residuals: number[]; laps: number }>();
  for (const driver of session.drivers) {
    const laps = cleanOnly(
      predictionLaps(session, driver.driver_number, { periods, intervals }),
    ).filter((lap) => lap.lapTime <= limit);
    const stints = new Set(laps.map((lap) => lap.stintNumber));
    for (const stint of stints) {
      const run = runPaceLaps(laps.filter((lap) => lap.stintNumber === stint));
      const compound = run[0]?.compound;
      if (!compound || run.length < LONG_RUN_LAPS) continue;
      const fit = linearFit(run.map((lap) => ({ x: lap.tyreAge, y: lap.lapTime })));
      if (!fit) continue;
      const entry = byCompound.get(compound) ?? { slopes: [], residuals: [], laps: 0 };
      entry.slopes.push(fit.slope + TYPICAL_FUEL_EFFECT_PER_LAP);
      entry.residuals.push(fit.residualStdDev);
      entry.laps += run.length;
      byCompound.set(compound, entry);
    }
  }

  return [...byCompound.entries()]
    .map(([compound, entry]) => {
      const deg = median(entry.slopes);
      return {
        compound,
        degPerLap: deg == null ? null : Number(deg.toFixed(3)),
        runs: entry.slopes.length,
        laps: entry.laps,
        confidence: confidenceFrom(entry.laps, median(entry.residuals)),
        enough: deg != null,
      };
    })
    .sort((a, b) => a.compound.localeCompare(b.compound));
}

/** Each driver's best timed lap started inside a window, fastest first. */
export function bestLaps(session: SessionDataset, fromMs = -Infinity, toMs = Infinity): number[] {
  const best = new Map<number, number>();
  for (const lap of session.laps) {
    if (lap.lap_duration == null || lap.is_pit_out_lap || !lap.date_start) continue;
    const start = Date.parse(lap.date_start);
    if (Number.isNaN(start) || start < fromMs || start >= toMs) continue;
    best.set(
      lap.driver_number,
      Math.min(best.get(lap.driver_number) ?? Infinity, lap.lap_duration),
    );
  }
  return [...best.values()].sort((a, b) => a - b);
}

export function tenthBestLap(session: SessionDataset): number | null {
  return bestLaps(session)[Q3_CUTOFF_POSITION - 1] ?? null;
}

/**
 * The part of qualifying marked with a phase: from its first race control message
 * to the first message of the next phase. A red flag and restart inside Q2 stay in
 * Q2, which is what the stewards' phase numbering says too.
 */
export function qualifyingPhaseWindow(
  qualifying: SessionDataset,
  phase: number,
): { fromMs: number; toMs: number } | null {
  const first = (p: number) =>
    qualifying.raceControl
      .filter((m) => m.qualifying_phase === p)
      .map((m) => Date.parse(m.date))
      .filter((ms) => !Number.isNaN(ms))
      .sort((a, b) => a - b)[0];
  const fromMs = first(phase);
  if (fromMs === undefined) return null;
  return { fromMs, toMs: first(phase + 1) ?? Infinity };
}

/** The slowest time that reached Q3: the tenth-best lap of Q2. */
export function q3Cutoff(qualifying: SessionDataset): number | null {
  const window = qualifyingPhaseWindow(qualifying, 2);
  if (!window) return null;
  return bestLaps(qualifying, window.fromMs, window.toMs)[Q3_CUTOFF_POSITION - 1] ?? null;
}

export interface Q3Calibration {
  /** Median seconds by which the Q2 tenth-best beats the FP3 tenth-best. */
  medianImprovement: number;
  /** Typical miss of that median, in seconds. */
  spread: number;
  weekends: number;
}

export interface Q3CutoffForecast {
  predicted: number | null;
  fp3Tenth: number | null;
  improvement: number;
  confidence: Confidence;
  enough: boolean;
}

export function predictQ3Cutoff(fp3: SessionDataset, calibration: Q3Calibration): Q3CutoffForecast {
  const fp3Tenth = tenthBestLap(fp3);
  /*
   * The spread is a median absolute deviation, which hides the tail: over 2024-2025 it
   * is 0.18 s, yet four weekends in 25 missed by more than half a second, and Bahrain
   * 2025 by 1.2 s. So high confidence asks for a much tighter spread than that.
   */
  const confidence: Confidence =
    calibration.weekends >= 10 && calibration.spread <= 0.1
      ? 'high'
      : calibration.weekends >= 6 && calibration.spread <= 0.5
        ? 'medium'
        : 'low';
  return {
    predicted:
      fp3Tenth == null ? null : Number((fp3Tenth - calibration.medianImprovement).toFixed(3)),
    fp3Tenth,
    improvement: calibration.medianImprovement,
    confidence,
    enough: fp3Tenth != null,
  };
}

export interface TheoreticalVsActual {
  driverNumber: number;
  theoretical: number;
  actual: number;
  /** Seconds between the best lap and the sum of best sectors. */
  timeLeft: number;
}

export function theoreticalVsActual(session: SessionDataset): TheoreticalVsActual[] {
  return session.drivers
    .flatMap((driver) => {
      const best = theoreticalBestLap(
        session.laps.filter((lap) => lap.driver_number === driver.driver_number),
      );
      if (best.theoretical == null || best.actualBest == null) return [];
      return [
        {
          driverNumber: driver.driver_number,
          theoretical: best.theoretical,
          actual: best.actualBest.seconds,
          timeLeft: best.timeLeftOnTable ?? 0,
        },
      ];
    })
    .sort((a, b) => a.theoretical - b.theoretical);
}
