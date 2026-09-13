import { describe, expect, it } from 'vitest';
import { loadFixture } from './fixtures';
import {
  bestLaps,
  practiceDegradation,
  predictQ3Cutoff,
  q3Cutoff,
  qualifyingPhaseWindow,
  tenthBestLap,
  theoreticalVsActual,
} from './practice-forecast';

const fp2 = loadFixture('bahrain-2025-fp2');
const fp3 = loadFixture('bahrain-2025-fp3');
const quali = loadFixture('bahrain-2025-qualifying');

describe('tenthBestLap', () => {
  it('reads the tenth-fastest driver in FP3', () => {
    // Bahrain 2025 FP3: HAM tenth on 1:33.111.
    expect(tenthBestLap(fp3)).toBeCloseTo(93.111, 3);
  });
});

describe('qualifyingPhaseWindow', () => {
  it('runs Q2 from its first message to Q3’s, red flag included', () => {
    // Q2 started 16:25, was stopped at 16:29, restarted 16:37; Q3 started 16:57.
    const window = qualifyingPhaseWindow(quali, 2)!;
    expect(new Date(window.fromMs).toISOString()).toBe('2025-04-12T16:25:00.000Z');
    expect(new Date(window.toMs).toISOString()).toBe('2025-04-12T16:57:00.000Z');
  });
});

describe('q3Cutoff', () => {
  it('is the tenth-best Q2 lap', () => {
    // TSU tenth on 1:31.228, 0.017 s ahead of DOO, who went out.
    expect(q3Cutoff(quali)).toBeCloseTo(91.228, 3);
  });
});

describe('predictQ3Cutoff', () => {
  it('subtracts the calibrated FP3-to-Q2 improvement', () => {
    const forecast = predictQ3Cutoff(fp3, { medianImprovement: 1.2, spread: 0.08, weekends: 30 });
    expect(forecast.predicted).toBeCloseTo(93.111 - 1.2, 3);
    expect(forecast.confidence).toBe('high');
  });

  it('stays at medium on the real 2024-2025 spread, whose tail misses by over a second', () => {
    expect(
      predictQ3Cutoff(fp3, { medianImprovement: 0.688, spread: 0.183, weekends: 25 }).confidence,
    ).toBe('medium');
  });

  it('is less sure when the calibration is thin or scattered', () => {
    expect(
      predictQ3Cutoff(fp3, { medianImprovement: 1.2, spread: 0.6, weekends: 30 }).confidence,
    ).toBe('low');
    expect(
      predictQ3Cutoff(fp3, { medianImprovement: 1.2, spread: 0.2, weekends: 3 }).confidence,
    ).toBe('low');
  });
});

describe('practiceDegradation', () => {
  const result = practiceDegradation(fp2);

  it('finds long runs on the compounds teams ran them on', () => {
    expect(result.length).toBeGreaterThan(0);
    for (const compound of result) {
      expect(compound.runs).toBeGreaterThan(0);
      expect(compound.laps).toBeGreaterThanOrEqual(5 * compound.runs);
    }
  });

  it('gives plausible race wear figures', () => {
    for (const compound of result.filter((c) => c.enough)) {
      expect(compound.degPerLap!).toBeGreaterThan(-0.1);
      expect(compound.degPerLap!).toBeLessThan(0.5);
    }
  });
});

describe('bestLaps', () => {
  it('only counts laps started inside the window', () => {
    const window = qualifyingPhaseWindow(quali, 3)!;
    expect(bestLaps(quali, window.fromMs, window.toMs).length).toBeLessThanOrEqual(10);
  });
});

describe('theoreticalVsActual', () => {
  it('never shows a best lap quicker than the best sectors allow', () => {
    const rows = theoreticalVsActual(quali);
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) expect(row.timeLeft).toBeGreaterThanOrEqual(-0.001);
  });
});
