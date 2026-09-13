import { describe, expect, it } from 'vitest';
import type { StintFit } from './stint-fit';
import { tyreLife } from './tyre-life';

function stint(overrides: Partial<StintFit> = {}): StintFit {
  return {
    driverNumber: 1,
    stintNumber: 1,
    compound: 'MEDIUM',
    lapStart: 1,
    lapEnd: 20,
    tyreAge: 20,
    cleanLaps: 14,
    slope: 0.05,
    intercept: 82,
    residualStdDev: 0.2,
    fuelEffectPerLap: 0.055,
    points: [],
    confidence: 'high',
    ...overrides,
  };
}

describe('tyreLife', () => {
  it('ends the set’s life when staying out would have cost a stop', () => {
    // 0.05 s/lap x 20 laps = 1.0 s a lap slower than new; 22 s of pit loss is 22 laps.
    const life = tyreLife({ stint: stint(), currentLap: 20, totalLaps: 60, pitLoss: 22 });
    expect(life.lapsLeft).toBe(22);
    expect(life.lastsToEnd).toBe(false);
    expect(life.fraction).toBeCloseTo(22 / 42, 6);
  });

  it('shrinks as the tyre ages', () => {
    const young = tyreLife({
      stint: stint({ tyreAge: 10 }),
      currentLap: 10,
      totalLaps: 80,
      pitLoss: 22,
    });
    const old = tyreLife({
      stint: stint({ tyreAge: 30 }),
      currentLap: 30,
      totalLaps: 80,
      pitLoss: 22,
    });
    expect(old.lapsLeft!).toBeLessThan(young.lapsLeft!);
    expect(old.fraction!).toBeLessThan(young.fraction!);
  });

  it('lasts to the end when the race is shorter than the set’s life', () => {
    const life = tyreLife({ stint: stint(), currentLap: 50, totalLaps: 60, pitLoss: 22 });
    expect(life).toMatchObject({ lapsLeft: 10, lastsToEnd: true, fraction: 1 });
  });

  it('lasts to the end when the tyre shows no wear', () => {
    expect(
      tyreLife({ stint: stint({ slope: -0.01 }), currentLap: 20, totalLaps: 60, pitLoss: 22 })
        .lastsToEnd,
    ).toBe(true);
  });

  it('refuses to estimate from fewer than four clean laps', () => {
    const life = tyreLife({
      stint: stint({ cleanLaps: 3, slope: null }),
      currentLap: 5,
      totalLaps: 60,
      pitLoss: 22,
    });
    expect(life.enough).toBe(false);
    expect(life.lapsLeft).toBeNull();
  });
});
