/**
 * Typed OpenF1 client: rate-limited queue + IndexedDB cache in front of fetch.
 *
 * Every endpoint helper goes through `request()`, so caching and rate limiting
 * can never be bypassed by accident.
 */
import { cacheGet, cacheSet } from './cache';
import { HttpError, RateLimitedQueue } from './queue';
import type {
  CarData,
  Driver,
  Interval,
  Lap,
  LocationPoint,
  Meeting,
  Pit,
  Position,
  RaceControl,
  Session,
  Stint,
  Weather,
} from './types';

export const OPENF1_BASE = 'https://api.openf1.org/v1';

/** One shared queue per browser tab — the rate limit is per client, not per call site. */
const queue = new RateLimitedQueue();

export type QueryValue = string | number | boolean | undefined;
export type Query = Record<string, QueryValue>;

/**
 * Range-filter suffixes OpenF1 documents. Both end in "=", which doubles as the
 * key/value separator in the query string.
 */
const OPERATORS = ['>=', '<='] as const;

/**
 * Builds a query string by hand rather than with URLSearchParams.
 *
 * OpenF1 expresses range filters as operators inside the key, e.g.
 * `?date>=2025-09-07T13:43:49Z`. Two things follow, both verified against the
 * live API:
 *
 *  - The operator must stay literal. URLSearchParams encodes it to
 *    `date%3E%3D`, which returns 404 "No results found" where the raw form
 *    returns the 317 expected rows.
 *  - The trailing "=" of the operator IS the separator. The parameter is really
 *    the key `date>` with the value after it, so no second "=" is added.
 *
 * Values are encoded normally; the API accepts either form for those.
 */
export function buildQueryString(query: Query): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;

    const encodedValue = encodeURIComponent(String(value));
    const operator = OPERATORS.find((candidate) => key.endsWith(candidate));

    if (!operator) {
      parts.push(`${encodeURIComponent(key)}=${encodedValue}`);
      continue;
    }

    const field = key.slice(0, -operator.length);
    parts.push(`${encodeURIComponent(field)}${operator}${encodedValue}`);
  }

  return parts.join('&');
}

function buildUrl(endpoint: string, query: Query): string {
  const qs = buildQueryString(query);
  return `${OPENF1_BASE}/${endpoint}${qs ? `?${qs}` : ''}`;
}

/**
 * Thrown when OpenF1 locks global access during a live session. The whole API —
 * including historical data — returns 401 until the session ends, so this is
 * worth surfacing to the user as its own state rather than a generic error.
 */
export class LiveSessionLockoutError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = 'LiveSessionLockoutError';
  }
}

export interface RequestOptions {
  /** Skip the cache and force a network round-trip. */
  refresh?: boolean;
  signal?: AbortSignal;
}

async function request<T>(
  endpoint: string,
  query: Query,
  options: RequestOptions = {},
): Promise<T[]> {
  const url = buildUrl(endpoint, query);
  const cacheKey = url.slice(OPENF1_BASE.length + 1);

  if (!options.refresh) {
    const cached = await cacheGet<T[]>(cacheKey);
    if (cached) return cached;
  }

  const data = await queue.run(async () => {
    const response = await fetch(url, {
      signal: options.signal,
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401 && body.includes('Live F1 session in progress')) {
        throw new LiveSessionLockoutError(parseDetail(body));
      }
      /*
       * OpenF1 reports an empty result set as 404 rather than an empty array.
       * This is not an error condition: `intervals` legitimately has no rows for
       * a practice session, because there is no running order to measure gaps
       * against. Treating it as a failure made every practice and qualifying
       * session refuse to load.
       */
      if (response.status === 404 && body.includes('No results found')) {
        return [] as T[];
      }
      throw new HttpError(response.status, url, body.slice(0, 300));
    }
    return (await response.json()) as T[];
  });

  // OpenF1 returns a bare array; anything else means the shape changed.
  if (!Array.isArray(data)) {
    throw new Error(`Expected an array from ${endpoint}, got ${typeof data}`);
  }

  await cacheSet(cacheKey, data);
  return data;
}

function parseDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { detail?: string };
    return parsed.detail ?? body;
  } catch {
    return body;
  }
}

/* ------------------------------------------------------------------ *
 * Endpoint helpers
 * ------------------------------------------------------------------ */

export const getMeetings = (year: number, o?: RequestOptions) =>
  request<Meeting>('meetings', { year }, o);

export const getSessions = (year: number, meetingKey?: number, o?: RequestOptions) =>
  request<Session>('sessions', { year, meeting_key: meetingKey }, o);

export const getSession = (sessionKey: number, o?: RequestOptions) =>
  request<Session>('sessions', { session_key: sessionKey }, o);

export const getDrivers = (sessionKey: number, o?: RequestOptions) =>
  request<Driver>('drivers', { session_key: sessionKey }, o);

export const getLaps = (sessionKey: number, o?: RequestOptions) =>
  request<Lap>('laps', { session_key: sessionKey }, o);

export const getStints = (sessionKey: number, o?: RequestOptions) =>
  request<Stint>('stints', { session_key: sessionKey }, o);

export const getPits = (sessionKey: number, o?: RequestOptions) =>
  request<Pit>('pit', { session_key: sessionKey }, o);

export const getPositions = (sessionKey: number, o?: RequestOptions) =>
  request<Position>('position', { session_key: sessionKey }, o);

export const getIntervals = (sessionKey: number, o?: RequestOptions) =>
  request<Interval>('intervals', { session_key: sessionKey }, o);

export const getWeather = (sessionKey: number, o?: RequestOptions) =>
  request<Weather>('weather', { session_key: sessionKey }, o);

export const getRaceControl = (sessionKey: number, o?: RequestOptions) =>
  request<RaceControl>('race_control', { session_key: sessionKey }, o);

/**
 * Telemetry for ONE driver over ONE time window. car_data is ~3.7 Hz per car;
 * fetching a whole session would be hundreds of thousands of rows, so the date
 * filters are required rather than optional.
 */
export const getCarData = (
  sessionKey: number,
  driverNumber: number,
  dateFrom: string,
  dateTo: string,
  o?: RequestOptions,
) =>
  request<CarData>(
    'car_data',
    {
      session_key: sessionKey,
      driver_number: driverNumber,
      'date>=': dateFrom,
      'date<=': dateTo,
    },
    o,
  );

/** Track position for one driver over one time window. Same size caveat as car_data. */
export const getLocation = (
  sessionKey: number,
  driverNumber: number,
  dateFrom: string,
  dateTo: string,
  o?: RequestOptions,
) =>
  request<LocationPoint>(
    'location',
    {
      session_key: sessionKey,
      driver_number: driverNumber,
      'date>=': dateFrom,
      'date<=': dateTo,
    },
    o,
  );
