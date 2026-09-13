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
import { telemetryCaption } from '@/lib/explain/captions';
import { boostCandidate, harvestLift, straightModeSegments } from '@/lib/models/energy';
import { buildComparison, fullThrottleShare, topSpeed } from '@/lib/models/telemetry';
import { regulationsFor } from '@/lib/season';
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

function TelemetryPanelInner({
  dataset,
  driver,
  showCaption = false,
}: {
  dataset: SessionDataset;
  driver: Driver;
  /** Adds a plain-language reading under the charts; Simple mode only. */
  showCaption?: boolean;
}) {
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

  /*
   * 2026 only: likely energy-use markers. A lift needs only this lap; Boost and
   * Straight mode compare with a reference, the driver's fastest lap, which is
   * fetched only when a different lap is on screen. Seasons with DRS are unchanged.
   */
  const energyOn = regulationsFor(dataset.session.year) === 'overtake-mode';
  const reference = useTelemetry(
    dataset,
    driver.driver_number,
    energyOn && defaultLap !== lapNumber ? defaultLap : null,
  );
  const energy = useMemo(() => {
    if (!energyOn || primary.points.length === 0) return null;
    const likely = strings.telemetry.likely;
    const lifts = harvestLift(primary.points).map((lift) => lift.startDistance);
    const hasReference = reference.points.length > 0;
    const boosts = hasReference ? boostCandidate(primary.points, reference.points) : [];
    const straights = hasReference ? straightModeSegments(primary.points, reference.points) : [];
    return {
      markers: {
        lifts,
        areas: [
          ...straights.map((s) => ({
            from: s.fromDistance,
            to: s.toDistance,
            label: likely.straightShort,
            strength: 'weak' as const,
          })),
          ...boosts.map((s) => ({
            from: s.fromDistance,
            to: s.toDistance,
            label: likely.boostShort,
            strength: 'strong' as const,
          })),
        ],
      },
      caption: likely.caption(lifts.length, boosts.length, straights.length),
      isFastestLap: defaultLap === lapNumber,
    };
  }, [energyOn, primary.points, reference.points, defaultLap, lapNumber]);

  const rows = useMemo(
    () => buildComparison(primary.points, compareWith == null ? null : secondary.points),
    [primary.points, secondary.points, compareWith],
  );

  const peak = topSpeed(primary.points);
  const throttleShare = fullThrottleShare(primary.points);
  const compareDriver = dataset.drivers.find((d) => d.driver_number === compareWith) ?? null;
  const selectedLap = laps.find((lap) => lap.lap_number === lapNumber);

  const caption = showCaption
    ? telemetryCaption({
        labelA: driver.name_acronym,
        labelB: compareDriver && !secondary.loading ? compareDriver.name_acronym : null,
        deltas: rows.map((row) => row.delta),
        topSpeed: peak?.speed ?? null,
        fullThrottle: throttleShare,
      })
    : null;

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
                markers={energy?.markers}
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
          {caption && <p className="text-foreground/80 mt-2 text-xs leading-relaxed">{caption}</p>}
          {energy && (
            <p className="text-muted mt-2 text-xs leading-relaxed">
              <span className="text-foreground/80 font-medium">
                {strings.telemetry.likely.legend}:{' '}
              </span>
              {energy.isFastestLap ? strings.telemetry.likely.sameLap : energy.caption}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/* See DriverPanel: five charts and a track map, none of them clock-dependent. */
export const TelemetryPanel = memo(TelemetryPanelInner);
