/**
 * Whether Overtake Mode is switched on, from race control.
 *
 * 2026 race control sends "OVERTAKE ENABLED" and "OVERTAKE DISABLED", the way it
 * sent "DRS ENABLED" before: off for the first laps and behind a safety car, on
 * again once racing resumes. Verified against Monza 2026 (session 11361), which has
 * two of each. It is the only first-hand record of the mode in OpenF1 — car_data's
 * `drs` field is null in every 2026 row, and nothing replaced it.
 */
import type { RaceControl } from '@/lib/openf1/types';
import { ATTACK_RANGE_S } from '@/lib/season';

/**
 * The last switch at or before `timeMs`. Null when race control has sent neither
 * message yet, which is every session before 2026 and the start of every 2026 one.
 */
export function overtakeModeEnabledAt(raceControl: RaceControl[], timeMs: number): boolean | null {
  let state: boolean | null = null;
  let latest = -Infinity;
  for (const message of raceControl) {
    const at = Date.parse(message.date);
    if (Number.isNaN(at) || at > timeMs || at < latest) continue;
    const text = message.message.trim().toUpperCase();
    if (text === 'OVERTAKE ENABLED') state = true;
    else if (text === 'OVERTAKE DISABLED') state = false;
    else continue;
    latest = at;
  }
  return state;
}

/**
 * Whether a chaser will have Overtake Mode on the next lap: within a second of the
 * car ahead, with the mode switched on.
 *
 * An estimate. The rule is measured at a detection point, and OpenF1 has no timing
 * at detection points, so the interval now stands in for the interval there. When
 * race control has not said either way the answer is unknown, not no.
 */
export function overtakeModeNextLap(
  interval: number | null,
  enabled: boolean | null,
): boolean | null {
  if (interval == null || enabled == null) return null;
  return enabled && interval > 0 && interval <= ATTACK_RANGE_S;
}
