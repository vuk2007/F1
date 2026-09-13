/**
 * Card 4 — battle forecast: how many laps until the chasing car is within DRS
 * range of the car ahead.
 *
 * Two independent reads of how fast the gap is closing, combined, as the brief asks:
 *
 *  - **The trend**: what the gap actually did over the last three laps.
 *  - **The pace model**: each car's current lap time from its fitted stint, carried
 *    forward with its own tyre wear. Two cars wearing at different rates close at a
 *    changing rate, and only the model sees that coming.
 *
 * With both, the closing rate is their average — the trend knows about things the
 * model cannot (traffic, a driver saving fuel), the model knows about wear the
 * trend has not shown yet. With one, it is used alone and the estimate is marked
 * low confidence. The gap is then stepped forward a lap at a time until it drops
 * inside one second, or the race runs out.
 */
import { weakest, type Confidence } from './confidence';

export const DRS_RANGE_S = 1;
/** Laps the trend is measured over. */
export const TREND_LAPS = 3;

export interface CarPace {
  /** Fuel-free lap time on a new set. */
  intercept: number;
  /** Wear, s/lap. */
  slope: number;
  tyreAge: number;
  confidence: Confidence;
}

export interface BattleForecastInput {
  /** Seconds between the cars now. */
  gap: number;
  /** Change in the gap over the last three laps; negative means closing. */
  gapChange: number | null;
  ahead: CarPace | null;
  chaser: CarPace | null;
  lapsRemaining: number;
}

export interface BattleForecast {
  /** Laps until within DRS range. 0 when already there; null when not before the end. */
  lapsToDrs: number | null;
  notBeforeEnd: boolean;
  /** Seconds a lap the chaser is gaining now; negative when losing ground. */
  closingPerLap: number | null;
  basis: 'trend+pace' | 'trend' | 'pace' | 'none';
  confidence: Confidence;
  enough: boolean;
}

/** Seconds per lap the chaser gains on lap `k` from now, from the two cars' pace. */
function modelRate(ahead: CarPace, chaser: CarPace, k: number): number {
  const aheadTime = ahead.intercept + ahead.slope * (ahead.tyreAge + k);
  const chaserTime = chaser.intercept + chaser.slope * (chaser.tyreAge + k);
  return aheadTime - chaserTime;
}

export function battleForecast(input: BattleForecastInput): BattleForecast {
  const { gap, gapChange, ahead, chaser, lapsRemaining } = input;
  const trend = gapChange == null ? null : -gapChange / TREND_LAPS;
  const model = ahead && chaser;

  const basis: BattleForecast['basis'] =
    trend != null && model ? 'trend+pace' : trend != null ? 'trend' : model ? 'pace' : 'none';

  if (basis === 'none') {
    return {
      lapsToDrs: null,
      notBeforeEnd: false,
      closingPerLap: null,
      basis,
      confidence: 'low',
      enough: false,
    };
  }

  const rateAt = (k: number): number => {
    if (trend != null && model) return (trend + modelRate(ahead, chaser, k)) / 2;
    if (trend != null) return trend;
    return modelRate(ahead!, chaser!, k);
  };

  const confidence: Confidence =
    basis === 'trend+pace' ? weakest(ahead!.confidence, chaser!.confidence) : 'low';

  if (gap <= DRS_RANGE_S) {
    return {
      lapsToDrs: 0,
      notBeforeEnd: false,
      closingPerLap: rateAt(0),
      basis,
      confidence,
      enough: true,
    };
  }

  let projected = gap;
  for (let k = 1; k <= lapsRemaining; k += 1) {
    projected -= rateAt(k);
    if (projected <= DRS_RANGE_S) {
      return {
        lapsToDrs: k,
        notBeforeEnd: false,
        closingPerLap: rateAt(0),
        basis,
        confidence,
        enough: true,
      };
    }
  }
  return {
    lapsToDrs: null,
    notBeforeEnd: true,
    closingPerLap: rateAt(0),
    basis,
    confidence,
    enough: true,
  };
}
