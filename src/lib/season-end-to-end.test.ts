/**
 * One 2025 race and one 2026 race, end to end, through everything the session page
 * computes: timing, battles, badges, the Right now sentence and every prediction.
 *
 * The 2026 regulations must not break replays of the seasons before them, and a 2026
 * session must never be described with the old rule book. Both races are Monza, a
 * year apart, so the circuit is not what differs.
 */
import { describe, expect, it } from 'vitest';
import { badgeLabel, driverBadges } from '@/lib/explain/driver-card';
import { rightNow } from '@/lib/explain/right-now';
import { buildPredictions } from '@/lib/models/predict/assemble';
import { calibrationFor } from '@/lib/models/predict/calibration';
import { loadFixture, type FixtureName } from '@/lib/models/predict/fixtures';
import { raceDistance } from '@/lib/models/race-distance';
import { driversInPitLane, keyBattles } from '@/lib/replay/battles';
import { overtakeModeEnabledAt } from '@/lib/replay/overtake-mode';
import { leaderLapAt, timingTableAt, trackStatusAt, weatherAt } from '@/lib/replay/selectors';
import { regulationsFor, type Regulations } from '@/lib/season';

function leaderLapStart(name: FixtureName, lap: number): number {
  const laps = loadFixture(name).laps.filter((l) => l.lap_number === lap && l.date_start);
  return Math.min(...laps.map((l) => Date.parse(l.date_start!)));
}

const CASES: { name: FixtureName; year: number; regulations: Regulations; lap: number }[] = [
  { name: 'monza-2025-race', year: 2025, regulations: 'drs', lap: 30 },
  // Lap 30 of the 2026 race is after race control switched Overtake Mode back on at 13:46.
  { name: 'monza-2026-race', year: 2026, regulations: 'overtake-mode', lap: 30 },
];

for (const { name, year, regulations, lap } of CASES) {
  describe(`${name} end to end`, () => {
    const dataset = loadFixture(name);
    const timeMs = leaderLapStart(name, lap);

    it('is read under the right rule book', () => {
      expect(dataset.session.year).toBe(year);
      expect(regulationsFor(dataset.session.year)).toBe(regulations);
    });

    it('builds the timing screen, battles, badges and Right now', { timeout: 60_000 }, () => {
      const rows = timingTableAt(dataset, timeMs);
      expect(rows.length).toBeGreaterThanOrEqual(18);
      // At the leader's start of lap 30, 29 laps are complete.
      expect(leaderLapAt(dataset, timeMs)).toBe(lap - 1);

      const status = trackStatusAt(dataset, timeMs);
      const battles = keyBattles(dataset, rows, timeMs);
      const badges = rows.map((row, index) =>
        driverBadges({
          row,
          behind: rows[index + 1],
          isRace: true,
          status,
          sessionBestLap: null,
          underInvestigation: false,
          pitVerdict: null,
          slope: null,
        }),
      );
      const labels = badges.flat().map((kind) => badgeLabel(kind, regulations));

      const sentence = rightNow({
        rows,
        status,
        weather: weatherAt(dataset, timeMs),
        lap: leaderLapAt(dataset, timeMs),
        totalLaps: raceDistance(dataset),
        isRace: true,
        inPitLane: driversInPitLane(dataset, timeMs).map(String),
        battles,
        regulations,
      }).sentence;
      expect(sentence.length).toBeGreaterThan(10);

      const words = [sentence, ...labels].join(' ');
      if (regulations === 'overtake-mode') expect(words).not.toMatch(/DRS/);
      else expect(words).not.toMatch(/Overtake Mode|OM range/);
    });

    it('builds every prediction card', { timeout: 120_000 }, () => {
      const rows = timingTableAt(dataset, timeMs);
      const p = buildPredictions({
        dataset,
        timeMs,
        selectedDriver: rows[3]!.driver.driver_number,
        rivalDriver: null,
        calibration: calibrationFor(year),
      });
      if (p.kind !== 'race') throw new Error('expected race predictions');

      expect(p.regulations).toBe(regulations);
      // Each era gets only its own coefficients: 2026 has the two Overtake Mode features.
      expect(calibrationFor(year).overtake.featureNames).toHaveLength(
        regulations === 'overtake-mode' ? 6 : 4,
      );
      expect(p.totalLaps).toBe(raceDistance(dataset));
      expect(p.tyres.compounds.some((c) => c.enough)).toBe(true);
      expect(p.driver?.label).toBe(rows[3]!.driver.name_acronym);

      if (regulations === 'overtake-mode') {
        expect(overtakeModeEnabledAt(dataset.raceControl, timeMs)).toBe(true);
        for (const battle of p.battles) expect(battle.overtakeModeNextLap).not.toBeNull();
      } else {
        for (const battle of p.battles) expect(battle.overtakeModeNextLap).toBeNull();
      }
    });
  });
}
