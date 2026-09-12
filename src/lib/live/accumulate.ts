/**
 * Builds a `SessionDataset` out of a stream of normalized rows.
 *
 * The live feed sends the same row over and over — a driver's position arrives on
 * every timing update whether it changed or not — so this is where identity
 * matters. Every collection has a key, and a row replaces the one holding its key
 * rather than piling up next to it. That is the `_key` the brief asks for; it
 * lives here in a Map rather than as a field on each row, so the rows stay exactly
 * OpenF1-shaped and every existing selector and model reads them unchanged.
 *
 * **Why this does not touch the store.** The brief describes upserting into the
 * session store, but the store has no upsert: `setDataset` replaces the dataset
 * wholesale and resets the clock. So the accumulation happens here instead, and a
 * live source hands the store a finished `SessionDataset` exactly as the OpenF1
 * loader does. No store, selector or model changes — which was the hard constraint.
 *
 * Two collections are treated differently from the rest:
 *
 *  - **Time series are deduplicated on value, not on time.** A position or gap
 *    that has not changed is not worth a row. Without this, a two-hour race would
 *    accumulate hundreds of thousands of identical position rows.
 *  - **Telemetry is capped, and is held beside the dataset rather than in it.**
 *    `SessionDataset` has no `car_data` or `location` field by design — the replay
 *    path fetches those per lap, on demand, because a whole session of them is far
 *    too much to hold. Live mode has the same problem: `CarData` arrives around
 *    4 Hz per car, which over a race is more than half a million rows, tens of
 *    megabytes, and a dead browser tab. So they accumulate in a rolling window
 *    here, reachable through `carDataFor`/`locationsFor` for a live telemetry
 *    provider to read, and the dataset shape stays untouched. The complete
 *    session is in the JSONL recording, which is where to go for all of it.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import type {
  CarData,
  Driver,
  Interval,
  Lap,
  LocationPoint,
  Pit,
  Position,
  RaceControl,
  Session,
  Stint,
  Weather,
} from '@/lib/openf1/types';
import type { NormalizedRows } from './normalize';

/** Rolling window for the two high-rate topics, in rows. */
export const DEFAULT_TELEMETRY_LIMIT = 120_000;

export interface AccumulatorOptions {
  /** Rows of `car_data` and of `location` to keep. Oldest are dropped first. */
  telemetryLimit?: number;
}

/**
 * A time-ordered list that appends in the common case and only sorts when the
 * feed actually delivers something out of order.
 *
 * Sorting on every update would be the obvious implementation and would also be
 * the expensive one: these lists reach six figures, and `build` is called on every
 * frame the clock advances.
 */
class TimeSeries<T extends { date: string }> {
  #rows: T[] = [];
  #lastMs = Number.NEGATIVE_INFINITY;
  #unsorted = false;

  push(row: T): void {
    const ms = Date.parse(row.date);
    if (ms < this.#lastMs) this.#unsorted = true;
    else this.#lastMs = ms;
    this.#rows.push(row);
  }

  /** Drops the oldest rows once the list exceeds `limit`. */
  trim(limit: number): void {
    if (this.#rows.length > limit) this.#rows = this.#rows.slice(this.#rows.length - limit);
  }

  rows(): T[] {
    if (this.#unsorted) {
      this.#rows.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      this.#unsorted = false;
    }
    return this.#rows;
  }

  get length(): number {
    return this.#rows.length;
  }
}

/**
 * One driver's rows inside a window. The lists are already time-ordered, so this
 * is a filter rather than a search; the windows asked for are a lap or two wide.
 */
function withinWindow<T extends { date: string; driver_number: number }>(
  rows: T[],
  driverNumber: number,
  fromMs?: number,
  toMs?: number,
): T[] {
  const from = fromMs ?? Number.NEGATIVE_INFINITY;
  const to = toMs ?? Number.POSITIVE_INFINITY;

  return rows.filter((row) => {
    if (row.driver_number !== driverNumber) return false;
    const ms = Date.parse(row.date);
    return ms >= from && ms <= to;
  });
}

/**
 * Folds a second sighting of the same lap into the first.
 *
 * Two things make this necessary rather than just replacing the row.
 *
 * **A lap is described in pieces.** A best-lap entry states a time and a lap number
 * and nothing else; the last-lap entry for the same lap carries sectors and trap
 * speeds. Keeping whichever arrived last would throw away the other half.
 *
 * **The first sighting is when the lap happened.** Lap start times are derived by
 * counting back from arrival, and the feed re-sends a driver's best lap on every
 * update — so replacing the row each time would drag every best lap forward with
 * the clock and leave them all looking like they had just been set.
 */
function mergeLap(existing: Lap, next: Lap): Lap {
  const pick = <K extends keyof Lap>(key: K): Lap[K] => {
    const value = next[key];
    return value === null || value === undefined ? existing[key] : value;
  };

  return {
    ...existing,
    duration_sector_1: pick('duration_sector_1'),
    duration_sector_2: pick('duration_sector_2'),
    duration_sector_3: pick('duration_sector_3'),
    i1_speed: pick('i1_speed'),
    i2_speed: pick('i2_speed'),
    st_speed: pick('st_speed'),
    segments_sector_1: pick('segments_sector_1'),
    segments_sector_2: pick('segments_sector_2'),
    segments_sector_3: pick('segments_sector_3'),
    lap_duration: pick('lap_duration'),
    // Once the feed has called a lap a pit-out lap, it stays one.
    is_pit_out_lap: existing.is_pit_out_lap || next.is_pit_out_lap,
    // Deliberately the first sighting, not the latest — see above.
    date_start: existing.date_start ?? next.date_start,
  };
}

/**
 * Stints in app order, with each driver's current stint running up to their latest
 * lap.
 *
 * A stint's end is derived from the lap counter at the last moment its
 * `TimingAppData` entry was written, so the stint a car is on right now always
 * trails the car by a lap or more. On screen that left the tyre column blank for
 * six drivers, whose in-laps had been timed after their final stint record — the
 * selector looks the tyre up by lap, and those laps belonged to no stint at all.
 * Only the last stint per driver is extended: every earlier one ended at a real
 * tyre change, and moving its end would put laps on the wrong set.
 */
function extendCurrentStints(stints: Stint[], laps: Iterable<Lap>): Stint[] {
  const lastLap = new Map<number, number>();
  for (const lap of laps) {
    lastLap.set(lap.driver_number, Math.max(lastLap.get(lap.driver_number) ?? 0, lap.lap_number));
  }

  const sorted = stints.sort(
    (a, b) => a.driver_number - b.driver_number || a.stint_number - b.stint_number,
  );

  return sorted.map((stint, index) => {
    const next = sorted[index + 1];
    const isCurrent = next === undefined || next.driver_number !== stint.driver_number;
    const reached = lastLap.get(stint.driver_number);
    return isCurrent && reached !== undefined && reached > stint.lap_end
      ? { ...stint, lap_end: reached }
      : stint;
  });
}

/** The keys that identify a row within its collection. */
const keyOf = {
  driver: (row: Driver) => String(row.driver_number),
  lap: (row: Lap) => `${row.driver_number}:${row.lap_number}`,
  stint: (row: Stint) => `${row.driver_number}:${row.stint_number}`,
  pit: (row: Pit) => `${row.driver_number}:${row.lap_number}`,
};

export class DatasetAccumulator {
  #session: Session | null = null;

  /* Keyed collections: one row per key, replaced in place. */
  #drivers = new Map<string, Driver>();
  #laps = new Map<string, Lap>();
  #stints = new Map<string, Stint>();
  #pits = new Map<string, Pit>();

  /* Time series, deduplicated on value. */
  #positions = new TimeSeries<Position>();
  #intervals = new TimeSeries<Interval>();
  #weather = new TimeSeries<Weather>();
  #carData = new TimeSeries<CarData>();
  #locations = new TimeSeries<LocationPoint>();

  /* Race control is a log: keyed so a repeated snapshot cannot duplicate it. */
  #raceControl = new Map<string, RaceControl>();

  /** Last value seen per driver, so an unchanged row can be skipped. */
  #lastPosition = new Map<number, number>();
  #lastInterval = new Map<number, string>();
  #lastWeather: string | null = null;

  #latestMs = Number.NEGATIVE_INFINITY;
  #telemetryLimit: number;

  constructor(options: AccumulatorOptions = {}) {
    this.#telemetryLimit = options.telemetryLimit ?? DEFAULT_TELEMETRY_LIMIT;
  }

  /** Folds one update's rows in. */
  apply(rows: NormalizedRows): void {
    if (rows.session) this.#session = rows.session;

    for (const driver of rows.drivers ?? []) this.#drivers.set(keyOf.driver(driver), driver);

    for (const lap of rows.laps ?? []) {
      const key = keyOf.lap(lap);
      const existing = this.#laps.get(key);
      this.#laps.set(key, existing === undefined ? lap : mergeLap(existing, lap));
    }

    for (const stint of rows.stints ?? []) this.#stints.set(keyOf.stint(stint), stint);
    for (const pit of rows.pits ?? []) this.#pits.set(keyOf.pit(pit), pit);

    for (const position of rows.positions ?? []) {
      // Only a change of position is an event; the rest is the same fact repeated.
      if (this.#lastPosition.get(position.driver_number) === position.position) continue;
      this.#lastPosition.set(position.driver_number, position.position);
      this.#positions.push(position);
      this.#note(position.date);
    }

    for (const interval of rows.intervals ?? []) {
      const signature = `${String(interval.gap_to_leader)}|${String(interval.interval)}`;
      if (this.#lastInterval.get(interval.driver_number) === signature) continue;
      this.#lastInterval.set(interval.driver_number, signature);
      this.#intervals.push(interval);
      this.#note(interval.date);
    }

    for (const weather of rows.weather ?? []) {
      /*
       * Weather is sent on a timer rather than on change, and changes slowly. The
       * signature covers every measured field, so a genuine change is always kept.
       */
      const signature = [
        weather.air_temperature,
        weather.track_temperature,
        weather.humidity,
        weather.pressure,
        weather.rainfall,
        weather.wind_direction,
        weather.wind_speed,
      ].join('|');
      if (this.#lastWeather === signature) continue;
      this.#lastWeather = signature;
      this.#weather.push(weather);
      this.#note(weather.date);
    }

    for (const message of rows.raceControl ?? []) {
      /*
       * Keyed on time plus text: a reconnect re-sends the whole message log, and
       * appending it again would double every flag in the session.
       */
      this.#raceControl.set(`${message.date}|${message.message}`, message);
      this.#note(message.date);
    }

    for (const sample of rows.carData ?? []) {
      this.#carData.push(sample);
      this.#note(sample.date);
    }
    for (const point of rows.locations ?? []) {
      this.#locations.push(point);
      this.#note(point.date);
    }

    this.#carData.trim(this.#telemetryLimit);
    this.#locations.trim(this.#telemetryLimit);
  }

  #note(date: string): void {
    const ms = Date.parse(date);
    if (!Number.isNaN(ms) && ms > this.#latestMs) this.#latestMs = ms;
  }

  /** True once there is enough to build a dataset — which means SessionInfo. */
  get ready(): boolean {
    return this.#session !== null;
  }

  /** Most recent row timestamp seen, epoch ms, or null if nothing has arrived. */
  get latestMs(): number | null {
    return this.#latestMs === Number.NEGATIVE_INFINITY ? null : this.#latestMs;
  }

  /**
   * The dataset as it stands, or null until SessionInfo has arrived.
   *
   * `endMs` extends past the scheduled end as the session overruns, because the
   * replay clock will not scrub past `endMs` and a race that runs long would
   * otherwise stop being watchable at exactly the wrong moment.
   */
  build(): SessionDataset | null {
    const session = this.#session;
    if (session === null) return null;

    const startMs = Date.parse(session.date_start);
    const scheduledEndMs = Date.parse(session.date_end);
    const endMs = Math.max(
      Number.isNaN(scheduledEndMs) ? startMs : scheduledEndMs,
      this.#latestMs === Number.NEGATIVE_INFINITY ? startMs : this.#latestMs,
    );

    return {
      session,
      drivers: [...this.#drivers.values()].sort((a, b) => a.driver_number - b.driver_number),
      laps: [...this.#laps.values()].sort(
        (a, b) => a.driver_number - b.driver_number || a.lap_number - b.lap_number,
      ),
      stints: extendCurrentStints([...this.#stints.values()], this.#laps.values()),
      pits: [...this.#pits.values()].sort(
        (a, b) => a.driver_number - b.driver_number || a.lap_number - b.lap_number,
      ),
      positions: this.#positions.rows(),
      intervals: this.#intervals.rows(),
      weather: this.#weather.rows(),
      raceControl: [...this.#raceControl.values()].sort(
        (a, b) => Date.parse(a.date) - Date.parse(b.date),
      ),
      startMs,
      endMs,
    };
  }

  /**
   * Telemetry for one driver within a time window, oldest first.
   *
   * This is the live counterpart of the per-lap `car_data` request the replay path
   * makes against OpenF1, and returns the same row type so a telemetry provider can
   * take either. Rows outside the rolling window are gone — see the note at the top.
   */
  carDataFor(driverNumber: number, fromMs?: number, toMs?: number): CarData[] {
    return withinWindow(this.#carData.rows(), driverNumber, fromMs, toMs);
  }

  /** Track positions for one driver within a time window, oldest first. */
  locationsFor(driverNumber: number, fromMs?: number, toMs?: number): LocationPoint[] {
    return withinWindow(this.#locations.rows(), driverNumber, fromMs, toMs);
  }

  /** Row counts, for the connection status line. */
  counts(): Record<string, number> {
    return {
      drivers: this.#drivers.size,
      laps: this.#laps.size,
      stints: this.#stints.size,
      pits: this.#pits.size,
      positions: this.#positions.length,
      intervals: this.#intervals.length,
      weather: this.#weather.length,
      raceControl: this.#raceControl.size,
      carData: this.#carData.length,
      locations: this.#locations.length,
    };
  }
}
