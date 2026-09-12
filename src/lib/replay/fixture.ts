/**
 * A tiny hand-built session used by the replay tests.
 *
 * Two drivers, three laps each, one pit stop, one safety car period. Every
 * timestamp is derived from T0 so the expected values in the tests can be
 * reasoned about by hand.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import type {
  Driver,
  Interval,
  Lap,
  Pit,
  Position,
  RaceControl,
  Session,
  Stint,
} from '@/lib/openf1/types';

export const T0 = Date.parse('2025-01-01T12:00:00.000Z');

/** Seconds after T0, as an ISO string. */
export const at = (seconds: number): string => new Date(T0 + seconds * 1000).toISOString();

const session: Session = {
  circuit_key: 39,
  circuit_short_name: 'Monza',
  country_code: 'ITA',
  country_key: 13,
  country_name: 'Italy',
  date_start: at(0),
  date_end: at(600),
  gmt_offset: '02:00:00',
  is_cancelled: false,
  location: 'Monza',
  meeting_key: 1000,
  session_key: 9999,
  session_name: 'Race',
  session_type: 'Race',
  year: 2025,
};

const drivers: Driver[] = [
  {
    broadcast_name: 'M VERSTAPPEN',
    country_code: 'NED',
    driver_number: 1,
    first_name: 'Max',
    full_name: 'Max VERSTAPPEN',
    headshot_url: null,
    last_name: 'Verstappen',
    meeting_key: 1000,
    name_acronym: 'VER',
    session_key: 9999,
    team_colour: '3671C6',
    team_name: 'Red Bull Racing',
  },
  {
    broadcast_name: 'L HAMILTON',
    country_code: 'GBR',
    driver_number: 44,
    first_name: 'Lewis',
    full_name: 'Lewis HAMILTON',
    headshot_url: null,
    last_name: 'Hamilton',
    meeting_key: 1000,
    name_acronym: 'HAM',
    session_key: 9999,
    team_colour: '27F4D2',
    team_name: 'Mercedes',
  },
];

function lap(
  driver: number,
  lapNumber: number,
  startSeconds: number,
  sectors: [number, number, number],
  isPitOut = false,
): Lap {
  const duration = Number((sectors[0] + sectors[1] + sectors[2]).toFixed(3));
  return {
    date_start: at(startSeconds),
    driver_number: driver,
    duration_sector_1: sectors[0],
    duration_sector_2: sectors[1],
    duration_sector_3: sectors[2],
    i1_speed: 300,
    i2_speed: 320,
    is_pit_out_lap: isPitOut,
    lap_duration: duration,
    lap_number: lapNumber,
    meeting_key: 1000,
    segments_sector_1: null,
    segments_sector_2: null,
    segments_sector_3: null,
    session_key: 9999,
    st_speed: 340,
  };
}

/*
 * Completion times (seconds after T0):
 *   VER lap1  90.0   lap2 178.0   lap3 270.0
 *   HAM lap1  92.0   lap2 181.2   lap3 268.2
 */
const laps: Lap[] = [
  lap(1, 1, 0, [30, 30, 30]), // 90.0
  lap(1, 2, 90, [29, 29, 30]), // 88.0
  lap(1, 3, 178, [31, 30, 31]), // 92.0
  lap(44, 1, 1, [30.5, 30.5, 30]), // 91.0
  lap(44, 2, 92, [29.5, 29.5, 30.2]), // 89.2
  lap(44, 3, 181.2, [28, 29, 30], true), // 87.0
];

const stints: Stint[] = [
  {
    compound: 'SOFT',
    driver_number: 1,
    lap_end: 2,
    lap_start: 1,
    meeting_key: 1000,
    session_key: 9999,
    stint_number: 1,
    tyre_age_at_start: 0,
  },
  {
    compound: 'MEDIUM',
    driver_number: 1,
    lap_end: 3,
    lap_start: 3,
    meeting_key: 1000,
    session_key: 9999,
    stint_number: 2,
    tyre_age_at_start: 0,
  },
  {
    compound: 'HARD',
    driver_number: 44,
    lap_end: 3,
    lap_start: 1,
    meeting_key: 1000,
    session_key: 9999,
    stint_number: 1,
    tyre_age_at_start: 2,
  },
];

const pits: Pit[] = [
  {
    date: at(185),
    driver_number: 44,
    lane_duration: 23.4,
    lap_number: 3,
    meeting_key: 1000,
    pit_duration: 23.4,
    session_key: 9999,
    stop_duration: 2.4,
  },
];

const positions: Position[] = [
  { date: at(0), driver_number: 1, meeting_key: 1000, position: 1, session_key: 9999 },
  { date: at(0), driver_number: 44, meeting_key: 1000, position: 2, session_key: 9999 },
  { date: at(250), driver_number: 44, meeting_key: 1000, position: 1, session_key: 9999 },
  { date: at(250), driver_number: 1, meeting_key: 1000, position: 2, session_key: 9999 },
];

const intervals: Interval[] = [
  {
    date: at(100),
    driver_number: 1,
    gap_to_leader: 0,
    interval: null,
    meeting_key: 1000,
    session_key: 9999,
  },
  {
    date: at(100),
    driver_number: 44,
    gap_to_leader: 1.5,
    interval: 1.5,
    meeting_key: 1000,
    session_key: 9999,
  },
];

const raceControl: RaceControl[] = [
  {
    category: 'Flag',
    date: at(0),
    driver_number: null,
    flag: 'GREEN',
    lap_number: 1,
    meeting_key: 1000,
    message: 'GREEN LIGHT - PIT EXIT OPEN',
    qualifying_phase: null,
    scope: 'Track',
    sector: null,
    session_key: 9999,
  },
  {
    category: 'SafetyCar',
    date: at(150),
    driver_number: null,
    flag: null,
    lap_number: 2,
    meeting_key: 1000,
    message: 'SAFETY CAR DEPLOYED',
    qualifying_phase: null,
    scope: 'Track',
    sector: null,
    session_key: 9999,
  },
  {
    category: 'SafetyCar',
    date: at(240),
    driver_number: null,
    flag: null,
    lap_number: 3,
    meeting_key: 1000,
    message: 'SAFETY CAR IN THIS LAP',
    qualifying_phase: null,
    scope: 'Track',
    sector: null,
    session_key: 9999,
  },
];

/** Builds a fresh dataset each call, so the memoized index cache never leaks across tests. */
export function makeFixture(): SessionDataset {
  return {
    session,
    drivers,
    laps,
    stints,
    pits,
    positions,
    intervals,
    weather: [
      {
        air_temperature: 24.1,
        date: at(0),
        humidity: 45,
        meeting_key: 1000,
        pressure: 1012.3,
        rainfall: 0,
        session_key: 9999,
        track_temperature: 41.2,
        wind_direction: 210,
        wind_speed: 2.1,
      },
    ],
    raceControl,
    startMs: T0,
    endMs: T0 + 600_000,
  };
}
