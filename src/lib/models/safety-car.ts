/**
 * Safety car and VSC pit opportunity.
 *
 * A stop costs what it costs in the pit lane, but what you *lose* is measured
 * against the cars still circulating. Under a caution those cars are slowed
 * while the pit lane speed limit is unchanged, so the same stop costs far less
 * relative to the field. This is why races are won and lost in the ten seconds
 * after a safety car is called.
 *
 * The reduction factors below are approximations, not measurements. They are the
 * figures commonly used in the paddock as rules of thumb, and they are exposed
 * as parameters so they can be tuned. Everything downstream treats them as
 * estimates and says so in the UI.
 */
import type { TrackStatus } from '@/lib/replay/selectors';

/**
 * Under a full safety car the field runs far slower, so a stop costs roughly
 * 40-50% of its green-flag price.
 */
export const SAFETY_CAR_PIT_LOSS_FACTOR = 0.45;

/** A VSC slows the field less than a safety car, so the discount is smaller. */
export const VSC_PIT_LOSS_FACTOR = 0.6;

/**
 * Under a red flag the race is stopped and teams may usually work on the car,
 * so a tyre change is effectively free in race-time terms.
 */
export const RED_FLAG_PIT_LOSS_FACTOR = 0;

export interface SafetyCarDriverInput {
  driverNumber: number;
  label: string;
  /** Laps on the current set. */
  tyreAge: number;
  /** Degradation of the current set, s/lap. Null when unmeasured. */
  slope: number | null;
  /** Stops already made. */
  pitCount: number;
  /** Current track position, used only for display ordering. */
  position: number | null;
}

export interface SafetyCarCandidate {
  driverNumber: number;
  label: string;
  position: number | null;
  tyreAge: number;
  /** Seconds per lap this driver is giving away to a fresh set right now. */
  perLapDeficit: number | null;
  /** Seconds saved by stopping now rather than under green. */
  saving: number;
  /**
   * True when a stop does not repay itself at the green-flag pit loss but does
   * at the reduced one. These are the drivers for whom the caution genuinely
   * changes the decision, rather than merely making a planned stop cheaper.
   */
  unlockedByCaution: boolean;
  /** Laps of running needed to repay the reduced stop. Null when it never does. */
  breakEvenLaps: number | null;
}

export interface SafetyCarOpportunity {
  /** False when the track is green — everything else is then empty. */
  active: boolean;
  kind: 'sc' | 'vsc' | 'red' | null;
  /** Green-flag pit loss, for comparison. */
  normalPitLoss: number;
  /** What a stop costs right now. */
  reducedPitLoss: number;
  /** Difference between the two. */
  saving: number;
  /** Drivers ranked by how much they gain from stopping now. */
  candidates: SafetyCarCandidate[];
}

export interface SafetyCarInput {
  status: TrackStatus;
  /** Green-flag pit loss for this circuit, in seconds. */
  pitLoss: number;
  currentLap: number;
  totalLaps: number;
  drivers: SafetyCarDriverInput[];
  /** Overrides for the reduction factors. */
  factors?: Partial<Record<'sc' | 'vsc' | 'red', number>>;
}

const INACTIVE: Omit<SafetyCarOpportunity, 'normalPitLoss'> = {
  active: false,
  kind: null,
  reducedPitLoss: 0,
  saving: 0,
  candidates: [],
};

function kindFor(status: TrackStatus): 'sc' | 'vsc' | 'red' | null {
  if (status === 'sc') return 'sc';
  if (status === 'vsc') return 'vsc';
  if (status === 'red') return 'red';
  return null;
}

/** Laps needed to repay a stop, or null when the deficit can never repay it. */
function breakEven(perLapDeficit: number, pitLoss: number): number | null {
  if (perLapDeficit <= 0) return null;
  if (pitLoss <= 0) return 0;
  return Math.ceil(pitLoss / perLapDeficit);
}

export function safetyCarOpportunity(input: SafetyCarInput): SafetyCarOpportunity {
  const { status, pitLoss, currentLap, totalLaps, drivers, factors } = input;
  const kind = kindFor(status);

  if (!kind) return { ...INACTIVE, normalPitLoss: pitLoss };

  const defaults = {
    sc: SAFETY_CAR_PIT_LOSS_FACTOR,
    vsc: VSC_PIT_LOSS_FACTOR,
    red: RED_FLAG_PIT_LOSS_FACTOR,
  };
  const factor = factors?.[kind] ?? defaults[kind];
  const reducedPitLoss = pitLoss * factor;
  const lapsRemaining = Math.max(0, totalLaps - currentLap);

  const candidates: SafetyCarCandidate[] = drivers.map((driver) => {
    const perLapDeficit = driver.slope == null ? null : driver.slope * driver.tyreAge;

    if (perLapDeficit == null) {
      return {
        driverNumber: driver.driverNumber,
        label: driver.label,
        position: driver.position,
        tyreAge: driver.tyreAge,
        perLapDeficit: null,
        saving: pitLoss - reducedPitLoss,
        unlockedByCaution: false,
        breakEvenLaps: null,
      };
    }

    const greenBreakEven = breakEven(perLapDeficit, pitLoss);
    const cautionBreakEven = breakEven(perLapDeficit, reducedPitLoss);

    // Worth stopping only if the remaining laps can actually repay it.
    const worthAtGreen = greenBreakEven != null && greenBreakEven <= lapsRemaining;
    const worthNow = cautionBreakEven != null && cautionBreakEven <= lapsRemaining;

    return {
      driverNumber: driver.driverNumber,
      label: driver.label,
      position: driver.position,
      tyreAge: driver.tyreAge,
      perLapDeficit,
      saving: pitLoss - reducedPitLoss,
      unlockedByCaution: worthNow && !worthAtGreen,
      breakEvenLaps: cautionBreakEven,
    };
  });

  /*
   * Ranked by who gains most. A driver for whom the caution changes the decision
   * outright comes first; after that, the older the tyres the more there is to
   * gain from a stop that is now cheap.
   */
  candidates.sort((a, b) => {
    if (a.unlockedByCaution !== b.unlockedByCaution) return a.unlockedByCaution ? -1 : 1;
    return (b.perLapDeficit ?? -1) - (a.perLapDeficit ?? -1);
  });

  return {
    active: true,
    kind,
    normalPitLoss: pitLoss,
    reducedPitLoss,
    saving: pitLoss - reducedPitLoss,
    candidates,
  };
}
