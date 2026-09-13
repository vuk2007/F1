'use client';

/** Cards 4 and 5: when each close chaser reaches DRS range, and how likely a pass is. */
import { strings } from '@/lib/i18n/strings';
import type { BattlePrediction } from '@/lib/models/predict/assemble';
import { weakest } from '@/lib/models/predict/confidence';
import { ConfidenceChip, NotEnough, PredictionCard } from './PredictionCard';

function Pair({ battle }: { battle: BattlePrediction }) {
  const text = strings.simple.predictions.battles;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <span className="text-foreground font-medium">
        {text.pair(battle.chaserLabel, battle.aheadLabel, battle.position)}
      </span>
      <span className="tnum text-muted text-[11px]">{text.gap(battle.gap.toFixed(1))}</span>
    </div>
  );
}

export function BattleForecastCard({ battles }: { battles: BattlePrediction[] }) {
  const text = strings.simple.predictions.battles;
  const measured = battles.filter((b) => b.forecast.enough);

  return (
    <PredictionCard
      title={text.title}
      method="battleForecast"
      confidence={
        measured.length > 0 ? weakest(...measured.map((b) => b.forecast.confidence)) : null
      }
    >
      {battles.length === 0 ? (
        <p className="text-muted text-xs">{text.none}</p>
      ) : (
        <ul className="divide-border divide-y text-xs">
          {battles.map((battle) => {
            const f = battle.forecast;
            return (
              <li
                key={`${battle.aheadNumber}-${battle.chaserNumber}`}
                className="py-1.5 first:pt-0 last:pb-0"
              >
                <Pair battle={battle} />
                {f.enough ? (
                  <div className="mt-0.5 flex flex-wrap items-center justify-between gap-1">
                    <span className="text-foreground">
                      {f.lapsToDrs === 0
                        ? text.inDrs
                        : f.lapsToDrs != null
                          ? text.drsIn(f.lapsToDrs)
                          : text.notBeforeEnd}
                    </span>
                    <ConfidenceChip level={f.confidence} />
                  </div>
                ) : (
                  <NotEnough />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PredictionCard>
  );
}

export function OvertakeCard({ battles }: { battles: BattlePrediction[] }) {
  const text = strings.simple.predictions.battles;
  const measured = battles.filter((b) => b.overtake.enough);

  return (
    <PredictionCard
      title={text.overtakeTitle}
      method="overtake"
      confidence={
        measured.length > 0 ? weakest(...measured.map((b) => b.overtake.confidence)) : null
      }
    >
      {battles.length === 0 ? (
        <p className="text-muted text-xs">{text.none}</p>
      ) : (
        <ul className="divide-border divide-y text-xs">
          {battles.map((battle) => {
            const p = battle.overtake.probability;
            const percent = p == null ? null : Math.round(p * 100);
            return (
              <li
                key={`${battle.aheadNumber}-${battle.chaserNumber}`}
                className="py-1.5 first:pt-0 last:pb-0"
              >
                <Pair battle={battle} />
                {percent == null ? (
                  <NotEnough />
                ) : (
                  <>
                    <div
                      className="bg-surface-2 border-border mt-1 h-2 w-full overflow-hidden rounded-full border"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      aria-label={text.overtake(percent)}
                    >
                      <div
                        className="bg-accent h-full rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="text-foreground mt-0.5">{text.overtake(percent)}</p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PredictionCard>
  );
}
