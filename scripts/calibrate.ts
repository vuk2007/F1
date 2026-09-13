/**
 * Fits the numbers two prediction cards depend on, from real 2024 and 2025 data.
 *
 *   pnpm calibrate
 *
 * Writes src/lib/models/predict/calibration.json with:
 *
 *  - **overtake**: logistic weights for the overtake chance. Every dry race is
 *    downloaded and every fight in it becomes a sample — two cars adjacent on the
 *    road within three seconds at the start of a lap — labelled by whether the
 *    chaser was ahead within five laps. Samples where either car stopped or a
 *    caution ran inside the window are left out (see `overtakeSamples`). Wet races
 *    are skipped: rain changes what decides a pass, and the model has no rain
 *    feature to account for it.
 *  - **q3Cutoff**: the median amount the Q2 tenth-best lap beats the FP3 tenth-best,
 *    at every weekend that had both (sprint weekends have no FP3).
 *
 * The sessions the prediction tests are scored on are held out, so the hit rates
 * those tests report are on data this fit never saw.
 *
 * Responses are cached under node_modules/.cache, so a second run costs no
 * requests. The first is slow on purpose: OpenF1 allows 30 requests a minute.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionWindow, type SessionDataset } from '@/lib/openf1/dataset';
import type { Session } from '@/lib/openf1/types';
import { fitLogistic, logLoss } from '@/lib/models/predict/logistic';
import { FEATURE_NAMES, featureVector, overtakeSamples } from '@/lib/models/predict/overtake';
import { q3Cutoff, tenthBestLap } from '@/lib/models/predict/practice-forecast';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'node_modules/.cache/pit-wall-calibration');
const OUT = path.join(ROOT, 'src/lib/models/predict/calibration.json');
const BASE = 'https://api.openf1.org/v1';

/** Scored by the prediction tests; never used for fitting. */
const HELD_OUT_SESSIONS = new Set([9912, 10014, 9920]);
const HELD_OUT_MEETINGS = new Set<number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
fs.mkdirSync(CACHE, { recursive: true });
let requests = 0;

async function get<T>(query: string): Promise<T[]> {
  const file = path.join(CACHE, `${query.replace(/[^a-z0-9]+/gi, '_')}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as T[];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await sleep(2100);
    requests += 1;
    const response = await fetch(`${BASE}/${query}`);
    const body = await response.text();
    if (response.status === 429) {
      await sleep(15_000);
      continue;
    }
    if (response.status === 401 && body.includes('Live F1 session')) {
      throw new Error(
        'OpenF1 is locked during a live session. Run calibrate again once it has finished.',
      );
    }
    const data =
      response.status === 404 && body.includes('No results found') ? [] : (JSON.parse(body) as T[]);
    if (!response.ok && response.status !== 404)
      throw new Error(`${query}: HTTP ${response.status} ${body.slice(0, 200)}`);
    fs.writeFileSync(file, JSON.stringify(data));
    return data;
  }
  throw new Error(`${query}: rate limited repeatedly`);
}

async function loadSession(session: Session, withTiming: boolean): Promise<SessionDataset> {
  const key = session.session_key;
  const laps = await get<SessionDataset['laps'][number]>(`laps?session_key=${key}`);
  const stints = await get<SessionDataset['stints'][number]>(`stints?session_key=${key}`);
  const pits = await get<SessionDataset['pits'][number]>(`pit?session_key=${key}`);
  const raceControl = await get<SessionDataset['raceControl'][number]>(
    `race_control?session_key=${key}`,
  );
  const weather = await get<SessionDataset['weather'][number]>(`weather?session_key=${key}`);
  const positions = withTiming
    ? await get<SessionDataset['positions'][number]>(`position?session_key=${key}`)
    : [];
  const intervals = withTiming
    ? await get<SessionDataset['intervals'][number]>(`intervals?session_key=${key}`)
    : [];
  return {
    session,
    drivers: [],
    laps,
    stints,
    pits,
    positions,
    intervals,
    weather,
    raceControl,
    ...sessionWindow(session, laps),
  };
}

const wet = (dataset: SessionDataset) =>
  dataset.weather.filter((w) => (w.rainfall ?? 0) > 0).length > 2;

const now = Date.now();
const races: Session[] = [];
for (const year of [2024, 2025]) {
  for (const s of await get<Session>(`sessions?year=${year}&session_name=Race`)) {
    if (Date.parse(s.date_end) < now && !s.is_cancelled) races.push(s);
  }
}
for (const s of races)
  if (HELD_OUT_SESSIONS.has(s.session_key)) HELD_OUT_MEETINGS.add(s.meeting_key);

console.log(
  `${races.length} races in 2024-2025; holding out ${HELD_OUT_SESSIONS.size} for the tests`,
);

/* ---- Overtake chance ---- */
const rows: number[][] = [];
const labels: number[] = [];
const used: string[] = [];
const skipped: string[] = [];

for (const race of races) {
  const label = `${race.year} ${race.location}`;
  if (HELD_OUT_SESSIONS.has(race.session_key)) {
    skipped.push(`${label} (held out)`);
    continue;
  }
  const dataset = await loadSession(race, true);
  if (wet(dataset)) {
    skipped.push(`${label} (wet)`);
    console.log(`  skip ${label}: wet`);
    continue;
  }
  const samples = overtakeSamples(dataset);
  for (const sample of samples) {
    rows.push(featureVector(sample.features));
    labels.push(sample.label);
  }
  used.push(label);
  console.log(
    `  ${label}: ${samples.length} fights, ${samples.filter((s) => s.label === 1).length} passes (requests so far ${requests})`,
  );
}

const fit = fitLogistic(rows, labels, [...FEATURE_NAMES], { l2: 0.01 });
const baseRate = labels.reduce((s, y) => s + y, 0) / labels.length;
const baseLogLoss = logLoss(
  labels.map(() => baseRate),
  labels,
);
console.log(
  `\novertake: ${rows.length} samples, pass rate ${(baseRate * 100).toFixed(1)}%, log loss ${fit.logLoss.toFixed(4)} vs ${baseLogLoss.toFixed(4)} for the base rate`,
);

/* ---- Q3 cut-off improvement ---- */
const improvements: { weekend: string; fp3Tenth: number; q2Tenth: number; improvement: number }[] =
  [];
for (const race of races) {
  if (HELD_OUT_MEETINGS.has(race.meeting_key)) continue;
  const weekend = await get<Session>(`sessions?meeting_key=${race.meeting_key}`);
  const fp3 = weekend.find((s) => s.session_name === 'Practice 3');
  const quali = weekend.find((s) => s.session_name === 'Qualifying');
  if (!fp3 || !quali) continue;
  const fp3Data = await loadSession(fp3, false);
  const qualiData = await loadSession(quali, false);
  if (wet(fp3Data) || wet(qualiData)) continue;
  const fp3Tenth = tenthBestLap(fp3Data);
  const q2Tenth = q3Cutoff(qualiData);
  if (fp3Tenth == null || q2Tenth == null) continue;
  improvements.push({
    weekend: `${race.year} ${race.location}`,
    fp3Tenth,
    q2Tenth,
    improvement: Number((fp3Tenth - q2Tenth).toFixed(3)),
  });
  console.log(`  ${race.year} ${race.location}: FP3 P10 ${fp3Tenth} -> Q2 P10 ${q2Tenth}`);
}

const sorted = improvements.map((i) => i.improvement).sort((a, b) => a - b);
const medianImprovement = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
const deviations = sorted.map((v) => Math.abs(v - medianImprovement)).sort((a, b) => a - b);
const spread = deviations.length ? deviations[Math.floor(deviations.length / 2)]! : 0;

const calibration = {
  generatedAt: new Date().toISOString(),
  method:
    'Overtake: logistic regression (Newton, L2 0.01, standardised features) on every adjacent pair within 3.0 s at a lap start in dry 2024-2025 races; label = chaser ahead at the start of any of the next 5 laps; samples with a stop or caution inside the window excluded. Q3 cut-off: median over weekends of (FP3 tenth-best lap - Q2 tenth-best lap); spread is the median absolute deviation. Sessions 9912, 10014 and 9920 (and their weekends) held out for the prediction tests.',
  overtake: {
    featureNames: fit.featureNames,
    means: fit.means,
    stds: fit.stds,
    weights: fit.weights,
    bias: fit.bias,
    samples: rows.length,
    passes: labels.filter((y) => y === 1).length,
    baseRate,
    logLoss: fit.logLoss,
    baseLogLoss,
    races: used,
    skipped,
  },
  q3Cutoff: {
    medianImprovement,
    spread,
    weekends: improvements.length,
    detail: improvements,
  },
};

fs.writeFileSync(OUT, `${JSON.stringify(calibration, null, 2)}\n`);
console.log(
  `\nq3 cut-off: median improvement ${medianImprovement} s over ${improvements.length} weekends (spread ${spread})`,
);
console.log(`wrote ${path.relative(ROOT, OUT)} after ${requests} requests`);
