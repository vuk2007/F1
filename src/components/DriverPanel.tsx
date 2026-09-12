'use client';

import { memo } from 'react';

/**
 * Per-driver detail: lap chart with degradation fits, plus a per-stint summary.
 *
 * The summary deliberately shows the clean-lap count and fit confidence next to
 * every slope. A degradation number without them invites more trust than it has
 * earned.
 */
import { compoundColour, compoundLetter, teamColour } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';
import type { Driver } from '@/lib/openf1/types';
import type { StintAnalysis } from '@/lib/models/stint-analysis';
import type { DegradationConfidence } from '@/lib/models/tyre-degradation';
import { InfoTip } from './InfoTip';
import { LapChart } from './LapChart';

const CONFIDENCE_CLASS: Record<DegradationConfidence, string> = {
  high: 'text-sector-green',
  medium: 'text-sector-yellow',
  low: 'text-muted',
  none: 'text-muted',
};

function StintRow({ analysis }: { analysis: StintAnalysis }) {
  const { stint, degradation } = analysis;
  const compound = stint.compound?.toUpperCase() ?? null;

  return (
    <li className="border-border/50 flex flex-wrap items-center gap-x-4 gap-y-1 border-b py-2 last:border-b-0">
      <span className="flex min-w-[130px] items-center gap-2">
        <span
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-black"
          style={{ backgroundColor: compoundColour(stint.compound) }}
        >
          {compoundLetter(stint.compound)}
        </span>
        <span className="text-xs">
          {compound ? (strings.compounds[compound] ?? compound) : strings.common.noValue}
        </span>
        <span className="text-muted text-xs">
          {strings.driver.laps(stint.lap_start, stint.lap_end)}
        </span>
      </span>

      <span className="tnum text-xs">
        {/*
          Shows analysis.slope, not degradation.slope. A fit graded unusable still
          carries a raw number — one practice stint fitted -11.554 s/lap from two
          in-laps — and printing it invites exactly the misreading the confidence
          grade exists to prevent.
        */}
        {analysis.slope == null ? (
          <span className="text-muted">{strings.driver.noFit}</span>
        ) : (
          <>
            <span className="text-muted">Deg </span>
            {analysis.slope >= 0 ? '+' : ''}
            {analysis.slope.toFixed(3)} {strings.driver.perLap}
          </>
        )}
      </span>

      <span className="tnum text-muted text-xs">
        {degradation.cleanLaps}/{degradation.totalLaps} {strings.driver.clean}
      </span>

      <span className={`text-xs ${CONFIDENCE_CLASS[degradation.confidence]}`}>
        {degradation.confidence}
      </span>

      {analysis.relaxedTrafficFilter && (
        <span className="text-sector-yellow text-[11px]">{strings.driver.relaxed}</span>
      )}
      {degradation.outlierLaps.length > 0 && (
        <span className="text-muted text-[11px]">
          {strings.driver.outliersDropped(degradation.outlierLaps.length)}
        </span>
      )}
    </li>
  );
}

function DriverPanelInner({ driver, analyses }: { driver: Driver; analyses: StintAnalysis[] }) {
  return (
    <section className="border-border border-t">
      <header className="border-border flex items-center gap-2 border-b px-4 py-2.5">
        <span
          aria-hidden
          className="inline-block h-4 w-1 rounded-sm"
          style={{ backgroundColor: teamColour(driver.team_colour) }}
        />
        <h2 className="text-sm font-semibold">{driver.full_name}</h2>
        <span className="text-muted text-xs">{driver.team_name}</span>
      </header>

      <div className="px-4 py-3">
        <h3 className="text-muted mb-1 inline-flex items-center text-[10px] tracking-wide uppercase">
          {strings.driver.lapChart}
          <InfoTip metric="lapChart" />
        </h3>
        <LapChart analyses={analyses} />
      </div>

      <div className="px-4 pb-4">
        <h3 className="text-muted mb-1 inline-flex items-center text-[10px] tracking-wide uppercase">
          {strings.driver.stints}
          <InfoTip metric="degradationSlope" />
          <InfoTip metric="cleanLaps" />
          <InfoTip metric="degradationConfidence" />
        </h3>
        <ul>
          {analyses.map((analysis) => (
            <StintRow key={analysis.stint.stint_number} analysis={analysis} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/*
 * Memoised because the replay clock re-renders this whole subtree every frame,
 * while these props depend only on the dataset and the selected driver.
 * Recharts re-renders on any parent render even when its props are identical,
 * and measured on Monza that cost 60fps -> 10fps with the panels open.
 */
export const DriverPanel = memo(DriverPanelInner);
