/**
 * Outcome tests: each prediction card replayed against finished 2025 races, where
 * what happened next is known.
 *
 * The floors sit a little under the hit rates measured when the cards were built
 * (`pnpm hit-rates` prints the current figures). They exist to catch a change that
 * makes a card worse, not to claim the card is good: several rates are modest, and
 * the (i) on each card says so.
 */
import { describe, expect, it } from 'vitest';
import calibration from './calibration.json';
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
} from './evaluate';
import { loadFixture, RACE_FIXTURES } from './fixtures';

const SLOW = 180_000;

function pooled(rates: HitRate[]): { evaluated: number; hits: number; rate: number } {
  const evaluated = rates.reduce((sum, r) => sum + r.evaluated, 0);
  const hits = rates.reduce((sum, r) => sum + r.hits, 0);
  return { evaluated, hits, rate: evaluated === 0 ? 0 : hits / evaluated };
}

const races = () => RACE_FIXTURES.map(loadFixture);

describe('prediction outcomes on finished 2025 races', () => {
  it('tyre performance predicts a lap five laps ahead within 0.5 s', { timeout: SLOW }, () => {
    const result = pooled(races().map(evaluateTyrePerformance));
    expect(result.evaluated).toBeGreaterThan(100);
    expect(result.rate).toBeGreaterThanOrEqual(0.65);
  });

  it('tyre life puts the real stop within five laps of the end of life', { timeout: SLOW }, () => {
    const result = pooled(races().map(evaluateTyreLife));
    expect(result.evaluated).toBeGreaterThan(30);
    expect(result.rate).toBeGreaterThanOrEqual(0.15);
    // A rule that cannot miss measures nothing: the first version scored 100%.
    expect(result.rate).toBeLessThan(0.9);
  });

  it('pit window contains the real stop and places the rejoin', { timeout: SLOW }, () => {
    const results = races().map(evaluatePitWindow);
    const window = pooled(results.map((r) => r.window));
    const rejoin = pooled(results.map((r) => r.rejoin));
    expect(window.evaluated).toBeGreaterThan(10);
    expect(window.rate).toBeGreaterThanOrEqual(0.4);
    expect(rejoin.evaluated).toBeGreaterThan(30);
    expect(rejoin.rate).toBeGreaterThanOrEqual(0.45);
  });

  it('battle forecast calls laps to DRS range within two laps', { timeout: SLOW }, () => {
    const result = pooled(races().map(evaluateBattleForecast));
    expect(result.evaluated).toBeGreaterThan(100);
    expect(result.rate).toBeGreaterThanOrEqual(0.45);
  });

  it('overtake chance beats always guessing the base rate', { timeout: SLOW }, () => {
    const { overtake } = calibration;
    const results = races().map((race) => evaluateOvertake(race, overtake, overtake.baseRate));
    const samples = results.reduce((sum, r) => sum + r.evaluated, 0);
    const brier = results.reduce((sum, r) => sum + (r.brier ?? 0) * r.evaluated, 0) / samples;
    const baseBrier =
      results.reduce((sum, r) => sum + (r.baseBrier ?? 0) * r.evaluated, 0) / samples;
    expect(samples).toBeGreaterThan(200);
    expect(brier).toBeLessThan(baseBrier);
  });

  it('strategy battle names the car that finished ahead', { timeout: SLOW }, () => {
    const result = pooled(races().map(evaluateStrategyBattle));
    expect(result.evaluated).toBeGreaterThan(8);
    expect(result.rate).toBeGreaterThanOrEqual(0.6);
  });

  it('cheap stop places a safety car stop within two positions', { timeout: SLOW }, () => {
    const result = pooled(races().map(evaluateCheapStop));
    expect(result.evaluated).toBeGreaterThan(20);
    expect(result.rate).toBeGreaterThanOrEqual(0.55);
  });

  it('practice forecasts are scored against the race and qualifying', { timeout: SLOW }, () => {
    const result = evaluatePractice(
      loadFixture('bahrain-2025-fp2'),
      loadFixture('bahrain-2025-fp3'),
      loadFixture('bahrain-2025-qualifying'),
      loadFixture('bahrain-2025-race'),
      calibration.q3Cutoff,
    );
    // One weekend: too few to set a floor, so the test checks it can be scored at all.
    expect(result.degradation.evaluated).toBeGreaterThan(0);
    expect(result.cutoff.evaluated).toBe(1);
  });
});
