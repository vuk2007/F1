/**
 * Logistic regression, fitted by Newton's method.
 *
 * Used for the overtake chance. With a handful of features Newton's method
 * converges in a few iterations and needs no learning rate to tune, which gradient
 * descent would. Features are standardised before fitting so the small ridge
 * penalty treats them evenly, and the model keeps the means and spreads it used,
 * so predictions take raw feature values.
 */

export interface LogisticModel {
  featureNames: string[];
  means: number[];
  stds: number[];
  /** Weights on the standardised features. */
  weights: number[];
  bias: number;
}

export interface LogisticFit extends LogisticModel {
  /** Mean log loss on the training data. */
  logLoss: number;
  iterations: number;
}

export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

export function predictProbability(model: LogisticModel, features: number[]): number {
  let z = model.bias;
  for (let i = 0; i < model.weights.length; i += 1) {
    const std = model.stds[i]! || 1;
    z += model.weights[i]! * ((features[i]! - model.means[i]!) / std);
  }
  return sigmoid(z);
}

/** Mean log loss, with probabilities clamped so a certain miss costs a finite amount. */
export function logLoss(probabilities: number[], labels: number[]): number {
  let total = 0;
  for (let i = 0; i < labels.length; i += 1) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, probabilities[i]!));
    total -= labels[i]! * Math.log(p) + (1 - labels[i]!) * Math.log(1 - p);
  }
  return labels.length === 0 ? 0 : total / labels.length;
}

function solve(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row]![col]! / a[col]![col]!;
      for (let k = col; k <= n; k += 1) a[row]![k]! -= factor * a[col]![k]!;
    }
  }
  return a.map((row, i) => row[n]! / row[i]!);
}

export interface FitOptions {
  /** Ridge penalty on the weights (not the bias). */
  l2?: number;
  maxIterations?: number;
}

export function fitLogistic(
  rows: number[][],
  labels: number[],
  featureNames: string[],
  options: FitOptions = {},
): LogisticFit {
  const l2 = options.l2 ?? 0.01;
  const maxIterations = options.maxIterations ?? 50;
  const n = rows.length;
  const d = featureNames.length;
  if (n === 0) throw new Error('fitLogistic needs at least one sample');

  const means = Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + r[j]!, 0) / n);
  const stds = Array.from({ length: d }, (_, j) => {
    const variance = rows.reduce((s, r) => s + (r[j]! - means[j]!) ** 2, 0) / n;
    return Math.sqrt(variance) || 1;
  });
  const x = rows.map((r) => [1, ...r.map((v, j) => (v - means[j]!) / stds[j]!)]);

  let beta = new Array<number>(d + 1).fill(0);
  let iterations = 0;
  for (; iterations < maxIterations; iterations += 1) {
    const gradient = new Array<number>(d + 1).fill(0);
    const hessian = Array.from({ length: d + 1 }, () => new Array<number>(d + 1).fill(0));
    for (let i = 0; i < n; i += 1) {
      const z = x[i]!.reduce((s, v, j) => s + v * beta[j]!, 0);
      const p = sigmoid(z);
      const w = p * (1 - p);
      for (let j = 0; j <= d; j += 1) {
        gradient[j]! += (p - labels[i]!) * x[i]![j]!;
        for (let k = 0; k <= d; k += 1) hessian[j]![k]! += w * x[i]![j]! * x[i]![k]!;
      }
    }
    for (let j = 1; j <= d; j += 1) {
      gradient[j]! += l2 * beta[j]!;
      hessian[j]![j]! += l2;
    }
    const step = solve(hessian, gradient);
    if (!step) break;
    beta = beta.map((b, j) => b - step[j]!);
    if (Math.max(...step.map(Math.abs)) < 1e-8) {
      iterations += 1;
      break;
    }
  }

  const model: LogisticModel = {
    featureNames,
    means,
    stds,
    weights: beta.slice(1),
    bias: beta[0]!,
  };
  return {
    ...model,
    logLoss: logLoss(
      rows.map((r) => predictProbability(model, r)),
      labels,
    ),
    iterations,
  };
}
