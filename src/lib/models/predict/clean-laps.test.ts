import { describe, expect, it } from 'vitest';
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Interval, Lap, RaceControl, Stint } from '@/lib/openf1/types';
import { at, makeFixture } from '@/lib/replay/fixture';
import { IntervalLookup, cleanOnly, predictionLaps } from './clean-laps';

/** One driver, twelve 90 s laps on one set, with hooks to break individual laps. */
function dataset(overrides: Partial<SessionDataset> = {}): SessionDataset {
  const base = makeFixture();
  const laps: Lap[] = [];
  for (let n = 1; n <= 12; n += 1) {
    laps.push({
      ...base.laps[0]!,
      driver_number: 1,
      lap_number: n,
      date_start: at((n - 1) * 90),
      lap_duration: 90,
      is_pit_out_lap: false,
    });
  }
  const stints: Stint[] = [
    {
      ...base.stints[0]!,
      driver_number: 1,
      lap_start: 1,
      lap_end: 6,
      stint_number: 1,
      compound: 'MEDIUM',
      tyre_age_at_start: 0,
    },
    {
      ...base.stints[0]!,
      driver_number: 1,
      lap_start: 7,
      lap_end: 12,
      stint_number: 2,
      compound: 'HARD',
      tyre_age_at_start: 0,
    },
  ];
  return {
    ...base,
    laps,
    stints,
    pits: [],
    intervals: [],
    raceControl: [],
    ...overrides,
  };
}

const reasons = (data: SessionDataset) =>
  Object.fromEntries(predictionLaps(data, 1).map((lap) => [lap.lapNumber, lap.excluded]));

describe('predictionLaps', () => {
  it('drops lap 1 and the first two laps of every stint', () => {
    const r = reasons(dataset());
    expect(r[1]).toBe('standing-start');
    expect(r[2]).toBe('stint-start');
    expect(r[3]).toBeNull();
    // The second stint starts on lap 7, so 7 and 8 are warm-up laps.
    expect(r[7]).toBe('stint-start');
    expect(r[8]).toBe('stint-start');
    expect(r[9]).toBeNull();
  });

  it('drops the in-lap and the out-lap', () => {
    const data = dataset();
    data.laps = data.laps.map((lap) =>
      lap.lap_number === 7 ? { ...lap, is_pit_out_lap: true } : lap,
    );
    data.pits = [
      { ...makeFixture().pits[0]!, driver_number: 1, lap_number: 6, date: at(5 * 90 + 80) },
    ];
    const r = reasons(data);
    expect(r[6]).toBe('pit-in');
    expect(r[7]).toBe('pit-out');
  });

  it('drops laps under a safety car, virtual safety car or red flag', () => {
    const sc = (message: string, seconds: number): RaceControl => ({
      ...makeFixture().raceControl[1]!,
      message,
      date: at(seconds),
    });
    const r = reasons(
      dataset({
        raceControl: [
          sc('VIRTUAL SAFETY CAR DEPLOYED', 3 * 90 + 10),
          sc('VIRTUAL SAFETY CAR ENDING', 4 * 90 + 10),
        ],
      }),
    );
    expect(r[4]).toBe('caution');
    expect(r[5]).toBe('caution');
    expect(r[6]).toBeNull();
  });

  it('drops a lap started under a second behind another car', () => {
    const interval = (seconds: number, value: number): Interval => ({
      date: at(seconds),
      driver_number: 1,
      gap_to_leader: 5,
      interval: value,
      meeting_key: 1000,
      session_key: 9999,
    });
    const r = reasons(
      dataset({ intervals: [interval(3 * 90 - 1, 0.8), interval(4 * 90 - 1, 1.4)] }),
    );
    expect(r[4]).toBe('traffic');
    expect(r[5]).toBeNull();
  });

  it('does not treat the leader as being in traffic', () => {
    const leader: Interval = {
      date: at(0),
      driver_number: 1,
      gap_to_leader: 0,
      interval: 0,
      meeting_key: 1000,
      session_key: 9999,
    };
    expect(reasons(dataset({ intervals: [leader] }))[4]).toBeNull();
  });

  it('reads tyre age and compound from the stint', () => {
    const laps = predictionLaps(dataset(), 1);
    expect(laps.find((lap) => lap.lapNumber === 9)).toMatchObject({
      tyreAge: 3,
      compound: 'HARD',
      stintNumber: 2,
    });
  });

  it('keeps only usable laps with a time', () => {
    const clean = cleanOnly(predictionLaps(dataset(), 1));
    expect(clean.map((lap) => lap.lapNumber)).toEqual([3, 4, 5, 6, 9, 10, 11, 12]);
  });
});

describe('IntervalLookup', () => {
  it('reads the most recent interval and treats 0 as leading', () => {
    const rows: Interval[] = [
      {
        date: at(10),
        driver_number: 4,
        gap_to_leader: 2,
        interval: 1.2,
        meeting_key: 1,
        session_key: 1,
      },
      {
        date: at(20),
        driver_number: 4,
        gap_to_leader: '+1 LAP',
        interval: '+1 LAP',
        meeting_key: 1,
        session_key: 1,
      },
      {
        date: at(10),
        driver_number: 1,
        gap_to_leader: 0,
        interval: 0,
        meeting_key: 1,
        session_key: 1,
      },
    ];
    const lookup = new IntervalLookup(rows);
    expect(lookup.intervalAt(4, Date.parse(at(15)))).toBe(1.2);
    expect(lookup.intervalAt(4, Date.parse(at(25)))).toBeNull();
    expect(lookup.gapToLeaderAt(4, Date.parse(at(15)))).toBe(2);
    expect(lookup.intervalAt(1, Date.parse(at(15)))).toBeNull();
    expect(lookup.gapToLeaderAt(1, Date.parse(at(15)))).toBe(0);
  });
});
