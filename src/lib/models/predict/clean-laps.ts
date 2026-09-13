/**
 * Which laps a prediction may learn from.
 *
 * The rules are the brief's, and stricter than the ones behind the Engineer view's
 * degradation fits, which is why they live here rather than changing those:
 *
 *  - in-laps and out-laps (the stop itself distorts both)
 *  - laps under a safety car, virtual safety car or red flag
 *  - laps started less than 1.0 s behind another car (dirty air, not pace)
 *  - the first two laps of a stint (the tyres are still coming up to temperature)
 *  - lap 1 (a standing start)
 *
 * and a fit needs at least `MIN_CLEAN_LAPS` of what is left. Below that a card says
 * "Not enough data yet" rather than printing a number.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Interval, Stint } from '@/lib/openf1/types';
import { toTimed, valueAt, type Timed } from '@/lib/replay/timeline';
import { cautionPeriods, overlapsCaution, type CautionPeriod } from '../caution';

export const MIN_CLEAN_LAPS = 4;
/** Starting a lap closer than this to the car ahead counts as traffic. */
export const TRAFFIC_AT_LAP_START_S = 1.0;
/** Laps at the start of every stint that are never used. */
export const STINT_WARMUP_LAPS = 2;

export type PredictExclusion =
  'no-time' | 'pit-in' | 'pit-out' | 'standing-start' | 'stint-start' | 'caution' | 'traffic';

export interface PredictLap {
  driverNumber: number;
  lapNumber: number;
  stintNumber: number;
  compound: string | null;
  /** Laps on the set after completing this lap. */
  tyreAge: number;
  lapTime: number | null;
  startMs: number | null;
  excluded: PredictExclusion | null;
}

/**
 * Interval lookups shared across drivers, so a whole-field prediction sorts the
 * interval feed once rather than once per driver.
 */
export class IntervalLookup {
  #byDriver = new Map<number, Timed<Interval>[]>();

  constructor(intervals: Interval[]) {
    const grouped = new Map<number, Interval[]>();
    for (const row of intervals) {
      const list = grouped.get(row.driver_number) ?? [];
      list.push(row);
      grouped.set(row.driver_number, list);
    }
    for (const [driver, rows] of grouped)
      this.#byDriver.set(
        driver,
        toTimed(rows, (r) => r.date),
      );
  }

  /** Seconds to the car ahead at a moment; null when unknown, leading or a lap-based gap. */
  intervalAt(driverNumber: number, timeMs: number): number | null {
    const row = valueAt(this.#byDriver.get(driverNumber) ?? [], timeMs);
    const value = row?.interval;
    // 0 means there is no car ahead: the driver is leading.
    return typeof value === 'number' && value > 0 ? value : null;
  }

  /** Seconds to the leader at a moment; 0 for the leader, null when lapped or unknown. */
  gapToLeaderAt(driverNumber: number, timeMs: number): number | null {
    const row = valueAt(this.#byDriver.get(driverNumber) ?? [], timeMs);
    const value = row?.gap_to_leader;
    return typeof value === 'number' ? value : null;
  }
}

export interface PredictLapOptions {
  periods?: CautionPeriod[];
  intervals?: IntervalLookup;
}

function stintFor(stints: Stint[], lapNumber: number): Stint | undefined {
  return stints.find((stint) => lapNumber >= stint.lap_start && lapNumber <= stint.lap_end);
}

/** Every lap one driver has completed, each marked usable or not, in lap order. */
export function predictionLaps(
  dataset: SessionDataset,
  driverNumber: number,
  options: PredictLapOptions = {},
): PredictLap[] {
  const periods = options.periods ?? cautionPeriods(dataset.raceControl);
  const intervals = options.intervals ?? new IntervalLookup(dataset.intervals);

  const stints = dataset.stints
    .filter((stint) => stint.driver_number === driverNumber)
    .sort((a, b) => a.lap_start - b.lap_start);
  const pitInLaps = new Set(
    dataset.pits.filter((pit) => pit.driver_number === driverNumber).map((pit) => pit.lap_number),
  );

  return dataset.laps
    .filter((lap) => lap.driver_number === driverNumber)
    .sort((a, b) => a.lap_number - b.lap_number)
    .flatMap((lap) => {
      const stint = stintFor(stints, lap.lap_number);
      if (!stint) return [];

      const startMs = lap.date_start ? Date.parse(lap.date_start) : null;
      const tyreAge = (stint.tyre_age_at_start ?? 0) + (lap.lap_number - stint.lap_start) + 1;

      let excluded: PredictExclusion | null = null;
      if (lap.lap_duration == null) excluded = 'no-time';
      else if (lap.is_pit_out_lap) excluded = 'pit-out';
      else if (pitInLaps.has(lap.lap_number)) excluded = 'pit-in';
      else if (lap.lap_number === 1) excluded = 'standing-start';
      else if (lap.lap_number < stint.lap_start + STINT_WARMUP_LAPS) excluded = 'stint-start';
      else if (
        startMs != null &&
        !Number.isNaN(startMs) &&
        overlapsCaution(periods, startMs, startMs + lap.lap_duration * 1000)
      )
        excluded = 'caution';
      else if (startMs != null && !Number.isNaN(startMs)) {
        const gap = intervals.intervalAt(driverNumber, startMs);
        if (gap != null && gap < TRAFFIC_AT_LAP_START_S) excluded = 'traffic';
      }

      return [
        {
          driverNumber,
          lapNumber: lap.lap_number,
          stintNumber: stint.stint_number,
          compound: stint.compound,
          tyreAge,
          lapTime: lap.lap_duration,
          startMs: startMs != null && !Number.isNaN(startMs) ? startMs : null,
          excluded,
        },
      ];
    });
}

/** The usable laps, narrowed so `lapTime` is known. */
export function cleanOnly(laps: PredictLap[]): (PredictLap & { lapTime: number })[] {
  return laps.filter(
    (lap): lap is PredictLap & { lapTime: number } => lap.excluded === null && lap.lapTime != null,
  );
}
