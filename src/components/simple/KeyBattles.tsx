'use client';

/** The two or three closest pairs on track, with which way the gap is heading. */
import { teamColour } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';
import type { GapTrend, KeyBattle } from '@/lib/replay/battles';
import type { DriverTimingRow } from '@/lib/replay/selectors';
import { InfoTip } from '../InfoTip';

const TREND: Record<GapTrend, { arrow: string; className: string }> = {
  closing: { arrow: '▼', className: 'text-sector-green' },
  stable: { arrow: '■', className: 'text-muted' },
  opening: { arrow: '▲', className: 'text-sector-yellow' },
  unknown: { arrow: '·', className: 'text-muted' },
};

function Name({ row }: { row: DriverTimingRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-3.5 w-1 rounded-sm"
        style={{ backgroundColor: teamColour(row.driver.team_colour) }}
      />
      <span className="font-semibold">{row.driver.name_acronym}</span>
    </span>
  );
}

export function KeyBattles({ battles }: { battles: KeyBattle[] }) {
  const text = strings.simple.battles;

  return (
    <section className="border-border border-t px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-muted inline-flex items-center text-[10px] font-medium tracking-wide uppercase">
          {text.heading}
          <InfoTip term="interval" />
        </h2>
        <span className="text-muted text-[10px]">{text.trendHint}</span>
      </div>

      {battles.length === 0 ? (
        <p className="text-muted text-xs">{text.none}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-3">
          {battles.map((battle) => {
            const trend = TREND[battle.trend];
            return (
              <li
                key={`${battle.ahead.driver.driver_number}-${battle.chaser.driver.driver_number}`}
                className="border-border bg-surface rounded-lg border px-3 py-2"
              >
                <div className="text-muted text-[10px] tracking-wide uppercase">
                  {text.forPosition(battle.position)}
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <Name row={battle.ahead} />
                  <span className="tnum text-muted text-xs">{battle.gap.toFixed(1)} s</span>
                  <Name row={battle.chaser} />
                </div>
                <div className={`mt-1 text-xs ${trend.className}`}>
                  <span aria-hidden>{trend.arrow} </span>
                  {text.trend[battle.trend]}
                  {battle.change != null && (
                    <span className="tnum text-muted">
                      {' '}
                      ({battle.change > 0 ? '+' : ''}
                      {battle.change.toFixed(1)} s)
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
