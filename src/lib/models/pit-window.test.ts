import { describe, expect, it } from 'vitest';
import { pitWindow, type PitWindowInput } from './pit-window';

const base: PitWindowInput = {
  currentLap: 20,
  totalLaps: 53,
  tyreAge: 20,
  slope: 0.05,
  pitLoss: 22,
};

describe('pitWindow', () => {
  it('computes the per-lap deficit against a fresh set', () => {
    // 20 laps old, losing 0.05s per lap of age => 1.0s/lap slower than fresh.
    const result = pitWindow(base);
    expect(result.perLapDeficit).toBeCloseTo(1.0, 10);
  });

  it('breaks even after pitLoss / deficit laps', () => {
    const result = pitWindow(base);
    // 22s to repay at 1.0s/lap.
    expect(result.breakEvenLaps).toBeCloseTo(22, 10);
    expect(result.lapsUntilStopPaysOff).toBe(22);
  });

  it('opens the window from the current lap to the last lap that still repays', () => {
    const result = pitWindow(base);
    // Break-even is 22 laps, so the last useful stop is lap 53 - 22 = 31.
    expect(result.window).toEqual({ earliest: 20, latest: 31 });
    expect(result.lapsRemaining).toBe(33);
  });

  it('says stay out on young tyres', () => {
    const result = pitWindow({ ...base, tyreAge: 2, currentLap: 3 });
    expect(result.perLapDeficit).toBeCloseTo(0.1, 10);
    expect(result.verdict).toBe('window-approaching');
  });

  it('says stay out when a fresh set would be no quicker', () => {
    // Tyres are new and the only compound left is 0.5s/lap slower.
    const result = pitWindow({ ...base, tyreAge: 1, compoundOffset: 0.5 });
    expect(result.perLapDeficit!).toBeLessThanOrEqual(0);
    expect(result.verdict).toBe('stay-out');
    expect(result.window).toBeNull();
    expect(result.breakEvenLaps).toBeNull();
  });

  it('calls for an immediate stop once the tyres are badly gone', () => {
    // 30 laps old at 0.05s/lap => 1.5s/lap deficit.
    const result = pitWindow({ ...base, tyreAge: 30, currentLap: 25 });
    expect(result.verdict).toBe('pit-now');
    expect(result.perLapDeficit).toBeCloseTo(1.5, 10);
  });

  it('says it is too late when not enough laps remain to repay the stop', () => {
    // 3 laps left, break-even is 22.
    const result = pitWindow({ ...base, currentLap: 50 });
    expect(result.verdict).toBe('too-late');
    expect(result.window).toBeNull();
  });

  it('accounts for a slower replacement compound', () => {
    const without = pitWindow(base);
    const withOffset = pitWindow({ ...base, compoundOffset: 0.5 });

    // Fitting a slower tyre eats into the gain, so repayment takes longer.
    expect(withOffset.perLapDeficit).toBeCloseTo(0.5, 10);
    expect(withOffset.breakEvenLaps!).toBeGreaterThan(without.breakEvenLaps!);
    expect(withOffset.breakEvenLaps).toBeCloseTo(44, 10);
  });

  it('repays sooner when the new tyre degrades more slowly', () => {
    const equal = pitWindow(base);
    const better = pitWindow({ ...base, newTyreSlope: 0.02 });
    expect(better.breakEvenLaps!).toBeLessThan(equal.breakEvenLaps!);
  });

  it('says stay out when the replacement degrades so fast it never repays', () => {
    // Old set loses 0.05s/lap of age, the new one 0.09s/lap. The advantage of
    // fresh rubber shrinks every lap and peaks well below the 22s pit loss, so
    // no amount of running pays the stop back.
    const worse = pitWindow({ ...base, newTyreSlope: 0.09 });
    expect(worse.verdict).toBe('stay-out');
    expect(worse.breakEvenLaps).toBeNull();
    expect(worse.window).toBeNull();
    // The deficit itself is still reported, it just cannot be recovered.
    expect(worse.perLapDeficit).toBeCloseTo(1.0, 10);
  });

  it('takes longer to repay when the new tyre degrades only slightly faster', () => {
    const equal = pitWindow(base);
    const worse = pitWindow({ ...base, newTyreSlope: 0.06 });
    expect(worse.breakEvenLaps!).toBeGreaterThan(equal.breakEvenLaps!);
  });

  it('scales the break-even with the cost of the stop', () => {
    const cheap = pitWindow({ ...base, pitLoss: 18 });
    const expensive = pitWindow({ ...base, pitLoss: 27 });
    expect(cheap.breakEvenLaps).toBeCloseTo(18, 10);
    expect(expensive.breakEvenLaps).toBeCloseTo(27, 10);
    // A cheaper stop keeps the window open later into the race.
    expect(cheap.window!.latest).toBeGreaterThan(expensive.window!.latest);
  });

  it('reports unknown when degradation could not be measured', () => {
    const result = pitWindow({ ...base, slope: null });
    expect(result.verdict).toBe('unknown');
    expect(result.perLapDeficit).toBeNull();
    expect(result.lapsRemaining).toBe(33);
  });

  it('never reports negative laps remaining past the flag', () => {
    expect(pitWindow({ ...base, currentLap: 60 }).lapsRemaining).toBe(0);
  });

  it('opens the window as the tyres age', () => {
    const young = pitWindow({ ...base, tyreAge: 10 });
    const old = pitWindow({ ...base, tyreAge: 30 });

    // Older tyres give away more per lap, so the stop repays in fewer laps.
    expect(old.breakEvenLaps!).toBeLessThan(young.breakEvenLaps!);

    // At 10 laps old the deficit is only 0.5s/lap, needing 44 laps to repay a 22s
    // stop — more than the 33 left, so there is no window yet on lap 20.
    expect(young.window).toBeNull();
    expect(old.window).not.toBeNull();
    expect(old.window!.latest).toBe(38);
  });
});
