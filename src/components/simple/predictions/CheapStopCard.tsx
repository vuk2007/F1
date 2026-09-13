'use client';

/** Card 7: under a safety car, who gains by stopping now. Only shown while one is out. */
import { strings } from '@/lib/i18n/strings';
import type { CheapStop } from '@/lib/models/predict/cheap-stop';
import { PredictionCard } from './PredictionCard';

const SHOWN = 6;

export function CheapStopCard({ cheap }: { cheap: CheapStop }) {
  const text = strings.simple.predictions.cheap;
  if (!cheap.active || !cheap.kind) return null;
  const gainers = cheap.drivers.filter((d) => d.positionsGained > 0).slice(0, SHOWN);

  return (
    <PredictionCard
      title={cheap.kind === 'sc' ? text.sc : text.vsc}
      method="cheapStop"
      // A rule-of-thumb discount on a live gap: never better than medium.
      confidence={gainers.length > 0 ? 'medium' : 'low'}
      className="border-sector-yellow/50 md:col-span-2"
    >
      <p className="text-muted mb-1.5 text-xs">
        {text.cost(cheap.reducedPitLoss.toFixed(0), cheap.normalPitLoss.toFixed(0))}
      </p>
      {gainers.length === 0 ? (
        <p className="text-foreground text-xs">{text.nobody}</p>
      ) : (
        <ul className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {gainers.map((d) => (
            <li key={d.driverNumber} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-foreground w-9 font-semibold">{d.label}</span>
              <span className="text-muted">{text.gain(d.rejoinNow, d.rejoinGreen)}</span>
              <span className="tnum text-sector-green">{text.places(d.positionsGained)}</span>
              {d.stillNeedsStop && (
                <span className="text-muted text-[10px]">· {text.stillNeeds}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </PredictionCard>
  );
}
