/**
 * Theoretical best lap: the sum of a driver's best sectors.
 *
 * It answers "what was the car capable of today", as opposed to what was
 * actually strung together on one lap. The gap between the two is the time a
 * driver left on the table across the session.
 *
 * Sectors are taken from every lap that recorded them, including laps with no
 * final time — an aborted lap still contains real sector times, and official F1
 * timing counts them the same way.
 */
import type { Lap } from '@/lib/openf1/types';

export interface BestSector {
  seconds: number;
  lapNumber: number;
}

export interface TheoreticalBest {
  /** Sum of the three best sectors, or null if any sector is missing. */
  theoretical: number | null;
  sector1: BestSector | null;
  sector2: BestSector | null;
  sector3: BestSector | null;
  /** Best lap actually completed. */
  actualBest: BestSector | null;
  /**
   * Time between the actual best lap and the theoretical one, in seconds.
   * Always >= 0 in practice; null when either figure is missing.
   */
  timeLeftOnTable: number | null;
  /** True when the best lap already equals the sum of the best sectors. */
  isPerfectLap: boolean;
}

const EMPTY: TheoreticalBest = {
  theoretical: null,
  sector1: null,
  sector2: null,
  sector3: null,
  actualBest: null,
  timeLeftOnTable: null,
  isPerfectLap: false,
};

/** Smallest positive value of a field across the laps, with the lap it came from. */
function bestOf(laps: Lap[], pick: (lap: Lap) => number | null): BestSector | null {
  let best: BestSector | null = null;
  for (const lap of laps) {
    const value = pick(lap);
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    if (!best || value < best.seconds) best = { seconds: value, lapNumber: lap.lap_number };
  }
  return best;
}

/** Float tolerance: sector times are reported to a thousandth. */
const EPSILON = 1e-4;

export function theoreticalBestLap(laps: Lap[]): TheoreticalBest {
  if (laps.length === 0) return EMPTY;

  const sector1 = bestOf(laps, (lap) => lap.duration_sector_1);
  const sector2 = bestOf(laps, (lap) => lap.duration_sector_2);
  const sector3 = bestOf(laps, (lap) => lap.duration_sector_3);
  const actualBest = bestOf(laps, (lap) => lap.lap_duration);

  const theoretical =
    sector1 && sector2 && sector3
      ? Number((sector1.seconds + sector2.seconds + sector3.seconds).toFixed(3))
      : null;

  const timeLeftOnTable =
    theoretical != null && actualBest != null
      ? Number((actualBest.seconds - theoretical).toFixed(3))
      : null;

  return {
    theoretical,
    sector1,
    sector2,
    sector3,
    actualBest,
    timeLeftOnTable,
    isPerfectLap: timeLeftOnTable != null && timeLeftOnTable <= EPSILON,
  };
}

/** Theoretical best for every driver, quickest first. */
export function theoreticalBestByDriver(
  laps: Lap[],
  driverNumbers: number[],
): { driverNumber: number; best: TheoreticalBest }[] {
  return driverNumbers
    .map((driverNumber) => ({
      driverNumber,
      best: theoreticalBestLap(laps.filter((lap) => lap.driver_number === driverNumber)),
    }))
    .sort((a, b) => {
      const left = a.best.theoretical;
      const right = b.best.theoretical;
      if (left == null && right == null) return a.driverNumber - b.driverNumber;
      if (left == null) return 1;
      if (right == null) return -1;
      return left - right;
    });
}
