import { describe, expect, it } from 'vitest';
import {
  safetyCarOpportunity,
  SAFETY_CAR_PIT_LOSS_FACTOR,
  VSC_PIT_LOSS_FACTOR,
  type SafetyCarDriverInput,
  type SafetyCarInput,
} from './safety-car';

function driver(
  driverNumber: number,
  label: string,
  tyreAge: number,
  slope: number | null = 0.05,
  position: number | null = null,
): SafetyCarDriverInput {
  return { driverNumber, label, tyreAge, slope, pitCount: 0, position };
}

const base: SafetyCarInput = {
  status: 'sc',
  pitLoss: 22,
  currentLap: 20,
  totalLaps: 53,
  drivers: [driver(1, 'VER', 20), driver(44, 'HAM', 5)],
};

describe('safetyCarOpportunity', () => {
  it('is inactive under green flags', () => {
    const result = safetyCarOpportunity({ ...base, status: 'green' });
    expect(result.active).toBe(false);
    expect(result.kind).toBeNull();
    expect(result.candidates).toEqual([]);
    expect(result.normalPitLoss).toBe(22);
  });

  it('is inactive under a yellow flag, which does not slow the whole field', () => {
    expect(safetyCarOpportunity({ ...base, status: 'yellow' }).active).toBe(false);
  });

  it('discounts the pit loss under a safety car', () => {
    const result = safetyCarOpportunity(base);
    expect(result.active).toBe(true);
    expect(result.kind).toBe('sc');
    expect(result.reducedPitLoss).toBeCloseTo(22 * SAFETY_CAR_PIT_LOSS_FACTOR, 6);
    expect(result.saving).toBeCloseTo(22 - 22 * SAFETY_CAR_PIT_LOSS_FACTOR, 6);
  });

  it('discounts a VSC less than a full safety car', () => {
    const sc = safetyCarOpportunity(base);
    const vsc = safetyCarOpportunity({ ...base, status: 'vsc' });
    expect(vsc.reducedPitLoss).toBeCloseTo(22 * VSC_PIT_LOSS_FACTOR, 6);
    expect(vsc.reducedPitLoss).toBeGreaterThan(sc.reducedPitLoss);
    expect(vsc.saving).toBeLessThan(sc.saving);
  });

  it('makes a stop free under a red flag', () => {
    const result = safetyCarOpportunity({ ...base, status: 'red' });
    expect(result.kind).toBe('red');
    expect(result.reducedPitLoss).toBe(0);
    expect(result.saving).toBe(22);
  });

  it('ranks the oldest tyres first', () => {
    const result = safetyCarOpportunity(base);
    expect(result.candidates.map((c) => c.label)).toEqual(['VER', 'HAM']);
    // 20 laps old at 0.05 s/lap of age.
    expect(result.candidates[0]!.perLapDeficit).toBeCloseTo(1.0, 6);
  });

  it('flags a driver for whom the caution changes the decision', () => {
    /*
     * 8 laps old gives 0.4 s/lap. At the green-flag loss of 22s that needs 55
     * laps to repay, more than the 33 remaining. At the safety car price of
     * 9.9s it needs 25, which fits — so the caution unlocks the stop.
     */
    const result = safetyCarOpportunity({
      ...base,
      drivers: [driver(11, 'PER', 8)],
    });
    const candidate = result.candidates[0]!;
    expect(candidate.unlockedByCaution).toBe(true);
    expect(candidate.breakEvenLaps).toBe(25);
  });

  it('does not flag a driver whose stop was already worth making', () => {
    // 20 laps old gives 1.0 s/lap, repaying 22s in 22 laps of the 33 remaining.
    const result = safetyCarOpportunity({ ...base, drivers: [driver(1, 'VER', 20)] });
    expect(result.candidates[0]!.unlockedByCaution).toBe(false);
    // The stop is still cheaper, it just was not the caution that justified it.
    expect(result.candidates[0]!.saving).toBeGreaterThan(0);
  });

  it('does not flag a driver whose stop is hopeless even when discounted', () => {
    // Two laps left: nothing repays a stop.
    const result = safetyCarOpportunity({
      ...base,
      currentLap: 51,
      drivers: [driver(1, 'VER', 30)],
    });
    expect(result.candidates[0]!.unlockedByCaution).toBe(false);
  });

  it('puts an unlocked driver ahead of one with older tyres', () => {
    const result = safetyCarOpportunity({
      ...base,
      drivers: [driver(1, 'VER', 20), driver(11, 'PER', 8)],
    });
    // VER has the bigger deficit, but PER is the one the caution actually helps.
    expect(result.candidates[0]!.label).toBe('PER');
    expect(result.candidates[0]!.unlockedByCaution).toBe(true);
  });

  it('handles a driver with no measurable degradation', () => {
    const result = safetyCarOpportunity({
      ...base,
      drivers: [driver(99, 'UNK', 10, null)],
    });
    const candidate = result.candidates[0]!;
    expect(candidate.perLapDeficit).toBeNull();
    expect(candidate.breakEvenLaps).toBeNull();
    expect(candidate.unlockedByCaution).toBe(false);
    // The saving on the stop itself is still real.
    expect(candidate.saving).toBeGreaterThan(0);
  });

  it('never reports a break-even for a driver on fresh tyres', () => {
    const result = safetyCarOpportunity({ ...base, drivers: [driver(1, 'VER', 0)] });
    expect(result.candidates[0]!.perLapDeficit).toBe(0);
    expect(result.candidates[0]!.breakEvenLaps).toBeNull();
  });

  it('accepts overridden reduction factors', () => {
    const result = safetyCarOpportunity({ ...base, factors: { sc: 0.25 } });
    expect(result.reducedPitLoss).toBeCloseTo(5.5, 6);
  });
});
