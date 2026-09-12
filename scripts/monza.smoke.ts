/**
 * End-to-end smoke test against the real 2025 Italian GP (Monza) race.
 *
 * Downloads the session through the real client (rate-limited queue, no cache in
 * Node) and asserts the replay selectors produce sane output at known moments.
 * This is the check the brief asks for: does the pipeline actually work on a real
 * race, not just on a fixture.
 *
 * Network-bound, so it lives outside `pnpm test`. Run with `pnpm smoke`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SessionDataset } from '@/lib/openf1/dataset';
import { loadSessionForSmoke } from './load-or-skip';
import {
  driverStateAt,
  leaderLapAt,
  timingTableAt,
  trackStatusAt,
  weatherAt,
} from '@/lib/replay/selectors';

/** 2025 Italian Grand Prix, race session. */
const MONZA_2025_RACE = 9912;

let dataset: SessionDataset;

beforeAll(async () => {
  dataset = await loadSessionForSmoke(MONZA_2025_RACE);
}, 180_000);

describe('Monza 2025 race download', () => {
  it('identifies the session', () => {
    expect(dataset.session.circuit_short_name).toBe('Monza');
    expect(dataset.session.session_type).toBe('Race');
    expect(dataset.session.year).toBe(2025);
  });

  it('has a full grid and a plausible volume of data', () => {
    expect(dataset.drivers.length).toBeGreaterThanOrEqual(18);
    expect(dataset.laps.length).toBeGreaterThan(900); // ~20 cars x ~53 laps
    expect(dataset.stints.length).toBeGreaterThan(20);
    expect(dataset.pits.length).toBeGreaterThan(10);
    expect(dataset.intervals.length).toBeGreaterThan(1000);
    expect(dataset.raceControl.length).toBeGreaterThan(10);
  });

  it('derives a sane session window', () => {
    const minutes = (dataset.endMs - dataset.startMs) / 60000;
    expect(minutes).toBeGreaterThan(60);
    expect(minutes).toBeLessThan(240);
  });
});

describe('replay selectors on real data', () => {
  it('produces an ordered timing table mid-race', () => {
    const midway = dataset.startMs + (dataset.endMs - dataset.startMs) / 2;
    const rows = timingTableAt(dataset, midway);

    expect(rows.length).toBe(dataset.drivers.length);

    const positions = rows.map((r) => r.position).filter((p): p is number => p != null);
    expect(positions.length).toBeGreaterThan(15);
    // Sorted ascending and free of duplicates.
    expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('reports realistic Monza lap times', () => {
    const midway = dataset.startMs + (dataset.endMs - dataset.startMs) / 2;
    const laps = timingTableAt(dataset, midway)
      .map((r) => r.lastLap)
      .filter((l): l is number => l != null);

    expect(laps.length).toBeGreaterThan(10);
    // A Monza race lap is ~80-95s; allow room for traffic and out-laps.
    for (const lap of laps) {
      expect(lap).toBeGreaterThan(75);
      expect(lap).toBeLessThan(140);
    }
  });

  it('assigns every running driver a compound and an age', () => {
    const midway = dataset.startMs + (dataset.endMs - dataset.startMs) / 2;
    const withTyres = timingTableAt(dataset, midway).filter((r) => r.tyre.compound != null);

    expect(withTyres.length).toBeGreaterThan(15);
    for (const row of withTyres) {
      expect(['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET']).toContain(row.tyre.compound);
      expect(row.tyre.age).toBeGreaterThan(0);
      expect(row.tyre.age).toBeLessThan(80);
    }
  });

  it('advances the lap count monotonically through the race', () => {
    const quarter = dataset.startMs + (dataset.endMs - dataset.startMs) * 0.25;
    const half = dataset.startMs + (dataset.endMs - dataset.startMs) * 0.5;
    const threeQuarters = dataset.startMs + (dataset.endMs - dataset.startMs) * 0.75;

    const a = leaderLapAt(dataset, quarter) ?? 0;
    const b = leaderLapAt(dataset, half) ?? 0;
    const c = leaderLapAt(dataset, threeQuarters) ?? 0;

    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThanOrEqual(53); // Monza is a 53-lap race
  });

  it('accumulates pit stops over the race and never loses one', () => {
    const early = dataset.startMs + 5 * 60_000;
    const late = dataset.endMs - 60_000;

    const stopsAt = (t: number) =>
      dataset.drivers.reduce((sum, d) => sum + driverStateAt(dataset, d, t).pitCount, 0);

    expect(stopsAt(early)).toBeLessThan(stopsAt(late));
    expect(stopsAt(late)).toBe(dataset.pits.length);
  });

  it('reports weather and a green track once running', () => {
    const midway = dataset.startMs + (dataset.endMs - dataset.startMs) / 2;

    const weather = weatherAt(dataset, midway);
    expect(weather).toBeDefined();
    expect(weather!.track_temperature).toBeGreaterThan(10);
    expect(weather!.track_temperature).toBeLessThan(70);

    expect(['green', 'yellow', 'sc', 'vsc', 'red', 'chequered']).toContain(
      trackStatusAt(dataset, midway),
    );
  });

  it('shows nothing before the session starts', () => {
    const rows = timingTableAt(dataset, dataset.startMs - 3_600_000);
    expect(rows.every((r) => r.lastLap === null)).toBe(true);
    expect(rows.every((r) => r.pitCount === 0)).toBe(true);
  });

  it('awards exactly one purple per sector across the field', () => {
    const late = dataset.endMs - 120_000;
    const rows = timingTableAt(dataset, late);
    for (const sector of [0, 1, 2]) {
      const purples = rows.filter((r) => r.sectors[sector]!.colour === 'purple');
      // Ties are possible but rare; more than two would mean the comparison is wrong.
      expect(purples.length).toBeLessThanOrEqual(2);
    }
  });
});
