import { describe, expect, it } from 'vitest';
import type { RaceControl } from '@/lib/openf1/types';
import { overtakeModeEnabledAt, overtakeModeNextLap } from './overtake-mode';

function message(date: string, text: string): RaceControl {
  return {
    meeting_key: 1293,
    session_key: 11361,
    date,
    driver_number: null,
    lap_number: null,
    category: 'Other',
    flag: null,
    scope: null,
    sector: null,
    qualifying_phase: null,
    message: text,
  } as RaceControl;
}

/* The four switches race control sent at Monza 2026 (session 11361), verbatim. */
const MONZA_2026 = [
  message('2026-09-06T12:57:04+00:00', 'OVERTAKE DISABLED'),
  message('2026-09-06T13:04:46+00:00', 'OVERTAKE ENABLED'),
  message('2026-09-06T13:06:49+00:00', 'OVERTAKE DISABLED'),
  message('2026-09-06T13:46:54+00:00', 'OVERTAKE ENABLED'),
  message('2026-09-06T13:10:00+00:00', 'TRACK LIMITS - CAR 81'),
];

const at = (iso: string) => Date.parse(iso);

describe('overtakeModeEnabledAt', () => {
  it('follows the last switch at or before the moment', () => {
    expect(overtakeModeEnabledAt(MONZA_2026, at('2026-09-06T12:59:00Z'))).toBe(false);
    expect(overtakeModeEnabledAt(MONZA_2026, at('2026-09-06T13:05:00Z'))).toBe(true);
    // Switched off again two minutes later, and other messages do not change it.
    expect(overtakeModeEnabledAt(MONZA_2026, at('2026-09-06T13:20:00Z'))).toBe(false);
    expect(overtakeModeEnabledAt(MONZA_2026, at('2026-09-06T14:00:00Z'))).toBe(true);
  });

  it('does not depend on the order the messages arrive in', () => {
    const shuffled = [...MONZA_2026].reverse();
    expect(overtakeModeEnabledAt(shuffled, at('2026-09-06T13:20:00Z'))).toBe(false);
    expect(overtakeModeEnabledAt(shuffled, at('2026-09-06T14:00:00Z'))).toBe(true);
  });

  it('is unknown before any switch, and in seasons that never send one', () => {
    expect(overtakeModeEnabledAt(MONZA_2026, at('2026-09-06T12:00:00Z'))).toBeNull();
    expect(
      overtakeModeEnabledAt([message('2025-09-07T13:05:00+00:00', 'DRS ENABLED')], Infinity),
    ).toBeNull();
  });
});

describe('overtakeModeNextLap', () => {
  it('needs the mode on and the chaser within one second', () => {
    expect(overtakeModeNextLap(0.8, true)).toBe(true);
    expect(overtakeModeNextLap(1.0, true)).toBe(true);
    expect(overtakeModeNextLap(1.2, true)).toBe(false);
    expect(overtakeModeNextLap(0.8, false)).toBe(false);
  });

  it('says unknown rather than no when it cannot tell', () => {
    expect(overtakeModeNextLap(null, true)).toBeNull();
    expect(overtakeModeNextLap(0.5, null)).toBeNull();
  });
});
