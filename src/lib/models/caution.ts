/**
 * Caution periods (safety car, VSC, red flag) derived from the race control feed.
 *
 * Lap times set under caution are meaningless for pace analysis, so the
 * degradation model needs to know which wall-clock windows were neutralised.
 * OpenF1 has no status field, so periods are folded from message text — the same
 * matching used by `trackStatusAt`, kept here as a pure function over raw rows.
 */
import type { RaceControl } from '@/lib/openf1/types';

export type CautionKind = 'sc' | 'vsc' | 'red';

export interface CautionPeriod {
  kind: CautionKind;
  startMs: number;
  /** Null when the session ended while the period was still active. */
  endMs: number | null;
}

interface OpenPeriod {
  kind: CautionKind;
  startMs: number;
}

/**
 * Folds the feed into closed periods. A new caution supersedes an open one of a
 * different kind (e.g. a VSC upgraded to a full safety car), which keeps the
 * output non-overlapping.
 */
export function cautionPeriods(raceControl: RaceControl[]): CautionPeriod[] {
  const sorted = [...raceControl]
    .map((message) => ({ message, t: Date.parse(message.date) }))
    .filter((entry) => !Number.isNaN(entry.t))
    .sort((a, b) => a.t - b.t);

  const periods: CautionPeriod[] = [];
  let open: OpenPeriod | null = null;

  const close = (endMs: number) => {
    if (!open) return;
    // Drop zero-length artefacts from duplicate messages.
    if (endMs > open.startMs) periods.push({ kind: open.kind, startMs: open.startMs, endMs });
    open = null;
  };

  for (const { message, t } of sorted) {
    const text = message.message.toUpperCase();

    if (message.category === 'SafetyCar') {
      const isVirtual = text.includes('VIRTUAL SAFETY CAR');
      const kind: CautionKind = isVirtual ? 'vsc' : 'sc';

      if (text.includes('DEPLOYED')) {
        if (open && open.kind !== kind) close(t);
        if (!open) open = { kind, startMs: t };
      } else if (
        text.includes('ENDING') ||
        text.includes('WITHDRAWN') ||
        text.includes('IN THIS LAP')
      ) {
        close(t);
      }
      continue;
    }

    if (message.scope === 'Track' && message.flag === 'RED') {
      if (open && open.kind !== 'red') close(t);
      if (!open) open = { kind: 'red', startMs: t };
    } else if (
      message.scope === 'Track' &&
      (message.flag === 'GREEN' || message.flag === 'CLEAR') &&
      open?.kind === 'red'
    ) {
      close(t);
    }
  }

  if (open !== null) {
    const stillOpen: OpenPeriod = open;
    periods.push({ kind: stillOpen.kind, startMs: stillOpen.startMs, endMs: null });
  }
  return periods;
}

/** True when [startMs, endMs] overlaps any caution period at all. */
export function overlapsCaution(periods: CautionPeriod[], startMs: number, endMs: number): boolean {
  return periods.some((period) => {
    const periodEnd = period.endMs ?? Number.POSITIVE_INFINITY;
    return startMs < periodEnd && endMs > period.startMs;
  });
}
