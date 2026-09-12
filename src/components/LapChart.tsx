'use client';

/**
 * Lap times across a driver's stints, with each stint's fitted degradation line
 * drawn over it.
 *
 * Colour choices follow the project's data-viz rules and were validated against
 * the dark chart surface (#14181d) rather than eyeballed: blue for measured laps
 * and orange for the fitted line pass all six checks all-pairs, worst CVD
 * Delta E 26.8. The two roles are deliberately different hues because one is
 * data and the other is a model — they must never read as two data series.
 *
 * Excluded laps are drawn faded AND hollow, so the distinction survives without
 * colour, and every point names its exclusion reason on hover.
 */
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatLapTime } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';
import type { StintAnalysis } from '@/lib/models/stint-analysis';

/** Validated against the dark surface — see the note above before changing. */
const COLOUR = {
  measured: '#3987e5',
  fitted: '#d95926',
  excluded: '#6b7280',
  grid: '#262c35',
  axis: '#8b96a5',
} as const;

interface ChartRow {
  lapNumber: number;
  measured?: number;
  excluded?: number;
  compound: string | null;
  tyreAge: number;
  stintNumber: number;
  reason: string | null;
  /** One `fit<N>` key per stint, so lines break between stints. */
  [fitKey: string]: number | string | null | undefined;
}

function buildRows(analyses: StintAnalysis[]): ChartRow[] {
  const rows: ChartRow[] = [];

  for (const analysis of analyses) {
    const { stint, degradation } = analysis;
    const fitKey = `fit${stint.stint_number}`;
    /*
     * The fit drops outliers internally, so a lap can be "clean" in the sample
     * list yet absent from the regression. Showing it as a measured point would
     * misrepresent what the line was fitted to.
     */
    const outliers = new Set(degradation.outlierLaps);

    for (const sample of analysis.samples) {
      if (sample.lapTime == null) continue;
      const reason = sample.excluded ?? (outliers.has(sample.lapNumber) ? 'outlier' : null);

      const fitted =
        degradation.slope != null && degradation.intercept != null
          ? degradation.intercept +
            degradation.slope * sample.tyreAge -
            // Undo the fuel correction so the line sits on the measured laps.
            degradation.fuelEffectPerLap * sample.tyreAge
          : undefined;

      rows.push({
        lapNumber: sample.lapNumber,
        measured: reason === null ? sample.lapTime : undefined,
        excluded: reason === null ? undefined : sample.lapTime,
        compound: stint.compound,
        tyreAge: sample.tyreAge,
        stintNumber: stint.stint_number,
        reason,
        [fitKey]: fitted,
      });
    }
  }

  return rows.sort((a, b) => a.lapNumber - b.lapNumber);
}

/**
 * Y range is set from the clean laps only, and the axis clips rather than
 * expanding to fit. A pit-stop lap is ~20s slower than a racing lap; letting it
 * set the scale squashes the entire racing band into the bottom third and hides
 * the degradation the chart exists to show. Clipped laps stay in the tooltip.
 */
function yDomain(rows: ChartRow[]): [number, number] {
  const clean = rows.map((r) => r.measured).filter((v): v is number => v != null);
  const pool =
    clean.length > 0 ? clean : rows.map((r) => r.excluded).filter((v): v is number => v != null);
  if (pool.length === 0) return [0, 1];
  const min = Math.min(...pool);
  const max = Math.max(...pool);
  const pad = Math.max(0.4, (max - min) * 0.15);
  return [min - pad, max + pad];
}

/**
 * Typed against the shape Recharts actually injects rather than its exported
 * generics, which do not narrow cleanly when `content` is passed a component.
 */
interface TooltipInjectedProps {
  active?: boolean;
  payload?: { payload?: ChartRow }[];
}

function ChartTooltip({ active, payload }: TooltipInjectedProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const time = row.measured ?? row.excluded;
  const compound = row.compound
    ? (strings.compounds[row.compound.toUpperCase()] ?? row.compound)
    : null;

  return (
    <div className="border-border bg-surface-2 rounded-lg border p-2.5 text-xs shadow-xl">
      <div className="text-foreground font-semibold">
        {strings.driver.axisLap} {row.lapNumber}
      </div>
      <div className="tnum text-foreground mt-1">{formatLapTime(time)}</div>
      <div className="text-muted mt-1">
        {compound ? `${compound} · ` : ''}
        {strings.driver.tyreAge} {row.tyreAge}
      </div>
      {row.reason && (
        <div className="mt-1.5 text-[11px]" style={{ color: COLOUR.fitted }}>
          {strings.driver.reasons[row.reason] ?? row.reason}
        </div>
      )}
    </div>
  );
}

export function LapChart({ analyses }: { analyses: StintAnalysis[] }) {
  const rows = buildRows(analyses);
  if (rows.length === 0) {
    return <p className="text-muted p-4 text-sm">{strings.timing.noData}</p>;
  }

  const domain = yDomain(rows);
  const fitKeys = analyses
    .filter((a) => a.degradation.slope != null)
    .map((a) => `fit${a.stint.stint_number}`);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 24, left: 4 }}>
          <CartesianGrid stroke={COLOUR.grid} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="lapNumber"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fill: COLOUR.axis, fontSize: 11 }}
            stroke={COLOUR.grid}
            label={{
              value: strings.driver.axisLap,
              position: 'insideBottom',
              offset: -14,
              fill: COLOUR.axis,
              fontSize: 11,
            }}
          />
          <YAxis
            domain={domain}
            allowDataOverflow
            tick={{ fill: COLOUR.axis, fontSize: 11 }}
            stroke={COLOUR.grid}
            width={52}
            tickFormatter={(value: number) => value.toFixed(1)}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: COLOUR.axis, strokeWidth: 1 }} />
          <Legend
            verticalAlign="top"
            height={28}
            wrapperStyle={{ fontSize: 11, color: COLOUR.axis }}
          />

          {/* Excluded laps sit underneath: hollow and faded, never competing with the data. */}
          <Scatter
            name={strings.driver.excludedLap}
            dataKey="excluded"
            fill="none"
            stroke={COLOUR.excluded}
            strokeWidth={1.5}
            shape="circle"
            legendType="circle"
          />
          <Scatter
            name={strings.driver.measuredLap}
            dataKey="measured"
            fill={COLOUR.measured}
            shape="circle"
            legendType="circle"
          />

          {fitKeys.map((key, index) => (
            <Line
              key={key}
              name={index === 0 ? strings.driver.fittedLine : ''}
              dataKey={key}
              stroke={COLOUR.fitted}
              strokeWidth={2}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
              legendType={index === 0 ? 'line' : 'none'}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
