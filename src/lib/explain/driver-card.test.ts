import { describe, expect, it } from 'vitest';
import {
  badgeLabel,
  badgeTerm,
  driverBadges,
  driverStatusLine,
  type BadgeContext,
} from './driver-card';
import { makeRow } from './rows.fixture';

describe('driverStatusLine', () => {
  const race = { isRace: true, sessionBestLap: null };

  it('says how far behind and on what tyres, in the words of the brief', () => {
    const row = makeRow('NOR', 2, { interval: 2.08, compound: 'MEDIUM', age: 14 });
    expect(driverStatusLine(row, race)).toBe('2.1 s behind, on 14-lap-old mediums');
  });

  it('calls the leader the leader', () => {
    const row = makeRow('VER', 1, { interval: 0, compound: 'HARD', age: 22 });
    expect(driverStatusLine(row, race)).toBe('Leading, on 22-lap-old hards');
  });

  it('says laps down rather than a time for a lapped car', () => {
    const row = makeRow('STR', 18, {
      interval: 1.5,
      gapToLeader: '+1 LAP',
      compound: 'SOFT',
      age: 5,
    });
    expect(driverStatusLine(row, race)).toBe('1 lap down, on 5-lap-old softs');
  });

  it('notices a driver who has just stopped', () => {
    const row = makeRow('HAM', 7, { interval: 3.4, compound: 'HARD', age: 1, pitCount: 1 });
    expect(driverStatusLine(row, race)).toBe('3.4 s behind, just pitted for new hards');
  });

  it('calls a set new before the first stop too', () => {
    const row = makeRow('HAM', 7, { interval: 3.4, compound: 'SOFT', age: 1, pitCount: 0 });
    expect(driverStatusLine(row, race)).toBe('3.4 s behind, on new softs');
  });

  it('measures against the fastest lap outside a race', () => {
    const quali = { isRace: false, sessionBestLap: 78.792 };
    expect(
      driverStatusLine(makeRow('VER', 1, { bestLap: 78.792, compound: 'SOFT', age: 3 }), quali),
    ).toBe('Fastest so far, on 3-lap-old softs');
    expect(
      driverStatusLine(makeRow('NOR', 2, { bestLap: 78.869, compound: 'SOFT', age: 2 }), quali),
    ).toBe('0.077 s off the fastest, on 2-lap-old softs');
  });

  it('waits for a driver who has not started', () => {
    expect(driverStatusLine(makeRow('BEA', null, { lapNumber: null }), race)).toBe(
      'Waiting to start',
    );
  });

  it('does not call the pole-sitter the leader before the start', () => {
    expect(driverStatusLine(makeRow('VER', 1, { interval: 0, lapNumber: null }), race)).toBe(
      'Waiting to start',
    );
  });

  it('still says something useful with no tyre data', () => {
    const row = makeRow('NOR', 2, { interval: 1.0, compound: null, age: null });
    expect(driverStatusLine(row, race)).toBe('1.0 s behind');
  });
});

function context(overrides: Partial<BadgeContext> = {}): BadgeContext {
  return {
    row: makeRow('NOR', 2, { interval: 2.5, age: 10 }),
    behind: undefined,
    isRace: true,
    status: 'green',
    sessionBestLap: null,
    underInvestigation: false,
    pitVerdict: null,
    slope: null,
    ...overrides,
  };
}

describe('driverBadges', () => {
  it('shows no badges when nothing notable is happening', () => {
    expect(driverBadges(context())).toEqual([]);
  });

  it('flags the one-second attack range, but not for the leader', () => {
    expect(driverBadges(context({ row: makeRow('NOR', 2, { interval: 0.9 }) }))).toEqual([
      'attackRange',
    ]);
    expect(driverBadges(context({ row: makeRow('NOR', 2, { interval: 1.1 }) }))).toEqual([]);
    expect(driverBadges(context({ row: makeRow('VER', 1, { interval: 0 }) }))).toEqual([]);
  });

  it('names the attack range for the era: DRS up to 2025, Overtake Mode from 2026', () => {
    expect(badgeLabel('attackRange', 'drs')).toBe('DRS range');
    expect(badgeTerm('attackRange', 'drs')).toBe('drs');
    expect(badgeLabel('attackRange', 'overtake-mode')).toBe('OM range');
    expect(badgeTerm('attackRange', 'overtake-mode')).toBe('overtakeMode');
    // Other badges do not change with the season.
    expect(badgeLabel('pitSoon', 'overtake-mode')).toBe(badgeLabel('pitSoon', 'drs'));
  });

  it('does not offer the aid under a safety car, when it is disabled', () => {
    expect(
      driverBadges(context({ row: makeRow('NOR', 2, { interval: 0.5 }), status: 'sc' })),
    ).toEqual([]);
  });

  it('marks fresh tyres only after a stop', () => {
    expect(
      driverBadges(context({ row: makeRow('HAM', 5, { age: 2, pitCount: 1, interval: 4 }) })),
    ).toEqual(['freshTyres']);
    expect(
      driverBadges(context({ row: makeRow('HAM', 5, { age: 2, pitCount: 0, interval: 4 }) })),
    ).toEqual([]);
  });

  it('suggests a stop when the pit window says so', () => {
    expect(driverBadges(context({ pitVerdict: 'pit-now' }))).toEqual(['pitSoon']);
    expect(driverBadges(context({ pitVerdict: 'window-open' }))).toEqual(['pitSoon']);
    expect(driverBadges(context({ pitVerdict: 'stay-out' }))).toEqual([]);
  });

  it('warns of an undercut when the car behind is within one lap of tyre deficit', () => {
    // 0.08 s/lap x 20 laps = 1.6 s a lap slower than new tyres; a car 1.2 s behind can jump ahead.
    const row = makeRow('NOR', 2, { interval: 3, age: 20 });
    const behind = makeRow('PIA', 3, { interval: 1.2 });
    expect(driverBadges(context({ row, behind, slope: 0.08 }))).toEqual(['undercutThreat']);
    expect(
      driverBadges(context({ row, behind: makeRow('PIA', 3, { interval: 2.0 }), slope: 0.08 })),
    ).toEqual([]);
    expect(driverBadges(context({ row, behind, slope: null }))).toEqual([]);
  });

  it('flags the fastest lap and an investigation', () => {
    const row = makeRow('VER', 1, { interval: 0, bestLap: 80.901 });
    expect(
      driverBadges(context({ row, sessionBestLap: 80.901, underInvestigation: true })),
    ).toEqual(['fastestLap', 'underInvestigation']);
  });

  it('keeps only the two most important when more apply', () => {
    const row = makeRow('NOR', 2, { interval: 0.5, age: 2, pitCount: 1, bestLap: 80 });
    const badges = driverBadges(
      context({ row, sessionBestLap: 80, underInvestigation: true, pitVerdict: 'pit-now' }),
    );
    expect(badges).toEqual(['fastestLap', 'underInvestigation']);
  });

  it('shows only investigations outside a race', () => {
    const row = makeRow('VER', 1, { interval: 0.5, bestLap: 78.792, age: 1, pitCount: 2 });
    expect(
      driverBadges(
        context({ row, isRace: false, sessionBestLap: 78.792, underInvestigation: true }),
      ),
    ).toEqual(['underInvestigation']);
  });
});
