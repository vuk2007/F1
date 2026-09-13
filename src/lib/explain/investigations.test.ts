import { describe, expect, it } from 'vitest';
import { openInvestigations } from './investigations';

/** Verbatim, in order, from race_control for the 2025 Italian GP (session 9912). */
const MONZA_2025 = [
  'PIT EXIT INCIDENT INVOLVING CAR 14 (ALO) NOTED - FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS – PRACTICE START INFRINGEMENT',
  'PIT EXIT INCIDENT INVOLVING CAR 18 (STR) NOTED - FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS – PRACTICE START INFRINGEMENT',
  'FIA STEWARDS: PIT EXIT INCIDENT INVOLVING CAR 14 (ALO) WILL BE INVESTIGATED AFTER THE RACE - FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS – PRACTICE START INFRINGEMENT',
  'FIA STEWARDS: PIT EXIT INCIDENT INVOLVING CAR 18 (STR) WILL BE INVESTIGATED AFTER THE RACE - FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS – PRACTICE START INFRINGEMENT',
  'TURN 1 INCIDENT INVOLVING CARS 1 (VER) AND 4 (NOR) NOTED',
  'FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 1 (VER) AND 4 (NOR) REVIEWED NO FURTHER INVESTIGATION',
  'TURN 1 INCIDENT INVOLVING CARS 22 (TSU) AND 44 (HAM) NOTED - LEAVING THE TRACK AND GAINING AN ADVANTAGE',
  'CAR 16 (LEC) TIME 1:24.525 DELETED - TRACK LIMITS AT TURN 1 LAP 4 15:08:05',
  'TURN 4 INCIDENT INVOLVING CARS 31 (OCO) AND 18 (STR) NOTED - FORCING ANOTHER DRIVER OFF THE TRACK',
  'FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 22 (TSU) AND 44 (HAM) REVIEWED NO FURTHER INVESTIGATION - LEAVING THE TRACK AND GAINING AN ADVANTAGE',
  'FIA STEWARDS: TURN 4 INCIDENT INVOLVING CARS 31 (OCO) AND 18 (STR) UNDER INVESTIGATION - FORCING ANOTHER DRIVER OFF THE TRACK',
  'FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 31 (OCO) - FORCING ANOTHER DRIVER OFF THE TRACK',
  'TURN 4 INCIDENT INVOLVING CAR 55 (SAI) NOTED - FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS – ESCAPE ROAD INSTRUCTIONS',
  'FIA STEWARDS: TURN 4 INCIDENT INVOLVING CAR 55 (SAI) UNDER INVESTIGATION - FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS – ESCAPE ROAD INSTRUCTIONS',
  'TURN 5 INCIDENT INVOLVING CARS 55 (SAI) AND 87 (BEA) NOTED',
  'FIA STEWARDS: TURN 5 INCIDENT INVOLVING CARS 87 (BEA) AND 55 (SAI) UNDER INVESTIGATION - CAUSING A COLLISION',
  'TURN 3 INCIDENT INVOLVING CARS 12 (ANT) AND 23 (ALB) NOTED - FORCING ANOTHER DRIVER OFF THE TRACK',
  'FIA STEWARDS: 10 SECOND TIME PENALTY FOR CAR 87 (BEA) - CAUSING A COLLISION',
  'FIA STEWARDS: TURN 3 INCIDENT INVOLVING CARS 12 (ANT) AND 23 (ALB) UNDER INVESTIGATION - FORCING ANOTHER DRIVER OFF THE TRACK',
  'FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 12 (ANT) - DRIVING ERRATICALLY',
].map((message) => ({ message }));

/** The messages up to and including the one containing `text`. */
function until(text: string) {
  const index = MONZA_2025.findIndex((m) => m.message.includes(text));
  if (index === -1) throw new Error(`no message containing ${text}`);
  return MONZA_2025.slice(0, index + 1);
}

describe('openInvestigations', () => {
  it('ignores incidents that are only noted', () => {
    // Noted means seen, not investigated. Most are dropped without action.
    expect(openInvestigations(until('CARS 1 (VER) AND 4 (NOR) NOTED'))).toEqual([14, 18]);
  });

  it('counts an investigation deferred until after the race', () => {
    expect(openInvestigations(until('CAR 18 (STR) WILL BE INVESTIGATED'))).toEqual([14, 18]);
  });

  it('opens an investigation for every car named in it', () => {
    expect(openInvestigations(until('31 (OCO) AND 18 (STR) UNDER INVESTIGATION'))).toEqual([
      14, 18, 31,
    ]);
  });

  it('closes an incident the stewards drop', () => {
    const afterVerNor = until('1 (VER) AND 4 (NOR) REVIEWED NO FURTHER INVESTIGATION');
    expect(openInvestigations(afterVerNor)).not.toContain(1);
    expect(openInvestigations(afterVerNor)).not.toContain(4);
  });

  it('closes an incident when one of its cars is penalised for that reason', () => {
    // OCO's penalty decides the OCO/STR incident, but STR's separate pit-exit
    // investigation is still open.
    expect(openInvestigations(until('5 SECOND TIME PENALTY FOR CAR 31 (OCO)'))).toEqual([14, 18]);
  });

  it('does not close a different incident involving the same car', () => {
    /*
     * ANT's penalty is for driving erratically; the ANT/ALB incident for forcing a
     * driver off is still under investigation. Clearing it on the car number alone
     * would have removed ALB's badge with no verdict ever given.
     */
    expect(openInvestigations(MONZA_2025)).toEqual([12, 14, 18, 23, 55]);
  });

  it('keeps a car under investigation while another of its incidents is decided', () => {
    // BEA's penalty closes BEA/SAI, but SAI's escape-road investigation remains.
    expect(openInvestigations(until('10 SECOND TIME PENALTY FOR CAR 87 (BEA)'))).toEqual([
      14, 18, 55,
    ]);
  });

  it('returns nothing for a clean session', () => {
    expect(openInvestigations([])).toEqual([]);
    expect(openInvestigations([{ message: 'GREEN LIGHT - PIT EXIT OPEN' }])).toEqual([]);
  });
});
