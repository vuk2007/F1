/**
 * Energy use from telemetry: likely lift-and-coast, likely Straight mode and likely
 * Boost or Overtake Mode deployment.
 *
 * Every function here is a guess, and is named and labelled as one. In 2026 the
 * rules made energy a race-deciding variable, but OpenF1 publishes nothing about
 * it: `car_data` still has a `drs` field, null in every 2026 row checked (Melbourne
 * and Monza races, Monza qualifying), and no field replaced it. Until one exists the
 * only evidence is the shape of speed, throttle and brake — sampled at about 3.7 Hz,
 * so a quarter of a second is one sample. Nothing here is ever shown as fact.
 *
 * What the data does show, checked on Monza 2026 laps 20-24 against Monza 2025:
 * 2026 cars come off the throttle at around 300 km/h and roll for 0.3-0.7 s before
 * braking (car 12, 8 times in 5 laps); the 2025 cars did so once, for one sample.
 */
import type { TelemetryPoint } from './telemetry';

/** Throttle at or below this, with no brake, is off the power. */
export const LIFT_THROTTLE = 10;
/** Throttle at or above this is flat out. */
export const FULL_THROTTLE = 98;
/** A lift needs two consecutive samples, about half a second: one sample is noise. */
export const MIN_LIFT_SAMPLES = 2;
/** Lifts only count near the top of a straight, not in slow corners. */
export const NEAR_TOP_SPEED = 0.9;
/** The brake must come within this many samples of the lift ending. */
export const BRAKE_LOOKAHEAD_SAMPLES = 2;

export interface HarvestLift {
  startDistance: number;
  brakeDistance: number;
  /** How early the driver came off the throttle, in metres before braking. */
  metresBeforeBraking: number;
  speedAtLift: number;
  samples: number;
}

/**
 * Throttle to zero while speed is still near its peak and the brake is not yet on,
 * ending in a braking zone: the signature of lifting early to harvest energy (or to
 * save fuel, which telemetry cannot tell apart).
 */
export function harvestLift(points: TelemetryPoint[]): HarvestLift[] {
  const lifts: HarvestLift[] = [];
  const isLift = (p: TelemetryPoint) => p.throttle <= LIFT_THROTTLE && p.brake === 0;
  let runPeak = 0;

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (p.brake > 0) {
      runPeak = 0;
      continue;
    }
    if (p.throttle >= FULL_THROTTLE) {
      runPeak = Math.max(runPeak, p.speed);
      continue;
    }
    if (!isLift(p) || runPeak === 0 || p.speed < NEAR_TOP_SPEED * runPeak) continue;

    let end = i;
    while (end < points.length && isLift(points[end]!)) end += 1;
    const brake = points.slice(end, end + BRAKE_LOOKAHEAD_SAMPLES).find((q) => q.brake > 0);
    const samples = end - i;
    if (samples >= MIN_LIFT_SAMPLES && brake) {
      lifts.push({
        startDistance: p.distance,
        brakeDistance: brake.distance,
        metresBeforeBraking: Math.round(brake.distance - p.distance),
        speedAtLift: p.speed,
        samples,
      });
    }
    runPeak = 0;
    i = end - 1;
  }
  return lifts;
}

/** Linear interpolation of a series at a distance; null outside it. */
function at(points: TelemetryPoint[], distance: number, key: 'speed' | 'throttle'): number | null {
  if (points.length === 0 || distance < points[0]!.distance) return null;
  for (let i = 1; i < points.length; i += 1) {
    const b = points[i]!;
    if (b.distance >= distance) {
      const a = points[i - 1]!;
      const span = b.distance - a.distance;
      const ratio = span > 0 ? (distance - a.distance) / span : 0;
      return a[key] + (b[key] - a[key]) * ratio;
    }
  }
  return null;
}

/** Full-throttle runs of at least `minLength` metres, as [from, to] distances. */
function fullThrottleRuns(points: TelemetryPoint[], minLength: number): [number, number][] {
  const runs: [number, number][] = [];
  let start: number | null = null;
  let last = 0;
  for (const p of points) {
    if (p.throttle >= FULL_THROTTLE && p.brake === 0) {
      start ??= p.distance;
      last = p.distance;
    } else if (start != null) {
      if (last - start >= minLength) runs.push([start, last]);
      start = null;
    }
  }
  if (start != null && last - start >= minLength) runs.push([start, last]);
  return runs;
}

/** Steps along a straight when looking for a plateau, and the gain that counts as still rising. */
const STEP_M = 50;
const STILL_RISING_KMH = 2;
/** Shortest stretch worth marking. */
export const MIN_SEGMENT_M = 100;

export interface EnergySegment {
  fromDistance: number;
  toDistance: number;
  /** Km/h above the reference lap over the segment. */
  speedAdvantage: number;
}

/**
 * Likely Straight mode: on a flat-out straight, speed keeps climbing past the point
 * where the reference lap had already stopped gaining. With the wings flat the car
 * carries less drag, so it keeps accelerating where it would otherwise level off.
 *
 * Low confidence: a tow from the car ahead does exactly the same, and laps are
 * aligned by integrated distance, which is good to about one per cent.
 */
export function straightModeSegments(
  lap: TelemetryPoint[],
  reference: TelemetryPoint[],
): EnergySegment[] {
  const segments: EnergySegment[] = [];
  for (const [from, to] of fullThrottleRuns(lap, 300)) {
    let plateau: number | null = null;
    for (let d = from; d + STEP_M <= to; d += STEP_M) {
      const now = at(reference, d, 'speed');
      const next = at(reference, d + STEP_M, 'speed');
      if (now != null && next != null && next - now < STILL_RISING_KMH) {
        plateau = d;
        break;
      }
    }
    if (plateau == null) continue;

    let rising = plateau;
    for (let d = plateau; d + STEP_M <= to; d += STEP_M) {
      const now = at(lap, d, 'speed');
      const next = at(lap, d + STEP_M, 'speed');
      if (now == null || next == null || next - now < STILL_RISING_KMH) break;
      rising = d + STEP_M;
    }
    if (rising - plateau >= MIN_SEGMENT_M) {
      const mine = at(lap, rising, 'speed');
      const theirs = at(reference, rising, 'speed');
      if (mine != null && theirs != null && mine > theirs) {
        segments.push({
          fromDistance: Math.round(plateau),
          toDistance: Math.round(rising),
          speedAdvantage: Math.round(mine - theirs),
        });
      }
    }
  }
  return segments;
}

/** Km/h faster than the reference, on no more throttle, that counts as extra power. */
export const BOOST_SPEED_KMH = 6;
const WINDOW_M = 100;
const WINDOW_STEP_M = 25;

/**
 * Likely Boost or Overtake Mode: over at least 100 m, the car is clearly faster than
 * its reference lap in the same place while using the same throttle or less — power
 * it did not have on that lap.
 *
 * Low confidence: a slipstream, a better exit from the corner before, or a
 * different reference lap all produce the same picture.
 */
export function boostCandidate(
  lap: TelemetryPoint[],
  reference: TelemetryPoint[],
): EnergySegment[] {
  const end = Math.min(lap.at(-1)?.distance ?? 0, reference.at(-1)?.distance ?? 0);
  const windows: EnergySegment[] = [];

  for (let d = 0; d + WINDOW_M <= end; d += WINDOW_STEP_M) {
    const inWindow = lap.filter((p) => p.distance >= d && p.distance <= d + WINDOW_M);
    if (inWindow.length === 0 || inWindow.some((p) => p.brake > 0)) continue;
    let speedGap = 0;
    let throttleGap = 0;
    let counted = 0;
    for (const p of inWindow) {
      const refSpeed = at(reference, p.distance, 'speed');
      const refThrottle = at(reference, p.distance, 'throttle');
      if (refSpeed == null || refThrottle == null) continue;
      speedGap += p.speed - refSpeed;
      throttleGap += p.throttle - refThrottle;
      counted += 1;
    }
    if (counted === 0) continue;
    if (speedGap / counted >= BOOST_SPEED_KMH && throttleGap / counted <= 0) {
      windows.push({
        fromDistance: d,
        toDistance: d + WINDOW_M,
        speedAdvantage: speedGap / counted,
      });
    }
  }

  /* Overlapping windows are one stretch of track. */
  const merged: EnergySegment[] = [];
  for (const w of windows) {
    const last = merged.at(-1);
    if (last && w.fromDistance <= last.toDistance) {
      last.toDistance = w.toDistance;
      last.speedAdvantage = Math.max(last.speedAdvantage, w.speedAdvantage);
    } else merged.push({ ...w });
  }
  return merged.map((s) => ({ ...s, speedAdvantage: Math.round(s.speedAdvantage) }));
}

export type EnergyStyle = 'conserving' | 'balanced' | 'attacking';

/** Laps the energy story is read over. */
export const ENERGY_STORY_LAPS = 3;

export interface EnergyStory {
  style: EnergyStyle | null;
  liftsPerLap: number | null;
  boostsPerLap: number | null;
  laps: number;
  /** Always low until OpenF1 publishes a real mode field. */
  confidence: 'low';
  enough: boolean;
}

/**
 * How hard a driver is using energy over their last three laps: many harvesting
 * lifts and no extra deployment reads as conserving, deployment with few lifts as
 * attacking. The thresholds are a judgement, not fitted, and the card says so.
 */
export function energyStory(laps: { lifts: number; boosts: number }[]): EnergyStory {
  const recent = laps.slice(-ENERGY_STORY_LAPS);
  if (recent.length < ENERGY_STORY_LAPS) {
    return {
      style: null,
      liftsPerLap: null,
      boostsPerLap: null,
      laps: recent.length,
      confidence: 'low',
      enough: false,
    };
  }
  const liftsPerLap = recent.reduce((s, l) => s + l.lifts, 0) / recent.length;
  const boostsPerLap = recent.reduce((s, l) => s + l.boosts, 0) / recent.length;
  const style: EnergyStyle =
    boostsPerLap >= 1 && liftsPerLap < 2
      ? 'attacking'
      : liftsPerLap >= 2 && boostsPerLap < 0.5
        ? 'conserving'
        : 'balanced';
  return {
    style,
    liftsPerLap: Number(liftsPerLap.toFixed(1)),
    boostsPerLap: Number(boostsPerLap.toFixed(1)),
    laps: recent.length,
    confidence: 'low',
    enough: true,
  };
}
