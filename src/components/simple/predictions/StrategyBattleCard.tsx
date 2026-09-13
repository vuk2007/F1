'use client';

/** Card 6: two drivers' stints so far and projected, and who finishes ahead under each plan. */
import { compoundColour, compoundLetter } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';
import type { DriverPredictions } from '@/lib/models/predict/assemble';
import type { PlanProjection, StrategyCar } from '@/lib/models/predict/strategy-battle';
import type { Driver } from '@/lib/openf1/types';
import { NotEnough, PredictionCard } from './PredictionCard';

function bestPlan(plans: PlanProjection[]): PlanProjection | null {
  return plans.reduce<PlanProjection | null>(
    (best, plan) => (best == null || plan.timeToFinish < best.timeToFinish ? plan : best),
    null,
  );
}

function Timeline({
  car,
  plan,
  totalLaps,
}: {
  car: StrategyCar;
  plan: PlanProjection | null;
  totalLaps: number;
}) {
  const pct = (laps: number) => `${(Math.max(0, laps) / totalLaps) * 100}%`;
  const projected = (plan?.stintsAhead ?? [])
    .map((s) => ({ ...s, lapStart: Math.max(s.lapStart, car.currentLap + 1) }))
    .filter((s) => s.lapEnd >= s.lapStart);

  return (
    <div className="flex items-center gap-2">
      <span className="text-foreground w-9 shrink-0 text-xs font-semibold">{car.label}</span>
      <div className="bg-surface-2 relative h-5 min-w-0 flex-1 overflow-hidden rounded">
        {car.stintsSoFar.map((stint) => (
          <span
            key={`run-${stint.lapStart}`}
            className="absolute inset-y-0 flex items-center justify-center text-[9px] font-bold text-black"
            style={{
              left: pct(stint.lapStart - 1),
              width: pct(stint.lapEnd - stint.lapStart + 1),
              backgroundColor: compoundColour(stint.compound),
              // A 2px surface gap between neighbouring stints.
              borderRight: '2px solid var(--surface)',
            }}
            title={`${stint.compound ?? ''} laps ${stint.lapStart}–${stint.lapEnd}`}
          >
            {stint.lapEnd - stint.lapStart >= 4 ? compoundLetter(stint.compound) : ''}
          </span>
        ))}
        {projected.map((stint) => (
          <span
            key={`plan-${stint.lapStart}`}
            className="border-muted absolute inset-y-0.5 rounded-sm border border-dashed"
            style={{
              left: pct(stint.lapStart - 1),
              width: pct(stint.lapEnd - stint.lapStart + 1),
              // Projected laps on the current set keep its colour, faded; new sets are unknown.
              backgroundColor: stint.newSet ? 'transparent' : compoundColour(car.compound),
              opacity: stint.newSet ? 1 : 0.35,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function StrategyBattleCard({
  driver,
  drivers,
  totalLaps,
  onSelectRival,
}: {
  driver: DriverPredictions;
  drivers: Driver[];
  totalLaps: number;
  onSelectRival: (driverNumber: number) => void;
}) {
  const text = strings.simple.predictions.strategy;
  const battle = driver.strategy;
  const selectId = `rival-${driver.driverNumber}`;

  return (
    <PredictionCard
      title={text.title}
      method="strategyBattle"
      confidence={battle?.confidence}
      className="md:col-span-2"
    >
      <label htmlFor={selectId} className="text-muted mb-2 flex items-center gap-2 text-xs">
        <span className="text-foreground font-medium">{driver.label}</span>
        {text.against}
        <select
          id={selectId}
          value={driver.rivalNumber ?? ''}
          onChange={(event) => onSelectRival(Number(event.target.value))}
          className="border-border bg-surface-2 text-foreground rounded border px-1.5 py-0.5 text-xs"
        >
          {drivers
            .filter((d) => d.driver_number !== driver.driverNumber)
            .map((d) => (
              <option key={d.driver_number} value={d.driver_number}>
                {d.name_acronym}
              </option>
            ))}
        </select>
      </label>

      {!battle ? (
        <>
          <NotEnough />
          <p className="text-muted mt-1 text-[11px]">{text.unavailable}</p>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Timeline car={battle.x.car} plan={bestPlan(battle.x.plans)} totalLaps={totalLaps} />
            <Timeline car={battle.y.car} plan={bestPlan(battle.y.plans)} totalLaps={totalLaps} />
          </div>
          <div className="text-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-11 text-[10px]">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="inline-block h-2.5 w-4 rounded-sm bg-[#f5c518]" />
              {text.legendRun}
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="border-muted inline-block h-2.5 w-4 rounded-sm border border-dashed"
              />
              {text.legendProjected}
            </span>
            <span className="tnum ml-auto">{text.lap(totalLaps)}</span>
          </div>

          <ul className="divide-border mt-2 divide-y text-xs">
            {battle.combinations.map((combo) => (
              <li
                key={`${combo.xStops}-${combo.yStops}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 py-1"
              >
                <span className="text-muted">
                  {text.combo(battle.x.car.label, combo.xStops, battle.y.car.label, combo.yStops)}
                </span>
                <span className="tnum text-foreground">
                  {Math.abs(combo.finishGap) < 0.05
                    ? text.level
                    : text.ahead(combo.aheadLabel, Math.abs(combo.finishGap).toFixed(1))}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </PredictionCard>
  );
}
