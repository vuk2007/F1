import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { theoreticalBestLap } from '@/lib/models/best-lap';
import { cautionPeriods } from '@/lib/models/caution';
import { analyseDriverStints } from '@/lib/models/stint-analysis';
import type { SessionDataset } from '@/lib/openf1/dataset';
import { raceControlFeed, timingTableAt, weatherAt } from '@/lib/replay/selectors';
import { DatasetAccumulator } from './accumulate';
import { FeedState } from './feed-state';
import { lapCountOf, normalizeTopic, type NormalizeContext } from './normalize';

/**
 * The whole path, end to end, on a real session: feed snapshot → merge →
 * normalize → accumulate → `SessionDataset` → the app's own selectors and models.
 *
 * Each stage has its own tests, and they all pass while proving nothing about
 * whether the result is usable. This is the test that would have caught a dataset
 * the models quietly reject — the failure mode this project has hit repeatedly, and
 * the reason live mode targets the OpenF1 shapes instead of a shape of its own.
 */
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../bridge/fixtures/11365-spanish-grand-prix-qualifying-snapshot.json',
);

/** Replays a captured snapshot the way a live source would receive it. */
function buildFromSnapshot(): SessionDataset {
  const snapshot = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>;

  const state = new FeedState();
  state.reset(snapshot);

  const accumulator = new DatasetAccumulator();

  /*
   * SessionInfo first, so the session is in place before anything that needs its
   * keys — exactly the ordering a real snapshot arrives in.
   */
  const ordered = ['SessionInfo', ...Object.keys(snapshot).filter((t) => t !== 'SessionInfo')];

  for (const topic of ordered) {
    const value = state.get(topic);
    const ctx: NormalizeContext = {
      sessionKey: 11365,
      meetingKey: 1294,
      atIso: '2026-09-12T14:59:00.000Z',
      lapNumber: lapCountOf(snapshot.LapCount as undefined),
      qualifyingPhase: 3,
    };
    accumulator.apply(normalizeTopic(topic, value, ctx));
  }

  const dataset = accumulator.build();
  expect(dataset).not.toBeNull();
  return dataset!;
}

const dataset = buildFromSnapshot();

describe('a captured session through the whole live path', () => {
  it('produces a dataset with a clock the replay controls can use', () => {
    expect(dataset.session.session_key).toBe(11365);
    expect(dataset.startMs).toBe(Date.parse('2026-09-12T14:00:00.000Z'));
    // The snapshot was observed inside the session window, so the end holds.
    expect(dataset.endMs).toBeGreaterThan(dataset.startMs);
  });

  it('fills every collection the dataset contract declares', () => {
    expect(dataset.drivers).toHaveLength(22);
    expect(dataset.laps.length).toBeGreaterThan(0);
    expect(dataset.stints.length).toBeGreaterThan(0);
    expect(dataset.pits.length).toBeGreaterThan(0);
    expect(dataset.positions).toHaveLength(22);
    expect(dataset.raceControl.length).toBeGreaterThan(100);
    expect(dataset.weather).toHaveLength(1);
  });

  it('feeds the timing table selector', () => {
    const rows = timingTableAt(dataset, dataset.endMs);

    expect(rows).toHaveLength(22);
    expect(rows[0]?.position).toBe(1);
    // The table is what the first screen renders; an acronym missing here would
    // show as a blank row rather than as an error.
    expect(rows.every((row) => row.driver.name_acronym.length === 3)).toBe(true);
  });

  it('feeds the weather strip', () => {
    const weather = weatherAt(dataset, dataset.endMs);

    expect(weather?.air_temperature).toBeCloseTo(31.4, 3);
    expect(weather?.track_temperature).toBeCloseTo(53.8, 3);
  });

  it('feeds the race control feed, newest first as the selector promises', () => {
    const feed = raceControlFeed(dataset, dataset.endMs);

    expect(feed.length).toBeGreaterThan(100);
    const times = feed.map((row) => Date.parse(row.date));
    // The component renders in the order it is given and does not sort.
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('is accepted by the caution model, with no caution in this session', () => {
    // Nothing in this qualifying session was neutralised: the flags were sector
    // yellows, never a safety car or a red. An empty result here is correct, and
    // proves the model read the rows rather than throwing on them.
    expect(cautionPeriods(dataset.raceControl)).toEqual([]);
  });

  it('is accepted by the stint analysis model', () => {
    const analyses = analyseDriverStints(dataset, 1);

    expect(analyses.length).toBeGreaterThan(0);
    for (const analysis of analyses) {
      expect(analysis.stint.driver_number).toBe(1);
      // Ranges must be real, or every lap falls outside its stint.
      expect(analysis.stint.lap_end).toBeGreaterThanOrEqual(analysis.stint.lap_start);
    }
  });

  it('is accepted by the theoretical best lap model', () => {
    /*
     * Only car 1's in-lap carries sectors in a snapshot — the only lap whose three
     * sectors add up to its own time — so the ideal lap is that lap's sectors. The
     * point is that they arrived as seconds, not as the feed's "43.487" strings.
     */
    const car1 = dataset.laps.filter((lap) => lap.driver_number === 1);
    const best = theoreticalBestLap(car1);

    expect(best.theoretical).toBeCloseTo(43.487 + 42.861 + 44.472, 2);
  });

  it('puts every lap in exactly one stint', () => {
    /*
     * Car 1's in-lap was timed after its final stint record was written. It sits in
     * the current stint only because the accumulator runs that stint up to the
     * latest lap — which is what put the tyre back in the timing table. None means
     * a blank tyre column; two means the boundary numbering is wrong.
     */
    for (const lap of dataset.laps) {
      expect(lap.lap_number).toBeGreaterThan(0);
      const holding = dataset.stints.filter(
        (stint) =>
          stint.driver_number === lap.driver_number &&
          stint.lap_start <= lap.lap_number &&
          lap.lap_number <= stint.lap_end,
      );
      expect(holding.length, `lap ${lap.lap_number} of car ${lap.driver_number}`).toBe(1);
    }
  });

  it('puts every best lap inside the stint that set it', () => {
    // Best laps are the rows the feed pairs with a lap number outright, so each one
    // must land in exactly one stint.
    const bestLaps = dataset.laps.filter((lap) => lap.duration_sector_1 === null);
    expect(bestLaps.length).toBeGreaterThan(0);

    for (const lap of bestLaps) {
      const stints = dataset.stints.filter((stint) => stint.driver_number === lap.driver_number);
      if (stints.length === 0) continue;
      const holding = stints.filter(
        (stint) => stint.lap_start <= lap.lap_number && lap.lap_number <= stint.lap_end,
      );
      expect(holding.length, `lap ${lap.lap_number} of car ${lap.driver_number}`).toBe(1);
    }
  });
});
