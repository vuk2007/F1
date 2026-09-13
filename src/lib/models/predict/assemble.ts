/**
 * Everything the prediction cards show, for one moment in a session.
 *
 * The UI renders these outputs and computes nothing: every number on a card comes
 * from here, built from a snapshot at `timeMs` so a replay can never show a
 * prediction that already knows the answer.
 */
import type { SessionDataset } from '@/lib/openf1/dataset';
import { overtakeModeEnabledAt, overtakeModeNextLap } from '@/lib/replay/overtake-mode';
import { trackStatusAt } from '@/lib/replay/selectors';
import { toTimed, valueAt } from '@/lib/replay/timeline';
import { regulationsFor, type Regulations } from '@/lib/season';
import { raceDistance } from '../race-distance';
import { battleForecast, type BattleForecast, type CarPace } from './battle-forecast';
import { cheapStop, type CheapStop } from './cheap-stop';
import { IntervalLookup } from './clean-laps';
import type { Confidence } from './confidence';
import type { LogisticModel } from './logistic';
import { compoundStep, overtakeChance } from './overtake';
import {
  livePitLoss,
  pitForecast,
  rejoinIfPitNow,
  type LivePitLoss,
  type PitForecast,
  type Rejoin,
} from './pit-forecast';
import {
  practiceDegradation,
  predictQ3Cutoff,
  theoreticalVsActual,
  type PracticeCompoundDegradation,
  type Q3Calibration,
  type Q3CutoffForecast,
  type TheoreticalVsActual,
} from './practice-forecast';
import { currentLapOf, snapshotAt } from './snapshot';
import { currentStintFit, type StintFit } from './stint-fit';
import { strategyBattle, type StrategyBattle, type StrategyCar } from './strategy-battle';
import { tyreLife, type TyreLife } from './tyre-life';
import { fitField, tyrePerformance, type TyrePerformance } from './tyre-performance';

export interface Calibration {
  overtake: LogisticModel;
  q3: Q3Calibration;
}

export interface BattlePrediction {
  aheadNumber: number;
  chaserNumber: number;
  aheadLabel: string;
  chaserLabel: string;
  position: number;
  gap: number;
  forecast: BattleForecast;
  overtake: { probability: number | null; confidence: Confidence; enough: boolean };
  /**
   * 2026 only: whether the chaser has Overtake Mode next lap, from the gap now and
   * race control's switch. Null before 2026, or when race control has not said.
   */
  overtakeModeNextLap: boolean | null;
}

export interface DriverPredictions {
  driverNumber: number;
  label: string;
  life: TyreLife | null;
  pit: PitForecast | null;
  rejoin: Rejoin | null;
  rivalNumber: number | null;
  strategy: StrategyBattle | null;
}

export interface RacePredictions {
  kind: 'race';
  /** DRS up to 2025, Overtake Mode from 2026: decides what the cards call the aid. */
  regulations: Regulations;
  lap: number | null;
  totalLaps: number;
  pitLoss: LivePitLoss;
  tyres: TyrePerformance;
  battles: BattlePrediction[];
  cheapStop: CheapStop;
  driver: DriverPredictions | null;
}

export interface PracticePredictions {
  kind: 'practice';
  regulations: Regulations;
  degradation: PracticeCompoundDegradation[];
  /** Only in practice 3, where the forecast is meant to be read. */
  q3: Q3CutoffForecast | null;
  theoretical: TheoreticalVsActual[];
}

export const MAX_BATTLES = 3;
const BATTLE_GAP_S = 3;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function pace(fit: StintFit | undefined): CarPace | null {
  if (!fit || fit.slope == null || fit.intercept == null) return null;
  return {
    intercept: fit.intercept,
    slope: fit.slope,
    tyreAge: fit.tyreAge,
    confidence: fit.confidence,
  };
}

export function buildPredictions(input: {
  dataset: SessionDataset;
  timeMs: number;
  selectedDriver: number | null;
  rivalDriver: number | null;
  calibration: Calibration;
}): RacePredictions | PracticePredictions {
  const { dataset, timeMs, selectedDriver, rivalDriver, calibration } = input;
  const snapshot = snapshotAt(dataset, timeMs);
  const regulations = regulationsFor(dataset.session.year);
  const label = (n: number) =>
    dataset.drivers.find((d) => d.driver_number === n)?.name_acronym ?? String(n);

  if (dataset.session.session_type !== 'Race') {
    return {
      kind: 'practice',
      regulations,
      degradation: practiceDegradation(snapshot),
      q3:
        dataset.session.session_name === 'Practice 3'
          ? predictQ3Cutoff(snapshot, calibration.q3)
          : null,
      theoretical: theoreticalVsActual(snapshot).slice(0, 10),
    };
  }

  const totalLaps = raceDistance(dataset);
  const fits = fitField(snapshot);
  const fitFor = (n: number) => currentStintFit(fits.filter((f) => f.driverNumber === n));
  const lap = snapshot.stints.reduce<number | null>(
    (max, s) => (max == null ? s.lap_end : Math.max(max, s.lap_end)),
    null,
  );
  const pitLoss = livePitLoss(snapshot);
  const intervals = new IntervalLookup(snapshot.intervals);
  const overtakeModeOn =
    regulations === 'overtake-mode' ? overtakeModeEnabledAt(snapshot.raceControl, timeMs) : null;

  const positionSeries = new Map(
    dataset.drivers.map((d) => [
      d.driver_number,
      toTimed(
        snapshot.positions.filter((p) => p.driver_number === d.driver_number),
        (p) => p.date,
      ),
    ]),
  );
  const order = dataset.drivers
    .map((d) => ({
      driver: d.driver_number,
      position: valueAt(positionSeries.get(d.driver_number) ?? [], timeMs)?.position ?? null,
    }))
    .filter((d): d is { driver: number; position: number } => d.position != null)
    .sort((a, b) => a.position - b.position);

  const gaps = dataset.drivers.map((d) => ({
    driverNumber: d.driver_number,
    gapToLeader: intervals.gapToLeaderAt(d.driver_number, timeMs),
  }));
  const stopsMade = (n: number) => snapshot.pits.filter((p) => p.driver_number === n).length;

  /*
   * Overtake features are built exactly as `overtakeSamples` built the rows the
   * weights were fitted on — same laps, same tyre age — or the weights mean nothing.
   */
  const lapTimes = new Map<string, number>();
  for (const l of snapshot.laps) {
    if (l.lap_duration != null && !l.is_pit_out_lap)
      lapTimes.set(`${l.driver_number}:${l.lap_number}`, l.lap_duration);
  }
  const recentPace = (n: number, onLap: number) =>
    median(
      [1, 2, 3].map((k) => lapTimes.get(`${n}:${onLap - k}`)).filter((t): t is number => t != null),
    );
  const stintOn = (n: number, onLap: number) =>
    snapshot.stints.find(
      (s) => s.driver_number === n && onLap >= s.lap_start && onLap <= s.lap_end,
    );
  const lapStart = (n: number, lapNumber: number) => {
    const found = dataset.laps.find((l) => l.driver_number === n && l.lap_number === lapNumber);
    return found?.date_start ? Date.parse(found.date_start) : null;
  };

  const battles: BattlePrediction[] = [];
  for (let i = 1; i < order.length; i += 1) {
    const ahead = order[i - 1]!;
    const chaser = order[i]!;
    const gap = intervals.intervalAt(chaser.driver, timeMs);
    if (gap == null || gap > BATTLE_GAP_S) continue;

    const chaserFit = fitFor(chaser.driver);
    const aheadFit = fitFor(ahead.driver);
    const earlierStart = chaserFit ? lapStart(chaser.driver, chaserFit.lapEnd - 2) : null;
    const earlier =
      earlierStart == null || earlierStart > timeMs
        ? null
        : intervals.intervalAt(chaser.driver, earlierStart);

    const forecast = battleForecast({
      gap,
      gapChange: earlier == null ? null : gap - earlier,
      ahead: pace(aheadFit),
      chaser: pace(chaserFit),
      lapsRemaining: Math.max(0, totalLaps - (lap ?? 0)),
    });

    const onLap = currentLapOf(snapshot, chaser.driver);
    const aheadStint = onLap == null ? undefined : stintOn(ahead.driver, onLap);
    const chaserStint = onLap == null ? undefined : stintOn(chaser.driver, onLap);
    const aheadPace = onLap == null ? null : recentPace(ahead.driver, onLap);
    const chaserPace = onLap == null ? null : recentPace(chaser.driver, onLap);
    const aheadStep = compoundStep(aheadStint?.compound);
    const chaserStep = compoundStep(chaserStint?.compound);
    const age = (stint: NonNullable<typeof aheadStint>) =>
      (stint.tyre_age_at_start ?? 0) + (onLap! - stint.lap_start);

    battles.push({
      aheadNumber: ahead.driver,
      chaserNumber: chaser.driver,
      aheadLabel: label(ahead.driver),
      chaserLabel: label(chaser.driver),
      position: ahead.position,
      gap,
      forecast,
      overtake:
        aheadPace != null &&
        chaserPace != null &&
        aheadStep != null &&
        chaserStep != null &&
        aheadStint &&
        chaserStint
          ? {
              probability: overtakeChance(
                {
                  gap,
                  paceDelta: Number((aheadPace - chaserPace).toFixed(3)),
                  tyreAgeDelta: age(aheadStint) - age(chaserStint),
                  compoundDelta: aheadStep - chaserStep,
                },
                calibration.overtake,
              ),
              // A formula fitted on thousands of fights, applied to one: never more than medium.
              confidence: 'medium',
              enough: true,
            }
          : { probability: null, confidence: 'low', enough: false },
      overtakeModeNextLap:
        regulations === 'overtake-mode' ? overtakeModeNextLap(gap, overtakeModeOn) : null,
    });
  }
  battles.sort((a, b) => a.gap - b.gap);

  const status = trackStatusAt(dataset, timeMs);
  const cheap = cheapStop({
    status,
    pitLoss: pitLoss.seconds,
    drivers: dataset.drivers.map((d) => ({
      driverNumber: d.driver_number,
      label: d.name_acronym,
      gapToLeader: intervals.gapToLeaderAt(d.driver_number, timeMs),
      position: valueAt(positionSeries.get(d.driver_number) ?? [], timeMs)?.position ?? null,
      stopsMade: stopsMade(d.driver_number),
      compoundsUsed: new Set(
        snapshot.stints.filter((s) => s.driver_number === d.driver_number).map((s) => s.compound),
      ).size,
    })),
  });

  let driver: DriverPredictions | null = null;
  if (selectedDriver != null) {
    const fit = fitFor(selectedDriver);
    const index = order.findIndex((o) => o.driver === selectedDriver);
    const defaultRival =
      index > 0 ? order[index - 1]!.driver : index === 0 ? (order[1]?.driver ?? null) : null;
    const rivalNumber =
      rivalDriver != null && rivalDriver !== selectedDriver ? rivalDriver : defaultRival;

    const strategyCar = (n: number): StrategyCar | null => {
      const f = fitFor(n);
      const gap = intervals.gapToLeaderAt(n, timeMs);
      if (!f || f.slope == null || f.intercept == null || gap == null) return null;
      return {
        driverNumber: n,
        label: label(n),
        currentLap: f.lapEnd,
        tyreAge: f.tyreAge,
        compound: f.compound,
        intercept: f.intercept,
        slope: f.slope,
        fuelEffectPerLap: f.fuelEffectPerLap,
        stopsMade: stopsMade(n),
        gapToLeader: gap,
        stintsSoFar: snapshot.stints
          .filter((s) => s.driver_number === n)
          .sort((a, b) => a.stint_number - b.stint_number)
          .map((s) => ({ compound: s.compound, lapStart: s.lap_start, lapEnd: s.lap_end })),
        confidence: f.confidence,
      };
    };
    const me = strategyCar(selectedDriver);
    const rival = rivalNumber == null ? null : strategyCar(rivalNumber);

    driver = {
      driverNumber: selectedDriver,
      label: label(selectedDriver),
      life: fit
        ? tyreLife({ stint: fit, currentLap: fit.lapEnd, totalLaps, pitLoss: pitLoss.seconds })
        : null,
      pit:
        fit?.slope != null
          ? pitForecast({
              currentLap: fit.lapEnd,
              totalLaps,
              tyreAge: fit.tyreAge,
              slope: fit.slope,
              pitLoss: pitLoss.seconds,
              stopsMade: stopsMade(selectedDriver),
              cleanLaps: fit.cleanLaps,
              confidence: fit.confidence,
            })
          : fit
            ? { plan: null, next: null, confidence: 'low', enough: false }
            : null,
      rejoin: rejoinIfPitNow(gaps, selectedDriver, pitLoss.seconds),
      rivalNumber,
      strategy:
        me && rival ? strategyBattle(me, rival, { totalLaps, pitLoss: pitLoss.seconds }) : null,
    };
  }

  return {
    kind: 'race',
    regulations,
    lap,
    totalLaps,
    pitLoss,
    tyres: tyrePerformance(snapshot, fits),
    battles: battles.slice(0, MAX_BATTLES),
    cheapStop: cheap,
    driver,
  };
}
