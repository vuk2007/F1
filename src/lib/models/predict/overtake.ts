/**
 * Card 5 — overtake chance: a rough probability that the chasing car is ahead
 * within five laps.
 *
 * A logistic combination of four things that decide an on-track pass:
 *
 *  - **gap**: seconds between the cars now
 *  - **pace delta**: how much quicker the chaser has been over the last three laps
 *  - **tyre age delta**: how many laps fresher the chaser's tyres are
 *  - **compound delta**: how many steps softer the chaser's compound is (soft 1,
 *    medium 2, hard 3)
 *
 * The weights are not chosen by hand. `pnpm calibrate` builds every such situation
 * from the 2024 and 2025 dry races — two cars adjacent on the road within three
 * seconds, at the start of a lap — labels whether the chaser was ahead at the start
 * of any of the next five laps, and fits the weights to those outcomes. Situations
 * where either car stopped, or a safety car ran, inside the window are left out:
 * those change the order without an overtake, and the card is about racing.
 *
 * The races the prediction tests are scored on are held out of that fit, so the
 * hit rate is measured on races the model has not seen.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import { toTimed, valueAt } from '@/lib/replay/timeline';
import { cautionPeriods, overlapsCaution } from '../caution';
import { IntervalLookup } from './clean-laps';
import { predictProbability, type LogisticModel } from './logistic';

export const OVERTAKE_HORIZON_LAPS = 5;
/** Cars further apart than this are not treated as fighting. */
export const OVERTAKE_MAX_GAP_S = 3;
export const FEATURE_NAMES = ['gap', 'paceDelta', 'tyreAgeDelta', 'compoundDelta'] as const;

export interface OvertakeFeatures {
  gap: number;
  /** Seconds a lap the chaser has been quicker. */
  paceDelta: number;
  /** Laps fresher the chaser's tyres are. */
  tyreAgeDelta: number;
  /** Steps softer the chaser's compound is. */
  compoundDelta: number;
}

export function featureVector(f: OvertakeFeatures): number[] {
  return [f.gap, f.paceDelta, f.tyreAgeDelta, f.compoundDelta];
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
  return predictProbability(model, featureVector(features));
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
 */
export function overtakeSamples(dataset: SessionDataset): OvertakeSample[] {
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

      samples.push({
        features: {
          gap,
          paceDelta: Number((aheadPace - chaserPace).toFixed(3)),
          tyreAgeDelta: age(aheadStint) - age(chaserStint),
          compoundDelta: aheadStep - chaserStep,
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
