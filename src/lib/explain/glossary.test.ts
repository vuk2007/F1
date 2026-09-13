import { describe, expect, it } from 'vitest';
import {
  GLOSSARY,
  GLOSSARY_TERMS,
  SIMPLE_EQUIVALENT,
  isGlossaryKey,
  parseLinks,
  type GlossaryKey,
} from './glossary';
import { METRICS } from './metrics';

const KEYS = Object.keys(GLOSSARY) as GlossaryKey[];

/** Every term the brief requires an entry for. */
const REQUIRED: GlossaryKey[] = [
  'gap',
  'interval',
  'lapTime',
  'sector',
  'sectorColours',
  'compound',
  'soft',
  'medium',
  'hard',
  'intermediate',
  'wet',
  'tyreAge',
  'stint',
  'pitStop',
  'pitLoss',
  'undercut',
  'overcut',
  'drs',
  // 2026 regulations.
  'overtakeMode',
  'boostMode',
  'activeAero',
  'energyHarvesting',
  'liftAndCoast',
  'batteryState',
  'safetyCar',
  'vsc',
  'trackTemp',
  'airTemp',
  'degradation',
  'delta',
];

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The text a reader actually sees outside links. */
function unlinkedText(text: string): string {
  return parseLinks(text)
    .map((part) => (part.type === 'text' ? part.value : ' '))
    .join('');
}

describe('glossary', () => {
  it('covers every term the newcomer view needs', () => {
    for (const key of REQUIRED) expect(GLOSSARY[key], key).toBeDefined();
  });

  it('answers what, why and what to watch for in every entry', () => {
    for (const key of KEYS) {
      const entry = GLOSSARY[key];
      expect(entry.title.length, `${key} title`).toBeGreaterThan(0);
      expect(entry.what.length, `${key} what`).toBeGreaterThan(20);
      expect(entry.why.length, `${key} why`).toBeGreaterThan(20);
      expect(entry.watch.length, `${key} watch`).toBeGreaterThan(20);
    }
  });

  it('only links to entries that exist', () => {
    for (const key of KEYS) {
      for (const part of ['what', 'why', 'watch'] as const) {
        for (const link of parseLinks(GLOSSARY[key][part])) {
          if (link.type === 'link')
            expect(isGlossaryKey(link.key), `${key}.${part} -> ${link.key}`).toBe(true);
        }
      }
    }
  });

  it('never uses another entry’s jargon without linking to it', () => {
    /*
     * The rule from the brief, made mechanical. A definition that says "within DRS
     * range" to someone who does not know what DRS is explains nothing.
     */
    const problems: string[] = [];
    for (const key of KEYS) {
      for (const part of ['what', 'why', 'watch'] as const) {
        // An entry may use its own words freely; strip them first so "virtual safety
        // car" inside the VSC entry is not read as an unlinked "safety car".
        let text = unlinkedText(GLOSSARY[key][part]);
        for (const own of GLOSSARY_TERMS[key]) {
          text = text.replace(new RegExp(`\\b${escape(own)}\\b`, 'gi'), ' ');
        }
        for (const other of KEYS) {
          if (other === key) continue;
          for (const term of GLOSSARY_TERMS[other]) {
            if (new RegExp(`\\b${escape(term)}\\b`, 'i').test(text)) {
              problems.push(`${key}.${part} says "${term}" without linking to ${other}`);
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('maps engineer metrics only onto real entries', () => {
    for (const [metric, key] of Object.entries(SIMPLE_EQUIVALENT)) {
      expect(metric in METRICS, metric).toBe(true);
      expect(isGlossaryKey(key!), `${metric} -> ${key}`).toBe(true);
    }
  });
});

describe('parseLinks', () => {
  it('splits text around links and keeps explicit labels', () => {
    expect(parseLinks('Under one second gives [[drs|DRS]] on straights.')).toEqual([
      { type: 'text', value: 'Under one second gives ' },
      { type: 'link', key: 'drs', label: 'DRS' },
      { type: 'text', value: ' on straights.' },
    ]);
  });

  it('labels a bare link with the entry title in lower case', () => {
    expect(parseLinks('See the [[gap]].')).toEqual([
      { type: 'text', value: 'See the ' },
      { type: 'link', key: 'gap', label: 'gap' },
      { type: 'text', value: '.' },
    ]);
  });

  it('returns plain text untouched', () => {
    expect(parseLinks('No links here.')).toEqual([{ type: 'text', value: 'No links here.' }]);
  });
});
