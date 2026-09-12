/**
 * Downloads every endpoint needed to replay one session, reporting progress.
 *
 * Requests are issued sequentially through the shared rate-limited queue. Eight
 * endpoints at 3 req/s is a couple of seconds cold, and instant once cached.
 */
import {
  getDrivers,
  getIntervals,
  getLaps,
  getPits,
  getPositions,
  getRaceControl,
  getSession,
  getStints,
  getWeather,
  type RequestOptions,
} from './client';
import { SESSION_PARTS, type SessionDataset, type SessionPart } from './dataset';

export interface LoadProgress {
  /** Endpoint currently being fetched, or 'done'. */
  part: SessionPart | 'session' | 'done';
  completed: number;
  total: number;
  /** Rows retrieved for the part that just finished. */
  rows?: number;
}

export type ProgressHandler = (progress: LoadProgress) => void;

export async function loadSession(
  sessionKey: number,
  onProgress: ProgressHandler = () => {},
  options: RequestOptions = {},
): Promise<SessionDataset> {
  const total = SESSION_PARTS.length + 1;
  let completed = 0;

  const step = <T>(part: SessionPart | 'session', rows: T[]): T[] => {
    completed += 1;
    onProgress({ part, completed, total, rows: rows.length });
    return rows;
  };

  onProgress({ part: 'session', completed: 0, total });
  const sessions = step('session', await getSession(sessionKey, options));
  const session = sessions[0];
  if (!session) throw new Error(`No session found for session_key=${sessionKey}`);

  onProgress({ part: 'drivers', completed, total });
  const drivers = step('drivers', await getDrivers(sessionKey, options));

  onProgress({ part: 'laps', completed, total });
  const laps = step('laps', await getLaps(sessionKey, options));

  onProgress({ part: 'stints', completed, total });
  const stints = step('stints', await getStints(sessionKey, options));

  onProgress({ part: 'pit', completed, total });
  const pits = step('pit', await getPits(sessionKey, options));

  onProgress({ part: 'position', completed, total });
  const positions = step('position', await getPositions(sessionKey, options));

  onProgress({ part: 'intervals', completed, total });
  const intervals = step('intervals', await getIntervals(sessionKey, options));

  onProgress({ part: 'weather', completed, total });
  const weather = step('weather', await getWeather(sessionKey, options));

  onProgress({ part: 'race_control', completed, total });
  const raceControl = step('race_control', await getRaceControl(sessionKey, options));

  onProgress({ part: 'done', completed: total, total });

  return {
    session,
    drivers: [...drivers].sort((a, b) => a.driver_number - b.driver_number),
    laps,
    stints,
    pits,
    positions,
    intervals,
    weather,
    raceControl,
    startMs: Date.parse(session.date_start),
    endMs: Date.parse(session.date_end),
  };
}
