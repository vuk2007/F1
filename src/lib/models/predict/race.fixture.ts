/**
 * Synthetic races for the prediction unit tests.
 *
 * Every lap time is generated from a stated rule — base pace, tyre wear per lap,
 * fuel burn — so a test can check that a model recovers the rule rather than
 * matching a number someone eyeballed. The real-race outcome tests use the
 * downloaded sessions in __fixtures__ instead.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Driver, Interval, Lap, Pit, Position, Stint } from '@/lib/openf1/types';
import { makeFixture } from '@/lib/replay/fixture';

export const RACE_T0 = Date.parse('2025-06-01T13:00:00.000Z');
export const iso = (ms: number) => new Date(ms).toISOString();

export interface StintPlan {
  compound: string;
  laps: number;
  /** Seconds lost per lap of tyre age. */
  wear: number;
  /** Extra seconds per lap of age squared, for a tyre going off the cliff. */
  cliff?: number;
  /** Seconds slower than this car's base pace on a new set of this compound. */
  offset?: number;
}

export interface CarPlan {
  number: number;
  acronym: string;
  /** Lap time on a new set at the start-of-race fuel load. */
  base: number;
  /** Milliseconds behind the first car at the start. Defaults to 200 ms per grid slot. */
  startOffsetMs?: number;
  stints: StintPlan[];
}

export interface SyntheticRace {
  dataset: SessionDataset;
  /** Completion time of each car's laps, by car then lap number. */
  lapEnd: Map<number, Map<number, number>>;
}

/** Seconds a race lap gets quicker per lap as fuel burns off. */
export const FUEL = 0.055;
export const PIT_LOSS = 22;

/**
 * Builds a race lap by lap. Positions and intervals follow from the cumulative
 * times, so gaps, pit stops and overtakes are all consistent with the lap times.
 */
export function syntheticRace(cars: CarPlan[], totalLaps: number): SyntheticRace {
  const base = makeFixture();
  const laps: Lap[] = [];
  const stints: Stint[] = [];
  const pits: Pit[] = [];
  const lapEnd = new Map<number, Map<number, number>>();
  const drivers: Driver[] = cars.map((car) => ({
    ...base.drivers[0]!,
    driver_number: car.number,
    name_acronym: car.acronym,
    full_name: car.acronym,
  }));

  for (const [index, car] of cars.entries()) {
    let t = RACE_T0 + (car.startOffsetMs ?? index * 200);
    let lapNumber = 0;
    const ends = new Map<number, number>();
    car.stints.forEach((plan, stintIndex) => {
      const lapStart = lapNumber + 1;
      for (let age = 1; age <= plan.laps && lapNumber < totalLaps; age += 1) {
        lapNumber += 1;
        const inLap = age === plan.laps && stintIndex < car.stints.length - 1;
        const outLap = age === 1 && stintIndex > 0;
        const duration =
          car.base +
          (plan.offset ?? 0) +
          plan.wear * age +
          (plan.cliff ?? 0) * age * age -
          FUEL * lapNumber +
          (inLap ? PIT_LOSS / 2 : 0) +
          (outLap ? PIT_LOSS / 2 : 0);
        laps.push({
          ...base.laps[0]!,
          driver_number: car.number,
          lap_number: lapNumber,
          date_start: iso(t),
          lap_duration: Number(duration.toFixed(3)),
          duration_sector_1: null,
          duration_sector_2: null,
          duration_sector_3: null,
          is_pit_out_lap: outLap,
        });
        t += duration * 1000;
        ends.set(lapNumber, t);
        if (inLap) {
          pits.push({
            ...base.pits[0]!,
            driver_number: car.number,
            lap_number: lapNumber,
            date: iso(t - 5000),
            lane_duration: 24,
            pit_duration: 24,
            stop_duration: 2.5,
          });
        }
      }
      stints.push({
        compound: plan.compound,
        driver_number: car.number,
        lap_end: lapNumber,
        lap_start: lapStart,
        meeting_key: 1000,
        session_key: 9999,
        stint_number: stintIndex + 1,
        tyre_age_at_start: 0,
      });
    });
    lapEnd.set(car.number, ends);
  }

  /* Order and gaps at every lap end, from the cumulative times. */
  const positions: Position[] = [];
  const intervals: Interval[] = [];
  for (let lap = 1; lap <= totalLaps; lap += 1) {
    const order = cars
      .map((car) => ({ car, end: lapEnd.get(car.number)?.get(lap) }))
      .filter((entry): entry is { car: CarPlan; end: number } => entry.end != null)
      .sort((a, b) => a.end - b.end);
    order.forEach((entry, i) => {
      const date = iso(entry.end + 1);
      positions.push({
        date,
        driver_number: entry.car.number,
        meeting_key: 1000,
        position: i + 1,
        session_key: 9999,
      });
      intervals.push({
        date,
        driver_number: entry.car.number,
        gap_to_leader: Number(((entry.end - order[0]!.end) / 1000).toFixed(3)),
        interval: i === 0 ? 0 : Number(((entry.end - order[i - 1]!.end) / 1000).toFixed(3)),
        meeting_key: 1000,
        session_key: 9999,
      });
    });
  }

  const lastEnd = Math.max(...[...lapEnd.values()].flatMap((m) => [...m.values()]));
  const dataset: SessionDataset = {
    ...base,
    session: {
      ...base.session,
      session_type: 'Race',
      session_name: 'Race',
      circuit_short_name: 'Nowhere',
    },
    drivers,
    laps,
    stints,
    pits,
    positions,
    intervals,
    raceControl: [],
    weather: base.weather,
    startMs: RACE_T0,
    endMs: lastEnd,
  };
  return { dataset, lapEnd };
}

/** The moment a car finished a given lap, plus a second so it is safely in the past. */
export function afterLap(race: SyntheticRace, carNumber: number, lap: number): number {
  const end = race.lapEnd.get(carNumber)?.get(lap);
  if (end == null) throw new Error(`car ${carNumber} has no lap ${lap}`);
  return end + 1000;
}
