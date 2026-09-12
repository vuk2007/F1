/**
 * Explanations for every metric the UI shows.
 *
 * Each entry answers three questions: what the number is, why it matters, and
 * what a high or low value implies. Phase 1 covers the timing table; later
 * phases add degradation, pit window and telemetry entries to the same map.
 *
 * Text lives here rather than in lib/i18n/strings because these are a dictionary
 * keyed by metric, not UI chrome — but they are equally translatable.
 */

export interface MetricExplanation {
  /** Short label, used as the tooltip title. */
  title: string;
  /** What the metric is. */
  what: string;
  /** Why a race engineer cares. */
  why: string;
  /** What a high or low reading tells you. */
  reading: string;
}

export const METRICS = {
  position: {
    title: 'Position',
    what: 'Where the driver currently runs on track, from the official timing feed.',
    why: 'Track position is the thing every strategy call is ultimately trying to buy or protect.',
    reading:
      'This is live running order, not classified result — a driver who has not yet served a penalty or pitted may be flattered by it.',
  },
  driver: {
    title: 'Driver',
    what: 'Driver number, three-letter code and team colour.',
    why: 'The team colour groups team-mates, which is how you spot a team split strategy at a glance.',
    reading: 'Two cars of the same colour on different tyres usually means the team is hedging.',
  },
  gapToLeader: {
    title: 'Gap to leader',
    what: 'Time between this driver and the race leader, in seconds.',
    why: 'It shows the shape of the race — whether the field is strung out or packed together.',
    reading:
      'Once a driver is lapped this becomes "+1 LAP" and is no longer a time. A gap growing by a steady amount each lap is a genuine pace difference, not traffic.',
  },
  interval: {
    title: 'Interval',
    what: 'Time to the car directly ahead on track.',
    why: 'This is the number that decides whether an attack, a pit stop or a DRS pass is possible.',
    reading:
      'Under 1.0s means DRS is available on the next detection point. Under about 2.5s means the following car is losing downforce in dirty air and will hurt its tyres.',
  },
  lastLap: {
    title: 'Last lap',
    what: 'The driver’s most recently completed lap time.',
    why: 'The rawest read on current pace and tyre condition.',
    reading:
      'A lap 1–2s off the driver’s own best usually means traffic, tyre drop-off, or fuel saving. A single very slow lap is normally a pit stop or a yellow flag.',
  },
  bestLap: {
    title: 'Best lap',
    what: 'Fastest lap the driver has set so far in this session.',
    why: 'In qualifying it is the result; in a race it hints at a car’s one-lap potential.',
    reading:
      'In a race, best laps are usually set late on fresh tyres and low fuel, so comparing them across drivers can be misleading.',
  },
  sector: {
    title: 'Sector time',
    what: 'Time for one of the three timed parts of the lap.',
    why: 'Sectors show where time is being won or lost, which points at the cause.',
    reading:
      'Purple is the fastest anyone has gone in this session, green is the driver’s own best, yellow is slower than their own best. Losing time in only one sector suggests a specific corner or traffic, not general pace.',
  },
  tyre: {
    title: 'Tyre',
    what: 'Current compound and how many laps are on that set.',
    why: 'Compound and age together explain most of the pace differences you see.',
    reading:
      'A soft tyre is fastest but drops off first. High age on a soft is the classic setup for an undercut by a car behind on fresher rubber.',
  },
  pits: {
    title: 'Stops',
    what: 'Number of pit stops made so far.',
    why: 'Tells you whether a driver is on a one, two or three-stop plan.',
    reading:
      'A driver with fewer stops than those around them is carrying older tyres and must defend; one with more stops has fresher tyres and should be catching.',
  },
  trackStatus: {
    title: 'Track status',
    what: 'Current flag state, derived from race control messages.',
    why: 'Flags change what lap times mean and open or close strategy windows.',
    reading:
      'Under a safety car or VSC the field slows, so a pit stop costs far less time than normal — this is the cheapest moment in a race to stop.',
  },
  trackTemp: {
    title: 'Track temperature',
    what: 'Surface temperature of the circuit.',
    why: 'It drives how quickly tyres reach their working range and how fast they degrade.',
    reading:
      'A hot track accelerates degradation and favours harder compounds; a cold track makes it hard to switch tyres on, especially over one lap.',
  },
  airTemp: {
    title: 'Air temperature',
    what: 'Ambient air temperature at the circuit.',
    why: 'Affects engine cooling and, with track temperature, the tyre picture.',
    reading:
      'A large gap between air and track temperature means strong sun on the surface, which usually means higher degradation than the air alone suggests.',
  },
  rainfall: {
    title: 'Rainfall',
    what: 'Whether rain is falling at the circuit right now.',
    why: 'Rain resets strategy entirely and is the single biggest source of position change.',
    reading:
      'The flag reports rain at the weather station only; one corner can be wet while the rest of the lap is dry.',
  },
  windSpeed: {
    title: 'Wind',
    what: 'Wind speed and direction at the circuit.',
    why: 'A shifting wind changes car balance corner by corner.',
    reading:
      'A headwind into a braking zone helps stopping but costs straight-line speed; a tailwind into a fast corner is a common cause of sudden oversteer and lock-ups.',
  },
} as const satisfies Record<string, MetricExplanation>;

export type MetricKey = keyof typeof METRICS;

export function explain(key: MetricKey): MetricExplanation {
  return METRICS[key];
}
