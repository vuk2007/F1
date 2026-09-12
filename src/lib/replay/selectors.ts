/**
 * Pure selectors: given a dataset and a replay time, return the session state.
 *
 * This module is the ONLY way the UI reads session data. Nothing here touches
 * React or the network, so the same functions serve a replayed session today and
 * a live-fed dataset later.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Driver, Gap, Lap, RaceControl, Stint, Weather } from '@/lib/openf1/types';
import { getReplayIndex, type CompletedLap, type RunningBests } from './index-build';
import { lastIndexAtOrBefore, valueAt, valuesUntil } from './timeline';

/** Float comparison tolerance for "is this the same lap/sector time". */
const EPSILON = 1e-6;

export type SectorColour = 'purple' | 'green' | 'yellow' | 'none';

export interface SectorTime {
  seconds: number | null;
  colour: SectorColour;
}

export interface ParsedGap {
  /** Numeric gap in seconds, or null when lapped/unknown. */
  seconds: number | null;
  /** Display string, e.g. "+1.234", "+1 LAP", or a dash when unknown. */
  label: string;
  lapped: boolean;
}

export interface TyreState {
  compound: string | null;
  /** Laps completed on this set, including laps carried over from a scrubbed set. */
  age: number | null;
  stintNumber: number | null;
}

export interface DriverTimingRow {
  driver: Driver;
  position: number | null;
  gapToLeader: ParsedGap;
  interval: ParsedGap;
  lapNumber: number | null;
  lastLap: number | null;
  bestLap: number | null;
  isPersonalBestLap: boolean;
  isSessionBestLap: boolean;
  sectors: [SectorTime, SectorTime, SectorTime];
  tyre: TyreState;
  pitCount: number;
  /** True while the driver's most recent lap is flagged as a pit-out lap. */
  isOutLap: boolean;
}

export type TrackStatus = 'green' | 'yellow' | 'sc' | 'vsc' | 'red' | 'chequered' | 'unknown';

const NO_GAP_LABEL = '—';

/* ------------------------------------------------------------------ *
 * Gaps
 * ------------------------------------------------------------------ */

/**
 * OpenF1 reports gaps as a number, or a string like "+1 LAP" once lapped, or
 * null before the first measurement. Narrow once, here, so no caller ends up
 * doing arithmetic on a string.
 */
export function parseGap(gap: Gap): ParsedGap {
  if (gap == null) return { seconds: null, label: NO_GAP_LABEL, lapped: false };
  if (typeof gap === 'number') {
    return {
      seconds: gap,
      label: gap === 0 ? NO_GAP_LABEL : `+${gap.toFixed(3)}`,
      lapped: false,
    };
  }
  const numeric = Number(gap);
  if (gap.trim() !== '' && !Number.isNaN(numeric)) {
    return { seconds: numeric, label: `+${numeric.toFixed(3)}`, lapped: false };
  }
  // A non-numeric string means a lap-based gap, e.g. "+1 LAP".
  return { seconds: null, label: gap, lapped: true };
}

/* ------------------------------------------------------------------ *
 * Sector colouring
 * ------------------------------------------------------------------ */

function colourFor(
  value: number | null,
  personalBest: number | null,
  sessionBest: number | null,
): SectorColour {
  if (value == null) return 'none';
  if (sessionBest != null && value <= sessionBest + EPSILON) return 'purple';
  if (personalBest != null && value <= personalBest + EPSILON) return 'green';
  return 'yellow';
}

/* ------------------------------------------------------------------ *
 * Stints
 * ------------------------------------------------------------------ */

/** The stint covering a given lap for a driver, if any. */
export function stintForLap(
  stints: Stint[],
  driverNumber: number,
  lapNumber: number,
): Stint | undefined {
  return stints.find(
    (s) => s.driver_number === driverNumber && lapNumber >= s.lap_start && lapNumber <= s.lap_end,
  );
}

/**
 * Laps completed on the current set of tyres.
 * tyre_age_at_start is the age when the stint began, so after finishing lap L
 * the set has (age_at_start + L - lap_start + 1) laps on it.
 */
export function tyreAgeOnLap(stint: Stint, lapNumber: number): number {
  return (stint.tyre_age_at_start ?? 0) + (lapNumber - stint.lap_start) + 1;
}

/* ------------------------------------------------------------------ *
 * Track status
 * ------------------------------------------------------------------ */

/**
 * Current track status, folded from the race control feed up to a given time.
 * Status is matched on message text because OpenF1 exposes no dedicated field.
 */
export function trackStatusAt(dataset: SessionDataset, timeMs: number): TrackStatus {
  const index = getReplayIndex(dataset);
  const messages = valuesUntil(index.raceControl, timeMs);

  let status: TrackStatus = 'unknown';
  for (const message of messages) {
    const text = message.message.toUpperCase();
    if (message.category === 'SafetyCar') {
      if (text.includes('VIRTUAL SAFETY CAR')) {
        if (text.includes('DEPLOYED')) status = 'vsc';
        else if (text.includes('ENDING') || text.includes('WITHDRAWN')) status = 'green';
      } else if (text.includes('SAFETY CAR')) {
        if (text.includes('DEPLOYED')) status = 'sc';
        else if (text.includes('IN THIS LAP') || text.includes('WITHDRAWN')) status = 'green';
      }
      continue;
    }
    if (message.flag && message.scope === 'Track') {
      if (message.flag === 'RED') status = 'red';
      else if (message.flag === 'CHEQUERED') status = 'chequered';
      else if (message.flag === 'GREEN' || message.flag === 'CLEAR') status = 'green';
      else if (message.flag === 'YELLOW' || message.flag === 'DOUBLE YELLOW') status = 'yellow';
    }
  }
  return status;
}

/** Race control messages up to a given time, newest first. */
export function raceControlFeed(dataset: SessionDataset, timeMs: number): RaceControl[] {
  const index = getReplayIndex(dataset);
  return valuesUntil(index.raceControl, timeMs).reverse();
}

/** Latest weather sample at or before a given time. */
export function weatherAt(dataset: SessionDataset, timeMs: number): Weather | undefined {
  return valueAt(getReplayIndex(dataset).weather, timeMs);
}

/* ------------------------------------------------------------------ *
 * Per-driver state
 * ------------------------------------------------------------------ */

/** The driver's most recently completed lap at a given time, with running bests. */
function lastCompletedLap(
  dataset: SessionDataset,
  driverNumber: number,
  timeMs: number,
): { lap: CompletedLap; bests: RunningBests } | undefined {
  const index = getReplayIndex(dataset);
  const laps = index.lapsByDriver.get(driverNumber);
  if (!laps) return undefined;
  const at = lastIndexAtOrBefore(laps, timeMs);
  if (at === -1) return undefined;
  const bests = index.personalBests.get(driverNumber)?.[at];
  if (!bests) return undefined;
  return { lap: laps[at]!.value, bests };
}

/** Session-wide running bests at a given time. */
export function sessionBestsAt(dataset: SessionDataset, timeMs: number): RunningBests {
  const index = getReplayIndex(dataset);
  const at = lastIndexAtOrBefore(index.allCompletedLaps, timeMs);
  return at === -1
    ? { sector1: null, sector2: null, sector3: null, lap: null }
    : index.sessionBests[at]!;
}

/**
 * The lap number a driver is currently on: the highest lap whose start time has
 * passed.
 */
export function currentLapNumber(
  dataset: SessionDataset,
  driverNumber: number,
  timeMs: number,
): number | null {
  const index = getReplayIndex(dataset);
  const starts = index.lapStartsByDriver.get(driverNumber);
  if (!starts) return null;
  const at = lastIndexAtOrBefore(starts, timeMs);
  if (at === -1) return null;
  return index.runningLapNumber.get(driverNumber)?.[at] ?? null;
}

/** Full timing row for one driver at a given time. */
export function driverStateAt(
  dataset: SessionDataset,
  driver: Driver,
  timeMs: number,
): DriverTimingRow {
  const index = getReplayIndex(dataset);
  const number = driver.driver_number;

  const position = valueAt(index.positionsByDriver.get(number) ?? [], timeMs)?.position ?? null;
  const intervalRow = valueAt(index.intervalsByDriver.get(number) ?? [], timeMs);

  const completed = lastCompletedLap(dataset, number, timeMs);
  const sessionBests = sessionBestsAt(dataset, timeMs);
  const lap: Lap | undefined = completed?.lap.lap;
  const personal = completed?.bests;

  const sectors: [SectorTime, SectorTime, SectorTime] = [
    {
      seconds: lap?.duration_sector_1 ?? null,
      colour: colourFor(
        lap?.duration_sector_1 ?? null,
        personal?.sector1 ?? null,
        sessionBests.sector1,
      ),
    },
    {
      seconds: lap?.duration_sector_2 ?? null,
      colour: colourFor(
        lap?.duration_sector_2 ?? null,
        personal?.sector2 ?? null,
        sessionBests.sector2,
      ),
    },
    {
      seconds: lap?.duration_sector_3 ?? null,
      colour: colourFor(
        lap?.duration_sector_3 ?? null,
        personal?.sector3 ?? null,
        sessionBests.sector3,
      ),
    },
  ];

  const lapNumber = currentLapNumber(dataset, number, timeMs);
  const stint = lapNumber == null ? undefined : stintForLap(dataset.stints, number, lapNumber);

  const pitTimes = index.pitsByDriver.get(number) ?? [];
  const pitCount = lastIndexAtOrBefore(pitTimes, timeMs) + 1;

  const lastLap = lap?.lap_duration ?? null;
  const bestLap = personal?.lap ?? null;

  return {
    driver,
    position,
    gapToLeader: parseGap(intervalRow?.gap_to_leader ?? null),
    interval: parseGap(intervalRow?.interval ?? null),
    lapNumber,
    lastLap,
    bestLap,
    isPersonalBestLap: lastLap != null && bestLap != null && lastLap <= bestLap + EPSILON,
    isSessionBestLap:
      lastLap != null && sessionBests.lap != null && lastLap <= sessionBests.lap + EPSILON,
    sectors,
    tyre: {
      compound: stint?.compound ?? null,
      age: stint && lapNumber != null ? tyreAgeOnLap(stint, lapNumber) : null,
      stintNumber: stint?.stint_number ?? null,
    },
    pitCount,
    isOutLap: lap?.is_pit_out_lap ?? false,
  };
}

/**
 * The timing table: every driver at a given time, ordered by track position.
 * Drivers with no position yet sort to the bottom by number, so the table does
 * not reshuffle arbitrarily before the session starts.
 */
export function timingTableAt(dataset: SessionDataset, timeMs: number): DriverTimingRow[] {
  const rows = dataset.drivers.map((driver) => driverStateAt(dataset, driver, timeMs));
  return rows.sort((a, b) => {
    if (a.position == null && b.position == null) {
      return a.driver.driver_number - b.driver.driver_number;
    }
    if (a.position == null) return 1;
    if (b.position == null) return -1;
    return a.position - b.position;
  });
}

/** Leader's lap number, shown in the UI as the current lap. */
export function leaderLapAt(dataset: SessionDataset, timeMs: number): number | null {
  const index = getReplayIndex(dataset);
  const at = lastIndexAtOrBefore(index.allCompletedLaps, timeMs);
  if (at === -1) return null;
  return index.runningLeaderLap[at] ?? null;
}
