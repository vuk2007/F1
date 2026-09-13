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

/**
 * What one race control message says about the track, or null when it says nothing.
 *
 * The wording changed in 2026, verified across every 2024-2026 race in the
 * calibration cache: the virtual safety car went from "VIRTUAL SAFETY CAR DEPLOYED /
 * ENDING" to "VSC DEPLOYED / ENDING" (24 and 23 times in 2026, never before), and a
 * red flag can arrive as a plain "RED FLAG - RACE SUSPENDED" with no flag or scope
 * (3 times in 2026). Matching only the old wording read Monza 2026's lap-3 safety car
 * as lasting until a VSC ended 26 laps later, and threw away every lap in between.
 * `cautionPeriods` and `trackStatusAt` both read the feed through this one function,
 * so the prediction models and the flag on screen cannot disagree.
 */
export type ControlSignal =
  'sc-start' | 'vsc-start' | 'caution-end' | 'red' | 'green' | 'yellow' | 'chequered';

export function controlSignal(message: RaceControl): ControlSignal | null {
  const text = message.message.toUpperCase();

  if (message.category === 'SafetyCar') {
    const isVirtual = text.includes('VIRTUAL SAFETY CAR') || /\bVSC\b/.test(text);
    if (text.includes('DEPLOYED')) return isVirtual ? 'vsc-start' : 'sc-start';
    if (text.includes('ENDING') || text.includes('WITHDRAWN') || text.includes('IN THIS LAP')) {
      return 'caution-end';
    }
    return null;
  }

  // A prefix, so "INCIDENT ... NOTED - RED FLAG INFRINGEMENT" is not a red flag.
  if ((message.scope === 'Track' && message.flag === 'RED') || /^RED FLAG\b/.test(text)) {
    return 'red';
  }

  if (message.scope === 'Track') {
    if (message.flag === 'CHEQUERED') return 'chequered';
    if (message.flag === 'GREEN' || message.flag === 'CLEAR') return 'green';
    if (message.flag === 'YELLOW' || message.flag === 'DOUBLE YELLOW') return 'yellow';
  }
  return null;
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
    const signal = controlSignal(message);

    if (signal === 'sc-start' || signal === 'vsc-start') {
      const kind: CautionKind = signal === 'vsc-start' ? 'vsc' : 'sc';
      if (open && open.kind !== kind) close(t);
      if (!open) open = { kind, startMs: t };
    } else if (signal === 'caution-end') {
      close(t);
    } else if (signal === 'red') {
      if (open && open.kind !== 'red') close(t);
      if (!open) open = { kind: 'red', startMs: t };
    } else if (signal === 'green' && open?.kind === 'red') {
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
