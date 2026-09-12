/**
 * Turns a stint into lap samples annotated with why each lap is or is not usable
 * for pace analysis.
 *
 * Keeping the "which laps are clean" decision here — separate from the maths in
 * tyre-degradation.ts — means the filter can be tested and displayed on its own.
 * The UI can show the user exactly which laps were discarded and why, which is
 * the difference between a trustworthy model and a black box.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Interval, Lap, Stint } from '@/lib/openf1/types';
import { tyreAgeOnLap } from '@/lib/replay/selectors';
import { cautionPeriods, overlapsCaution, type CautionPeriod } from './caution';

export type ExclusionReason = 'no-time' | 'pit-in' | 'pit-out' | 'caution' | 'traffic' | 'outlier';

export interface StintLapSample {
  lapNumber: number;
  /** Laps completed on this set of tyres after finishing this lap. */
  tyreAge: number;
  /** Lap time in seconds; null when the API has no time for the lap. */
  lapTime: number | null;
  /** Null when the lap is usable for a pace fit. */
  excluded: ExclusionReason | null;
  startMs: number | null;
}

/** Traffic threshold: inside this gap a driver is in dirty air and losing time. */
export const TRAFFIC_THRESHOLD_SECONDS = 1.0;

/**
 * Median interval to the car ahead during a lap.
 *
 * The median, rather than the minimum, is deliberate: a driver who closes up
 * only at the very end of a lap still had clean air for most of it, and a single
 * sample under a second should not discard an otherwise good lap.
 */
function medianIntervalDuringLap(
  intervals: Interval[],
  startMs: number,
  endMs: number,
): number | null {
  const samples: number[] = [];
  for (const row of intervals) {
    const t = Date.parse(row.date);
    if (Number.isNaN(t) || t < startMs || t > endMs) continue;
    // A string interval means the car ahead is a lap up: not dirty air.
    if (typeof row.interval !== 'number') continue;
    /*
     * An interval of exactly 0 means there is no car ahead — the driver is
     * leading. Verified on the 2025 Italian GP: every one of the 45 interval
     * rows recorded while P1 was exactly 0, while P2 averaged 0.73s and P3
     * 10.24s. Treating 0 as "nose-to-tail" would discard every lap spent in the
     * lead as traffic, which is precisely backwards.
     */
    if (row.interval === 0) continue;
    samples.push(row.interval);
  }
  if (samples.length === 0) return null;
  samples.sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return samples.length % 2 === 0 ? (samples[mid - 1]! + samples[mid]!) / 2 : samples[mid]!;
}

export interface CollectOptions {
  /** Precomputed caution periods, to avoid refolding the feed per stint. */
  periods?: CautionPeriod[];
  /** Set false to keep traffic laps (useful when a stint has too few clean laps). */
  excludeTraffic?: boolean;
}

/**
 * Builds annotated samples for one driver's stint.
 *
 * Exclusions, in the order applied:
 *  - no-time : the API has no lap_duration
 *  - pit-out : `is_pit_out_lap`, the lap containing the stop itself (~20s slow)
 *  - pit-in  : a lap the driver entered the pits on, per the pit feed (~4s slow)
 *  - caution : the lap overlapped a safety car, VSC or red flag period
 *  - traffic : median gap to the car ahead was under 1.0s
 */
export function collectStintLaps(
  dataset: SessionDataset,
  driverNumber: number,
  stint: Stint,
  options: CollectOptions = {},
): StintLapSample[] {
  const periods = options.periods ?? cautionPeriods(dataset.raceControl);
  const excludeTraffic = options.excludeTraffic ?? true;

  const pitInLaps = new Set(
    dataset.pits.filter((p) => p.driver_number === driverNumber).map((p) => p.lap_number),
  );
  const intervals = dataset.intervals.filter((i) => i.driver_number === driverNumber);

  const laps: Lap[] = dataset.laps
    .filter(
      (lap) =>
        lap.driver_number === driverNumber &&
        lap.lap_number >= stint.lap_start &&
        lap.lap_number <= stint.lap_end,
    )
    .sort((a, b) => a.lap_number - b.lap_number);

  return laps.map((lap) => {
    const startMs = lap.date_start ? Date.parse(lap.date_start) : null;
    const tyreAge = tyreAgeOnLap(stint, lap.lap_number);

    let excluded: ExclusionReason | null = null;
    if (lap.lap_duration == null) {
      excluded = 'no-time';
    } else if (lap.is_pit_out_lap) {
      excluded = 'pit-out';
    } else if (pitInLaps.has(lap.lap_number)) {
      excluded = 'pit-in';
    } else if (
      startMs != null &&
      overlapsCaution(periods, startMs, startMs + lap.lap_duration * 1000)
    ) {
      excluded = 'caution';
    } else if (excludeTraffic && startMs != null) {
      const gap = medianIntervalDuringLap(intervals, startMs, startMs + lap.lap_duration * 1000);
      if (gap != null && gap < TRAFFIC_THRESHOLD_SECONDS) excluded = 'traffic';
    }

    return {
      lapNumber: lap.lap_number,
      tyreAge,
      lapTime: lap.lap_duration,
      excluded,
      startMs,
    };
  });
}
