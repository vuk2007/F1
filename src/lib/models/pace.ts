/**
 * Race pace comparison across several drivers.
 *
 * The rest of the app analyses one driver in depth. This answers the question
 * that actually decides an argument: who was quicker, and by how much.
 *
 * Two decisions carry most of the weight:
 *
 * Only representative laps count. The comparison reuses the same filtering as
 * the degradation model — no pit in or out laps, nothing under a safety car,
 * nothing in dirty air — because a driver who pitted twice would otherwise look
 * forty seconds slower for reasons that have nothing to do with pace.
 *
 * The summary uses the MEDIAN, not the mean. One lap stuck behind a backmarker
 * drags a mean by a tenth across a whole stint; the median ignores it. That
 * matters because the numbers here are small — a tenth a lap is the difference
 * between winning and finishing second.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import { cautionPeriods } from './caution';
import { analyseDriverStints } from './stint-analysis';

/** A lap's worth of times, keyed by `d<driverNumber>`. */
export interface PaceRow {
  lapNumber: number;
  [driverKey: string]: number | null;
}

export interface PaceDriverSummary {
  driverNumber: number;
  /** Chart series key, matching the keys in each row. */
  key: string;
  cleanLaps: number;
  medianLap: number | null;
  bestLap: number | null;
  /** Seconds per lap slower than the quickest driver compared. Null if unknown. */
  deltaToBest: number | null;
}

export interface PaceComparison {
  rows: PaceRow[];
  summaries: PaceDriverSummary[];
}

export const paceKey = (driverNumber: number) => `d${driverNumber}`;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function buildPaceComparison(
  dataset: SessionDataset,
  driverNumbers: number[],
): PaceComparison {
  if (driverNumbers.length === 0) return { rows: [], summaries: [] };

  // Folded once and shared, rather than re-derived per driver.
  const periods = cautionPeriods(dataset.raceControl);

  const byLap = new Map<number, PaceRow>();
  const summaries: PaceDriverSummary[] = [];

  for (const driverNumber of driverNumbers) {
    const key = paceKey(driverNumber);
    const times: number[] = [];

    for (const analysis of analyseDriverStints(dataset, driverNumber, { periods })) {
      for (const sample of analysis.samples) {
        if (sample.excluded !== null || sample.lapTime == null) continue;

        times.push(sample.lapTime);
        const row = byLap.get(sample.lapNumber) ?? { lapNumber: sample.lapNumber };
        row[key] = sample.lapTime;
        byLap.set(sample.lapNumber, row);
      }
    }

    summaries.push({
      driverNumber,
      key,
      cleanLaps: times.length,
      medianLap: median(times),
      bestLap: times.length > 0 ? Math.min(...times) : null,
      deltaToBest: null,
    });
  }

  /*
   * The reference is the quickest median among the drivers actually being
   * compared, so the deltas answer "relative to the best car here" rather than
   * to an absolute that may not be on screen.
   */
  const medians = summaries
    .map((summary) => summary.medianLap)
    .filter((value): value is number => value != null);
  const reference = medians.length > 0 ? Math.min(...medians) : null;

  for (const summary of summaries) {
    summary.deltaToBest =
      reference != null && summary.medianLap != null
        ? Number((summary.medianLap - reference).toFixed(3))
        : null;
  }

  return {
    rows: [...byLap.values()].sort((a, b) => a.lapNumber - b.lapNumber),
    summaries,
  };
}

/**
 * Y range from the laps on screen, ignoring the slowest few percent.
 *
 * Even after filtering, a handful of laps sit seconds off the pace — a lift for
 * yellow flags in one sector, a moment off line. Letting those set the scale
 * compresses the tenths that the comparison exists to show.
 */
export function paceDomain(rows: PaceRow[], keys: string[], trim = 0.05): [number, number] {
  const times: number[] = [];
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === 'number') times.push(value);
    }
  }
  if (times.length === 0) return [0, 1];

  times.sort((a, b) => a - b);
  const cut = Math.floor(times.length * (1 - trim));
  const min = times[0]!;
  const max = times[Math.min(cut, times.length - 1)]!;
  const pad = Math.max(0.3, (max - min) * 0.1);

  return [min - pad, max + pad];
}
