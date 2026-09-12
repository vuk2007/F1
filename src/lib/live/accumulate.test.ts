import { describe, expect, it } from 'vitest';
import type { CarData, Position, Session } from '@/lib/openf1/types';
import { DatasetAccumulator } from './accumulate';
import type { NormalizedRows } from './normalize';

const session: Session = {
  circuit_key: 153,
  circuit_short_name: 'Madring',
  country_code: 'ESP',
  country_key: 1,
  country_name: 'Spain',
  date_end: '2026-09-12T15:00:00.000Z',
  date_start: '2026-09-12T14:00:00.000Z',
  gmt_offset: '02:00:00',
  is_cancelled: false,
  location: 'Madrid',
  meeting_key: 1294,
  session_key: 11365,
  session_name: 'Qualifying',
  session_type: 'Qualifying',
  year: 2026,
};

function position(driverNumber: number, pos: number, date: string): Position {
  return {
    date,
    driver_number: driverNumber,
    meeting_key: 1294,
    position: pos,
    session_key: 11365,
  };
}

function carData(driverNumber: number, date: string, speed: number): CarData {
  return {
    brake: 0,
    date,
    drs: 0,
    driver_number: driverNumber,
    meeting_key: 1294,
    n_gear: 7,
    rpm: 11000,
    session_key: 11365,
    speed,
    throttle: 100,
  };
}

/** A builder that already has the session, which is all `build` requires. */
function started(rows: NormalizedRows = {}): DatasetAccumulator {
  const accumulator = new DatasetAccumulator();
  accumulator.apply({ session, ...rows });
  return accumulator;
}

describe('DatasetAccumulator', () => {
  it('produces nothing until SessionInfo has arrived', () => {
    const accumulator = new DatasetAccumulator();
    accumulator.apply({ positions: [position(44, 1, '2026-09-12T14:10:00.000Z')] });

    // A dataset with no session has no clock, so there is nothing to show yet.
    expect(accumulator.ready).toBe(false);
    expect(accumulator.build()).toBeNull();

    accumulator.apply({ session });
    expect(accumulator.ready).toBe(true);
    expect(accumulator.build()).not.toBeNull();
  });

  it('replaces a row rather than appending it, when the key repeats', () => {
    const accumulator = started();
    const lap = {
      date_start: null,
      driver_number: 44,
      duration_sector_1: null,
      duration_sector_2: null,
      duration_sector_3: null,
      i1_speed: null,
      i2_speed: null,
      is_pit_out_lap: false,
      lap_duration: 92.5,
      lap_number: 12,
      meeting_key: 1294,
      segments_sector_1: null,
      segments_sector_2: null,
      segments_sector_3: null,
      session_key: 11365,
      st_speed: null,
    };

    accumulator.apply({ laps: [lap] });
    // The same lap again, corrected once the sectors filled in.
    accumulator.apply({ laps: [{ ...lap, duration_sector_1: 42.1 }] });

    const dataset = accumulator.build()!;
    expect(dataset.laps).toHaveLength(1);
    expect(dataset.laps[0]?.duration_sector_1).toBeCloseTo(42.1, 3);
  });

  it('keeps a position change and discards the same position repeated', () => {
    /*
     * The feed sends every driver's position on every timing update. Without this,
     * a two-hour race accumulates hundreds of thousands of identical rows.
     */
    const accumulator = started();
    accumulator.apply({ positions: [position(44, 3, '2026-09-12T14:10:00.000Z')] });
    accumulator.apply({ positions: [position(44, 3, '2026-09-12T14:10:01.000Z')] });
    accumulator.apply({ positions: [position(44, 2, '2026-09-12T14:10:02.000Z')] });
    accumulator.apply({ positions: [position(44, 2, '2026-09-12T14:10:03.000Z')] });

    const dataset = accumulator.build()!;
    expect(dataset.positions.map((row) => row.position)).toEqual([3, 2]);
  });

  it('tracks each driver separately when deduplicating', () => {
    const accumulator = started();
    accumulator.apply({
      positions: [
        position(44, 1, '2026-09-12T14:10:00.000Z'),
        position(16, 2, '2026-09-12T14:10:00.000Z'),
      ],
    });
    accumulator.apply({
      positions: [
        position(44, 1, '2026-09-12T14:10:01.000Z'),
        position(16, 3, '2026-09-12T14:10:01.000Z'),
      ],
    });

    const dataset = accumulator.build()!;
    // Car 44 held position, car 16 dropped one: one row each.
    expect(dataset.positions).toHaveLength(3);
    expect(dataset.positions.filter((row) => row.driver_number === 16)).toHaveLength(2);
  });

  it('deduplicates a gap only while it is unchanged', () => {
    const accumulator = started();
    const interval = {
      date: '2026-09-12T14:10:00.000Z',
      driver_number: 44,
      gap_to_leader: 2.4,
      interval: 0.8,
      meeting_key: 1294,
      session_key: 11365,
    };

    accumulator.apply({ intervals: [interval] });
    accumulator.apply({ intervals: [{ ...interval, date: '2026-09-12T14:10:01.000Z' }] });
    accumulator.apply({
      intervals: [{ ...interval, date: '2026-09-12T14:10:02.000Z', interval: 0.5 }],
    });

    expect(accumulator.build()!.intervals).toHaveLength(2);
  });

  it('treats a change from a number to a lapped string as a change', () => {
    const accumulator = started();
    const base = {
      date: '2026-09-12T14:10:00.000Z',
      driver_number: 44,
      gap_to_leader: 88.2 as number | string,
      interval: 1.1 as number | string,
      meeting_key: 1294,
      session_key: 11365,
    };

    accumulator.apply({ intervals: [base] });
    accumulator.apply({
      intervals: [{ ...base, date: '2026-09-12T14:11:00.000Z', gap_to_leader: '+1 LAP' }],
    });

    expect(accumulator.build()!.intervals).toHaveLength(2);
  });

  it('does not let a reconnect duplicate the race control log', () => {
    /*
     * A reconnect re-sends the whole message log. Appending it again would double
     * every flag in the session, and `cautionPeriods` would see each safety car
     * twice.
     */
    const accumulator = started();
    const messages = [
      {
        category: 'Flag',
        date: '2026-09-12T14:00:00.000Z',
        driver_number: null,
        flag: 'GREEN',
        lap_number: null,
        meeting_key: 1294,
        message: 'GREEN LIGHT - PIT EXIT OPEN',
        qualifying_phase: 1,
        scope: 'Track',
        sector: null,
        session_key: 11365,
      },
    ];

    accumulator.apply({ raceControl: messages });
    accumulator.apply({ raceControl: messages });

    expect(accumulator.build()!.raceControl).toHaveLength(1);
  });

  it('sorts race control by time even when a snapshot arrives after live messages', () => {
    const accumulator = started();
    const message = (date: string, text: string) => ({
      category: 'Other',
      date,
      driver_number: null,
      flag: null,
      lap_number: null,
      meeting_key: 1294,
      message: text,
      qualifying_phase: null,
      scope: null,
      sector: null,
      session_key: 11365,
    });

    accumulator.apply({ raceControl: [message('2026-09-12T14:30:00.000Z', 'later')] });
    accumulator.apply({ raceControl: [message('2026-09-12T14:05:00.000Z', 'earlier')] });

    expect(accumulator.build()!.raceControl.map((row) => row.message)).toEqual([
      'earlier',
      'later',
    ]);
  });

  it('sorts a time series that arrives out of order', () => {
    const accumulator = started();
    accumulator.apply({ positions: [position(44, 5, '2026-09-12T14:20:00.000Z')] });
    accumulator.apply({ positions: [position(44, 4, '2026-09-12T14:10:00.000Z')] });

    const dates = accumulator.build()!.positions.map((row) => row.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('extends the end of the session past its scheduled end', () => {
    /*
     * A race that overruns its scheduled window must stay watchable: the replay
     * clock will not scrub past endMs.
     */
    const accumulator = started();
    accumulator.apply({ positions: [position(44, 1, '2026-09-12T16:30:00.000Z')] });

    const dataset = accumulator.build()!;
    expect(dataset.startMs).toBe(Date.parse('2026-09-12T14:00:00.000Z'));
    expect(dataset.endMs).toBe(Date.parse('2026-09-12T16:30:00.000Z'));
  });

  it('keeps the scheduled end when nothing has arrived yet', () => {
    expect(started().build()!.endMs).toBe(Date.parse('2026-09-12T15:00:00.000Z'));
  });

  it('orders drivers, laps and stints the way the app expects', () => {
    const accumulator = started();
    const stint = (driverNumber: number, number: number) => ({
      compound: 'SOFT',
      driver_number: driverNumber,
      lap_end: number * 3,
      lap_start: number * 3 - 2,
      meeting_key: 1294,
      session_key: 11365,
      stint_number: number,
      tyre_age_at_start: 0,
    });

    accumulator.apply({ stints: [stint(44, 2), stint(1, 1), stint(44, 1)] });

    expect(accumulator.build()!.stints.map((s) => [s.driver_number, s.stint_number])).toEqual([
      [1, 1],
      [44, 1],
      [44, 2],
    ]);
  });

  it('caps telemetry and drops the oldest rows', () => {
    const accumulator = new DatasetAccumulator({ telemetryLimit: 3 });
    accumulator.apply({ session });

    for (let i = 0; i < 5; i += 1) {
      accumulator.apply({
        carData: [carData(44, `2026-09-12T14:10:0${i}.000Z`, 200 + i)],
      });
    }

    const rows = accumulator.carDataFor(44);
    expect(rows).toHaveLength(3);
    // The three most recent survive; the first two are gone.
    expect(rows.map((row) => row.speed)).toEqual([202, 203, 204]);
  });

  it('returns telemetry for one driver inside a window', () => {
    const accumulator = started();
    accumulator.apply({
      carData: [
        carData(44, '2026-09-12T14:10:00.000Z', 100),
        carData(16, '2026-09-12T14:10:00.000Z', 150),
        carData(44, '2026-09-12T14:10:05.000Z', 200),
        carData(44, '2026-09-12T14:10:10.000Z', 300),
      ],
    });

    const window = accumulator.carDataFor(
      44,
      Date.parse('2026-09-12T14:10:04.000Z'),
      Date.parse('2026-09-12T14:10:06.000Z'),
    );

    expect(window.map((row) => row.speed)).toEqual([200]);
    expect(accumulator.carDataFor(44)).toHaveLength(3);
  });

  it('keeps telemetry out of the dataset itself', () => {
    // SessionDataset has no room for it by design; it is reached through the
    // accessors instead.
    const accumulator = started();
    accumulator.apply({ carData: [carData(44, '2026-09-12T14:10:00.000Z', 100)] });

    expect(Object.keys(accumulator.build()!)).not.toContain('carData');
  });

  it('keeps the first time a lap was seen, so a re-sent best lap does not creep forward', () => {
    /*
     * The feed re-sends each driver's best lap on every timing update. Lap start
     * times are derived from arrival, so replacing the row each time would leave
     * every best lap looking as though it had just been set.
     */
    const accumulator = started();
    const best = {
      date_start: '2026-09-12T14:10:00.000Z',
      driver_number: 1,
      duration_sector_1: null,
      duration_sector_2: null,
      duration_sector_3: null,
      i1_speed: null,
      i2_speed: null,
      is_pit_out_lap: false,
      lap_duration: 91.824,
      lap_number: 18,
      meeting_key: 1294,
      segments_sector_1: null,
      segments_sector_2: null,
      segments_sector_3: null,
      session_key: 11365,
      st_speed: null,
    };

    accumulator.apply({ laps: [best] });
    accumulator.apply({ laps: [{ ...best, date_start: '2026-09-12T14:40:00.000Z' }] });

    expect(accumulator.build()!.laps[0]?.date_start).toBe('2026-09-12T14:10:00.000Z');
  });

  it('combines the pieces of a lap that arrive separately', () => {
    // A best-lap entry has the time; the last-lap entry has the sectors. Keeping
    // only the latest would lose one or the other.
    const accumulator = started();
    const base = {
      date_start: '2026-09-12T14:10:00.000Z',
      driver_number: 1,
      duration_sector_1: null,
      duration_sector_2: null,
      duration_sector_3: null,
      i1_speed: null,
      i2_speed: null,
      is_pit_out_lap: false,
      lap_duration: 91.824,
      lap_number: 18,
      meeting_key: 1294,
      segments_sector_1: null,
      segments_sector_2: null,
      segments_sector_3: null,
      session_key: 11365,
      st_speed: 312,
    };

    accumulator.apply({ laps: [base] });
    accumulator.apply({
      laps: [
        {
          ...base,
          date_start: null,
          duration_sector_1: 30.1,
          duration_sector_2: 31.2,
          duration_sector_3: 30.524,
          st_speed: null,
        },
      ],
    });

    const lap = accumulator.build()!.laps[0]!;
    expect(lap.duration_sector_2).toBeCloseTo(31.2, 3);
    // A null in the later piece does not erase what the earlier one knew.
    expect(lap.st_speed).toBe(312);
    expect(lap.date_start).toBe('2026-09-12T14:10:00.000Z');
  });

  it('runs the current stint up to the latest lap, and leaves earlier stints alone', () => {
    const accumulator = started();
    const stint = (number: number, start: number, end: number) => ({
      compound: 'SOFT',
      driver_number: 1,
      lap_end: end,
      lap_start: start,
      meeting_key: 1294,
      session_key: 11365,
      stint_number: number,
      tyre_age_at_start: 0,
    });
    const lap = (lapNumber: number) => ({
      date_start: null,
      driver_number: 1,
      duration_sector_1: null,
      duration_sector_2: null,
      duration_sector_3: null,
      i1_speed: null,
      i2_speed: null,
      is_pit_out_lap: false,
      lap_duration: 92,
      lap_number: lapNumber,
      meeting_key: 1294,
      segments_sector_1: null,
      segments_sector_2: null,
      segments_sector_3: null,
      session_key: 11365,
      st_speed: null,
    });

    accumulator.apply({ stints: [stint(1, 1, 3), stint(2, 4, 6)], laps: [lap(2), lap(8)] });

    // Lap 8 was timed after the last stint record; without this it has no tyre.
    expect(accumulator.build()!.stints.map((s) => [s.lap_start, s.lap_end])).toEqual([
      [1, 3],
      [4, 8],
    ]);
  });

  it('reports what it holds', () => {
    const accumulator = started();
    accumulator.apply({
      positions: [position(44, 1, '2026-09-12T14:10:00.000Z')],
      carData: [carData(44, '2026-09-12T14:10:00.000Z', 100)],
    });

    expect(accumulator.counts()).toMatchObject({ positions: 1, carData: 1, laps: 0 });
    expect(accumulator.latestMs).toBe(Date.parse('2026-09-12T14:10:00.000Z'));
  });
});
