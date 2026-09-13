import { describe, expect, it } from 'vitest';
import { cheapStop, type CheapStopDriver } from './cheap-stop';

const field: CheapStopDriver[] = [
  { driverNumber: 1, label: 'VER', gapToLeader: 0, position: 1, stopsMade: 0, compoundsUsed: 1 },
  { driverNumber: 4, label: 'NOR', gapToLeader: 4, position: 2, stopsMade: 0, compoundsUsed: 1 },
  { driverNumber: 16, label: 'LEC', gapToLeader: 9, position: 3, stopsMade: 1, compoundsUsed: 2 },
  { driverNumber: 44, label: 'HAM', gapToLeader: 14, position: 4, stopsMade: 0, compoundsUsed: 1 },
  { driverNumber: 63, label: 'RUS', gapToLeader: 21, position: 5, stopsMade: 0, compoundsUsed: 1 },
];

describe('cheapStop', () => {
  it('does nothing under green', () => {
    expect(cheapStop({ status: 'green', pitLoss: 22, drivers: field })).toMatchObject({
      active: false,
      drivers: [],
    });
  });

  it('counts positions gained against the same stop under green', () => {
    /*
     * Safety car: 22 s x 0.45 = 9.9 s. VER at 0 + 9.9 s comes out behind NOR (4 s)
     * and LEC (9 s), so P3. Under green, 22 s puts all four others ahead: P5.
     */
    const result = cheapStop({ status: 'sc', pitLoss: 22, drivers: field });
    expect(result.reducedPitLoss).toBe(9.9);
    const ver = result.drivers.find((d) => d.driverNumber === 1)!;
    expect(ver).toMatchObject({
      rejoinNow: 3,
      rejoinGreen: 5,
      positionsGained: 2,
      secondsSaved: 12.1,
    });
  });

  it('discounts a VSC less than a safety car', () => {
    const sc = cheapStop({ status: 'sc', pitLoss: 22, drivers: field });
    const vsc = cheapStop({ status: 'vsc', pitLoss: 22, drivers: field });
    expect(vsc.reducedPitLoss).toBeGreaterThan(sc.reducedPitLoss);
  });

  it('lists drivers who still need a stop first, most gained first', () => {
    const result = cheapStop({ status: 'sc', pitLoss: 22, drivers: field });
    const firstNotNeeding = result.drivers.findIndex((d) => !d.stillNeedsStop);
    expect(result.drivers.slice(firstNotNeeding).every((d) => !d.stillNeedsStop)).toBe(true);
    const needing = result.drivers.filter((d) => d.stillNeedsStop).map((d) => d.positionsGained);
    expect(needing).toEqual([...needing].sort((a, b) => b - a));
  });

  it('leaves out a lapped car with no timed gap', () => {
    const withLapped = [
      ...field,
      {
        driverNumber: 18,
        label: 'STR',
        gapToLeader: null,
        position: 20,
        stopsMade: 0,
        compoundsUsed: 1,
      },
    ];
    expect(
      cheapStop({ status: 'sc', pitLoss: 22, drivers: withLapped }).drivers.some(
        (d) => d.driverNumber === 18,
      ),
    ).toBe(false);
  });
});
