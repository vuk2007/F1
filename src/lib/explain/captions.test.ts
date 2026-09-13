import { describe, expect, it } from 'vitest';
import { lapChartCaption, paceCaption, telemetryCaption, type CaptionStint } from './captions';

function stint(
  slope: number | null,
  { compound = 'MEDIUM', fuel = 0, clean = 12, number = 1 } = {},
): CaptionStint {
  return {
    stint: { compound, stint_number: number },
    slope,
    degradation: { fuelEffectPerLap: fuel, cleanLaps: clean },
  };
}

describe('lapChartCaption', () => {
  it('says lap times are rising when the chart shows them rising', () => {
    expect(lapChartCaption([stint(0.08)])).toBe(
      'Lap times going up by about 0.08 s per lap on the mediums: the tyres are wearing out.',
    );
  });

  it('explains wear that fuel burn hides from the chart', () => {
    // Monza: +0.026 s/lap of wear under a 0.055 s/lap fuel gain, so the points drift down.
    expect(lapChartCaption([stint(0.026, { fuel: 0.055 })])).toBe(
      'The mediums are losing about 0.03 s per lap, but lap times look flat because the car gets lighter as fuel burns off.',
    );
  });

  it('describes a flat stint as steady', () => {
    expect(lapChartCaption([stint(0.01, { compound: 'HARD' })])).toBe(
      'Lap times holding steady on the hards: no measurable tyre wear yet.',
    );
  });

  it('describes falling lap times', () => {
    expect(lapChartCaption([stint(-0.05, { compound: 'SOFT' })])).toBe(
      'Lap times falling by about 0.05 s per lap on the softs, usually because the track is gaining grip.',
    );
  });

  it('describes the latest stint', () => {
    const caption = lapChartCaption([
      stint(0.08, { number: 1 }),
      stint(0.01, { compound: 'HARD', number: 2 }),
    ]);
    expect(caption).toContain('hards');
  });

  it('refuses to read a trend from fewer than four clean laps', () => {
    expect(lapChartCaption([stint(0.2, { clean: 3 })])).toBe(
      'Not enough clean laps yet to read a trend.',
    );
    expect(lapChartCaption([stint(null)])).toBe('Not enough clean laps yet to read a trend.');
    expect(lapChartCaption([])).toBe('Not enough clean laps yet to read a trend.');
  });
});

describe('paceCaption', () => {
  const label = (n: number) => ({ 1: 'VER', 4: 'NOR', 81: 'PIA' })[n] ?? String(n);

  it('names the quicker driver and by how much', () => {
    // The Monza numbers: VER 1:22.838, NOR 1:22.934.
    expect(
      paceCaption(
        [
          { driverNumber: 4, medianLap: 82.934 },
          { driverNumber: 1, medianLap: 82.838 },
        ],
        label,
      ),
    ).toBe('VER is quickest here, about 0.10 s a lap faster than NOR on a typical lap.');
  });

  it('calls a tiny difference a tie', () => {
    expect(
      paceCaption(
        [
          { driverNumber: 4, medianLap: 82.934 },
          { driverNumber: 81, medianLap: 82.9 },
        ],
        label,
      ),
    ).toBe('PIA and NOR are matched on pace, lap for lap.');
  });

  it('describes a single driver', () => {
    expect(paceCaption([{ driverNumber: 4, medianLap: 82.934 }], label)).toBe(
      'A typical clean lap for NOR is 1:22.934.',
    );
  });

  it('has nothing to say without times', () => {
    expect(paceCaption([{ driverNumber: 4, medianLap: null }], label)).toBeNull();
  });
});

describe('telemetryCaption', () => {
  const base = { labelA: 'NOR', topSpeed: 336.2, fullThrottle: 0.672 };

  it('says who finished the lap ahead, using the final delta', () => {
    expect(telemetryCaption({ ...base, labelB: 'PIA', deltas: [0, -0.1, null, -0.52] })).toBe(
      'Over this lap NOR finished 0.52 s ahead of PIA; the Delta chart shows where it was won.',
    );
    expect(telemetryCaption({ ...base, labelB: 'PIA', deltas: [0.2, 0.31] })).toBe(
      'Over this lap PIA finished 0.31 s ahead of NOR; the Delta chart shows where it was won.',
    );
  });

  it('calls two laps within a hundredth level', () => {
    expect(telemetryCaption({ ...base, labelB: 'PIA', deltas: [0.004] })).toContain('level');
  });

  it('describes a single lap by its top speed and time flat out', () => {
    expect(telemetryCaption({ ...base, labelB: null, deltas: [] })).toBe(
      'NOR reached 336 km/h and was flat out for 67% of this lap.',
    );
  });

  it('has nothing to say without data', () => {
    expect(
      telemetryCaption({
        labelA: 'NOR',
        labelB: null,
        deltas: [],
        topSpeed: null,
        fullThrottle: null,
      }),
    ).toBeNull();
  });
});
