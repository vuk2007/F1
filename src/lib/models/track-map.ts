/**
 * Circuit map built from the `location` feed, coloured by speed.
 *
 * The telemetry traces answer "what happened at 3200 metres"; this answers
 * "where is that". Together they turn a braking trace into a corner you can
 * point at.
 *
 * Coordinates come from OpenF1 as raw integers in an unspecified unit with no
 * documented origin, so nothing here assumes metres or a fixed frame: the path
 * is normalised into its own viewBox each time. Two consequences are handled
 * explicitly — the aspect ratio is preserved, because a squashed circuit is a
 * different circuit, and the y axis is flipped, because SVG y grows downward
 * while the track frame's does not.
 *
 * Verified on Verstappen's lap 30 at Monza 2025: 329 samples at 240ms, and the
 * lap closes to within 130 units of its own start, so the outline is a real loop
 * rather than a drifting trace.
 */
import type { LocationPoint } from '@/lib/openf1/types';
import type { TelemetryPoint } from './telemetry';

export interface TrackPoint {
  /** Normalised into the viewBox, y already flipped for SVG. */
  x: number;
  y: number;
  /** Absolute sample time, epoch ms. */
  dateMs: number;
  /** Speed at this point, interpolated from telemetry. Null without a match. */
  speed: number | null;
  /** Whether the brake was on here. Null without a match. */
  braking: boolean | null;
}

export interface TrackMap {
  points: TrackPoint[];
  /** Square-ish box the points were normalised into. */
  width: number;
  height: number;
  speedRange: { min: number; max: number } | null;
  /** Contiguous runs where the brake was on — the braking zones. */
  brakingZones: { from: number; to: number }[];
}

const EMPTY: TrackMap = {
  points: [],
  width: 0,
  height: 0,
  speedRange: null,
  brakingZones: [],
};

/** Interpolates a telemetry channel at an absolute time. */
function sampleAt(
  telemetry: TelemetryPoint[],
  dateMs: number,
): { speed: number; braking: boolean } | null {
  if (telemetry.length === 0) return null;

  const first = telemetry[0]!;
  const last = telemetry[telemetry.length - 1]!;
  if (dateMs <= first.dateMs) return { speed: first.speed, braking: first.brake > 0 };
  if (dateMs >= last.dateMs) return { speed: last.speed, braking: last.brake > 0 };

  let low = 0;
  let high = telemetry.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (telemetry[mid]!.dateMs <= dateMs) low = mid;
    else high = mid;
  }

  const a = telemetry[low]!;
  const b = telemetry[high]!;
  const span = b.dateMs - a.dateMs;
  const ratio = span === 0 ? 0 : (dateMs - a.dateMs) / span;

  return {
    speed: a.speed + (b.speed - a.speed) * ratio,
    // Brake is binary; taking the nearer sample keeps it that way.
    braking: (ratio < 0.5 ? a.brake : b.brake) > 0,
  };
}

export interface TrackMapOptions {
  /** Size of the longer side of the output box. */
  size?: number;
  /** Blank margin inside the box, in output units. */
  padding?: number;
}

export function buildTrackMap(
  location: LocationPoint[],
  telemetry: TelemetryPoint[] = [],
  options: TrackMapOptions = {},
): TrackMap {
  const size = options.size ?? 1000;
  const padding = options.padding ?? 24;

  const timed = location
    .map((point) => ({ point, t: Date.parse(point.date) }))
    .filter((entry) => !Number.isNaN(entry.t))
    /*
     * (0, 0) is the feed's "no fix" value rather than a point on the circuit;
     * leaving those in drags a spike across the middle of the map.
     */
    .filter((entry) => entry.point.x !== 0 || entry.point.y !== 0)
    .sort((a, b) => a.t - b.t);

  if (timed.length < 2) return EMPTY;

  const xs = timed.map((entry) => entry.point.x);
  // Flip now, so the bounds below are computed on the values actually drawn.
  const ys = timed.map((entry) => -entry.point.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX === 0 && spanY === 0) return EMPTY;

  // One scale for both axes keeps the circuit's real proportions.
  const scale = (size - padding * 2) / Math.max(spanX, spanY, 1);
  const width = spanX * scale + padding * 2;
  const height = spanY * scale + padding * 2;

  const points: TrackPoint[] = timed.map((entry, index) => {
    const sample = sampleAt(telemetry, entry.t);
    return {
      x: (entry.point.x - minX) * scale + padding,
      y: (ys[index]! - minY) * scale + padding,
      dateMs: entry.t,
      speed: sample?.speed ?? null,
      braking: sample?.braking ?? null,
    };
  });

  const speeds = points
    .map((point) => point.speed)
    .filter((value): value is number => value != null);

  const brakingZones: { from: number; to: number }[] = [];
  let zoneStart: number | null = null;
  points.forEach((point, index) => {
    if (point.braking === true && zoneStart === null) zoneStart = index;
    if (point.braking !== true && zoneStart !== null) {
      brakingZones.push({ from: zoneStart, to: index - 1 });
      zoneStart = null;
    }
  });
  if (zoneStart !== null) brakingZones.push({ from: zoneStart, to: points.length - 1 });

  return {
    points,
    width,
    height,
    speedRange: speeds.length > 0 ? { min: Math.min(...speeds), max: Math.max(...speeds) } : null,
    brakingZones,
  };
}

/**
 * Sequential blue ramp, dark (slow) to light (fast).
 *
 * One hue with monotonic lightness, which is the correct check for a sequential
 * scale — the categorical validator fails such a ramp by design. Light reads as
 * "more" against a dark surface, so the fast end is the light end. The five
 * stops below each clear the adjacent-lightness gap, so the same ramp also works
 * as a readable discrete legend.
 */
export const SPEED_RAMP = ['#184f95', '#2a78d6', '#5598e7', '#9ec5f4', '#cde2fb'] as const;

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Colour for a speed, interpolated along the ramp. */
export function speedColour(
  speed: number | null,
  range: { min: number; max: number } | null,
): string {
  if (speed == null || !range || range.max === range.min) return SPEED_RAMP[2];

  const ratio = Math.min(1, Math.max(0, (speed - range.min) / (range.max - range.min)));
  const scaled = ratio * (SPEED_RAMP.length - 1);
  const index = Math.min(SPEED_RAMP.length - 2, Math.floor(scaled));
  const t = scaled - index;

  const [r1, g1, b1] = hexToRgb(SPEED_RAMP[index]!);
  const [r2, g2, b2] = hexToRgb(SPEED_RAMP[index + 1]!);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);

  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
}
