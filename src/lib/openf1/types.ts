/**
 * TypeScript types for the OpenF1 API (https://openf1.org/docs/).
 *
 * Field names are taken verbatim from the OpenF1 documentation — nothing here is
 * invented. Nullability is widened where the API is known to omit values (e.g. a
 * driver's first lap has no `lap_duration` yet, and `interval` is null for the
 * race leader). `scripts/verify-schema.ts` diffs these declarations against real
 * responses; run it whenever the API is reachable.
 */

/** ISO 8601 timestamp string, e.g. "2025-09-07T13:00:00.000000+00:00". */
export type Iso8601 = string;

/**
 * A documented string union that still accepts unknown values. OpenF1 adds new
 * categories/flags over time, so we keep autocomplete without rejecting data.
 */
type Open<T extends string> = T | (string & {});

export interface Meeting {
  circuit_key: number;
  circuit_image: string | null;
  circuit_info_url: string | null;
  circuit_short_name: string;
  circuit_type: string | null;
  country_code: string;
  country_flag: string | null;
  country_key: number;
  country_name: string;
  date_end: Iso8601 | null;
  date_start: Iso8601;
  gmt_offset: string;
  is_cancelled: boolean;
  location: string;
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  year: number;
}

export type SessionType = Open<'Practice' | 'Qualifying' | 'Race'>;

export interface Session {
  circuit_key: number;
  circuit_short_name: string;
  country_code: string;
  country_key: number;
  country_name: string;
  date_end: Iso8601;
  date_start: Iso8601;
  gmt_offset: string;
  is_cancelled: boolean;
  location: string;
  meeting_key: number;
  session_key: number;
  session_name: string;
  session_type: SessionType;
  year: number;
}

export interface Driver {
  broadcast_name: string;
  country_code: string | null;
  driver_number: number;
  first_name: string | null;
  full_name: string;
  headshot_url: string | null;
  last_name: string | null;
  meeting_key: number;
  name_acronym: string;
  session_key: number;
  /** Hex colour WITHOUT a leading '#', e.g. "3671C6". */
  team_colour: string | null;
  team_name: string | null;
}

export interface Lap {
  date_start: Iso8601 | null;
  driver_number: number;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  i1_speed: number | null;
  i2_speed: number | null;
  is_pit_out_lap: boolean;
  lap_duration: number | null;
  lap_number: number;
  meeting_key: number;
  /** Mini-sector status codes (2048 = yellow, 2049 = green, 2051 = purple, ...). */
  segments_sector_1: (number | null)[] | null;
  segments_sector_2: (number | null)[] | null;
  segments_sector_3: (number | null)[] | null;
  session_key: number;
  st_speed: number | null;
}

export type Compound = Open<'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN'>;

export interface Stint {
  compound: Compound | null;
  driver_number: number;
  lap_end: number;
  lap_start: number;
  meeting_key: number;
  session_key: number;
  stint_number: number;
  /** Laps already on the tyre when the stint began (>0 for a scrubbed set). */
  tyre_age_at_start: number | null;
}

export interface Pit {
  date: Iso8601;
  driver_number: number;
  /**
   * Total time in the pit lane, entry to exit, in seconds. Verified against the
   * 2025 Italian GP: this is always equal to `pit_duration`.
   */
  lane_duration: number | null;
  lap_number: number;
  meeting_key: number;
  /** Alias of `lane_duration` — full pit-lane time, NOT the stationary time. */
  pit_duration: number | null;
  session_key: number;
  /**
   * Stationary time with the car on jacks, in seconds (~2.0-3.5s). This is the
   * crew's stop time; the cost of pitting is `lane_duration` plus the time lost
   * driving the lane at the pit limit.
   */
  stop_duration: number | null;
}

export interface Position {
  date: Iso8601;
  driver_number: number;
  meeting_key: number;
  position: number;
  session_key: number;
}

/**
 * Gaps are numeric seconds, but become a string such as "+1 LAP" once a driver is
 * lapped, and null before the first measurement. Always narrow before arithmetic.
 */
export type Gap = number | string | null;

export interface Interval {
  date: Iso8601;
  driver_number: number;
  gap_to_leader: Gap;
  interval: Gap;
  meeting_key: number;
  session_key: number;
}

export interface Weather {
  air_temperature: number | null;
  date: Iso8601;
  humidity: number | null;
  meeting_key: number;
  pressure: number | null;
  /** 0 = dry, 1 = rain falling. */
  rainfall: number | null;
  session_key: number;
  track_temperature: number | null;
  wind_direction: number | null;
  wind_speed: number | null;
}

export type RaceControlCategory = Open<'Flag' | 'SafetyCar' | 'Drs' | 'CarEvent' | 'Other'>;
export type RaceControlFlag = Open<
  'GREEN' | 'YELLOW' | 'DOUBLE YELLOW' | 'RED' | 'CHEQUERED' | 'CLEAR' | 'BLACK AND WHITE'
>;

/**
 * `/overtakes`: every position exchange OpenF1 detected, including those from pit
 * stops, the start and restarts — so it is only ever used together with the
 * position and pit data, never as a count of on-track passes by itself. Verified
 * against Monza 2026 (session 11361): 334 rows.
 */
export interface Overtake {
  meeting_key: number;
  session_key: number;
  overtaking_driver_number: number;
  overtaken_driver_number: number;
  date: Iso8601;
  /** The position the overtaking driver took. */
  position: number;
}

export interface RaceControl {
  category: RaceControlCategory;
  date: Iso8601;
  driver_number: number | null;
  flag: RaceControlFlag | null;
  lap_number: number | null;
  meeting_key: number;
  message: string;
  /** Q1/Q2/Q3 as 1/2/3 during qualifying; null otherwise. */
  qualifying_phase: number | null;
  scope: Open<'Track' | 'Driver' | 'Sector'> | null;
  sector: number | null;
  session_key: number;
}

export interface CarData {
  brake: number;
  date: Iso8601;
  /** DRS status code; 10, 12, 14 indicate the flap is open. */
  drs: number;
  driver_number: number;
  meeting_key: number;
  n_gear: number;
  rpm: number;
  session_key: number;
  speed: number;
  throttle: number;
}

export interface LocationPoint {
  date: Iso8601;
  driver_number: number;
  meeting_key: number;
  session_key: number;
  x: number;
  y: number;
  z: number;
}
