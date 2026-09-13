/**
 * Card 5 — overtake chance: a rough probability that the chasing car is ahead
 * within five laps.
 *
 * A logistic combination of the things that decide an on-track pass:
 *
 *  - **gap**: seconds between the cars now
 *  - **pace delta**: how much quicker the chaser has been over the last three laps
 *  - **tyre age delta**: how many laps fresher the chaser's tyres are
 *  - **compound delta**: how many steps softer the chaser's compound is (soft 1,
 *    medium 2, hard 3)
 *
 * and from 2026, two more, because Overtake Mode energy can be saved across laps:
 *
 *  - **in range last lap**: whether the chaser started the previous lap within one
 *    second, earning Overtake Mode
 *  - **range streak**: how many laps in a row, up to five, it has been in range
 *
 * The weights are not chosen by hand. `pnpm calibrate` builds every such situation
 * from dry races — two cars adjacent on the road within three seconds, at the start
 * of a lap — labels whether the chaser was ahead at the start of any of the next
 * five laps, and fits the weights to those outcomes. Situations where either car
 * stopped, or a safety car ran, inside the window are left out: those change the
 * order without an overtake, and the card is about racing.
 *
 * The eras are never mixed. 2024-2025 races fit the four-feature model used for
 * replays up to 2025; `pnpm calibrate --season 2026` fits the six-feature model on
 * 2026 races alone, where a pass also has to appear in OpenF1's `/overtakes` feed
 * between the same two cars. The races the tests score are held out of both fits.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Overtake } from '@/lib/openf1/types';
import { toTimed, valueAt } from '@/lib/replay/timeline';
import { ATTACK_RANGE_S } from '@/lib/season';
import { cautionPeriods, overlapsCaution } from '../caution';
import { IntervalLookup } from './clean-laps';
import { predictProbability, type LogisticModel } from './logistic';

export const OVERTAKE_HORIZON_LAPS = 5;
/** Cars further apart than this are not treated as fighting. */
export const OVERTAKE_MAX_GAP_S = 3;
/** Longest run of laps in range the streak feature counts. */
export const MAX_RANGE_STREAK = 5;

export const FEATURE_NAMES = ['gap', 'paceDelta', 'tyreAgeDelta', 'compoundDelta'] as const;
export const FEATURE_NAMES_2026 = [...FEATURE_NAMES, 'inRangeLastLap', 'rangeStreak'] as const;

export interface OvertakeFeatures {
  gap: number;
  /** Seconds a lap the chaser has been quicker. */
  paceDelta: number;
  /** Laps fresher the chaser's tyres are. */
  tyreAgeDelta: number;
  /** Steps softer the chaser's compound is. */
  compoundDelta: number;
  /** 1 when the chaser started the previous lap within one second. */
  inRangeLastLap?: number;
  /** Consecutive laps, up to five, the chaser started within one second. */
  rangeStreak?: number;
}

/** The features in the order a model was fitted with; a feature it lacks counts as 0. */
export function featureVector(
  f: OvertakeFeatures,
  names: readonly string[] = FEATURE_NAMES,
): number[] {
  const values = f as unknown as Record<string, number | undefined>;
  return names.map((name) => values[name] ?? 0);
}

/** Soft 1, medium 2, hard 3; wet-weather tyres are outside what the model knows. */
export function compoundStep(compound: string | null | undefined): number | null {
  switch ((compound ?? '').toUpperCase()) {
    case 'SOFT':
      return 1;
    case 'MEDIUM':
      return 2;
    case 'HARD':
      return 3;
    default:
      return null;
  }
}

export function overtakeChance(features: OvertakeFeatures, model: LogisticModel): number {
  return predictProbability(model, featureVector(features, model.featureNames));
}

/**
 * Laps in a row, counting back from the lap before `lap`, that the chaser started
 * within the one-second attack range. `intervalAtLapStart` gives the chaser's
 * interval at the start of a lap, or null when unknown — which ends the streak.
 */
export function rangeStreak(
  intervalAtLapStart: (lap: number) => number | null,
  lap: number,
): number {
  let streak = 0;
  for (let k = 1; k <= MAX_RANGE_STREAK; k += 1) {
    const interval = intervalAtLapStart(lap - k);
    if (interval == null || interval <= 0 || interval > ATTACK_RANGE_S) break;
    streak += 1;
  }
  return streak;
}

export interface OvertakeSample {
  features: OvertakeFeatures;
  /** 1 when the chaser was ahead within the horizon. */
  label: 0 | 1;
  lap: number;
  ahead: number;
  chaser: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Every fight in a finished race, with what happened next.
 *
 * Features use only laps before the lap in question and the label only the laps
 * after it, so a sample never contains its own answer.
 *
 * With `overtakes`, a pass must also appear in that feed — the chaser recorded
 * overtaking that same car inside the window. On its own the feed counts every
 * position exchange, including the start and restarts (Monza 2026: 334 rows, over a
 * hundred in the first four minutes), so it confirms the position label rather than
 * replacing it.
 */
export function overtakeSamples(
  dataset: SessionDataset,
  options: { overtakes?: Overtake[] } = {},
): OvertakeSample[] {
  const periods = cautionPeriods(dataset.raceControl);
  const intervals = new IntervalLookup(dataset.intervals);

  const lapStart = new Map<string, number>();
  const lapTime = new Map<string, number>();
  const leaderStart = new Map<number, number>();
  let lastLap = 0;
  for (const lap of dataset.laps) {
    if (!lap.date_start) continue;
    const ms = Date.parse(lap.date_start);
    if (Number.isNaN(ms)) continue;
    lapStart.set(`${lap.driver_number}:${lap.lap_number}`, ms);
    if (lap.lap_duration != null && !lap.is_pit_out_lap)
      lapTime.set(`${lap.driver_number}:${lap.lap_number}`, lap.lap_duration);
    leaderStart.set(lap.lap_number, Math.min(leaderStart.get(lap.lap_number) ?? Infinity, ms));
    lastLap = Math.max(lastLap, lap.lap_number);
  }

  const positions = new Map<
    number,
    ReturnType<typeof toTimed<SessionDataset['positions'][number]>>
  >();
  for (const driver of new Set(dataset.positions.map((p) => p.driver_number))) {
    positions.set(
      driver,
      toTimed(
        dataset.positions.filter((p) => p.driver_number === driver),
        (p) => p.date,
      ),
    );
  }
  const positionAt = (driver: number, ms: number) =>
    valueAt(positions.get(driver) ?? [], ms)?.position ?? null;

  const pitLaps = new Map<number, number[]>();
  for (const pit of dataset.pits)
    pitLaps.set(pit.driver_number, [...(pitLaps.get(pit.driver_number) ?? []), pit.lap_number]);
  const pitsNear = (driver: number, from: number, to: number) =>
    (pitLaps.get(driver) ?? []).some((lap) => lap >= from && lap <= to);

  const stintAt = (driver: number, lap: number) =>
    dataset.stints.find(
      (s) => s.driver_number === driver && lap >= s.lap_start && lap <= s.lap_end,
    );

  const confirmedPass = (chaser: number, ahead: number, fromMs: number, toMs: number) =>
    (options.overtakes ?? []).some((o) => {
      const at = Date.parse(o.date);
      return (
        o.overtaking_driver_number === chaser &&
        o.overtaken_driver_number === ahead &&
        at >= fromMs &&
        at <= toMs
      );
    });

  const samples: OvertakeSample[] = [];
  const drivers = [...positions.keys()];

  for (let lap = 4; lap <= lastLap - OVERTAKE_HORIZON_LAPS; lap += 1) {
    const now = leaderStart.get(lap);
    const end = leaderStart.get(lap + OVERTAKE_HORIZON_LAPS);
    if (now == null || end == null) continue;
    if (overlapsCaution(periods, leaderStart.get(lap - 3) ?? now, end)) continue;

    const order = drivers
      .map((driver) => ({ driver, position: positionAt(driver, now) }))
      .filter((d): d is { driver: number; position: number } => d.position != null)
      .sort((a, b) => a.position - b.position);

    for (let i = 1; i < order.length; i += 1) {
      const ahead = order[i - 1]!.driver;
      const chaser = order[i]!.driver;
      const chaserStart = lapStart.get(`${chaser}:${lap}`);
      if (chaserStart == null) continue;

      const gap = intervals.intervalAt(chaser, chaserStart);
      if (gap == null || gap > OVERTAKE_MAX_GAP_S) continue;
      if (
        pitsNear(ahead, lap - 3, lap + OVERTAKE_HORIZON_LAPS) ||
        pitsNear(chaser, lap - 3, lap + OVERTAKE_HORIZON_LAPS)
      )
        continue;

      const recent = (driver: number) =>
        median(
          [1, 2, 3]
            .map((k) => lapTime.get(`${driver}:${lap - k}`))
            .filter((t): t is number => t != null),
        );
      const aheadPace = recent(ahead);
      const chaserPace = recent(chaser);
      const aheadStint = stintAt(ahead, lap);
      const chaserStint = stintAt(chaser, lap);
      const aheadStep = compoundStep(aheadStint?.compound);
      const chaserStep = compoundStep(chaserStint?.compound);
      if (
        aheadPace == null ||
        chaserPace == null ||
        !aheadStint ||
        !chaserStint ||
        aheadStep == null ||
        chaserStep == null
      )
        continue;

      const age = (stint: typeof aheadStint) =>
        (stint.tyre_age_at_start ?? 0) + (lap - stint.lap_start);

      let label: 0 | 1 = 0;
      for (let k = 1; k <= OVERTAKE_HORIZON_LAPS; k += 1) {
        const t = leaderStart.get(lap + k);
        if (t == null) continue;
        const pa = positionAt(ahead, t);
        const pc = positionAt(chaser, t);
        if (pa != null && pc != null && pc < pa) {
          label = 1;
          break;
        }
      }
      if (label === 1 && options.overtakes && !confirmedPass(chaser, ahead, now, end)) label = 0;

      const streak = rangeStreak((l) => {
        const start = lapStart.get(`${chaser}:${l}`);
        return start == null ? null : intervals.intervalAt(chaser, start);
      }, lap);

      samples.push({
        features: {
          gap,
          paceDelta: Number((aheadPace - chaserPace).toFixed(3)),
          tyreAgeDelta: age(aheadStint) - age(chaserStint),
          compoundDelta: aheadStep - chaserStep,
          inRangeLastLap: streak > 0 ? 1 : 0,
          rangeStreak: streak,
        },
        label,
        lap,
        ahead,
        chaser,
      });
    }
  }
  return samples;
}
