import { describe, expect, it } from 'vitest';
import type { RaceControl } from '@/lib/openf1/types';
import { cautionPeriods, overlapsCaution } from './caution';

const T0 = Date.parse('2025-01-01T12:00:00.000Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

function message(seconds: number, partial: Partial<RaceControl>): RaceControl {
  return {
    category: 'Other',
    date: at(seconds),
    driver_number: null,
    flag: null,
    lap_number: null,
    meeting_key: 1,
    message: '',
    qualifying_phase: null,
    scope: null,
    sector: null,
    session_key: 1,
    ...partial,
  };
}

const sc = (s: number, text: string) => message(s, { category: 'SafetyCar', message: text });
const flag = (s: number, f: RaceControl['flag']) =>
  message(s, { category: 'Flag', flag: f, scope: 'Track', message: `${f} FLAG` });

describe('cautionPeriods', () => {
  it('closes a safety car period', () => {
    const periods = cautionPeriods([
      sc(100, 'SAFETY CAR DEPLOYED'),
      sc(300, 'SAFETY CAR IN THIS LAP'),
    ]);
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ kind: 'sc', startMs: T0 + 100_000, endMs: T0 + 300_000 });
  });

  it('distinguishes a VSC from a full safety car', () => {
    const periods = cautionPeriods([
      sc(50, 'VIRTUAL SAFETY CAR DEPLOYED'),
      sc(90, 'VIRTUAL SAFETY CAR ENDING'),
    ]);
    expect(periods).toHaveLength(1);
    expect(periods[0]!.kind).toBe('vsc');
  });

  it('handles a VSC upgraded to a safety car without overlapping', () => {
    const periods = cautionPeriods([
      sc(50, 'VIRTUAL SAFETY CAR DEPLOYED'),
      sc(70, 'SAFETY CAR DEPLOYED'),
      sc(200, 'SAFETY CAR IN THIS LAP'),
    ]);
    expect(periods.map((p) => p.kind)).toEqual(['vsc', 'sc']);
    expect(periods[0]!.endMs).toBe(T0 + 70_000);
    expect(periods[1]!.startMs).toBe(T0 + 70_000);
  });

  it('tracks a red flag until the track goes green', () => {
    const periods = cautionPeriods([flag(10, 'RED'), flag(600, 'GREEN')]);
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ kind: 'red', startMs: T0 + 10_000, endMs: T0 + 600_000 });
  });

  it('leaves a period that never ended open', () => {
    const periods = cautionPeriods([sc(100, 'SAFETY CAR DEPLOYED')]);
    expect(periods[0]!.endMs).toBeNull();
  });

  it('ignores duplicate deploy messages', () => {
    const periods = cautionPeriods([
      sc(100, 'SAFETY CAR DEPLOYED'),
      sc(110, 'SAFETY CAR DEPLOYED'),
      sc(300, 'SAFETY CAR IN THIS LAP'),
    ]);
    expect(periods).toHaveLength(1);
    expect(periods[0]!.startMs).toBe(T0 + 100_000);
  });

  it('returns nothing for a clean race', () => {
    expect(cautionPeriods([flag(0, 'GREEN'), flag(100, 'CHEQUERED')])).toEqual([]);
  });

  it('is not confused by the order rows arrive in', () => {
    const periods = cautionPeriods([
      sc(300, 'SAFETY CAR IN THIS LAP'),
      sc(100, 'SAFETY CAR DEPLOYED'),
    ]);
    expect(periods).toHaveLength(1);
    expect(periods[0]!.startMs).toBe(T0 + 100_000);
  });

  it('ignores a yellow flag in a single sector', () => {
    const periods = cautionPeriods([
      message(50, { category: 'Flag', flag: 'YELLOW', scope: 'Sector', sector: 3 }),
    ]);
    expect(periods).toEqual([]);
  });
});

describe('overlapsCaution', () => {
  const periods = cautionPeriods([
    sc(100, 'SAFETY CAR DEPLOYED'),
    sc(300, 'SAFETY CAR IN THIS LAP'),
  ]);

  it('detects a lap fully inside the period', () => {
    expect(overlapsCaution(periods, T0 + 150_000, T0 + 200_000)).toBe(true);
  });

  it('detects a lap that only clips the start or the end', () => {
    expect(overlapsCaution(periods, T0 + 50_000, T0 + 120_000)).toBe(true);
    expect(overlapsCaution(periods, T0 + 280_000, T0 + 400_000)).toBe(true);
  });

  it('clears a lap entirely outside the period', () => {
    expect(overlapsCaution(periods, T0, T0 + 90_000)).toBe(false);
    expect(overlapsCaution(periods, T0 + 310_000, T0 + 400_000)).toBe(false);
  });

  it('treats an open-ended period as running to the end of the session', () => {
    const open = cautionPeriods([sc(100, 'SAFETY CAR DEPLOYED')]);
    expect(overlapsCaution(open, T0 + 900_000, T0 + 1_000_000)).toBe(true);
  });
});
