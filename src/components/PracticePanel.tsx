'use client';

/**
 * Practice and qualifying analysis, replacing the race strategy panel.
 *
 * A practice session has no pit window to compute — nobody is racing anyone.
 * The questions are different: what is the car's one-lap potential, and what do
 * the tyres do over a stint? So this panel shows the theoretical best lap and
 * the runs split into qualifying simulations and race simulations.
 */
import { compoundColour, compoundLetter, formatLapTime, formatSector } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';
import type { TheoreticalBest } from '@/lib/models/best-lap';
import type { Run } from '@/lib/models/runs';
import type { Driver } from '@/lib/openf1/types';
import { InfoTip } from './InfoTip';

const KIND_CLASS: Record<string, string> = {
  short: 'bg-sector-purple/20 text-sector-purple',
  long: 'bg-accent/20 text-accent',
  installation: 'bg-surface-2 text-muted',
};

const dash = strings.common.noValue;

function BestLapBlock({ best }: { best: TheoreticalBest }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-muted inline-flex items-center text-[10px] tracking-wide uppercase">
          {strings.practice.theoretical}
          <InfoTip metric="theoreticalBest" />
        </span>
        <span className="tnum text-sector-purple text-sm">{formatLapTime(best.theoretical)}</span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-muted text-[10px] tracking-wide uppercase">
          {strings.practice.actualBest}
        </span>
        <span className="tnum text-sm">{formatLapTime(best.actualBest?.seconds)}</span>
        {best.actualBest && (
          <span className="text-muted text-[10px]">
            {strings.practice.fromLap(best.actualBest.lapNumber)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-muted text-[10px] tracking-wide uppercase">
          {strings.practice.timeLeft}
        </span>
        <span className="tnum text-sm">
          {best.timeLeftOnTable == null ? dash : `+${best.timeLeftOnTable.toFixed(3)}`}
        </span>
        {best.isPerfectLap && (
          <span className="text-sector-green text-[10px]">{strings.practice.perfectLap}</span>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-muted text-[10px] tracking-wide uppercase">
          {strings.practice.sectors}
        </span>
        <span className="tnum text-sm">
          {[best.sector1, best.sector2, best.sector3]
            .map((sector) => formatSector(sector?.seconds))
            .join('  ')}
        </span>
      </div>
    </div>
  );
}

function RunRow({ run }: { run: Run }) {
  const compound = run.compound?.toUpperCase() ?? null;

  return (
    <li className="border-border/50 flex flex-wrap items-center gap-x-4 gap-y-1 border-b py-2 last:border-b-0">
      <span
        className={`w-[104px] rounded px-1.5 py-0.5 text-center text-[10px] ${KIND_CLASS[run.kind]}`}
      >
        {strings.practice.runKinds[run.kind]}
      </span>

      <span className="flex min-w-[120px] items-center gap-2">
        <span
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-black"
          style={{ backgroundColor: compoundColour(run.compound) }}
        >
          {compoundLetter(run.compound)}
        </span>
        <span className="text-xs">
          {compound ? (strings.compounds[compound] ?? compound) : dash}
        </span>
        <span className="text-muted text-xs">{strings.driver.laps(run.lapStart, run.lapEnd)}</span>
      </span>

      <span className="tnum text-muted text-xs">
        {run.representativeLaps} {strings.practice.laps}
      </span>

      <span className="tnum text-xs">
        <span className="text-muted">{strings.practice.best} </span>
        {formatLapTime(run.bestLap)}
      </span>

      <span className="tnum text-xs">
        <span className="text-muted">{strings.practice.average} </span>
        {formatLapTime(run.averageLap)}
      </span>

      <span className="tnum text-muted text-xs">
        {strings.practice.spread} {run.consistency == null ? dash : run.consistency.toFixed(3)}
      </span>

      {run.slope != null && (
        <span className="tnum text-xs">
          <span className="text-muted">Deg </span>
          {run.slope >= 0 ? '+' : ''}
          {run.slope.toFixed(3)} {strings.driver.perLap}
        </span>
      )}
    </li>
  );
}

export function PracticePanel({
  driver,
  best,
  runs,
  leaderboard,
}: {
  driver: Driver;
  best: TheoreticalBest;
  runs: Run[];
  leaderboard: { driver: Driver; best: TheoreticalBest }[];
}) {
  return (
    <section className="border-border border-t px-4 py-3">
      <h2 className="text-muted mb-3 inline-flex items-center text-[10px] tracking-wide uppercase">
        {strings.practice.heading}
        <InfoTip metric="theoreticalBest" />
      </h2>

      <BestLapBlock best={best} />

      <div className="mt-4">
        <h3 className="text-muted mb-1 inline-flex items-center text-[10px] tracking-wide uppercase">
          {strings.practice.runs}
          <InfoTip metric="runKind" />
          <InfoTip metric="runConsistency" />
          <InfoTip metric="longRunPace" />
        </h3>
        {runs.length === 0 ? (
          <p className="text-muted text-xs">{strings.practice.noRuns}</p>
        ) : (
          <ul>
            {runs.map((run) => (
              <RunRow key={run.stintNumber} run={run} />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        <h3 className="text-muted mb-1 text-[10px] tracking-wide uppercase">
          {strings.practice.leaderboard}
        </h3>
        <ol className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {leaderboard.map((entry, index) => (
            <li
              key={entry.driver.driver_number}
              className={`flex items-baseline gap-2 text-xs ${
                entry.driver.driver_number === driver.driver_number ? 'text-foreground' : ''
              }`}
            >
              <span className="tnum text-muted w-4 text-right">{index + 1}</span>
              <span className="w-9 font-medium">{entry.driver.name_acronym}</span>
              <span className="tnum">{formatLapTime(entry.best.theoretical)}</span>
              <span className="tnum text-muted text-[10px]">
                {entry.best.timeLeftOnTable == null
                  ? ''
                  : `+${entry.best.timeLeftOnTable.toFixed(3)}`}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
