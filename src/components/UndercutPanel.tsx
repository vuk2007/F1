'use client';

/**
 * Undercut projections against the cars immediately ahead and behind.
 *
 * Two scenarios, both the ones a pit wall actually asks about:
 *   - you stop now and the car ahead responds a lap later — do you clear them?
 *   - the car behind stops now and you respond a lap later — do you keep them?
 */
import { strings } from '@/lib/i18n/strings';
import type { UndercutResult } from '@/lib/models/undercut';
import { InfoTip } from './InfoTip';

export interface UndercutScenario {
  /** The rival involved, as a three-letter code. */
  rival: string;
  /** Gap between the two cars now, in seconds. */
  gap: number;
  result: UndercutResult;
  /** True when the selected driver ends up ahead. */
  youAhead: boolean;
}

function Scenario({ title, scenario }: { title: string; scenario: UndercutScenario | null }) {
  if (!scenario) {
    return (
      <div className="flex-1">
        <span className="text-muted text-[10px] tracking-wide uppercase">{title}</span>
        <p className="text-muted mt-1 text-xs">{strings.undercut.none}</p>
      </div>
    );
  }

  const { result, youAhead, rival, gap } = scenario;

  return (
    <div className="flex-1">
      <span className="text-muted text-[10px] tracking-wide uppercase">{title}</span>
      <p className="mt-1 text-xs">
        <span className="text-muted">{rival} </span>
        <span className="tnum text-muted">
          {gap >= 0 ? '+' : ''}
          {gap.toFixed(3)}s
        </span>
      </p>
      <p className={`mt-1 text-xs ${youAhead ? 'text-sector-green' : 'text-sector-yellow'}`}>
        {strings.undercut.exitsAhead(result.aheadAtEnd)}{' '}
        <span className="tnum">
          {strings.undercut.by} {result.marginSeconds.toFixed(2)}s
        </span>
      </p>
      {result.crossoverLap != null && (
        <p className="text-muted mt-0.5 text-[10px]">
          {strings.undercut.crossover(result.crossoverLap)}
        </p>
      )}
    </div>
  );
}

export function UndercutPanel({
  ahead,
  behind,
}: {
  ahead: UndercutScenario | null;
  behind: UndercutScenario | null;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-muted mb-2 inline-flex items-center text-[10px] tracking-wide uppercase">
        {strings.undercut.heading}
        <InfoTip metric="undercut" />
      </h3>
      <p className="text-muted mb-2 text-[11px]">{strings.undercut.ifTheyPitNow}</p>
      <div className="flex flex-wrap gap-6">
        <Scenario title={strings.undercut.ahead} scenario={ahead} />
        <Scenario title={strings.undercut.behind} scenario={behind} />
      </div>
    </div>
  );
}
