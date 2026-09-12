/**
 * Ordinary least-squares line fitting.
 *
 * Shared by the tyre degradation model and the undercut projection. Pure maths,
 * no F1 concepts — kept separate so it can be tested on its own.
 */

export interface Point {
  x: number;
  y: number;
}

export interface LinearFit {
  /** Change in y per unit of x. */
  slope: number;
  /** y where x = 0. */
  intercept: number;
  /** Fraction of variance explained, 0..1. NaN-free: 0 when y has no variance. */
  rSquared: number;
  /** Standard deviation of the residuals, in units of y. */
  residualStdDev: number;
  /** Number of points used. */
  n: number;
}

/**
 * Fits y = slope*x + intercept.
 * Returns null when there are fewer than two points, or when every x is the same
 * (a vertical line has no slope).
 */
export function linearFit(points: Point[]): LinearFit | null {
  const n = points.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    sxx += dx * dx;
    sxy += dx * (p.y - meanY);
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  let residualSumSquares = 0;
  let totalSumSquares = 0;
  for (const p of points) {
    const residual = p.y - (slope * p.x + intercept);
    residualSumSquares += residual * residual;
    const dy = p.y - meanY;
    totalSumSquares += dy * dy;
  }

  return {
    slope,
    intercept,
    // With n === 2 the line passes through both points exactly; call that 1.
    rSquared:
      totalSumSquares === 0
        ? residualSumSquares === 0
          ? 1
          : 0
        : 1 - residualSumSquares / totalSumSquares,
    // n-2 degrees of freedom for a fitted line; guard the n === 2 case.
    residualStdDev: n > 2 ? Math.sqrt(residualSumSquares / (n - 2)) : 0,
    n,
  };
}

export function predict(fit: LinearFit, x: number): number {
  return fit.slope * x + fit.intercept;
}

/** Residual of one point against a fit, positive when the point is above the line. */
export function residual(fit: LinearFit, point: Point): number {
  return point.y - predict(fit, point.x);
}
