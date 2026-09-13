import { describe, expect, it } from 'vitest';
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Interval, Lap, Position } from '@/lib/openf1/types';
import { at, makeFixture } from './fixture';
import { driversInPitLane, gapTrend, keyBattles } from './battles';
import { timingTableAt } from './selectors';

/** Three cars over six 90-second laps, with interval samples at chosen moments. */
function battleDataset(intervalsFor44: [number, number][], intervalsFor16: [number, number][]) {
  const base = makeFixture();
  const drivers = [
    ...base.drivers,
    { ...base.drivers[0]!, driver_number: 16, name_acronym: 'LEC', full_name: 'Charles LECLERC' },
  ];

  const laps: Lap[] = [];
  for (const [driver, offset] of [
    [1, 0],
    [44, 1],
    [16, 2],
  ] as const) {
    for (let n = 1; n <= 6; n += 1) {
      laps.push({
        ...base.laps[0]!,
        driver_number: driver,
        lap_number: n,
        date_start: at((n - 1) * 90 + offset),
        lap_duration: 90,
        is_pit_out_lap: false,
      });
    }
  }

  const positions: Position[] = [1, 44, 16].map((driver, i) => ({
    date: at(0),
    driver_number: driver,
    meeting_key: 1000,
    position: i + 1,
    session_key: 9999,
  }));

  const interval = (driver: number, seconds: number, value: number): Interval => ({
    date: at(seconds),
    driver_number: driver,
    gap_to_leader: value,
    interval: value,
    meeting_key: 1000,
    session_key: 9999,
  });

  const dataset: SessionDataset = {
    ...base,
    drivers,
    laps,
    positions,
    pits: [],
    intervals: [
      ...intervalsFor44.map(([s, v]) => interval(44, s, v)),
      ...intervalsFor16.map(([s, v]) => interval(16, s, v)),
    ],
  };
  return dataset;
}

describe('gapTrend', () => {
  it('needs a tenth a lap of movement over three laps to call a trend', () => {
    expect(gapTrend(-0.8)).toBe('closing');
    expect(gapTrend(-0.3)).toBe('closing');
    expect(gapTrend(-0.2)).toBe('stable');
    expect(gapTrend(0.29)).toBe('stable');
    expect(gapTrend(0.5)).toBe('opening');
    expect(gapTrend(null)).toBe('unknown');
  });

  it('refuses to call a jump of several seconds a trend', () => {
    // Seen at Monza: ALB/ANT "closing" by 7.7 s in three laps, after a pit stop.
    expect(gapTrend(-7.7)).toBe('unknown');
    expect(gapTrend(4)).toBe('unknown');
  });
});

describe('keyBattles', () => {
  it('orders the closest fights first and measures the trend over three laps', () => {
    // HAM starts lap 2 at 91s and lap 5 at 361s; LEC at 92s and 362s.
    const dataset = battleDataset(
      [
        [91, 2.0],
        [361, 1.2],
      ],
      [
        [92, 0.4],
        [362, 0.9],
      ],
    );
    const time = T(400);
    const battles = keyBattles(dataset, timingTableAt(dataset, time), time);

    expect(
      battles.map((b) => `${b.chaser.driver.name_acronym}>${b.ahead.driver.name_acronym}`),
    ).toEqual(['LEC>HAM', 'HAM>VER']);

    const [lecHam, hamVer] = battles;
    expect(lecHam!.gap).toBeCloseTo(0.9, 6);
    expect(lecHam!.change).toBeCloseTo(0.5, 6);
    expect(lecHam!.trend).toBe('opening');
    expect(lecHam!.position).toBe(2);

    expect(hamVer!.change).toBeCloseTo(-0.8, 6);
    expect(hamVer!.trend).toBe('closing');
    expect(hamVer!.position).toBe(1);
  });

  it('reports an unknown trend before three laps have been run', () => {
    const dataset = battleDataset([[91, 1.5]], [[92, 2.5]]);
    const time = T(100);
    const battles = keyBattles(dataset, timingTableAt(dataset, time), time);

    expect(battles.every((b) => b.trend === 'unknown')).toBe(true);
  });

  it('leaves out cars too far apart to be fighting', () => {
    const dataset = battleDataset([[91, 5.0]], [[92, 1.0]]);
    const time = T(100);
    const battles = keyBattles(dataset, timingTableAt(dataset, time), time);

    expect(battles.map((b) => b.chaser.driver.name_acronym)).toEqual(['LEC']);
  });

  it('drops a gap change that is really a pit stop', () => {
    const dataset = battleDataset(
      [
        [91, 9.0],
        [361, 1.3],
      ],
      [[92, 2.5]],
    );
    const time = T(400);
    const hamVer = keyBattles(dataset, timingTableAt(dataset, time), time).find(
      (b) => b.chaser.driver.name_acronym === 'HAM',
    );

    expect(hamVer?.change).toBeNull();
    expect(hamVer?.trend).toBe('unknown');
  });

  it('caps the list', () => {
    const dataset = battleDataset([[91, 1.0]], [[92, 1.1]]);
    const time = T(100);
    expect(keyBattles(dataset, timingTableAt(dataset, time), time, 1)).toHaveLength(1);
  });
});

describe('driversInPitLane', () => {
  // The fixture has HAM entering the pit lane at 185s for 23.4s.
  it('includes a driver between pit entry and exit', () => {
    expect(driversInPitLane(makeFixture(), T(190))).toEqual([44]);
  });

  it('excludes them before entry and after exit', () => {
    expect(driversInPitLane(makeFixture(), T(184))).toEqual([]);
    expect(driversInPitLane(makeFixture(), T(209))).toEqual([]);
  });
});

function T(seconds: number): number {
  return Date.parse(at(seconds));
}
