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

export interface QuadraticFit {
  /** y at the mean x. */
  a: number;
  /** Slope at the mean x. */
  b: number;
  /** Curvature: half the change in slope per unit of x. Positive bends upward. */
  c: number;
  /** Standard error of `c`, for judging whether the bend is real. */
  cStdError: number;
  /** Mean of x; the fit is centred on it for numerical stability. */
  xMean: number;
  residualStdDev: number;
  n: number;
}

/**
 * Fits y = a + b(x - m) + c(x - m)^2 by least squares, centred on the mean x.
 *
 * Used to tell a tyre that is wearing steadily from one going off the cliff: the
 * cliff is lap times accelerating, which is a positive `c` that is large against
 * its own standard error. Returns null with fewer than four points (three would
 * fit exactly and leave no error to judge by) or when x takes fewer than three
 * distinct values.
 */
export function quadraticFit(points: Point[]): QuadraticFit | null {
  const n = points.length;
  if (n < 4) return null;
  if (new Set(points.map((p) => p.x)).size < 3) return null;

  const xMean = points.reduce((sum, p) => sum + p.x, 0) / n;

  // Normal equations for columns [1, u, u^2] with u = x - mean.
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let t0 = 0;
  let t1 = 0;
  let t2 = 0;
  for (const p of points) {
    const u = p.x - xMean;
    const u2 = u * u;
    s1 += u;
    s2 += u2;
    s3 += u2 * u;
    s4 += u2 * u2;
    t0 += p.y;
    t1 += u * p.y;
    t2 += u2 * p.y;
  }
  const m = [
    [n, s1, s2],
    [s1, s2, s3],
    [s2, s3, s4],
  ];
  const inverse = invert3(m);
  if (!inverse) return null;

  const a = inverse[0]![0]! * t0 + inverse[0]![1]! * t1 + inverse[0]![2]! * t2;
  const b = inverse[1]![0]! * t0 + inverse[1]![1]! * t1 + inverse[1]![2]! * t2;
  const c = inverse[2]![0]! * t0 + inverse[2]![1]! * t1 + inverse[2]![2]! * t2;

  let rss = 0;
  for (const p of points) {
    const u = p.x - xMean;
    const r = p.y - (a + b * u + c * u * u);
    rss += r * r;
  }
  const variance = n > 3 ? rss / (n - 3) : 0;

  return {
    a,
    b,
    c,
    cStdError: Math.sqrt(Math.max(0, variance * inverse[2]![2]!)),
    xMean,
    residualStdDev: Math.sqrt(variance),
    n,
  };
}

export function predictQuadratic(fit: QuadraticFit, x: number): number {
  const u = x - fit.xMean;
  return fit.a + fit.b * u + fit.c * u * u;
}

function invert3(m: number[][]): number[][] | null {
  const [a, b, c] = m[0]!;
  const [d, e, f] = m[1]!;
  const [g, h, i] = m[2]!;
  const A = e! * i! - f! * h!;
  const B = -(d! * i! - f! * g!);
  const C = d! * h! - e! * g!;
  const det = a! * A + b! * B + c! * C;
  if (Math.abs(det) < 1e-12) return null;
  return [
    [A / det, -(b! * i! - c! * h!) / det, (b! * f! - c! * e!) / det],
    [B / det, (a! * i! - c! * g!) / det, -(a! * f! - c! * d!) / det],
    [C / det, -(a! * h! - b! * g!) / det, (a! * e! - b! * d!) / det],
  ];
}
