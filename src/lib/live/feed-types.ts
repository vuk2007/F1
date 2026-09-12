/**
 * The shape of F1's live timing feed, topic by topic.
 *
 * These are the **raw** feed types, not the app's types. Everything downstream
 * still reads OpenF1-shaped rows; `normalize.ts` is the only thing that sees both
 * sides. The point of this file is that the feed's conventions are nothing like
 * OpenF1's: lap times are strings like `"1:31.824"`, every number is a string,
 * the driver number is a string key, and a value that is not yet known is `""`
 * rather than null.
 *
 * Where these names come from — none of them are guessed:
 *
 *  - f1-dash's `dashboard/src/types/state.type.ts`, which types the same feed.
 *  - Checked field by field against `bridge/fixtures/*-snapshot.json`, a real
 *    capture. Where the two disagree the capture wins, and it did disagree once:
 *    f1-dash has `Speeds.Fl` / `Speeds.St`, but the feed actually sends `FL` and
 *    `ST`. Reading the lowercase spelling would have silently produced no trap
 *    speeds at all.
 *
 * Fields are optional wherever a real snapshot omitted them, which is most of
 * them: a qualifying snapshot has `Stats` and `KnockedOut` but no `GapToLeader`,
 * and a race snapshot is the other way round.
 */

/** Everything the feed publishes, keyed by topic name. All optional: an idle feed sends 13 of these, a running session more. */
export interface FeedState {
  Heartbeat?: Heartbeat;
  ExtrapolatedClock?: ExtrapolatedClock;
  TimingStats?: TimingStats;
  TimingAppData?: TimingAppData;
  WeatherData?: WeatherData;
  TrackStatus?: TrackStatus;
  SessionStatus?: SessionStatus;
  DriverList?: DriverList;
  RaceControlMessages?: RaceControlMessages;
  SessionInfo?: SessionInfo;
  SessionData?: SessionData;
  LapCount?: LapCount;
  TimingData?: TimingData;
  TeamRadio?: TeamRadio;
  /** Telemetry. Decompressed from `CarData.z` before it reaches here. */
  CarData?: CarDataTopic;
  /** Track position. Decompressed from `Position.z` before it reaches here. */
  Position?: PositionTopic;
}

export interface Heartbeat {
  Utc: string;
}

export interface ExtrapolatedClock {
  Utc: string;
  /** Time left in the session as `"HH:MM:SS"`. */
  Remaining: string;
  Extrapolating: boolean;
}

export interface SessionInfo {
  Meeting?: {
    Key?: number;
    Name?: string;
    OfficialName?: string;
    Location?: string;
    Number?: number;
    Country?: { Key?: number; Code?: string; Name?: string };
    Circuit?: { Key?: number; ShortName?: string };
  };
  Key?: number;
  Type?: string;
  Name?: string;
  /**
   * Local time at the circuit, with **no timezone** — `"2026-09-12T16:00:00"`.
   * Subtract `GmtOffset` to get UTC. Parsing it directly gives whatever the
   * reader's own timezone happens to be.
   */
  StartDate?: string;
  EndDate?: string;
  /** `"02:00:00"`, and negative for the Americas. */
  GmtOffset?: string;
  Path?: string;
}

export interface SessionStatus {
  /** `Inactive`, `Started`, `Finished`, `Finalised`, `Ends`. */
  Status?: string;
  Started?: string;
}

export interface TrackStatus {
  /** A numeric code as a string. Prefer `Message`, which spells it out. */
  Status?: string;
  /** `AllClear`, `Yellow`, `Red`, `SCDeployed`, `VSCDeployed`, ... */
  Message?: string;
}

export interface SessionData {
  /**
   * Session milestones. Carries `QualifyingPart` in qualifying and `Lap` in a
   * race — the fixture proves the former, f1-dash's types the latter.
   */
  Series?: { Utc?: string; QualifyingPart?: number; Lap?: number }[];
  /** Timestamped track and session status changes, in words rather than codes. */
  StatusSeries?: {
    Utc?: string;
    TrackStatus?: string;
    SessionStatus?: string;
    /** The feed's own typo, preserved. Seen in f1-dash's types; treat as `SessionStatus`. */
    SesionStatus?: string;
  }[];
}

export interface LapCount {
  CurrentLap?: number;
  TotalLaps?: number;
}

/** Keyed by driver number as a string: `"44"`. */
export type DriverList = Record<string, FeedDriver | undefined>;

export interface FeedDriver {
  RacingNumber?: string;
  BroadcastName?: string;
  FullName?: string;
  /** Three-letter acronym, e.g. `"NOR"`. OpenF1 calls this `name_acronym`. */
  Tla?: string;
  Line?: number;
  TeamName?: string;
  /** Hex with no leading `#`, matching OpenF1's convention exactly. */
  TeamColour?: string;
  FirstName?: string;
  LastName?: string;
  Reference?: string;
  HeadshotUrl?: string;
  CountryCode?: string;
}

export interface WeatherData {
  /** Every one of these is a string, including the numbers. */
  AirTemp?: string;
  Humidity?: string;
  Pressure?: string;
  /** `"0"` or `"1"`. */
  Rainfall?: string;
  TrackTemp?: string;
  WindDirection?: string;
  WindSpeed?: string;
}

export interface RaceControlMessages {
  /**
   * An array in the snapshot, but patched with numeric-keyed objects — see
   * `feed-state.ts`. A delta that looks like `{Messages: {"37": {...}}}` is an
   * insert at index 37, not a replacement.
   */
  Messages?: FeedRaceControlMessage[];
}

export interface FeedRaceControlMessage {
  Utc?: string;
  Lap?: number;
  Message?: string;
  Category?: string;
  Flag?: string;
  Scope?: string;
  Sector?: number;
  RacingNumber?: string;
  Status?: string;
}

export interface TeamRadio {
  Captures?: { Utc?: string; RacingNumber?: string; Path?: string }[];
}

export interface TimingAppData {
  Lines?: Record<string, TimingAppDataDriver | undefined>;
}

export interface TimingAppDataDriver {
  RacingNumber?: string;
  Stints?: FeedStint[];
  Line?: number;
  GridPos?: string;
}

export interface FeedStint {
  Compound?: string;
  /** `"true"` / `"false"` as strings, not booleans. */
  New?: string;
  /** Laps on this set so far. */
  TotalLaps?: number;
  /**
   * Laps already on the tyre when the stint began — OpenF1's
   * `tyre_age_at_start`. Non-zero for a scrubbed set.
   */
  StartLaps?: number;
  /** The lap this stint began on. */
  LapNumber?: number;
  LapFlags?: number;
  LapTime?: string;
  TyresNotChanged?: string;
}

export interface TimingData {
  /** Cars left in each qualifying part, e.g. `[22, 16, 10]`. */
  NoEntries?: number[];
  /** 1, 2 or 3 during qualifying. */
  SessionPart?: number;
  CutOffTime?: string;
  CutOffPercentage?: string;
  Lines?: Record<string, TimingDataDriver | undefined>;
  Withheld?: boolean;
}

export interface TimingDataDriver {
  Line?: number;
  /** Classified position, as a string. */
  Position?: string;
  ShowPosition?: boolean;
  RacingNumber?: string;
  Retired?: boolean;
  InPit?: boolean;
  PitOut?: boolean;
  Stopped?: boolean;
  Status?: number;
  NumberOfLaps?: number;
  NumberOfPitStops?: number;

  /** Three entries, sectors 1-3. */
  Sectors?: FeedSector[];
  Speeds?: FeedSpeeds;
  BestLapTime?: { Value?: string; Lap?: number };
  LastLapTime?: FeedTimedValue;

  /* Race only. Absent from a qualifying snapshot, so these two come from
   * f1-dash's types rather than from our capture, and are the least certain
   * fields in this file. */
  GapToLeader?: string;
  IntervalToPositionAhead?: { Value?: string; Catching?: boolean };

  /* Qualifying only, all four confirmed by the capture. */
  Stats?: { TimeDiffToFastest?: string; TimeDifftoPositionAhead?: string }[];
  BestLapTimes?: { Value?: string; Lap?: number }[];
  KnockedOut?: boolean;
  Cutoff?: boolean;
}

export interface FeedSector {
  Stopped?: boolean;
  /** The current lap's time for this sector, `""` until the car crosses it. */
  Value?: string;
  /**
   * The previous lap's time. This is what survives: `Value` is blanked when the
   * car is in the pits, but `PreviousValue` keeps the last real one.
   */
  PreviousValue?: string;
  Status?: number;
  OverallFastest?: boolean;
  PersonalFastest?: boolean;
  /** Mini-sectors. `Status` here is OpenF1's `segments_sector_N` code. */
  Segments?: { Status?: number }[];
}

export interface FeedTimedValue {
  Value?: string;
  Status?: number;
  OverallFastest?: boolean;
  PersonalFastest?: boolean;
}

/** `FL` and `ST` are upper case in the real feed, whatever f1-dash's types say. */
export interface FeedSpeeds {
  /** Intermediate 1. */
  I1?: FeedTimedValue;
  /** Intermediate 2. */
  I2?: FeedTimedValue;
  /** Finish line. */
  FL?: FeedTimedValue;
  /** Speed trap. */
  ST?: FeedTimedValue;
}

export interface TimingStats {
  Withheld?: boolean;
  SessionType?: string;
  Lines?: Record<string, TimingStatsDriver | undefined>;
}

export interface TimingStatsDriver {
  Line?: number;
  RacingNumber?: string;
  PersonalBestLapTime?: { Value?: string; Lap?: number; Position?: number };
  BestSectors?: { Value?: string; Position?: number }[];
  BestSpeeds?: {
    I1?: { Value?: string; Position?: number };
    I2?: { Value?: string; Position?: number };
    FL?: { Value?: string; Position?: number };
    ST?: { Value?: string; Position?: number };
  };
}

/*
 * Telemetry and track position.
 *
 * Both arrive as `CarData.z` / `Position.z`: base64 raw-deflate JSON. These two
 * shapes are the only ones here that no capture has confirmed, because an idle
 * feed carries neither topic — they appear when cars go out. They come from
 * f1-dash's types, and are the first thing to check against a live session.
 */

export interface CarDataTopic {
  Entries?: { Utc?: string; Cars?: Record<string, { Channels?: CarChannels } | undefined> }[];
}

/**
 * Telemetry channels, keyed by number. The mapping is from f1-dash's types; the
 * channel numbers are not self-describing and must not be guessed at.
 */
export interface CarChannels {
  /** RPM. */
  '0'?: number;
  /** Speed, km/h. */
  '2'?: number;
  /** Gear. */
  '3'?: number;
  /** Throttle, 0-100. */
  '4'?: number;
  /** Brake — 0 or 100 in practice, not a pressure. */
  '5'?: number;
  /** DRS status code. 10, 12 and 14 mean the flap is open. */
  '45'?: number;
}

export interface PositionTopic {
  Position?: { Timestamp?: string; Entries?: Record<string, FeedCarPosition | undefined> }[];
}

export interface FeedCarPosition {
  /** `OnTrack`, `OffTrack`, ... */
  Status?: string;
  X?: number;
  Y?: number;
  Z?: number;
}
