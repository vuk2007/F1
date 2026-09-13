import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CarData } from '@/lib/openf1/types';
import { boostCandidate, energyStory, harvestLift, straightModeSegments } from './energy';
import { toDistanceSeries, type TelemetryPoint } from './telemetry';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

/** Real car_data for laps 20-24, split into laps by each lap's start and duration. */
function laps(file: string): TelemetryPoint[][] {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')) as {
    laps: { lap_number: number; date_start: string; lap_duration: number | null }[];
    samples: CarData[];
  };
  return raw.laps
    .filter((lap) => lap.lap_duration != null)
    .map((lap) => {
      const from = Date.parse(lap.date_start);
      const to = from + lap.lap_duration! * 1000;
      return toDistanceSeries(
        raw.samples.filter((s) => {
          const t = Date.parse(s.date);
          return t >= from && t < to;
        }),
      );
    })
    .filter((points) => points.length > 50);
}

function point(distance: number, speed: number, throttle: number, brake = 0): TelemetryPoint {
  return {
    distance,
    time: distance / 80,
    dateMs: distance,
    speed,
    throttle,
    brake,
    gear: 8,
    drs: 0,
  };
}

describe('harvestLift', () => {
  it('finds a lift before braking at the end of a straight', () => {
    const lap = [
      point(0, 290, 100),
      point(80, 305, 100),
      point(160, 312, 100),
      point(240, 310, 0),
      point(318, 304, 0),
      point(395, 280, 0, 100),
      point(460, 200, 0, 100),
    ];
    expect(harvestLift(lap)).toEqual([
      {
        startDistance: 240,
        brakeDistance: 395,
        metresBeforeBraking: 155,
        speedAtLift: 310,
        samples: 2,
      },
    ]);
  });

  it('ignores a single-sample lift, which at 3.7 Hz is noise', () => {
    const lap = [
      point(0, 300, 100),
      point(80, 310, 100),
      point(160, 308, 0),
      point(240, 290, 0, 100),
    ];
    expect(harvestLift(lap)).toEqual([]);
  });

  it('ignores lifting in a slow corner, far below the top speed of the straight', () => {
    const lap = [
      point(0, 300, 100),
      point(80, 150, 40),
      point(120, 140, 0),
      point(160, 138, 0),
      point(200, 120, 0, 100),
    ];
    expect(harvestLift(lap)).toEqual([]);
  });

  it('sees 2026 cars lifting where the 2025 cars did not, on the same Monza laps', () => {
    const lifts2026 = laps('monza-2026-car-12-laps-20-24.json').flatMap(harvestLift);
    const lifts2025 = laps('monza-2025-car-1-laps-20-24.json').flatMap(harvestLift);
    expect(lifts2026.length).toBeGreaterThan(0);
    expect(lifts2025.length).toBeLessThan(lifts2026.length);
    for (const lift of lifts2026) {
      // Early, but not absurdly: a real lift is metres to a couple of hundred metres.
      expect(lift.metresBeforeBraking).toBeGreaterThan(0);
      expect(lift.metresBeforeBraking).toBeLessThan(250);
      expect(lift.speedAtLift).toBeGreaterThan(250);
    }
  });
});

describe('straightModeSegments', () => {
  const rising = (cap: number) =>
    Array.from({ length: 21 }, (_, i) => point(i * 50, Math.min(cap, 250 + i * 10), 100));

  it('marks speed still rising where the reference lap had levelled off', () => {
    const segments = straightModeSegments(rising(330), rising(300));
    expect(segments).toHaveLength(1);
    expect(segments[0]!.fromDistance).toBe(250);
    expect(segments[0]!.speedAdvantage).toBeGreaterThan(20);
  });

  it('marks nothing when the lap and its reference are the same', () => {
    expect(straightModeSegments(rising(300), rising(300))).toEqual([]);
  });
});

describe('boostCandidate', () => {
  const flat = (speed: number, throttle: number) =>
    Array.from({ length: 13 }, (_, i) => point(i * 25, speed, throttle));

  it('flags extra speed on no more throttle', () => {
    expect(boostCandidate(flat(292, 100), flat(280, 100))).toEqual([
      { fromDistance: 0, toDistance: 300, speedAdvantage: 12 },
    ]);
  });

  it('does not flag extra speed that came from more throttle', () => {
    expect(boostCandidate(flat(292, 100), flat(280, 80))).toEqual([]);
  });

  it('does not treat a real lap as boosting against itself', () => {
    const lap = laps('monza-2026-car-12-laps-20-24.json')[1]!;
    expect(boostCandidate(lap, lap)).toEqual([]);
  });
});

describe('energyStory', () => {
  it('needs three laps before saying anything', () => {
    expect(
      energyStory([
        { lifts: 3, boosts: 0 },
        { lifts: 3, boosts: 0 },
      ]).enough,
    ).toBe(false);
  });

  it('reads many lifts and no deployment as conserving, the reverse as attacking', () => {
    expect(
      energyStory([
        { lifts: 3, boosts: 0 },
        { lifts: 2, boosts: 0 },
        { lifts: 3, boosts: 1 },
      ]),
    ).toMatchObject({ style: 'conserving', confidence: 'low', enough: true });
    expect(
      energyStory([
        { lifts: 0, boosts: 2 },
        { lifts: 1, boosts: 1 },
        { lifts: 0, boosts: 1 },
      ]).style,
    ).toBe('attacking');
    expect(
      energyStory([
        { lifts: 1, boosts: 0 },
        { lifts: 1, boosts: 1 },
        { lifts: 2, boosts: 0 },
      ]).style,
    ).toBe('balanced');
  });

  it('only reads the last three laps', () => {
    expect(
      energyStory([
        { lifts: 9, boosts: 0 },
        { lifts: 0, boosts: 2 },
        { lifts: 0, boosts: 1 },
        { lifts: 1, boosts: 1 },
      ]).style,
    ).toBe('attacking');
  });
});
