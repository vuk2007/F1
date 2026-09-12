/**
 * The topics the Streaming hub publishes.
 *
 * Copied from f1-dash's `realtime/src/f1.rs` (its `TOPICS` const) and checked
 * against a real Subscribe reply — see bridge/README.md. Names are exact and
 * case-sensitive; the hub silently ignores ones it does not recognise, so a typo
 * shows up as a topic that never arrives rather than as an error.
 */
export const TOPICS = [
  'Heartbeat',
  'CarData.z',
  'Position.z',
  'ExtrapolatedClock',
  'TimingStats',
  'TimingAppData',
  'WeatherData',
  'TrackStatus',
  'SessionStatus',
  'DriverList',
  'RaceControlMessages',
  'SessionInfo',
  'SessionData',
  'LapCount',
  'TimingData',
  'TeamRadio',
  'ChampionshipPrediction',
] as const;

export type Topic = (typeof TOPICS)[number];

/**
 * `CarData.z` and `Position.z` arrive as base64 raw-deflate rather than JSON.
 * They are also by far the highest-volume topics: together they are most of the
 * bytes on the wire.
 */
export const COMPRESSED_TOPICS: readonly string[] = ['CarData.z', 'Position.z'];

export function isCompressed(topic: string): boolean {
  return COMPRESSED_TOPICS.includes(topic);
}
