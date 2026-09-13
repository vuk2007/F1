import { describe, expect, it } from 'vitest';
import type { RaceControl } from '@/lib/openf1/types';
import { compoundStep, overtakeChance, overtakeSamples } from './overtake';
import { syntheticRace } from './race.fixture';
import type { LogisticModel } from './logistic';

/*
 * AAA leads on hards; BBB starts 4 s behind on mediums and is 0.4 s a lap quicker,
 * so the gap falls 4.0, 3.6, 3.2 ... and BBB is ahead after lap 10.
 */
function chase() {
  return syntheticRace(
    [
      { number: 1, acronym: 'AAA', base: 80, stints: [{ compound: 'HARD', laps: 20, wear: 0 }] },
      {
        number: 2,
        acronym: 'BBB',
        base: 79.6,
        startOffsetMs: 4000,
        stints: [{ compound: 'MEDIUM', laps: 20, wear: 0 }],
      },
    ],
    20,
  );
}

describe('overtakeSamples', () => {
  const samples = overtakeSamples(chase().dataset);
  const byLap = new Map(samples.map((s) => [s.lap, s]));

  it('takes situations within three seconds only', () => {
    expect(Math.min(...samples.map((s) => s.lap))).toBeGreaterThanOrEqual(4);
    for (const s of samples) expect(s.features.gap).toBeLessThanOrEqual(3);
  });

  it('measures the chaser’s pace advantage and compound step from the laps before', () => {
    const s = byLap.get(5)!;
    expect(s.ahead).toBe(1);
    expect(s.chaser).toBe(2);
    expect(s.features.paceDelta).toBeCloseTo(0.4, 2);
    expect(s.features.compoundDelta).toBe(1);
  });

  it('labels a pass that happens within five laps, and not one that comes later', () => {
    /*
     * BBB crosses the line ahead at the end of lap 11. The order is published a
     * moment after the leader crosses, so it is first visible at the start of lap 13
     * — the earliest lap whose five-lap window reaches it is lap 8.
     */
    expect(byLap.get(7)!.label).toBe(0);
    expect(byLap.get(8)!.label).toBe(1);
  });

  it('leaves out situations spoilt by a safety car', () => {
    const race = chase();
    const sc: RaceControl[] = [
      {
        ...race.dataset.raceControl[0]!,
        category: 'SafetyCar',
        message: 'SAFETY CAR DEPLOYED',
        date: race.dataset.laps.find((l) => l.lap_number === 8)!.date_start!,
        flag: null,
        driver_number: null,
        lap_number: 8,
        meeting_key: 1,
        qualifying_phase: null,
        scope: 'Track',
        sector: null,
        session_key: 1,
      },
      {
        category: 'SafetyCar',
        message: 'SAFETY CAR IN THIS LAP',
        date: race.dataset.laps.find((l) => l.lap_number === 9)!.date_start!,
        flag: null,
        driver_number: null,
        lap_number: 9,
        meeting_key: 1,
        qualifying_phase: null,
        scope: 'Track',
        sector: null,
        session_key: 1,
      },
    ];
    const spoilt = overtakeSamples({ ...race.dataset, raceControl: sc });
    expect(spoilt.some((s) => s.lap >= 5 && s.lap <= 8)).toBe(false);
  });
});

describe('overtakeChance', () => {
  // A model where closer, quicker, fresher and softer all raise the chance.
  const model: LogisticModel = {
    featureNames: ['gap', 'paceDelta', 'tyreAgeDelta', 'compoundDelta'],
    means: [0, 0, 0, 0],
    stds: [1, 1, 1, 1],
    weights: [-1.2, 2.0, 0.05, 0.3],
    bias: -0.5,
  };
  const base = { gap: 1.5, paceDelta: 0.2, tyreAgeDelta: 5, compoundDelta: 0 };

  it('rises as the gap shrinks and the pace advantage grows', () => {
    expect(overtakeChance({ ...base, gap: 0.5 }, model)).toBeGreaterThan(
      overtakeChance(base, model),
    );
    expect(overtakeChance({ ...base, paceDelta: 1 }, model)).toBeGreaterThan(
      overtakeChance(base, model),
    );
  });

  it('stays a probability', () => {
    const p = overtakeChance({ gap: 0, paceDelta: 5, tyreAgeDelta: 40, compoundDelta: 2 }, model);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe('compoundStep', () => {
  it('orders dry compounds and leaves out wet-weather tyres', () => {
    expect([compoundStep('SOFT'), compoundStep('medium'), compoundStep('HARD')]).toEqual([1, 2, 3]);
    expect(compoundStep('INTERMEDIATE')).toBeNull();
  });
});
