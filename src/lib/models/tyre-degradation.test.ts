import { describe, expect, it } from 'vitest';
import { predictedLapTime, tyreDegradation } from './tyre-degradation';
import type { ExclusionReason, StintLapSample } from './stint-laps';

/** Builds a clean sample; pass `excluded` to mark it filtered out. */
function sample(
  lapNumber: number,
  tyreAge: number,
  lapTime: number | null,
  excluded: ExclusionReason | null = null,
): StintLapSample {
  return { lapNumber, tyreAge, lapTime, excluded, startMs: null };
}

/** A stint degrading at a known rate, with optional per-lap noise. */
function stint(laps: number, base: number, slope: number, noise: number[] = []): StintLapSample[] {
  return Array.from({ length: laps }, (_, i) => {
    const age = i + 1;
    return sample(age, age, base + slope * age + (noise[i] ?? 0));
  });
}

describe('tyreDegradation', () => {
  it('recovers a known degradation slope', () => {
    const result = tyreDegradation(stint(12, 80, 0.08));
    expect(result.slope).toBeCloseTo(0.08, 6);
    expect(result.intercept).toBeCloseTo(80, 6);
    expect(result.cleanLaps).toBe(12);
    expect(result.totalLaps).toBe(12);
    expect(result.confidence).toBe('high');
  });

  it('uses only clean laps and still reports the stint length', () => {
    const samples = [
      ...stint(8, 80, 0.1),
      sample(9, 9, 105, 'pit-out'),
      sample(10, 10, 95, 'caution'),
      sample(11, 11, 84, 'traffic'),
    ];
    const result = tyreDegradation(samples);
    expect(result.cleanLaps).toBe(8);
    expect(result.totalLaps).toBe(11);
    // The excluded laps are wildly off-trend; the slope must be unaffected.
    expect(result.slope).toBeCloseTo(0.1, 6);
  });

  it('refuses to fit when there are too few clean laps', () => {
    const result = tyreDegradation([sample(1, 1, 80), sample(2, 2, 80.1)]);
    expect(result.slope).toBeNull();
    expect(result.confidence).toBe('none');
    expect(result.cleanLaps).toBe(2);
  });

  it('ignores laps with no recorded time', () => {
    const samples = [...stint(6, 80, 0.05), sample(7, 7, null)];
    const result = tyreDegradation(samples);
    expect(result.cleanLaps).toBe(6);
    expect(result.slope).toBeCloseTo(0.05, 6);
  });

  it('discards a single bad lap as an outlier and refits', () => {
    const laps = stint(12, 80, 0.08);
    // Lap 6 is a lock-up: three seconds lost.
    laps[5]!.lapTime = laps[5]!.lapTime! + 3;

    const result = tyreDegradation(laps);
    expect(result.outlierLaps).toContain(6);
    expect(result.cleanLaps).toBe(11);
    expect(result.slope).toBeCloseTo(0.08, 6);
  });

  it('keeps every lap when the stint has no outliers', () => {
    const result = tyreDegradation(stint(10, 80, 0.06));
    expect(result.outlierLaps).toEqual([]);
    expect(result.cleanLaps).toBe(10);
  });

  it('grades confidence from both sample size and scatter', () => {
    expect(tyreDegradation(stint(15, 80, 0.08)).confidence).toBe('high');
    // Same tight fit, far fewer laps: a line through four points proves little.
    expect(tyreDegradation(stint(4, 80, 0.08)).confidence).toBe('low');

    // Many laps but heavy scatter must not read as high confidence.
    const noisy = tyreDegradation(
      stint(14, 80, 0.08, [1, -1, 0.9, -0.8, 1.1, -1.2, 0.7, -0.9, 1, -1, 0.8, -0.7, 1, -1]),
    );
    expect(noisy.confidence).toBe('low');
  });

  it('corrects for fuel burn only when asked', () => {
    // A car getting 0.05s/lap lighter while the tyre loses 0.08s/lap measures 0.03.
    const measured = stint(12, 80, 0.03);

    const raw = tyreDegradation(measured);
    expect(raw.slope).toBeCloseTo(0.03, 6);
    expect(raw.fuelEffectPerLap).toBe(0);

    const corrected = tyreDegradation(measured, { fuelEffectPerLap: 0.05 });
    expect(corrected.slope).toBeCloseTo(0.08, 6);
    expect(corrected.fuelEffectPerLap).toBe(0.05);
  });

  it('reports a tyre that is not degrading as a flat slope', () => {
    const result = tyreDegradation(stint(10, 80, 0));
    expect(result.slope).toBeCloseTo(0, 6);
    expect(result.confidence).toBe('high');
  });

  it('produces a curve spanning the observed tyre ages', () => {
    const result = tyreDegradation(stint(10, 80, 0.08));
    expect(result.curve[0]!.tyreAge).toBe(1);
    expect(result.curve[result.curve.length - 1]!.tyreAge).toBe(10);
    expect(result.curve[0]!.predicted).toBeCloseTo(80.08, 6);
    expect(result.curve[9]!.predicted).toBeCloseTo(80.8, 6);
  });

  it('returns an empty result for an empty stint', () => {
    const result = tyreDegradation([]);
    expect(result.slope).toBeNull();
    expect(result.totalLaps).toBe(0);
    expect(result.curve).toEqual([]);
    expect(result.confidence).toBe('none');
  });
});

describe('predictedLapTime', () => {
  it('extrapolates beyond the observed stint', () => {
    const result = tyreDegradation(stint(10, 80, 0.1));
    expect(predictedLapTime(result, 20)).toBeCloseTo(82, 4);
  });

  it('returns null without a fit', () => {
    expect(predictedLapTime(tyreDegradation([]), 5)).toBeNull();
  });
});
