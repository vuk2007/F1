'use client';

/**
 * Card 9, 2026 races only: how hard the selected driver and their rival are using
 * energy, and what that means for the next battle. Always graded low: see
 * lib/models/energy for why every input is a guess.
 */
import { strings } from '@/lib/i18n/strings';
import type { SessionDataset } from '@/lib/openf1/dataset';
import { useEnergyStory } from '@/lib/replay/use-energy-story';
import { NotEnough, PredictionCard } from './PredictionCard';

interface EnergyDriver {
  driverNumber: number;
  label: string;
  lastLap: number | null;
}

function Row({ dataset, driver }: { dataset: SessionDataset; driver: EnergyDriver }) {
  const text = strings.simple.predictions.energy;
  const { story, loading, error } = useEnergyStory(dataset, driver.driverNumber, driver.lastLap);

  return (
    <li className="py-1.5 text-xs first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-foreground font-medium">{driver.label}</span>
        {story?.enough && story.style && (
          <span className="text-foreground font-semibold">{text.style[story.style]}</span>
        )}
      </div>
      {loading ? (
        <p className="text-muted">{text.loading}</p>
      ) : error ? (
        <p className="text-muted">{text.unavailable}</p>
      ) : story?.enough && story.style ? (
        <>
          <p className="tnum text-muted text-[11px]">
            {text.rates(story.liftsPerLap ?? 0, story.boostsPerLap ?? 0)}
          </p>
          <p className="text-foreground/90 mt-0.5">{text.why[story.style]}</p>
        </>
      ) : (
        <NotEnough />
      )}
    </li>
  );
}

export function EnergyStoryCard({
  dataset,
  drivers,
}: {
  dataset: SessionDataset;
  drivers: EnergyDriver[];
}) {
  const text = strings.simple.predictions.energy;
  return (
    <PredictionCard title={text.title} method="energyStory" confidence="low">
      <ul className="divide-border divide-y">
        {drivers.map((driver) => (
          <Row key={driver.driverNumber} dataset={dataset} driver={driver} />
        ))}
      </ul>
      <p className="text-muted mt-1.5 text-[10px]">{text.note}</p>
    </PredictionCard>
  );
}
