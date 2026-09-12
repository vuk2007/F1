/**
 * Telemetry and track map checked against one real lap.
 *
 * Verstappen's lap 30 of the 2025 Italian GP: 82.928s, 317 car_data samples and
 * 329 location samples at ~240ms. Monza is a useful yardstick because its shape
 * is extreme and well known — if the distance integration or the map projection
 * drifts, a circuit this distinctive shows it immediately.
 *
 * Network-bound. Run with `pnpm smoke`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SessionDataset } from '@/lib/openf1/dataset';
import { getCarData, getLocation } from '@/lib/openf1/client';
import { lapWindow, toDistanceSeries, topSpeed, type TelemetryPoint } from '@/lib/models/telemetry';
import { buildTrackMap } from '@/lib/models/track-map';
import type { LocationPoint } from '@/lib/openf1/types';
import { loadSessionForSmoke } from './load-or-skip';

const MONZA_2025_RACE = 9912;
const VER = 1;
const LAP = 30;
/** Monza's official lap length. */
const MONZA_METRES = 5793;

let dataset: SessionDataset;
let telemetry: TelemetryPoint[];
let location: LocationPoint[];

beforeAll(async () => {
  dataset = await loadSessionForSmoke(MONZA_2025_RACE);

  const lap = dataset.laps.find((l) => l.driver_number === VER && l.lap_number === LAP)!;
  const window = lapWindow(lap)!;

  telemetry = toDistanceSeries(await getCarData(MONZA_2025_RACE, VER, window.from, window.to));
  location = await getLocation(MONZA_2025_RACE, VER, window.from, window.to);
}, 180_000);

describe('telemetry on a real lap', () => {
  it('fetches a lap of samples at roughly 4Hz', () => {
    expect(telemetry.length).toBeGreaterThan(250);
    expect(telemetry.length).toBeLessThan(450);
  });

  it('integrates to within a couple of percent of the real circuit length', () => {
    const distance = telemetry[telemetry.length - 1]!.distance;
    const error = Math.abs(distance - MONZA_METRES) / MONZA_METRES;

    // The docs promise ~1%; fail if it ever drifts past 3%.
    expect(error).toBeLessThan(0.03);
  });

  it('reports a Monza-shaped speed range', () => {
    const peak = topSpeed(telemetry)!;
    // Monza is the fastest circuit on the calendar.
    expect(peak.speed).toBeGreaterThan(320);
    expect(peak.speed).toBeLessThan(370);

    const slowest = Math.min(...telemetry.map((p) => p.speed));
    // The first chicane drags the cars down to second gear.
    expect(slowest).toBeLessThan(120);
  });

  it('keeps brake binary and throttle a percentage', () => {
    for (const point of telemetry) {
      expect([0, 100]).toContain(point.brake);
      expect(point.throttle).toBeGreaterThanOrEqual(0);
      expect(point.throttle).toBeLessThanOrEqual(100);
    }
  });

  it('advances distance and time monotonically', () => {
    for (let i = 1; i < telemetry.length; i += 1) {
      expect(telemetry[i]!.distance).toBeGreaterThanOrEqual(telemetry[i - 1]!.distance);
      expect(telemetry[i]!.dateMs).toBeGreaterThan(telemetry[i - 1]!.dateMs);
    }
  });
});

describe('track map on a real lap', () => {
  it('builds a path from the whole lap', () => {
    const map = buildTrackMap(location, telemetry);
    expect(map.points.length).toBeGreaterThan(250);
  });

  it('closes the loop, because a lap ends where it began', () => {
    const map = buildTrackMap(location, telemetry, { size: 1000, padding: 0 });
    const first = map.points[0]!;
    const last = map.points[map.points.length - 1]!;
    const gap = Math.hypot(last.x - first.x, last.y - first.y);

    // Within 5% of the box: a drifting or mis-projected trace would not return.
    expect(gap).toBeLessThan(50);
  });

  it('keeps Monza taller than it is wide in the raw GPS frame', () => {
    const map = buildTrackMap(location, telemetry, { size: 1000, padding: 0 });
    // The projection must not square the circuit off.
    expect(map.height).toBeGreaterThan(map.width);
    expect(map.height).toBeCloseTo(1000, 6);
  });

  it('finds one braking zone per real braking event', () => {
    const map = buildTrackMap(location, telemetry);
    // Monza has a handful of heavy stops: the two chicanes, the Lesmos,
    // Ascari and Parabolica.
    expect(map.brakingZones.length).toBeGreaterThanOrEqual(5);
    expect(map.brakingZones.length).toBeLessThanOrEqual(10);
  });

  it('agrees with the brake trace about how much of the lap is braking', () => {
    const map = buildTrackMap(location, telemetry);
    const brakingPoints = map.points.filter((p) => p.braking === true).length;
    const share = brakingPoints / map.points.length;

    // Monza is a power circuit: braking occupies a small slice of the lap.
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.3);
  });

  it('aligns speed to position, so the slowest point is inside a braking zone', () => {
    const map = buildTrackMap(location, telemetry);
    const withSpeed = map.points.filter((p) => p.speed != null);
    expect(withSpeed.length).toBe(map.points.length);

    const slowest = withSpeed.reduce((min, p) => (p.speed! < min.speed! ? p : min));
    const index = map.points.indexOf(slowest);
    const inZone = map.brakingZones.some(
      // The apex arrives a moment after the brake is released.
      (zone) => index >= zone.from && index <= zone.to + 4,
    );
    expect(inZone).toBe(true);
  });
});
