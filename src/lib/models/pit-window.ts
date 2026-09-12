/**
 * Pit window: when does stopping start to pay for itself?
 *
 * The model in one sentence: worn tyres cost a little time every lap, a stop
 * costs a lot of time once, and the window is the span of laps where the first
 * number has grown big enough to repay the second before the race ends.
 *
 * Formally, with the old tyre at age A and a fresh set degrading at the same rate:
 *
 *   per-lap deficit  d = slope * A - compoundOffset
 *   break-even laps  n = pitLoss / d
 *
 * The A-dependence is the whole point — the deficit grows as the tyre ages, so
 * the stop repays faster the longer you have been out. `compoundOffset` carries
 * the case where the new tyre is a different, intrinsically slower compound.
 */

export type PitVerdict =
  'pit-now' | 'window-open' | 'window-approaching' | 'too-late' | 'stay-out' | 'unknown';

export interface PitWindowInput {
  /** Lap the driver is on now. */
  currentLap: number;
  /** Scheduled final lap of the race. */
  totalLaps: number;
  /** Laps on the current set of tyres. */
  tyreAge: number;
  /** Degradation of the current set, s/lap. Null when unknown. */
  slope: number | null;
  /** Total time a stop costs, in seconds. */
  pitLoss: number;
  /**
   * Seconds per lap the fresh compound is intrinsically SLOWER than the current
   * one when both are new (e.g. +0.6 fitting a hard after a soft). Negative when
   * the new tyre is faster. Default 0.
   */
  compoundOffset?: number;
  /** Degradation of the new set, s/lap. Defaults to the current slope. */
  newTyreSlope?: number | null;
}

export interface PitWindowResult {
  /** How much time the current tyres give away per lap versus a fresh set, now. */
  perLapDeficit: number | null;
  /** Laps of running needed after a stop to repay the pit loss. */
  breakEvenLaps: number | null;
  /**
   * The brief's headline number: laps until the accumulated loss from staying
   * out exceeds the cost of a stop. Zero when that point has already passed.
   */
  lapsUntilStopPaysOff: number | null;
  /** Laps where pitting still repays before the finish. Null when it never does. */
  window: { earliest: number; latest: number } | null;
  lapsRemaining: number;
  verdict: PitVerdict;
}

/** Below this the tyres are not costing enough per lap to justify acting. */
const MEANINGFUL_DEFICIT = 0.15;
/** At this deficit the stop should be made now rather than merely considered. */
const URGENT_DEFICIT = 0.4;

const UNKNOWN: PitWindowResult = {
  perLapDeficit: null,
  breakEvenLaps: null,
  lapsUntilStopPaysOff: null,
  window: null,
  lapsRemaining: 0,
  verdict: 'unknown',
};

export function pitWindow(input: PitWindowInput): PitWindowResult {
  const {
    currentLap,
    totalLaps,
    tyreAge,
    slope,
    pitLoss,
    compoundOffset = 0,
    newTyreSlope,
  } = input;

  const lapsRemaining = Math.max(0, totalLaps - currentLap);
  if (slope == null || !Number.isFinite(slope)) return { ...UNKNOWN, lapsRemaining };

  const freshSlope = newTyreSlope ?? slope;
  const perLapDeficit = slope * tyreAge - compoundOffset;

  /*
   * A non-positive deficit means the fresh set would be no quicker — the tyres
   * are young, or the only available compound is slower than what is fitted.
   * There is nothing to repay the stop with, so staying out is correct.
   */
  if (perLapDeficit <= 0) {
    return {
      perLapDeficit,
      breakEvenLaps: null,
      lapsUntilStopPaysOff: null,
      window: null,
      lapsRemaining,
      verdict: 'stay-out',
    };
  }

  /*
   * Cumulative gain over n laps after stopping, where the old tyre keeps ageing
   * and the new one starts from zero:
   *   G(n) = n*(slope*tyreAge - compoundOffset) + (slope - freshSlope) * n(n+1)/2
   * Solve G(n) >= pitLoss. With equal slopes the quadratic term vanishes and this
   * reduces to n = pitLoss / perLapDeficit.
   */
  const quadratic = (slope - freshSlope) / 2;
  let breakEvenLaps: number;
  if (Math.abs(quadratic) < 1e-9) {
    breakEvenLaps = pitLoss / perLapDeficit;
  } else {
    // quadratic*n^2 + (perLapDeficit + quadratic)*n - pitLoss = 0
    const b = perLapDeficit + quadratic;
    const discriminant = b * b + 4 * quadratic * pitLoss;
    const root = discriminant < 0 ? NaN : (-b + Math.sqrt(discriminant)) / (2 * quadratic);
    /*
     * No positive real root means the gain curve turns over before it ever repays
     * the stop — a replacement that degrades faster than the current set can be
     * worth less than the pit loss no matter how long you run it. That is a
     * definite "do not stop", not a failure to measure.
     */
    if (!Number.isFinite(root) || root <= 0) {
      return {
        perLapDeficit,
        breakEvenLaps: null,
        lapsUntilStopPaysOff: null,
        window: null,
        lapsRemaining,
        verdict: 'stay-out',
      };
    }
    breakEvenLaps = root;
  }

  const breakEven = Math.ceil(breakEvenLaps);

  /*
   * The stop has to be made early enough that `breakEven` laps of running remain.
   * `latest` is therefore the last lap on which a stop still shows a net gain.
   */
  const latest = totalLaps - breakEven;
  const window = latest >= currentLap ? { earliest: currentLap, latest } : null;

  /*
   * When no window exists, WHY it does not exist decides the verdict, and the two
   * reasons are opposites. A big deficit with too few laps left means the chance
   * has gone; a small deficit means the tyres are simply too young for a stop to
   * have paid for itself yet, and the window is still ahead.
   */
  let verdict: PitVerdict;
  if (window == null || lapsRemaining < breakEven) {
    verdict = perLapDeficit >= MEANINGFUL_DEFICIT ? 'too-late' : 'window-approaching';
  } else if (perLapDeficit >= URGENT_DEFICIT) {
    // Giving away four tenths a lap is a call to act, not to monitor.
    verdict = 'pit-now';
  } else if (perLapDeficit >= MEANINGFUL_DEFICIT) {
    verdict = 'window-open';
  } else {
    verdict = 'window-approaching';
  }

  return {
    perLapDeficit,
    breakEvenLaps,
    // Accumulated deficit repays the stop after this many more laps of staying out.
    lapsUntilStopPaysOff: Math.max(0, Math.ceil(pitLoss / perLapDeficit)),
    window,
    lapsRemaining,
    verdict,
  };
}
