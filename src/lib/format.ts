/**
 * Display formatting helpers. Pure and unit-testable.
 */
import { strings } from '@/lib/i18n/strings';

const DASH = strings.common.noValue;

/** Lap time as m:ss.mmm, e.g. 81.234 -> "1:21.234". Sub-minute times keep ss.mmm. */
export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return DASH;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  if (minutes === 0) return remainder.toFixed(3);
  return `${minutes}:${remainder.toFixed(3).padStart(6, '0')}`;
}

/** Sector time, always ss.mmm. */
export function formatSector(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return DASH;
  return seconds.toFixed(3);
}

/** Elapsed replay time as h:mm:ss. */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00:00';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** A signed delta in seconds, e.g. "+0.312" / "-1.204". */
export function formatDelta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return DASH;
  const sign = seconds >= 0 ? '+' : '-';
  return `${sign}${Math.abs(seconds).toFixed(3)}`;
}

/** Single-letter tyre code used in the timing table. */
export function compoundLetter(compound: string | null | undefined): string {
  if (!compound) return '?';
  const upper = compound.toUpperCase();
  if (upper.startsWith('INTER')) return 'I';
  if (upper.startsWith('WET')) return 'W';
  return upper.charAt(0);
}

/** Tailwind-friendly colour for a tyre compound badge. */
export function compoundColour(compound: string | null | undefined): string {
  switch ((compound ?? '').toUpperCase()) {
    case 'SOFT':
      return '#e5232a';
    case 'MEDIUM':
      return '#f5c518';
    case 'HARD':
      return '#e8e8e8';
    case 'INTERMEDIATE':
      return '#3fbf51';
    case 'WET':
      return '#2f7fd1';
    default:
      return '#8b8b8b';
  }
}

/** Team colour from OpenF1 comes without a '#'. Fall back to grey when absent. */
export function teamColour(colour: string | null | undefined): string {
  if (!colour) return '#8b8b8b';
  return colour.startsWith('#') ? colour : `#${colour}`;
}
