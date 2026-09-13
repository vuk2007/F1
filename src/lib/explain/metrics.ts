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
      'Under 1.0s at the detection point unlocks the overtaking aid: DRS up to 2025, extra Overtake Mode energy from 2026. Under about 2.5s means the following car is losing downforce in dirty air and will hurt its tyres.',
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
  degradationSlope: {
    title: 'Degradation',
    what: 'Seconds of lap time lost for each lap of age on the current set of tyres.',
    why: 'It is the rate at which staying out costs you time, and it sets the whole pit window.',
    reading:
      'Monza-style low-degradation tracks sit near 0.03 s/lap; abrasive ones run several times that. A negative figure means no measurable drop-off, not that the tyres are improving. Race figures are corrected for fuel burn, which otherwise hides degradation entirely.',
  },
  degradationConfidence: {
    title: 'Fit confidence',
    what: 'How much the degradation number can be trusted, from the clean laps behind it.',
    why: 'A slope from four laps in traffic can say almost anything; the number alone hides that.',
    reading:
      'High means many clean laps with little scatter. Low or none means too few usable laps, or lap times too inconsistent to fit — treat any strategy call built on it as a guess.',
  },
  cleanLaps: {
    title: 'Clean laps',
    what: 'Laps used by the model, out of the laps in the stint.',
    why: 'Only representative laps say anything about tyre pace.',
    reading:
      'Pit in and out laps, laps under a safety car, and laps spent within a second of the car ahead are all discarded. A stint with few clean laps is mostly traffic, and its degradation figure is weak.',
  },
  perLapDeficit: {
    title: 'Deficit to fresh',
    what: 'How much time the current tyres give away every lap versus a brand new set.',
    why: 'This is the rate at which a pit stop is repaying itself.',
    reading:
      'It grows as the tyre ages. Once past roughly half a second a lap, a stop is usually overdue. A zero or negative figure means fresh rubber would not be any quicker.',
  },
  pitWindowRange: {
    title: 'Pit window',
    what: 'The laps on which stopping still gains time by the end of the race.',
    why: 'Stop too early and you give away track position; too late and the stop never pays for itself.',
    reading:
      'The window closes when too few laps remain to recover the time lost in the pit lane. No window means either the tyres are still too fresh to gain anything, or the race is too near its end.',
  },
  breakEvenLaps: {
    title: 'Break-even',
    what: 'Laps of running needed after a stop before it has paid back the time it cost.',
    why: 'It is the single number that decides whether a stop is worth making at all.',
    reading:
      'Compare it with the laps remaining. Fewer laps left than this and the stop loses you time, however worn the tyres are.',
  },
  pitLoss: {
    title: 'Pit loss',
    what: 'Total time a stop costs against staying on track.',
    why: 'Everything about pit strategy is measured against this number.',
    reading:
      'It is far more than the stationary time: entry, the lane at the speed limit, the stop, and the exit. The stationary part is only two or three seconds of it. This figure is a per-circuit estimate, shown alongside the pit-lane time actually measured this session.',
  },
  lapChart: {
    title: 'Lap times',
    what: 'Every lap of the session for this driver, with the fitted degradation line over each stint.',
    why: 'The shape of a stint tells you more than any single number.',
    reading:
      'Points above the line are laps that lost time; a stint bending upward away from its line is a tyre falling off the cliff. Faded hollow points were excluded from the fit — hover any point to see why. In a race the line often slopes gently downward even though degradation is positive: the car is getting lighter faster than the tyres are wearing out, and the quoted degradation figure has that fuel effect removed.',
  },
  telemetry: {
    title: 'Telemetry',
    what: 'Speed, throttle, brake and gear recorded around one lap, plotted against distance.',
    why: 'It shows how a lap time was actually produced, corner by corner.',
    reading:
      'Plotted against distance rather than time, so the same point on the x-axis is the same point on the track for both cars. Brake is on or off in this data, not a pressure. Distance is integrated from speed and is roughly 1% out.',
  },
  telemetryDelta: {
    title: 'Delta',
    what: 'Time difference between the two laps at each point on the track.',
    why: 'It turns two similar-looking traces into an exact answer about where the lap was won.',
    reading:
      'Negative means the first driver is ahead. What matters is the slope, not the value: a falling line means the first driver is gaining right there. A step down under braking is a later brake point; a steady drift on a straight is usually engine mode, slipstream, or the overtaking aid (DRS up to 2025, Overtake Mode or Boost from 2026).',
  },
  undercut: {
    title: 'Undercut',
    what: 'A projection of what happens if the car behind stops first and you respond a lap later.',
    why: 'It is the most common way track position changes without an overtake.',
    reading:
      'The undercut is worth roughly one lap of your current deficit to a fresh tyre. If that is smaller than the gap between you, it cannot work. Watch for the order changing and then changing back — a marginal undercut is often given away again, because the car that stopped early carries a permanently older tyre.',
  },
  safetyCar: {
    title: 'Safety car opportunity',
    what: 'What a pit stop costs while the field is neutralised, against what it costs under green.',
    why: 'A caution is the cheapest moment in a race to stop, and the window is seconds long.',
    reading:
      'The field slows but the pit lane limit does not, so the stop costs roughly half its normal price. The drivers who gain most are those for whom a stop was not previously worth making and now is. The reduction factors are rules of thumb, not measurements from this session.',
  },
  theoreticalBest: {
    title: 'Theoretical best lap',
    what: 'The driver’s best first sector plus best second plus best third, whichever laps they came from.',
    why: 'It separates what the car is capable of from what the driver actually strung together.',
    reading:
      'The gap to their real best lap is time left on the table — a driver several tenths adrift has the pace but has not put a lap together. A gap of zero means they nailed it.',
  },
  runKind: {
    title: 'Run type',
    what: 'Whether a run was a one-lap qualifying simulation or a longer race simulation.',
    why: 'The two answer different questions and cannot be compared with each other.',
    reading:
      'Short runs happen on fresh softs with low fuel and show ultimate pace. Long runs carry fuel and show tyre behaviour. A team quick on Friday short runs but poor on long runs usually struggles on Sunday.',
  },
  runConsistency: {
    title: 'Spread',
    what: 'How much the lap times varied across a run, in seconds.',
    why: 'A consistent long run means the tyre is stable and the driver is comfortable.',
    reading:
      'Under about two tenths is a clean, repeatable run. A large spread means traffic, mistakes, or a tyre that is moving around — and it makes any degradation figure from that run much weaker.',
  },
  longRunPace: {
    title: 'Long-run pace',
    what: 'Average lap time across the representative laps of a race simulation.',
    why: 'It is the best Friday predictor of Sunday race pace.',
    reading:
      'Compare it only against runs on the same compound with similar fuel. Laps outside 107% of the session best — in-laps, cool-down laps, garage time — are excluded, so the average reflects real running.',
  },
  trackMap: {
    title: 'Track map',
    what: 'The circuit traced from the car’s own position feed for the selected lap, coloured by speed.',
    why: 'It turns a number on the telemetry axis into a place you can point at.',
    reading:
      'Light means fast, dark means slow, and the orange overlay marks where the brake was on. The shape is the driver’s actual line, not an idealised circuit drawing, so it shifts slightly lap to lap. The open circle is where the lap started.',
  },
  paceComparison: {
    title: 'Pace comparison',
    what: 'Clean lap times for several drivers on one chart, with each driver’s median underneath.',
    why: 'It is the most direct answer to who actually had the pace, rather than who finished ahead.',
    reading:
      'Compare the medians, not the fastest laps — a single quick lap can come from clear air or a tow. Gaps in a line are laps that were excluded, so a driver is never made to look slow for pitting. Remember that cars on different tyres or fuel loads are not really comparable.',
  },
} as const satisfies Record<string, MetricExplanation>;

export type MetricKey = keyof typeof METRICS;

export function explain(key: MetricKey): MetricExplanation {
  return METRICS[key];
}
