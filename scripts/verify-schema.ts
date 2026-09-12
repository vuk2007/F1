/**
 * Verifies the declared OpenF1 types against real API responses.
 *
 * TypeScript types vanish at runtime, so the expected field list is mirrored here
 * and diffed against what the API actually returns. Run it whenever OpenF1 is
 * reachable — especially after adding an endpoint:
 *
 *   node scripts/verify-schema.ts            (2025 Italian GP race)
 *   node scripts/verify-schema.ts 9999       (any session_key)
 *
 * It reports, per endpoint:
 *   MISSING  — declared in types.ts but absent from every row
 *   EXTRA    — returned by the API but not declared
 *   NULLABLE — observed null, so the type must allow null
 */

const BASE = 'https://api.openf1.org/v1';

/** Mirrors src/lib/openf1/types.ts. Keep the two in step. */
const EXPECTED: Record<string, string[]> = {
  sessions: [
    'circuit_key',
    'circuit_short_name',
    'country_code',
    'country_key',
    'country_name',
    'date_end',
    'date_start',
    'gmt_offset',
    'is_cancelled',
    'location',
    'meeting_key',
    'session_key',
    'session_name',
    'session_type',
    'year',
  ],
  meetings: [
    'circuit_key',
    'circuit_image',
    'circuit_info_url',
    'circuit_short_name',
    'circuit_type',
    'country_code',
    'country_flag',
    'country_key',
    'country_name',
    'date_end',
    'date_start',
    'gmt_offset',
    'is_cancelled',
    'location',
    'meeting_key',
    'meeting_name',
    'meeting_official_name',
    'year',
  ],
  drivers: [
    'broadcast_name',
    'country_code',
    'driver_number',
    'first_name',
    'full_name',
    'headshot_url',
    'last_name',
    'meeting_key',
    'name_acronym',
    'session_key',
    'team_colour',
    'team_name',
  ],
  laps: [
    'date_start',
    'driver_number',
    'duration_sector_1',
    'duration_sector_2',
    'duration_sector_3',
    'i1_speed',
    'i2_speed',
    'is_pit_out_lap',
    'lap_duration',
    'lap_number',
    'meeting_key',
    'segments_sector_1',
    'segments_sector_2',
    'segments_sector_3',
    'session_key',
    'st_speed',
  ],
  stints: [
    'compound',
    'driver_number',
    'lap_end',
    'lap_start',
    'meeting_key',
    'session_key',
    'stint_number',
    'tyre_age_at_start',
  ],
  pit: [
    'date',
    'driver_number',
    'lane_duration',
    'lap_number',
    'meeting_key',
    'pit_duration',
    'session_key',
    'stop_duration',
  ],
  position: ['date', 'driver_number', 'meeting_key', 'position', 'session_key'],
  intervals: ['date', 'driver_number', 'gap_to_leader', 'interval', 'meeting_key', 'session_key'],
  weather: [
    'air_temperature',
    'date',
    'humidity',
    'meeting_key',
    'pressure',
    'rainfall',
    'session_key',
    'track_temperature',
    'wind_direction',
    'wind_speed',
  ],
  race_control: [
    'category',
    'date',
    'driver_number',
    'flag',
    'lap_number',
    'meeting_key',
    'message',
    'qualifying_phase',
    'scope',
    'sector',
    'session_key',
  ],
  car_data: [
    'brake',
    'date',
    'drs',
    'driver_number',
    'meeting_key',
    'n_gear',
    'rpm',
    'session_key',
    'speed',
    'throttle',
  ],
  location: ['date', 'driver_number', 'meeting_key', 'session_key', 'x', 'y', 'z'],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchRows(endpoint: string, query: string): Promise<unknown[]> {
  const url = `${BASE}/${endpoint}?${query}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${endpoint}: ${text.slice(0, 200)}`);
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error(`${endpoint} did not return an array`);
  return parsed;
}

function report(endpoint: string, rows: unknown[]): boolean {
  const expected = new Set(EXPECTED[endpoint] ?? []);
  const seen = new Set<string>();
  const nullable = new Set<string>();
  const types = new Map<string, Set<string>>();

  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    for (const [key, value] of Object.entries(row)) {
      seen.add(key);
      if (value === null) nullable.add(key);
      const kind = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
      if (!types.has(key)) types.set(key, new Set());
      types.get(key)!.add(kind);
    }
  }

  const missing = [...expected].filter((k) => !seen.has(k));
  const extra = [...seen].filter((k) => !expected.has(k));

  console.log(`\n${endpoint}  (${rows.length} rows)`);
  if (rows.length === 0) {
    console.log('  (no rows — nothing to verify)');
    return true;
  }
  if (missing.length) console.log(`  MISSING : ${missing.join(', ')}`);
  if (extra.length) console.log(`  EXTRA   : ${extra.join(', ')}`);
  if (nullable.size) console.log(`  NULLABLE: ${[...nullable].sort().join(', ')}`);

  // Fields whose runtime type varies (e.g. interval: number | string) need a union.
  for (const [key, kinds] of types) {
    const real = [...kinds].filter((k) => k !== 'null');
    if (real.length > 1) console.log(`  UNION   : ${key} -> ${real.join(' | ')}`);
  }
  if (!missing.length && !extra.length) console.log('  fields match');
  return missing.length === 0 && extra.length === 0;
}

async function main() {
  const sessionKey = process.argv[2] ?? '9912'; // 2025 Italian GP (Monza) race
  const scoped = `session_key=${sessionKey}`;
  let ok = true;

  const plan: [string, string][] = [
    ['sessions', scoped],
    ['meetings', 'year=2025'],
    ['drivers', scoped],
    ['laps', `${scoped}&driver_number=1`],
    ['stints', scoped],
    ['pit', scoped],
    ['position', `${scoped}&driver_number=1`],
    ['intervals', `${scoped}&driver_number=1`],
    ['weather', scoped],
    ['race_control', scoped],
  ];

  for (const [endpoint, query] of plan) {
    try {
      ok = report(endpoint, await fetchRows(endpoint, query)) && ok;
    } catch (error) {
      ok = false;
      console.log(`\n${endpoint}\n  ERROR: ${(error as Error).message}`);
    }
    await sleep(400); // stay under 3 req/s
  }

  // car_data and location need a narrow time window; derive one from the session.
  try {
    const [session] = (await fetchRows('sessions', scoped)) as { date_start: string }[];
    if (session) {
      const from = new Date(Date.parse(session.date_start) + 600_000).toISOString();
      const to = new Date(Date.parse(session.date_start) + 620_000).toISOString();
      for (const endpoint of ['car_data', 'location']) {
        await sleep(400);
        const query = `${scoped}&driver_number=1&date>=${from}&date<=${to}`;
        ok = report(endpoint, await fetchRows(endpoint, query)) && ok;
      }
    }
  } catch (error) {
    ok = false;
    console.log(`\ncar_data/location\n  ERROR: ${(error as Error).message}`);
  }

  console.log(
    ok ? '\nAll declared fields match the API.' : '\nDifferences found — update types.ts.',
  );
  process.exit(ok ? 0 : 1);
}

void main();
