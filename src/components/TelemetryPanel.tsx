'use client';

/**
 * Telemetry for one lap, with an optional second driver's same lap overlaid.
 *
 * Both laps are fetched one at a time through the rate-limited queue, so the
 * panel loads a lap only when the user actually asks for it rather than
 * speculatively pulling telemetry for the whole field.
 */
import { memo, useMemo, useState } from 'react';
import { formatLapTime } from '@/lib/format';
import { strings } from '@/lib/i18n/strings';
import { buildComparison, fullThrottleShare, topSpeed } from '@/lib/models/telemetry';
import type { SessionDataset } from '@/lib/openf1/dataset';
import type { Driver } from '@/lib/openf1/types';
import { useLapLocation, useTelemetry } from '@/lib/replay/use-telemetry';
import { InfoTip } from './InfoTip';
import { TelemetryChart } from './TelemetryChart';
import { TrackMap } from './TrackMap';

/** Laps that actually have a time, newest information first for the picker. */
function timedLaps(dataset: SessionDataset, driverNumber: number) {
  return dataset.laps
    .filter((lap) => lap.driver_number === driverNumber && lap.lap_duration != null)
    .sort((a, b) => a.lap_number - b.lap_number);
}

function fastestLapNumber(dataset: SessionDataset, driverNumber: number): number | null {
  let best: { lap: number; time: number } | null = null;
  for (const lap of timedLaps(dataset, driverNumber)) {
    const time = lap.lap_duration!;
    if (!best || time < best.time) best = { lap: lap.lap_number, time };
  }
  return best?.lap ?? null;
}

function TelemetryPanelInner({ dataset, driver }: { dataset: SessionDataset; driver: Driver }) {
  const laps = useMemo(() => timedLaps(dataset, driver.driver_number), [dataset, driver]);
  const defaultLap = useMemo(
    () => fastestLapNumber(dataset, driver.driver_number),
    [dataset, driver],
  );

  const [lapNumber, setLapNumber] = useState<number | null>(defaultLap);
  const [compareWith, setCompareWith] = useState<number | null>(null);
  /** Reset the chosen lap when the selected driver changes. */
  const [lastDriver, setLastDriver] = useState(driver.driver_number);
  if (lastDriver !== driver.driver_number) {
    setLastDriver(driver.driver_number);
    setLapNumber(defaultLap);
    setCompareWith(null);
  }

  const primary = useTelemetry(dataset, driver.driver_number, lapNumber);
  const secondary = useTelemetry(dataset, compareWith, lapNumber);
  const location = useLapLocation(dataset, driver.driver_number, lapNumber);

  const rows = useMemo(
    () => buildComparison(primary.points, compareWith == null ? null : secondary.points),
    [primary.points, secondary.points, compareWith],
  );

  const peak = topSpeed(primary.points);
  const throttleShare = fullThrottleShare(primary.points);
  const compareDriver = dataset.drivers.find((d) => d.driver_number === compareWith) ?? null;
  const selectedLap = laps.find((lap) => lap.lap_number === lapNumber);

  return (
    <section className="border-border border-t px-4 py-3">
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <h2 className="text-muted inline-flex items-center text-[10px] tracking-wide uppercase">
          {strings.telemetry.heading}
          <InfoTip metric="telemetry" />
        </h2>

        <label className="flex flex-col gap-1">
          <span className="text-muted text-[10px] tracking-wide uppercase">
            {strings.telemetry.lap}
          </span>
          <select
            value={lapNumber ?? ''}
            onChange={(event) => setLapNumber(Number(event.target.value))}
            className="border-border bg-surface rounded-md border px-2 py-1 text-xs"
          >
            {laps.map((lap) => (
              <option key={lap.lap_number} value={lap.lap_number}>
                {strings.driver.axisLap} {lap.lap_number} — {formatLapTime(lap.lap_duration)}
                {lap.lap_number === defaultLap ? ` (${strings.telemetry.fastest})` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted inline-flex items-center text-[10px] tracking-wide uppercase">
            {strings.telemetry.compare}
            <InfoTip metric="telemetryDelta" />
          </span>
          <select
            value={compareWith ?? ''}
            onChange={(event) =>
              setCompareWith(event.target.value === '' ? null : Number(event.target.value))
            }
            className="border-border bg-surface rounded-md border px-2 py-1 text-xs"
          >
            <option value="">{strings.telemetry.noComparison}</option>
            {dataset.drivers
              .filter((d) => d.driver_number !== driver.driver_number)
              .map((d) => (
                <option key={d.driver_number} value={d.driver_number}>
                  {d.name_acronym} {d.driver_number}
                </option>
              ))}
          </select>
        </label>

        {peak && (
          <span className="tnum text-xs">
            <span className="text-muted">{strings.telemetry.topSpeed} </span>
            {peak.speed} km/h
          </span>
        )}
        {throttleShare != null && (
          <span className="tnum text-xs">
            <span className="text-muted">{strings.telemetry.fullThrottle} </span>
            {Math.round(throttleShare * 100)}%
          </span>
        )}
        {selectedLap?.lap_duration != null && (
          <span className="tnum text-xs">
            <span className="text-muted">{strings.timing.columns.lastLap} </span>
            {formatLapTime(selectedLap.lap_duration)}
          </span>
        )}
      </div>

      {primary.loading && <p className="text-muted py-4 text-sm">{strings.telemetry.loading}</p>}
      {primary.error && <p className="text-danger py-4 text-sm">{primary.error}</p>}

      {!primary.loading && !primary.error && (
        <>
          {compareWith != null && secondary.loading && (
            <p className="text-muted mb-2 text-xs">{strings.telemetry.loadingComparison}</p>
          )}
          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="min-w-0 flex-1">
              <TelemetryChart
                rows={rows}
                labelA={driver.name_acronym}
                labelB={compareDriver && !secondary.loading ? compareDriver.name_acronym : null}
              />
            </div>
            <div className="w-full xl:w-[340px] xl:shrink-0">
              <TrackMap
                location={location.points}
                telemetry={primary.points}
                loading={location.loading}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/* See DriverPanel: five charts and a track map, none of them clock-dependent. */
export const TelemetryPanel = memo(TelemetryPanelInner);
