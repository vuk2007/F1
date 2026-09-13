'use client';

/**
 * The running order as cards: who, where, how far back, on what tyres, and at most
 * two things worth pointing out. Tapping a card selects the driver, which opens the
 * same detail panels the Engineer view uses.
 */
import { badgeLabel, badgeTerm, type BadgeKind } from '@/lib/explain/driver-card';
import { compoundColour, compoundLetter, teamColour } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';
import type { DriverTimingRow } from '@/lib/replay/selectors';
import type { Regulations } from '@/lib/season';
import { InfoTip } from '../InfoTip';

export interface DriverCardData {
  row: DriverTimingRow;
  statusLine: string;
  badges: BadgeKind[];
}

const BADGE_CLASS: Record<BadgeKind, string> = {
  fastestLap: 'bg-sector-purple/20 text-sector-purple',
  underInvestigation: 'bg-danger/20 text-danger',
  pitSoon: 'bg-sector-yellow/20 text-sector-yellow',
  undercutThreat: 'bg-sector-yellow/20 text-sector-yellow',
  attackRange: 'bg-sector-green/20 text-sector-green',
  freshTyres: 'bg-accent/20 text-accent',
};

function Card({
  card,
  selected,
  onSelect,
  regulations,
}: {
  card: DriverCardData;
  selected: boolean;
  onSelect: (driverNumber: number) => void;
  regulations: Regulations;
}) {
  const { row, statusLine, badges } = card;
  const number = row.driver.driver_number;
  const compound = row.tyre.compound;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(number)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(number);
        }
      }}
      className={`flex h-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
        selected
          ? 'border-accent bg-accent/10'
          : 'border-border bg-surface hover:border-accent/50 hover:bg-surface-2'
      }`}
    >
      <span className="tnum text-muted w-6 shrink-0 text-right text-lg font-semibold">
        {row.position ?? '—'}
      </span>
      <span
        aria-hidden
        className="h-9 w-1 shrink-0 rounded-sm"
        style={{ backgroundColor: teamColour(row.driver.team_colour) }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{row.driver.name_acronym}</span>
          <span className="text-muted truncate text-xs">{row.driver.full_name}</span>
        </div>
        <p className="text-muted text-xs leading-snug">{statusLine}</p>
        {badges.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {badges.map((badge) => {
              const term = badgeTerm(badge, regulations);
              return (
                <span
                  key={badge}
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_CLASS[badge]}`}
                >
                  {badgeLabel(badge, regulations)}
                  {term && <InfoTip term={term} />}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {compound && (
        <span className="flex shrink-0 flex-col items-center gap-0.5">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-black"
            style={{ backgroundColor: compoundColour(compound) }}
            title={strings.compounds[compound.toUpperCase()] ?? compound}
          >
            {compoundLetter(compound)}
          </span>
          <span className="tnum text-muted text-[10px]">{row.tyre.age ?? '—'}</span>
        </span>
      )}
    </div>
  );
}

export function DriverCards({
  cards,
  selectedDriver,
  onSelectDriver,
  regulations,
}: {
  cards: DriverCardData[];
  selectedDriver: number | null;
  onSelectDriver: (driverNumber: number) => void;
  /** Which era's name the one-second badge uses. */
  regulations: Regulations;
}) {
  const text = strings.simple.cards;

  if (cards.length === 0) {
    return <p className="text-muted p-6 text-sm">{strings.timing.noData}</p>;
  }

  return (
    <section className="px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="text-muted text-[10px] font-medium tracking-wide uppercase">
          {text.heading}
        </h2>
        <span className="text-muted inline-flex items-center text-[10px]">
          {text.legendGap}
          <InfoTip term="interval" />
        </span>
        <span className="text-muted inline-flex items-center text-[10px]">
          {text.legendTyre}
          <InfoTip term="compound" />
        </span>
        <span className="text-muted inline-flex items-center text-[10px]">
          {text.legendAge}
          <InfoTip term="tyreAge" />
        </span>
        <span className="text-muted text-[10px]">{text.tapHint}</span>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <li key={card.row.driver.driver_number}>
            <Card
              card={card}
              selected={selectedDriver === card.row.driver.driver_number}
              onSelect={onSelectDriver}
              regulations={regulations}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
