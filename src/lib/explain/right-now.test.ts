import { describe, expect, it } from 'vitest';
import type { Weather } from '@/lib/openf1/types';
import { joinNames, rightNow, type RightNowInput } from './right-now';
import { makeRow } from './rows.fixture';

const VER = makeRow('VER', 1, { interval: 0, gapToLeader: 0, bestLap: 78.792 });
const NOR = makeRow('NOR', 2, { interval: 1.234, gapToLeader: 1.234, bestLap: 78.869 });
const LEC = makeRow('LEC', 3, { interval: 3.5, gapToLeader: 4.734 });

const dry: Weather = {
  air_temperature: 24,
  date: '2025-09-07T13:00:00Z',
  humidity: 40,
  meeting_key: 1,
  pressure: 1000,
  rainfall: 0,
  session_key: 1,
  track_temperature: 40,
  wind_direction: 0,
  wind_speed: 1,
};

function input(overrides: Partial<RightNowInput> = {}): RightNowInput {
  return {
    rows: [VER, NOR, LEC],
    status: 'green',
    weather: dry,
    lap: 20,
    totalLaps: 53,
    isRace: true,
    inPitLane: [],
    battles: [],
    ...overrides,
  };
}

describe('rightNow', () => {
  it('falls back to the leader and the gap when nothing else is happening', () => {
    expect(rightNow(input())).toEqual({
      kind: 'leader',
      sentence: 'VER leads the race, 1.2 s ahead of NOR.',
    });
  });

  it('says so before the session has started', () => {
    const notStarted = [
      makeRow('VER', null, { lapNumber: null }),
      makeRow('NOR', null, { lapNumber: null }),
    ];
    expect(rightNow(input({ rows: notStarted, status: 'unknown' })).kind).toBe('waiting');
  });

  it('puts a red flag above everything', () => {
    const everything = input({
      status: 'red',
      weather: { ...dry, rainfall: 1 },
      lap: 52,
      inPitLane: ['HAM'],
    });
    expect(rightNow(everything).kind).toBe('red');
  });

  it('names the winner at the chequered flag', () => {
    expect(rightNow(input({ status: 'chequered' })).sentence).toBe(
      'Chequered flag: VER wins the race.',
    );
  });

  it('names the fastest driver when a practice or qualifying session ends', () => {
    expect(rightNow(input({ status: 'chequered', isRace: false })).sentence).toBe(
      'Session over: VER set the fastest lap.',
    );
  });

  it('explains a safety car and a virtual safety car differently', () => {
    expect(rightNow(input({ status: 'sc' })).kind).toBe('sc');
    expect(rightNow(input({ status: 'vsc' })).kind).toBe('vsc');
    expect(rightNow(input({ status: 'sc' })).sentence).not.toBe(
      rightNow(input({ status: 'vsc' })).sentence,
    );
  });

  it('puts a safety car above rain', () => {
    expect(rightNow(input({ status: 'sc', weather: { ...dry, rainfall: 1 } })).kind).toBe('sc');
  });

  it('mentions rain', () => {
    expect(rightNow(input({ weather: { ...dry, rainfall: 1 } })).kind).toBe('rain');
  });

  it('counts down the final laps', () => {
    expect(rightNow(input({ lap: 50 })).sentence).toBe('3 laps to go: VER leads NOR by 1.2 s.');
    expect(rightNow(input({ lap: 52 })).sentence).toBe('1 lap to go: VER leads NOR by 1.2 s.');
    expect(rightNow(input({ lap: 53 })).sentence).toBe('Final lap: VER leads NOR by 1.2 s.');
  });

  it('does not count down before the last three laps', () => {
    expect(rightNow(input({ lap: 49 })).kind).toBe('leader');
  });

  it('reports drivers in the pit lane, in a sentence that reads naturally', () => {
    expect(rightNow(input({ inPitLane: ['HAM'] })).sentence).toBe(
      'HAM is in the pit lane for fresh tyres.',
    );
    expect(rightNow(input({ inPitLane: ['HAM', 'LEC', 'RUS'] })).sentence).toBe(
      'HAM, LEC and RUS are in the pit lane for fresh tyres.',
    );
  });

  it('ignores pit stops outside a race, where they happen all session', () => {
    expect(rightNow(input({ isRace: false, inPitLane: ['HAM'] })).kind).toBe('leader');
  });

  it('leads with a battle inside a second', () => {
    const battles = [{ ahead: VER, chaser: NOR, gap: 0.8, position: 1, trend: 'closing' as const }];
    expect(rightNow(input({ battles })).sentence).toBe(
      'Closest fight: NOR is 0.8 s behind VER for P1, and closing.',
    );
  });

  it('does not call a battle for a gap over a second', () => {
    const battles = [
      { ahead: VER, chaser: NOR, gap: 1.234, position: 1, trend: 'stable' as const },
    ];
    expect(rightNow(input({ battles })).kind).toBe('leader');
  });

  it('gives the margin in thousandths outside a race', () => {
    expect(rightNow(input({ isRace: false })).sentence).toBe(
      'VER is fastest so far, 0.077 s quicker than NOR.',
    );
  });
});

describe('joinNames', () => {
  it('joins one, two and several names', () => {
    expect(joinNames(['VER'])).toBe('VER');
    expect(joinNames(['VER', 'NOR'])).toBe('VER and NOR');
    expect(joinNames(['VER', 'NOR', 'LEC'])).toBe('VER, NOR and LEC');
  });
});
