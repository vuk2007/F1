import { describe, expect, it } from 'vitest';
import {
  undercutSimulation,
  type UndercutCar,
  type UndercutInput,
  type UndercutResult,
} from './undercut';

/**
 * Signed gap at the end: positive means B is still behind A. Comparisons need
 * the sign, which `marginSeconds` deliberately drops.
 */
const finalGap = (result: UndercutResult) => result.timeline[result.timeline.length - 1]!.gap;

/** A leader on an old set. */
const leader: UndercutCar = {
  label: 'A',
  startDeficit: 0,
  baseLapTime: 80,
  slope: 0.05,
  tyreAge: 20,
  pitLap: 25,
};

/** A chaser 1.5s behind on an equally old set. */
const chaser: UndercutCar = {
  label: 'B',
  startDeficit: 1.5,
  baseLapTime: 80,
  slope: 0.05,
  tyreAge: 20,
  pitLap: 25,
};

const base: UndercutInput = {
  startLap: 20,
  endLap: 32,
  pitLoss: 22,
  a: leader,
  b: chaser,
};

describe('undercutSimulation', () => {
  it('keeps the order when both cars pit on the same lap', () => {
    const result = undercutSimulation(base);
    // Identical cars, identical strategies: the 1.5s gap is simply preserved.
    expect(result.aheadAtEnd).toBe('A');
    expect(result.marginSeconds).toBeCloseTo(1.5, 6);
    expect(result.swapped).toBe(false);
    expect(result.crossoverLap).toBeNull();
  });

  it('lets the chaser undercut when the gap is inside one lap of tyre advantage', () => {
    /*
     * One lap of undercut is worth exactly the per-lap deficit of the old set:
     * slope 0.05 x age 25 = 1.25s. That overturns a 0.5s gap but would not have
     * overturned 1.5s, which is the whole reason undercuts are attempted early
     * in a stint's life rather than late.
     */
    const result = undercutSimulation({
      ...base,
      b: { ...chaser, startDeficit: 0.5, pitLap: 24 },
      endLap: 28,
    });
    expect(result.aheadAtEnd).toBe('B');
    expect(result.swapped).toBe(true);
    expect(result.crossoverLap).not.toBeNull();
  });

  it('fails the same undercut against a gap wider than the tyre advantage', () => {
    const result = undercutSimulation({
      ...base,
      b: { ...chaser, startDeficit: 1.5, pitLap: 24 },
      endLap: 28,
    });
    expect(result.aheadAtEnd).toBe('A');
    expect(result.swapped).toBe(false);
  });

  it('fails the undercut when the gap is too large to overturn', () => {
    const result = undercutSimulation({
      ...base,
      b: { ...chaser, startDeficit: 8, pitLap: 24 },
      endLap: 30,
    });
    expect(result.aheadAtEnd).toBe('A');
    expect(result.swapped).toBe(false);
  });

  it('gives a bigger undercut the more laps of advantage are banked', () => {
    const oneLap = undercutSimulation({ ...base, b: { ...chaser, pitLap: 24 } });
    const threeLaps = undercutSimulation({ ...base, b: { ...chaser, pitLap: 22 } });
    // A smaller signed gap means B has closed more ground.
    expect(finalGap(threeLaps)).toBeLessThan(finalGap(oneLap));
  });

  it('models the overcut as a car that never pits in the window', () => {
    // A stays out past the end of the simulation; B stops and takes the pit loss.
    const result = undercutSimulation({
      ...base,
      a: { ...leader, pitLap: 999 },
      b: { ...chaser, pitLap: 21 },
      endLap: 24,
    });
    // Over a short horizon the 22s stop has not been repaid, so A is still ahead.
    expect(result.aheadAtEnd).toBe('A');
    expect(result.marginSeconds).toBeGreaterThan(10);
  });

  it('lets the stopped car come back past once the stop is repaid', () => {
    const short = undercutSimulation({
      ...base,
      a: { ...leader, pitLap: 999 },
      b: { ...chaser, pitLap: 21 },
      endLap: 24,
    });
    const long = undercutSimulation({
      ...base,
      a: { ...leader, pitLap: 999 },
      b: { ...chaser, pitLap: 21 },
      endLap: 60,
    });
    // A's tyres keep ageing while B's are fresh, so the deficit shrinks over time.
    expect(long.marginSeconds).toBeLessThan(short.marginSeconds);
  });

  it('charges the pit loss exactly once, on the pit lap', () => {
    const noStop = undercutSimulation({
      ...base,
      a: { ...leader, pitLap: 999 },
      b: { ...chaser, pitLap: 999 },
    });
    const aStops = undercutSimulation({
      ...base,
      a: { ...leader, pitLap: 25 },
      b: { ...chaser, pitLap: 999 },
    });
    const lastNo = noStop.timeline[noStop.timeline.length - 1]!;
    const lastA = aStops.timeline[aStops.timeline.length - 1]!;
    // A's elapsed time grows by the pit loss, minus what the fresh tyre gives back.
    expect(lastA.aElapsed - lastNo.aElapsed).toBeGreaterThan(0);
    expect(lastA.aElapsed - lastNo.aElapsed).toBeLessThan(22);
  });

  it('penalises fitting a slower compound', () => {
    const sameCompound = undercutSimulation({ ...base, b: { ...chaser, pitLap: 24 } });
    const slowerCompound = undercutSimulation({
      ...base,
      b: { ...chaser, pitLap: 24, compoundOffset: 0.6 },
    });
    // Fitting a slower tyre leaves B further behind, so the signed gap grows.
    expect(finalGap(slowerCompound)).toBeGreaterThan(finalGap(sameCompound));
  });

  it('reports a timeline covering every lap of the window', () => {
    const result = undercutSimulation(base);
    expect(result.timeline).toHaveLength(13); // laps 20..32 inclusive
    expect(result.timeline[0]!.lap).toBe(20);
    expect(result.timeline[12]!.lap).toBe(32);
    // Elapsed time only ever increases.
    for (let i = 1; i < result.timeline.length; i += 1) {
      expect(result.timeline[i]!.aElapsed).toBeGreaterThan(result.timeline[i - 1]!.aElapsed);
    }
  });

  it('records the lap the order actually changed on', () => {
    const result = undercutSimulation({
      ...base,
      b: { ...chaser, startDeficit: 1.0, pitLap: 24 },
    });
    /*
     * Lap 24 is B's in-lap, so B is 22s down at the end of it. The order only
     * changes on lap 25, when A takes its own stop and B's fresh tyre has
     * already banked a lap. The crossover is the lap the positions actually
     * swap on track, not the lap the undercut was launched.
     */
    expect(result.crossoverLap).toBe(25);
  });

  it('gives the undercut back when the advantage is marginal', () => {
    const result = undercutSimulation({
      ...base,
      b: { ...chaser, startDeficit: 1.0, pitLap: 24 },
      endLap: 32,
    });

    /*
     * B takes the place on lap 25 by 0.25s, but having pitted a lap earlier its
     * tyre is permanently one lap older, so it bleeds 0.05s a lap and is back
     * behind by lap 32. This is the undercut being "given back", and a model
     * that only reported the crossover would call it a success.
     */
    expect(result.crossoverLap).toBe(25);
    expect(result.aheadAtEnd).toBe('A');
    expect(result.marginSeconds).toBeLessThan(0.5);
  });

  it('holds the undercut over a short horizon', () => {
    const result = undercutSimulation({
      ...base,
      b: { ...chaser, startDeficit: 1.0, pitLap: 24 },
      endLap: 28,
    });
    expect(result.aheadAtEnd).toBe('B');
  });

  it('handles a single-lap window without dividing by anything', () => {
    const result = undercutSimulation({ ...base, endLap: 20 });
    expect(result.timeline).toHaveLength(1);
    expect(result.marginSeconds).toBeCloseTo(1.5, 6);
  });
});
