/**
 * The fitted coefficients `pnpm calibrate` stores, in the shape the cards use.
 *
 * Kept apart from every module the calibration script imports: the JSON is its
 * output, so nothing it runs may need the file to exist already.
 *
 * One file per era, and a session only ever gets its own era's: 2026 changed the
 * cars, the tyres and the overtaking aid, so a 2026 session never sees coefficients
 * fitted on 2024-2025, and a replay of 2023-2025 never sees 2026 ones.
 */
import { regulationsFor } from '@/lib/season';
import data2026 from './calibration-2026.json';
import data from './calibration.json';
import type { Calibration } from './assemble';

function toCalibration(source: typeof data | typeof data2026): Calibration {
  return {
    overtake: {
      featureNames: source.overtake.featureNames,
      means: source.overtake.means,
      stds: source.overtake.stds,
      weights: source.overtake.weights,
      bias: source.overtake.bias,
    },
    overtakePasses: source.overtake.passes,
    q3: {
      medianImprovement: source.q3Cutoff.medianImprovement,
      spread: source.q3Cutoff.spread,
      weekends: source.q3Cutoff.weekends,
    },
  };
}

/** Fitted on 2024-2025: for replays of the DRS seasons. */
export const CALIBRATION: Calibration = toCalibration(data);

/** Fitted on 2026 races only, with the Overtake Mode features. */
export const CALIBRATION_2026: Calibration = toCalibration(data2026);

export function calibrationFor(year: number | null | undefined): Calibration {
  return regulationsFor(year) === 'overtake-mode' ? CALIBRATION_2026 : CALIBRATION;
}

/** Share of fights in the 2024-2025 calibration races that ended in a pass. */
export const OVERTAKE_BASE_RATE: number = data.overtake.baseRate;
