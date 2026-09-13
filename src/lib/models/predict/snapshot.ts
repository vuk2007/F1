/**
 * The session as it was known at one moment.
 *
 * Every prediction is built from a snapshot, never from the full dataset, because
 * a finished session's data knows the future. OpenF1's stint table gives each stint
 * its final `lap_end` from the start, so a model reading it on lap 20 would already
 * know the driver stops on lap 31 — and an evaluation of "did we predict the stop"
 * would be scoring a model that had been told the answer.
 *
 * So a snapshot keeps only what had happened by `timeMs`: laps completed, stints
 * started (with their end cut to the lap the driver is on), stops made, and every
 * time series up to that moment.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';

function before(date: string | null | undefined, timeMs: number): boolean {
  if (!date) return false;
  const ms = Date.parse(date);
  return !Number.isNaN(ms) && ms <= timeMs;
}

export function snapshotAt(dataset: SessionDataset, timeMs: number): SessionDataset {
  const laps = dataset.laps.filter((lap) => {
    if (!lap.date_start || lap.lap_duration == null) return false;
    const startMs = Date.parse(lap.date_start);
    return !Number.isNaN(startMs) && startMs + lap.lap_duration * 1000 <= timeMs;
  });

  /* The lap each driver is on: the highest one started, completed or not. */
  const onLap = new Map<number, number>();
  for (const lap of dataset.laps) {
    if (!before(lap.date_start, timeMs)) continue;
    onLap.set(lap.driver_number, Math.max(onLap.get(lap.driver_number) ?? 0, lap.lap_number));
  }

  const stints = dataset.stints.flatMap((stint) => {
    const current = onLap.get(stint.driver_number);
    if (current == null || stint.lap_start > current) return [];
    return [{ ...stint, lap_end: Math.min(stint.lap_end, current) }];
  });

  return {
    ...dataset,
    laps,
    stints,
    pits: dataset.pits.filter((pit) => before(pit.date, timeMs)),
    positions: dataset.positions.filter((row) => before(row.date, timeMs)),
    intervals: dataset.intervals.filter((row) => before(row.date, timeMs)),
    weather: dataset.weather.filter((row) => before(row.date, timeMs)),
    raceControl: dataset.raceControl.filter((row) => before(row.date, timeMs)),
    endMs: Math.min(dataset.endMs, timeMs),
  };
}

/** The lap a driver is on in a snapshot: the highest stint lap reached. */
export function currentLapOf(snapshot: SessionDataset, driverNumber: number): number | null {
  let lap: number | null = null;
  for (const stint of snapshot.stints) {
    if (stint.driver_number !== driverNumber) continue;
    lap = Math.max(lap ?? 0, stint.lap_end);
  }
  return lap;
}
