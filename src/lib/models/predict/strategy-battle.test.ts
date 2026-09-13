import { describe, expect, it } from 'vitest';
import { projectPlan, strategyBattle, type StrategyCar } from './strategy-battle';

function car(overrides: Partial<StrategyCar> = {}): StrategyCar {
  return {
    driverNumber: 1,
    label: 'AAA',
    currentLap: 20,
    tyreAge: 20,
    compound: 'MEDIUM',
    intercept: 82,
    slope: 0.08,
    fuelEffectPerLap: 0.055,
    stopsMade: 0,
    gapToLeader: 0,
    stintsSoFar: [{ compound: 'MEDIUM', lapStart: 1, lapEnd: 20 }],
    confidence: 'high',
    ...overrides,
  };
}

describe('projectPlan', () => {
  it('places one stop and projects the time to the flag', () => {
    const plan = projectPlan(car(), 1, { totalLaps: 60, pitLoss: 22 })!;
    // Two equal 30-lap stints: stop on lap 30.
    expect(plan.stopLaps).toEqual([30]);
    expect(plan.stintsAhead).toEqual([
      { lapStart: 21, lapEnd: 30, newSet: false },
      { lapStart: 31, lapEnd: 60, newSet: true },
    ]);
  });

  it('adds the pit loss for each stop', () => {
    const one = projectPlan(car({ slope: 0 }), 1, { totalLaps: 60, pitLoss: 22 })!;
    const two = projectPlan(car({ slope: 0 }), 2, { totalLaps: 60, pitLoss: 22 })!;
    // With no wear, the second stop is pure cost.
    expect(two.timeToFinish - one.timeToFinish).toBeCloseTo(22, 3);
  });

  it('does not offer a plan with fewer stops than already made', () => {
    expect(projectPlan(car({ stopsMade: 2 }), 1, { totalLaps: 60, pitLoss: 22 })).toBeNull();
  });
});

describe('strategyBattle', () => {
  const x = car({ driverNumber: 1, label: 'AAA', gapToLeader: 0, slope: 0.1 });
  const y = car({ driverNumber: 2, label: 'BBB', gapToLeader: 3, slope: 0.04, intercept: 82.2 });
  const battle = strategyBattle(x, y, { totalLaps: 60, pitLoss: 22 });

  it('covers every one-stop and two-stop combination', () => {
    expect(battle.combinations.map((c) => `${c.xStops}v${c.yStops}`)).toEqual([
      '1v1',
      '1v2',
      '2v1',
      '2v2',
    ]);
  });

  it('uses the undercut simulation when each car has one stop left', () => {
    const oneVsOne = battle.combinations.find((c) => c.xStops === 1 && c.yStops === 1)!;
    expect(oneVsOne.viaUndercutSimulation).toBe(true);
    // And it agrees with the lap-by-lap projection: fuel is common and cancels.
    const xp = battle.x.plans.find((p) => p.totalStops === 1)!;
    const yp = battle.y.plans.find((p) => p.totalStops === 1)!;
    expect(oneVsOne.finishGap).toBeCloseTo(3 + yp.timeToFinish - xp.timeToFinish, 1);
  });

  it('names who finishes ahead', () => {
    for (const c of battle.combinations) {
      expect(c.aheadLabel).toBe(c.finishGap >= 0 ? 'AAA' : 'BBB');
    }
  });

  it('makes an extra stop look worse for the car it costs', () => {
    const base = battle.combinations.find((c) => c.xStops === 1 && c.yStops === 1)!;
    const yExtra = battle.combinations.find((c) => c.xStops === 1 && c.yStops === 2)!;
    // BBB barely wears, so its second stop mostly just costs 22 s.
    expect(yExtra.finishGap).toBeGreaterThan(base.finishGap);
  });
});
