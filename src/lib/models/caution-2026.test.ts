/**
 * Race control wording from 2026, which the 2023-2025 matching did not read.
 * Every message below is verbatim from OpenF1 (Monza 2026, session 11361, unless
 * stated), with the category, flag and scope it arrived with.
 */
import { describe, expect, it } from 'vitest';
import type { RaceControl } from '@/lib/openf1/types';
import { cautionPeriods, controlSignal } from './caution';

function message(
  iso: string,
  text: string,
  fields: Partial<Pick<RaceControl, 'category' | 'flag' | 'scope'>> = {},
): RaceControl {
  return {
    meeting_key: 1293,
    session_key: 11361,
    date: iso,
    driver_number: null,
    lap_number: null,
    category: 'Other',
    flag: null,
    scope: null,
    sector: null,
    qualifying_phase: null,
    message: text,
    ...fields,
  } as RaceControl;
}

const safetyCar = { category: 'SafetyCar' } as const;
const track = (flag: string) =>
  ({ category: 'Flag', flag, scope: 'Track' }) as Partial<RaceControl>;

describe('controlSignal', () => {
  it('reads the 2026 VSC wording as a virtual safety car, not a full one', () => {
    expect(controlSignal(message('2026-09-06T14:17:45+00:00', 'VSC DEPLOYED', safetyCar))).toBe(
      'vsc-start',
    );
    expect(controlSignal(message('2026-09-06T14:19:31+00:00', 'VSC ENDING', safetyCar))).toBe(
      'caution-end',
    );
  });

  it('still reads the 2024-2025 wording', () => {
    expect(
      controlSignal(message('2025-08-31T13:40:00+00:00', 'VIRTUAL SAFETY CAR DEPLOYED', safetyCar)),
    ).toBe('vsc-start');
    expect(
      controlSignal(message('2025-08-31T13:40:00+00:00', 'SAFETY CAR DEPLOYED', safetyCar)),
    ).toBe('sc-start');
    expect(
      controlSignal(message('2025-08-31T13:40:00+00:00', 'SAFETY CAR IN THIS LAP', safetyCar)),
    ).toBe('caution-end');
    expect(controlSignal(message('2025-08-31T13:40:00+00:00', 'RED FLAG', track('RED')))).toBe(
      'red',
    );
  });

  it('reads a red flag sent as a plain message, but not one mentioned in a penalty', () => {
    expect(controlSignal(message('2026-09-06T13:07:43+00:00', 'RED FLAG - RACE SUSPENDED'))).toBe(
      'red',
    );
    expect(
      controlSignal(
        message(
          '2026-06-01T13:00:00+00:00',
          'INCIDENT INVOLVING CAR 6 (HAD) NOTED - RED FLAG INFRINGEMENT',
        ),
      ),
    ).toBeNull();
  });

  it('ignores safety car chatter that is neither a start nor an end', () => {
    expect(controlSignal(message('2026-09-06T13:34:00+00:00', 'SAFETY CAR LIGHTS ON'))).toBeNull();
    expect(
      controlSignal(
        message('2025-08-31T13:40:00+00:00', 'SAFETY CAR THROUGH THE PIT LANE', safetyCar),
      ),
    ).toBeNull();
  });
});

describe('cautionPeriods with the 2026 wording', () => {
  it('ends Monza 2026’s lap-3 safety car at the red flag, not 26 laps later', () => {
    const feed = [
      message('2026-09-06T13:06:49+00:00', 'SAFETY CAR DEPLOYED', safetyCar),
      message('2026-09-06T13:06:49+00:00', 'OVERTAKE DISABLED'),
      message('2026-09-06T13:07:43+00:00', 'RED FLAG - RACE SUSPENDED'),
      message('2026-09-06T13:09:25+00:00', 'TRACK CLEAR', track('CLEAR')),
      message('2026-09-06T13:34:00+00:00', 'SAFETY CAR LIGHTS ON'),
      message('2026-09-06T14:17:45+00:00', 'VSC DEPLOYED', safetyCar),
      message('2026-09-06T14:19:31+00:00', 'VSC ENDING', safetyCar),
    ];
    const at = (iso: string) => Date.parse(iso);
    expect(cautionPeriods(feed)).toEqual([
      { kind: 'sc', startMs: at('2026-09-06T13:06:49Z'), endMs: at('2026-09-06T13:07:43Z') },
      { kind: 'red', startMs: at('2026-09-06T13:07:43Z'), endMs: at('2026-09-06T13:09:25Z') },
      { kind: 'vsc', startMs: at('2026-09-06T14:17:45Z'), endMs: at('2026-09-06T14:19:31Z') },
    ]);
  });
});
