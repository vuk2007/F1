'use client';

/**
 * Loads car_data for exactly one driver and one lap.
 *
 * car_data is ~4Hz per car, so a whole session is hundreds of thousands of rows.
 * This hook is the only place the app touches it, and it always goes through a
 * lap-bounded time window. Results are cached in IndexedDB like everything else,
 * so flicking between two laps a second time costs no requests.
 */
import { useEffect, useMemo, useState } from 'react';
import type { SessionDataset } from '@/lib/openf1/dataset';
import { getCarData } from '@/lib/openf1/client';
import { lapWindow, toDistanceSeries, type TelemetryPoint } from '@/lib/models/telemetry';
import { strings } from '@/lib/i18n/strings';

export interface TelemetryState {
  points: TelemetryPoint[];
  loading: boolean;
  error: string | null;
}

const IDLE: TelemetryState = { points: [], loading: false, error: null };
const NO_WINDOW: TelemetryState = { points: [], loading: false, error: strings.telemetry.noData };

/** What the hook has finished loading, tagged with the request it answered. */
interface Loaded {
  key: string;
  points: TelemetryPoint[];
  error: string | null;
}

export function useTelemetry(
  dataset: SessionDataset | null,
  driverNumber: number | null,
  lapNumber: number | null,
): TelemetryState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  /*
   * The query window is derived during render rather than written into state.
   * "Nothing selected" and "this lap has no usable window" are facts about the
   * inputs, not results of a fetch.
   */
  const window = useMemo(() => {
    if (!dataset || driverNumber == null || lapNumber == null) return null;
    const lap = dataset.laps.find(
      (candidate) => candidate.driver_number === driverNumber && candidate.lap_number === lapNumber,
    );
    return lap ? lapWindow(lap) : null;
  }, [dataset, driverNumber, lapNumber]);

  const sessionKey = dataset?.session.session_key ?? null;
  const key =
    window && sessionKey != null && driverNumber != null
      ? `${sessionKey}|${driverNumber}|${window.from}`
      : null;

  useEffect(() => {
    if (!key || !window || sessionKey == null || driverNumber == null) return;

    let cancelled = false;
    getCarData(sessionKey, driverNumber, window.from, window.to)
      .then((samples) => {
        if (!cancelled) setLoaded({ key, points: toDistanceSeries(samples), error: null });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setLoaded({
          key,
          points: [],
          error: caught instanceof Error ? caught.message : strings.telemetry.noData,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [key, window, sessionKey, driverNumber]);

  if (driverNumber == null || lapNumber == null) return IDLE;
  if (!window || !key) return NO_WINDOW;

  /*
   * Loading is derived by comparing the request we want with the one we have,
   * rather than flipping a flag on the way into the effect. That keeps the
   * effect free of synchronous state writes and, usefully, means switching laps
   * reports "loading" immediately on the render that changed the selection.
   */
  if (loaded?.key !== key) return { points: [], loading: true, error: null };
  return { points: loaded.points, loading: false, error: loaded.error };
}
