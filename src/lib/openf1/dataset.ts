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
