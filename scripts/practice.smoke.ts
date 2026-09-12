/**
 * Practice-mode models checked against the real 2025 Monza FP2 (session 9906).
 *
 * A practice session is structurally unlike a race: stints contain garage time
 * measured in hundreds of seconds, cool-down laps, and aborted efforts with no
 * lap time at all. This suite proves the classifier separates a genuine race
 * simulation from that noise on real data.
 *
 * Network-bound. Run with `pnpm smoke`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SessionDataset } from '@/lib/openf1/dataset';
import { loadSessionForSmoke } from './load-or-skip';
import { theoreticalBestByDriver, theoreticalBestLap } from '@/lib/models/best-lap';
import { bestLongRun, bestShortRun, classifyRuns } from '@/lib/models/runs';

/** 2025 Italian Grand Prix, Free Practice 2. */
const MONZA_2025_FP2 = 9906;
const VER = 1;

let dataset: SessionDataset;

beforeAll(async () => {
  dataset = await loadSessionForSmoke(MONZA_2025_FP2);
}, 180_000);

describe('practice session shape', () => {
  it('is a practice session with real running', () => {
    expect(dataset.session.session_type).toBe('Practice');
    expect(dataset.drivers.length).toBeGreaterThan(15);
    expect(dataset.laps.length).toBeGreaterThan(200);
  });
});

describe('theoretical best lap on real data', () => {
  it('is never slower than the actual best lap', () => {
    for (const driver of dataset.drivers) {
      const laps = dataset.laps.filter((lap) => lap.driver_number === driver.driver_number);
      const best = theoreticalBestLap(laps);
      if (best.theoretical == null || best.actualBest == null) continue;

      // Summing the best sectors can only ever match or beat the best single lap.
      expect(best.theoretical).toBeLessThanOrEqual(best.actualBest.seconds + 1e-3);
      expect(best.timeLeftOnTable!).toBeGreaterThanOrEqual(-1e-3);
    }
  });

  it('produces a believable Monza lap time', () => {
    const laps = dataset.laps.filter((lap) => lap.driver_number === VER);
    const best = theoreticalBestLap(laps);

    expect(best.theoretical!).toBeGreaterThan(76);
    expect(best.theoretical!).toBeLessThan(90);
    // Time left on the table should be tenths, not seconds.
    expect(best.timeLeftOnTable!).toBeLessThan(2);
  });

  it('ranks the field with the quickest first', () => {
    const ranked = theoreticalBestByDriver(
      dataset.laps,
      dataset.drivers.map((d) => d.driver_number),
    );
    const times = ranked
      .map((entry) => entry.best.theoretical)
      .filter((value): value is number => value != null);

    expect(times.length).toBeGreaterThan(15);
    expect([...times]).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('run classification on real data', () => {
  it('finds both a qualifying simulation and a race simulation', () => {
    const runs = classifyRuns(dataset, VER);
    expect(runs.length).toBeGreaterThan(2);

    const longRun = bestLongRun(runs);
    const shortRun = bestShortRun(runs);
    expect(longRun).not.toBeNull();
    expect(shortRun).not.toBeNull();

    // The race simulation is the long one; the quali sim is a couple of laps.
    expect(longRun!.representativeLaps).toBeGreaterThanOrEqual(5);
    expect(shortRun!.representativeLaps).toBeLessThan(5);
  });

  it('discards garage time instead of averaging it in', () => {
    const runs = classifyRuns(dataset, VER);

    // FP2 contains laps of several hundred seconds spent in the garage.
    const hasGarageLap = runs.some((run) =>
      run.samples.some((sample) => (sample.lapTime ?? 0) > 200),
    );
    expect(hasGarageLap).toBe(true);

    // None of them may survive into a run's pace figures.
    for (const run of runs) {
      if (run.averageLap == null) continue;
      expect(run.averageLap).toBeLessThan(100);
      expect(run.bestLap!).toBeLessThan(100);
    }
  });

  it('reports long-run pace slower than one-lap pace', () => {
    const runs = classifyRuns(dataset, VER);
    const longRun = bestLongRun(runs)!;
    const shortRun = bestShortRun(runs)!;

    // Race simulations carry fuel, so they are always slower than a quali sim.
    expect(longRun.averageLap!).toBeGreaterThan(shortRun.bestLap!);
    // But still a real racing lap, not a cool-down.
    expect(longRun.averageLap!).toBeLessThan(shortRun.bestLap! + 8);
  });

  it('measures a consistent long run', () => {
    const longRun = bestLongRun(classifyRuns(dataset, VER))!;
    // A clean race simulation should not vary by more than about a second.
    expect(longRun.consistency!).toBeLessThan(1.5);
  });

  it('does not apply a fuel correction outside a race', () => {
    const longRun = bestLongRun(classifyRuns(dataset, VER))!;
    expect(longRun.degradation!.fuelEffectPerLap).toBe(0);
  });

  it('classifies every driver without throwing', () => {
    for (const driver of dataset.drivers) {
      const runs = classifyRuns(dataset, driver.driver_number);
      for (const run of runs) {
        expect(['short', 'long', 'installation']).toContain(run.kind);
        expect(run.representativeLaps).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
