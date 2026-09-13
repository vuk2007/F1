'use client';

/** Card 1: how each tyre type is behaving, with its estimated lap-time curve. */
import { memo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { strings } from '@/lib/i18n/strings';
import { weakest } from '@/lib/models/predict/confidence';
import type { CompoundPerformance, TyrePerformance } from '@/lib/models/predict/tyre-performance';
import { ConfidenceChip, NotEnough, PredictionCard } from './PredictionCard';
import { compoundName, TyreBadge } from './TyreBadge';

/*
 * Line colours are not the tyre colours. Red, yellow and white on this dark surface
 * fail the palette checks — yellow and white are far too light, white has no hue,
 * and red against any amber dark enough to pass cannot be told apart with
 * deuteranopia. These three pass every check, all pairs, dark mode, surface
 * #14181d (validate_palette.js). Soft keeps the warm hue, hard the cool one. Every
 * line is named in the legend and labelled with its tyre letter where it ends, so
 * the colour never has to be decoded on its own.
 */
const CURVE_COLOUR: Record<string, string> = {
  SOFT: '#d95926',
  MEDIUM: '#199e70',
  HARD: '#3987e5',
};
const GRID = '#262c35';
const AXIS = '#8b96a5';

type Row = { age: number } & Record<string, number>;

function buildRows(compounds: CompoundPerformance[]): Row[] {
  const ages = [...new Set(compounds.flatMap((c) => c.curve.map((p) => p.age)))].sort(
    (a, b) => a - b,
  );
  return ages.map((age) => {
    const row: Row = { age };
    for (const compound of compounds) {
      const point = compound.curve.find((p) => p.age === age);
      if (point) row[compound.compound] = point.delta;
    }
    return row;
  });
}

function EndLabel({
  x,
  y,
  index,
  lastIndex,
  text,
}: {
  x?: number;
  y?: number;
  index?: number;
  lastIndex: number;
  text: string;
}) {
  if (index !== lastIndex || x == null || y == null) return null;
  return (
    <text x={x + 6} y={y} dy={4} fill={AXIS} fontSize={11} fontWeight={600}>
      {text}
    </text>
  );
}

interface TooltipInjectedProps {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number; color?: string }[];
  label?: number;
}

function CurveTooltip({ active, payload, label }: TooltipInjectedProps) {
  if (!active || !payload?.length || label == null) return null;
  const text = strings.simple.predictions.tyres;
  return (
    <div className="border-border bg-surface-2 rounded-lg border p-2.5 text-xs shadow-xl">
      <div className="text-foreground font-semibold">{text.tooltipAge(label)}</div>
      {payload.map((entry) =>
        entry.value == null ? null : (
          <div key={String(entry.dataKey)} className="mt-1 flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted">{compoundName(String(entry.dataKey))}</span>
            <span className="tnum text-foreground ml-auto">
              {entry.value >= 0
                ? text.slowerBy(entry.value.toFixed(2))
                : text.fasterBy(Math.abs(entry.value).toFixed(2))}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

function CurveChartInner({ compounds }: { compounds: CompoundPerformance[] }) {
  const charted = compounds.filter(
    (c) => c.enough && c.curve.length > 1 && CURVE_COLOUR[c.compound.toUpperCase()],
  );
  if (charted.length === 0) return null;
  const rows = buildRows(charted);
  const text = strings.simple.predictions.tyres;

  return (
    <figure className="mt-3">
      <figcaption className="text-muted mb-1 text-[11px]">{text.chartTitle}</figcaption>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 24, bottom: 18, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="age"
              type="number"
              domain={['dataMin', 'dataMax']}
              allowDecimals={false}
              tick={{ fill: AXIS, fontSize: 11 }}
              stroke={GRID}
              label={{
                value: text.axisAge,
                position: 'insideBottom',
                offset: -10,
                fill: AXIS,
                fontSize: 11,
              }}
            />
            <YAxis
              tick={{ fill: AXIS, fontSize: 11 }}
              stroke={GRID}
              width={44}
              tickFormatter={(value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`}
            />
            <Tooltip content={<CurveTooltip />} cursor={{ stroke: AXIS, strokeWidth: 1 }} />
            <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11, color: AXIS }} />
            {charted.map((compound) => {
              const lastAge = compound.curve[compound.curve.length - 1]!.age;
              return (
                <Line
                  key={compound.compound}
                  name={compoundName(compound.compound)}
                  dataKey={compound.compound}
                  stroke={CURVE_COLOUR[compound.compound.toUpperCase()]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                  label={
                    <EndLabel
                      lastIndex={rows.findIndex((row) => row.age === lastAge)}
                      text={compound.compound.charAt(0).toUpperCase()}
                    />
                  }
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/* The card re-renders with the clock; the chart only when the estimates change. */
const CurveChart = memo(CurveChartInner);

export function TyrePerformanceCard({ tyres }: { tyres: TyrePerformance }) {
  const text = strings.simple.predictions.tyres;
  const measured = tyres.compounds.filter((c) => c.enough);
  const confidence = measured.length > 0 ? weakest(...measured.map((c) => c.confidence)) : null;

  return (
    <PredictionCard
      title={text.title}
      method="tyrePerformance"
      confidence={confidence}
      enough={measured.length > 0}
      className="md:col-span-2"
    >
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tyres.compounds.map((c) => (
          <li key={c.compound} className="flex items-start gap-2 text-xs">
            <TyreBadge compound={c.compound} size="md" />
            <div className="min-w-0">
              <div className="text-foreground font-medium">{compoundName(c.compound)}</div>
              {c.enough ? (
                <>
                  <div className="text-muted">
                    {c.paceDelta == null
                      ? text.paceUnknown
                      : c.paceDelta <= 0.005
                        ? text.fastest
                        : text.slower(c.paceDelta.toFixed(2))}
                  </div>
                  <div className="text-muted">
                    {c.degPerLap != null && c.degPerLap > 0.005
                      ? text.wear(c.degPerLap.toFixed(2))
                      : text.noWear}
                  </div>
                  {c.cliff.detected && (
                    <div className="text-sector-yellow mt-0.5">
                      <span aria-hidden>⚠ </span>
                      {text.cliff}
                    </div>
                  )}
                  <div className="mt-1">
                    <ConfidenceChip level={c.confidence} />
                  </div>
                </>
              ) : (
                <NotEnough />
              )}
            </div>
          </li>
        ))}
      </ul>
      <CurveChart compounds={tyres.compounds} />
    </PredictionCard>
  );
}
