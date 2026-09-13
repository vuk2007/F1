import { describe, expect, it } from 'vitest';
import { fitLogistic, logLoss, predictProbability, sigmoid } from './logistic';

/** Deterministic pseudo-random numbers, so the test data is the same every run. */
function lcg(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('sigmoid', () => {
  it('is 0.5 at zero and stays finite at the extremes', () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(800)).toBe(1);
    expect(sigmoid(-800)).toBe(0);
  });
});

describe('fitLogistic', () => {
  // Data drawn from p = sigmoid(-1 + 2·a - 1·b).
  const random = lcg(42);
  const rows: number[][] = [];
  const labels: number[] = [];
  for (let i = 0; i < 4000; i += 1) {
    const a = random() * 4 - 2;
    const b = random() * 4 - 2;
    rows.push([a, b]);
    labels.push(random() < sigmoid(-1 + 2 * a - b) ? 1 : 0);
  }
  const fit = fitLogistic(rows, labels, ['a', 'b'], { l2: 0 });

  it('recovers the generating probabilities', () => {
    for (const [a, b] of [
      [0, 0],
      [1, -1],
      [-1.5, 1],
    ]) {
      expect(predictProbability(fit, [a!, b!])).toBeCloseTo(sigmoid(-1 + 2 * a! - b!), 1);
    }
  });

  it('gets the direction of each feature right', () => {
    expect(fit.weights[0]!).toBeGreaterThan(0);
    expect(fit.weights[1]!).toBeLessThan(0);
  });

  it('beats predicting the base rate for everyone', () => {
    const base = labels.reduce((s, y) => s + y, 0) / labels.length;
    expect(fit.logLoss).toBeLessThan(
      logLoss(
        labels.map(() => base),
        labels,
      ),
    );
  });

  it('converges in a handful of Newton steps', () => {
    expect(fit.iterations).toBeLessThan(15);
  });
});
