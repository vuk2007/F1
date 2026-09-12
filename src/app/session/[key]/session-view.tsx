'use client';

/**
 * Session page shell: downloads the session, then renders the replay.
 *
 * Everything below the clock derives from pure selectors, recomputed per frame
 * via useMemo keyed on the replay time.
 */
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { RaceControlFeed } from '@/components/RaceControlFeed';
import { ReplayControls } from '@/components/ReplayControls';
import { TimingTable } from '@/components/TimingTable';
import { WeatherStrip } from '@/components/WeatherStrip';
import { strings } from '@/lib/i18n/strings';
import { LiveSessionLockoutError } from '@/lib/openf1/client';
import { loadSession } from '@/lib/openf1/loader';
import { useReplayClock } from '@/lib/replay/use-replay-clock';
import {
  leaderLapAt,
  raceControlFeed,
  timingTableAt,
  trackStatusAt,
  weatherAt,
} from '@/lib/replay/selectors';
import { useSessionStore } from '@/lib/store/session-store';

export function SessionView({ sessionKey }: { sessionKey: number }) {
  const dataset = useSessionStore((s) => s.dataset);
  const status = useSessionStore((s) => s.status);
  const progress = useSessionStore((s) => s.progress);
  const error = useSessionStore((s) => s.error);
  const lockedOut = useSessionStore((s) => s.lockedOut);
  const timeMs = useSessionStore((s) => s.timeMs);
  const selectedDriver = useSessionStore((s) => s.selectedDriver);
  const selectDriver = useSessionStore((s) => s.selectDriver);

  useReplayClock();

  useEffect(() => {
    const store = useSessionStore.getState();
    // Already holding this session (e.g. a re-render or client-side nav back).
    if (store.dataset?.session.session_key === sessionKey && store.status === 'ready') return;

    let cancelled = false;
    store.beginLoad();

    loadSession(sessionKey, (update) => {
      if (!cancelled) useSessionStore.getState().setProgress(update);
    })
      .then((loaded) => {
        if (!cancelled) useSessionStore.getState().setDataset(loaded);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof LiveSessionLockoutError) {
          useSessionStore.getState().setError(strings.errors.lockedOutBody, true);
          return;
        }
        useSessionStore
          .getState()
          .setError(caught instanceof Error ? caught.message : strings.errors.generic);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  /*
   * Selectors are pure, so memoising on (dataset, timeMs) is enough. The clock
   * advances once per animation frame, which is also how often this recomputes.
   */
  const view = useMemo(() => {
    if (!dataset) return null;
    return {
      rows: timingTableAt(dataset, timeMs),
      lap: leaderLapAt(dataset, timeMs),
      status: trackStatusAt(dataset, timeMs),
      weather: weatherAt(dataset, timeMs),
      messages: raceControlFeed(dataset, timeMs),
    };
  }, [dataset, timeMs]);

  if (status === 'error') {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-16">
        <h1 className="text-xl font-semibold">
          {lockedOut ? strings.errors.lockedOutTitle : strings.errors.generic}
        </h1>
        <p className="text-muted mt-3 text-sm">{error}</p>
        <Link href="/" className="text-accent mt-6 inline-block text-sm hover:underline">
          {strings.load.backToPicker}
        </Link>
      </main>
    );
  }

  if (status !== 'ready' || !dataset || !view) {
    const pct = progress ? Math.round((progress.completed / progress.total) * 100) : 0;
    const partLabel = progress ? (strings.load.parts[progress.part] ?? progress.part) : '';
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-20">
        <h1 className="text-lg font-semibold">{strings.load.heading}</h1>
        <p className="text-muted mt-2 text-sm">{strings.load.subheading}</p>
        <div className="bg-surface-2 mt-6 h-1.5 w-full overflow-hidden rounded">
          <div
            className="bg-accent h-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-muted mt-2 text-xs">
          {partLabel}
          {progress?.rows != null && ` · ${strings.load.rows(progress.rows)}`}
        </p>
      </main>
    );
  }

  const { session } = dataset;

  return (
    <main className="flex flex-1 flex-col">
      <header className="border-border bg-surface flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">
            {session.location} {session.year} <span className="text-muted">/</span>{' '}
            {session.session_name}
          </h1>
          <p className="text-muted text-xs">{session.circuit_short_name}</p>
        </div>
        <Link href="/" className="text-accent text-xs hover:underline">
          {strings.load.backToPicker}
        </Link>
      </header>

      <ReplayControls
        startMs={dataset.startMs}
        endMs={dataset.endMs}
        lap={view.lap}
        trackStatus={view.status}
      />
      <WeatherStrip weather={view.weather} />

      <div className="flex flex-1 flex-col lg:flex-row">
        <section className="min-w-0 flex-1">
          <TimingTable
            rows={view.rows}
            selectedDriver={selectedDriver}
            onSelectDriver={selectDriver}
          />
        </section>
        <aside className="border-border w-full border-t lg:max-h-[calc(100vh-160px)] lg:w-80 lg:border-t-0 lg:border-l">
          <RaceControlFeed messages={view.messages} sessionStartMs={dataset.startMs} />
        </aside>
      </div>
    </main>
  );
}
