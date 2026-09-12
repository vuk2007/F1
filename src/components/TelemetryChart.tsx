'use client';

/**
 * Stacked telemetry traces against distance, optionally overlaying a second lap.
 *
 * Distance, not time, is the x-axis: two drivers reach the same corner at
 * different moments, so a time axis would compare one car's braking point with
 * the other's apex. Every trace shares the same x scale so a vertical read at
 * any point on the lap is consistent across speed, delta, pedals and gear.
 *
 * Colours are the validated dark-surface pair (blue / orange, worst all-pairs
 * CVD delta-E 26.8). Each chart also carries a legend, so the two laps are never
 * distinguished by colour alone.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { strings } from '@/lib/i18n/strings';
import type { ComparisonRow } from '@/lib/models/telemetry';

/** Recharts hands tooltip formatters a widened value type; mirror it exactly. */
type RechartsValue = number | string | readonly (number | string)[] | undefined;

function formatValue(value: RechartsValue, unit?: string): string {
  if (typeof value !== 'number') return String(value ?? '');
  return `${value.toFixed(unit === 's' ? 3 : 0)}${unit ?? ''}`;
}

const COLOUR = {
  a: '#3987e5',
  b: '#d95926',
  grid: '#262c35',
  axis: '#8b96a5',
  zero: '#4b5563',
} as const;

interface TraceProps {
  rows: ComparisonRow[];
  keyA: keyof ComparisonRow;
  keyB?: keyof ComparisonRow;
  labelA: string;
  labelB?: string;
  height: number;
  domain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax'];
  unit?: string;
  /** Draw as a step line — correct for gear, wrong for speed. */
  step?: boolean;
  showZero?: boolean;
  tickFormatter?: (value: number) => string;
}

function Trace({
  rows,
  keyA,
  keyB,
  labelA,
  labelB,
  height,
  domain = ['auto', 'auto'],
  unit,
  step,
  showZero,
  tickFormatter,
}: TraceProps) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 10, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={COLOUR.grid} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="distance"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fill: COLOUR.axis, fontSize: 10 }}
            stroke={COLOUR.grid}
            tickFormatter={(value: number) => `${Math.round(value)}`}
          />
          <YAxis
            domain={domain}
            tick={{ fill: COLOUR.axis, fontSize: 10 }}
            stroke={COLOUR.grid}
            width={46}
            tickFormatter={tickFormatter ?? ((value: number) => String(Math.round(value)))}
          />
          {showZero && <ReferenceLine y={0} stroke={COLOUR.zero} strokeDasharray="3 3" />}
          <Tooltip
            contentStyle={{
              background: '#1b2027',
              border: '1px solid #262c35',
              borderRadius: 8,
              fontSize: 11,
            }}
            labelFormatter={(label: unknown) =>
              typeof label === 'number'
                ? `${strings.telemetry.distance} ${Math.round(label)} m`
                : String(label ?? '')
            }
            formatter={(value: RechartsValue, name: number | string | undefined) => [
              formatValue(value, unit),
              String(name ?? ''),
            ]}
          />
          <Line
            name={labelA}
            dataKey={keyA}
            stroke={COLOUR.a}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
            type={step ? 'stepAfter' : 'monotone'}
          />
          {keyB && labelB && (
            <Line
              name={labelB}
              dataKey={keyB}
              stroke={COLOUR.b}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
              type={step ? 'stepAfter' : 'monotone'}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TraceLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="mt-2 flex items-baseline gap-2">
      <span className="text-muted text-[10px] tracking-wide uppercase">{text}</span>
      {hint && <span className="text-muted text-[10px]">{hint}</span>}
    </div>
  );
}

export function TelemetryChart({
  rows,
  labelA,
  labelB,
}: {
  rows: ComparisonRow[];
  labelA: string;
  labelB: string | null;
}) {
  if (rows.length === 0) {
    return <p className="text-muted py-4 text-sm">{strings.telemetry.noData}</p>;
  }

  const comparing = labelB != null;

  return (
    <div>
      {/* Legend once for the whole stack: every trace uses the same two colours. */}
      <div className="mb-1 flex items-center gap-4 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: COLOUR.a }} />
          <span className="text-muted">{labelA}</span>
        </span>
        {comparing && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: COLOUR.b }} />
            <span className="text-muted">{labelB}</span>
          </span>
        )}
      </div>

      <TraceLabel text={strings.telemetry.speed} hint="km/h" />
      <Trace
        rows={rows}
        keyA="speedA"
        keyB={comparing ? 'speedB' : undefined}
        labelA={labelA}
        labelB={labelB ?? undefined}
        height={150}
        unit=" km/h"
      />

      {comparing && (
        <>
          <TraceLabel text={strings.telemetry.delta} hint={strings.telemetry.deltaHint} />
          <Trace
            rows={rows}
            keyA="delta"
            labelA={strings.telemetry.delta}
            height={90}
            unit="s"
            showZero
            tickFormatter={(value: number) => value.toFixed(2)}
          />
        </>
      )}

      <TraceLabel text={strings.telemetry.throttle} hint="%" />
      <Trace
        rows={rows}
        keyA="throttleA"
        keyB={comparing ? 'throttleB' : undefined}
        labelA={labelA}
        labelB={labelB ?? undefined}
        height={80}
        domain={[0, 100]}
        unit="%"
      />

      <TraceLabel text={strings.telemetry.brake} hint={strings.telemetry.brakeHint} />
      <Trace
        rows={rows}
        keyA="brakeA"
        keyB={comparing ? 'brakeB' : undefined}
        labelA={labelA}
        labelB={labelB ?? undefined}
        height={70}
        domain={[0, 100]}
        step
      />

      <TraceLabel text={strings.telemetry.gear} />
      <Trace
        rows={rows}
        keyA="gearA"
        keyB={comparing ? 'gearB' : undefined}
        labelA={labelA}
        labelB={labelB ?? undefined}
        height={90}
        domain={[0, 8]}
        step
      />

      <p className="text-muted mt-2 text-[10px]">{strings.telemetry.distanceNote}</p>
    </div>
  );
}
