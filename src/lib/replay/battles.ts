/**
 * Selectors for the newcomer view: the closest fights on track, and who is in the
 * pit lane right now.
 *
 * Both are views of the session at a moment, like the timing table, so they live
 * with the other selectors and read the same memoised replay index.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import { getReplayIndex } from './index-build';
import { parseGap, type DriverTimingRow } from './selectors';
import { valueAt } from './timeline';

export type GapTrend = 'closing' | 'stable' | 'opening' | 'unknown';

export interface KeyBattle {
  ahead: DriverTimingRow;
  chaser: DriverTimingRow;
  /** Position being fought over: the place the car ahead holds. */
  position: number;
  /** Seconds between them now. */
  gap: number;
  /** Change in that gap over the trend window. Negative means closing. Null if unknown. */
  change: number | null;
  trend: GapTrend;
}

/** Laps the trend is measured over. */
export const TREND_LAPS = 3;

/**
 * How much the gap has to move over those laps to count as a trend: a tenth a lap.
 * Smaller changes are lap-to-lap noise from traffic and timing-loop placement.
 */
export const TREND_THRESHOLD_S = 0.3;

/** Beyond this the cars are not really fighting. */
export const BATTLE_MAX_GAP_S = 3;

/**
 * A change bigger than this over three laps is not a trend. On track a car rarely
 * gains more than a second a lap; a jump like the -7.7 s seen at Monza between ALB
 * and ANT comes from a pit stop or a different car having been ahead, and calling
 * it "closing" would be exactly the confident nonsense this view must not show.
 */
export const MAX_TREND_CHANGE_S = 3;

export function gapTrend(change: number | null): GapTrend {
  if (change == null || Math.abs(change) > MAX_TREND_CHANGE_S) return 'unknown';
  if (change <= -TREND_THRESHOLD_S) return 'closing';
  if (change >= TREND_THRESHOLD_S) return 'opening';
  return 'stable';
}

/**
 * The chaser's interval when they started the lap `TREND_LAPS` ago.
 *
 * Anchored to the chaser's own lap starts rather than to "three minutes ago", so a
 * slow lap under a yellow flag does not stretch or shrink the window.
 */
function intervalLapsAgo(
  dataset: SessionDataset,
  driverNumber: number,
  currentLap: number,
  timeMs: number,
): number | null {
  const target = currentLap - TREND_LAPS;
  if (target < 1) return null;

  const index = getReplayIndex(dataset);
  const start = (index.lapStartsByDriver.get(driverNumber) ?? []).find(
    (entry) => entry.value.lap_number === target && entry.t <= timeMs,
  );
  if (!start) return null;

  const then = valueAt(index.intervalsByDriver.get(driverNumber) ?? [], start.t);
  return then ? parseGap(then.interval).seconds : null;
}

/**
 * The closest pairs of consecutive cars, closest first.
 *
 * Lapped gaps and a leader's zero interval are skipped: neither is a fight. A trend
 * compares against the interval to whoever was ahead three laps ago, which after an
 * overtake is a different car — the arrow then says the new pair is closing or
 * opening from where the chaser was, which is still what a viewer wants to know.
 */
export function keyBattles(
  dataset: SessionDataset,
  rows: DriverTimingRow[],
  timeMs: number,
  count = 3,
): KeyBattle[] {
  const battles: KeyBattle[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const ahead = rows[i - 1]!;
    const chaser = rows[i]!;
    if (ahead.position == null || chaser.position == null) continue;

    const gap = chaser.interval.seconds;
    if (gap == null || chaser.interval.lapped || gap <= 0 || gap > BATTLE_MAX_GAP_S) continue;

    const then =
      chaser.lapNumber == null
        ? null
        : intervalLapsAgo(dataset, chaser.driver.driver_number, chaser.lapNumber, timeMs);
    const measured = then == null ? null : Number((gap - then).toFixed(3));
    // An implausible change is dropped rather than shown next to "too early to tell".
    const change = measured != null && Math.abs(measured) > MAX_TREND_CHANGE_S ? null : measured;

    battles.push({
      ahead,
      chaser,
      position: ahead.position,
      gap,
      change,
      trend: gapTrend(change),
    });
  }

  return battles.sort((a, b) => a.gap - b.gap).slice(0, count);
}

/** Used when OpenF1 has not recorded a pit lane time for a stop. */
const DEFAULT_LANE_SECONDS = 25;

/**
 * Drivers currently between pit entry and pit exit, by number.
 *
 * OpenF1's pit `date` is taken as the moment of pit entry and `lane_duration` as
 * the time to the exit line.
 */
export function driversInPitLane(dataset: SessionDataset, timeMs: number): number[] {
  const index = getReplayIndex(dataset);
  const inLane: number[] = [];

  for (const [driverNumber, stops] of index.pitsByDriver) {
    for (const stop of stops) {
      const laneMs = (stop.value.lane_duration ?? DEFAULT_LANE_SECONDS) * 1000;
      if (stop.t <= timeMs && timeMs < stop.t + laneMs) {
        inLane.push(driverNumber);
        break;
      }
    }
  }

  return inLane.sort((a, b) => a - b);
}
