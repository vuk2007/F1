/**
 * The full, immutable dataset for one session.
 *
 * Everything downstream — replay selectors, strategy models, the UI — reads this
 * shape and nothing else. A future live source only has to produce/append to a
 * SessionDataset for the rest of the app to work unchanged.
 */
import type {
  Driver,
  Interval,
  Lap,
  Pit,
  Position,
  RaceControl,
  Session,
  Stint,
  Weather,
} from './types';

export interface SessionDataset {
  session: Session;
  drivers: Driver[];
  laps: Lap[];
  stints: Stint[];
  pits: Pit[];
  positions: Position[];
  intervals: Interval[];
  weather: Weather[];
  raceControl: RaceControl[];
  /** Session start/end as epoch ms, derived once so selectors stay cheap. */
  startMs: number;
  endMs: number;
}

/** Endpoints fetched for a full session download, in fetch order. */
export const SESSION_PARTS = [
  'drivers',
  'laps',
  'stints',
  'pit',
  'position',
  'intervals',
  'weather',
  'race_control',
] as const;

export type SessionPart = (typeof SESSION_PARTS)[number];

/**
 * A lap finishing more than this long after the scheduled end is not believed.
 *
 * Generous on purpose: a red flag can push a race or a rain-delayed qualifying
 * hours past its slot. It only has to reject a corrupt duration, which would
 * otherwise stretch the replay over hours of nothing.
 */
const MAX_OVERRUN_MS = 3 * 60 * 60 * 1000;

/**
 * The replay window: the scheduled start, and the later of the scheduled end and
 * the last lap anyone actually finished.
 *
 * OpenF1's `date_end` is when the session's clock ran out, not when the cars
 * stopped. Any lap started before the flag still counts, and those are exactly the
 * laps that matter most: at Monza 2025 qualifying the session "ended" at 15:00:00,
 * and Verstappen's pole lap of 1:18.792 crossed the line at 15:02:12. The replay
 * clock cannot pass `endMs`, so for every session until this fix the timing table
 * finished qualifying on 1:18.923 and never showed pole.
 */
export function sessionWindow(
  session: Pick<Session, 'date_start' | 'date_end'>,
  laps: Pick<Lap, 'date_start' | 'lap_duration'>[],
): { startMs: number; endMs: number } {
  const startMs = Date.parse(session.date_start);
  const scheduledEndMs = Date.parse(session.date_end);
  let endMs = scheduledEndMs;

  for (const lap of laps) {
    if (!lap.date_start || lap.lap_duration == null) continue;
    // Rounded to the millisecond, since durations are floats like 112.992.
    const completedMs = Date.parse(lap.date_start) + Math.round(lap.lap_duration * 1000);
    if (Number.isNaN(completedMs) || completedMs <= endMs) continue;
    if (completedMs - scheduledEndMs > MAX_OVERRUN_MS) continue;
    endMs = completedMs;
  }

  return { startMs, endMs };
}
