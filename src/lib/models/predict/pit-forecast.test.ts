import { describe, expect, it } from 'vitest';
import { makeFixture } from '@/lib/replay/fixture';
import {
  livePitLoss,
  optimalStops,
  pitForecast,
  rejoinIfPitNow,
  windowHalfWidth,
} from './pit-forecast';
import { snapshotAt } from './snapshot';
import { afterLap, syntheticRace } from './race.fixture';

describe('optimalStops', () => {
  it('evens out the stints, counting laps already on the set', () => {
    /*
     * 10 laps old at lap 10 of 60; one stop splits 60 laps of tyre use into two 30s.
     * At 0.05 s/lap that costs 43.8 s of wear + 22 s, against 28.8 s + 44 s for two
     * stops. (At 0.08 s/lap two stops win, 90 s to 92 s — the next test's territory.)
     */
    const plan = optimalStops({
      currentLap: 10,
      totalLaps: 60,
      tyreAge: 10,
      slope: 0.05,
      pitLoss: 22,
      stopsMade: 0,
    })!;
    expect(plan.stops).toBe(1);
    expect(plan.stopLaps).toEqual([30]);
  });

  it('chooses a second stop when wear is high enough to pay for it', () => {
    const plan = optimalStops({
      currentLap: 5,
      totalLaps: 60,
      tyreAge: 5,
      slope: 0.25,
      pitLoss: 20,
      stopsMade: 0,
    })!;
    expect(plan.stops).toBe(2);
    expect(plan.stopLaps[0]).toBeLessThan(plan.stopLaps[1]!);
  });

  it('never tells a driver who has not stopped to run to the end', () => {
    const plan = optimalStops({
      currentLap: 10,
      totalLaps: 53,
      tyreAge: 10,
      slope: 0.01,
      pitLoss: 21,
      stopsMade: 0,
    })!;
    expect(plan.stops).toBeGreaterThanOrEqual(1);
  });

  it('lets a driver who has stopped run to the end on low wear', () => {
    const plan = optimalStops({
      currentLap: 30,
      totalLaps: 53,
      tyreAge: 5,
      slope: 0.01,
      pitLoss: 21,
      stopsMade: 1,
    })!;
    expect(plan.stops).toBe(0);
  });

  it('has no plan without measurable wear', () => {
    expect(
      optimalStops({
        currentLap: 10,
        totalLaps: 60,
        tyreAge: 10,
        slope: 0,
        pitLoss: 22,
        stopsMade: 0,
      }),
    ).toBeNull();
  });
});

describe('windowHalfWidth', () => {
  it('is wide when wear is low and narrow when it is high', () => {
    expect(windowHalfWidth(0.01)).toBe(8);
    expect(windowHalfWidth(0.04)).toBe(5);
    expect(windowHalfWidth(0.25)).toBe(2);
  });
});

describe('pitForecast', () => {
  it('gives the best lap with a window around it, never in the past', () => {
    // 26 laps old at lap 26 of 60: two equal 30-lap stints put the stop on lap 30.
    const forecast = pitForecast({
      currentLap: 26,
      totalLaps: 60,
      tyreAge: 26,
      slope: 0.05,
      pitLoss: 22,
      stopsMade: 0,
      cleanLaps: 18,
      confidence: 'high',
    });
    expect(forecast.next!.optimalLap).toBe(30);
    expect(forecast.next!.from).toBeGreaterThanOrEqual(26);
    expect(forecast.next!.to).toBeGreaterThan(forecast.next!.optimalLap);
  });

  it('says there is not enough data under four clean laps', () => {
    const forecast = pitForecast({
      currentLap: 4,
      totalLaps: 60,
      tyreAge: 4,
      slope: 0.08,
      pitLoss: 22,
      stopsMade: 0,
      cleanLaps: 2,
      confidence: 'low',
    });
    expect(forecast.enough).toBe(false);
  });
});

describe('rejoinIfPitNow', () => {
  const gaps = [
    { driverNumber: 1, gapToLeader: 0 },
    { driverNumber: 4, gapToLeader: 3.2 },
    { driverNumber: 16, gapToLeader: 18.0 },
    { driverNumber: 44, gapToLeader: 24.5 },
    { driverNumber: 63, gapToLeader: 30.1 },
    { driverNumber: 18, gapToLeader: null },
  ];

  it('drops the driver behind every car closer than their gap plus the pit loss', () => {
    // NOR at 3.2 s + 22 s = 25.2 s: behind LEC (18.0) and HAM (24.5), ahead of RUS.
    expect(rejoinIfPitNow(gaps, 4, 22)).toEqual({
      position: 4,
      behind: 44,
      gapToCarAhead: 0.7,
      currentPosition: 2,
    });
  });

  it('can rejoin in the lead', () => {
    expect(
      rejoinIfPitNow(
        [
          { driverNumber: 1, gapToLeader: 0 },
          { driverNumber: 4, gapToLeader: 30 },
        ],
        1,
        22,
      ),
    ).toMatchObject({
      position: 1,
      behind: null,
    });
  });

  it('ignores lapped cars and returns null for a driver without a gap', () => {
    expect(rejoinIfPitNow(gaps, 63, 22)!.position).toBe(5);
    expect(rejoinIfPitNow(gaps, 18, 22)).toBeNull();
  });
});

describe('livePitLoss', () => {
  it('uses the circuit table before any stop has been seen', () => {
    const loss = livePitLoss(makeFixture());
    expect(loss.source).toBe('circuit-table');
    expect(loss.seconds).toBe(21);
  });

  it('switches to the loss this session measured once two green-flag stops are in', () => {
    // Every synthetic stop costs exactly PIT_LOSS = 22 s across its in- and out-lap.
    const race = syntheticRace(
      [
        {
          number: 1,
          acronym: 'AAA',
          base: 80,
          stints: [
            { compound: 'MEDIUM', laps: 15, wear: 0.03 },
            { compound: 'HARD', laps: 15, wear: 0.02 },
          ],
        },
        {
          number: 2,
          acronym: 'BBB',
          base: 80.5,
          stints: [
            { compound: 'MEDIUM', laps: 17, wear: 0.03 },
            { compound: 'HARD', laps: 13, wear: 0.02 },
          ],
        },
      ],
      30,
    );
    const before = livePitLoss(snapshotAt(race.dataset, afterLap(race, 1, 16)));
    expect(before.source).not.toBe('observed');

    const after = livePitLoss(snapshotAt(race.dataset, afterLap(race, 2, 20)));
    expect(after.source).toBe('observed');
    expect(after.stopsMeasured).toBe(2);
    /*
     * Within a second, not exactly 22: "normal" laps are taken from both sides of
     * the stop, on an old set and a new one, so the reference is slightly off the
     * in-lap's and out-lap's own tyre state. That bias is the method's, and small.
     */
    expect(Math.abs(after.seconds - 22)).toBeLessThan(1);
  });
});
