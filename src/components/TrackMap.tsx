'use client';

/**
 * The circuit, drawn from the car's own GPS trace and coloured by speed.
 *
 * This is the piece that makes the telemetry spatial: a braking trace tells you
 * something happened at 3200 metres, the map tells you it was the second
 * chicane. The two are driven by the same lap, so they always agree.
 *
 * Speed uses a single-hue sequential ramp, dark for slow and light for fast.
 * That is the correct encoding for a magnitude, and the light end reads as
 * "more" against a dark surface. Because colour alone is a weak channel, the
 * braking zones are ALSO marked with a thicker overlay stroke, so the most
 * important feature of a lap survives for a colourblind reader and in print.
 */
import { useMemo } from 'react';
import { strings } from '@/lib/i18n/strings';
import { buildTrackMap, speedColour, SPEED_RAMP } from '@/lib/models/track-map';
import type { TelemetryPoint } from '@/lib/models/telemetry';
import type { LocationPoint } from '@/lib/openf1/types';
import { InfoTip } from './InfoTip';

const BRAKE_COLOUR = '#d95926';

export function TrackMap({
  location,
  telemetry,
  loading,
}: {
  location: LocationPoint[];
  telemetry: TelemetryPoint[];
  loading: boolean;
}) {
  const map = useMemo(() => buildTrackMap(location, telemetry), [location, telemetry]);

  if (loading) {
    return <p className="text-muted py-4 text-xs">{strings.trackMap.loading}</p>;
  }
  if (map.points.length < 2) {
    return <p className="text-muted py-4 text-xs">{strings.trackMap.noData}</p>;
  }

  const { points, width, height, speedRange, brakingZones } = map;

  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-muted inline-flex items-center text-[10px] tracking-wide uppercase">
          {strings.trackMap.heading}
          <InfoTip metric="trackMap" />
        </span>
      </div>

      {/*
        Sized by height, not width: circuits are rarely square and the raw GPS
        frame is not rotated, so letting the taller axis drive the fit keeps the
        whole lap on screen. Stroke widths are in viewBox units, which are scaled
        down by roughly 2.5x at this size — hence the seemingly heavy numbers.
      */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto block"
        style={{ maxHeight: 420, maxWidth: '100%' }}
        role="img"
        aria-label={strings.trackMap.altText}
      >
        {/* A dark casing under the line keeps the pale fast sections readable. */}
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#0b0d10"
          strokeWidth={26}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* One segment per sample, each carrying its own speed colour. */}
        {points.slice(1).map((point, index) => {
          const previous = points[index]!;
          // Colour each segment by the mean of its endpoints, so the gradient
          // steps evenly rather than jumping at every sample.
          const a = previous.speed;
          const b = point.speed;
          const segmentSpeed = a != null && b != null ? (a + b) / 2 : (a ?? b);

          return (
            <line
              key={point.dateMs}
              x1={previous.x}
              y1={previous.y}
              x2={point.x}
              y2={point.y}
              stroke={speedColour(segmentSpeed, speedRange)}
              strokeWidth={18}
              strokeLinecap="round"
            />
          );
        })}

        {/* Braking zones, marked by shape as well as by colour. */}
        {brakingZones.map((zone) => {
          const slice = points.slice(zone.from, zone.to + 2);
          if (slice.length < 2) return null;
          return (
            <polyline
              key={`brake-${zone.from}`}
              points={slice.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={BRAKE_COLOUR}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Where the lap begins. */}
        <circle
          cx={points[0]!.x}
          cy={points[0]!.y}
          r={16}
          fill="none"
          stroke="#e8ecf1"
          strokeWidth={5}
        />
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
        <span className="flex items-center gap-1.5">
          <span className="text-muted">{strings.trackMap.slow}</span>
          <span className="flex">
            {SPEED_RAMP.map((colour) => (
              <span key={colour} className="inline-block h-2 w-5" style={{ background: colour }} />
            ))}
          </span>
          <span className="text-muted">{strings.trackMap.fast}</span>
        </span>

        {speedRange && (
          <span className="tnum text-muted">
            {Math.round(speedRange.min)}–{Math.round(speedRange.max)} km/h
          </span>
        )}

        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: BRAKE_COLOUR }} />
          <span className="text-muted">{strings.trackMap.braking}</span>
        </span>

        <span className="text-muted">{strings.trackMap.zones(brakingZones.length)}</span>
      </div>
    </div>
  );
}
