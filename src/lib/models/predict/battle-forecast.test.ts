import { describe, expect, it } from 'vitest';
import { battleForecast, type CarPace } from './battle-forecast';

const car = (overrides: Partial<CarPace> = {}): CarPace => ({
  intercept: 82,
  slope: 0.05,
  tyreAge: 10,
  confidence: 'high',
  ...overrides,
});

describe('battleForecast', () => {
  it('counts the laps until the gap is inside a second, from the trend alone', () => {
    // 3.0 s gap closing 0.9 s over three laps: 0.3 s a lap, so under 1.0 s after 7 laps.
    const f = battleForecast({
      gap: 3,
      gapChange: -0.9,
      ahead: null,
      chaser: null,
      lapsRemaining: 30,
    });
    expect(f).toMatchObject({ lapsToDrs: 7, basis: 'trend', confidence: 'low', enough: true });
    expect(f.closingPerLap).toBeCloseTo(0.3, 6);
  });

  it('uses the pace model when there is no trend yet', () => {
    // Chaser 0.5 s a lap quicker on equal wear: 2.5 s is exactly 1.0 s after 3 laps, which counts.
    const f = battleForecast({
      gap: 2.5,
      gapChange: null,
      ahead: car({ intercept: 82.5 }),
      chaser: car(),
      lapsRemaining: 30,
    });
    expect(f).toMatchObject({ lapsToDrs: 3, basis: 'pace' });
  });

  it('sees closing speed up when the car ahead is wearing faster', () => {
    const steady = battleForecast({
      gap: 4,
      gapChange: null,
      ahead: car({ intercept: 82.2 }),
      chaser: car(),
      lapsRemaining: 40,
    });
    const wearing = battleForecast({
      gap: 4,
      gapChange: null,
      ahead: car({ intercept: 82.2, slope: 0.12 }),
      chaser: car(),
      lapsRemaining: 40,
    });
    expect(wearing.lapsToDrs!).toBeLessThan(steady.lapsToDrs!);
  });

  it('averages the trend and the model when it has both', () => {
    const f = battleForecast({
      gap: 3,
      gapChange: -0.3,
      ahead: car({ intercept: 82.3 }),
      chaser: car(),
      lapsRemaining: 30,
    });
    expect(f.basis).toBe('trend+pace');
    // Trend 0.1 s/lap, model 0.3 s/lap.
    expect(f.closingPerLap).toBeCloseTo(0.2, 6);
    expect(f.confidence).toBe('high');
  });

  it('says not before the end when the gap will not close in time', () => {
    const f = battleForecast({
      gap: 5,
      gapChange: -0.3,
      ahead: null,
      chaser: null,
      lapsRemaining: 8,
    });
    expect(f).toMatchObject({ lapsToDrs: null, notBeforeEnd: true });
  });

  it('says not before the end when the gap is growing', () => {
    expect(
      battleForecast({ gap: 2, gapChange: 0.6, ahead: null, chaser: null, lapsRemaining: 30 })
        .notBeforeEnd,
    ).toBe(true);
  });

  it('reports a car already in range', () => {
    expect(
      battleForecast({ gap: 0.7, gapChange: 0, ahead: null, chaser: null, lapsRemaining: 30 })
        .lapsToDrs,
    ).toBe(0);
  });

  it('has nothing to say with neither a trend nor both cars’ pace', () => {
    expect(
      battleForecast({ gap: 2, gapChange: null, ahead: car(), chaser: null, lapsRemaining: 30 })
        .enough,
    ).toBe(false);
  });
});
