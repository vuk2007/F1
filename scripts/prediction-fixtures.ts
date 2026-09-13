/**
 * Downloads the finished sessions the prediction cards are tested against.
 *
 *   node scripts/prediction-fixtures.ts
 *
 * Each prediction has a test that asks whether it would have got a real session
 * right — did the predicted pit window contain the stop that actually happened —
 * and that needs the session on disk, so the unit suite stays offline.
 *
 * The chosen sessions cover the cases the cards exist for, and are kept out of the
 * overtake calibration so that what the tests measure is never data the model was
 * fitted to:
 *
 *   9912   Italian GP 2025 race     one stop, low wear, no safety car
 *   10014  Bahrain GP 2025 race     two stops, high wear, safety car on lap 32
 *   9920   Dutch GP 2025 race       three safety cars and a VSC
 *   10008  Bahrain 2025 practice 2  long runs, for the race degradation forecast
 *   10009  Bahrain 2025 practice 3  for the Q3 cut-off forecast
 *   10010  Bahrain 2025 qualifying  what the Q3 cut-off actually was
 *   11361  Italian GP 2026 race     first season without DRS, for the 2026 models
 *   11280  Miami GP 2026 race       a second 2026 race, so no 2026 rate rests on one race
 *   11355  Monza 2026 practice 2    long runs on the 2026 tyres
 *   11356  Monza 2026 practice 3    for the 2026 Q3 cut-off forecast
 *   11357  Monza 2026 qualifying    what that cut-off actually was
 *
 *   node scripts/prediction-fixtures.ts --only=2026   downloads just the names containing "2026"
 *
 * The files are trimmed to what the models read. The interval feed is the big one
 * — 36,876 rows and 5.2 MB for one race — and is reduced to the sample each
 * driver had at the start of each lap, which is the only moment the models use.
 * Lap mini-sector arrays are dropped. Nothing else is altered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://api.openf1.org/v1';
const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src/lib/models/predict/__fixtures__',
);

const SESSIONS: { key: number; name: string; race: boolean }[] = [
  { key: 9912, name: 'monza-2025-race', race: true },
  { key: 10014, name: 'bahrain-2025-race', race: true },
  { key: 9920, name: 'zandvoort-2025-race', race: true },
  { key: 10008, name: 'bahrain-2025-fp2', race: false },
  { key: 10009, name: 'bahrain-2025-fp3', race: false },
  { key: 10010, name: 'bahrain-2025-qualifying', race: false },
  { key: 11361, name: 'monza-2026-race', race: true },
  { key: 11280, name: 'miami-2026-race', race: true },
  { key: 11355, name: 'monza-2026-fp2', race: false },
  { key: 11356, name: 'monza-2026-fp3', race: false },
  { key: 11357, name: 'monza-2026-qualifying', race: false },
];

const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);

/** Comfortably inside OpenF1's 3 requests/s and 30 requests/minute. */
const GAP_MS = 2100;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Row = Record<string, unknown>;

async function get(endpoint: string, sessionKey: number): Promise<Row[]> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await sleep(GAP_MS);
    const response = await fetch(`${BASE}/${endpoint}?session_key=${sessionKey}`);
    if (response.status === 429) {
      await sleep(10_000);
      continue;
    }
    const body = await response.text();
    if (response.status === 404 && body.includes('No results found')) return [];
    if (!response.ok)
      throw new Error(`${endpoint} ${sessionKey}: HTTP ${response.status} ${body.slice(0, 200)}`);
    return JSON.parse(body) as Row[];
  }
  throw new Error(`${endpoint} ${sessionKey}: rate limited five times`);
}

/** The latest interval sample at or before each lap start, per driver. */
function intervalsAtLapStarts(intervals: Row[], laps: Row[]): Row[] {
  const byDriver = new Map<number, { t: number; row: Row }[]>();
  for (const row of intervals) {
    const t = Date.parse(String(row.date));
    if (Number.isNaN(t)) continue;
    const list = byDriver.get(Number(row.driver_number)) ?? [];
    list.push({ t, row });
    byDriver.set(Number(row.driver_number), list);
  }
  for (const list of byDriver.values()) list.sort((a, b) => a.t - b.t);

  const kept = new Map<string, Row>();
  for (const lap of laps) {
    if (!lap.date_start) continue;
    const start = Date.parse(String(lap.date_start));
    const list = byDriver.get(Number(lap.driver_number)) ?? [];
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid]!.t <= start) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found === -1) continue;
    const row = list[found]!.row;
    kept.set(`${String(row.driver_number)}|${String(row.date)}`, row);
  }
  return [...kept.values()].sort((a, b) => Date.parse(String(a.date)) - Date.parse(String(b.date)));
}

fs.mkdirSync(OUT, { recursive: true });

for (const { key, name, race } of SESSIONS.filter((s) => !only || s.name.includes(only))) {
  console.log(`\n${name} (${key})`);
  const [session] = await get('sessions', key);
  const drivers = await get('drivers', key);
  const laps = (await get('laps', key)).map((lap) => ({
    ...lap,
    segments_sector_1: null,
    segments_sector_2: null,
    segments_sector_3: null,
  }));
  const stints = await get('stints', key);
  const pits = await get('pit', key);
  const weather = await get('weather', key);
  const raceControl = await get('race_control', key);
  const positions = race ? await get('position', key) : [];
  const rawIntervals = race ? await get('intervals', key) : [];
  const intervals = intervalsAtLapStarts(rawIntervals, laps);

  const file = path.join(OUT, `${name}.json`);
  const payload = {
    meta: {
      sessionKey: key,
      source: 'api.openf1.org',
      intervals: `trimmed from ${rawIntervals.length} rows to the sample at each lap start`,
    },
    session,
    drivers,
    laps,
    stints,
    pits,
    positions,
    intervals,
    weather,
    raceControl,
  };
  fs.writeFileSync(file, JSON.stringify(payload));
  console.log(
    `  laps ${laps.length}, stints ${stints.length}, pits ${pits.length}, positions ${positions.length}, ` +
      `intervals ${intervals.length}/${rawIntervals.length}, messages ${raceControl.length} -> ` +
      `${(fs.statSync(file).size / 1024).toFixed(0)} KB`,
  );
}
