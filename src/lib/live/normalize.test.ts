import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FeedState as FeedTopics, TimingAppData, TimingData } from './feed-types';
import {
  baseTopic,
  normalizeCarData,
  normalizeDrivers,
  normalizePosition,
  normalizeRaceControl,
  normalizeSession,
  normalizeStints,
  normalizeTiming,
  normalizeTopic,
  normalizeTrackStatus,
  normalizeWeather,
  snapshotObservedAtIso,
  type NormalizeContext,
} from './normalize';
import { parseFeedTime } from './parse';

/**
 * These run against the committed capture, not against hand-written objects.
 *
 * That is the point: the shapes in `feed-types.ts` are a claim about what F1
 * actually sends, and a test built from the same assumptions as the code would
 * agree with it while both were wrong. Several assertions below are phrased as
 * cross-checks between two independent fields of the real feed, so they fail if
 * the reading is wrong rather than if the fixture changes.
 */
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../bridge/fixtures/11365-spanish-grand-prix-qualifying-snapshot.json',
);

const snapshot = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as FeedTopics;

const ctx: NormalizeContext = {
  sessionKey: 11365,
  meetingKey: 1294,
  atIso: '2026-09-12T15:00:00.000Z',
  lapNumber: null,
  qualifyingPhase: 3,
};

describe('normalizeSession', () => {
  it('places the session on the real clock', () => {
    const session = normalizeSession(snapshot.SessionInfo, 0);

    // 16:00 local at +02:00. The capture's own StatusSeries logs the session
    // starting at 14:00:00Z, so this is checked against the feed, not arithmetic.
    expect(session?.date_start).toBe('2026-09-12T14:00:00.000Z');
    expect(session?.date_end).toBe('2026-09-12T15:00:00.000Z');
  });

  it('carries the identifying fields the app reads', () => {
    const session = normalizeSession(snapshot.SessionInfo, 0);

    expect(session).toMatchObject({
      session_key: 11365,
      meeting_key: 1294,
      session_name: 'Qualifying',
      session_type: 'Qualifying',
      location: 'Madrid',
      circuit_short_name: 'Madring',
      country_code: 'ESP',
      year: 2026,
      is_cancelled: false,
    });
  });

  it('returns null without a start date, rather than an invalid session', () => {
    expect(normalizeSession({ Key: 1 }, 1)).toBeNull();
    expect(normalizeSession(undefined, 1)).toBeNull();
  });
});

describe('normalizeDrivers', () => {
  const drivers = normalizeDrivers(snapshot.DriverList, ctx);

  it('reads every driver and nothing else', () => {
    // 22 cars plus the feed's own `_kf` marker, which must not become a driver.
    expect(drivers).toHaveLength(22);
    expect(drivers.every((driver) => Number.isInteger(driver.driver_number))).toBe(true);
  });

  it('maps the feed names onto OpenF1 names', () => {
    const norris = drivers.find((driver) => driver.driver_number === 1);

    expect(norris).toMatchObject({
      name_acronym: 'NOR',
      full_name: 'Lando NORRIS',
      broadcast_name: 'L NORRIS',
      team_name: 'McLaren',
      first_name: 'Lando',
      last_name: 'Norris',
    });
  });

  it('keeps the team colour in OpenF1 form, with no leading hash', () => {
    const norris = drivers.find((driver) => driver.driver_number === 1);
    expect(norris?.team_colour).toBe('F47600');
  });
});

describe('normalizeStints', () => {
  const { stints, pits } = normalizeStints(snapshot.TimingAppData, ctx);

  it('turns one number per stint into lap ranges', () => {
    const car1 = stints
      .filter((stint) => stint.driver_number === 1)
      .map((stint) => [stint.lap_start, stint.lap_end]);

    // Feed LapNumbers are 4, 7, 10, 13, 16, 19 in laps-started numbering.
    expect(car1).toEqual([
      [1, 3],
      [4, 6],
      [7, 9],
      [10, 12],
      [13, 15],
      [16, 18],
    ]);
  });

  it.each([1, 44, 10])(
    'puts car %i best lap inside the stint that recorded that lap time',
    (driverNumber) => {
      /*
       * The cross-check that pins the lap numbering. Two independent parts of the
       * feed have to agree: TimingData says which lap was the driver's best, and
       * TimingAppData says which stint recorded that lap time. If the off-by-one
       * between laps-started and laps-completed were wrong, the best lap would
       * fall in the neighbouring stint and this would fail.
       */
      const timing = (snapshot.TimingData as TimingData).Lines?.[String(driverNumber)];
      const app = (snapshot.TimingAppData as TimingAppData).Lines?.[String(driverNumber)];

      const bestLap = timing?.BestLapTime?.Lap;
      const bestTime = parseFeedTime(timing?.BestLapTime?.Value);
      expect(bestLap).toBeTypeOf('number');
      expect(bestTime).not.toBeNull();

      const holding = stints.filter(
        (stint) =>
          stint.driver_number === driverNumber &&
          bestLap !== undefined &&
          stint.lap_start <= bestLap &&
          bestLap <= stint.lap_end,
      );
      expect(holding).toHaveLength(1);

      const feedStint = app?.Stints?.[holding[0]!.stint_number - 1];
      expect(parseFeedTime(feedStint?.LapTime)).toBeCloseTo(bestTime!, 3);
    },
  );

  it('reads a scrubbed set as tyre age at the start of the stint', () => {
    const car1 = stints.filter((stint) => stint.driver_number === 1);
    // Car 1's fourth stint went back onto a set with three laps already on it.
    expect(car1[3]?.tyre_age_at_start).toBe(3);
    expect(car1[0]?.tyre_age_at_start).toBe(0);
  });

  it('numbers stints from one and keeps the compound', () => {
    const car44 = stints.filter((stint) => stint.driver_number === 44);
    expect(car44.map((stint) => stint.stint_number)).toEqual([1, 2, 3, 4]);
    expect(car44[0]?.compound).toBe('MEDIUM');
    expect(car44[1]?.compound).toBe('SOFT');
  });

  it('infers a stop on the last lap of each stint but the first', () => {
    const car1 = pits.filter((pit) => pit.driver_number === 1).map((pit) => pit.lap_number);
    expect(car1).toEqual([3, 6, 9, 12, 15]);
  });

  it('reports pit durations as unknown rather than inventing them', () => {
    /*
     * The live feed publishes no pit lane or stationary times at all. Null is the
     * honest answer and makes pit-loss decline to answer, instead of answering
     * wrongly.
     */
    for (const pit of pits) {
      expect(pit.lane_duration).toBeNull();
      expect(pit.pit_duration).toBeNull();
      expect(pit.stop_duration).toBeNull();
    }
  });
});

describe('normalizeTiming', () => {
  const { positions, intervals, laps } = normalizeTiming(snapshot.TimingData, ctx);

  it('reads the classified order', () => {
    expect(positions).toHaveLength(22);
    const leader = positions.find((row) => row.position === 1);
    expect(leader?.driver_number).toBeTypeOf('number');
    // Positions are unique across the field.
    expect(new Set(positions.map((row) => row.position)).size).toBe(positions.length);
  });

  it('takes lap numbers only from pairings the feed states outright', () => {
    /*
     * Car 1's BestLapTimes name three laps, one per qualifying part, each with the
     * time set on it. That is the only lap history a snapshot contains, and it is
     * unambiguous — unlike anything derived from NumberOfLaps.
     */
    const car1 = laps.filter((lap) => lap.driver_number === 1);

    // Lap 19 is the in-lap, admitted because its sectors corroborate it below.
    expect(car1.map((lap) => lap.lap_number)).toEqual([6, 12, 18, 19]);
    // "1:32.873" parses to 92.87299999…, so durations are compared, not equated.
    const expected = [93.469, 92.873, 91.824, 130.82];
    car1.forEach((lap, index) => expect(lap.lap_duration).toBeCloseTo(expected[index]!, 3));
  });

  it('refuses to number a lap from NumberOfLaps alone', () => {
    /*
     * Car 44 completed 21 laps by its own counter, its LastLapTime is its lap-20
     * best, and its sectors belong to a lap 21 that never finished. There is no
     * consistent reading, so no lap 21 is invented — only the three stated bests.
     */
    const car44 = laps.filter((lap) => lap.driver_number === 44).map((lap) => lap.lap_number);

    expect(car44).toEqual([5, 11, 20]);
  });

  it('derives a lap start by counting back from the completed time', () => {
    const car44 = laps.find((lap) => lap.driver_number === 44 && lap.lap_number === 20);
    expect(car44?.lap_duration).not.toBeNull();
    expect(Date.parse(car44!.date_start!)).toBe(
      Date.parse(ctx.atIso) - Math.round(car44!.lap_duration! * 1000),
    );
  });

  it('keeps sectors when they add up to the lap they are attached to', () => {
    // Car 1's three sectors sum to exactly its 2:10.820 in-lap, so they are that
    // lap's and are kept with their mini-sector segments.
    const inLap = laps.find((lap) => lap.driver_number === 1 && lap.lap_number === 19);

    expect(inLap?.duration_sector_1).toBeCloseTo(43.487, 3);
    expect(inLap?.duration_sector_2).toBeCloseTo(42.861, 3);
    expect(inLap?.duration_sector_3).toBeCloseTo(44.472, 3);
    expect(inLap?.segments_sector_1).toHaveLength(8);
    expect(inLap?.st_speed).toBeTypeOf('number');
  });

  it('drops sectors that belong to a different lap', () => {
    /*
     * The bug this guard exists for. Car 44's sectors add to 115.046 against a lap
     * time of 1:32.013, because its next lap had already overwritten them. Taking
     * them on trust put a 1:55 best lap on screen for a driver whose best was 1:32.
     */
    const best = laps.find((lap) => lap.driver_number === 44 && lap.lap_number === 20);

    expect(best?.lap_duration).toBeCloseTo(92.013, 3);
    expect(best?.duration_sector_1).toBeNull();
    expect(best?.duration_sector_2).toBeNull();
    expect(best?.duration_sector_3).toBeNull();
  });

  it('reads qualifying gaps out of the part that is running', () => {
    const car1 = intervals.find((row) => row.driver_number === 1);
    // Q3 is part 3, so Stats[2] — which is empty for everyone, the session having
    // ended. An empty gap is unknown, never zero.
    expect(car1?.gap_to_leader).toBeNull();

    /*
     * The topic carries its own SessionPart, and that wins over the context: it
     * came in the same message as the Stats array it indexes, so it cannot be
     * stale the way a context value can.
     */
    const q1 = normalizeTiming(
      { ...(snapshot.TimingData as TimingData), SessionPart: 1 },
      { ...ctx, qualifyingPhase: 3 },
    );
    const car1q1 = q1.intervals.find((row) => row.driver_number === 1);
    expect(car1q1?.gap_to_leader).toBeCloseTo(0.258, 3);
    expect(car1q1?.interval).toBeCloseTo(0.088, 3);
  });

  it('reads race gaps when the session sends them instead', () => {
    const race: TimingData = {
      Lines: {
        '44': {
          Position: '2',
          NumberOfLaps: 15,
          GapToLeader: '+2.418',
          IntervalToPositionAhead: { Value: '+0.712', Catching: true },
        },
      },
    };
    const { intervals: rows } = normalizeTiming(race, { ...ctx, qualifyingPhase: null });

    expect(rows[0]?.gap_to_leader).toBeCloseTo(2.418, 3);
    expect(rows[0]?.interval).toBeCloseTo(0.712, 3);
  });

  it('keeps a lapped car as a string rather than as seconds', () => {
    const race: TimingData = {
      Lines: { '44': { Position: '18', NumberOfLaps: 15, GapToLeader: '+1 LAP' } },
    };
    const { intervals: rows } = normalizeTiming(race, { ...ctx, qualifyingPhase: null });

    expect(rows[0]?.gap_to_leader).toBe('+1 LAP');
  });

  it('emits no lap for a driver who has not completed one', () => {
    // Car 87 never set a time in this session.
    expect(laps.find((lap) => lap.driver_number === 87)).toBeUndefined();
  });
});

describe('normalizeWeather', () => {
  it('reads the numbers the feed sends as strings', () => {
    const [weather] = normalizeWeather(snapshot.WeatherData, ctx);

    expect(weather).toMatchObject({
      air_temperature: 31.4,
      humidity: 17.7,
      pressure: 942.7,
      rainfall: 0,
      track_temperature: 53.8,
      wind_direction: 336,
      session_key: 11365,
    });
    expect(weather?.wind_speed).toBeCloseTo(0.3, 3);
  });

  it('stamps the reading with when it was observed', () => {
    expect(normalizeWeather(snapshot.WeatherData, ctx)[0]?.date).toBe(ctx.atIso);
  });
});

describe('normalizeRaceControl', () => {
  const rows = normalizeRaceControl(snapshot.RaceControlMessages, ctx);

  it('reads every message in the session', () => {
    expect(rows).toHaveLength(135);
  });

  it('passes the feed vocabulary through without remapping it', () => {
    /*
     * The finding that made this normalizer trivial: the feed already speaks
     * OpenF1's vocabulary for these three fields. If a future session introduces a
     * word outside OpenF1's unions it still passes through, because both types are
     * open unions.
     */
    const flags = new Set(rows.map((row) => row.flag).filter((flag) => flag !== null));
    expect([...flags].sort()).toEqual([
      'BLACK AND WHITE',
      'CHEQUERED',
      'CLEAR',
      'DOUBLE YELLOW',
      'GREEN',
      'YELLOW',
    ]);
    // Informational messages carry no scope at all, which stays null.
    const scopes = rows.map((row) => row.scope).filter((scope) => scope !== null);
    expect([...new Set(scopes)].sort()).toEqual(['Driver', 'Sector', 'Track']);
  });

  it('keeps the sector a sector flag applies to', () => {
    const sectorFlag = rows.find((row) => row.scope === 'Sector');
    expect(sectorFlag?.sector).toBeTypeOf('number');
    expect(sectorFlag?.flag).toBe('DOUBLE YELLOW');
  });

  it('attaches a driver to a driver-scoped message', () => {
    const driverFlag = rows.find((row) => row.scope === 'Driver');
    expect(driverFlag?.driver_number).toBeTypeOf('number');
  });

  it('forces the feed bare timestamps to UTC', () => {
    // "2026-09-12T14:00:00" with no zone. Read as local it would be wrong by the
    // reader's own offset.
    const green = rows.find((row) => row.message === 'GREEN LIGHT - PIT EXIT OPEN');
    expect(green?.date).toBe('2026-09-12T14:00:00.000Z');
  });
});

describe('normalizeTrackStatus', () => {
  it('maps the two words a real capture confirms', () => {
    expect(normalizeTrackStatus({ Status: '1', Message: 'AllClear' }, ctx)[0]).toMatchObject({
      flag: 'CLEAR',
      category: 'Flag',
      scope: 'Track',
    });
    expect(normalizeTrackStatus({ Status: '2', Message: 'Yellow' }, ctx)[0]?.flag).toBe('YELLOW');
  });

  it('passes an unknown word through with its text rather than guessing a flag', () => {
    const [row] = normalizeTrackStatus({ Status: '4', Message: 'SCDeployed' }, ctx);

    expect(row?.flag).toBeNull();
    expect(row?.category).toBe('Other');
    // The word survives, so nothing is lost while it is unverified.
    expect(row?.message).toContain('SCDEPLOYED');
  });

  it('produces nothing from an empty status', () => {
    expect(normalizeTrackStatus({ Status: '1' }, ctx)).toEqual([]);
    expect(normalizeTrackStatus(undefined, ctx)).toEqual([]);
  });
});

describe('normalizeCarData', () => {
  it('maps the numbered channels onto named telemetry', () => {
    const rows = normalizeCarData(
      {
        Entries: [
          {
            Utc: '2026-09-12T14:30:00.123Z',
            Cars: {
              '44': { Channels: { '0': 11500, '2': 291, '3': 7, '4': 100, '5': 0, '45': 12 } },
              _kf: { Channels: { '0': 1 } },
            },
          },
        ],
      },
      ctx,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      driver_number: 44,
      date: '2026-09-12T14:30:00.123Z',
      rpm: 11500,
      speed: 291,
      n_gear: 7,
      throttle: 100,
      brake: 0,
      drs: 12,
    });
  });

  it('produces nothing when the topic is absent, as it is off-session', () => {
    expect(normalizeCarData(undefined, ctx)).toEqual([]);
    expect(normalizeCarData({ Entries: [] }, ctx)).toEqual([]);
  });
});

describe('normalizePosition', () => {
  it('maps car positions onto location points', () => {
    const rows = normalizePosition(
      {
        Position: [
          {
            Timestamp: '2026-09-12T14:30:00.250Z',
            Entries: {
              '16': { Status: 'OnTrack', X: 1234, Y: -5678, Z: 91 },
              '81': { Status: 'OffTrack' },
            },
          },
        ],
      },
      ctx,
    );

    // Car 81 has no coordinates, so it produces no point rather than one at 0,0 —
    // the track map treats the origin as a missing fix.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ driver_number: 16, x: 1234, y: -5678, z: 91 });
  });
});

describe('snapshotObservedAtIso', () => {
  const nineHoursLater = Date.parse('2026-09-12T23:29:00.000Z');

  it('places an ended session snapshot at the end of the session, not at connection time', () => {
    /*
     * The capture's SessionStatus is "Ends". Stamped at connection time instead, it
     * stretched the replay clock to 9:29:13 on screen.
     */
    expect(snapshotObservedAtIso(nineHoursLater, snapshot as Record<string, unknown>)).toBe(
      '2026-09-12T15:00:00.000Z',
    );
  });

  it('uses arrival time for a session that is still running', () => {
    const running = { ...snapshot, SessionStatus: { Status: 'Started' } };
    expect(snapshotObservedAtIso(nineHoursLater, running)).toBe('2026-09-12T23:29:00.000Z');
  });

  it('does not treat the break between qualifying parts as the end', () => {
    // "Finished" is also what the feed says after Q1, with Q2 still to come.
    const betweenParts = { ...snapshot, SessionStatus: { Status: 'Finished' } };
    expect(snapshotObservedAtIso(nineHoursLater, betweenParts)).toBe('2026-09-12T23:29:00.000Z');
  });

  it('never moves a time later, only clamps an arrival past the end', () => {
    const duringSession = Date.parse('2026-09-12T14:30:00.000Z');
    expect(snapshotObservedAtIso(duringSession, snapshot as Record<string, unknown>)).toBe(
      '2026-09-12T14:30:00.000Z',
    );
  });
});

describe('normalizeTopic', () => {
  it('routes each topic to its rows', () => {
    expect(normalizeTopic('DriverList', snapshot.DriverList, ctx).drivers).toHaveLength(22);
    expect(normalizeTopic('WeatherData', snapshot.WeatherData, ctx).weather).toHaveLength(1);
    expect(normalizeTopic('TimingData', snapshot.TimingData, ctx).positions).toHaveLength(22);
  });

  it('treats a compressed topic as its uncompressed self', () => {
    // The bridge inflates the payload but forwards the topic name verbatim.
    expect(baseTopic('CarData.z')).toBe('CarData');
    expect(baseTopic('Position.z')).toBe('Position');
    expect(normalizeTopic('CarData.z', { Entries: [] }, ctx).carData).toEqual([]);
  });

  it('ignores topics the dataset has no home for', () => {
    expect(normalizeTopic('TeamRadio', { Captures: [] }, ctx)).toEqual({});
    expect(normalizeTopic('ChampionshipPrediction', {}, ctx)).toEqual({});
    expect(normalizeTopic('Heartbeat', { Utc: 'x' }, ctx)).toEqual({});
  });
});
