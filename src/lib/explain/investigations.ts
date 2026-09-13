/**
 * Which cars are under investigation by the stewards at a moment in the session.
 *
 * OpenF1 exposes no investigation field: race control messages carry it as text,
 * with `driver_number` null. The wording below was read off real messages from the
 * 2025 Italian GP rather than guessed, and the test replays that exact sequence:
 *
 *   FIA STEWARDS: TURN 4 INCIDENT INVOLVING CARS 31 (OCO) AND 18 (STR) UNDER INVESTIGATION - FORCING ANOTHER DRIVER OFF THE TRACK
 *   FIA STEWARDS: PIT EXIT INCIDENT INVOLVING CAR 14 (ALO) WILL BE INVESTIGATED AFTER THE RACE - ...
 *   FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 1 (VER) AND 4 (NOR) REVIEWED NO FURTHER INVESTIGATION
 *   FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 31 (OCO) - FORCING ANOTHER DRIVER OFF THE TRACK
 *
 * Two things about closing an investigation are easy to get wrong:
 *
 *  - "NOTED" is not an investigation. It means the stewards have seen something,
 *    and most noted incidents are dropped. Badging every noted car would put
 *    "Under investigation" on half the grid.
 *  - A penalty closes an incident only when its reason matches. At Monza ANT got a
 *    penalty for "DRIVING ERRATICALLY" while a separate ANT/ALB incident for
 *    "FORCING ANOTHER DRIVER OFF THE TRACK" was still open; closing on the car
 *    number alone would have quietly cleared ALB too.
 */
import type { RaceControl } from '@/lib/openf1/types';

interface Incident {
  /** The incident as the stewards describe it, without the verdict. */
  subject: string;
  /** Text after the final " - ", when the message gives a reason. */
  reason: string | null;
  cars: number[];
}

const CAR = /\b(\d{1,2}) \([A-Z]{3}\)/g;
const OPENED = /\s(?:UNDER INVESTIGATION|WILL BE INVESTIGATED(?: AFTER THE RACE)?)\b/;
const DROPPED = /\s(?:REVIEWED\s+)?NO FURTHER (?:INVESTIGATION|ACTION)\b/;
const PENALTY = /\b(?:PENALTY|DRIVE THROUGH|STOP AND GO|DISQUALIFIED)\b/;

function cars(text: string): number[] {
  return [...text.matchAll(CAR)].map((match) => Number(match[1]));
}

function withoutPrefix(text: string): string {
  return text.replace(/^FIA STEWARDS:\s*/, '').trim();
}

function reasonOf(text: string): string | null {
  const at = text.lastIndexOf(' - ');
  return at === -1 ? null : text.slice(at + 3).trim();
}

/** Car numbers with an investigation still open after these messages, ascending. */
export function openInvestigations(messages: Pick<RaceControl, 'message'>[]): number[] {
  let open: Incident[] = [];

  for (const { message } of messages) {
    const text = withoutPrefix(message.toUpperCase());

    const opened = OPENED.exec(text);
    if (opened) {
      const subject = text.slice(0, opened.index).trim();
      // The same incident announced twice is still one investigation.
      open = open.filter((incident) => incident.subject !== subject);
      open.push({ subject, reason: reasonOf(text), cars: cars(subject) });
      continue;
    }

    const dropped = DROPPED.exec(text);
    if (dropped) {
      const subject = text.slice(0, dropped.index).trim();
      open = open.filter((incident) => incident.subject !== subject);
      continue;
    }

    if (PENALTY.test(text)) {
      const penalised = cars(text);
      const reason = reasonOf(text);
      open = open.filter((incident) => {
        const involves = incident.cars.some((car) => penalised.includes(car));
        if (!involves) return true;
        // With a stated reason, only the matching incident is decided.
        return reason != null && incident.reason != null && incident.reason !== reason;
      });
    }
  }

  return [...new Set(open.flatMap((incident) => incident.cars))].sort((a, b) => a - b);
}
