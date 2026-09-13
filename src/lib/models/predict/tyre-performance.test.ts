import { describe, expect, it } from 'vitest';
import { syntheticRace } from './race.fixture';
import { tyrePerformance } from './tyre-performance';

describe('tyrePerformance', () => {
  /*
   * Three cars of different speed, each running mediums then hards. Mediums wear
   * 0.06 s/lap; hards 0.02 s/lap and start 0.6 s slower. The cars differ by a whole
   * second, which a naive pooled comparison would read as a compound difference.
   */
  const race = syntheticRace(
    [
      {
        number: 1,
        acronym: 'AAA',
        base: 80,
        stints: [
          { compound: 'MEDIUM', laps: 20, wear: 0.06 },
          { compound: 'HARD', laps: 30, wear: 0.02, offset: 0.6 },
        ],
      },
      {
        number: 2,
        acronym: 'BBB',
        base: 81,
        stints: [
          { compound: 'MEDIUM', laps: 18, wear: 0.06 },
          { compound: 'HARD', laps: 32, wear: 0.02, offset: 0.6 },
        ],
      },
      {
        number: 3,
        acronym: 'CCC',
        base: 82,
        stints: [
          { compound: 'HARD', laps: 26, wear: 0.02, offset: 0.6 },
          { compound: 'MEDIUM', laps: 24, wear: 0.06 },
        ],
      },
    ],
    50,
  );

  const result = tyrePerformance(race.dataset);
  const medium = result.compounds.find((c) => c.compound === 'MEDIUM')!;
  const hard = result.compounds.find((c) => c.compound === 'HARD')!;

  it('recovers each compound’s wear rate', () => {
    expect(medium.degPerLap).toBeCloseTo(0.06, 2);
    expect(hard.degPerLap).toBeCloseTo(0.02, 2);
  });

  it('measures the pace gap within each car, not between cars', () => {
    /*
     * Hards start 0.6 s slower, but by five laps old the mediums have worn 0.3 s and
     * the hards 0.1 s, so at the reference age the gap is 0.4 s. The cars differ by
     * a second each; had that leaked in, this would be far from 0.4.
     */
    expect(medium.paceDelta).toBeCloseTo(0, 2);
    expect(hard.paceDelta).toBeCloseTo(0.4, 1);
    expect(hard.pairedCars).toBe(3);
  });

  it('lists the fastest compound first', () => {
    expect(result.compounds.map((c) => c.compound)).toEqual(['MEDIUM', 'HARD']);
  });

  it('draws a curve through the reference point', () => {
    const atReference = hard.curve.find((p) => p.age === 5);
    expect(atReference?.delta).toBeCloseTo(0.4, 1);
  });

  it('does not warn of a cliff on steady wear', () => {
    expect(medium.cliff.detected).toBe(false);
    expect(hard.cliff.detected).toBe(false);
  });

  it('warns when lap times accelerate', () => {
    const cliffRace = syntheticRace(
      [
        {
          number: 1,
          acronym: 'AAA',
          base: 80,
          stints: [
            { compound: 'SOFT', laps: 22, wear: 0.03, cliff: 0.006 },
            { compound: 'HARD', laps: 10, wear: 0.02 },
          ],
        },
        {
          number: 2,
          acronym: 'BBB',
          base: 81,
          stints: [
            { compound: 'SOFT', laps: 22, wear: 0.03, cliff: 0.006 },
            { compound: 'HARD', laps: 10, wear: 0.02 },
          ],
        },
      ],
      32,
    );
    const soft = tyrePerformance(cliffRace.dataset).compounds.find((c) => c.compound === 'SOFT')!;
    expect(soft.cliff.detected).toBe(true);
  });

  it('says there is not enough data before any stint has four clean laps', () => {
    const early = syntheticRace(
      [
        {
          number: 1,
          acronym: 'AAA',
          base: 80,
          stints: [{ compound: 'MEDIUM', laps: 5, wear: 0.05 }],
        },
      ],
      5,
    );
    const only = tyrePerformance(early.dataset).compounds[0]!;
    expect(only.enough).toBe(false);
    expect(only.degPerLap).toBeNull();
  });
});
