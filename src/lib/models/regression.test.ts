import { describe, expect, it } from 'vitest';
import { linearFit, predict, predictQuadratic, quadraticFit, residual } from './regression';

describe('linearFit', () => {
  it('recovers an exact line', () => {
    const fit = linearFit([
      { x: 0, y: 10 },
      { x: 1, y: 12 },
      { x: 2, y: 14 },
      { x: 3, y: 16 },
    ])!;
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(10, 10);
    expect(fit.rSquared).toBeCloseTo(1, 10);
    expect(fit.residualStdDev).toBeCloseTo(0, 10);
    expect(fit.n).toBe(4);
  });

  it('handles a negative slope', () => {
    const fit = linearFit([
      { x: 1, y: 10 },
      { x: 2, y: 8 },
      { x: 3, y: 6 },
    ])!;
    expect(fit.slope).toBeCloseTo(-2, 10);
  });

  it('returns null with fewer than two points', () => {
    expect(linearFit([])).toBeNull();
    expect(linearFit([{ x: 1, y: 1 }])).toBeNull();
  });

  it('returns null when every x is identical', () => {
    expect(
      linearFit([
        { x: 5, y: 1 },
        { x: 5, y: 2 },
        { x: 5, y: 3 },
      ]),
    ).toBeNull();
  });

  it('reports zero slope and zero r-squared for flat data', () => {
    const fit = linearFit([
      { x: 1, y: 7 },
      { x: 2, y: 7 },
      { x: 3, y: 7 },
    ])!;
    expect(fit.slope).toBeCloseTo(0, 10);
    // No variance in y to explain; defined as 1 since the fit is exact.
    expect(fit.rSquared).toBe(1);
  });

  it('measures scatter through residualStdDev', () => {
    const tight = linearFit([
      { x: 1, y: 10.0 },
      { x: 2, y: 12.05 },
      { x: 3, y: 13.95 },
      { x: 4, y: 16.0 },
    ])!;
    const loose = linearFit([
      { x: 1, y: 10 },
      { x: 2, y: 15 },
      { x: 3, y: 11 },
      { x: 4, y: 18 },
    ])!;
    expect(tight.residualStdDev).toBeLessThan(loose.residualStdDev);
    expect(tight.rSquared).toBeGreaterThan(loose.rSquared);
  });

  it('is not thrown off by the order of the points', () => {
    const points = [
      { x: 3, y: 16 },
      { x: 1, y: 12 },
      { x: 2, y: 14 },
    ];
    const a = linearFit(points)!;
    const b = linearFit([...points].reverse())!;
    expect(a.slope).toBeCloseTo(b.slope, 12);
    expect(a.intercept).toBeCloseTo(b.intercept, 12);
  });
});

describe('predict and residual', () => {
  it('evaluates the fitted line', () => {
    const fit = linearFit([
      { x: 0, y: 0 },
      { x: 1, y: 3 },
    ])!;
    expect(predict(fit, 4)).toBeCloseTo(12, 10);
  });

  it('reports a point above the line as a positive residual', () => {
    const fit = linearFit([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ])!;
    expect(residual(fit, { x: 1, y: 2 })).toBeCloseTo(1, 10);
    expect(residual(fit, { x: 1, y: 0 })).toBeCloseTo(-1, 10);
  });
});

describe('quadraticFit', () => {
  it('recovers a known curve exactly', () => {
    const points = [0, 1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 90 + 0.05 * x + 0.02 * x * x }));
    const fit = quadraticFit(points)!;
    // At any x the fitted curve must match the generating one.
    for (const x of [0, 3, 6, 10]) {
      expect(predictQuadratic(fit, x)).toBeCloseTo(90 + 0.05 * x + 0.02 * x * x, 6);
    }
    expect(fit.c).toBeCloseTo(0.02, 6);
    expect(fit.residualStdDev).toBeCloseTo(0, 6);
  });

  it('finds no meaningful curvature in a straight line with noise', () => {
    const noise = [0.1, -0.08, 0.05, -0.12, 0.07, -0.03, 0.09, -0.06, 0.02, -0.04];
    const points = noise.map((e, x) => ({ x, y: 90 + 0.05 * x + e }));
    const fit = quadraticFit(points)!;
    expect(Math.abs(fit.c / fit.cStdError)).toBeLessThan(2);
  });

  it('refuses too few points or too few distinct x values', () => {
    expect(
      quadraticFit([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toBeNull();
    expect(
      quadraticFit([
        { x: 1, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 3 },
      ]),
    ).toBeNull();
  });
});
