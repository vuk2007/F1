/**
 * What a driver card says: one line of status, and up to two badges.
 *
 * The line answers the two questions a newcomer has about any driver — how far
 * back are they, and on what tyres — in the order they would ask them. The badges
 * flag the handful of situations worth pointing at, and each is a simple rule with
 * a stated threshold, so the card never claims more than the numbers support.
 */
import { strings } from '@/lib/i18n/strings';
import type { PitVerdict } from '@/lib/models/pit-window';
import type { DriverTimingRow, TrackStatus } from '@/lib/replay/selectors';
import { ATTACK_RANGE_S, attackRangeTerm, type Regulations } from '@/lib/season';
import type { GlossaryKey } from './glossary';

const EPSILON = 1e-6;

/** Tyres this young, after a stop, count as fresh. */
export const FRESH_TYRE_LAPS = 3;

/**
 * `attackRange` is within a second of the car ahead: DRS range before 2026,
 * Overtake Mode range from 2026. One badge, named for the era — see `season.ts`.
 */
export type BadgeKind =
  'fastestLap' | 'underInvestigation' | 'pitSoon' | 'undercutThreat' | 'attackRange' | 'freshTyres';

/** Highest priority first: when more than two apply, these win. */
export const BADGE_PRIORITY: BadgeKind[] = [
  'fastestLap',
  'underInvestigation',
  'pitSoon',
  'undercutThreat',
  'attackRange',
  'freshTyres',
];

export const MAX_BADGES = 2;

const FIXED_TERMS: Partial<Record<BadgeKind, GlossaryKey>> = {
  fastestLap: 'lapTime',
  pitSoon: 'pitStop',
  undercutThreat: 'undercut',
  freshTyres: 'tyreAge',
};

/** The glossary entry that explains a badge, where one exists. */
export function badgeTerm(kind: BadgeKind, regulations: Regulations): GlossaryKey | undefined {
  return kind === 'attackRange' ? attackRangeTerm(regulations) : FIXED_TERMS[kind];
}

/** The badge's text: "DRS range" in a DRS season, "OM range" from 2026. */
export function badgeLabel(kind: BadgeKind, regulations: Regulations): string {
  return kind === 'attackRange'
    ? strings.simple.attackRange[regulations].badge
    : strings.simple.badges[kind]!;
}

function plural(compound: string | null): string | null {
  if (!compound) return null;
  return strings.simple.compoundPlural[compound.toUpperCase()] ?? compound.toLowerCase();
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "2.1 s behind, on 14-lap-old mediums".
 *
 * `sessionBestLap` is only used outside a race, where the order is by best lap and
 * "behind" means off the fastest time rather than behind on track.
 */
export function driverStatusLine(
  row: DriverTimingRow,
  { isRace, sessionBestLap }: { isRace: boolean; sessionBestLap: number | null },
): string {
  const s = strings.simple.status;
  /*
   * No lap started means still on the grid, even with a starting position. Calling
   * the pole-sitter "Leading" before the lights go out was the first thing a
   * screenshot of the pre-race screen showed.
   */
  if (row.lapNumber == null) return s.waiting;

  let standing: string | null = null;
  if (isRace) {
    if (row.position === 1) standing = s.leading;
    else if (row.gapToLeader.lapped) standing = s.lapped(row.gapToLeader.label);
    else if (row.interval.seconds != null && row.interval.seconds > 0)
      standing = s.behind(row.interval.seconds.toFixed(1));
  } else if (row.position === 1) {
    standing = s.fastest;
  } else if (row.bestLap != null && sessionBestLap != null) {
    standing = s.offFastest((row.bestLap - sessionBestLap).toFixed(3));
  }

  const compound = plural(row.tyre.compound);
  let tyres: string | null = null;
  if (compound && row.tyre.age != null) {
    tyres =
      row.pitCount > 0 && row.tyre.age <= 1
        ? s.justPitted(compound)
        : s.onTyres(row.tyre.age, compound);
  }

  const parts = [standing, tyres].filter((part): part is string => part != null);
  return parts.length === 0 ? s.waiting : capitalise(parts.join(', '));
}

export interface BadgeContext {
  row: DriverTimingRow;
  /** The car directly behind on track, if any. */
  behind: DriverTimingRow | undefined;
  isRace: boolean;
  status: TrackStatus;
  /** Fastest lap by anyone so far. */
  sessionBestLap: number | null;
  underInvestigation: boolean;
  /** Pit window verdict for this driver now; null when not computed. */
  pitVerdict: PitVerdict | null;
  /** Degradation of the current set, s/lap; null when not trustworthy. */
  slope: number | null;
}

/**
 * Up to two badges, highest priority first.
 *
 * Racing badges only apply in a race: in qualifying everyone is on fresh tyres and
 * nobody is fighting for a one-second window in a meaningful sense.
 */
export function driverBadges(context: BadgeContext): BadgeKind[] {
  const { row, behind, isRace, status, sessionBestLap, underInvestigation, pitVerdict, slope } =
    context;
  const found = new Set<BadgeKind>();

  if (
    isRace &&
    row.bestLap != null &&
    sessionBestLap != null &&
    Math.abs(row.bestLap - sessionBestLap) < EPSILON
  ) {
    found.add('fastestLap');
  }

  if (underInvestigation) found.add('underInvestigation');

  if (isRace && (pitVerdict === 'pit-now' || pitVerdict === 'window-open')) found.add('pitSoon');

  /*
   * An undercut is worth roughly one lap of this car's deficit to a fresh set
   * (degradation x tyre age). If the car behind is closer than that, a stop by them
   * now would put them ahead once this car stops too.
   */
  const behindGap = behind?.interval.seconds;
  if (
    isRace &&
    status === 'green' &&
    behindGap != null &&
    behindGap > 0 &&
    slope != null &&
    slope > 0 &&
    row.tyre.age != null &&
    behindGap <= slope * row.tyre.age
  ) {
    found.add('undercutThreat');
  }

  /* Both aids are switched off under a safety car, so the badge is green-flag only. */
  if (
    isRace &&
    status === 'green' &&
    row.position != null &&
    row.position > 1 &&
    row.interval.seconds != null &&
    row.interval.seconds > 0 &&
    row.interval.seconds <= ATTACK_RANGE_S
  ) {
    found.add('attackRange');
  }

  if (isRace && row.pitCount > 0 && row.tyre.age != null && row.tyre.age <= FRESH_TYRE_LAPS) {
    found.add('freshTyres');
  }

  return BADGE_PRIORITY.filter((kind) => found.has(kind)).slice(0, MAX_BADGES);
}
