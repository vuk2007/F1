'use client';

/**
 * The energy story for one driver: car_data for their last three racing laps and
 * their fastest lap, read through the energy heuristics.
 *
 * Four lap-bounded car_data requests at most, through the same rate-limited,
 * IndexedDB-cached client as the telemetry panel; as the race moves on only the new
 * lap costs a request. Pit laps and lap 1 are left out: a pit-entry lift or a
 * standing start is not energy management.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  boostCandidate,
  ENERGY_STORY_LAPS,
  energyStory,
  harvestLift,
  type EnergyStory,
} from '@/lib/models/energy';
import { lapWindow, toDistanceSeries, type TelemetryPoint } from '@/lib/models/telemetry';
import { getCarData } from '@/lib/openf1/client';
import type { SessionDataset } from '@/lib/openf1/dataset';

type Lap = SessionDataset['laps'][number];

export interface EnergyStoryState {
  story: EnergyStory | null;
  loading: boolean;
  error: string | null;
}

export function useEnergyStory(
  dataset: SessionDataset | null,
  driverNumber: number | null,
  lastLap: number | null,
): EnergyStoryState {
  const [loaded, setLoaded] = useState<{
    key: string;
    story: EnergyStory | null;
    error: string | null;
  } | null>(null);

  const plan = useMemo(() => {
    if (!dataset || driverNumber == null || lastLap == null) return null;
    const pitLaps = new Set(
      dataset.pits.filter((p) => p.driver_number === driverNumber).map((p) => p.lap_number),
    );
    const racing = dataset.laps.filter(
      (l) =>
        l.driver_number === driverNumber &&
        l.lap_duration != null &&
        !l.is_pit_out_lap &&
        !pitLaps.has(l.lap_number) &&
        l.lap_number > 1 &&
        l.lap_number <= lastLap,
    );
    const recent = racing
      .filter((l) => l.lap_number > lastLap - ENERGY_STORY_LAPS)
      .sort((a, b) => a.lap_number - b.lap_number);
    if (recent.length < ENERGY_STORY_LAPS) return null;
    const reference = [...racing].sort((a, b) => a.lap_duration! - b.lap_duration!)[0]!;
    return { recent, reference };
  }, [dataset, driverNumber, lastLap]);

  const sessionKey = dataset?.session.session_key ?? null;
  const key =
    plan && sessionKey != null && driverNumber != null
      ? `${sessionKey}|${driverNumber}|${plan.recent.map((l) => l.lap_number).join(',')}|${plan.reference.lap_number}`
      : null;

  useEffect(() => {
    if (!key || !plan || sessionKey == null || driverNumber == null) return;
    let cancelled = false;

    const load = async (lap: Lap): Promise<TelemetryPoint[]> => {
      const window = lapWindow(lap);
      return window
        ? toDistanceSeries(await getCarData(sessionKey, driverNumber, window.from, window.to))
        : [];
    };

    (async () => {
      const reference = await load(plan.reference);
      const laps: { lifts: number; boosts: number }[] = [];
      for (const lap of plan.recent) {
        const isReference = lap.lap_number === plan.reference.lap_number;
        const points = isReference ? reference : await load(lap);
        laps.push({
          lifts: harvestLift(points).length,
          boosts: isReference ? 0 : boostCandidate(points, reference).length,
        });
      }
      if (!cancelled) setLoaded({ key, story: energyStory(laps), error: null });
    })().catch((caught: unknown) => {
      if (cancelled) return;
      setLoaded({ key, story: null, error: caught instanceof Error ? caught.message : 'failed' });
    });

    return () => {
      cancelled = true;
    };
  }, [key, plan, sessionKey, driverNumber]);

  if (!key) return { story: null, loading: false, error: null };
  if (loaded?.key !== key) return { story: null, loading: true, error: null };
  return { story: loaded.story, loading: false, error: loaded.error };
}
