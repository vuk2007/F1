/**
 * Measures the pit loss table from real races, one table per era.
 *
 *   pnpm pit-loss-table
 *
 * Writes src/lib/models/pit-loss-table.ts. For every finished dry race in the
 * calibration cache (run `pnpm calibrate` and `pnpm calibrate --season 2026` first),
 * a stop's loss is its in-lap plus out-lap less two of that driver's normal laps
 * around it — the same measurement the app makes live, in `livePitLoss` — using
 * green-flag stops only. A circuit's figure is the median over its races.
 *
 * 2026 gets its own table because the cars changed; the app never uses a
 * 2024-2025 figure for a 2026 session. It also fixes a real fault: the hand-written
 * table was keyed "Spa", "Monaco", "Yas Marina", while OpenF1 calls those circuits
 * "Spa-Francorchamps", "Monte Carlo" and "Yas Marina Circuit", so six circuits
 * silently fell back to the 22 s default. The table here is keyed by OpenF1's own
 * `circuit_short_name`.
 *
 * Offline: reads only the cache. A module rather than JSON, so the Node scripts
 * that import the models can load it without import attributes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionWindow, type SessionDataset } from '@/lib/openf1/dataset';
import type { Session } from '@/lib/openf1/types';
import { measuredStopLosses } from '@/lib/models/predict/pit-forecast';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'node_modules/.cache/pit-wall-calibration');
const OUT = path.join(ROOT, 'src/lib/models/pit-loss-table.ts');

function cached<T>(query: string): T[] | null {
  const file = path.join(CACHE, `${query.replace(/[^a-z0-9]+/gi, '_')}.json`);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as T[]) : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * A race counts only with this many measured green-flag stops. Fewer is noise: Monza
 * 2026 had a red flag, left two measurable stops, and put the circuit at 31.9 s.
 */
const MIN_STOPS_PER_RACE = 5;

const ERAS: { label: string; years: number[] }[] = [
  { label: '2024-2025', years: [2024, 2025] },
  { label: '2026', years: [2026] },
];

const tables: Record<
  string,
  Record<string, { seconds: number; races: number; stops: number }>
> = {};

for (const era of ERAS) {
  const perCircuit = new Map<string, { raceMedians: number[]; stops: number }>();
  for (const year of era.years) {
    const sessions = cached<Session>(`sessions?year=${year}&session_name=Race`) ?? [];
    for (const session of sessions) {
      if (session.is_cancelled || Date.parse(session.date_end) > Date.now()) continue;
      const key = session.session_key;
      const laps = cached<SessionDataset['laps'][number]>(`laps?session_key=${key}`);
      const pits = cached<SessionDataset['pits'][number]>(`pit?session_key=${key}`);
      const raceControl = cached<SessionDataset['raceControl'][number]>(
        `race_control?session_key=${key}`,
      );
      const weather = cached<SessionDataset['weather'][number]>(`weather?session_key=${key}`);
      if (!laps || !pits || !raceControl || !weather) continue;
      if (weather.filter((w) => (w.rainfall ?? 0) > 0).length > 2) continue;

      const dataset: SessionDataset = {
        session,
        drivers: [],
        laps,
        stints: cached(`stints?session_key=${key}`) ?? [],
        pits,
        positions: [],
        intervals: cached(`intervals?session_key=${key}`) ?? [],
        weather,
        raceControl,
        ...sessionWindow(session, laps),
      };
      const losses = measuredStopLosses(dataset);
      if (losses.length < MIN_STOPS_PER_RACE) continue;
      const entry = perCircuit.get(session.circuit_short_name) ?? { raceMedians: [], stops: 0 };
      entry.raceMedians.push(median(losses));
      entry.stops += losses.length;
      perCircuit.set(session.circuit_short_name, entry);
      console.log(
        `  ${year} ${session.circuit_short_name}: ${losses.length} stops, median ${median(losses).toFixed(1)} s`,
      );
    }
  }
  tables[era.label] = Object.fromEntries(
    [...perCircuit.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([circuit, { raceMedians, stops }]) => [
        circuit,
        { seconds: Number(median(raceMedians).toFixed(1)), races: raceMedians.length, stops },
      ]),
  );
  console.log(`${era.label}: ${perCircuit.size} circuits`);
}

const source = `/**
 * Pit loss per circuit, measured from real races by \`pnpm pit-loss-table\`.
 * Generated ${new Date().toISOString().slice(0, 10)} — do not edit by hand; re-run the script.
 *
 * Keyed by OpenF1's \`circuit_short_name\`. Each figure is the median, over that
 * circuit's dry races in the era, of the median green-flag stop loss in each race
 * (in-lap + out-lap - 2 x the driver's normal lap). See scripts/pit-loss-table.ts.
 */

export interface MeasuredPitLoss {
  seconds: number;
  races: number;
  stops: number;
}

export const MEASURED_PIT_LOSS: Record<'2024-2025' | '2026', Record<string, MeasuredPitLoss>> = ${JSON.stringify(tables, null, 2)};
`;

fs.writeFileSync(OUT, source);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
