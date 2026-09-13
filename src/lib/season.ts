/**
 * Which rule book a session was run under.
 *
 * 2026 replaced DRS with Overtake Mode, Boost Mode and Active Aero. Replays of
 * 2023-2025 must keep saying DRS, because that is what those cars had; a 2026
 * session must never mention it. Everything that names the overtaking aid, or that
 * loads coefficients fitted on one era, asks this module which era it is in rather
 * than checking a year itself.
 */

export type Regulations = 'drs' | 'overtake-mode';

export const OVERTAKE_MODE_FROM_YEAR = 2026;

/**
 * Seconds behind the car ahead, at the detection point, that unlock the aid. The
 * same one-second rule in both eras: DRS then, extra Overtake Mode energy now.
 */
export const ATTACK_RANGE_S = 1;

export function regulationsFor(year: number | null | undefined): Regulations {
  return (year ?? 0) >= OVERTAKE_MODE_FROM_YEAR ? 'overtake-mode' : 'drs';
}

/** The glossary entry that explains the one-second rule in this era. */
export function attackRangeTerm(regulations: Regulations): 'drs' | 'overtakeMode' {
  return regulations === 'drs' ? 'drs' : 'overtakeMode';
}
