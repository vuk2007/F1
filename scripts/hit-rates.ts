/**
 * Prints each prediction card's hit rate on the held-out 2025 fixture races.
 *
 *   pnpm hit-rates            summary table
 *   pnpm hit-rates --details  every individual prediction, HIT or MISS
 *
 * The same evaluations the outcome tests run, so the numbers quoted in the (i)
 * texts and the README can be reproduced.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateBattleForecast,
  evaluateCheapStop,
  evaluateOvertake,
  evaluatePitWindow,
  evaluatePractice,
  evaluateStrategyBattle,
  evaluateTyreLife,
  evaluateTyrePerformance,
  type HitRate,
} from '@/lib/models/predict/evaluate';
import { loadFixture, RACE_FIXTURES } from '@/lib/models/predict/fixtures';
import type { LogisticModel } from '@/lib/models/predict/logistic';
import type { Q3Calibration } from '@/lib/models/predict/practice-forecast';

const calibrationPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/lib/models/predict/calibration.json',
);
const calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf8')) as {
  overtake: LogisticModel & { baseRate: number };
  q3Cutoff: Q3Calibration;
};

const details = process.argv.includes('--details');
const races = RACE_FIXTURES.map((name) => ({ name, dataset: loadFixture(name) }));

function pool(card: string, rule: string, rates: HitRate[]): HitRate {
  const evaluated = rates.reduce((sum, r) => sum + r.evaluated, 0);
  const hits = rates.reduce((sum, r) => sum + r.hits, 0);
  return {
    card,
    rule,
    evaluated,
    hits,
    rate: evaluated === 0 ? null : hits / evaluated,
    details: rates.flatMap((r) => r.details),
  };
}

function perRace<T>(run: (dataset: (typeof races)[number]['dataset']) => T): T[] {
  return races.map(({ name, dataset }) => {
    const started = Date.now();
    const out = run(dataset);
    process.stderr.write(`  ${name}: ${Date.now() - started} ms\n`);
    return out;
  });
}

const rows: { rate: HitRate; extra?: string }[] = [];

process.stderr.write('Tyre performance\n');
const tyres = perRace(evaluateTyrePerformance);
rows.push({ rate: pool(tyres[0]!.card, tyres[0]!.rule, tyres) });

process.stderr.write('Tyre life\n');
const life = perRace(evaluateTyreLife);
rows.push({ rate: pool(life[0]!.card, life[0]!.rule, life) });

process.stderr.write('Pit window\n');
const pit = perRace(evaluatePitWindow);
rows.push({
  rate: pool(
    pit[0]!.window.card,
    pit[0]!.window.rule,
    pit.map((p) => p.window),
  ),
});
rows.push({
  rate: pool(
    pit[0]!.rejoin.card,
    pit[0]!.rejoin.rule,
    pit.map((p) => p.rejoin),
  ),
});

process.stderr.write('Battle forecast\n');
const battles = perRace(evaluateBattleForecast);
rows.push({ rate: pool(battles[0]!.card, battles[0]!.rule, battles) });

process.stderr.write('Overtake chance\n');
const overtake = perRace((dataset) =>
  evaluateOvertake(dataset, calibration.overtake, calibration.overtake.baseRate),
);
const samples = overtake.reduce((sum, r) => sum + r.evaluated, 0);
const brier = overtake.reduce((sum, r) => sum + (r.brier ?? 0) * r.evaluated, 0) / samples;
const baseBrier = overtake.reduce((sum, r) => sum + (r.baseBrier ?? 0) * r.evaluated, 0) / samples;
rows.push({
  rate: pool(overtake[0]!.card, overtake[0]!.rule, overtake),
  extra: `Brier ${brier.toFixed(4)} vs ${baseBrier.toFixed(4)} always guessing the base rate (${(
    (1 - brier / baseBrier) *
    100
  ).toFixed(1)}% better)`,
});

process.stderr.write('Strategy battle\n');
const strategy = perRace(evaluateStrategyBattle);
rows.push({ rate: pool(strategy[0]!.card, strategy[0]!.rule, strategy) });

process.stderr.write('Cheap stop\n');
const cheap = perRace(evaluateCheapStop);
rows.push({ rate: pool(cheap[0]!.card, cheap[0]!.rule, cheap) });

process.stderr.write('Practice\n');
const practice = evaluatePractice(
  loadFixture('bahrain-2025-fp2'),
  loadFixture('bahrain-2025-fp3'),
  loadFixture('bahrain-2025-qualifying'),
  loadFixture('bahrain-2025-race'),
  calibration.q3Cutoff,
);
rows.push({ rate: practice.degradation, extra: 'Bahrain 2025 only' });
rows.push({ rate: practice.cutoff, extra: 'Bahrain 2025 only' });

console.log(`\nHeld-out races: ${RACE_FIXTURES.join(', ')}\n`);
console.log('| Card | Hit when | Hits | Rate |');
console.log('| --- | --- | --- | --- |');
for (const { rate, extra } of rows) {
  const pct = rate.rate == null ? 'n/a' : `${Math.round(rate.rate * 100)}%`;
  console.log(
    `| ${rate.card} | ${rate.rule}${extra ? ` — ${extra}` : ''} | ${rate.hits}/${rate.evaluated} | ${pct} |`,
  );
}

if (details) {
  for (const { rate } of rows) {
    console.log(`\n## ${rate.card}`);
    for (const line of rate.details) console.log(line);
  }
}
