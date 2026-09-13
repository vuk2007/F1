/**
 * The "Right now" sentence: the single most important thing happening at this
 * moment, in words.
 *
 * Rule-based and deliberately boring. The rules are an ordered list, and the first
 * one that applies wins, because a newcomer needs one clear sentence rather than a
 * summary of everything. The order is the order a race engineer would shout them:
 * the session being stopped trumps everything; a safety car trumps a battle for
 * tenth; and "VER leads by 4 seconds" is what is left when nothing else is going on.
 */
import { strings } from '@/lib/i18n/strings';
import type { Weather } from '@/lib/openf1/types';
import type { KeyBattle } from '@/lib/replay/battles';
import type { DriverTimingRow, TrackStatus } from '@/lib/replay/selectors';

export type RightNowKind =
  | 'red'
  | 'chequered'
  | 'waiting'
  | 'sc'
  | 'vsc'
  | 'rain'
  | 'finalLaps'
  | 'pits'
  | 'battle'
  | 'leader';

export interface RightNowInput {
  /** Timing rows in running order. */
  rows: DriverTimingRow[];
  status: TrackStatus;
  weather: Weather | undefined;
  /** Leader's lap. */
  lap: number | null;
  /** Race distance; 0 when unknown. */
  totalLaps: number;
  isRace: boolean;
  /** Acronyms of drivers in the pit lane right now. */
  inPitLane: string[];
  /** Closest battles first. */
  battles: Pick<KeyBattle, 'ahead' | 'chaser' | 'gap' | 'position' | 'trend'>[];
}

export interface RightNow {
  kind: RightNowKind;
  sentence: string;
}

/** Laps from the end that count as "the final laps". */
export const FINAL_LAPS = 3;

/** A gap this small is a fight worth leading with. */
export const HEADLINE_BATTLE_GAP_S = 1;

const text = strings.simple.rightNowText;

/** "VER", "VER and NOR", "VER, NOR and LEC". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${text.and} ${names[names.length - 1]}`;
}

export function rightNow(input: RightNowInput): RightNow {
  const { rows, status, weather, lap, totalLaps, isRace, inPitLane, battles } = input;
  const leader = rows[0];
  const second = rows[1];

  if (status === 'red') return { kind: 'red', sentence: text.red };

  if (status === 'chequered' && leader) {
    return {
      kind: 'chequered',
      sentence: isRace
        ? text.chequeredRace(leader.driver.name_acronym)
        : text.chequeredOther(leader.driver.name_acronym),
    };
  }

  if (!leader || rows.every((row) => row.lapNumber == null)) {
    return { kind: 'waiting', sentence: text.waiting };
  }

  if (status === 'sc') return { kind: 'sc', sentence: text.sc };
  if (status === 'vsc') return { kind: 'vsc', sentence: text.vsc };
  if ((weather?.rainfall ?? 0) > 0) return { kind: 'rain', sentence: text.rain };

  const raceGap = second?.interval.seconds;

  if (isRace && totalLaps > 0 && lap != null && totalLaps - lap <= FINAL_LAPS) {
    const lapsLeft = Math.max(0, totalLaps - lap);
    return {
      kind: 'finalLaps',
      sentence:
        second && raceGap != null
          ? text.finalLaps(
              lapsLeft,
              leader.driver.name_acronym,
              second.driver.name_acronym,
              raceGap.toFixed(1),
            )
          : text.finalLapsAlone(lapsLeft, leader.driver.name_acronym),
    };
  }

  // In practice cars are in and out of the pits all session; it is not news.
  if (isRace && inPitLane.length > 0) {
    return { kind: 'pits', sentence: text.pits(joinNames(inPitLane), inPitLane.length > 1) };
  }

  const fight = battles[0];
  if (isRace && fight && fight.gap <= HEADLINE_BATTLE_GAP_S) {
    return {
      kind: 'battle',
      sentence: text.battle(
        fight.chaser.driver.name_acronym,
        fight.ahead.driver.name_acronym,
        fight.gap.toFixed(1),
        fight.position,
        fight.trend,
      ),
    };
  }

  if (isRace) {
    return {
      kind: 'leader',
      sentence:
        second && raceGap != null
          ? text.leaderRace(
              leader.driver.name_acronym,
              second.driver.name_acronym,
              raceGap.toFixed(1),
            )
          : text.leaderAlone(leader.driver.name_acronym),
    };
  }

  /*
   * Outside a race the running order is by best lap, and gaps are thousandths, so
   * the margin comes from the best laps themselves at full precision.
   */
  const margin =
    second && leader.bestLap != null && second.bestLap != null
      ? second.bestLap - leader.bestLap
      : null;
  return {
    kind: 'leader',
    sentence:
      second && margin != null
        ? text.fastest(leader.driver.name_acronym, second.driver.name_acronym, margin.toFixed(3))
        : text.fastestAlone(leader.driver.name_acronym),
  };
}
