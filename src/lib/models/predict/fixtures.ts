/**
 * Loads the downloaded finished sessions for the prediction outcome tests.
 *
 * Node-only: reads from disk. Never imported by the app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionWindow, type SessionDataset } from '@/lib/openf1/dataset';

export type FixtureName =
  | 'monza-2025-race'
  | 'bahrain-2025-race'
  | 'zandvoort-2025-race'
  | 'bahrain-2025-fp2'
  | 'bahrain-2025-fp3'
  | 'bahrain-2025-qualifying';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const cache = new Map<FixtureName, SessionDataset>();

export function loadFixture(name: FixtureName): SessionDataset {
  const cached = cache.get(name);
  if (cached) return cached;
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8')) as Omit<
    SessionDataset,
    'startMs' | 'endMs'
  >;
  const dataset: SessionDataset = {
    session: raw.session,
    drivers: [...raw.drivers].sort((a, b) => a.driver_number - b.driver_number),
    laps: raw.laps,
    stints: raw.stints,
    pits: raw.pits,
    positions: raw.positions,
    intervals: raw.intervals,
    weather: raw.weather,
    raceControl: raw.raceControl,
    ...sessionWindow(raw.session, raw.laps),
  };
  cache.set(name, dataset);
  return dataset;
}

export const RACE_FIXTURES: FixtureName[] = [
  'monza-2025-race',
  'bahrain-2025-race',
  'zandvoort-2025-race',
];
