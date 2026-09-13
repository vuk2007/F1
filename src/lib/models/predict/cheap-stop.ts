/**
 * Card 7 — the safety car "cheap stop": who gains positions by pitting now.
 *
 * Under a safety car or VSC the field slows while the pit lane limit does not, so
 * a stop costs a fraction of its usual time relative to the cars circulating. For
 * each driver this compares two stops: one made now at the reduced cost, and the
 * same stop made later under green at full cost. The positions gained are the
 * difference in where each would put them back on track.
 *
 * Both are worked out from the gaps at this moment, and assume nobody else stops.
 * Behind a real safety car the field bunches up over the following laps, so the
 * card reads as "what stopping now is worth, if you are the one who stops" — which
 * is the question a team is answering in the ten seconds after the call.
 *
 * The reduced cost uses the existing safety car factors, which are rules of thumb
 * rather than measurements, and the card says so.
 */
import type { TrackStatus } from '@/lib/replay/selectors';
import { SAFETY_CAR_PIT_LOSS_FACTOR, VSC_PIT_LOSS_FACTOR } from '../safety-car';
import { rejoinIfPitNow } from './pit-forecast';

export interface CheapStopDriver {
  driverNumber: number;
  label: string;
  gapToLeader: number | null;
  position: number | null;
  stopsMade: number;
  /** Distinct dry compounds used so far; a dry race needs two. */
  compoundsUsed: number;
}

export interface CheapStopEntry {
  driverNumber: number;
  label: string;
  position: number;
  /** Position after stopping now, at the reduced cost. */
  rejoinNow: number;
  /** Position after the same stop under green, at full cost. */
  rejoinGreen: number;
  positionsGained: number;
  secondsSaved: number;
  /** True when the driver still has to make a stop in this race anyway. */
  stillNeedsStop: boolean;
}

export interface CheapStop {
  active: boolean;
  kind: 'sc' | 'vsc' | null;
  normalPitLoss: number;
  reducedPitLoss: number;
  /** Everyone with a timed gap, most positions gained first. */
  drivers: CheapStopEntry[];
}

export function cheapStop(input: {
  status: TrackStatus;
  pitLoss: number;
  drivers: CheapStopDriver[];
}): CheapStop {
  const { status, pitLoss, drivers } = input;
  const kind = status === 'sc' ? 'sc' : status === 'vsc' ? 'vsc' : null;
  if (!kind)
    return {
      active: false,
      kind: null,
      normalPitLoss: pitLoss,
      reducedPitLoss: pitLoss,
      drivers: [],
    };

  const reduced = pitLoss * (kind === 'sc' ? SAFETY_CAR_PIT_LOSS_FACTOR : VSC_PIT_LOSS_FACTOR);
  const gaps = drivers.map((d) => ({ driverNumber: d.driverNumber, gapToLeader: d.gapToLeader }));

  const entries = drivers.flatMap((driver): CheapStopEntry[] => {
    const now = rejoinIfPitNow(gaps, driver.driverNumber, reduced);
    const green = rejoinIfPitNow(gaps, driver.driverNumber, pitLoss);
    if (!now || !green) return [];
    return [
      {
        driverNumber: driver.driverNumber,
        label: driver.label,
        position: now.currentPosition,
        rejoinNow: now.position,
        rejoinGreen: green.position,
        positionsGained: green.position - now.position,
        secondsSaved: Number((pitLoss - reduced).toFixed(1)),
        stillNeedsStop: driver.compoundsUsed < 2,
      },
    ];
  });

  entries.sort(
    (a, b) =>
      Number(b.stillNeedsStop) - Number(a.stillNeedsStop) ||
      b.positionsGained - a.positionsGained ||
      a.position - b.position,
  );

  return {
    active: true,
    kind,
    normalPitLoss: pitLoss,
    reducedPitLoss: Number(reduced.toFixed(1)),
    drivers: entries,
  };
}
