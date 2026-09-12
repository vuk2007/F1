'use client';

/**
 * The live timing table. Reads only through replay selectors, so it is identical
 * whether the data came from a replay or (later) a live feed.
 */
import {
  compoundColour,
  compoundLetter,
  formatLapTime,
  formatSector,
  teamColour,
} from '@/lib/format';
import { strings } from '@/lib/i18n/strings';
import type { DriverTimingRow, SectorColour } from '@/lib/replay/selectors';
import { InfoTip } from './InfoTip';
import type { MetricKey } from '@/lib/explain/metrics';

const SECTOR_CLASS: Record<SectorColour, string> = {
  purple: 'text-sector-purple',
  green: 'text-sector-green',
  yellow: 'text-sector-yellow',
  none: 'text-muted',
};

function HeaderCell({
  label,
  metric,
  align = 'right',
}: {
  label: string;
  metric: MetricKey;
  align?: 'left' | 'right' | 'center';
}) {
  const alignClass =
    align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right';
  return (
    <th
      scope="col"
      className={`text-muted px-2 py-2 text-[10px] font-medium tracking-wide whitespace-nowrap uppercase ${alignClass}`}
    >
      <span className="inline-flex items-center">
        {label}
        <InfoTip metric={metric} />
      </span>
    </th>
  );
}

export function TimingTable({
  rows,
  selectedDriver,
  onSelectDriver,
}: {
  rows: DriverTimingRow[];
  selectedDriver: number | null;
  onSelectDriver: (driverNumber: number) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-muted p-6 text-sm">{strings.timing.noData}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="tnum w-full min-w-[820px] border-collapse text-sm">
        <thead className="bg-surface sticky top-0">
          <tr className="border-border border-b">
            <HeaderCell label={strings.timing.columns.position} metric="position" align="center" />
            <HeaderCell label={strings.timing.columns.driver} metric="driver" align="left" />
            <HeaderCell label={strings.timing.columns.gapToLeader} metric="gapToLeader" />
            <HeaderCell label={strings.timing.columns.interval} metric="interval" />
            <HeaderCell label={strings.timing.columns.lastLap} metric="lastLap" />
            <HeaderCell label={strings.timing.columns.bestLap} metric="bestLap" />
            <HeaderCell label={strings.timing.columns.sector1} metric="sector" />
            <HeaderCell label={strings.timing.columns.sector2} metric="sector" />
            <HeaderCell label={strings.timing.columns.sector3} metric="sector" />
            <HeaderCell label={strings.timing.columns.tyre} metric="tyre" align="center" />
            <HeaderCell label={strings.timing.columns.pits} metric="pits" align="center" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const number = row.driver.driver_number;
            const selected = selectedDriver === number;
            return (
              <tr
                key={number}
                onClick={() => onSelectDriver(number)}
                className={`border-border/50 cursor-pointer border-b transition ${
                  selected ? 'bg-accent/15' : 'hover:bg-surface-2'
                }`}
              >
                <td className="text-muted px-2 py-1.5 text-center">{row.position ?? '—'}</td>

                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-4 w-1 rounded-sm"
                      style={{ backgroundColor: teamColour(row.driver.team_colour) }}
                    />
                    <span className="font-medium">{row.driver.name_acronym}</span>
                    <span className="text-muted text-xs">{number}</span>
                    {row.isOutLap && (
                      <span className="bg-surface-2 text-muted rounded px-1 text-[9px]">
                        {strings.timing.outLap}
                      </span>
                    )}
                  </span>
                </td>

                <td className="text-muted px-2 py-1.5 text-right">{row.gapToLeader.label}</td>
                <td className="px-2 py-1.5 text-right">{row.interval.label}</td>

                <td
                  className={`px-2 py-1.5 text-right ${
                    row.isSessionBestLap
                      ? 'text-sector-purple'
                      : row.isPersonalBestLap
                        ? 'text-sector-green'
                        : ''
                  }`}
                >
                  {formatLapTime(row.lastLap)}
                </td>
                <td className="text-muted px-2 py-1.5 text-right">{formatLapTime(row.bestLap)}</td>

                {row.sectors.map((sector, i) => (
                  <td key={i} className={`px-2 py-1.5 text-right ${SECTOR_CLASS[sector.colour]}`}>
                    {formatSector(sector.seconds)}
                  </td>
                ))}

                <td className="px-2 py-1.5 text-center">
                  {row.tyre.compound ? (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-black"
                        style={{ backgroundColor: compoundColour(row.tyre.compound) }}
                        title={
                          strings.compounds[row.tyre.compound.toUpperCase()] ?? row.tyre.compound
                        }
                      >
                        {compoundLetter(row.tyre.compound)}
                      </span>
                      <span className="text-muted text-xs">{row.tyre.age ?? '—'}</span>
                    </span>
                  ) : (
                    <span className="text-muted">{'—'}</span>
                  )}
                </td>

                <td className="text-muted px-2 py-1.5 text-center">{row.pitCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
