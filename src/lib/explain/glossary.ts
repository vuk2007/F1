/**
 * Plain-language explanations for someone who has never watched Formula 1.
 *
 * `metrics.ts` explains numbers to a person who already knows the sport. This
 * explains the sport itself. Every entry answers the same three questions, in
 * this order: what it is, why it matters, and what to watch for.
 *
 * One rule is enforced by a test rather than by care: a definition may not lean
 * on another term without linking to it. `[[key]]` or `[[key|label]]` inside the
 * text becomes a link that opens that entry, and `glossary.test.ts` fails if any
 * entry mentions a term from `GLOSSARY_TERMS` without one. A beginner who does not
 * know what an interval is cannot be expected to learn it from a sentence that
 * also assumes they know what DRS is.
 */
import type { MetricKey } from './metrics';

export interface GlossaryEntry {
  title: string;
  what: string;
  why: string;
  watch: string;
}

export const GLOSSARY = {
  gap: {
    title: 'Gap',
    what: 'How far a driver is behind the race leader, measured in seconds.',
    why: 'It shows the shape of the race: whether the leader is running away or the field is packed together.',
    watch:
      'A number shrinking lap after lap means the car behind is faster right now. Once a driver has been lapped it shows "+1 LAP" instead of seconds.',
  },
  interval: {
    title: 'Interval',
    what: 'How far a driver is behind the car directly in front of them, in seconds. The [[gap]] is measured to the leader instead.',
    why: 'It decides whether an attack is possible: close enough, and the car behind can try to pass.',
    watch:
      'Under one second gives the chasing car [[drs|DRS]], an extra burst of speed on the straights. Under about two seconds the car behind starts to struggle in the turbulent air.',
  },
  lapTime: {
    title: 'Lap time',
    what: 'How long a driver took to complete one full lap of the circuit.',
    why: 'It is the simplest measure of how fast a driver is going right now.',
    watch:
      'One very slow lap usually means a [[pitStop|pit stop]] or a yellow flag, not a sudden loss of speed. Times creeping up over many laps point to [[degradation|tyres wearing out]].',
  },
  sector: {
    title: 'Sector',
    what: 'Each lap is split into three timed parts, called sectors, so you can see where on the track time is gained or lost.',
    why: 'A driver can be quick in one part of the lap and slow in another, which a single [[lapTime|lap time]] hides.',
    watch:
      'The colours tell you how good a sector was: see [[sectorColours|purple, green and yellow]].',
  },
  sectorColours: {
    title: 'Purple, green and yellow',
    what: "The colour of a [[sector]] or a [[lapTime|lap time]]. Purple is the fastest anyone has gone so far, green is the driver's own best, and yellow is slower than their own best.",
    why: 'It lets you spot a fast lap at a glance, without reading any numbers.',
    watch:
      'A run of purple means a driver is on a very quick lap. Yellow everywhere often means traffic, worn tyres or saving fuel.',
  },
  compound: {
    title: 'Tyre compound',
    what: 'The type of rubber on the car. Dry tyres come in [[soft]], [[medium]] and [[hard]]; for rain there are [[intermediate]] and [[wet]] tyres.',
    why: 'Softer rubber is faster but wears out sooner, so the choice of tyre shapes the whole race plan.',
    watch:
      'The coloured circle shows it: red for soft, yellow for medium, white for hard, green and blue for rain.',
  },
  soft: {
    title: 'Soft tyre',
    what: 'The fastest of the dry tyres, marked with a red circle.',
    why: 'It gives the most grip, so it is used for the quickest laps and for short bursts in a race.',
    watch:
      'It wears out fastest. A driver on old softs is vulnerable to cars behind on fresher tyres.',
  },
  medium: {
    title: 'Medium tyre',
    what: 'The middle dry tyre, marked with a yellow circle: a balance between speed and how long it lasts.',
    why: 'It is the most common race tyre, because it is quick enough and lasts a good number of laps.',
    watch:
      'Compare its lap times with drivers on [[soft|softs]] or [[hard|hards]] to see which choice is paying off.',
  },
  hard: {
    title: 'Hard tyre',
    what: 'The toughest dry tyre, marked with a white circle. It is the slowest, but lasts the longest.',
    why: 'It lets a driver run many laps in a row, which can save a whole [[pitStop|pit stop]].',
    watch:
      'Hards can take a few laps to warm up, so a driver who has just fitted them may look slow at first.',
  },
  intermediate: {
    title: 'Intermediate tyre',
    what: 'A grooved tyre for a damp or lightly wet track, marked with a green circle.',
    why: 'It clears some water while still working as the track dries out.',
    watch:
      'When the rain stops, the first driver to switch back to dry tyres can gain a lot of time, or spin off trying.',
  },
  wet: {
    title: 'Wet tyre',
    what: 'The tyre for heavy rain, with deep grooves, marked with a blue circle.',
    why: 'It pushes away large amounts of water so the car keeps its grip.',
    watch:
      'It is very slow on a drying track, so drivers switch to [[intermediate|intermediates]] as soon as they can.',
  },
  tyreAge: {
    title: 'Tyre age',
    what: 'How many laps the current set of tyres has done.',
    why: 'Older tyres are slower, so tyre age explains a lot of the speed difference between drivers.',
    watch:
      'A car on much newer tyres will usually be catching the car ahead. The count starts again after each [[pitStop|pit stop]].',
  },
  stint: {
    title: 'Stint',
    what: 'The laps a driver does on one set of tyres, from one [[pitStop|pit stop]] to the next.',
    why: 'Races are planned as a number of stints, and how long each one lasts is the heart of strategy.',
    watch:
      'Lap times usually get slower through a stint as the tyres wear, then drop back after the stop.',
  },
  pitStop: {
    title: 'Pit stop',
    what: 'When a driver comes into the pit lane for new tyres. The car is stationary for only two or three seconds.',
    why: 'Every driver must change tyres at least once in a dry race, and when they do it can win or lose positions.',
    watch: 'The whole stop costs far more than the stationary time: see [[pitLoss|pit loss]].',
  },
  pitLoss: {
    title: 'Pit loss',
    what: 'The total time a [[pitStop|pit stop]] costs compared with staying on track: slowing down, driving the pit lane under a speed limit, and the stop itself.',
    why: 'Every decision about when to stop is weighed against this number, usually around 20 seconds.',
    watch:
      'Under a [[safetyCar|safety car]] it is much smaller, which is why so many drivers stop at that moment.',
  },
  undercut: {
    title: 'Undercut',
    what: 'Stopping for new tyres before the car ahead, then using the extra speed of fresh tyres to be in front once they stop too.',
    why: 'It is one of the most common ways to pass a rival without overtaking on track.',
    watch:
      'It works best when the old tyres are badly worn and the [[interval]] to the car ahead is small. The opposite move is the [[overcut]].',
  },
  overcut: {
    title: 'Overcut',
    what: 'Staying out longer than the car ahead, hoping to be faster on track while they rejoin on cold new tyres or in traffic.',
    why: 'It can win a position when new tyres take time to warm up, or when a rival comes out behind slower cars.',
    watch: 'It tends to work where tyres wear slowly. It is the opposite of the [[undercut]].',
  },
  drs: {
    title: 'DRS',
    what: 'Drag Reduction System: a flap on the rear wing that opens on certain straights to give extra speed.',
    why: 'It helps the car behind get close enough to overtake.',
    watch:
      'A driver may only use it when within one second of the car ahead at a detection point, which is what "DRS range" on a card means. From 2026 it is replaced by a different overtaking aid.',
  },
  safetyCar: {
    title: 'Safety car',
    what: 'A road car that leads the field at reduced speed after a crash or when the track is dangerous. Overtaking is not allowed.',
    why: 'It bunches every car together, wiping out gaps built up over many laps.',
    watch:
      'A [[pitStop|pit stop]] costs much less time behind it, so watch for many drivers stopping at once. See also the [[vsc|virtual safety car]].',
  },
  vsc: {
    title: 'Virtual safety car',
    what: 'Instead of sending out a real car, every driver must slow to a set speed shown on their dashboard.',
    why: 'Gaps between cars stay roughly as they were, unlike a [[safetyCar|safety car]], which bunches them up.',
    watch:
      'Stopping during a virtual safety car is cheaper than normal, but saves less time than under a full [[safetyCar|safety car]].',
  },
  trackTemp: {
    title: 'Track temperature',
    what: 'How hot the surface of the circuit is.',
    why: 'Tyres behave differently on a hot or a cold track: heat makes them wear out faster.',
    watch:
      'A very hot track usually means more [[degradation|tyre wear]] and more [[pitStop|pit stops]].',
  },
  airTemp: {
    title: 'Air temperature',
    what: 'How warm the air is at the circuit.',
    why: 'It affects engine cooling and, together with the [[trackTemp|track temperature]], how the tyres behave.',
    watch:
      'When the track is much hotter than the air, the sun is heating the surface, and tyres tend to wear faster.',
  },
  degradation: {
    title: 'Tyre degradation',
    what: 'How much slower a driver gets each lap as their tyres wear out, in seconds per lap.',
    why: 'It decides how long a set of tyres can last, and so when a driver needs a [[pitStop|pit stop]].',
    watch:
      'Small numbers like 0.03 seconds per lap mean the tyres last well. Lap times suddenly getting much slower is called "the cliff".',
  },
  delta: {
    title: 'Delta',
    what: 'The time difference between two drivers at the same point on the track, or between two laps.',
    why: 'It shows exactly where on the lap one driver is gaining on the other.',
    watch:
      'A line going down means the first driver is gaining at that part of the track. A sudden step usually comes from braking later into a corner.',
  },
  flags: {
    title: 'Flags',
    what: 'The track status shown to drivers: green means racing, yellow means danger ahead so slow down, red means the session is stopped, and chequered means it is over.',
    why: 'Flags change what the numbers mean: lap times under a yellow flag or a [[safetyCar|safety car]] are not real racing pace.',
    watch:
      'The coloured chip at the top always shows the current status, including a [[safetyCar|safety car]] or a [[vsc|virtual safety car]].',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

/**
 * Words that are jargon to a newcomer, per entry. Used by the test that keeps
 * definitions self-contained: another entry may only use one of these words
 * inside a link. Matched as whole words, case-insensitively.
 */
export const GLOSSARY_TERMS: Record<GlossaryKey, readonly string[]> = {
  gap: ['gap'],
  interval: ['interval'],
  lapTime: ['lap time'],
  sector: ['sector'],
  sectorColours: ['purple'],
  compound: ['compound'],
  soft: ['soft tyre', 'softs'],
  medium: ['medium tyre', 'mediums'],
  hard: ['hard tyre', 'hards'],
  intermediate: ['intermediate', 'inters'],
  wet: ['wet tyre', 'wets'],
  tyreAge: ['tyre age'],
  stint: ['stint'],
  pitStop: ['pit stop', 'pit stops'],
  pitLoss: ['pit loss'],
  undercut: ['undercut'],
  overcut: ['overcut'],
  drs: ['DRS'],
  safetyCar: ['safety car'],
  vsc: ['virtual safety car', 'VSC'],
  trackTemp: ['track temperature'],
  airTemp: ['air temperature'],
  degradation: ['degradation'],
  delta: ['delta'],
  flags: [],
};

export function glossary(key: GlossaryKey): GlossaryEntry {
  return GLOSSARY[key];
}

export function isGlossaryKey(value: string): value is GlossaryKey {
  return Object.prototype.hasOwnProperty.call(GLOSSARY, value);
}

export type TextPart =
  { type: 'text'; value: string } | { type: 'link'; key: string; label: string };

const LINK = /\[\[([A-Za-z]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Splits definition text into plain runs and links. A link with no label shows
 * the linked entry's title in lower case, so `[[gap]]` reads as "gap".
 */
export function parseLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: 'text', value: text.slice(last, index) });
    const key = match[1]!;
    const label = match[2] ?? (isGlossaryKey(key) ? GLOSSARY[key].title.toLowerCase() : key);
    parts.push({ type: 'link', key, label });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

/**
 * Which beginner entry to show for an existing engineer metric, in Simple mode.
 * Metrics with no beginner equivalent keep their engineer text, relabelled.
 */
export const SIMPLE_EQUIVALENT: Partial<Record<MetricKey, GlossaryKey>> = {
  gapToLeader: 'gap',
  interval: 'interval',
  lastLap: 'lapTime',
  bestLap: 'lapTime',
  sector: 'sectorColours',
  tyre: 'compound',
  pits: 'pitStop',
  trackStatus: 'flags',
  trackTemp: 'trackTemp',
  airTemp: 'airTemp',
  degradationSlope: 'degradation',
  pitLoss: 'pitLoss',
  undercut: 'undercut',
  safetyCar: 'safetyCar',
  telemetryDelta: 'delta',
};
