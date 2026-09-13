/**
 * Card 6 — pit strategy battle: two drivers, one-stop against two-stop, and who
 * finishes ahead under each combination.
 *
 * Each driver's rest of the race is projected lap by lap for a total of one stop
 * and of two, with the stops placed where `pit-forecast` puts them (equal stints).
 * A plan that asks for fewer stops than the driver has already made is not offered.
 * Every projected lap is the car's fitted pace on its tyre age, less fuel burnt;
 * a new set is assumed to wear like the current one, which the card says.
 *
 * The finishing gap for a combination is today's gap plus the difference in
 * projected time to the flag. When both plans leave exactly one stop each, the
 * existing undercut simulation is run for that combination and its answer used —
 * it is the same projection the Engineer view's undercut panel shows, so the two
 * never disagree about the same question.
 */
import { undercutSimulation } from '../undercut';
import { planWithStops } from './pit-forecast';
import { weakest, type Confidence } from './confidence';

export interface StrategyCar {
  driverNumber: number;
  label: string;
  currentLap: number;
  tyreAge: number;
  compound: string | null;
  /** Fuel-free lap time on a new set. */
  intercept: number;
  slope: number;
  fuelEffectPerLap: number;
  stopsMade: number;
  /** Seconds behind the leader now. */
  gapToLeader: number;
  stintsSoFar: { compound: string | null; lapStart: number; lapEnd: number }[];
  confidence: Confidence;
}

export interface PlanProjection {
  totalStops: number;
  stopLaps: number[];
  /** Projected seconds from now to the flag. */
  timeToFinish: number;
  /** Stints still to run: the current one, then each new set. */
  stintsAhead: { lapStart: number; lapEnd: number; newSet: boolean }[];
}

export interface StrategyCombination {
  xStops: number;
  yStops: number;
  /** Seconds X finishes ahead of Y; negative when Y is ahead. */
  finishGap: number;
  aheadLabel: string;
  viaUndercutSimulation: boolean;
}

export interface StrategyBattle {
  x: { car: StrategyCar; plans: PlanProjection[] };
  y: { car: StrategyCar; plans: PlanProjection[] };
  combinations: StrategyCombination[];
  confidence: Confidence;
}

export const PLAN_TOTAL_STOPS = [1, 2] as const;

export function projectPlan(
  car: StrategyCar,
  totalStops: number,
  { totalLaps, pitLoss }: { totalLaps: number; pitLoss: number },
): PlanProjection | null {
  const further = totalStops - car.stopsMade;
  if (further < 0 || totalLaps - car.currentLap < further + 1) return null;

  const plan = planWithStops(
    {
      currentLap: car.currentLap,
      totalLaps,
      tyreAge: car.tyreAge,
      slope: Math.max(car.slope, 1e-6),
      pitLoss,
      stopsMade: car.stopsMade,
    },
    further,
  );

  let time = 0;
  let age = car.tyreAge;
  const stintsAhead: PlanProjection['stintsAhead'] = [];
  let stintStart = car.currentLap + 1;
  let newSet = false;
  for (let lap = car.currentLap + 1; lap <= totalLaps; lap += 1) {
    age += 1;
    time += car.intercept + car.slope * age - car.fuelEffectPerLap * lap;
    if (plan.stopLaps.includes(lap)) {
      time += pitLoss;
      stintsAhead.push({ lapStart: stintStart, lapEnd: lap, newSet });
      stintStart = lap + 1;
      newSet = true;
      age = 0;
    }
  }
  stintsAhead.push({ lapStart: stintStart, lapEnd: totalLaps, newSet });

  return { totalStops, stopLaps: plan.stopLaps, timeToFinish: time, stintsAhead };
}

export function strategyBattle(
  x: StrategyCar,
  y: StrategyCar,
  options: { totalLaps: number; pitLoss: number },
): StrategyBattle {
  const plansFor = (car: StrategyCar) =>
    PLAN_TOTAL_STOPS.map((stops) => projectPlan(car, stops, options)).filter(
      (p): p is PlanProjection => p != null,
    );
  const xPlans = plansFor(x);
  const yPlans = plansFor(y);

  const combinations: StrategyCombination[] = [];
  for (const xp of xPlans) {
    for (const yp of yPlans) {
      const xFurther = xp.stopLaps.length;
      const yFurther = yp.stopLaps.length;
      let finishGap = y.gapToLeader + yp.timeToFinish - (x.gapToLeader + xp.timeToFinish);
      let viaUndercutSimulation = false;

      if (xFurther === 1 && yFurther === 1 && x.currentLap === y.currentLap) {
        /*
         * Fuel is common to both cars and cancels in the gap, so the simulation omits
         * it. The simulation ages a tyre from `tyreAge` on its first lap, where the
         * projection ages it from `tyreAge + 1` (the lap now being run adds one), so
         * it is handed the age after that lap. Without the +1 the two disagreed by
         * 0.6 s over a race, which is exactly the slope difference times the laps.
         */
        const sim = undercutSimulation({
          startLap: x.currentLap + 1,
          endLap: options.totalLaps,
          pitLoss: options.pitLoss,
          a: {
            label: x.label,
            startDeficit: x.gapToLeader,
            baseLapTime: x.intercept,
            slope: x.slope,
            tyreAge: x.tyreAge + 1,
            pitLap: xp.stopLaps[0]!,
          },
          b: {
            label: y.label,
            startDeficit: y.gapToLeader,
            baseLapTime: y.intercept,
            slope: y.slope,
            tyreAge: y.tyreAge + 1,
            pitLap: yp.stopLaps[0]!,
          },
        });
        const last = sim.timeline[sim.timeline.length - 1];
        if (last) {
          finishGap = last.gap;
          viaUndercutSimulation = true;
        }
      }

      combinations.push({
        xStops: xp.totalStops,
        yStops: yp.totalStops,
        finishGap: Number(finishGap.toFixed(2)),
        aheadLabel: finishGap >= 0 ? x.label : y.label,
        viaUndercutSimulation,
      });
    }
  }

  return {
    x: { car: x, plans: xPlans },
    y: { car: y, plans: yPlans },
    combinations,
    confidence: weakest(x.confidence, y.confidence),
  };
}
