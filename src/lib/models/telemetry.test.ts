import { describe, expect, it } from 'vitest';
import type { CarData, Lap } from '@/lib/openf1/types';
import {
  buildComparison,
  fullThrottleShare,
  lapWindow,
  toDistanceSeries,
  topSpeed,
  type TelemetryPoint,
} from './telemetry';

const T0 = Date.parse('2025-01-01T12:00:00.000Z');

function sample(offsetMs: number, speed: number, extra: Partial<CarData> = {}): CarData {
  return {
    brake: 0,
    date: new Date(T0 + offsetMs).toISOString(),
    drs: 0,
    driver_number: 1,
    meeting_key: 1,
    n_gear: 8,
    rpm: 11000,
    session_key: 1,
    speed,
    throttle: 100,
    ...extra,
  };
}

describe('lapWindow', () => {
  it('spans the lap from its start for its duration', () => {
    const lap = {
      date_start: '2025-09-07T13:43:49.709000+00:00',
      lap_duration: 82.928,
    } as Lap;
    const window = lapWindow(lap)!;
    expect(Date.parse(window.to) - Date.parse(window.from)).toBeCloseTo(82928, 0);
  });

  it('returns null without a start time or duration', () => {
    expect(lapWindow({ date_start: null, lap_duration: 80 } as Lap)).toBeNull();
    expect(lapWindow({ date_start: '2025-01-01T00:00:00Z', lap_duration: null } as Lap)).toBeNull();
  });
});

describe('toDistanceSeries', () => {
  it('integrates a constant speed into the right distance', () => {
    // 360 km/h = 100 m/s, held for 10s = 1000m.
    const samples = Array.from({ length: 11 }, (_, i) => sample(i * 1000, 360));
    const points = toDistanceSeries(samples);

    expect(points).toHaveLength(11);
    expect(points[0]!.distance).toBe(0);
    expect(points[10]!.distance).toBeCloseTo(1000, 6);
    expect(points[10]!.time).toBeCloseTo(10, 6);
  });

  it('averages across each interval rather than holding the first value', () => {
    // 0 -> 360 km/h over 1s. Trapezoidal gives 50m; left-endpoint would give 0.
    const points = toDistanceSeries([sample(0, 0), sample(1000, 360)]);
    expect(points[1]!.distance).toBeCloseTo(50, 6);
  });

  it('produces distance that never goes backwards', () => {
    const speeds = [100, 250, 80, 300, 150, 330];
    const points = toDistanceSeries(speeds.map((s, i) => sample(i * 240, s)));
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]!.distance).toBeGreaterThanOrEqual(points[i - 1]!.distance);
    }
  });

  it('sorts out-of-order samples before integrating', () => {
    const ordered = toDistanceSeries([sample(0, 360), sample(1000, 360), sample(2000, 360)]);
    const shuffled = toDistanceSeries([sample(2000, 360), sample(0, 360), sample(1000, 360)]);
    expect(shuffled.map((p) => p.distance)).toEqual(ordered.map((p) => p.distance));
  });

  it('carries every channel through', () => {
    const points = toDistanceSeries([
      sample(0, 300, { throttle: 80, brake: 0, n_gear: 7, drs: 12 }),
    ]);
    expect(points[0]).toMatchObject({ speed: 300, throttle: 80, brake: 0, gear: 7, drs: 12 });
  });

  it('returns nothing for no samples or unparseable dates', () => {
    expect(toDistanceSeries([])).toEqual([]);
    expect(toDistanceSeries([sample(0, 100, { date: 'nonsense' })])).toEqual([]);
  });
});

describe('buildComparison', () => {
  /** A 1000m lap at a constant 100 m/s, sampled every second. */
  const fastLap = toDistanceSeries(Array.from({ length: 11 }, (_, i) => sample(i * 1000, 360)));
  /** The same 1000m at half the speed, so it takes twice as long. */
  const slowLap = toDistanceSeries(Array.from({ length: 21 }, (_, i) => sample(i * 1000, 180)));

  it('samples onto a fixed distance grid', () => {
    const rows = buildComparison(fastLap, null, 100);
    expect(rows.map((r) => r.distance)).toEqual([
      0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
    ]);
  });

  it('interpolates a channel between samples', () => {
    const ramp = toDistanceSeries([sample(0, 360), sample(1000, 360)]);
    const rows = buildComparison(ramp, null, 50);
    // Constant speed, so every interpolated point is the same.
    expect(rows.every((r) => Math.abs((r.speedA ?? 0) - 360) < 1e-6)).toBe(true);
  });

  it('leaves the B channels null when there is no comparison lap', () => {
    const rows = buildComparison(fastLap, null, 100);
    expect(rows.every((r) => r.speedB === null && r.delta === null)).toBe(true);
  });

  it('compares two laps at the same point on track, not the same moment', () => {
    const rows = buildComparison(fastLap, slowLap, 100);
    // At 500m the quick lap has taken 5s and the slow one 10s.
    const halfway = rows.find((r) => r.distance === 500)!;
    expect(halfway.speedA).toBeCloseTo(360, 6);
    expect(halfway.speedB).toBeCloseTo(180, 6);
    expect(halfway.delta).toBeCloseTo(-5, 6);
  });

  it('grows the delta as the quicker car pulls away', () => {
    const rows = buildComparison(fastLap, slowLap, 100);
    const deltas = rows.map((r) => r.delta!).filter((d) => Number.isFinite(d));
    for (let i = 1; i < deltas.length; i += 1) {
      expect(deltas[i]!).toBeLessThanOrEqual(deltas[i - 1]! + 1e-9);
    }
    expect(deltas[deltas.length - 1]!).toBeCloseTo(-10, 6);
  });

  it('does not average discrete channels into impossible values', () => {
    const braking = toDistanceSeries([
      sample(0, 360, { brake: 0, n_gear: 8 }),
      sample(1000, 360, { brake: 100, n_gear: 3 }),
    ]);
    const rows = buildComparison(braking, null, 10);
    // Brake is only ever 0 or 100; gear is only ever a real gear.
    expect(rows.every((r) => r.brakeA === 0 || r.brakeA === 100)).toBe(true);
    expect(rows.every((r) => r.gearA === 8 || r.gearA === 3)).toBe(true);
  });

  it('returns nothing when the reference lap has no telemetry', () => {
    expect(buildComparison([], slowLap)).toEqual([]);
  });
});

describe('topSpeed', () => {
  it('finds the peak and where it happened', () => {
    const points = toDistanceSeries([sample(0, 200), sample(1000, 334), sample(2000, 180)]);
    const peak = topSpeed(points)!;
    expect(peak.speed).toBe(334);
    expect(peak.distance).toBeGreaterThan(0);
  });

  it('returns null with no data', () => {
    expect(topSpeed([])).toBeNull();
  });
});

describe('fullThrottleShare', () => {
  it('measures the share of lap time at full throttle', () => {
    const points: TelemetryPoint[] = [
      { distance: 0, time: 0, speed: 300, throttle: 100, brake: 0, gear: 8, drs: 0 },
      { distance: 100, time: 1, speed: 300, throttle: 100, brake: 0, gear: 8, drs: 0 },
      { distance: 200, time: 2, speed: 200, throttle: 0, brake: 100, gear: 4, drs: 0 },
      { distance: 300, time: 3, speed: 200, throttle: 0, brake: 100, gear: 4, drs: 0 },
    ];
    // Two of the three intervals start at full throttle.
    expect(fullThrottleShare(points)).toBeCloseTo(2 / 3, 6);
  });

  it('returns null without enough samples', () => {
    expect(fullThrottleShare([])).toBeNull();
  });
});
