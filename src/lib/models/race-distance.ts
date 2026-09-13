/**
 * How many laps the race is.
 *
 * The obvious answer — the highest lap number in the data — is wrong. OpenF1 keeps
 * timing after the chequered flag, so a car that crosses the line and carries on
 * into the next lap has a row for a lap that is not part of the race. At the 2025
 * Australian GP that made a 57-lap race read as 58: the story strip ended on "Lap
 * 57 of 58", and "3 laps to go" appeared a lap too early.
 *
 * The race is every lap started before the chequered flag was shown. The leader
 * starts their final lap before the flag and nobody starts another one, so the
 * highest such lap number is the distance. Without a chequered flag yet — a race
 * still running, or a live session — the highest lap so far is the best available
 * answer.
 */
import type { Lap, RaceControl } from '@/lib/openf1/types';

export function raceDistance(dataset: {
  laps: Pick<Lap, 'lap_number' | 'date_start'>[];
  raceControl: Pick<RaceControl, 'flag' | 'date'>[];
}): number {
  const chequeredMs = dataset.raceControl
    .filter((message) => message.flag === 'CHEQUERED')
    .map((message) => Date.parse(message.date))
    .filter((ms) => !Number.isNaN(ms))
    .sort((a, b) => a - b)[0];

  let distance = 0;
  for (const lap of dataset.laps) {
    if (chequeredMs !== undefined) {
      if (!lap.date_start) continue;
      const startMs = Date.parse(lap.date_start);
      if (Number.isNaN(startMs) || startMs >= chequeredMs) continue;
    }
    if (lap.lap_number > distance) distance = lap.lap_number;
  }
  return distance;
}
