/**
 * Pit loss: total time a stop costs relative to staying on track.
 *
 * This is NOT the stationary time (~2.5s) and NOT `lane_duration` on its own.
 * It is the whole delta: slowing for pit entry, the lane at the speed limit, the
 * stop, and the exit, minus the time the driver would have spent covering the
 * same stretch of track at racing speed.
 *
 * The table below is a set of approximate, widely-quoted figures used as a
 * starting point, exactly as the brief specifies. They are NOT derived from the
 * API — `observedLaneDuration` exists so the UI can show the measured pit-lane
 * time from the session alongside the assumption, and so these constants can be
 * refined against real data later.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import { regulationsFor } from '@/lib/season';
import { MEASURED_PIT_LOSS } from './pit-loss-table';

/** Used whenever the circuit is not in the table. */
export const DEFAULT_PIT_LOSS_SECONDS = 22;

/**
 * Approximate pit loss in seconds, keyed by OpenF1's `circuit_short_name`.
 * Treat these as estimates with roughly +/-1.5s of uncertainty.
 */
export const PIT_LOSS_BY_CIRCUIT: Record<string, number> = {
  Monza: 21,
  'Spa-Francorchamps': 19,
  Silverstone: 21,
  'Monte Carlo': 19,
  Zandvoort: 21,
  Sakhir: 22,
  Jeddah: 20,
  Melbourne: 20,
  Suzuka: 22,
  Shanghai: 23,
  Miami: 20,
  Imola: 27,
  Montreal: 18,
  Catalunya: 21,
  Spielberg: 20,
  Hungaroring: 20,
  Baku: 20,
  Singapore: 25,
  Austin: 22,
  'Mexico City': 22,
  Interlagos: 21,
  'Las Vegas': 20,
  Lusail: 25,
  'Yas Marina Circuit': 22,
};

/**
 * The pit loss table for a session's season.
 *
 * From 2026, only figures measured on 2026 races: the cars changed, and a 2025 pit
 * loss is not evidence about a 2026 one, so a circuit with no 2026 race yet falls
 * back to the default rather than to an older season. Up to 2025, the figures
 * measured on 2024-2025 races win over the quoted ones above where both exist.
 * `pnpm pit-loss-table` produces the measured figures.
 */
export function pitLossTableFor(year: number | null | undefined): Record<string, number> {
  const measured = (era: '2024-2025' | '2026') =>
    Object.fromEntries(
      Object.entries(MEASURED_PIT_LOSS[era]).map(([circuit, m]) => [circuit, m.seconds]),
    );
  return regulationsFor(year) === 'overtake-mode'
    ? measured('2026')
    : { ...PIT_LOSS_BY_CIRCUIT, ...measured('2024-2025') };
}

export interface PitLossEstimate {
  /** Seconds lost by pitting, from the table or the default. */
  seconds: number;
  source: 'circuit-table' | 'default';
  /** Median measured pit-lane transit this session, for comparison. Null if none. */
  observedLaneDuration: number | null;
  /** Median measured stationary time this session. Null if none. */
  observedStopDuration: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function estimatePitLoss(dataset: SessionDataset): PitLossEstimate {
  const circuit = dataset.session.circuit_short_name;
  const tabled = pitLossTableFor(dataset.session.year)[circuit];

  const laneDurations = dataset.pits
    .map((p) => p.lane_duration)
    .filter((value): value is number => value != null && value > 0);
  const stopDurations = dataset.pits
    .map((p) => p.stop_duration)
    .filter((value): value is number => value != null && value > 0);

  return {
    seconds: tabled ?? DEFAULT_PIT_LOSS_SECONDS,
    source: tabled != null ? 'circuit-table' : 'default',
    observedLaneDuration: median(laneDurations),
    observedStopDuration: median(stopDurations),
  };
}
