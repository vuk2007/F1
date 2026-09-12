'use client';

import { memo } from 'react';

/**
 * Several drivers' clean lap times on one chart.
 *
 * Colour comes from the validated categorical palette rather than from team
 * colours, which is a deliberate break with F1 convention: two team-mates share
 * a team colour, and team-mates are the single most common comparison anyone
 * wants to make. Identity is also carried by the legend and by the summary rows
 * underneath, so it never rests on colour alone.
 *
 * Five series is the cap. The palette's guarantees hold well past that, but the
 * chart stops being readable — beyond a handful of lines it is spaghetti.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatLapTime, teamColour } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';
import { paceDomain, type PaceComparison as Comparison } from '@/lib/models/pace';
import type { Driver } from '@/lib/openf1/types';
import { InfoTip } from './InfoTip';

/**
 * Categorical slots 1-5, validated against the dark surface on the adjacent
 * pairlist that line charts use: worst CVD delta-E 8.4, normal-vision 19.3.
 */
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'] as const;

export const MAX_PACE_DRIVERS = SERIES.length;

const GRID = '#262c35';
const AXIS = '#8b96a5';

function PaceComparisonInner({
  comparison,
  drivers,
  allDrivers,
  selected,
  onToggle,
}: {
  comparison: Comparison;
  /** Drivers in the comparison, in series order. */
  drivers: Driver[];
  /** Everyone available to add. */
  allDrivers: Driver[];
  selected: number[];
  /**
   * Reports only which driver was clicked. The parent applies it as a functional
   * state update, so two clicks landing in the same React batch both take
   * effect — computing the next list from the `selected` prop here looked
   * simpler but silently dropped one of them.
   */
  onToggle: (driverNumber: number) => void;
}) {
  const keys = comparison.summaries.map((summary) => summary.key);
  const domain = paceDomain(comparison.rows, keys);
  const labelFor = (driverNumber: number) =>
    drivers.find((d) => d.driver_number === driverNumber)?.name_acronym ?? String(driverNumber);

  return (
    <section className="border-border border-t px-4 py-3">
      <h2 className="text-muted mb-2 inline-flex items-center text-[10px] tracking-wide uppercase">
        {strings.pace.heading}
        <InfoTip metric="paceComparison" />
      </h2>

      {/* Toggle chips. The team colour still appears here, where it is an
          identifier rather than the encoding the chart depends on. */}
      <div className="mb-3 flex flex-wrap gap-1">
        {allDrivers.map((driver) => {
          const on = selected.includes(driver.driver_number);
          const full = !on && selected.length >= MAX_PACE_DRIVERS;
          return (
            <button
              key={driver.driver_number}
              type="button"
              disabled={full}
              onClick={() => onToggle(driver.driver_number)}
              title={full ? strings.pace.full(MAX_PACE_DRIVERS) : driver.full_name}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition ${
                on
                  ? 'bg-surface-2 text-foreground'
                  : full
                    ? 'text-muted/40 cursor-not-allowed'
                    : 'text-muted hover:bg-surface-2'
              }`}
            >
              <span
                aria-hidden
                className="inline-block h-2.5 w-1 rounded-sm"
                style={{ backgroundColor: teamColour(driver.team_colour) }}
              />
              {driver.name_acronym}
            </button>
          );
        })}
      </div>

      {comparison.rows.length === 0 ? (
        <p className="text-muted text-xs">{strings.pace.empty}</p>
      ) : (
        <>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparison.rows} margin={{ top: 4, right: 12, bottom: 20, left: 4 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="lapNumber"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  stroke={GRID}
                  label={{
                    value: strings.driver.axisLap,
                    position: 'insideBottom',
                    offset: -12,
                    fill: AXIS,
                    fontSize: 11,
                  }}
                />
                <YAxis
                  domain={domain}
                  allowDataOverflow
                  tick={{ fill: AXIS, fontSize: 11 }}
                  stroke={GRID}
                  width={56}
                  tickFormatter={(value: number) => formatLapTime(value)}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1b2027',
                    border: '1px solid #262c35',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  labelFormatter={(label: unknown) =>
                    `${strings.driver.axisLap} ${typeof label === 'number' ? label : ''}`
                  }
                  formatter={(value: unknown, name: unknown) => [
                    typeof value === 'number' ? formatLapTime(value) : String(value ?? ''),
                    String(name ?? ''),
                  ]}
                />
                {comparison.summaries.map((summary, index) => (
                  <Line
                    key={summary.key}
                    name={labelFor(summary.driverNumber)}
                    dataKey={summary.key}
                    stroke={SERIES[index % SERIES.length]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    // Gaps are pit and safety car laps; bridging them would draw
                    // a line through laps that were deliberately excluded.
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/*
            This list is the legend: swatch, driver, median, delta and lap count
            in one place. Recharts' own <Legend> was dropped rather than shown
            alongside it — two legends for the same series is redundant, and its
            entries were colliding with each other at this width.
          */}
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {comparison.summaries.map((summary, index) => (
              <li key={summary.key} className="flex items-baseline gap-2 text-xs">
                <span
                  aria-hidden
                  className="inline-block h-0.5 w-4"
                  style={{ background: SERIES[index % SERIES.length] }}
                />
                <span className="w-9 font-medium">{labelFor(summary.driverNumber)}</span>
                <span className="tnum">{formatLapTime(summary.medianLap)}</span>
                <span className="tnum text-muted">
                  {summary.deltaToBest == null
                    ? strings.common.noValue
                    : summary.deltaToBest === 0
                      ? strings.pace.fastest
                      : `+${summary.deltaToBest.toFixed(3)}`}
                </span>
                <span className="text-muted text-[10px]">
                  {summary.cleanLaps} {strings.driver.clean}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-muted mt-2 text-[10px]">{strings.pace.note}</p>
        </>
      )}
    </section>
  );
}

/* See DriverPanel: the comparison depends on the selection, never on the clock. */
export const PaceComparison = memo(PaceComparisonInner);
