/**
 * Every user-facing string in the app.
 *
 * Nothing outside this file should contain display text. Translating later means
 * adding a second object with the same shape and choosing between them here.
 */
export const strings = {
  app: {
    name: 'Pit Wall',
    tagline: 'Replay any Formula 1 session and understand what the data is telling you.',
  },

  picker: {
    heading: 'Choose a session',
    year: 'Season',
    meeting: 'Grand Prix',
    session: 'Session',
    loadingYears: 'Loading seasons...',
    loadingMeetings: 'Loading race weekends...',
    loadingSessions: 'Loading sessions...',
    noMeetings: 'No race weekends found for this season.',
    noSessions: 'No sessions found for this weekend.',
    open: 'Open session',
    selectMeetingFirst: 'Pick a Grand Prix to see its sessions.',
  },

  load: {
    heading: 'Downloading session',
    subheading: 'Data is fetched once and cached in your browser, so this is instant next time.',
    parts: {
      session: 'Session details',
      drivers: 'Drivers',
      laps: 'Lap times',
      stints: 'Tyre stints',
      pit: 'Pit stops',
      position: 'Track positions',
      intervals: 'Gaps and intervals',
      weather: 'Weather',
      race_control: 'Race control messages',
      done: 'Ready',
    } as Record<string, string>,
    rows: (n: number) => `${n.toLocaleString()} rows`,
    retry: 'Try again',
    backToPicker: 'Back to session list',
  },

  errors: {
    generic: 'Something went wrong loading this session.',
    lockedOutTitle: 'OpenF1 is temporarily locked',
    lockedOutBody:
      'A live F1 session is in progress. OpenF1 restricts all API access, including historical data, to paid key holders until the session ends. Try again once the session is over.',
    notFound: 'That session could not be found.',
  },

  replay: {
    play: 'Play',
    pause: 'Pause',
    speed: 'Speed',
    lap: 'Lap',
    elapsed: 'Elapsed',
    jumpToStart: 'Jump to start',
    scrubber: 'Replay position',
  },

  timing: {
    heading: 'Live timing',
    columns: {
      position: 'Pos',
      driver: 'Driver',
      gapToLeader: 'Gap',
      interval: 'Int',
      lastLap: 'Last lap',
      bestLap: 'Best lap',
      sector1: 'S1',
      sector2: 'S2',
      sector3: 'S3',
      tyre: 'Tyre',
      pits: 'Stops',
    },
    noData: 'No timing data yet at this point in the session.',
    outLap: 'OUT',
  },

  trackStatus: {
    green: 'Track clear',
    yellow: 'Yellow flag',
    sc: 'Safety car',
    vsc: 'Virtual safety car',
    red: 'Red flag',
    chequered: 'Chequered flag',
    unknown: 'No status',
  } as Record<string, string>,

  compounds: {
    SOFT: 'Soft',
    MEDIUM: 'Medium',
    HARD: 'Hard',
    INTERMEDIATE: 'Intermediate',
    WET: 'Wet',
    UNKNOWN: 'Unknown',
  } as Record<string, string>,

  driver: {
    selectPrompt: 'Select a driver from the timing table to see their race in detail.',
    lapChart: 'Lap times',
    stints: 'Stints',
    stint: (n: number) => `Stint ${n}`,
    laps: (from: number, to: number) => `Laps ${from}–${to}`,
    clean: 'clean',
    excluded: 'Excluded from fit',
    axisLap: 'Lap',
    axisTime: 'Lap time (s)',
    measuredLap: 'Measured lap',
    fittedLine: 'Degradation fit',
    excludedLap: 'Excluded lap',
    tyreAge: 'Tyre age',
    noFit: 'Not enough clean laps to measure degradation.',
    relaxed:
      'Too few clean laps, so laps in traffic were included. Degradation is likely overstated.',
    perLap: 's/lap',
    outliersDropped: (n: number) => `${n} outlier lap${n === 1 ? '' : 's'} dropped`,
    reasons: {
      'no-time': 'No lap time recorded',
      'pit-in': 'Pit entry lap',
      'pit-out': 'Pit exit lap',
      caution: 'Safety car or red flag',
      traffic: 'Within 1.0s of the car ahead',
      outlier: 'Outlier, dropped from fit',
      'standing-start': 'Lap 1, standing start',
    } as Record<string, string>,
  },

  strategy: {
    heading: 'Strategy',
    pitWindow: 'Pit window',
    deficit: 'Deficit to fresh',
    breakEven: 'Break-even',
    pitLoss: 'Pit loss',
    measuredLane: 'measured lane time',
    lapsRemaining: 'Laps remaining',
    windowLaps: (from: number, to: number) => `Laps ${from}–${to}`,
    noWindow: 'No window',
    verdicts: {
      'pit-now': 'Pit now',
      'window-open': 'Window open',
      'window-approaching': 'Too early to stop',
      'too-late': 'Too late to gain',
      'stay-out': 'Stay out',
      unknown: 'Not enough data',
    } as Record<string, string>,
    verdictWhy: {
      'pit-now': 'The tyres are costing enough per lap that a stop repays itself quickly.',
      'window-open': 'A stop would pay for itself before the finish.',
      'window-approaching':
        'The tyres are not yet losing enough time for a stop to be worth its cost.',
      'too-late': 'Too few laps remain to recover the time a stop would cost.',
      'stay-out': 'A fresh set would not be quicker, so stopping only loses time.',
      unknown: 'Degradation could not be measured reliably for this stint.',
    } as Record<string, string>,
    raceOnly: 'Strategy analysis applies to races. This is a {type} session.',
    notStarted: 'Strategy appears once this driver has started a lap. Press play or scrub forward.',
  },

  telemetry: {
    heading: 'Telemetry',
    lap: 'Lap',
    compare: 'Compare with',
    noComparison: 'No comparison',
    fastest: 'fastest',
    speed: 'Speed',
    throttle: 'Throttle',
    brake: 'Brake',
    brakeHint: 'on / off',
    gear: 'Gear',
    delta: 'Delta',
    deltaHint: 'negative = first driver ahead',
    distance: 'Distance',
    topSpeed: 'Top speed',
    fullThrottle: 'Full throttle',
    loading: 'Loading telemetry for this lap...',
    loadingComparison: 'Loading the comparison lap...',
    noData: 'No telemetry available for this lap.',
    distanceNote:
      'Distance is integrated from speed and is accurate to about 1%, so it is an estimate rather than a track position.',
  },

  undercut: {
    heading: 'Undercut',
    ahead: 'Car ahead',
    behind: 'Car behind',
    none: 'No car',
    ifTheyPitNow: 'If they stop now and you respond one lap later',
    exitsAhead: (label: string) => `${label} comes out ahead`,
    by: 'by',
    noThreat: 'Not enough tyre advantage to change the order.',
    unavailable: 'Needs a measured degradation rate for both cars.',
    crossover: (lap: number) => `Order changes on lap ${lap}`,
  },

  safetyCar: {
    heading: 'Safety car opportunity',
    inactive: 'No caution period. A stop costs the full pit loss.',
    active: (kind: string) => `${kind} out — a stop is cheap right now`,
    kinds: {
      sc: 'Safety car',
      vsc: 'Virtual safety car',
      red: 'Red flag',
    } as Record<string, string>,
    normalLoss: 'Normal pit loss',
    nowCosts: 'Costs now',
    saving: 'Saving',
    biggestGain: 'Gains most from stopping now',
    unlocked: 'caution makes this stop worth it',
    estimate: 'Reduction factors are rules of thumb, not measurements.',
  },

  practice: {
    heading: 'Session analysis',
    theoretical: 'Theoretical best',
    actualBest: 'Best lap',
    timeLeft: 'Time left on the table',
    perfectLap: 'Best lap already used every best sector',
    sectors: 'Best sectors',
    fromLap: (n: number) => `lap ${n}`,
    runs: 'Runs',
    runKinds: {
      short: 'Qualifying sim',
      long: 'Race sim',
      installation: 'No timed laps',
    } as Record<string, string>,
    laps: 'laps',
    best: 'Best',
    average: 'Avg',
    spread: 'Spread',
    noRuns: 'No runs recorded for this driver.',
    longRunSummary: 'Long-run pace',
    shortRunSummary: 'One-lap pace',
    noLongRun: 'No race simulation in this session.',
    noShortRun: 'No qualifying simulation in this session.',
    leaderboard: 'Theoretical best by driver',
  },

  common: {
    noValue: '—',
    laps: 'laps',
    lap: 'lap',
    loading: 'Loading...',
  },
} as const;

export type Strings = typeof strings;
