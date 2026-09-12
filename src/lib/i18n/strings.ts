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

  common: {
    noValue: '—',
    laps: 'laps',
    lap: 'lap',
    loading: 'Loading...',
  },
} as const;

export type Strings = typeof strings;
