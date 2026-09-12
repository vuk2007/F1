import { describe, expect, it } from 'vitest';
import { makeFixture, T0 } from './fixture';
import {
  currentLapNumber,
  driverStateAt,
  leaderLapAt,
  parseGap,
  sessionBestsAt,
  stintForLap,
  timingTableAt,
  trackStatusAt,
  tyreAgeOnLap,
  weatherAt,
} from './selectors';

/** Replay time, given seconds after the fixture's T0. */
const at = (seconds: number) => T0 + seconds * 1000;

describe('parseGap', () => {
  it('formats a numeric gap', () => {
    expect(parseGap(1.234)).toEqual({ seconds: 1.234, label: '+1.234', lapped: false });
  });

  it('treats a zero gap as no gap (the leader)', () => {
    expect(parseGap(0).seconds).toBe(0);
    expect(parseGap(0).label).toBe('—');
  });

  it('marks a lapped driver and keeps the original label', () => {
    expect(parseGap('+1 LAP')).toEqual({ seconds: null, label: '+1 LAP', lapped: true });
  });

  it('parses a numeric string as a number, not as lapped', () => {
    expect(parseGap('2.5')).toEqual({ seconds: 2.5, label: '+2.500', lapped: false });
  });

  it('handles null', () => {
    expect(parseGap(null)).toEqual({ seconds: null, label: '—', lapped: false });
  });
});

describe('tyreAgeOnLap', () => {
  it('counts laps completed on the set, including a scrubbed start', () => {
    const stint = {
      compound: 'HARD',
      driver_number: 44,
      lap_end: 3,
      lap_start: 1,
      meeting_key: 1,
      session_key: 1,
      stint_number: 1,
      tyre_age_at_start: 2,
    };
    expect(tyreAgeOnLap(stint, 1)).toBe(3);
    expect(tyreAgeOnLap(stint, 3)).toBe(5);
  });

  it('treats a missing age as a fresh set', () => {
    const stint = {
      compound: 'SOFT',
      driver_number: 1,
      lap_end: 10,
      lap_start: 5,
      meeting_key: 1,
      session_key: 1,
      stint_number: 2,
      tyre_age_at_start: null,
    };
    expect(tyreAgeOnLap(stint, 5)).toBe(1);
  });
});

describe('stintForLap', () => {
  it('finds the stint covering a lap and nothing outside it', () => {
    const dataset = makeFixture();
    expect(stintForLap(dataset.stints, 1, 2)?.compound).toBe('SOFT');
    expect(stintForLap(dataset.stints, 1, 3)?.compound).toBe('MEDIUM');
    expect(stintForLap(dataset.stints, 1, 99)).toBeUndefined();
  });
});

describe('sessionBestsAt', () => {
  it('is empty before any lap is completed', () => {
    expect(sessionBestsAt(makeFixture(), at(10))).toEqual({
      sector1: null,
      sector2: null,
      sector3: null,
      lap: null,
    });
  });

  it('reflects only laps completed so far, not the end-of-session best', () => {
    const dataset = makeFixture();
    // After VER lap 1 (90.0) but before anyone goes quicker.
    expect(sessionBestsAt(dataset, at(91)).lap).toBe(90);
    // After VER lap 2 (88.0).
    expect(sessionBestsAt(dataset, at(179)).lap).toBe(88);
    // After HAM lap 3 (87.0) — the fastest of the session.
    expect(sessionBestsAt(dataset, at(269)).lap).toBe(87);
  });

  it('tracks best sectors independently of best lap', () => {
    const dataset = makeFixture();
    const bests = sessionBestsAt(dataset, at(269));
    expect(bests.sector1).toBe(28); // HAM lap 3
    expect(bests.sector2).toBe(29); // VER lap 2 and HAM lap 3 tie
    expect(bests.sector3).toBe(30); // set on lap 1
  });
});

describe('currentLapNumber', () => {
  it('returns the lap in progress, not the last completed one', () => {
    const dataset = makeFixture();
    // VER lap 3 starts at 178s; at 200s he is on lap 3 but has not finished it.
    expect(currentLapNumber(dataset, 1, at(200))).toBe(3);
  });

  it('returns null before the driver has started a lap', () => {
    const dataset = makeFixture();
    expect(currentLapNumber(dataset, 44, at(0))).toBeNull();
  });
});

describe('driverStateAt', () => {
  it('reports the last completed lap, not one in progress', () => {
    const dataset = makeFixture();
    const ver = dataset.drivers[0]!;
    // At 200s, VER has completed laps 1 and 2; lap 3 finishes at 270s.
    const row = driverStateAt(dataset, ver, at(200));
    expect(row.lastLap).toBe(88);
    expect(row.bestLap).toBe(88);
    expect(row.lapNumber).toBe(3);
  });

  it('colours a sector purple only while it is the session best', () => {
    const dataset = makeFixture();
    const ver = dataset.drivers[0]!;
    // VER lap 2 set 29/29/30 — all three were session bests at that moment.
    const row = driverStateAt(dataset, ver, at(200));
    expect(row.sectors.map((s) => s.colour)).toEqual(['purple', 'purple', 'purple']);
  });

  it('colours a personal best green and a slower sector yellow', () => {
    const dataset = makeFixture();
    const ham = dataset.drivers[1]!;
    // HAM lap 2 is 29.5/29.5/30.2. S1 and S2 beat his lap-1 times but not VER's
    // session bests, so they are green. S3 (30.2) is slower than his own 30.0
    // from lap 1, so it is yellow.
    const row = driverStateAt(dataset, ham, at(200));
    expect(row.lastLap).toBe(89.2);
    expect(row.sectors.map((s) => s.colour)).toEqual(['green', 'green', 'yellow']);
  });

  it('counts only pit stops that have already happened', () => {
    const dataset = makeFixture();
    const ham = dataset.drivers[1]!;
    expect(driverStateAt(dataset, ham, at(184)).pitCount).toBe(0);
    expect(driverStateAt(dataset, ham, at(186)).pitCount).toBe(1);
  });

  it('reports the tyre compound and age for the current lap', () => {
    const dataset = makeFixture();
    const [ver, ham] = [dataset.drivers[0]!, dataset.drivers[1]!];
    // VER is on lap 3 = his second stint, a fresh medium.
    expect(driverStateAt(dataset, ver, at(200)).tyre).toMatchObject({
      compound: 'MEDIUM',
      age: 1,
    });
    // HAM is on lap 3 of a hard set that already had 2 laps on it.
    expect(driverStateAt(dataset, ham, at(200)).tyre).toMatchObject({
      compound: 'HARD',
      age: 5,
    });
  });

  it('flags a pit-out lap', () => {
    const dataset = makeFixture();
    const ham = dataset.drivers[1]!;
    expect(driverStateAt(dataset, ham, at(200)).isOutLap).toBe(false); // lap 2
    expect(driverStateAt(dataset, ham, at(269)).isOutLap).toBe(true); // lap 3
  });

  it('carries gaps through from the interval feed', () => {
    const dataset = makeFixture();
    const ham = dataset.drivers[1]!;
    const row = driverStateAt(dataset, ham, at(120));
    expect(row.gapToLeader.seconds).toBe(1.5);
    expect(row.interval.label).toBe('+1.500');
  });

  it('returns empty state before the session has produced any data', () => {
    const dataset = makeFixture();
    const row = driverStateAt(dataset, dataset.drivers[0]!, at(-10));
    expect(row.lastLap).toBeNull();
    expect(row.position).toBeNull();
    expect(row.pitCount).toBe(0);
    expect(row.sectors.every((s) => s.colour === 'none')).toBe(true);
  });
});

describe('timingTableAt', () => {
  it('orders by track position at the given time', () => {
    const dataset = makeFixture();
    expect(timingTableAt(dataset, at(100)).map((r) => r.driver.driver_number)).toEqual([1, 44]);
    // Positions swap at 250s.
    expect(timingTableAt(dataset, at(260)).map((r) => r.driver.driver_number)).toEqual([44, 1]);
  });

  it('sorts drivers without a position to the bottom by number', () => {
    const dataset = makeFixture();
    const rows = timingTableAt(dataset, at(-10));
    expect(rows.map((r) => r.driver.driver_number)).toEqual([1, 44]);
    expect(rows.every((r) => r.position === null)).toBe(true);
  });
});

describe('trackStatusAt', () => {
  it('follows the race control feed', () => {
    const dataset = makeFixture();
    expect(trackStatusAt(dataset, at(10))).toBe('green');
    expect(trackStatusAt(dataset, at(160))).toBe('sc');
    expect(trackStatusAt(dataset, at(250))).toBe('green');
  });

  it('is unknown before any message', () => {
    expect(trackStatusAt(makeFixture(), at(-10))).toBe('unknown');
  });
});

describe('leaderLapAt', () => {
  it('returns the highest completed lap number', () => {
    const dataset = makeFixture();
    expect(leaderLapAt(dataset, at(50))).toBeNull();
    expect(leaderLapAt(dataset, at(95))).toBe(1);
    expect(leaderLapAt(dataset, at(200))).toBe(2);
    expect(leaderLapAt(dataset, at(280))).toBe(3);
  });
});

describe('weatherAt', () => {
  it('returns the most recent sample', () => {
    expect(weatherAt(makeFixture(), at(100))?.track_temperature).toBe(41.2);
  });
});
