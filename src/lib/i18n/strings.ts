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

  live: {
    heading: 'Live timing',
    /* The toggle. "Replay" is the OpenF1 path, which is everything else in the app. */
    modeLive: 'Live',
    modeReplay: 'Replay',
    waitingHeading: 'Waiting for the session',
    waitingBody:
      'Connected to the bridge. Between sessions the feed sends nothing at all, so this is what a working connection looks like when no cars are on track.',
    noBridgeHeading: 'No bridge running',
    noBridgeBody:
      'Live timing comes from a small process on this machine, not from the website. Start it with `pnpm bridge` and this page will connect on its own.',
    connected: 'Bridge connected',
    disconnected: 'Bridge offline',
    feedUp: 'Feed live',
    feedDown: 'Feed down',
    following: 'Following live',
    holding: 'Scrubbed back',
    jumpToLive: 'Jump to live',
    lastMessage: (seconds: number) =>
      seconds < 1 ? 'updated just now' : `updated ${Math.round(seconds)}s ago`,
    noMessages: 'nothing received yet',
    rows: (n: number) => `${n.toLocaleString()} rows`,
    /* Loading a recording the bridge wrote, as an offline replay source. */
    openRecording: 'Open a recording',
    recordingHint: 'A .jsonl file written by the bridge.',
    recordingLoaded: (messages: number, skipped: number) =>
      skipped > 0
        ? `${messages.toLocaleString()} messages, ${skipped.toLocaleString()} unreadable`
        : `${messages.toLocaleString()} messages`,
    recordingFailed: 'That file could not be read as a recording.',
    replayingRecording: 'Replaying a recording',
    backToLive: 'Back to live',
    loadingRecordingHeading: 'Reading the recording',
    loadingRecordingBody: 'A full session is a large file; this can take a few seconds.',
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

  pace: {
    heading: 'Pace comparison',
    empty: 'Select drivers to compare their lap times.',
    fastest: 'fastest',
    full: (n: number) => `Up to ${n} drivers at once`,
    note: 'Median of each driver’s representative laps. Pit laps, safety car laps and laps in traffic are excluded, and gaps in a line are those excluded laps.',
  },

  trackMap: {
    heading: 'Track map',
    loading: 'Loading track position...',
    noData: 'No track position recorded for this lap.',
    altText: 'Map of the circuit traced from the car, coloured by speed',
    slow: 'Slow',
    fast: 'Fast',
    braking: 'Braking',
    zones: (n: number) => `${n} braking zone${n === 1 ? '' : 's'}`,
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

  /* The newcomer view. Written for someone who has never watched a race. */
  simple: {
    modeLabel: 'View',
    modeSimple: 'Simple',
    modeEngineer: 'Engineer',
    modeHint: 'Simple explains the session in plain words; Engineer shows the full timing screen.',
    guide: 'Guide',
    rightNow: 'Right now',
    story: 'Race story',

    flag: {
      green: 'Green',
      yellow: 'Yellow flag',
      sc: 'Safety Car',
      vsc: 'Virtual SC',
      red: 'Red flag',
      chequered: 'Chequered',
      unknown: 'Not started',
    } as Record<string, string>,

    lapOf: (lap: number, total: number) => `Lap ${lap} of ${total}`,
    lapOnly: (lap: number) => `Lap ${lap}`,
    notStarted: 'Not started',
    weather: (raining: boolean, trackTemp: number | null) =>
      `${raining ? 'raining' : 'dry'}${trackTemp == null ? '' : `, ${Math.round(trackTemp)} °C track`}`,

    compoundPlural: {
      SOFT: 'softs',
      MEDIUM: 'mediums',
      HARD: 'hards',
      INTERMEDIATE: 'intermediates',
      WET: 'wets',
    } as Record<string, string>,

    status: {
      waiting: 'Waiting to start',
      leading: 'Leading',
      fastest: 'Fastest so far',
      behind: (seconds: string) => `${seconds} s behind`,
      offFastest: (seconds: string) => `${seconds} s off the fastest`,
      lapped: (label: string) => {
        const laps = Number(label.replace(/[^0-9]/g, '')) || 1;
        return `${laps} ${laps === 1 ? 'lap' : 'laps'} down`;
      },
      onTyres: (age: number, compound: string) =>
        age <= 1 ? `on new ${compound}` : `on ${age}-lap-old ${compound}`,
      justPitted: (compound: string) => `just pitted for new ${compound}`,
    },

    badges: {
      fastestLap: 'Fastest lap',
      underInvestigation: 'Under investigation',
      pitSoon: 'Pit soon',
      undercutThreat: 'Undercut threat',
      freshTyres: 'Fresh tyres',
    } as Record<string, string>,

    /* The one-second rule, named for the era the session ran in. See lib/season.ts. */
    attackRange: {
      drs: { badge: 'DRS range', phrase: 'within DRS range', name: 'DRS' },
      'overtake-mode': {
        badge: 'OM range',
        phrase: 'in Overtake Mode range',
        name: 'Overtake Mode',
      },
    },

    cards: {
      heading: 'Running order',
      tapHint: 'Tap a driver to see their race in detail.',
      selected: 'Showing below',
      legendGap: 'Gap',
      legendTyre: 'Tyre',
      legendAge: 'Tyre age',
    },

    battles: {
      heading: 'Key battles',
      none: 'No two cars are close enough to be fighting right now.',
      forPosition: (position: number) => `for P${position}`,
      trend: {
        closing: 'closing',
        stable: 'stable',
        opening: 'pulling away',
        unknown: 'too early to tell',
      } as Record<string, string>,
      trendHint: 'Change over the last 3 laps',
    },

    rightNowText: {
      waiting: 'The session has not started yet. Press play to begin the replay.',
      red: 'Red flag: the session is stopped and the cars are heading back to the pit lane.',
      sc: 'Safety car on track: the field is bunched up behind it, and a pit stop is much cheaper than usual.',
      vsc: 'Virtual safety car: every driver has to slow down, so gaps are frozen and pit stops are cheaper.',
      rain: 'It is raining: grip is dropping and teams may switch to wet-weather tyres.',
      chequeredRace: (winner: string) => `Chequered flag: ${winner} wins the race.`,
      chequeredOther: (fastest: string) => `Session over: ${fastest} set the fastest lap.`,
      finalLaps: (lapsLeft: number, leader: string, second: string, gap: string) =>
        lapsLeft <= 0
          ? `Final lap: ${leader} leads ${second} by ${gap} s.`
          : `${lapsLeft} ${lapsLeft === 1 ? 'lap' : 'laps'} to go: ${leader} leads ${second} by ${gap} s.`,
      finalLapsAlone: (lapsLeft: number, leader: string) =>
        lapsLeft <= 0
          ? `Final lap: ${leader} leads.`
          : `${lapsLeft} ${lapsLeft === 1 ? 'lap' : 'laps'} to go, and ${leader} leads.`,
      pits: (names: string, many: boolean) =>
        `${names} ${many ? 'are' : 'is'} in the pit lane for fresh tyres.`,
      /* `range` is the era's phrase when the chaser is within a second, e.g. "in Overtake Mode range". */
      battle: (
        chaser: string,
        ahead: string,
        gap: string,
        position: number,
        trend: string,
        range: string | null = null,
      ) =>
        `Closest fight: ${chaser} is ${gap} s behind ${ahead} for P${position}${
          range ? `, ${range}` : ''
        }${
          trend === 'closing' ? ', and closing' : trend === 'opening' ? ', but dropping back' : ''
        }.`,
      leaderRace: (leader: string, second: string, gap: string) =>
        `${leader} leads the race, ${gap} s ahead of ${second}.`,
      leaderAlone: (leader: string) => `${leader} leads the race.`,
      fastest: (leader: string, second: string, gap: string) =>
        `${leader} is fastest so far, ${gap} s quicker than ${second}.`,
      fastestAlone: (leader: string) => `${leader} has the fastest lap so far.`,
      and: 'and',
    },

    captions: {
      notEnough: 'Not enough clean laps yet to read a trend.',
      rising: (perLap: string, compound: string) =>
        `Lap times going up by about ${perLap} s per lap on the ${compound}: the tyres are wearing out.`,
      hiddenByFuel: (perLap: string, compound: string) =>
        `The ${compound} are losing about ${perLap} s per lap, but lap times look flat because the car gets lighter as fuel burns off.`,
      steady: (compound: string) =>
        `Lap times holding steady on the ${compound}: no measurable tyre wear yet.`,
      falling: (perLap: string, compound: string) =>
        `Lap times falling by about ${perLap} s per lap on the ${compound}, usually because the track is gaining grip.`,
      paceLeader: (fastest: string, other: string, perLap: string) =>
        `${fastest} is quickest here, about ${perLap} s a lap faster than ${other} on a typical lap.`,
      paceTied: (a: string, b: string) => `${a} and ${b} are matched on pace, lap for lap.`,
      paceSingle: (driver: string, lap: string) => `A typical clean lap for ${driver} is ${lap}.`,
      telemetryCompare: (ahead: string, behind: string, seconds: string) =>
        `Over this lap ${ahead} finished ${seconds} s ahead of ${behind}; the Delta chart shows where it was won.`,
      telemetryEven: (a: string, b: string) =>
        `${a} and ${b} finished this lap level; the Delta chart shows where each gained.`,
      telemetrySingle: (driver: string, speed: number, flatOut: number) =>
        `${driver} reached ${speed} km/h and was flat out for ${flatOut}% of this lap.`,
    },

    onboarding: {
      title: 'How to read this page',
      steps: [
        {
          heading: 'This is the order',
          body: 'Each card is one driver, top to bottom in their current race position. The coloured stripe is their team.',
        },
        {
          heading: 'This is the gap',
          body: 'The line under each name says how far behind the car in front they are, in seconds. Smaller means a fight.',
        },
        {
          heading: 'This is the tyre',
          body: 'The coloured circle is the tyre type (red soft, yellow medium, white hard) and the number is how many laps it has done. Older tyres are slower.',
        },
        {
          heading: 'Tap a driver',
          body: 'Tap any card to see that driver’s race in detail. Every (i) explains the number next to it.',
        },
      ],
      next: 'Next',
      back: 'Back',
      done: 'Got it',
      skip: 'Skip',
      stepOf: (step: number, total: number) => `${step} of ${total}`,
    },

    explain: {
      what: 'What it is',
      why: 'Why it matters',
      watch: 'What to watch for',
      back: 'Back',
    },

    /* Prediction cards. Every figure is an estimate and the wording says so. */
    predictions: {
      heading: 'Predictions',
      subheading:
        'Estimates worked out from the laps run so far, not facts. They change as the session goes on.',
      estimate: 'Estimate',
      confidence: {
        low: 'Low confidence',
        medium: 'Medium confidence',
        high: 'High confidence',
      } as Record<string, string>,
      notEnough: 'Not enough data yet',
      method: {
        estimates: 'What it estimates',
        computed: 'How it is worked out',
        trust: 'How far to trust it',
      },
      methodButton: (title: string) => `How is the ${title.toLowerCase()} estimate worked out?`,
      selectDriver: 'Tap a driver above to see their tyre life, pit window and strategy estimates.',

      tyres: {
        title: 'Tyre performance',
        fastest: 'quickest tyre',
        slower: (seconds: string) => `about ${seconds} s a lap slower than the quickest`,
        paceUnknown: 'pace gap not measurable yet',
        wear: (seconds: string) => `loses about ${seconds} s a lap as it wears`,
        noWear: 'no measurable wear yet',
        cliff: 'Dropping off: lap times are rising faster and faster',
        chartTitle: 'Estimated lap time by tyre age, against the quickest tyre when 5 laps old',
        axisAge: 'Tyre age (laps)',
        tooltipAge: (age: number) => `${age} ${age === 1 ? 'lap' : 'laps'} old`,
        slowerBy: (seconds: string) => `+${seconds} s`,
        fasterBy: (seconds: string) => `−${seconds} s`,
      },

      life: {
        title: (driver: string) => `Tyre life · ${driver}`,
        lapsLeft: (laps: number) =>
          `About ${laps} more ${laps === 1 ? 'lap' : 'laps'} before a stop pays off`,
        toTheEnd: 'These tyres should be worth keeping to the flag',
        spent: 'A new set would already be quicker, stop included',
        tyres: (age: number, compound: string) => `on ${age}-lap-old ${compound}`,
      },

      pit: {
        title: (driver: string) => `Pit window · ${driver}`,
        best: (lap: number) => `Best lap to stop: ${lap}`,
        window: (from: number, to: number) =>
          from === to ? `Window: lap ${from}` : `Window: laps ${from}–${to}`,
        noStop: 'No further stop needed on these numbers',
        rejoin: (position: number, behind: string | null, gap: string | null) =>
          behind
            ? `If they pit now: back out in P${position}, ${gap} s behind ${behind}`
            : `If they pit now: back out in P${position}, still leading`,
        rejoinUnknown: 'Where they would rejoin needs a timed gap to the leader',
        pitLoss: (seconds: string) => `A stop costs about ${seconds} s`,
        source: {
          observed: (stops: number) => `measured from ${stops} stops in this race`,
          circuit: 'typical for this circuit until 2 stops are seen',
          fallback: 'general figure until 2 stops are seen',
        },
      },

      battles: {
        title: 'Battle forecast',
        overtakeTitle: 'Overtake chance',
        none: 'No two cars are within 3 s of each other right now.',
        pair: (chaser: string, ahead: string, position: number) =>
          `${chaser} chasing ${ahead} for P${position}`,
        gap: (seconds: string) => `${seconds} s apart`,
        /* `range` is the era's phrase: "within DRS range" or "in Overtake Mode range". */
        inRange: (range: string) => `Already ${range}`,
        rangeIn: (range: string, laps: number) =>
          `${range.charAt(0).toUpperCase()}${range.slice(1)} in about ${laps} ${laps === 1 ? 'lap' : 'laps'}`,
        notBeforeEnd: (range: string) => `Not ${range} before the end`,
        omNextLap: (available: boolean) => `Overtake Mode available next lap: ${available ? 'yes' : 'no'}`,
        overtake: (percent: number) => `${percent}% chance of a pass within 5 laps`,
      },

      strategy: {
        title: 'Pit strategy battle',
        against: 'against',
        legendRun: 'Run so far',
        legendProjected: 'Projected, best plan',
        lap: (lap: number) => `Lap ${lap}`,
        combo: (x: string, xStops: number, y: string, yStops: number) =>
          `${x} ${xStops}-stop · ${y} ${yStops}-stop`,
        ahead: (label: string, seconds: string) => `${label} ahead by ${seconds} s`,
        level: 'level at the flag',
        stops: (stops: number) => `${stops} ${stops === 1 ? 'stop' : 'stops'} in total`,
        unavailable: 'Both drivers need a measured stint on their current tyres first.',
      },

      cheap: {
        sc: 'Safety car: cheap stop',
        vsc: 'Virtual safety car: cheap stop',
        cost: (reduced: string, normal: string) =>
          `A stop now costs about ${reduced} s instead of ${normal} s.`,
        gain: (now: number, green: number) => `stop now: P${now} instead of P${green} later`,
        places: (places: number) => `+${places} ${places === 1 ? 'place' : 'places'}`,
        stillNeeds: 'still has to stop',
        nobody: 'Nobody gains a place by stopping now rather than later.',
      },

      practice: {
        title: 'What this session says',
        wear: 'Race tyre wear, from long runs',
        wearValue: (seconds: string) => `about ${seconds} s a lap`,
        runs: (runs: number) => `${runs} ${runs === 1 ? 'run' : 'runs'}`,
        q3: 'Lap time likely needed to reach Q3',
        q3Value: (time: string) => `about ${time}`,
        q3From: (time: string) => `tenth best here ${time}`,
        theory: 'Best lap against best possible',
        theoryRow: (actual: string, theoretical: string) =>
          `${actual} set · ${theoretical} possible`,
        left: (seconds: string) => `${seconds} s left`,
      },
    },
  },

  common: {
    noValue: '—',
    laps: 'laps',
    lap: 'lap',
    loading: 'Loading...',
  },
} as const;

export type Strings = typeof strings;
