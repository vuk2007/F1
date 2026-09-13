/**
 * Plain-language captions for the charts, generated from the numbers each chart
 * plots, so a caption can never describe something the chart does not show.
 */
import { formatLapTime } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';

/** Below this many clean laps no trend is read, matching the fit's own threshold. */
export const MIN_CAPTION_LAPS = 4;

/** Changes smaller than this per lap are "steady". */
const FLAT_PER_LAP = 0.02;

/** Pace differences under this per lap read as a tie. */
const TIED_PER_LAP = 0.05;

const c = strings.simple.captions;

/** The fields the lap chart caption reads from a stint analysis. */
export interface CaptionStint {
  stint: { compound: string | null; stint_number: number };
  slope: number | null;
  degradation: { fuelEffectPerLap: number; cleanLaps: number };
}

function plural(compound: string | null): string {
  if (!compound) return 'tyres';
  return strings.simple.compoundPlural[compound.toUpperCase()] ?? 'tyres';
}

/**
 * Describes the most recent stint on the lap chart.
 *
 * The chart shows measured lap times, but the degradation figure has the fuel
 * effect removed. In a race those disagree: the car gets lighter faster than the
 * tyres wear, so the points drift down while the tyres are genuinely wearing.
 * Captioning "lap times going up" under a line that visibly goes down would teach
 * a newcomer to distrust the chart, so that case gets its own sentence.
 */
export function lapChartCaption(analyses: CaptionStint[]): string {
  const latest = [...analyses].sort((a, b) => b.stint.stint_number - a.stint.stint_number)[0];
  if (!latest || latest.slope == null || latest.degradation.cleanLaps < MIN_CAPTION_LAPS) {
    return c.notEnough;
  }

  const slope = latest.slope;
  const visible = slope - latest.degradation.fuelEffectPerLap;
  const compound = plural(latest.stint.compound);

  if (slope > FLAT_PER_LAP && visible > FLAT_PER_LAP) return c.rising(visible.toFixed(2), compound);
  if (slope > FLAT_PER_LAP) return c.hiddenByFuel(slope.toFixed(2), compound);
  if (slope >= -FLAT_PER_LAP) return c.steady(compound);
  return c.falling((-visible).toFixed(2), compound);
}

export interface CaptionPaceSummary {
  driverNumber: number;
  medianLap: number | null;
}

/** Compares the two quickest typical laps on the pace chart. */
export function paceCaption(
  summaries: CaptionPaceSummary[],
  labelFor: (driverNumber: number) => string,
): string | null {
  const timed = summaries
    .filter((s): s is CaptionPaceSummary & { medianLap: number } => s.medianLap != null)
    .sort((a, b) => a.medianLap - b.medianLap);

  const [fastest, next] = timed;
  if (!fastest) return null;
  if (!next) return c.paceSingle(labelFor(fastest.driverNumber), formatLapTime(fastest.medianLap));

  const perLap = next.medianLap - fastest.medianLap;
  if (perLap < TIED_PER_LAP) {
    return c.paceTied(labelFor(fastest.driverNumber), labelFor(next.driverNumber));
  }
  return c.paceLeader(
    labelFor(fastest.driverNumber),
    labelFor(next.driverNumber),
    perLap.toFixed(2),
  );
}

export interface TelemetryCaptionInput {
  labelA: string;
  /** The comparison driver, when one is shown. */
  labelB: string | null;
  /** Delta series: seconds A is behind B. Negative means A is quicker. */
  deltas: (number | null)[];
  topSpeed: number | null;
  /** Share of the lap at full throttle, 0-1. */
  fullThrottle: number | null;
}

/** Below this the two laps are called level. */
const LEVEL_S = 0.01;

export function telemetryCaption(input: TelemetryCaptionInput): string | null {
  const { labelA, labelB, deltas, topSpeed, fullThrottle } = input;

  if (labelB) {
    const final = [...deltas].reverse().find((value): value is number => value != null);
    if (final != null) {
      if (Math.abs(final) < LEVEL_S) return c.telemetryEven(labelA, labelB);
      return final < 0
        ? c.telemetryCompare(labelA, labelB, Math.abs(final).toFixed(2))
        : c.telemetryCompare(labelB, labelA, final.toFixed(2));
    }
  }

  if (topSpeed != null && fullThrottle != null) {
    return c.telemetrySingle(labelA, Math.round(topSpeed), Math.round(fullThrottle * 100));
  }
  return null;
}
