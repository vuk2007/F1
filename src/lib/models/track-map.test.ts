import { describe, expect, it } from 'vitest';
import type { LocationPoint } from '@/lib/openf1/types';
import { buildTrackMap, speedColour, SPEED_RAMP } from './track-map';
import type { TelemetryPoint } from './telemetry';

const T0 = Date.parse('2025-01-01T12:00:00.000Z');

function point(offsetMs: number, x: number, y: number): LocationPoint {
  return {
    date: new Date(T0 + offsetMs).toISOString(),
    driver_number: 1,
    meeting_key: 1,
    session_key: 1,
    x,
    y,
    z: 1900,
  };
}

function telemetry(offsetMs: number, speed: number, brake = 0): TelemetryPoint {
  return {
    distance: 0,
    time: offsetMs / 1000,
    dateMs: T0 + offsetMs,
    speed,
    throttle: brake > 0 ? 0 : 100,
    brake,
    gear: 8,
    drs: 0,
  };
}

/**
 * A 100x100 square loop, one point per corner. Deliberately offset from the
 * origin: (0, 0) is the feed's no-fix marker and is filtered out, so a fixture
 * sitting on it would be testing the wrong thing.
 */
const square = [
  point(0, 100, 100),
  point(240, 200, 100),
  point(480, 200, 200),
  point(720, 100, 200),
];

describe('buildTrackMap', () => {
  it('normalises coordinates into a padded box', () => {
    const map = buildTrackMap(square, [], { size: 1000, padding: 50 });

    expect(map.points).toHaveLength(4);
    // 100 units of track spread across 1000 - 2*50 of box.
    expect(map.width).toBeCloseTo(1000, 6);
    expect(map.height).toBeCloseTo(1000, 6);
    for (const p of map.points) {
      expect(p.x).toBeGreaterThanOrEqual(50);
      expect(p.x).toBeLessThanOrEqual(950);
      expect(p.y).toBeGreaterThanOrEqual(50);
      expect(p.y).toBeLessThanOrEqual(950);
    }
  });

  it('preserves the aspect ratio of a non-square circuit', () => {
    // Twice as wide as it is tall.
    const wide = [
      point(0, 100, 100),
      point(240, 300, 100),
      point(480, 300, 200),
      point(720, 100, 200),
    ];
    const map = buildTrackMap(wide, [], { size: 1000, padding: 0 });

    expect(map.width).toBeCloseTo(1000, 6);
    // A squashed circuit would report 1000 here too; it must be half.
    expect(map.height).toBeCloseTo(500, 6);
  });

  it('flips the y axis so the map is not drawn mirrored', () => {
    const map = buildTrackMap(square, [], { size: 100, padding: 0 });
    const first = map.points[0]!; // track y = 100, the lower
    const third = map.points[2]!; // track y = 200, the higher

    // Higher on the track means a smaller SVG y.
    expect(first.y).toBeGreaterThan(third.y);
  });

  it('sorts samples that arrive out of order', () => {
    const shuffled = [square[2]!, square[0]!, square[3]!, square[1]!];
    const map = buildTrackMap(shuffled, [], { size: 100, padding: 0 });
    expect(map.points.map((p) => p.dateMs)).toEqual([T0, T0 + 240, T0 + 480, T0 + 720]);
  });

  it('drops (0, 0) no-fix samples without dragging a spike across the map', () => {
    const withGlitch = [
      point(0, 500, 500),
      point(240, 0, 0),
      point(480, 600, 500),
      point(720, 600, 600),
    ];
    const map = buildTrackMap(withGlitch, [], { size: 100, padding: 0 });

    expect(map.points).toHaveLength(3);
    expect(map.points.every((p) => p.dateMs !== T0 + 240)).toBe(true);
  });

  it('returns nothing usable for too few points', () => {
    expect(buildTrackMap([], []).points).toEqual([]);
    expect(buildTrackMap([point(0, 1, 1)], []).points).toEqual([]);
  });

  it('returns nothing usable when the car never moved', () => {
    const stationary = [point(0, 5, 5), point(240, 5, 5), point(480, 5, 5)];
    expect(buildTrackMap(stationary, []).points).toEqual([]);
  });
});

describe('speed alignment', () => {
  const speeds = [telemetry(0, 100), telemetry(240, 200), telemetry(480, 300), telemetry(720, 250)];

  it('matches speed to position by absolute time', () => {
    const map = buildTrackMap(square, speeds);
    expect(map.points.map((p) => p.speed)).toEqual([100, 200, 300, 250]);
    expect(map.speedRange).toEqual({ min: 100, max: 300 });
  });

  it('interpolates when the two feeds are not sampled in step', () => {
    // A position sample landing midway between two telemetry samples.
    const offset = [point(120, 150, 100), point(360, 200, 150)];
    const map = buildTrackMap(offset, speeds);
    expect(map.points[0]!.speed).toBeCloseTo(150, 6);
    expect(map.points[1]!.speed).toBeCloseTo(250, 6);
  });

  it('leaves speed null when there is no telemetry', () => {
    const map = buildTrackMap(square, []);
    expect(map.points.every((p) => p.speed === null)).toBe(true);
    expect(map.speedRange).toBeNull();
  });
});

describe('braking zones', () => {
  it('finds contiguous runs where the brake was on', () => {
    const withBraking = [
      telemetry(0, 300, 0),
      telemetry(240, 250, 100),
      telemetry(480, 150, 100),
      telemetry(720, 200, 0),
    ];
    const map = buildTrackMap(square, withBraking);
    expect(map.brakingZones).toEqual([{ from: 1, to: 2 }]);
  });

  it('closes a zone that runs to the end of the lap', () => {
    const braking = [
      telemetry(0, 300, 0),
      telemetry(240, 250, 0),
      telemetry(480, 150, 100),
      telemetry(720, 100, 100),
    ];
    const map = buildTrackMap(square, braking);
    expect(map.brakingZones).toEqual([{ from: 2, to: 3 }]);
  });

  it('separates two braking zones', () => {
    const points = [
      point(0, 10, 10),
      point(240, 20, 10),
      point(480, 30, 10),
      point(720, 40, 10),
      point(960, 50, 10),
    ];
    const braking = [
      telemetry(0, 300, 100),
      telemetry(240, 300, 0),
      telemetry(480, 300, 100),
      telemetry(720, 300, 0),
      telemetry(960, 300, 0),
    ];
    const map = buildTrackMap(points, braking);
    expect(map.brakingZones).toEqual([
      { from: 0, to: 0 },
      { from: 2, to: 2 },
    ]);
  });

  it('reports no zones when the driver never braked', () => {
    const map = buildTrackMap(square, [telemetry(0, 300), telemetry(720, 300)]);
    expect(map.brakingZones).toEqual([]);
  });
});

describe('speedColour', () => {
  const range = { min: 100, max: 300 };

  it('puts the slow end at the dark stop and the fast end at the light one', () => {
    expect(speedColour(100, range)).toBe('rgb(24, 79, 149)'); // SPEED_RAMP[0]
    expect(speedColour(300, range)).toBe('rgb(205, 226, 251)'); // last stop
  });

  it('interpolates between stops', () => {
    const middle = speedColour(200, range);
    expect(middle).not.toBe(speedColour(100, range));
    expect(middle).not.toBe(speedColour(300, range));
  });

  it('gets lighter as speed rises', () => {
    const lightness = (colour: string) =>
      (colour.match(/\d+/g) ?? []).reduce((sum, value) => sum + Number(value), 0);
    expect(lightness(speedColour(120, range))).toBeLessThan(lightness(speedColour(180, range)));
    expect(lightness(speedColour(180, range))).toBeLessThan(lightness(speedColour(280, range)));
  });

  it('clamps values outside the range', () => {
    expect(speedColour(50, range)).toBe(speedColour(100, range));
    expect(speedColour(400, range)).toBe(speedColour(300, range));
  });

  it('falls back to a mid stop without a usable range', () => {
    expect(speedColour(200, null)).toBe(SPEED_RAMP[2]);
    expect(speedColour(null, range)).toBe(SPEED_RAMP[2]);
    expect(speedColour(200, { min: 5, max: 5 })).toBe(SPEED_RAMP[2]);
  });
});
