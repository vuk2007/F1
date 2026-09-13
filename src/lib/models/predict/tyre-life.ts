/**
 * Card 2 — tyre life: how many more laps the current set is worth keeping.
 *
 * "Worth keeping" has a precise meaning here, from the brief: the set is spent once
 * it has become slower than a fresh set plus the cost of a stop. With wear `s` per
 * lap and the set `A` laps old, a new set would be `s·A` seconds a lap quicker. Stay
 * out `n` more laps and that adds up to `n·s·A`. The set's life is over when that
 * reaches the pit loss:
 *
 *     laps left = pit loss / (s · A)
 *
 * So life shrinks as the tyre ages, which is exactly how the bar should behave: a
 * new set lasts "to the end", a worn one has a handful of laps. When the answer is
 * more laps than the race has left, the set lasts to the flag.
 */
import type { Confidence } from './confidence';
import { MIN_CLEAN_LAPS } from './clean-laps';
import type { StintFit } from './stint-fit';

export interface TyreLife {
  compound: string | null;
  tyreAge: number;
  /** Laps before staying out costs more than stopping. Null when not measurable. */
  lapsLeft: number | null;
  /** True when the set is expected to reach the finish. */
  lastsToEnd: boolean;
  /** How full the bar is, 0-1: laps left against the set's whole expected life. */
  fraction: number | null;
  slope: number | null;
  confidence: Confidence;
  enough: boolean;
}

export interface TyreLifeInput {
  /** The stint the driver is on, fitted on clean laps. */
  stint: StintFit;
  currentLap: number;
  totalLaps: number;
  pitLoss: number;
}

export function tyreLife({ stint, currentLap, totalLaps, pitLoss }: TyreLifeInput): TyreLife {
  const lapsRemaining = Math.max(0, totalLaps - currentLap);
  const base = {
    compound: stint.compound,
    tyreAge: stint.tyreAge,
    slope: stint.slope,
    confidence: stint.confidence,
  };

  if (stint.slope == null || stint.cleanLaps < MIN_CLEAN_LAPS) {
    return { ...base, lapsLeft: null, lastsToEnd: false, fraction: null, enough: false };
  }

  /* No measurable wear, or a set too new to have lost anything: nothing to repay a stop. */
  const perLapDeficit = stint.slope * stint.tyreAge;
  if (perLapDeficit <= 0) {
    return { ...base, lapsLeft: lapsRemaining, lastsToEnd: true, fraction: 1, enough: true };
  }

  const life = Math.floor(pitLoss / perLapDeficit);
  const lastsToEnd = life >= lapsRemaining;
  const lapsLeft = lastsToEnd ? lapsRemaining : life;

  return {
    ...base,
    lapsLeft,
    lastsToEnd,
    fraction: lastsToEnd ? 1 : lapsLeft / (lapsLeft + stint.tyreAge),
    enough: true,
  };
}
