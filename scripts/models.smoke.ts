/**
 * Strategy models checked against the real 2025 Italian GP (Monza).
 *
 * Unit tests prove the maths on synthetic data. This proves the models produce
 * *physically believable* numbers on a real race, which is a different question
 * and the one that caught three genuine bugs during development:
 *   - every stint fitting a negative slope, because fuel burn was uncorrected
 *   - the race leader's laps all discarded as "traffic", because an interval of
 *     0 means "no car ahead" rather than "nose to tail"
 *   - three-lap stints reporting slopes of 11 s/lap with high-ish confidence
 *
 * Network-bound. Run with `pnpm smoke`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SessionDataset } from '@/lib/openf1/dataset';
import { loadSession } from '@/lib/openf1/loader';
import { cautionPeriods } from '@/lib/models/caution';
import { estimatePitLoss } from '@/lib/models/pit-loss';
import { pitWindow } from '@/lib/models/pit-window';
import {
  analyseDriverStints,
  analyseStint,
  currentPace,
  currentPaceBase,
  stintAnalysisForLap,
} from '@/lib/models/stint-analysis';
import { undercutSimulation } from '@/lib/models/undercut';
import { tyreAgeOnLap } from '@/lib/replay/selectors';
import type { StintAnalysis } from '@/lib/models/stint-analysis';

const MONZA_2025_RACE = 9912;
/** Max Verstappen, who won this race from pole. */
const VER = 1;

let dataset: SessionDataset;
let analyses: StintAnalysis[];

beforeAll(async () => {
  dataset = await loadSession(MONZA_2025_RACE);
  const periods = cautionPeriods(dataset.raceControl);
  analyses = dataset.stints.map((stint) =>
    analyseStint(dataset, stint.driver_number, stint, { periods }),
  );
}, 180_000);

describe('pit loss', () => {
  it('uses the circuit table for Monza and reports the measured lane time', () => {
    const estimate = estimatePitLoss(dataset);
    expect(estimate.source).toBe('circuit-table');
    expect(estimate.seconds).toBe(21);

    // Measured pit-lane transit should be in the same neighbourhood as the
    // assumption, and the stationary time far shorter than it.
    expect(estimate.observedLaneDuration).toBeGreaterThan(18);
    expect(estimate.observedLaneDuration).toBeLessThan(32);
    expect(estimate.observedStopDuration).toBeGreaterThan(1.5);
    expect(estimate.observedStopDuration).toBeLessThan(6);
    expect(estimate.observedStopDuration!).toBeLessThan(estimate.observedLaneDuration!);
  });
});

describe('tyre degradation on a real race', () => {
  it('finds a believable slope for the winner’s opening stint', () => {
    const first = analyseDriverStints(dataset, VER)[0]!;

    expect(first.stint.compound).toBe('MEDIUM');
    expect(first.degradation.confidence).toBe('high');
    // Monza is a low-degradation circuit: a few hundredths per lap.
    expect(first.slope!).toBeGreaterThan(0.01);
    expect(first.slope!).toBeLessThan(0.1);
    // A long stint in clear air should fit tightly.
    expect(first.degradation.rSquared!).toBeGreaterThan(0.5);
    expect(first.degradation.residualStdDev!).toBeLessThan(0.5);
  });

  it('keeps the leader’s laps instead of calling clear air traffic', () => {
    const first = analyseDriverStints(dataset, VER)[0]!;
    const traffic = first.samples.filter((s) => s.excluded === 'traffic').length;

    // He led almost the whole stint, so only a handful of laps are dirty air.
    expect(first.degradation.cleanLaps).toBeGreaterThan(25);
    expect(traffic).toBeLessThan(10);
    expect(first.relaxedTrafficFilter).toBe(false);
  });

  it('reports positive degradation for most race stints', () => {
    const trusted = analyses.filter((a) => a.slope != null && a.degradation.cleanLaps >= 10);
    expect(trusted.length).toBeGreaterThan(15);

    // Without the fuel correction every one of these came out negative.
    const positive = trusted.filter((a) => a.slope! > 0);
    expect(positive.length / trusted.length).toBeGreaterThan(0.7);
  });

  it('never reports an absurd slope as trustworthy', () => {
    for (const analysis of analyses) {
      if (analysis.slope == null) continue;
      // Anything beyond a quarter-second per lap of tyre age at Monza is a
      // broken fit, not degradation.
      expect(Math.abs(analysis.slope)).toBeLessThan(0.25);
    }
  });

  it('grades tiny or wildly scattered stints as unusable', () => {
    const tiny = analyses.filter((a) => a.degradation.cleanLaps < 3);
    expect(tiny.length).toBeGreaterThan(0);
    for (const analysis of tiny) {
      expect(analysis.degradation.confidence).toBe('none');
      expect(analysis.slope).toBeNull();
    }
  });

  it('excludes the pit-out lap of every stint that follows a stop', () => {
    const later = analyses.filter((a) => a.stint.stint_number > 1 && a.samples.length > 1);
    expect(later.length).toBeGreaterThan(10);
    for (const analysis of later) {
      expect(analysis.samples[0]!.excluded).toBe('pit-out');
    }
  });
});

describe('undercut on a real race', () => {
  /*
   * The situation that exposed the fuel-anchoring bug: on lap 45 Verstappen was
   * 6.45s behind Piastri, on an 8-lap-old hard against Piastri's 45-lap-old
   * medium. Using the fits' raw intercepts projected Verstappen 16s CLEAR after
   * both stopped, which is impossible from 6.45s down over eight laps.
   */
  const LAP = 45;
  const PIA = 81;

  function carAt(driverNumber: number) {
    const analyses = analyseDriverStints(dataset, driverNumber);
    const stint = stintAnalysisForLap(analyses, LAP);
    if (!stint) return null;
    const age = tyreAgeOnLap(stint.stint, LAP);
    return { stint, age, base: currentPaceBase(stint, age), pace: currentPace(stint, age) };
  }

  it('anchors both cars to a believable current lap time', () => {
    const ver = carAt(VER)!;
    const pia = carAt(PIA)!;

    // Both should be doing something close to a real Monza race lap.
    for (const car of [ver, pia]) {
      expect(car.pace).toBeGreaterThan(78);
      expect(car.pace).toBeLessThan(95);
    }

    /*
     * The raw intercepts differ by far more than the cars' actual pace does,
     * purely because of where each stint sits in the race. This is the trap.
     */
    const interceptGap = Math.abs(
      ver.stint.degradation.intercept! - pia.stint.degradation.intercept!,
    );
    const paceGap = Math.abs(ver.pace! - pia.pace!);
    expect(paceGap).toBeLessThan(interceptGap);
    expect(paceGap).toBeLessThan(3);
  });

  it('does not turn a 6s deficit into a 16s lead', () => {
    const ver = carAt(VER)!;
    const pia = carAt(PIA)!;
    const gap = 6.452; // measured interval from the timing feed at this moment

    const result = undercutSimulation({
      startLap: LAP,
      endLap: Math.min(53, LAP + 8),
      pitLoss: estimatePitLoss(dataset).seconds,
      a: {
        label: 'PIA',
        startDeficit: 0,
        baseLapTime: pia.base!,
        slope: pia.stint.slope!,
        tyreAge: pia.age,
        pitLap: LAP + 1,
      },
      b: {
        label: 'VER',
        startDeficit: gap,
        baseLapTime: ver.base!,
        slope: ver.stint.slope!,
        tyreAge: ver.age,
        pitLap: LAP,
      },
    });

    /*
     * Verstappen genuinely gains here — Piastri is on a 45-lap-old medium — but
     * the swing over eight laps has to stay in the realm of physics. The old
     * intercept-based version produced 16s.
     */
    expect(result.marginSeconds).toBeLessThan(12);
  });
});

describe('pit window on a real race', () => {
  it('opens a sensible window for the winner at the end of his first stint', () => {
    const first = analyseDriverStints(dataset, VER)[0]!;
    const pitLoss = estimatePitLoss(dataset).seconds;
    const stopLap = first.stint.lap_end;

    const result = pitWindow({
      currentLap: stopLap,
      totalLaps: 53,
      tyreAge: stopLap - first.stint.lap_start + 1,
      slope: first.slope,
      pitLoss,
    });

    // A ~37-lap-old medium losing ~0.04s per lap of age gives well over a second
    // a lap, which repays a 21s stop inside the laps that remain.
    expect(result.perLapDeficit!).toBeGreaterThan(0.5);
    expect(result.breakEvenLaps!).toBeLessThan(stopLap);
    expect(result.verdict).toBe('pit-now');
    expect(result.window).not.toBeNull();

    // He actually stopped on this lap, so the model should agree it was due.
    expect(result.window!.latest).toBeGreaterThanOrEqual(stopLap);
  });

  it('tells a driver on fresh tyres to stay out', () => {
    const first = analyseDriverStints(dataset, VER)[0]!;
    const result = pitWindow({
      currentLap: 3,
      totalLaps: 53,
      tyreAge: 3,
      slope: first.slope,
      pitLoss: estimatePitLoss(dataset).seconds,
    });
    expect(['window-approaching', 'stay-out']).toContain(result.verdict);
    expect(result.window).toBeNull();
  });
});
