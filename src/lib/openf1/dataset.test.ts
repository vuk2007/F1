import { describe, expect, it } from 'vitest';
import { sessionWindow } from './dataset';

/** Monza 2025 qualifying (session_key 9908), as OpenF1 returns it. */
const qualifying = {
  date_start: '2025-09-06T14:00:00+00:00',
  date_end: '2025-09-06T15:00:00+00:00',
};

/** Verstappen's last four laps in that session, verbatim from /laps. */
const verstappen = [
  { date_start: '2025-09-06T14:55:09.708000+00:00', lap_duration: 98.742 },
  { date_start: '2025-09-06T14:59:22.549000+00:00', lap_duration: 245.598 },
  // Pole: 1:18.792, started with 5m06s on the clock gone, finished after the flag.
  { date_start: '2025-09-06T15:00:54.117000+00:00', lap_duration: 78.792 },
  { date_start: '2025-09-06T15:02:12.879000+00:00', lap_duration: 112.992 },
];

describe('sessionWindow', () => {
  it('runs past the scheduled end to the last lap anyone finished', () => {
    /*
     * The bug this exists for: the replay clock stops at endMs, so with the
     * scheduled end the pole lap never completed and the timing table finished
     * qualifying on 1:18.923 instead of 1:18.792.
     */
    const { endMs } = sessionWindow(qualifying, verstappen);

    expect(endMs).toBe(Date.parse('2025-09-06T15:04:05.871Z'));
  });

  it('includes the pole lap, which crossed the line at 15:02:12', () => {
    const { endMs } = sessionWindow(qualifying, verstappen);
    expect(endMs).toBeGreaterThanOrEqual(Date.parse('2025-09-06T15:02:12.909Z'));
  });

  it('starts at the scheduled start', () => {
    expect(sessionWindow(qualifying, verstappen).startMs).toBe(Date.parse('2025-09-06T14:00:00Z'));
  });

  it('keeps the scheduled end when every lap finished inside it', () => {
    const early = [{ date_start: '2025-09-06T14:10:00+00:00', lap_duration: 80 }];
    expect(sessionWindow(qualifying, early).endMs).toBe(Date.parse('2025-09-06T15:00:00Z'));
  });

  it('ignores laps with no start or no time', () => {
    const incomplete = [
      { date_start: null, lap_duration: 80 },
      { date_start: '2025-09-06T14:59:30+00:00', lap_duration: null },
    ];
    expect(sessionWindow(qualifying, incomplete).endMs).toBe(Date.parse('2025-09-06T15:00:00Z'));
  });

  it('does not let one corrupt duration stretch the replay over hours of nothing', () => {
    const corrupt = [{ date_start: '2025-09-06T14:59:00+00:00', lap_duration: 50_000 }];
    expect(sessionWindow(qualifying, corrupt).endMs).toBe(Date.parse('2025-09-06T15:00:00Z'));
  });

  it('still allows a long red-flag overrun', () => {
    // Two hours late is a real race with a stoppage, not bad data.
    const late = [{ date_start: '2025-09-06T16:58:00+00:00', lap_duration: 90 }];
    expect(sessionWindow(qualifying, late).endMs).toBe(Date.parse('2025-09-06T16:59:30Z'));
  });
});
