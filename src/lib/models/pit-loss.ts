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

/** Used whenever the circuit is not in the table. */
export const DEFAULT_PIT_LOSS_SECONDS = 22;

/**
 * Approximate pit loss in seconds, keyed by OpenF1's `circuit_short_name`.
 * Treat these as estimates with roughly +/-1.5s of uncertainty.
 */
export const PIT_LOSS_BY_CIRCUIT: Record<string, number> = {
  Monza: 21,
  Spa: 19,
  Silverstone: 21,
  Monaco: 19,
  Zandvoort: 21,
  Sakhir: 22,
  Jeddah: 20,
  Melbourne: 20,
  Suzuka: 22,
  Shanghai: 23,
  Miami: 20,
  Imola: 27,
  Montreal: 18,
  Barcelona: 21,
  'Red Bull Ring': 20,
  Budapest: 20,
  Baku: 20,
  Singapore: 25,
  Austin: 22,
  'Mexico City': 22,
  Interlagos: 21,
  'Las Vegas': 20,
  Lusail: 25,
  'Yas Marina': 22,
};

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
  const tabled = PIT_LOSS_BY_CIRCUIT[circuit];

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
