/**
 * Turning the feed's strings into the numbers and timestamps the app uses.
 *
 * The feed expresses everything as text, and not consistently: a lap time is
 * `"1:31.824"`, a sector is `"42.798"`, a gap is `"+0.258"` until the car is
 * lapped and then it is `"+1 LAP"`, and a value that is not known yet is `""`
 * rather than null. Every one of those needs narrowing before it can be used, and
 * OpenF1's types — seconds as numbers, `Gap = number | string | null` — are the
 * target.
 *
 * Two of these are bug traps rather than conveniences, and both have tests:
 *
 *  - `parseGap` must not use parseFloat. `parseFloat("+1 LAP")` is `1`, so a
 *    lapped car would be reported as a second behind the leader.
 *  - `feedUtcToIso` must not hand a bare timestamp to `new Date`. The feed sends
 *    `"2026-09-12T13:46:18"` in fields it names `Utc`, and JavaScript reads a
 *    timestamp with no zone as **local** time. On the machine this was written on
 *    that is a silent two-hour error, and on CI it would be none at all, which is
 *    the worst version of the bug.
 */
import type { Iso8601 } from '@/lib/openf1/types';
import type { Gap } from '@/lib/openf1/types';
import type { SessionInfo } from './feed-types';

/** Only a plain decimal number, so `"+1 LAP"` cannot pass as one. */
const NUMERIC = /^[+-]?\d+(?:\.\d+)?$/;

/**
 * Seconds from a feed duration: `"1:31.824"`, `"42.798"` or `"1:02:03.456"`.
 * Returns null for `""`, undefined and anything unparsable.
 */
export function parseFeedTime(value: string | undefined | null): number | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '') return null;

  const parts = text.split(':');
  if (parts.length > 3) return null;

  let seconds = 0;
  for (const part of parts) {
    if (!NUMERIC.test(part)) return null;
    // Each colon shifts everything before it up by a factor of 60.
    seconds = seconds * 60 + Number(part);
  }
  return seconds;
}

/** A number from a feed string. `""` and unparsable text become null. */
export function parseFeedNumber(value: string | number | undefined | null): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return NUMERIC.test(text) ? Number(text) : null;
}

/**
 * A gap, in OpenF1's `Gap` shape: seconds when it is a measurement, the original
 * string when it is a state like `"+1 LAP"`, null when it is not known.
 */
export function parseGap(value: string | undefined | null): Gap {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '') return null;
  return NUMERIC.test(text) ? Number(text) : text;
}

/** `"true"` / `"false"` as the feed sends them, i.e. as strings. */
export function parseFeedBoolean(value: string | boolean | undefined | null): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (text === 'true') return true;
  if (text === 'false') return false;
  return null;
}

/**
 * An ISO timestamp from a feed `Utc` field, forcing UTC when the feed omits the
 * zone. Fractional seconds come with up to seven digits, which `Date` truncates
 * to milliseconds — fine here, since nothing in this app resolves below a frame.
 */
export function feedUtcToIso(value: string | undefined | null): Iso8601 | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '') return null;

  // Anything already carrying a zone is left alone.
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`;
  const ms = Date.parse(withZone);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Epoch milliseconds from a feed `Utc` field. */
export function feedUtcToMs(value: string | undefined | null): number | null {
  const iso = feedUtcToIso(value);
  return iso === null ? null : Date.parse(iso);
}

/**
 * `"02:00:00"` to seconds, negative for the Americas (`"-03:00:00"`).
 *
 * This is the offset of the circuit's local time from UTC, and it is the only way
 * to place a session on a real clock: `SessionInfo.StartDate` is local time with
 * no zone attached.
 */
export function parseGmtOffsetSeconds(value: string | undefined | null): number {
  if (typeof value !== 'string' || value.trim() === '') return 0;
  const text = value.trim();
  const negative = text.startsWith('-');
  const parts = text.replace(/^[+-]/, '').split(':');
  if (parts.length === 0 || parts.length > 3) return 0;

  let seconds = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return 0;
    seconds = seconds * 60 + Number(part);
  }
  return negative ? -seconds : seconds;
}

/**
 * A local `StartDate`/`EndDate` plus `GmtOffset` as epoch milliseconds UTC.
 *
 * Verified against a real capture: `StartDate "2026-09-12T16:00:00"` with
 * `GmtOffset "02:00:00"` gives 14:00:00Z, which is exactly when that session's
 * `SessionData.StatusSeries` recorded `SessionStatus: "Started"`.
 */
export function feedLocalToMs(
  local: string | undefined | null,
  gmtOffset: string | undefined | null,
): number | null {
  if (typeof local !== 'string' || local.trim() === '') return null;
  const text = local.trim();
  // Read the wall-clock reading as if it were UTC, then undo the offset.
  const asUtc = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`);
  if (Number.isNaN(asUtc)) return null;
  return asUtc - parseGmtOffsetSeconds(gmtOffset) * 1000;
}

/** Session start and end as epoch ms, from SessionInfo alone. */
export function sessionBoundsMs(info: SessionInfo | undefined): {
  startMs: number | null;
  endMs: number | null;
} {
  return {
    startMs: feedLocalToMs(info?.StartDate, info?.GmtOffset),
    endMs: feedLocalToMs(info?.EndDate, info?.GmtOffset),
  };
}

/** The driver number from a feed key or `RacingNumber`, both of which are strings. */
export function parseDriverNumber(value: string | number | undefined | null): number | null {
  const parsed = parseFeedNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
