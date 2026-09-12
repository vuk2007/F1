/**
 * Telemetry: turning a car_data time series into something comparable.
 *
 * OpenF1 gives telemetry stamped with time, but telemetry is only meaningful
 * against *distance* — two drivers reach the same corner at different moments,
 * so a time axis compares the braking point of one with the apex of the other.
 * Distance is not in the feed, so it is integrated from speed.
 *
 * Accuracy check against the real thing: integrating Verstappen's lap 30 at
 * Monza 2025 gives 5731m against the circuit's actual 5793m, about 1.1% short at
 * a 4.2Hz sample rate. Good enough to line two laps up corner by corner, and the
 * reason the x-axis is labelled as an estimate.
 *
 * Verified field semantics: `brake` is binary 0 or 100, not a pressure; throttle
 * is a 0-100 percentage; `n_gear` runs 1-8 with 0 meaning neutral.
 */
import type { CarData, Lap } from '@/lib/openf1/types';

export interface TelemetryPoint {
  /** Metres travelled since the start of the lap. */
  distance: number;
  /** Seconds since the start of the lap. */
  time: number;
  /**
   * Absolute sample time, epoch ms. Kept so other feeds sampled on their own
   * clock — track position, for one — can be aligned exactly rather than by
   * assuming both series start at the same instant.
   */
  dateMs: number;
  speed: number;
  throttle: number;
  /** 0 or 100, as the API reports it. */
  brake: number;
  gear: number;
  drs: number;
}

/** The time window covering one lap, for a car_data query. */
export function lapWindow(lap: Lap): { from: string; to: string } | null {
  if (!lap.date_start || lap.lap_duration == null) return null;
  const start = Date.parse(lap.date_start);
  if (Number.isNaN(start)) return null;
  return {
    from: new Date(start).toISOString(),
    to: new Date(start + lap.lap_duration * 1000).toISOString(),
  };
}

/**
 * Integrates speed over time to get distance.
 *
 * Trapezoidal rather than left-endpoint: at 4Hz through a chicane the speed
 * changes a lot between samples, and taking the average of each pair roughly
 * halves the error.
 */
export function toDistanceSeries(samples: CarData[]): TelemetryPoint[] {
  const sorted = [...samples]
    .map((sample) => ({ sample, t: Date.parse(sample.date) }))
    .filter((entry) => !Number.isNaN(entry.t))
    .sort((a, b) => a.t - b.t);

  if (sorted.length === 0) return [];

  const startMs = sorted[0]!.t;
  const points: TelemetryPoint[] = [];
  let distance = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const { sample, t } = sorted[i]!;
    if (i > 0) {
      const previous = sorted[i - 1]!;
      const dt = (t - previous.t) / 1000;
      // km/h to m/s, averaged across the interval.
      const meanSpeed = (previous.sample.speed + sample.speed) / 2 / 3.6;
      distance += meanSpeed * dt;
    }
    points.push({
      distance,
      time: (t - startMs) / 1000,
      dateMs: t,
      speed: sample.speed,
      throttle: sample.throttle,
      brake: sample.brake,
      gear: sample.n_gear,
      drs: sample.drs,
    });
  }

  return points;
}

/** Linear interpolation of every channel at a given distance. */
function interpolateAt(points: TelemetryPoint[], distance: number): TelemetryPoint | null {
  if (points.length === 0) return null;
  if (distance <= points[0]!.distance) return points[0]!;
  const last = points[points.length - 1]!;
  if (distance >= last.distance) return last;

  // Binary search for the bracketing pair.
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (points[mid]!.distance <= distance) low = mid;
    else high = mid;
  }

  const a = points[low]!;
  const b = points[high]!;
  const span = b.distance - a.distance;
  const ratio = span === 0 ? 0 : (distance - a.distance) / span;
  const lerp = (x: number, y: number) => x + (y - x) * ratio;

  return {
    distance,
    time: lerp(a.time, b.time),
    dateMs: lerp(a.dateMs, b.dateMs),
    speed: lerp(a.speed, b.speed),
    throttle: lerp(a.throttle, b.throttle),
    // Discrete channels must not be averaged into meaningless in-between values.
    brake: ratio < 0.5 ? a.brake : b.brake,
    gear: ratio < 0.5 ? a.gear : b.gear,
    drs: ratio < 0.5 ? a.drs : b.drs,
  };
}

export interface ComparisonRow {
  distance: number;
  speedA: number | null;
  speedB: number | null;
  throttleA: number | null;
  throttleB: number | null;
  brakeA: number | null;
  brakeB: number | null;
  gearA: number | null;
  gearB: number | null;
  /**
   * Time A is ahead of B at this point, in seconds. Negative means A is quicker.
   * Rising means B is gaining; falling means A is.
   */
  delta: number | null;
}

/**
 * Puts one or two laps on a shared distance grid.
 *
 * Resampling is what makes an overlay honest: both cars are compared at the same
 * point on the track rather than at the same index into two unequal arrays.
 */
export function buildComparison(
  a: TelemetryPoint[],
  b: TelemetryPoint[] | null,
  step = 10,
): ComparisonRow[] {
  if (a.length === 0) return [];

  const maxDistance = a[a.length - 1]!.distance;
  const rows: ComparisonRow[] = [];

  for (let distance = 0; distance <= maxDistance; distance += step) {
    const pa = interpolateAt(a, distance);
    const pb = b && b.length > 0 ? interpolateAt(b, distance) : null;

    rows.push({
      distance,
      speedA: pa?.speed ?? null,
      speedB: pb?.speed ?? null,
      throttleA: pa?.throttle ?? null,
      throttleB: pb?.throttle ?? null,
      brakeA: pa?.brake ?? null,
      brakeB: pb?.brake ?? null,
      gearA: pa?.gear ?? null,
      gearB: pb?.gear ?? null,
      delta: pa && pb ? pa.time - pb.time : null,
    });
  }

  return rows;
}

/** Top speed, and where on the lap it happened. */
export function topSpeed(points: TelemetryPoint[]): { speed: number; distance: number } | null {
  if (points.length === 0) return null;
  let best = points[0]!;
  for (const point of points) if (point.speed > best.speed) best = point;
  return { speed: best.speed, distance: best.distance };
}

/** Fraction of the lap spent at full throttle, 0..1. */
export function fullThrottleShare(points: TelemetryPoint[]): number | null {
  if (points.length < 2) return null;
  let full = 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dt = points[i]!.time - points[i - 1]!.time;
    total += dt;
    if (points[i - 1]!.throttle >= 99) full += dt;
  }
  return total === 0 ? null : full / total;
}
