/**
 * Feed topics in, OpenF1-shaped rows out.
 *
 * This is the only place that sees both vocabularies. Everything downstream —
 * `SessionDataset`, the replay selectors, every model, the UI — keeps reading the
 * OpenF1 types it already reads, which is the whole point: live mode is a second
 * source for the same shapes, not a second shape.
 *
 * Two things worth knowing before changing anything here.
 *
 * **Race control needs no translation at all.** The feed's `Category`, `Flag` and
 * `Scope` vocabularies turn out to be exactly OpenF1's: the captured session
 * contains `Flag` values GREEN, CHEQUERED, DOUBLE YELLOW, YELLOW, CLEAR and BLACK
 * AND WHITE, and `Scope` values Track, Sector and Driver — every one of them
 * already in `RaceControlFlag` and `RaceControl.scope`. So those fields are passed
 * through verbatim rather than mapped, and `cautionPeriods` works on live rows
 * unchanged.
 *
 * **Lap numbering is off by one between topics, and getting it wrong would
 * misalign every lap with its stint.** For car 1 in the capture, the lap that set
 * 1:31.824 is `Lap: 18` in `TimingData.BestLapTime` and in `TimingStats`, but the
 * stint holding that same lap time is labelled `LapNumber: 19`. So
 * `TimingAppData.LapNumber` and `NumberOfLaps` count laps **started**, while
 * `BestLapTime.Lap` counts laps **completed**. Everything here uses the completed
 * numbering, and `completedLapNumber` is the single place that conversion happens.
 * That reading is asserted against the fixture in the tests, for three cars.
 */
import type {
  CarData,
  Driver,
  Interval,
  Iso8601,
  Lap,
  LocationPoint,
  Pit,
  Position,
  RaceControl,
  Session,
  Stint,
  Weather,
} from '@/lib/openf1/types';
import type {
  CarDataTopic,
  DriverList,
  FeedSector,
  LapCount,
  PositionTopic,
  RaceControlMessages,
  SessionInfo,
  SessionStatus,
  TimingAppData,
  TimingData,
  TimingDataDriver,
  TrackStatus,
  WeatherData,
} from './feed-types';
import {
  feedUtcToIso,
  feedUtcToMs,
  parseDriverNumber,
  parseFeedNumber,
  parseFeedTime,
  parseGap,
  sessionBoundsMs,
} from './parse';

/** What a normalizer needs that is not in the topic it is handed. */
export interface NormalizeContext {
  sessionKey: number;
  meetingKey: number;
  /** When this update was observed, used to stamp time-series rows. */
  atIso: Iso8601;
  /** Race lap, from `LapCount`. Null outside a race. */
  lapNumber: number | null;
  /** 1, 2 or 3 during qualifying, from `TimingData.SessionPart`. */
  qualifyingPhase: number | null;
}

/**
 * Rows produced by one update. Every field is optional: a `WeatherData` delta
 * yields one weather row and nothing else.
 */
export interface NormalizedRows {
  session?: Session;
  drivers?: Driver[];
  laps?: Lap[];
  stints?: Stint[];
  pits?: Pit[];
  positions?: Position[];
  intervals?: Interval[];
  weather?: Weather[];
  raceControl?: RaceControl[];
  carData?: CarData[];
  locations?: LocationPoint[];
}

/**
 * The feed counts laps started; OpenF1 numbers laps that finished. Off by one,
 * and only ever converted here.
 */
function completedLapNumber(lapsStarted: number | undefined): number | null {
  if (typeof lapsStarted !== 'number' || lapsStarted < 1) return null;
  return lapsStarted - 1;
}

/** Skips `_kf` and any other non-driver key the feed puts in a Lines object. */
function driverEntries<T>(lines: Record<string, T | undefined> | undefined): [number, T][] {
  const out: [number, T][] = [];
  for (const [key, value] of Object.entries(lines ?? {})) {
    const driverNumber = parseDriverNumber(key);
    if (driverNumber === null || value === undefined) continue;
    out.push([driverNumber, value]);
  }
  return out;
}

/* -------------------------------------------------------------- SessionInfo */

/**
 * `SessionInfo` to OpenF1's `Session`.
 *
 * Two fields have no equivalent in the feed. `is_cancelled` is always false — a
 * cancelled session does not stream. `country_key`/`circuit_key` come from the
 * feed's own keys, which are F1's numbering rather than OpenF1's, so they agree in
 * shape but not necessarily in value; nothing in this app joins on them.
 */
export function normalizeSession(
  info: SessionInfo | undefined,
  sessionKey: number,
): Session | null {
  if (!info) return null;

  const { startMs, endMs } = sessionBoundsMs(info);
  if (startMs === null) return null;

  const meeting = info.Meeting ?? {};
  const type = info.Type ?? '';

  return {
    circuit_key: meeting.Circuit?.Key ?? 0,
    circuit_short_name: meeting.Circuit?.ShortName ?? '',
    country_code: meeting.Country?.Code ?? '',
    country_key: meeting.Country?.Key ?? 0,
    country_name: meeting.Country?.Name ?? '',
    date_start: new Date(startMs).toISOString(),
    // A session with no end date is given its start, so `endMs` never precedes it.
    date_end: new Date(endMs ?? startMs).toISOString(),
    gmt_offset: info.GmtOffset ?? '00:00:00',
    is_cancelled: false,
    location: meeting.Location ?? '',
    meeting_key: meeting.Key ?? 0,
    session_key: info.Key ?? sessionKey,
    session_name: info.Name ?? '',
    /*
     * The feed's Type is already Practice / Qualifying / Race. `SessionType` is an
     * open union, so a sprint or anything new passes through rather than being
     * forced into one of the three.
     */
    session_type: type,
    year: new Date(startMs).getUTCFullYear(),
  };
}

/* --------------------------------------------------------------- DriverList */

export function normalizeDrivers(list: DriverList | undefined, ctx: NormalizeContext): Driver[] {
  return driverEntries(list).map(([driverNumber, driver]) => ({
    broadcast_name: driver.BroadcastName ?? '',
    country_code: driver.CountryCode ?? null,
    driver_number: driverNumber,
    first_name: driver.FirstName ?? null,
    full_name: driver.FullName ?? '',
    headshot_url: driver.HeadshotUrl ?? null,
    last_name: driver.LastName ?? null,
    meeting_key: ctx.meetingKey,
    name_acronym: driver.Tla ?? '',
    session_key: ctx.sessionKey,
    // The feed omits the '#' exactly as OpenF1 does, so this needs no work.
    team_colour: driver.TeamColour ?? null,
    team_name: driver.TeamName ?? null,
  }));
}

/* ------------------------------------------------------------ TimingAppData */

/**
 * `TimingAppData` to stints and pit stops.
 *
 * Stint boundaries are derived, because the feed gives one number per stint and
 * not a range. `LapNumber` is the lap counter when that stint became current, in
 * laps-started numbering, so a stint covers the completed laps from the previous
 * entry's `LapNumber` up to its own minus one.
 *
 * That derivation is confirmed by the capture: for cars 1, 44 and 10 the stint's
 * own `LapTime` is the fastest lap in exactly the range this produces, and lands
 * in the same stint as `BestLapTime.Lap`. The tests assert it.
 *
 * `TotalLaps` is deliberately not used for boundaries. It counts laps on the tyre
 * set, which includes laps run on it before the stint (`StartLaps`) and disagrees
 * with the lap counter often enough in qualifying to be useless for this.
 */
export function normalizeStints(
  data: TimingAppData | undefined,
  ctx: NormalizeContext,
): { stints: Stint[]; pits: Pit[] } {
  const stints: Stint[] = [];
  const pits: Pit[] = [];

  for (const [driverNumber, line] of driverEntries(data?.Lines)) {
    const feedStints = line.Stints ?? [];

    feedStints.forEach((stint, index) => {
      const startsAt = index === 0 ? 1 : (feedStints[index - 1]?.LapNumber ?? 1);
      const endsAt = completedLapNumber(stint.LapNumber);

      stints.push({
        compound: stint.Compound ?? null,
        driver_number: driverNumber,
        lap_start: startsAt,
        // A stint whose first lap is not finished has no completed lap yet.
        lap_end: endsAt !== null && endsAt >= startsAt ? endsAt : startsAt,
        meeting_key: ctx.meetingKey,
        session_key: ctx.sessionKey,
        stint_number: index + 1,
        tyre_age_at_start: stint.StartLaps ?? null,
      });

      /*
       * Every stint after the first was preceded by a stop, on the last lap of the
       * stint before it.
       *
       * All three durations are null, and that is not an omission: the live feed
       * does not publish pit lane or stationary times at all. F1's own graphics
       * compute them from the timing loops. So `pitLoss` and anything else needing
       * a duration will report nothing for a live session rather than a wrong
       * number, which is the right failure.
       */
      if (index > 0) {
        const inLap = startsAt - 1;
        if (inLap >= 1) {
          pits.push({
            date: ctx.atIso,
            driver_number: driverNumber,
            lane_duration: null,
            lap_number: inLap,
            meeting_key: ctx.meetingKey,
            pit_duration: null,
            session_key: ctx.sessionKey,
            stop_duration: null,
          });
        }
      }
    });
  }

  return { stints, pits };
}

/* --------------------------------------------------------------- TimingData */

function sectorTime(sector: FeedSector | undefined): number | null {
  /*
   * `Value` holds the lap in progress and is blanked when the car pits, at which
   * point `PreviousValue` is the only record of the last real sector. Preferring
   * Value and falling back keeps a completed lap intact through a pit entry.
   *
   * This is the least certain read in the file: which of the two holds the lap
   * that just finished, at the instant `LastLapTime` updates, can only be settled
   * by watching a live session. Rows are upserted by lap number, so a correction
   * on the following update overwrites rather than duplicates.
   */
  return parseFeedTime(sector?.Value) ?? parseFeedTime(sector?.PreviousValue);
}

function segments(sector: FeedSector | undefined): (number | null)[] | null {
  const list = sector?.Segments;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.map((segment) => (typeof segment?.Status === 'number' ? segment.Status : null));
}

/** A lap row, but only once the feed has a completed lap time to report. */
function lapFrom(driverNumber: number, line: TimingDataDriver, ctx: NormalizeContext): Lap | null {
  const lapNumber = completedLapNumber(line.NumberOfLaps);
  if (lapNumber === null || lapNumber < 1) return null;

  const duration = parseFeedTime(line.LastLapTime?.Value);
  const sectors = line.Sectors ?? [];

  /*
   * The feed does not timestamp a lap's start, so it is derived by counting back
   * from when the completed time arrived. Good to about the message latency, which
   * is well inside what the replay clock resolves.
   */
  const atMs = Date.parse(ctx.atIso);
  const startIso =
    duration !== null && !Number.isNaN(atMs)
      ? new Date(atMs - duration * 1000).toISOString()
      : null;

  return {
    date_start: startIso,
    driver_number: driverNumber,
    duration_sector_1: sectorTime(sectors[0]),
    duration_sector_2: sectorTime(sectors[1]),
    duration_sector_3: sectorTime(sectors[2]),
    i1_speed: parseFeedNumber(line.Speeds?.I1?.Value),
    i2_speed: parseFeedNumber(line.Speeds?.I2?.Value),
    is_pit_out_lap: line.PitOut === true,
    lap_duration: duration,
    lap_number: lapNumber,
    meeting_key: ctx.meetingKey,
    segments_sector_1: segments(sectors[0]),
    segments_sector_2: segments(sectors[1]),
    segments_sector_3: segments(sectors[2]),
    session_key: ctx.sessionKey,
    st_speed: parseFeedNumber(line.Speeds?.ST?.Value),
  };
}

/**
 * Gaps, from whichever pair of fields this session type uses.
 *
 * A race sends `GapToLeader` and `IntervalToPositionAhead`. Qualifying sends
 * `Stats`, one entry per part, holding the same two numbers under different names.
 * The capture proves the qualifying pair; the race pair is the one thing here
 * taken from f1-dash's types rather than from data, since a qualifying snapshot
 * has neither field.
 */
function gapsFrom(
  line: TimingDataDriver,
  qualifyingPhase: number | null,
): { toLeader: Interval['gap_to_leader']; toAhead: Interval['interval'] } | null {
  if (line.GapToLeader !== undefined || line.IntervalToPositionAhead !== undefined) {
    return {
      toLeader: parseGap(line.GapToLeader),
      toAhead: parseGap(line.IntervalToPositionAhead?.Value),
    };
  }

  const stats = line.Stats;
  if (Array.isArray(stats) && stats.length > 0) {
    // Stats is indexed by qualifying part; fall back to the last one populated.
    const index = qualifyingPhase !== null ? qualifyingPhase - 1 : stats.length - 1;
    const stat = stats[index] ?? stats[stats.length - 1];
    return {
      toLeader: parseGap(stat?.TimeDiffToFastest),
      toAhead: parseGap(stat?.TimeDifftoPositionAhead),
    };
  }

  return null;
}

export function normalizeTiming(
  data: TimingData | undefined,
  ctx: NormalizeContext,
): { positions: Position[]; intervals: Interval[]; laps: Lap[] } {
  const positions: Position[] = [];
  const intervals: Interval[] = [];
  const laps: Lap[] = [];

  const phase = data?.SessionPart ?? ctx.qualifyingPhase;

  for (const [driverNumber, line] of driverEntries(data?.Lines)) {
    const position = parseFeedNumber(line.Position);
    if (position !== null) {
      positions.push({
        date: ctx.atIso,
        driver_number: driverNumber,
        meeting_key: ctx.meetingKey,
        position,
        session_key: ctx.sessionKey,
      });
    }

    const gaps = gapsFrom(line, phase ?? null);
    if (gaps !== null) {
      intervals.push({
        date: ctx.atIso,
        driver_number: driverNumber,
        gap_to_leader: gaps.toLeader,
        interval: gaps.toAhead,
        meeting_key: ctx.meetingKey,
        session_key: ctx.sessionKey,
      });
    }

    const lap = lapFrom(driverNumber, line, ctx);
    if (lap !== null) laps.push(lap);
  }

  return { positions, intervals, laps };
}

/* -------------------------------------------------------------- WeatherData */

export function normalizeWeather(data: WeatherData | undefined, ctx: NormalizeContext): Weather[] {
  if (!data) return [];
  return [
    {
      air_temperature: parseFeedNumber(data.AirTemp),
      date: ctx.atIso,
      humidity: parseFeedNumber(data.Humidity),
      meeting_key: ctx.meetingKey,
      pressure: parseFeedNumber(data.Pressure),
      rainfall: parseFeedNumber(data.Rainfall),
      session_key: ctx.sessionKey,
      track_temperature: parseFeedNumber(data.TrackTemp),
      wind_direction: parseFeedNumber(data.WindDirection),
      wind_speed: parseFeedNumber(data.WindSpeed),
    },
  ];
}

/* ------------------------------------------------------- RaceControlMessages */

/**
 * Race control messages, passed through almost unchanged.
 *
 * `Category`, `Flag` and `Scope` are the feed's own words and are already
 * OpenF1's, verified against every message in the captured session. They are not
 * remapped — remapping could only introduce errors.
 */
export function normalizeRaceControl(
  data: RaceControlMessages | undefined,
  ctx: NormalizeContext,
): RaceControl[] {
  const out: RaceControl[] = [];

  for (const message of data?.Messages ?? []) {
    const date = feedUtcToIso(message?.Utc);
    if (date === null) continue;

    out.push({
      category: message.Category ?? 'Other',
      date,
      driver_number: parseDriverNumber(message.RacingNumber),
      flag: message.Flag ?? null,
      // Qualifying messages carry no lap; a race's do.
      lap_number: typeof message.Lap === 'number' ? message.Lap : ctx.lapNumber,
      meeting_key: ctx.meetingKey,
      message: message.Message ?? '',
      qualifying_phase: ctx.qualifyingPhase,
      scope: message.Scope ?? null,
      sector: typeof message.Sector === 'number' ? message.Sector : null,
      session_key: ctx.sessionKey,
    });
  }

  return out;
}

/* ------------------------------------------------- TrackStatus / SessionStatus */

/**
 * Only the two words a real capture proves.
 *
 * `TrackStatus.Message` is a word rather than a code, but the captured session
 * only ever contains `AllClear` and `Yellow`, so those are the only two asserted.
 * Everything else — the safety car and red flag words — is passed through as an
 * uncategorised message with its text intact, rather than guessed at.
 *
 * Nothing is lost by that caution: `RaceControlMessages` already carries safety
 * car and red flag events with `Category: "SafetyCar"` and `Flag: "RED"`, which is
 * what `cautionPeriods` reads. These rows are a supplement, not the source.
 */
const TRACK_STATUS_FLAGS: Record<string, string> = {
  allclear: 'CLEAR',
  yellow: 'YELLOW',
};

export function normalizeTrackStatus(
  data: TrackStatus | undefined,
  ctx: NormalizeContext,
): RaceControl[] {
  const word = data?.Message?.trim();
  if (!word) return [];

  const flag = TRACK_STATUS_FLAGS[word.toLowerCase()] ?? null;

  return [
    {
      category: flag !== null ? 'Flag' : 'Other',
      date: ctx.atIso,
      driver_number: null,
      flag,
      lap_number: ctx.lapNumber,
      meeting_key: ctx.meetingKey,
      message: `TRACK STATUS ${word.toUpperCase()}`,
      qualifying_phase: ctx.qualifyingPhase,
      scope: 'Track',
      sector: null,
      session_key: ctx.sessionKey,
    },
  ];
}

export function normalizeSessionStatus(
  data: SessionStatus | undefined,
  ctx: NormalizeContext,
): RaceControl[] {
  const word = data?.Status?.trim();
  if (!word) return [];

  return [
    {
      category: 'Other',
      date: ctx.atIso,
      driver_number: null,
      flag: null,
      lap_number: ctx.lapNumber,
      meeting_key: ctx.meetingKey,
      message: `SESSION ${word.toUpperCase()}`,
      qualifying_phase: ctx.qualifyingPhase,
      scope: 'Track',
      sector: null,
      session_key: ctx.sessionKey,
    },
  ];
}

/* ----------------------------------------------------- CarData / Position */

/**
 * Telemetry.
 *
 * Channel numbers are not self-describing and come from f1-dash's types:
 * 0 RPM, 2 speed, 3 gear, 4 throttle, 5 brake, 45 DRS. Brake is 0 or 100 rather
 * than a pressure, which matches what OpenF1 serves.
 *
 * Neither this nor `normalizePosition` has been run against real data: an idle
 * feed carries no `CarData.z` or `Position.z` at all, so these two are the first
 * thing to check once cars are on track.
 */
export function normalizeCarData(data: CarDataTopic | undefined, ctx: NormalizeContext): CarData[] {
  const out: CarData[] = [];

  for (const entry of data?.Entries ?? []) {
    const date = feedUtcToIso(entry?.Utc) ?? ctx.atIso;

    for (const [driverNumber, car] of driverEntries(entry?.Cars)) {
      const channels = car?.Channels;
      if (!channels) continue;

      out.push({
        brake: channels['5'] ?? 0,
        date,
        drs: channels['45'] ?? 0,
        driver_number: driverNumber,
        meeting_key: ctx.meetingKey,
        n_gear: channels['3'] ?? 0,
        rpm: channels['0'] ?? 0,
        session_key: ctx.sessionKey,
        speed: channels['2'] ?? 0,
        throttle: channels['4'] ?? 0,
      });
    }
  }

  return out;
}

export function normalizePosition(
  data: PositionTopic | undefined,
  ctx: NormalizeContext,
): LocationPoint[] {
  const out: LocationPoint[] = [];

  for (const frame of data?.Position ?? []) {
    const date = feedUtcToIso(frame?.Timestamp) ?? ctx.atIso;

    for (const [driverNumber, car] of driverEntries(frame?.Entries)) {
      if (typeof car?.X !== 'number' || typeof car?.Y !== 'number') continue;

      out.push({
        date,
        driver_number: driverNumber,
        meeting_key: ctx.meetingKey,
        session_key: ctx.sessionKey,
        x: car.X,
        y: car.Y,
        z: typeof car.Z === 'number' ? car.Z : 0,
      });
    }
  }

  return out;
}

/* -------------------------------------------------------------- dispatch */

/** `CarData.z` and `CarData` are the same topic; the bridge inflates before this. */
export function baseTopic(topic: string): string {
  return topic.endsWith('.z') ? topic.slice(0, -2) : topic;
}

/** The current race lap, for the context other topics are normalized against. */
export function lapCountOf(data: LapCount | undefined): number | null {
  return typeof data?.CurrentLap === 'number' ? data.CurrentLap : null;
}

/** Epoch ms of the feed's own clock, when it sends one. */
export function heartbeatMs(data: { Utc?: string } | undefined): number | null {
  return feedUtcToMs(data?.Utc);
}

/**
 * One topic update to rows. Unknown topics produce nothing, which is how
 * `TeamRadio`, `TimingStats` and `ChampionshipPrediction` are handled: they carry
 * nothing `SessionDataset` has a home for.
 */
export function normalizeTopic(
  topic: string,
  value: unknown,
  ctx: NormalizeContext,
): NormalizedRows {
  switch (baseTopic(topic)) {
    case 'SessionInfo': {
      const session = normalizeSession(value as SessionInfo, ctx.sessionKey);
      return session === null ? {} : { session };
    }
    case 'DriverList':
      return { drivers: normalizeDrivers(value as DriverList, ctx) };
    case 'TimingAppData': {
      const { stints, pits } = normalizeStints(value as TimingAppData, ctx);
      return { stints, pits };
    }
    case 'TimingData': {
      const { positions, intervals, laps } = normalizeTiming(value as TimingData, ctx);
      return { positions, intervals, laps };
    }
    case 'WeatherData':
      return { weather: normalizeWeather(value as WeatherData, ctx) };
    case 'RaceControlMessages':
      return { raceControl: normalizeRaceControl(value as RaceControlMessages, ctx) };
    case 'TrackStatus':
      return { raceControl: normalizeTrackStatus(value as TrackStatus, ctx) };
    case 'SessionStatus':
      return { raceControl: normalizeSessionStatus(value as SessionStatus, ctx) };
    case 'CarData':
      return { carData: normalizeCarData(value as CarDataTopic, ctx) };
    case 'Position':
      return { locations: normalizePosition(value as PositionTopic, ctx) };
    default:
      return {};
  }
}
