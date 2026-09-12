'use client';

/**
 * Pit window for the selected driver at the current replay moment.
 *
 * Every figure is paired with the reasoning behind the verdict, because the
 * verdict alone ("Pit now") is exactly the kind of output that gets trusted
 * without being understood.
 */
import { strings } from '@/lib/i18n/strings';
import type { PitLossEstimate } from '@/lib/models/pit-loss';
import type { PitVerdict, PitWindowResult } from '@/lib/models/pit-window';
import { InfoTip } from './InfoTip';
import type { MetricKey } from '@/lib/explain/metrics';

const VERDICT_CLASS: Record<PitVerdict, string> = {
  'pit-now': 'bg-danger/20 text-danger',
  'window-open': 'bg-sector-green/20 text-sector-green',
  'window-approaching': 'bg-surface-2 text-muted',
  'too-late': 'bg-sector-yellow/20 text-sector-yellow',
  'stay-out': 'bg-surface-2 text-muted',
  unknown: 'bg-surface-2 text-muted',
};

function Figure({
  label,
  value,
  metric,
  hint,
}: {
  label: string;
  value: string;
  metric: MetricKey;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted inline-flex items-center text-[10px] tracking-wide uppercase">
        {label}
        <InfoTip metric={metric} />
      </span>
      <span className="tnum text-sm">{value}</span>
      {hint && <span className="text-muted text-[10px]">{hint}</span>}
    </div>
  );
}

const dash = strings.common.noValue;

export function StrategyPanel({
  window: result,
  pitLoss,
}: {
  window: PitWindowResult;
  pitLoss: PitLossEstimate;
}) {
  return (
    <section className="border-border border-t px-4 py-3">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-muted inline-flex items-center text-[10px] tracking-wide uppercase">
          {strings.strategy.pitWindow}
          <InfoTip metric="pitWindowRange" />
        </h2>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[result.verdict]}`}
        >
          {strings.strategy.verdicts[result.verdict]}
        </span>
      </div>

      <p className="text-muted mb-3 text-xs leading-relaxed">
        {strings.strategy.verdictWhy[result.verdict]}
      </p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Figure
          label={strings.strategy.pitWindow}
          value={
            result.window
              ? strings.strategy.windowLaps(result.window.earliest, result.window.latest)
              : strings.strategy.noWindow
          }
          metric="pitWindowRange"
        />
        <Figure
          label={strings.strategy.deficit}
          value={
            result.perLapDeficit == null
              ? dash
              : `${result.perLapDeficit >= 0 ? '+' : ''}${result.perLapDeficit.toFixed(2)} ${strings.driver.perLap}`
          }
          metric="perLapDeficit"
        />
        <Figure
          label={strings.strategy.breakEven}
          value={
            result.breakEvenLaps == null
              ? dash
              : `${Math.ceil(result.breakEvenLaps)} ${strings.common.laps}`
          }
          metric="breakEvenLaps"
          hint={`${result.lapsRemaining} ${strings.strategy.lapsRemaining.toLowerCase()}`}
        />
        <Figure
          label={strings.strategy.pitLoss}
          value={`${pitLoss.seconds.toFixed(0)}s`}
          metric="pitLoss"
          hint={
            pitLoss.observedLaneDuration == null
              ? undefined
              : `${pitLoss.observedLaneDuration.toFixed(1)}s ${strings.strategy.measuredLane}`
          }
        />
      </div>
    </section>
  );
}
