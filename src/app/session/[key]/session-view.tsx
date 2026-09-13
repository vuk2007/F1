'use client';

/**
 * Session page shell: downloads the session, then renders the replay.
 *
 * Everything below the clock derives from pure selectors, recomputed per frame
 * via useMemo keyed on the replay time.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DriverPanel } from '@/components/DriverPanel';
import { RaceControlFeed } from '@/components/RaceControlFeed';
import { ReplayControls } from '@/components/ReplayControls';
import { StrategyPanel } from '@/components/StrategyPanel';
import { TimingTable } from '@/components/TimingTable';
import { WeatherStrip } from '@/components/WeatherStrip';
import { DriverCards } from '@/components/simple/DriverCards';
import { KeyBattles } from '@/components/simple/KeyBattles';
import { Onboarding } from '@/components/simple/Onboarding';
import { RaceStoryStrip } from '@/components/simple/RaceStoryStrip';
import { RightNowBanner } from '@/components/simple/RightNowBanner';
import { ViewModeToggle } from '@/components/simple/ViewModeToggle';
import { Predictions } from '@/components/simple/predictions/Predictions';
import { buildPredictions } from '@/lib/models/predict/assemble';
import { CALIBRATION } from '@/lib/models/predict/calibration';
import { lapChartCaption, paceCaption } from '@/lib/explain/captions';
import { driverBadges, driverStatusLine } from '@/lib/explain/driver-card';
import { openInvestigations } from '@/lib/explain/investigations';
import { flagChip, lapProgress, weatherInWords } from '@/lib/explain/race-story';
import { rightNow } from '@/lib/explain/right-now';
import { strings } from '@/lib/i18n/strings';
import { MAX_PACE_DRIVERS, PaceComparison } from '@/components/PaceComparison';
import { PracticePanel } from '@/components/PracticePanel';
import { SafetyCarPanel } from '@/components/SafetyCarPanel';
import { TelemetryPanel } from '@/components/TelemetryPanel';
import { UndercutPanel, type UndercutScenario } from '@/components/UndercutPanel';
import { theoreticalBestLap, theoreticalBestByDriver } from '@/lib/models/best-lap';
import { buildPaceComparison } from '@/lib/models/pace';
import { estimatePitLoss } from '@/lib/models/pit-loss';
import { classifyRuns } from '@/lib/models/runs';
import { pitWindow } from '@/lib/models/pit-window';
import { raceDistance } from '@/lib/models/race-distance';
import { safetyCarOpportunity } from '@/lib/models/safety-car';
import {
  analyseDriverStints,
  currentPaceBase,
  stintAnalysisForLap,
  type StintAnalysis,
} from '@/lib/models/stint-analysis';
import { undercutSimulation } from '@/lib/models/undercut';
import { LiveSessionLockoutError } from '@/lib/openf1/client';
import { loadSession } from '@/lib/openf1/loader';
import { useReplayClock } from '@/lib/replay/use-replay-clock';
import {
  currentLapNumber,
  leaderLapAt,
  raceControlFeed,
  timingTableAt,
  trackStatusAt,
  tyreAgeOnLap,
  weatherAt,
} from '@/lib/replay/selectors';
import { driversInPitLane, keyBattles } from '@/lib/replay/battles';
import { useSessionStore } from '@/lib/store/session-store';
import { useViewPrefs } from '@/lib/store/view-prefs';

/**
 * `openf1` downloads a session by key. `live` expects something else to be filling
 * the store — see `use-live-source.ts` — and only renders it.
 *
 * The rendering below is identical either way, which is the point: a live session is
 * the same `SessionDataset` arriving in instalments, so it gets the same screen
 * rather than a second one that drifts out of step.
 */
export type SessionViewMode = 'openf1' | 'live';

/** How often the prediction cards are rebuilt, in session time. */
const PREDICTION_STEP_MS = 10_000;

export function SessionView({
  sessionKey,
  mode = 'openf1',
  statusBar,
  waiting,
}: {
  /** Required for `openf1`; a live session names itself. */
  sessionKey?: number;
  mode?: SessionViewMode;
  /** Rendered above the replay controls, for live mode's connection state. */
  statusBar?: ReactNode;
  /** Replaces the download progress bar while no dataset has arrived. */
  waiting?: ReactNode;
}) {
  const dataset = useSessionStore((s) => s.dataset);
  const status = useSessionStore((s) => s.status);
  const progress = useSessionStore((s) => s.progress);
  const error = useSessionStore((s) => s.error);
  const lockedOut = useSessionStore((s) => s.lockedOut);
  const timeMs = useSessionStore((s) => s.timeMs);
  const selectedDriver = useSessionStore((s) => s.selectedDriver);
  const selectDriver = useSessionStore((s) => s.selectDriver);
  const viewMode = useViewPrefs((s) => s.mode);

  useReplayClock();

  useEffect(() => {
    // In live mode the store is filled from the bridge; there is nothing to fetch.
    if (mode !== 'openf1' || sessionKey === undefined) return;

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
  }, [sessionKey, mode]);

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

  /*
   * Every driver's stints are fitted once per dataset, never per frame. Twenty
   * drivers at two or three stints each is a few dozen small regressions, which
   * is far cheaper than refitting on every clock tick — and the undercut and
   * safety car panels need rivals' numbers, not just the selected driver's.
   */
  const models = useMemo(() => {
    if (!dataset) return null;
    const analyses = new Map<number, StintAnalysis[]>();
    for (const driver of dataset.drivers) {
      analyses.set(driver.driver_number, analyseDriverStints(dataset, driver.driver_number));
    }
    return {
      analyses,
      pitLoss: estimatePitLoss(dataset),
      // Not the highest lap in the data: timing continues past the flag. See raceDistance.
      totalLaps: raceDistance(dataset),
      isRace: dataset.session.session_type === 'Race',
    };
  }, [dataset]);

  const driverAnalysis = useMemo(() => {
    if (!dataset || !models || selectedDriver == null) return null;
    const driver = dataset.drivers.find((d) => d.driver_number === selectedDriver);
    if (!driver) return null;
    return {
      driver,
      analyses: models.analyses.get(selectedDriver) ?? [],
      pitLoss: models.pitLoss,
      totalLaps: models.totalLaps,
    };
  }, [dataset, models, selectedDriver]);

  /*
   * Pace comparison selection. Defaults to the chosen driver and their
   * team-mate, which is the comparison with the fewest confounds: same car,
   * same strategy window, usually the same tyres.
   */
  const [paceDrivers, setPaceDrivers] = useState<number[]>([]);
  const [paceFor, setPaceFor] = useState<number | null>(null);

  /*
   * Reset the selection when the user picks a different driver. Done during
   * render rather than in an effect — this is state derived from a prop, and an
   * effect would render the stale selection once before correcting it.
   */
  if (dataset && driverAnalysis && paceFor !== driverAnalysis.driver.driver_number) {
    const me = driverAnalysis.driver;
    const teamMate = dataset.drivers.find(
      (d) =>
        d.team_name != null && d.team_name === me.team_name && d.driver_number !== me.driver_number,
    );
    setPaceFor(me.driver_number);
    setPaceDrivers(teamMate ? [me.driver_number, teamMate.driver_number] : [me.driver_number]);
  }

  /*
   * A functional update, so two clicks batched into the same render both land,
   * and a stable identity, so the memo around the chart survives the clock.
   */
  const togglePaceDriver = useCallback((driverNumber: number) => {
    setPaceDrivers((current) => {
      if (current.includes(driverNumber)) return current.filter((n) => n !== driverNumber);
      if (current.length >= MAX_PACE_DRIVERS) return current;
      return [...current, driverNumber];
    });
  }, []);

  const pace = useMemo(() => {
    if (!dataset || paceDrivers.length === 0) return null;
    return buildPaceComparison(dataset, paceDrivers);
  }, [dataset, paceDrivers]);

  /* A fresh array every render would break the memo around the chart. */
  const paceDriverRows = useMemo(
    () => (dataset ? dataset.drivers.filter((d) => paceDrivers.includes(d.driver_number)) : []),
    [dataset, paceDrivers],
  );

  /*
   * Practice and qualifying analysis. Independent of the replay clock: a run is
   * a property of the whole session, not of a moment in it.
   */
  const practice = useMemo(() => {
    if (!dataset || !models || models.isRace || !driverAnalysis) return null;
    const driverNumbers = dataset.drivers.map((d) => d.driver_number);
    const ranked = theoreticalBestByDriver(dataset.laps, driverNumbers);

    return {
      best: theoreticalBestLap(
        dataset.laps.filter((lap) => lap.driver_number === driverAnalysis.driver.driver_number),
      ),
      runs: classifyRuns(dataset, driverAnalysis.driver.driver_number),
      leaderboard: ranked.flatMap((entry) => {
        const driver = dataset.drivers.find((d) => d.driver_number === entry.driverNumber);
        return driver ? [{ driver, best: entry.best }] : [];
      }),
    };
  }, [dataset, models, driverAnalysis]);

  /*
   * The strategy read follows the clock. Each piece is arithmetic over a handful
   * of laps, so recomputing per frame is cheap now that the fits are cached.
   */
  const strategy = useMemo(() => {
    // Pit windows and undercuts only mean something when drivers are racing.
    if (!dataset || !models || !models.isRace || !driverAnalysis || !view) return null;
    const me = driverAnalysis.driver.driver_number;
    const lap = currentLapNumber(dataset, me, timeMs);
    if (lap == null) return null;

    const current = stintAnalysisForLap(driverAnalysis.analyses, lap);
    if (!current) return null;

    const myAge = tyreAgeOnLap(current.stint, lap);
    const window = pitWindow({
      currentLap: lap,
      totalLaps: models.totalLaps,
      tyreAge: myAge,
      slope: current.slope,
      pitLoss: models.pitLoss.seconds,
    });

    /* Neighbours on track come straight from the timing order. */
    const index = view.rows.findIndex((row) => row.driver.driver_number === me);
    const aheadRow = index > 0 ? view.rows[index - 1] : undefined;
    const behindRow = index >= 0 ? view.rows[index + 1] : undefined;

    /*
     * Builds one undercut scenario: one car stops now, the other responds a lap
     * later. Both cars are anchored to their current measured pace via
     * currentPaceBase — see that function for why the fit intercept cannot be
     * used directly across stints.
     */
    const scenario = (
      rivalRow: typeof aheadRow,
      rivalIsAhead: boolean,
    ): UndercutScenario | null => {
      if (!rivalRow) return null;
      const rivalNumber = rivalRow.driver.driver_number;
      const rivalAnalyses = models.analyses.get(rivalNumber) ?? [];
      const rivalStint = stintAnalysisForLap(rivalAnalyses, lap);
      if (!rivalStint) return null;

      const rivalAge = tyreAgeOnLap(rivalStint.stint, lap);
      const mySlope = current.slope;
      const rivalSlope = rivalStint.slope;
      const myBase = currentPaceBase(current, myAge);
      const rivalBase = currentPaceBase(rivalStint, rivalAge);
      if (mySlope == null || rivalSlope == null || myBase == null || rivalBase == null) return null;

      // Gap is always measured from the car ahead to the car behind.
      const gap = rivalIsAhead
        ? (view.rows[index]?.interval.seconds ?? null)
        : (rivalRow.interval.seconds ?? null);
      if (gap == null) return null;

      const horizon = Math.min(models.totalLaps, lap + 15);

      const me_ = {
        label: driverAnalysis.driver.name_acronym,
        baseLapTime: myBase,
        slope: mySlope,
        tyreAge: myAge,
      };
      const them = {
        label: rivalRow.driver.name_acronym,
        baseLapTime: rivalBase,
        slope: rivalSlope,
        tyreAge: rivalAge,
      };

      // The car behind is the one that launches the undercut.
      const result = rivalIsAhead
        ? undercutSimulation({
            startLap: lap,
            endLap: horizon,
            pitLoss: models.pitLoss.seconds,
            a: { ...them, startDeficit: 0, pitLap: lap + 1 },
            b: { ...me_, startDeficit: gap, pitLap: lap },
          })
        : undercutSimulation({
            startLap: lap,
            endLap: horizon,
            pitLoss: models.pitLoss.seconds,
            a: { ...me_, startDeficit: 0, pitLap: lap + 1 },
            b: { ...them, startDeficit: gap, pitLap: lap },
          });

      return {
        rival: rivalRow.driver.name_acronym,
        gap,
        result,
        youAhead: result.aheadAtEnd === driverAnalysis.driver.name_acronym,
      };
    };

    const caution = safetyCarOpportunity({
      status: view.status,
      pitLoss: models.pitLoss.seconds,
      currentLap: lap,
      totalLaps: models.totalLaps,
      drivers: view.rows.flatMap((row) => {
        const rowLap = row.lapNumber;
        if (rowLap == null) return [];
        const stint = stintAnalysisForLap(
          models.analyses.get(row.driver.driver_number) ?? [],
          rowLap,
        );
        if (!stint) return [];
        return [
          {
            driverNumber: row.driver.driver_number,
            label: row.driver.name_acronym,
            tyreAge: tyreAgeOnLap(stint.stint, rowLap),
            slope: stint.slope,
            pitCount: row.pitCount,
            position: row.position,
          },
        ];
      }),
    });

    return {
      window,
      ahead: scenario(aheadRow, true),
      behind: scenario(behindRow, false),
      caution,
    };
  }, [dataset, models, driverAnalysis, view, timeMs]);

  /*
   * The Simple view: everything a newcomer sees above the detail panels. Computed
   * only in that mode, so Engineer pays nothing for it. Per-driver pit verdicts are
   * arithmetic over the fits already cached in `models`, cheap enough per frame.
   */
  const simple = useMemo(() => {
    if (viewMode !== 'simple' || !dataset || !models || !view) return null;
    const { isRace } = models;

    const sessionBestLap = view.rows.reduce<number | null>(
      (best, row) =>
        row.bestLap == null ? best : best == null ? row.bestLap : Math.min(best, row.bestLap),
      null,
    );
    // The feed is newest first; investigations are opened and closed in order.
    const investigated = new Set(openInvestigations([...view.messages].reverse()));
    const battles = keyBattles(dataset, view.rows, timeMs);
    const acronym = new Map(dataset.drivers.map((d) => [d.driver_number, d.name_acronym]));

    const cards = view.rows.map((row, index) => {
      const lap = row.lapNumber;
      const stint =
        lap == null
          ? undefined
          : stintAnalysisForLap(models.analyses.get(row.driver.driver_number) ?? [], lap);
      const pitVerdict =
        isRace && lap != null && stint && row.tyre.age != null
          ? pitWindow({
              currentLap: lap,
              totalLaps: models.totalLaps,
              tyreAge: row.tyre.age,
              slope: stint.slope,
              pitLoss: models.pitLoss.seconds,
            }).verdict
          : null;

      return {
        row,
        statusLine: driverStatusLine(row, { isRace, sessionBestLap }),
        badges: driverBadges({
          row,
          behind: view.rows[index + 1],
          isRace,
          status: view.status,
          sessionBestLap,
          underInvestigation: investigated.has(row.driver.driver_number),
          pitVerdict,
          slope: stint?.slope ?? null,
        }),
      };
    });

    return {
      cards,
      battles,
      rightNow: rightNow({
        rows: view.rows,
        status: view.status,
        weather: view.weather,
        lap: view.lap,
        totalLaps: models.totalLaps,
        isRace,
        inPitLane: driversInPitLane(dataset, timeMs).map((n) => acronym.get(n) ?? String(n)),
        battles,
      }),
      progress: lapProgress(view.lap, models.totalLaps, isRace),
      flag: flagChip(view.status),
      weather: weatherInWords(view.weather),
    };
  }, [viewMode, dataset, models, view, timeMs]);

  /*
   * Prediction cards, Simple view only. Each rebuild refits every driver's stints
   * on a snapshot, too much for every animation frame, so the clock is read in
   * PREDICTION_STEP_MS steps: a replay at 16x still refreshes several times a lap.
   */
  const [rivalDriver, setRivalDriver] = useState<number | null>(null);
  const predictionMs = Math.floor(timeMs / PREDICTION_STEP_MS) * PREDICTION_STEP_MS;
  const predictions = useMemo(() => {
    if (viewMode !== 'simple' || !dataset) return null;
    return buildPredictions({
      dataset,
      timeMs: predictionMs,
      selectedDriver,
      rivalDriver,
      calibration: CALIBRATION,
    });
  }, [viewMode, dataset, predictionMs, selectedDriver, rivalDriver]);

  /* Chart captions depend on the selection, not the clock. */
  const captions = useMemo(() => {
    if (viewMode !== 'simple' || !dataset) return null;
    return {
      lapChart: driverAnalysis ? lapChartCaption(driverAnalysis.analyses) : null,
      pace: pace
        ? paceCaption(
            pace.summaries,
            (n) => dataset.drivers.find((d) => d.driver_number === n)?.name_acronym ?? String(n),
          )
        : null,
    };
  }, [viewMode, dataset, driverAnalysis, pace]);

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
    /*
     * Live mode has nothing to show a percentage of — it is waiting on a session to
     * start, not on a download — so it supplies its own waiting screen.
     */
    if (waiting !== undefined) return <>{waiting}</>;

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
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <ViewModeToggle />
          <Link href="/" className="text-accent text-xs hover:underline">
            {strings.load.backToPicker}
          </Link>
        </div>
      </header>

      {statusBar}

      <ReplayControls
        startMs={dataset.startMs}
        endMs={dataset.endMs}
        lap={view.lap}
        trackStatus={view.status}
      />
      {simple ? (
        <>
          <RightNowBanner kind={simple.rightNow.kind} sentence={simple.rightNow.sentence} />
          <RaceStoryStrip progress={simple.progress} flag={simple.flag} weather={simple.weather} />
        </>
      ) : (
        <WeatherStrip weather={view.weather} />
      )}

      <div className="flex flex-1 flex-col lg:flex-row">
        <section className="min-w-0 flex-1">
          {simple ? (
            <>
              <DriverCards
                cards={simple.cards}
                selectedDriver={selectedDriver}
                onSelectDriver={selectDriver}
              />
              {/* Outside a race the order is by best lap, so nobody is fighting anybody. */}
              {models?.isRace && <KeyBattles battles={simple.battles} />}
              {predictions && (
                <Predictions
                  predictions={predictions}
                  drivers={dataset.drivers}
                  onSelectRival={setRivalDriver}
                />
              )}
            </>
          ) : (
            <TimingTable
              rows={view.rows}
              selectedDriver={selectedDriver}
              onSelectDriver={selectDriver}
            />
          )}

          {driverAnalysis ? (
            <>
              {practice && (
                <PracticePanel
                  driver={driverAnalysis.driver}
                  best={practice.best}
                  runs={practice.runs}
                  leaderboard={practice.leaderboard}
                />
              )}

              {models?.isRace &&
                (strategy ? (
                  <StrategyPanel
                    window={strategy.window}
                    pitLoss={driverAnalysis.pitLoss}
                    undercut={<UndercutPanel ahead={strategy.ahead} behind={strategy.behind} />}
                    safetyCar={<SafetyCarPanel opportunity={strategy.caution} />}
                  />
                ) : (
                  /* Before the driver's first lap there is no tyre age to reason from. */
                  <p className="border-border text-muted border-t px-4 py-4 text-xs">
                    {strings.strategy.notStarted}
                  </p>
                ))}
              <DriverPanel
                driver={driverAnalysis.driver}
                analyses={driverAnalysis.analyses}
                caption={captions?.lapChart}
              />
              <TelemetryPanel
                dataset={dataset}
                driver={driverAnalysis.driver}
                showCaption={simple != null}
              />

              {pace && (
                <PaceComparison
                  caption={captions?.pace}
                  comparison={pace}
                  drivers={paceDriverRows}
                  allDrivers={dataset.drivers}
                  selected={paceDrivers}
                  onToggle={togglePaceDriver}
                />
              )}
            </>
          ) : (
            <p className="border-border text-muted border-t px-4 py-6 text-sm">
              {simple ? strings.simple.cards.tapHint : strings.driver.selectPrompt}
            </p>
          )}
        </section>
        <aside className="border-border w-full border-t lg:max-h-[calc(100vh-160px)] lg:w-80 lg:border-t-0 lg:border-l">
          <RaceControlFeed messages={view.messages} sessionStartMs={dataset.startMs} />
        </aside>
      </div>

      {simple && <Onboarding />}
    </main>
  );
}
