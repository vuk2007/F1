/**
 * `CarData.z` and `Position.z` are base64-encoded **raw** deflate — no zlib
 * header. `zlib.inflateSync` fails on them; `inflateRawSync` is the one that
 * works. That single letter is the whole trick, and it is the most common reason
 * people conclude the telemetry topics are encrypted.
 */
import { inflateRawSync } from 'node:zlib';

/**
 * Returns the decoded JSON, or the value unchanged if it cannot be decoded.
 *
 * Failing soft is deliberate: telemetry is the highest-volume topic by a wide
 * margin, and one malformed frame must not take down a session recording. The
 * caller sees the raw string and can decide what to do with it.
 */
export function inflateTopic(topic: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(inflateRawSync(Buffer.from(value, 'base64')).toString('utf8'));
  } catch (error) {
    console.warn(
      `[bridge] could not inflate ${topic}: ${error instanceof Error ? error.message : error}`,
    );
    return value;
  }
}
