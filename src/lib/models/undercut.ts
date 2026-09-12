/**
 * Undercut / overcut simulation: project two cars forward through their stops
 * and see who comes out ahead.
 *
 * The undercut works because a fresh tyre is worth more per lap than the pit
 * stop costs, *if* you can bank enough of that advantage before the other car
 * reacts. The overcut is the same arithmetic with the signs reversed: staying
 * out wins when the car that stopped is stuck behind traffic or its new tyres
 * need a lap to switch on.
 *
 * The simulation is deliberately lap-by-lap rather than closed-form. Degradation
 * compounds, the two cars can pit on different laps, and the compound they fit
 * may differ — a formula for that is harder to read and no more accurate.
 */

export interface UndercutCar {
  /** Display label, e.g. a driver's three-letter code. */
  label: string;
  /**
   * Seconds this car is behind the reference point when the simulation starts.
   * Use 0 for the car ahead and the measured gap for the car behind.
   */
  startDeficit: number;
  /** Lap time on a brand new tyre of the compound currently fitted. */
  baseLapTime: number;
  /** Degradation of the current set, seconds per lap of tyre age. */
  slope: number;
  /** Age of the current set at the start lap. */
  tyreAge: number;
  /**
   * Lap this car pits on (the in-lap). Set beyond `endLap` to model a car that
   * stays out — that is how the overcut case is expressed.
   */
  pitLap: number;
  /** Degradation of the new set. Defaults to `slope`. */
  freshSlope?: number;
  /** Seconds per lap the new compound is slower when both are new. Default 0. */
  compoundOffset?: number;
}

export interface UndercutInput {
  startLap: number;
  endLap: number;
  /** Time a stop costs, in seconds. */
  pitLoss: number;
  a: UndercutCar;
  b: UndercutCar;
}

export interface UndercutLap {
  lap: number;
  /** Cumulative elapsed time for each car since the start lap. */
  aElapsed: number;
  bElapsed: number;
  /**
   * Gap from A to B in seconds at the end of this lap. Positive means B is
   * behind A; negative means B has got ahead.
   */
  gap: number;
}

export interface UndercutResult {
  /** Label of the car ahead at `endLap`. */
  aheadAtEnd: string;
  /** How far ahead, in seconds. Always positive. */
  marginSeconds: number;
  /** True when the order at the end differs from the order at the start. */
  swapped: boolean;
  /** The lap the order changed on, if it did. */
  crossoverLap: number | null;
  timeline: UndercutLap[];
}

/** Lap time for a car on a given lap, accounting for which tyre it is on. */
function lapTime(car: UndercutCar, lap: number, startLap: number): number {
  if (lap <= car.pitLap) {
    const age = car.tyreAge + (lap - startLap);
    return car.baseLapTime + car.slope * age;
  }
  // On the new set: age 1 on the first lap after the stop.
  const age = lap - car.pitLap;
  const freshSlope = car.freshSlope ?? car.slope;
  return car.baseLapTime + (car.compoundOffset ?? 0) + freshSlope * age;
}

/**
 * Runs the projection. Both cars are advanced lap by lap from `startLap` to
 * `endLap`; the pit loss is charged on each car's own pit lap.
 */
export function undercutSimulation(input: UndercutInput): UndercutResult {
  const { startLap, endLap, pitLoss, a, b } = input;

  let aElapsed = 0;
  let bElapsed = 0;
  const timeline: UndercutLap[] = [];

  // Positive gap means B is behind A, matching how intervals are reported.
  const startGap = b.startDeficit - a.startDeficit;
  let crossoverLap: number | null = null;
  let previousSign = Math.sign(startGap);

  for (let lap = startLap; lap <= endLap; lap += 1) {
    aElapsed += lapTime(a, lap, startLap);
    bElapsed += lapTime(b, lap, startLap);
    if (lap === a.pitLap) aElapsed += pitLoss;
    if (lap === b.pitLap) bElapsed += pitLoss;

    const gap = startGap + (bElapsed - aElapsed);
    timeline.push({ lap, aElapsed, bElapsed, gap });

    const sign = Math.sign(gap);
    if (crossoverLap === null && sign !== 0 && previousSign !== 0 && sign !== previousSign) {
      crossoverLap = lap;
    }
    if (sign !== 0) previousSign = sign;
  }

  const finalGap = timeline.length > 0 ? timeline[timeline.length - 1]!.gap : startGap;

  return {
    aheadAtEnd: finalGap >= 0 ? a.label : b.label,
    marginSeconds: Math.abs(finalGap),
    swapped: Math.sign(finalGap) !== Math.sign(startGap) && startGap !== 0,
    crossoverLap,
    timeline,
  };
}
