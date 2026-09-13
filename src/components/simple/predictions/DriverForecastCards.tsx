'use client';

/** Cards 2 and 3: the selected driver's tyre life and pit window. */
import { strings } from '@/lib/i18n/strings';
import type { DriverPredictions } from '@/lib/models/predict/assemble';
import type { LivePitLoss } from '@/lib/models/predict/pit-forecast';
import { NotEnough, PredictionCard } from './PredictionCard';
import { compoundName, TyreBadge } from './TyreBadge';

/** Laps left at or under which the bar reads as a warning. */
const LOW_LIFE_LAPS = 3;

export function TyreLifeCard({ driver }: { driver: DriverPredictions }) {
  const text = strings.simple.predictions.life;
  const life = driver.life;

  if (!life) {
    return (
      <PredictionCard title={text.title(driver.label)} method="tyreLife" enough={false}>
        <NotEnough />
      </PredictionCard>
    );
  }

  const low = life.lapsLeft != null && !life.lastsToEnd && life.lapsLeft <= LOW_LIFE_LAPS;
  const sentence = life.lastsToEnd
    ? text.toTheEnd
    : life.lapsLeft === 0
      ? text.spent
      : text.lapsLeft(life.lapsLeft ?? 0);

  return (
    <PredictionCard
      title={text.title(driver.label)}
      method="tyreLife"
      confidence={life.confidence}
      enough={life.enough}
    >
      <div className="flex items-center gap-2 text-xs">
        <TyreBadge compound={life.compound} />
        <span className="text-muted">
          {text.tyres(life.tyreAge, compoundName(life.compound).toLowerCase())}
        </span>
      </div>
      <div
        className="bg-surface-2 border-border mt-2 h-3 w-full overflow-hidden rounded-full border"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((life.fraction ?? 0) * 100)}
        aria-label={sentence}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${low ? 'bg-sector-yellow' : 'bg-accent'}`}
          style={{ width: `${Math.max(0, Math.min(1, life.fraction ?? 0)) * 100}%` }}
        />
      </div>
      <p className="text-foreground mt-1.5 text-xs">
        {low && <span aria-hidden>⚠ </span>}
        {sentence}
      </p>
    </PredictionCard>
  );
}

export function PitWindowCard({
  driver,
  pitLoss,
  labelFor,
}: {
  driver: DriverPredictions;
  pitLoss: LivePitLoss;
  labelFor: (driverNumber: number) => string;
}) {
  const text = strings.simple.predictions.pit;
  const pit = driver.pit;
  const rejoin = driver.rejoin;
  const source =
    pitLoss.source === 'observed'
      ? text.source.observed(pitLoss.stopsMeasured)
      : pitLoss.source === 'circuit-table'
        ? text.source.circuit
        : text.source.fallback;

  return (
    <PredictionCard
      title={text.title(driver.label)}
      method="pitWindow"
      confidence={pit?.confidence}
      enough={pit?.enough ?? false}
    >
      <div className="space-y-1 text-xs">
        {pit?.next ? (
          <>
            <p className="text-foreground text-sm font-semibold">
              {text.best(pit.next.optimalLap)}
            </p>
            <p className="text-muted">{text.window(pit.next.from, pit.next.to)}</p>
          </>
        ) : (
          <p className="text-foreground">{text.noStop}</p>
        )}
        <p className="text-foreground pt-1">
          {rejoin
            ? text.rejoin(
                rejoin.position,
                rejoin.behind == null ? null : labelFor(rejoin.behind),
                rejoin.gapToCarAhead == null ? null : rejoin.gapToCarAhead.toFixed(1),
              )
            : text.rejoinUnknown}
        </p>
        <p className="text-muted text-[11px]">
          {text.pitLoss(pitLoss.seconds.toFixed(0))} · {source}
        </p>
      </div>
    </PredictionCard>
  );
}
