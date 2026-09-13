/**
 * How each prediction card was computed, for its (i).
 *
 * The brief requires every estimate to explain itself and never pass as fact, so
 * each entry answers: what is being estimated, how the number is produced, and how
 * far to trust it — including, where it exists, how often the method was right on
 * finished 2025 races. Those hit rates come from `evaluate.ts` and are quoted as
 * measured, low ones included.
 */

export interface MethodExplanation {
  title: string;
  estimates: string;
  computed: string;
  trust: string;
}

export const METHODS = {
  tyrePerformance: {
    title: 'Tyre performance',
    estimates:
      'For each tyre type used so far: how much time it loses per lap as it wears, how much slower it is than the quickest type, and whether it is falling off a cliff.',
    computed:
      'Every stint gets a straight line through its clean laps. Wear is the middle value of those slopes. The pace gap is measured within the same car, from drivers who used two types, at five laps old. A cliff is flagged when laps across all stints bend upward more than chance would explain.',
    trust:
      'Checked on three 2025 races by predicting each car’s lap five laps ahead: within half a second 76% of the time. Early in a race there are few laps and the grade says so.',
  },
  tyreLife: {
    title: 'Tyre life',
    estimates:
      'How many more laps the current tyres are worth keeping before a new set plus the time lost in the pit lane would be quicker.',
    computed:
      'Wear per lap times the tyre’s age says how much slower it is than a new set every lap. Laps left is the pit-lane cost divided by that. Only this stint’s clean laps are used.',
    trust:
      'It says when stopping starts to pay, not when a team will stop. Teams stop for track position and rules too, so on 2025 races the real stop was within five laps of this estimate only 27% of the time.',
  },
  pitWindow: {
    title: 'Pit window',
    estimates:
      'The best lap for the next stop, the laps around it that cost little extra, and where the driver would come out if they stopped now.',
    computed:
      'The race is split into stints of equal length, counting laps already on the tyres, with the number of stops that loses least time overall. The window is every lap within a second of the best. Rejoining adds the pit-lane cost to the gap to the leader. That cost comes from this session’s own stops once two have been seen.',
    trust:
      'On 2025 races, the real stop fell inside the window predicted five laps earlier 52% of the time — teams often stop early to attack or defend. The rejoin position was right within one place 55% of the time.',
  },
  battleForecast: {
    title: 'Battle forecast',
    estimates: 'How many laps until the chasing car is within one second, close enough to use DRS.',
    computed:
      'Two reads of how fast the gap is closing are averaged: what it did over the last three laps, and each car’s predicted lap times including tyre wear. The gap is then moved forward a lap at a time.',
    trust:
      'On 2025 races it was within two laps, or rightly said "not soon", 54% of the time. Traffic, a driver saving tyres or a mistake changes it quickly.',
  },
  overtake: {
    title: 'Overtake chance',
    estimates: 'A rough chance that the chasing car is ahead within five laps.',
    computed:
      'A formula weighing the gap, the pace difference over the last three laps, the difference in tyre age and in tyre type. The weights were fitted on every close fight in the dry 2024 and 2025 races, leaving out passes caused by pit stops or safety cars.',
    trust:
      'It is a probability, not a call: 30% means it happens in about three fights out of ten. Fitted on 11,126 fights with 1,438 passes. On three 2025 races it left out, its chances were 29% closer to what happened than always guessing the usual 13%. Gap and pace matter most; the tyre type adds little once tyre age is known. Rain is outside what it was fitted on.',
  },
  strategyBattle: {
    title: 'Pit strategy battle',
    estimates: 'Who finishes ahead if each of two drivers stops once or twice in total.',
    computed:
      'Each driver’s rest of the race is projected lap by lap for both plans, with stops placed at the best laps, and new tyres assumed to wear like the current ones. When both have one stop left, the same undercut projection as the Engineer view is used.',
    trust:
      'On 2025 races, with the strategies the drivers really used, it named the car that finished ahead 75% of the time. It ignores traffic and safety cars still to come.',
  },
  cheapStop: {
    title: 'Safety car cheap stop',
    estimates:
      'Which drivers would gain places by stopping now rather than later under green flags, and by how many.',
    computed:
      'A stop now costs about 45% of the usual pit-lane time behind a safety car, 60% behind a virtual one. Each driver’s gap plus that cost says where they rejoin; the same with the full cost says where a later stop puts them.',
    trust:
      'The discount is a rule of thumb, not measured. On 2025 races the predicted rejoin place was within two of the real one 71% of the time; the field keeps bunching after the call.',
  },
  practiceForecast: {
    title: 'What practice says about the race',
    estimates:
      'Race tyre wear per type from long runs, the lap time needed to reach Q3, and how much faster each car could have gone.',
    computed:
      'Long runs of five or more clean laps give a wear slope each, with fuel burn added back. The Q3 cut-off takes the tenth-best practice 3 lap and subtracts the usual improvement into qualifying, measured over the 2024 and 2025 weekends. The best possible lap adds up each driver’s best sectors.',
    trust:
      'Practice runs are short and pushed, so wear comes out higher than in the race: at Bahrain 2025 it was 0.08 to 0.15 seconds per lap too high. Treat it as an order, not a number. The Q3 improvement is usually 0.5 to 1 second (median 0.69 over 25 weekends), but where practice 3 runs in daytime heat and qualifying at night it can be nearly 2: at Bahrain 2025 the estimate was 1.2 seconds too slow.',
  },
} as const satisfies Record<string, MethodExplanation>;

export type MethodKey = keyof typeof METHODS;
