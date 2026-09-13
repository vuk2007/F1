/**
 * One linear fit per stint, on the laps the predictions are allowed to learn from.
 *
 * Fuel is corrected against the race lap, not against tyre age. Within a stint the
 * two rise together, so the slope comes out the same either way; but anchoring to
 * the lap makes the intercept mean the same thing in every stint — lap time on a
 * new tyre at the fuel load of the start — which is what lets a medium stint on lap
 * 5 be compared with a hard stint on lap 30.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import { linearFit } from '../regression';
import { defaultFuelEffect } from '../tyre-degradation';
import type { CautionPeriod } from '../caution';
import { cleanOnly, MIN_CLEAN_LAPS, predictionLaps, type IntervalLookup } from './clean-laps';
import { confidenceFrom, type Confidence } from './confidence';

export interface StintFit {
  driverNumber: number;
  stintNumber: number;
  compound: string | null;
  lapStart: number;
  lapEnd: number;
  /** Tyre age on the stint's last completed lap. */
  tyreAge: number;
  cleanLaps: number;
  /** Seconds lost per lap of tyre age. Null below `MIN_CLEAN_LAPS`. */
  slope: number | null;
  /** Fuel-free lap time on a brand new tyre. Null below `MIN_CLEAN_LAPS`. */
  intercept: number | null;
  residualStdDev: number | null;
  fuelEffectPerLap: number;
  /** Clean laps as (tyre age, fuel-free lap time), for pooled fits. */
  points: { age: number; time: number }[];
  confidence: Confidence;
}

export interface FitOptions {
  periods?: CautionPeriod[];
  intervals?: IntervalLookup;
  fuelEffectPerLap?: number;
}

export function fitDriverStints(
  snapshot: SessionDataset,
  driverNumber: number,
  options: FitOptions = {},
): StintFit[] {
  const fuel = options.fuelEffectPerLap ?? defaultFuelEffect(snapshot.session.session_type);
  const laps = predictionLaps(snapshot, driverNumber, options);

  return snapshot.stints
    .filter((stint) => stint.driver_number === driverNumber)
    .sort((a, b) => a.stint_number - b.stint_number)
    .map((stint) => {
      const inStint = laps.filter((lap) => lap.stintNumber === stint.stint_number);
      const clean = cleanOnly(inStint);
      const points = clean.map((lap) => ({
        age: lap.tyreAge,
        // Adding fuel back makes every lap as if run at the start-of-race fuel load.
        time: lap.lapTime + fuel * lap.lapNumber,
      }));
      const fit =
        clean.length >= MIN_CLEAN_LAPS
          ? linearFit(points.map((p) => ({ x: p.age, y: p.time })))
          : null;
      const last = inStint[inStint.length - 1];

      return {
        driverNumber,
        stintNumber: stint.stint_number,
        compound: stint.compound,
        lapStart: stint.lap_start,
        lapEnd: stint.lap_end,
        tyreAge: last?.tyreAge ?? stint.tyre_age_at_start ?? 0,
        cleanLaps: clean.length,
        slope: fit?.slope ?? null,
        intercept: fit?.intercept ?? null,
        residualStdDev: fit?.residualStdDev ?? null,
        fuelEffectPerLap: fuel,
        points,
        confidence: fit ? confidenceFrom(clean.length, fit.residualStdDev) : 'low',
      };
    });
}

/** The stint a driver is on in the snapshot. */
export function currentStintFit(fits: StintFit[]): StintFit | undefined {
  return fits[fits.length - 1];
}

/**
 * Lap time a car is setting on a given tyre age, on the measured scale for a
 * given race lap: fuel-free prediction minus the fuel burnt by then.
 */
export function lapTimeAt(fit: StintFit, tyreAge: number, raceLap: number): number | null {
  if (fit.slope == null || fit.intercept == null) return null;
  return fit.intercept + fit.slope * tyreAge - fit.fuelEffectPerLap * raceLap;
}
