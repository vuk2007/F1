/**
 * The fitted coefficients `pnpm calibrate` stores, in the shape the cards use.
 *
 * Kept apart from every module the calibration script imports: the JSON is its
 * output, so nothing it runs may need the file to exist already.
 */
import data from './calibration.json';
import type { Calibration } from './assemble';

export const CALIBRATION: Calibration = {
  overtake: {
    featureNames: data.overtake.featureNames,
    means: data.overtake.means,
    stds: data.overtake.stds,
    weights: data.overtake.weights,
    bias: data.overtake.bias,
  },
  q3: {
    medianImprovement: data.q3Cutoff.medianImprovement,
    spread: data.q3Cutoff.spread,
    weekends: data.q3Cutoff.weekends,
  },
};

/** Share of fights in the calibration races that ended in a pass. */
export const OVERTAKE_BASE_RATE: number = data.overtake.baseRate;
