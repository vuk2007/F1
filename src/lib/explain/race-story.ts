/**
 * The words behind the race story strip: the current flag as a word and a colour,
 * the weather as a phrase, and how far through the race we are.
 */
import { strings } from '@/lib/i18n/strings';
import type { Weather } from '@/lib/openf1/types';
import type { TrackStatus } from '@/lib/replay/selectors';
import type { GlossaryKey } from './glossary';

export type FlagTone = 'green' | 'yellow' | 'caution' | 'red' | 'chequered' | 'neutral';

export interface FlagChip {
  label: string;
  tone: FlagTone;
  /** The glossary entry that explains this state. */
  term: GlossaryKey;
}

const TONE: Record<TrackStatus, FlagTone> = {
  green: 'green',
  yellow: 'yellow',
  sc: 'caution',
  vsc: 'caution',
  red: 'red',
  chequered: 'chequered',
  unknown: 'neutral',
};

export function flagChip(status: TrackStatus): FlagChip {
  return {
    label: strings.simple.flag[status] ?? status,
    tone: TONE[status],
    term: status === 'sc' ? 'safetyCar' : status === 'vsc' ? 'vsc' : 'flags',
  };
}

/** "dry, 31 °C track", or null before any weather has been recorded. */
export function weatherInWords(weather: Weather | undefined): string | null {
  if (!weather) return null;
  return strings.simple.weather((weather.rainfall ?? 0) > 0, weather.track_temperature);
}

export interface LapProgress {
  label: string;
  /** 0-1 through the race; null when there is no known distance to measure against. */
  fraction: number | null;
}

/**
 * Only a race has a distance. Practice and qualifying run to a clock, so they get a
 * lap count with no bar rather than a bar that would mean nothing.
 */
export function lapProgress(lap: number | null, totalLaps: number, isRace: boolean): LapProgress {
  if (lap == null) return { label: strings.simple.notStarted, fraction: 0 };
  if (isRace && totalLaps > 0) {
    const shown = Math.min(lap, totalLaps);
    return { label: strings.simple.lapOf(shown, totalLaps), fraction: shown / totalLaps };
  }
  return { label: strings.simple.lapOnly(lap), fraction: null };
}
