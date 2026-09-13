import { describe, expect, it } from 'vitest';
import { at, makeFixture, T0 } from '@/lib/replay/fixture';
import { currentLapOf, snapshotAt } from './snapshot';

const ms = (seconds: number) => T0 + seconds * 1000;

describe('snapshotAt', () => {
  it('keeps only laps completed by that moment', () => {
    // VER completes lap 1 at 90 s and lap 2 at 178 s.
    const snap = snapshotAt(makeFixture(), ms(100));
    expect(snap.laps.filter((lap) => lap.driver_number === 1).map((lap) => lap.lap_number)).toEqual(
      [1],
    );
  });

  it('cuts a stint off at the lap the driver is on, hiding when it really ended', () => {
    /*
     * The fixture's HAM stint runs laps 1-3. At 100 s HAM is on lap 2, and a model
     * must not be able to read the 3 from the full table.
     */
    const snap = snapshotAt(makeFixture(), ms(100));
    const ham = snap.stints.find((stint) => stint.driver_number === 44);
    expect(ham?.lap_end).toBe(2);
  });

  it('hides a stint that has not started', () => {
    // VER's medium stint starts on lap 3, at 178 s.
    const early = snapshotAt(makeFixture(), ms(100));
    expect(early.stints.filter((stint) => stint.driver_number === 1)).toHaveLength(1);
    const later = snapshotAt(makeFixture(), ms(200));
    expect(later.stints.filter((stint) => stint.driver_number === 1)).toHaveLength(2);
  });

  it('keeps only stops and messages already made', () => {
    // HAM pits at 185 s; the safety car is deployed at 150 s.
    expect(snapshotAt(makeFixture(), ms(180)).pits).toHaveLength(0);
    expect(snapshotAt(makeFixture(), ms(190)).pits).toHaveLength(1);
    expect(snapshotAt(makeFixture(), ms(149)).raceControl.map((m) => m.message)).not.toContain(
      'SAFETY CAR DEPLOYED',
    );
  });

  it('does not change the dataset it was given', () => {
    const dataset = makeFixture();
    snapshotAt(dataset, ms(100));
    expect(dataset.stints.find((stint) => stint.driver_number === 44)?.lap_end).toBe(3);
  });

  it('ends the window at the snapshot moment', () => {
    expect(snapshotAt(makeFixture(), ms(100)).endMs).toBe(Date.parse(at(100)));
  });
});

describe('currentLapOf', () => {
  it('reads the lap a driver is on from the clipped stints', () => {
    expect(currentLapOf(snapshotAt(makeFixture(), ms(100)), 44)).toBe(2);
    expect(currentLapOf(snapshotAt(makeFixture(), ms(0)), 44)).toBeNull();
  });
});
