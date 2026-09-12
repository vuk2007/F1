/**
 * Tyre degradation: how much lap time a driver loses per lap of tyre age.
 *
 * Fits lap time against tyre age over clean laps only (see stint-laps.ts) and
 * reports how much the answer can be trusted. A slope is worthless without that
 * context — five laps in traffic can "prove" almost anything.
 *
 * Two caveats the caller should carry into any interpretation:
 *  - In a race, fuel burn-off makes the car faster by roughly 0.03-0.06 s/lap,
 *    which masks part of the degradation. Pass `fuelEffectPerLap` to correct for
 *    it; the default of 0 leaves the slope as measured, so nothing is invented.
 *  - Degradation is only linear over the usable life of a tyre. Past the cliff it
 *    is not, and a linear fit will understate how bad things have become.
 */
import { linearFit, predict, residual, type LinearFit, type Point } from './regression';
import type { StintLapSample } from './stint-laps';

/**
 * Approximate time a car gains per lap purely from burning fuel off, in seconds.
 *
 * A car starts a race around 100kg heavy and burns roughly 1.6-1.9 kg/lap, and
 * 10kg is worth about 0.3s/lap, which lands near 0.05s/lap. It varies by circuit
 * and is an estimate, not a measurement — but leaving it out is not the neutral
 * choice. Measured against the 2025 Italian GP with no correction, every single
 * driver's race stint fits a NEGATIVE slope (tyres apparently getting faster),
 * because fuel burn outweighs Monza's low degradation. Uncorrected race slopes
 * are therefore not merely imprecise, they have the wrong sign.
 */
export const TYPICAL_FUEL_EFFECT_PER_LAP = 0.055;

/**
 * The fuel correction appropriate to a session type. Practice and qualifying runs
 * are short and fuel-corrected by the teams already, so no adjustment is applied.
 */
export function defaultFuelEffect(sessionType: string): number {
  return sessionType === 'Race' ? TYPICAL_FUEL_EFFECT_PER_LAP : 0;
}

export type DegradationConfidence = 'none' | 'low' | 'medium' | 'high';

export interface DegradationPoint {
  tyreAge: number;
  /** Fitted lap time at this tyre age. */
  predicted: number;
}

export interface DegradationResult {
  /** Seconds lost per lap of tyre age. Positive means the tyre is dropping off. */
  slope: number | null;
  /** Fitted lap time on a brand new tyre (age 0). */
  intercept: number | null;
  /** Laps used by the fit. */
  cleanLaps: number;
  /** Laps in the stint, before filtering. */
  totalLaps: number;
  /** Spread of the clean laps around the fitted line, in seconds. */
  residualStdDev: number | null;
  rSquared: number | null;
  confidence: DegradationConfidence;
  /** The fitted line sampled across the observed tyre ages, for charting. */
  curve: DegradationPoint[];
  /** Lap numbers dropped as outliers by the second pass. */
  outlierLaps: number[];
  /** Fuel correction that was applied, in s/lap. */
  fuelEffectPerLap: number;
}

export interface DegradationOptions {
  /**
   * Seconds per lap the car gains as fuel burns off. When > 0 the measured slope
   * is corrected upward, since fuel burn hides degradation. Default 0.
   */
  fuelEffectPerLap?: number;
  /** Minimum clean laps before a fit is attempted. Default 3. */
  minimumLaps?: number;
  /** Drop laps beyond this many residual standard deviations and refit. Default 3. */
  outlierSigma?: number;
}

const EMPTY: Omit<DegradationResult, 'totalLaps' | 'fuelEffectPerLap'> = {
  slope: null,
  intercept: null,
  cleanLaps: 0,
  residualStdDev: null,
  rSquared: null,
  confidence: 'none',
  curve: [],
  outlierLaps: [],
};

/**
 * Confidence blends sample size with scatter.
 *
 * A tight fit over many laps is trustworthy; a tight fit over four laps is not,
 * because a line through four points is nearly always tight. Sample size gates
 * the ceiling, and scatter can only lower it from there.
 */
function gradeConfidence(cleanLaps: number, residualStdDev: number): DegradationConfidence {
  if (cleanLaps < 3) return 'none';
  /*
   * Scatter this large means the "clean" laps were not comparable at all — a
   * red-flag restart, a spin, wildly different fuel loads. Seen on real data:
   * a three-lap stint fitted a slope of 11.7 s/lap with 9.8s of residual. No
   * slope should be reported from a fit like that.
   */
  if (residualStdDev > 1.5) return 'none';

  const ceiling: DegradationConfidence =
    cleanLaps >= 10 ? 'high' : cleanLaps >= 6 ? 'medium' : 'low';

  // Race lap times on a stable tyre scatter by well under 0.3s; beyond that the
  // stint was not actually clean.
  if (residualStdDev > 0.6) return 'low';
  if (residualStdDev > 0.3) return ceiling === 'high' ? 'medium' : 'low';
  return ceiling;
}

function buildCurve(fit: LinearFit, points: Point[]): DegradationPoint[] {
  const ages = points.map((p) => p.x);
  const min = Math.min(...ages);
  const max = Math.max(...ages);
  const curve: DegradationPoint[] = [];
  for (let age = min; age <= max; age += 1) {
    curve.push({ tyreAge: age, predicted: predict(fit, age) });
  }
  // Guarantee the curve spans the full observed range even when it is not integral.
  if (curve.length === 0 || curve[curve.length - 1]!.tyreAge !== max) {
    curve.push({ tyreAge: max, predicted: predict(fit, max) });
  }
  return curve;
}

export function tyreDegradation(
  samples: StintLapSample[],
  options: DegradationOptions = {},
): DegradationResult {
  const fuelEffectPerLap = options.fuelEffectPerLap ?? 0;
  const minimumLaps = options.minimumLaps ?? 3;
  const outlierSigma = options.outlierSigma ?? 3;
  const totalLaps = samples.length;

  const clean = samples.filter(
    (s): s is StintLapSample & { lapTime: number } => s.excluded === null && s.lapTime != null,
  );

  if (clean.length < minimumLaps) {
    return { ...EMPTY, cleanLaps: clean.length, totalLaps, fuelEffectPerLap };
  }

  const toPoint = (s: StintLapSample & { lapTime: number }): Point => ({
    x: s.tyreAge,
    // Fuel burn makes later laps quicker; adding it back isolates tyre effect.
    y: s.lapTime + fuelEffectPerLap * s.tyreAge,
  });

  let points = clean.map(toPoint);
  let fit = linearFit(points);
  if (!fit) return { ...EMPTY, cleanLaps: clean.length, totalLaps, fuelEffectPerLap };

  /*
   * One robustness pass. A single lock-up or off costs seconds and would drag the
   * slope badly; removing points more than `outlierSigma` from the first line and
   * refitting handles the common case without a full robust regression.
   */
  const outlierLaps: number[] = [];
  if (fit.residualStdDev > 0 && clean.length > minimumLaps + 1) {
    const limit = outlierSigma * fit.residualStdDev;
    const kept: Point[] = [];
    clean.forEach((sample, i) => {
      const point = points[i]!;
      if (Math.abs(residual(fit!, point)) > limit) outlierLaps.push(sample.lapNumber);
      else kept.push(point);
    });

    if (kept.length >= minimumLaps && kept.length < points.length) {
      const refit = linearFit(kept);
      if (refit) {
        fit = refit;
        points = kept;
      } else {
        outlierLaps.length = 0;
      }
    } else {
      outlierLaps.length = 0;
    }
  }

  return {
    slope: fit.slope,
    intercept: fit.intercept,
    cleanLaps: points.length,
    totalLaps,
    residualStdDev: fit.residualStdDev,
    rSquared: fit.rSquared,
    confidence: gradeConfidence(points.length, fit.residualStdDev),
    curve: buildCurve(fit, points),
    outlierLaps,
    fuelEffectPerLap,
  };
}

/**
 * The slope only when it is worth acting on.
 *
 * A fit graded 'none' still carries a number, which is useful for display and
 * debugging but must never feed a strategy call. Callers that make decisions
 * should take the slope from here rather than from `result.slope`.
 */
export function usableSlope(result: DegradationResult): number | null {
  return result.confidence === 'none' ? null : result.slope;
}

/** Predicted lap time at a given tyre age, or null when there is no usable fit. */
export function predictedLapTime(result: DegradationResult, tyreAge: number): number | null {
  if (result.slope == null || result.intercept == null) return null;
  return result.intercept + result.slope * tyreAge;
}
