/**
 * Card 3 — pit window: when a driver should stop, and where they would come out.
 *
 * **The optimal lap.** With wear rising in a straight line, the time lost to worn
 * tyres over a race is smallest when the stints are the same length — counting the
 * laps already on the current set. So with `m` more stops, the remaining distance
 * plus the current tyre age is split into `m + 1` equal stints, and the next stop
 * falls where the current stint reaches that length. The number of stops is the
 * one with the lowest total: tyre wear plus `m` pit losses. A dry race needs at
 * least one stop, so a driver who has not stopped is never told to run to the end.
 *
 * **The range.** Stopping `d` laps away from the optimum costs roughly `wear · d²`
 * extra. The range is every lap within one second of the best, which is
 * `±√(1 / wear)`: wide when the tyres barely wear and it hardly matters, narrow when
 * they wear fast.
 *
 * **Rejoining.** A stop now adds the pit loss to the driver's gap to the leader.
 * They come out behind every car whose gap is smaller than that, in front of the
 * rest — assuming nobody else stops on the same lap.
 *
 * **Pit loss.** The circuit table, until this session has shown at least two green-
 * flag stops; then the median loss those stops actually cost. It is measured from
 * lap times rather than taken from the pit-lane duration, because the lane time
 * alone is not the loss — the driver would have spent part of it covering that
 * stretch at racing speed anyway, so the lane time overstates what a stop costs.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import { cautionPeriods, overlapsCaution } from '../caution';
import { DEFAULT_PIT_LOSS_SECONDS, PIT_LOSS_BY_CIRCUIT } from '../pit-loss';
import { cleanOnly, predictionLaps, type IntervalLookup } from './clean-laps';
import type { Confidence } from './confidence';

/** Extra time, in seconds, a stop may cost versus the optimum and still be "in the window". */
export const WINDOW_TOLERANCE_S = 1;
export const MAX_REMAINING_STOPS = 2;
/** Green-flag stops needed before the session's own figure replaces the table. */
export const OBSERVED_STOPS_NEEDED = 2;

export interface StopPlan {
  /** Further stops in the plan. */
  stops: number;
  /** In-lap of each further stop. */
  stopLaps: number[];
  /** Seconds lost to tyre wear plus pit stops over the rest of the race. */
  cost: number;
}

export interface OptimalStopInput {
  currentLap: number;
  totalLaps: number;
  tyreAge: number;
  /** Wear of the current set, s/lap. */
  slope: number;
  pitLoss: number;
  /** Stops already made; a dry race needs at least one. */
  stopsMade: number;
}

/** Seconds of wear over a stint of `length` laps starting on a set `startAge` laps old. */
function wearCost(slope: number, startAge: number, length: number): number {
  // Sum of ages startAge+1 .. startAge+length.
  return slope * (length * startAge + (length * (length + 1)) / 2);
}

/** The equal-stint plan for a fixed number of further stops. */
export function planWithStops(input: OptimalStopInput, stops: number): StopPlan {
  const { currentLap, totalLaps, tyreAge, slope, pitLoss } = input;
  const remaining = Math.max(0, totalLaps - currentLap);
  if (stops === 0) return { stops, stopLaps: [], cost: wearCost(slope, tyreAge, remaining) };

  const stintLength = (tyreAge + remaining) / (stops + 1);
  const firstStint = Math.min(remaining - stops, Math.max(1, Math.round(stintLength - tyreAge)));
  const after = remaining - firstStint;
  const lengths = Array.from(
    { length: stops },
    (_, i) => Math.floor(after / stops) + (i < after % stops ? 1 : 0),
  );

  const stopLaps: number[] = [];
  let lap = currentLap + firstStint;
  let cost = wearCost(slope, tyreAge, firstStint) + stops * pitLoss;
  for (const [i, length] of lengths.entries()) {
    stopLaps.push(lap);
    cost += wearCost(slope, 0, length);
    lap += i < lengths.length - 1 ? length : 0;
  }
  return { stops, stopLaps, cost };
}

/** The best plan, or null when there is no wear to plan around. */
export function optimalStops(input: OptimalStopInput): StopPlan | null {
  const remaining = input.totalLaps - input.currentLap;
  if (!(input.slope > 0) || remaining < 2) return null;
  const minimum = input.stopsMade === 0 ? 1 : 0;
  let best: StopPlan | null = null;
  for (let stops = minimum; stops <= MAX_REMAINING_STOPS; stops += 1) {
    if (stops > remaining - 1) break;
    const plan = planWithStops(input, stops);
    if (!best || plan.cost < best.cost) best = plan;
  }
  return best;
}

/** Half-width of the window: laps either side of the optimum within one second of it. */
export function windowHalfWidth(slope: number): number {
  return Math.min(8, Math.max(1, Math.round(Math.sqrt(WINDOW_TOLERANCE_S / slope))));
}

export interface Rejoin {
  /** Position after the stop. */
  position: number;
  /** Car directly ahead after the stop, by number; null when rejoining in the lead. */
  behind: number | null;
  /** Seconds behind that car. */
  gapToCarAhead: number | null;
  currentPosition: number;
}

/**
 * Where a driver comes out if they stop now.
 *
 * `gaps` is every car's gap to the leader at this moment; lapped cars (null gap)
 * are ignored, since a stop does not put anyone behind a car a lap down.
 */
export function rejoinIfPitNow(
  gaps: { driverNumber: number; gapToLeader: number | null }[],
  driverNumber: number,
  pitLoss: number,
): Rejoin | null {
  const timed = gaps.filter(
    (g): g is { driverNumber: number; gapToLeader: number } => g.gapToLeader != null,
  );
  const me = timed.find((g) => g.driverNumber === driverNumber);
  if (!me) return null;

  const others = timed
    .filter((g) => g.driverNumber !== driverNumber)
    .sort((a, b) => a.gapToLeader - b.gapToLeader);
  const newGap = me.gapToLeader + pitLoss;
  const ahead = others.filter((g) => g.gapToLeader < newGap);
  const carAhead = ahead[ahead.length - 1];

  return {
    position: ahead.length + 1,
    behind: carAhead?.driverNumber ?? null,
    gapToCarAhead: carAhead ? Number((newGap - carAhead.gapToLeader).toFixed(3)) : null,
    currentPosition: others.filter((g) => g.gapToLeader < me.gapToLeader).length + 1,
  };
}

export interface LivePitLoss {
  seconds: number;
  source: 'observed' | 'circuit-table' | 'default';
  /** Green-flag stops measured so far. */
  stopsMeasured: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * The pit loss to use now: this session's own measurement once there is enough of
 * it, the circuit table before that.
 *
 * One stop's loss is its in-lap plus out-lap, less two of that driver's normal
 * laps from around the stop. Stops under a caution are skipped — the field is
 * slow then, so they would understate a green-flag stop.
 */
export function livePitLoss(snapshot: SessionDataset, intervals?: IntervalLookup): LivePitLoss {
  const tabled = PIT_LOSS_BY_CIRCUIT[snapshot.session.circuit_short_name];
  const fallback: LivePitLoss = {
    seconds: tabled ?? DEFAULT_PIT_LOSS_SECONDS,
    source: tabled != null ? 'circuit-table' : 'default',
    stopsMeasured: 0,
  };

  const periods = cautionPeriods(snapshot.raceControl);
  const losses: number[] = [];

  for (const pit of snapshot.pits) {
    const pitMs = Date.parse(pit.date);
    if (Number.isNaN(pitMs) || overlapsCaution(periods, pitMs - 120_000, pitMs + 120_000)) continue;

    const laps = snapshot.laps.filter((lap) => lap.driver_number === pit.driver_number);
    const inLap = laps.find((lap) => lap.lap_number === pit.lap_number);
    const outLap = laps.find((lap) => lap.lap_number === pit.lap_number + 1);
    if (inLap?.lap_duration == null || outLap?.lap_duration == null) continue;

    const nearby = cleanOnly(
      predictionLaps(snapshot, pit.driver_number, { periods, intervals }),
    ).filter((lap) => Math.abs(lap.lapNumber - pit.lap_number) <= 6);
    const normal = median(nearby.map((lap) => lap.lapTime));
    if (normal == null || nearby.length < 3) continue;

    const loss = inLap.lap_duration + outLap.lap_duration - 2 * normal;
    // A stop that "cost" under 10 s or over 60 s was not a normal stop.
    if (loss > 10 && loss < 60) losses.push(loss);
  }

  if (losses.length < OBSERVED_STOPS_NEEDED) return { ...fallback, stopsMeasured: losses.length };
  return {
    seconds: Number(median(losses)!.toFixed(1)),
    source: 'observed',
    stopsMeasured: losses.length,
  };
}

export interface PitForecast {
  plan: StopPlan | null;
  /** The next stop's best lap and window, when one is planned. */
  next: { optimalLap: number; from: number; to: number } | null;
  confidence: Confidence;
  enough: boolean;
}

export function pitForecast(
  input: OptimalStopInput & { cleanLaps: number; confidence: Confidence },
): PitForecast {
  if (input.cleanLaps < 4) return { plan: null, next: null, confidence: 'low', enough: false };
  const plan = optimalStops(input);
  const first = plan?.stopLaps[0];
  if (!plan || first == null)
    return { plan, next: null, confidence: input.confidence, enough: plan != null };

  const width = windowHalfWidth(input.slope);
  return {
    plan,
    next: {
      optimalLap: first,
      from: Math.max(input.currentLap, first - width),
      to: Math.min(input.totalLaps - 1, first + width),
    },
    confidence: input.confidence,
    enough: true,
  };
}
