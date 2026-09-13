'use client';

/**
 * The prediction cards, Simple view only. Renders `buildPredictions` output and
 * computes nothing of its own.
 */
import { strings } from '@/lib/i18n/strings';
import type { PracticePredictions, RacePredictions } from '@/lib/models/predict/assemble';
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Driver } from '@/lib/openf1/types';
import { EnergyStoryCard } from './EnergyStoryCard';
import { BattleForecastCard, OvertakeCard } from './BattleCards';
import { CheapStopCard } from './CheapStopCard';
import { PitWindowCard, TyreLifeCard } from './DriverForecastCards';
import { PracticeForecastCard } from './PracticeForecastCard';
import { StrategyBattleCard } from './StrategyBattleCard';
import { TyrePerformanceCard } from './TyrePerformanceCard';

export function Predictions({
  predictions,
  drivers,
  onSelectRival,
  dataset,
}: {
  predictions: RacePredictions | PracticePredictions;
  drivers: Driver[];
  onSelectRival: (driverNumber: number) => void;
  /** For the 2026 energy story, which loads its own telemetry. */
  dataset?: SessionDataset;
}) {
  const text = strings.simple.predictions;
  const labelFor = (n: number) =>
    drivers.find((d) => d.driver_number === n)?.name_acronym ?? String(n);

  return (
    <section className="border-border border-t px-4 py-3" aria-labelledby="predictions-heading">
      <div className="mb-2">
        <h2
          id="predictions-heading"
          className="text-muted text-[10px] font-medium tracking-wide uppercase"
        >
          {text.heading}
        </h2>
        <p className="text-muted mt-0.5 text-[11px]">{text.subheading}</p>
      </div>

      {predictions.kind === 'practice' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <PracticeForecastCard practice={predictions} labelFor={labelFor} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <CheapStopCard cheap={predictions.cheapStop} />
          <TyrePerformanceCard tyres={predictions.tyres} />
          <BattleForecastCard battles={predictions.battles} regulations={predictions.regulations} />
          <OvertakeCard battles={predictions.battles} />
          {predictions.driver ? (
            <>
              <TyreLifeCard driver={predictions.driver} />
              <PitWindowCard
                driver={predictions.driver}
                pitLoss={predictions.pitLoss}
                labelFor={labelFor}
              />
              <StrategyBattleCard
                driver={predictions.driver}
                drivers={drivers}
                totalLaps={predictions.totalLaps}
                onSelectRival={onSelectRival}
              />
              {predictions.regulations === 'overtake-mode' && dataset && (
                <EnergyStoryCard
                  dataset={dataset}
                  drivers={[
                    {
                      driverNumber: predictions.driver.driverNumber,
                      label: predictions.driver.label,
                      lastLap: predictions.driver.lastLap,
                    },
                    ...(predictions.driver.rivalNumber == null
                      ? []
                      : [
                          {
                            driverNumber: predictions.driver.rivalNumber,
                            label: labelFor(predictions.driver.rivalNumber),
                            lastLap: predictions.driver.rivalLastLap,
                          },
                        ]),
                  ]}
                />
              )}
            </>
          ) : (
            <p className="text-muted text-xs md:col-span-2">{text.selectDriver}</p>
          )}
        </div>
      )}
    </section>
  );
}
