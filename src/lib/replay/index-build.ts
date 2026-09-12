/**
 * Builds the memoized replay index for a session dataset.
 *
 * Two things are precomputed here:
 *  1. Per-driver, time-sorted arrays for positions/intervals/laps/pits.
 *  2. Running "best so far" prefix arrays for sector and lap times, both
 *     session-wide and per driver. This is what makes purple/green/yellow
 *     colouring correct *at replay time* rather than using end-of-session bests.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Interval, Lap, Pit, Position, RaceControl, Weather } from '@/lib/openf1/types';
import { groupBy, toTimed, type Timed } from './timeline';

/** A lap plus the moment it was completed (date_start + lap_duration). */
export interface CompletedLap {
  lap: Lap;
  completedMs: number;
}

/** Best times observed up to and including one completed lap. */
export interface RunningBests {
  sector1: number | null;
  sector2: number | null;
  sector3: number | null;
  lap: number | null;
}

const EMPTY_BESTS: RunningBests = { sector1: null, sector2: null, sector3: null, lap: null };

export interface ReplayIndex {
  positionsByDriver: Map<number, Timed<Position>[]>;
  intervalsByDriver: Map<number, Timed<Interval>[]>;
  pitsByDriver: Map<number, Timed<Pit>[]>;
  /** Completed laps per driver, sorted by completion time. */
  lapsByDriver: Map<number, Timed<CompletedLap>[]>;
  /** Running personal bests, index-aligned with `lapsByDriver`. */
  personalBests: Map<number, RunningBests[]>;
  /** All completed laps across all drivers, sorted by completion time. */
  allCompletedLaps: Timed<CompletedLap>[];
  /** Running session bests, index-aligned with `allCompletedLaps`. */
  sessionBests: RunningBests[];
  weather: Timed<Weather>[];
  raceControl: Timed<RaceControl>[];
  driverNumbers: number[];
}

function minOrNull(current: number | null, candidate: number | null | undefined): number | null {
  if (candidate == null || candidate <= 0) return current;
  return current == null ? candidate : Math.min(current, candidate);
}

function accumulate(previous: RunningBests, lap: Lap): RunningBests {
  return {
    sector1: minOrNull(previous.sector1, lap.duration_sector_1),
    sector2: minOrNull(previous.sector2, lap.duration_sector_2),
    sector3: minOrNull(previous.sector3, lap.duration_sector_3),
    lap: minOrNull(previous.lap, lap.lap_duration),
  };
}

/**
 * A lap counts as completed once its start time plus its duration has passed.
 * Laps without a start time or duration (in progress, or missing data) are
 * excluded — they have no meaningful completion moment.
 */
function toCompletedLaps(laps: Lap[]): Timed<CompletedLap>[] {
  const timed: Timed<CompletedLap>[] = [];
  for (const lap of laps) {
    if (!lap.date_start || lap.lap_duration == null) continue;
    const startMs = Date.parse(lap.date_start);
    if (Number.isNaN(startMs)) continue;
    const completedMs = startMs + lap.lap_duration * 1000;
    timed.push({ t: completedMs, value: { lap, completedMs } });
  }
  timed.sort((a, b) => a.t - b.t);
  return timed;
}

function runningBests(laps: Timed<CompletedLap>[]): RunningBests[] {
  const result: RunningBests[] = [];
  let current = EMPTY_BESTS;
  for (const entry of laps) {
    current = accumulate(current, entry.value.lap);
    result.push(current);
  }
  return result;
}

export function buildReplayIndex(dataset: SessionDataset): ReplayIndex {
  const positionsByDriver = new Map<number, Timed<Position>[]>();
  for (const [driver, rows] of groupBy(dataset.positions, (p) => p.driver_number)) {
    positionsByDriver.set(
      driver,
      toTimed(rows, (r) => r.date),
    );
  }

  const intervalsByDriver = new Map<number, Timed<Interval>[]>();
  for (const [driver, rows] of groupBy(dataset.intervals, (i) => i.driver_number)) {
    intervalsByDriver.set(
      driver,
      toTimed(rows, (r) => r.date),
    );
  }

  const pitsByDriver = new Map<number, Timed<Pit>[]>();
  for (const [driver, rows] of groupBy(dataset.pits, (p) => p.driver_number)) {
    pitsByDriver.set(
      driver,
      toTimed(rows, (r) => r.date),
    );
  }

  const lapsByDriver = new Map<number, Timed<CompletedLap>[]>();
  const personalBests = new Map<number, RunningBests[]>();
  for (const [driver, rows] of groupBy(dataset.laps, (l) => l.driver_number)) {
    const completed = toCompletedLaps(rows);
    lapsByDriver.set(driver, completed);
    personalBests.set(driver, runningBests(completed));
  }

  const allCompletedLaps = toCompletedLaps(dataset.laps);

  return {
    positionsByDriver,
    intervalsByDriver,
    pitsByDriver,
    lapsByDriver,
    personalBests,
    allCompletedLaps,
    sessionBests: runningBests(allCompletedLaps),
    weather: toTimed(dataset.weather, (w) => w.date),
    raceControl: toTimed(dataset.raceControl, (r) => r.date),
    driverNumbers: dataset.drivers.map((d) => d.driver_number),
  };
}

/**
 * Index cache. Keyed by dataset identity, so a dataset is indexed once and the
 * entry is collected with it.
 */
const cache = new WeakMap<SessionDataset, ReplayIndex>();

export function getReplayIndex(dataset: SessionDataset): ReplayIndex {
  let index = cache.get(dataset);
  if (!index) {
    index = buildReplayIndex(dataset);
    cache.set(dataset, index);
  }
  return index;
}

export { EMPTY_BESTS };
