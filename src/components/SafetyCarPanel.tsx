'use client';

/**
 * Safety car opportunity: what a stop costs right now versus under green, and
 * who on the grid benefits most from taking it.
 *
 * Shown only while a caution is actually out — a permanently visible panel
 * saying "no safety car" would be noise on a screen that is already dense.
 */
import { strings } from '@/lib/i18n/strings';
import type { SafetyCarOpportunity } from '@/lib/models/safety-car';
import { InfoTip } from './InfoTip';

export function SafetyCarPanel({ opportunity }: { opportunity: SafetyCarOpportunity }) {
  if (!opportunity.active || !opportunity.kind) return null;

  const kindLabel = strings.safetyCar.kinds[opportunity.kind] ?? opportunity.kind;
  const top = opportunity.candidates.slice(0, 5);

  return (
    <div className="border-sector-yellow/40 bg-sector-yellow/5 mt-4 rounded-lg border p-3">
      <h3 className="text-sector-yellow mb-2 inline-flex items-center text-[10px] tracking-wide uppercase">
        {strings.safetyCar.heading}
        <InfoTip metric="safetyCar" />
      </h3>

      <p className="mb-3 text-xs">{strings.safetyCar.active(kindLabel)}</p>

      <div className="mb-3 flex flex-wrap gap-6">
        <span className="tnum text-xs">
          <span className="text-muted">{strings.safetyCar.normalLoss} </span>
          {opportunity.normalPitLoss.toFixed(0)}s
        </span>
        <span className="tnum text-xs">
          <span className="text-muted">{strings.safetyCar.nowCosts} </span>
          {opportunity.reducedPitLoss.toFixed(1)}s
        </span>
        <span className="tnum text-sector-green text-xs">
          <span className="text-muted">{strings.safetyCar.saving} </span>
          {opportunity.saving.toFixed(1)}s
        </span>
      </div>

      <span className="text-muted text-[10px] tracking-wide uppercase">
        {strings.safetyCar.biggestGain}
      </span>
      <ul className="mt-1">
        {top.map((candidate) => (
          <li
            key={candidate.driverNumber}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-0.5 text-xs"
          >
            <span className="w-8 font-medium">{candidate.label}</span>
            <span className="tnum text-muted">
              {candidate.tyreAge} {strings.common.laps}
            </span>
            {candidate.perLapDeficit != null && (
              <span className="tnum text-muted">
                {candidate.perLapDeficit >= 0 ? '+' : ''}
                {candidate.perLapDeficit.toFixed(2)} {strings.driver.perLap}
              </span>
            )}
            {candidate.unlockedByCaution && (
              <span className="text-sector-green text-[10px]">{strings.safetyCar.unlocked}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="text-muted mt-2 text-[10px]">{strings.safetyCar.estimate}</p>
    </div>
  );
}
