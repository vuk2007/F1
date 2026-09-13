import { describe, expect, it } from 'vitest';
import { buildPredictions, MAX_BATTLES, type Calibration } from './assemble';
import { loadFixture } from './fixtures';

/** A fixed model, so these tests do not depend on the latest calibration run. */
const calibration: Calibration = {
  overtake: {
    featureNames: ['gap', 'paceDelta', 'tyreAgeDelta', 'compoundDelta'],
    means: [1.5, 0, 0, 0],
    stds: [0.8, 0.5, 8, 0.7],
    weights: [-0.8, 0.6, 0.3, 0.2],
    bias: -2,
  },
  q3: { medianImprovement: 1.0, spread: 0.3, weekends: 30 },
};

function leaderLapStart(name: 'monza-2025-race' | 'bahrain-2025-race', lap: number): number {
  const race = loadFixture(name);
  return Math.min(
    ...race.laps
      .filter((l) => l.lap_number === lap && l.date_start)
      .map((l) => Date.parse(l.date_start!)),
  );
}

describe('buildPredictions', () => {
  it('builds every race card from what had happened by then', { timeout: 60_000 }, () => {
    const dataset = loadFixture('bahrain-2025-race');
    const at = leaderLapStart('bahrain-2025-race', 20);
    const leader = dataset.drivers.find((d) => d.name_acronym === 'PIA')!.driver_number;

    const p = buildPredictions({
      dataset,
      timeMs: at,
      selectedDriver: leader,
      rivalDriver: null,
      calibration,
    });
    if (p.kind !== 'race') throw new Error('expected race predictions');

    expect(p.lap).toBeLessThanOrEqual(20);
    expect(p.totalLaps).toBe(57);
    expect(p.tyres.compounds.some((c) => c.enough)).toBe(true);
    expect(p.battles.length).toBeLessThanOrEqual(MAX_BATTLES);
    for (const battle of p.battles) {
      expect(battle.gap).toBeLessThanOrEqual(3);
      if (battle.overtake.probability != null) {
        expect(battle.overtake.probability).toBeGreaterThan(0);
        expect(battle.overtake.probability).toBeLessThan(1);
      }
    }
    expect(p.cheapStop.active).toBe(false);

    expect(p.driver?.label).toBe('PIA');
    // Nothing about the future: a pit window never starts before the lap they are on.
    if (p.driver?.pit?.next) expect(p.driver.pit.next.from).toBeGreaterThanOrEqual(p.lap! - 1);
    expect(p.driver?.rivalNumber).not.toBeNull();
    expect(p.driver?.rivalNumber).not.toBe(leader);
  });

  it('uses the chosen rival for the strategy battle', { timeout: 60_000 }, () => {
    const dataset = loadFixture('monza-2025-race');
    const at = leaderLapStart('monza-2025-race', 15);
    const ver = dataset.drivers.find((d) => d.name_acronym === 'VER')!.driver_number;
    const pia = dataset.drivers.find((d) => d.name_acronym === 'PIA')!.driver_number;

    const p = buildPredictions({
      dataset,
      timeMs: at,
      selectedDriver: ver,
      rivalDriver: pia,
      calibration,
    });
    if (p.kind !== 'race') throw new Error('expected race predictions');
    expect(p.driver?.rivalNumber).toBe(pia);
    if (p.driver?.strategy) expect(p.driver.strategy.y.car.label).toBe('PIA');
  });

  it(
    'gives the practice variant, with the Q3 cut-off only in practice 3',
    { timeout: 60_000 },
    () => {
      const fp3 = loadFixture('bahrain-2025-fp3');
      const fp2 = loadFixture('bahrain-2025-fp2');

      const three = buildPredictions({
        dataset: fp3,
        timeMs: fp3.endMs,
        selectedDriver: null,
        rivalDriver: null,
        calibration,
      });
      const two = buildPredictions({
        dataset: fp2,
        timeMs: fp2.endMs,
        selectedDriver: null,
        rivalDriver: null,
        calibration,
      });
      if (three.kind !== 'practice' || two.kind !== 'practice')
        throw new Error('expected practice predictions');

      // FP3 tenth best was 93.111; the fixed calibration takes a second off.
      expect(three.q3?.predicted).toBeCloseTo(92.111, 3);
      expect(two.q3).toBeNull();
      expect(two.degradation.some((d) => d.enough)).toBe(true);
      expect(three.theoretical.length).toBeGreaterThan(0);
    },
  );
});
