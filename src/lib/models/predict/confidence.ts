/**
 * The Low / Medium / High label every prediction carries.
 *
 * Two things decide it, as the brief asks: how much data the estimate rests on,
 * and how well that data fits the model. Many laps that scatter wildly are not
 * trustworthy, and a perfect fit through four laps is not either — four points
 * almost always look tidy. Sample size sets the ceiling; scatter can only lower it.
 */
export type Confidence = 'low' | 'medium' | 'high';

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/** Lap-time scatter under which a stint counts as clean running, in seconds. */
export const TIGHT_RESIDUAL_S = 0.35;
export const LOOSE_RESIDUAL_S = 0.7;

export function confidenceFrom(samples: number, residualStdDev: number | null): Confidence {
  const ceiling: Confidence = samples >= 10 ? 'high' : samples >= 6 ? 'medium' : 'low';
  if (residualStdDev == null || residualStdDev > LOOSE_RESIDUAL_S) return 'low';
  if (residualStdDev > TIGHT_RESIDUAL_S) return ceiling === 'high' ? 'medium' : ceiling;
  return ceiling;
}

/** A prediction built from several estimates is only as sure as the least sure one. */
export function weakest(...levels: Confidence[]): Confidence {
  if (levels.length === 0) return 'low';
  return levels.reduce((worst, level) => (RANK[level] < RANK[worst] ? level : worst));
}
