/**
 * Timing rows built by hand, for the explain tests.
 *
 * The explain functions read `DriverTimingRow`s and nothing else, so a test can
 * describe a race situation in a line — "NOR second, 0.8 s behind, on 20-lap-old
 * mediums" — without building a whole session to produce it.
 */
import type { Driver } from '@/lib/openf1/types';
import { parseGap, type DriverTimingRow } from '@/lib/replay/selectors';

export interface RowOptions {
  number?: number;
  interval?: number | string | null;
  gapToLeader?: number | string | null;
  lapNumber?: number | null;
  lastLap?: number | null;
  bestLap?: number | null;
  compound?: string | null;
  age?: number | null;
  pitCount?: number;
  isOutLap?: boolean;
}

let nextNumber = 50;

export function makeRow(
  acronym: string,
  position: number | null,
  options: RowOptions = {},
): DriverTimingRow {
  const number = options.number ?? (nextNumber += 1);
  const driver: Driver = {
    broadcast_name: acronym,
    country_code: null,
    driver_number: number,
    first_name: null,
    full_name: acronym,
    headshot_url: null,
    last_name: null,
    meeting_key: 1,
    name_acronym: acronym,
    session_key: 1,
    team_colour: '888888',
    team_name: 'Team',
  };

  return {
    driver,
    position,
    gapToLeader: parseGap(options.gapToLeader ?? null),
    interval: parseGap(options.interval ?? null),
    lapNumber: options.lapNumber === undefined ? 10 : options.lapNumber,
    lastLap: options.lastLap ?? null,
    bestLap: options.bestLap ?? null,
    isPersonalBestLap: false,
    isSessionBestLap: false,
    sectors: [
      { seconds: null, colour: 'none' },
      { seconds: null, colour: 'none' },
      { seconds: null, colour: 'none' },
    ],
    tyre: {
      compound: options.compound === undefined ? 'MEDIUM' : options.compound,
      age: options.age === undefined ? 10 : options.age,
      stintNumber: 1,
    },
    pitCount: options.pitCount ?? 0,
    isOutLap: options.isOutLap ?? false,
  };
}
