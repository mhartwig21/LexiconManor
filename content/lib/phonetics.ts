import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Phonetics for the Music Room — BUILD-TIME ONLY (ARCHITECTURE §1, §11.7).
 * OWNER: A5.
 *
 * Backed by the CMU Pronouncing Dictionary (cmudict, public domain,
 * ~134k entries, ARPABET phones with stress digits), vendored at
 * `content/data/cmudict.dict`. Nothing here ships to the client: the rhyme
 * generator resolves every prompt's full accepted-rhyme set offline and the
 * game validates against that static list, so runtime rhyme checks are
 * exact-set lookups — phonetically sound because the SET was built
 * phonetically, with zero phonetics payload in the bundle.
 *
 * Rhyme model (the standard "perfect rhyme" definition):
 *   - A pronunciation's RHYME KEY is its phoneme tail from the last
 *     primary-stressed vowel (stress 1) to the end; if a word has no primary
 *     stress (rare function words), the last stressed vowel; failing that,
 *     the last vowel. Stress digits are stripped from the key so secondary
 *     stress differences don't split families.
 *   - Two words rhyme iff they share a rhyme key via at least one
 *     pronunciation each AND they are not homophones (no pronunciation of one
 *     is phone-identical to a pronunciation of the other — "four"/"fore"
 *     sound identical; identity is not rhyme).
 *   - Spelling is deliberately irrelevant: COUGH does not rhyme with DOUGH,
 *     and GREY does rhyme with WEIGH. That is the whole point.
 */

/** ARPABET vowel nuclei (stress digit stripped). */
const VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY',
  'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
]);

export interface Phonetics {
  /** All pronunciations of a word (lowercased lookup); [] if unknown. */
  pronsOf(word: string): readonly string[][];
  /** Every distinct rhyme key across the word's pronunciations. */
  rhymeKeysOf(word: string): string[];
  /** True if the words perfect-rhyme (share a key, are not homophones). */
  rhymesWith(a: string, b: string): boolean;
  /** True if any pronunciation of a is phone-identical to one of b. */
  isHomophone(a: string, b: string): boolean;
  /** Words known to the pronouncing dictionary. */
  has(word: string): boolean;
}

/** Rhyme key of a single pronunciation, or null if it has no vowel. */
export function rhymeKeyOfPron(pron: readonly string[]): string | null {
  const stressIndex = (want: (d: string) => boolean): number => {
    for (let i = pron.length - 1; i >= 0; i--) {
      const digit = pron[i]!.slice(-1);
      if (/[0-9]/.test(digit) && want(digit)) return i;
    }
    return -1;
  };
  let i = stressIndex((d) => d === '1');
  if (i < 0) i = stressIndex((d) => d === '2');
  if (i < 0) i = stressIndex(() => true); // any vowel
  if (i < 0) return null;
  return pron.slice(i).map((p) => p.replace(/[0-9]/, '')).join(' ');
}

function pronSignature(pron: readonly string[]): string {
  // Homophone comparison ignores stress (record/record would otherwise slip by
  // in one direction; for rhyming purposes same-phones = same-sound).
  return pron.map((p) => p.replace(/[0-9]/, '')).join(' ');
}

export function loadPhonetics(): Phonetics {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'cmudict.dict');
  if (!existsSync(path)) {
    throw new Error('content/data/cmudict.dict missing — vendored CMU dict required for rhyme generation.');
  }
  const prons = new Map<string, string[][]>();
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.split('#')[0]!.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    // Variants look like "word(2)"; fold them onto the base word.
    const word = parts[0]!.replace(/\(\d+\)$/, '').toLowerCase();
    if (!/^[a-z']+$/.test(word)) continue; // skip abbreviations/symbols
    const phones = parts.slice(1);
    const list = prons.get(word);
    if (list) list.push(phones);
    else prons.set(word, [phones]);
  }

  const keyCache = new Map<string, string[]>();
  const rhymeKeysOf = (word: string): string[] => {
    const w = word.toLowerCase();
    const cached = keyCache.get(w);
    if (cached) return cached;
    const keys: string[] = [];
    for (const pron of prons.get(w) ?? []) {
      const k = rhymeKeyOfPron(pron);
      if (k !== null && !keys.includes(k)) keys.push(k);
    }
    keyCache.set(w, keys);
    return keys;
  };

  const isHomophone = (a: string, b: string): boolean => {
    const pa = prons.get(a.toLowerCase()) ?? [];
    const pb = prons.get(b.toLowerCase()) ?? [];
    if (pa.length === 0 || pb.length === 0) return false;
    const sigs = new Set(pa.map(pronSignature));
    return pb.some((p) => sigs.has(pronSignature(p)));
  };

  return {
    pronsOf: (word) => prons.get(word.toLowerCase()) ?? [],
    rhymeKeysOf,
    isHomophone,
    has: (word) => prons.has(word.toLowerCase()),
    rhymesWith(a, b) {
      const wa = a.toLowerCase();
      const wb = b.toLowerCase();
      if (wa === wb) return false;
      const ka = rhymeKeysOf(wa);
      if (ka.length === 0) return false;
      const kb = rhymeKeysOf(wb);
      if (!kb.some((k) => ka.includes(k))) return false;
      return !isHomophone(wa, wb);
    },
  };
}

/** True if the phone (with or without stress digit) is a vowel nucleus. */
export function isVowelPhone(phone: string): boolean {
  return VOWELS.has(phone.replace(/[0-9]/, ''));
}
