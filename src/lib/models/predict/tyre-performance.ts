/**
 * Card 1 — tyre performance: how each compound is behaving in this session.
 *
 * Three estimates per compound:
 *
 *  - **Wear**: the median of every stint's fitted slope on that compound. The
 *    median, so one stint in heavy traffic cannot drag the figure.
 *  - **Pace against the fastest compound**: compared within the same car. A
 *    driver who ran both mediums and hards gives one direct measurement of the gap
 *    between them, free of the difference between a fast car and a slow one;
 *    comparing a leader's mediums with a backmarker's hards would mostly measure
 *    the cars. The compound gap is the median of those paired differences, at a
 *    common tyre age of five laps.
 *  - **The cliff**: lap times accelerating rather than rising steadily. Every clean
 *    lap on the compound is taken relative to its own stint's fitted level, which
 *    removes car and fuel differences, and a quadratic is fitted across them. The
 *    warning needs the curvature to be positive and at least twice its own
 *    standard error, over enough laps for that to mean something.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import { cautionPeriods } from '../caution';
import { predictQuadratic, quadraticFit } from '../regression';
import { IntervalLookup, MIN_CLEAN_LAPS } from './clean-laps';
import { confidenceFrom, weakest, type Confidence } from './confidence';
import { fitDriverStints, type StintFit } from './stint-fit';

/** Tyre age at which compounds are compared. */
export const REFERENCE_AGE = 5;
/** Curvature must be this many standard errors above zero to call a cliff. */
export const CLIFF_T_STAT = 2;
/** Laps needed across a compound before a cliff can be judged at all. */
export const CLIFF_MIN_LAPS = 12;

export interface CompoundPerformance {
  compound: string;
  stints: number;
  cleanLaps: number;
  /** Seconds lost per lap of tyre age. Null when no stint had enough clean laps. */
  degPerLap: number | null;
  /** Seconds per lap slower than the fastest compound at `REFERENCE_AGE`. Null when unmeasurable. */
  paceDelta: number | null;
  /** Cars that ran this compound and the reference one, behind the pace figure. */
  pairedCars: number;
  cliff: { detected: boolean; tStat: number | null };
  /** Lap time relative to the fastest compound on a five-lap-old set, by tyre age. */
  curve: { age: number; delta: number }[];
  confidence: Confidence;
  /** False when the card must say "Not enough data yet". */
  enough: boolean;
}

export interface TyrePerformance {
  compounds: CompoundPerformance[];
  referenceAge: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Fits for every driver, sharing the expensive lookups. */
export function fitField(snapshot: SessionDataset): StintFit[] {
  const periods = cautionPeriods(snapshot.raceControl);
  const intervals = new IntervalLookup(snapshot.intervals);
  return snapshot.drivers.flatMap((driver) =>
    fitDriverStints(snapshot, driver.driver_number, { periods, intervals }),
  );
}

export function tyrePerformance(
  snapshot: SessionDataset,
  fits = fitField(snapshot),
): TyrePerformance {
  const usable = fits.filter((fit) => fit.compound && fit.slope != null && fit.intercept != null);
  const compounds = [...new Set(fits.map((fit) => fit.compound).filter((c): c is string => !!c))];

  /* Each car's fuel-free lap time at the reference age, per compound (best stint wins ties by median). */
  const byCar = new Map<number, Map<string, number[]>>();
  for (const fit of usable) {
    const perCompound = byCar.get(fit.driverNumber) ?? new Map<string, number[]>();
    const list = perCompound.get(fit.compound!) ?? [];
    list.push(fit.intercept! + fit.slope! * REFERENCE_AGE);
    perCompound.set(fit.compound!, list);
    byCar.set(fit.driverNumber, perCompound);
  }

  /* The reference is the compound most cars have a measurement on. */
  const coverage = compounds
    .map((compound) => ({
      compound,
      cars: [...byCar.values()].filter((m) => m.has(compound)).length,
    }))
    .sort((a, b) => b.cars - a.cars);
  const reference = coverage[0]?.compound ?? null;

  const offsets = new Map<string, { offset: number | null; pairs: number }>();
  for (const compound of compounds) {
    if (compound === reference) {
      offsets.set(compound, { offset: 0, pairs: coverage[0]!.cars });
      continue;
    }
    const diffs: number[] = [];
    for (const perCompound of byCar.values()) {
      const mine = median(perCompound.get(compound) ?? []);
      const theirs = reference ? median(perCompound.get(reference) ?? []) : null;
      if (mine != null && theirs != null) diffs.push(mine - theirs);
    }
    offsets.set(compound, { offset: median(diffs), pairs: diffs.length });
  }

  const known = [...offsets.values()].map((o) => o.offset).filter((o): o is number => o != null);
  const fastest = known.length > 0 ? Math.min(...known) : 0;

  const result = compounds.map((compound): CompoundPerformance => {
    const stints = fits.filter((fit) => fit.compound === compound);
    const measured = stints.filter((fit) => fit.slope != null);
    const cleanLaps = stints.reduce((sum, fit) => sum + fit.cleanLaps, 0);
    const degPerLap = median(measured.map((fit) => fit.slope!));
    const { offset, pairs } = offsets.get(compound) ?? { offset: null, pairs: 0 };
    const paceDelta = offset == null ? null : Number((offset - fastest).toFixed(3));

    /* Every clean lap relative to its own stint's fitted line level, pooled. */
    const pooled = measured.flatMap((fit) =>
      fit.points.map((p) => ({ x: p.age, y: p.time - fit.intercept! })),
    );
    const quad = pooled.length >= CLIFF_MIN_LAPS ? quadraticFit(pooled) : null;
    const tStat = quad && quad.cStdError > 0 ? quad.c / quad.cStdError : null;
    const cliff = tStat != null && quad!.c > 0 && tStat >= CLIFF_T_STAT;

    const maxAge = Math.max(0, ...stints.map((fit) => fit.tyreAge));
    const curve: { age: number; delta: number }[] = [];
    if (degPerLap != null && paceDelta != null) {
      for (let age = 1; age <= maxAge; age += 1) {
        const shape = cliff
          ? predictQuadratic(quad!, age) - predictQuadratic(quad!, REFERENCE_AGE)
          : degPerLap * (age - REFERENCE_AGE);
        curve.push({ age, delta: Number((paceDelta + shape).toFixed(3)) });
      }
    }

    const residuals = measured
      .map((fit) => fit.residualStdDev)
      .filter((r): r is number => r != null);
    const wearConfidence = confidenceFrom(cleanLaps, median(residuals));
    const paceConfidence: Confidence = pairs >= 4 ? 'high' : pairs >= 2 ? 'medium' : 'low';

    return {
      compound,
      stints: stints.length,
      cleanLaps,
      degPerLap,
      paceDelta,
      pairedCars: pairs,
      cliff: { detected: cliff, tStat },
      curve,
      confidence: weakest(wearConfidence, paceConfidence),
      enough: degPerLap != null && cleanLaps >= MIN_CLEAN_LAPS,
    };
  });

  return {
    compounds: result.sort((a, b) => (a.paceDelta ?? Infinity) - (b.paceDelta ?? Infinity)),
    referenceAge: REFERENCE_AGE,
  };
}
