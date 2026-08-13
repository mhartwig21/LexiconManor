/**
 * CORE VOCABULARY — the frequency line above which an English word carries
 * more than one meaning, read off the vendored corpus rather than picked.
 *
 * WHY THE LADDER NEEDS THIS (round 51). `content/lib/wordweb-ladder.ts` scores
 * how far a category sits from what its tiles appear to say, and its MEANING
 * axis gave every plain-English category 0 or 1 out of 2 — a taxonomy scored 0
 * and anything matching `/^Things (That|You) /` scored 1. The consequence was
 * structural rather than cosmetic: a semantic category's ceiling was
 * 0 (reading) + 1 (surface) + 1 (meaning) + 2 (trap) = 4, purple's floor is 5,
 * **so no category solvable by thinking in English could ever be purple, on
 * any board, at any tier.** That is the whole of the critic's *"PURPLE IS
 * WORDPLAY ON 183 OF 183 BOARDS"*: the shelf was not choosing letter tricks
 * for purple, the ladder was refusing to let anything else in.
 *
 * WHAT REPLACES THE REGEX, and why it is a measurement. Zipf's meaning-frequency
 * law: the number of senses a word carries rises with its frequency. So four
 * tiles drawn from the commonest words in English cannot be a taxonomy of a
 * narrow subject — narrow subjects are named by rarer words (CIRRUS, WENSLEYDALE,
 * NUTHATCH) — and a category over four core words is therefore asking the player
 * to abandon each tile's dominant reading. MATCH / CAMP / BARGAIN / DRUM under
 * `Things That Are Struck` is the same lateral move `___ BAR` makes on CROW, and
 * it is the only way a plain-English category can be as hard as a letter trick.
 *
 * THE LINE, AND WHY IT IS NOT A KNOB. `CORE_RANK` is the rank at which the
 * corpus drops below **ten occurrences per million words** — the conventional
 * lexicographic boundary of high-frequency core vocabulary, the band learner
 * dictionaries mark and the band Zipf's law makes polysemous. Measured on the
 * shipped `content/data/count_1w.txt` (333,333 words, 588 billion tokens) that
 * falls at rank 9,052, and `assertCoreRank()` re-derives it from the corpus on
 * every build so the constant cannot drift away from its own definition.
 *
 * THE FAILURE MODE, STATED RATHER THAN HIDDEN: a common word used in its
 * dominant sense scores as lateral when it is not. `Things in a Weather
 * Forecast` dealt RAIN / SNOW / FROST / SUN is four core words in their plain
 * meanings and this file calls it a redefinition. The defence is that on a
 * sixteen-tile grid it very nearly is one — four of the commonest nouns in
 * English could belong to anything, which is why they are the tiles the trap
 * planter reaches for — but it is a proxy for polysemy and not a reading of it,
 * and no sense-tagged corpus is vendored here that could do better.
 *
 * PURITY. The functions below are pure with respect to a vendored, checked-in
 * corpus that no part of this build writes; the table is read once, lazily, and
 * never mutated. Nothing here ships to the client.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Occurrences per million at which core vocabulary ends. */
export const CORE_PER_MILLION = 10;

/**
 * The rank that threshold falls at in the shipped corpus. Re-derived by
 * `assertCoreRank`, which is what makes this a measurement and not a number.
 */
export const CORE_RANK = 9052;

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(here, '..', 'data', 'count_1w.txt');

let core: Set<string> | null = null;

/** The words at or above the core-frequency line, lower-cased. */
export function coreVocabulary(): ReadonlySet<string> {
  if (core) return core;
  const out = new Set<string>();
  const lines = readFileSync(CORPUS, 'utf8').split('\n');
  for (let i = 0; i < CORE_RANK && i < lines.length; i += 1) {
    const w = lines[i]!.split('\t')[0];
    if (w) out.add(w);
  }
  core = out;
  return core;
}

/** Is this tile one of the commonest words in English — and so a polysemous one? */
export function isCoreWord(word: string): boolean {
  return coreVocabulary().has(word.toLowerCase());
}

/**
 * Re-derive `CORE_RANK` from the corpus and throw if the constant has drifted
 * from the definition it claims. Called by the generator's build-time asserts
 * and by `tests/puzzles/wordweb-register.test.ts`, so the number is measured on
 * both sides of the build rather than remembered.
 */
export function assertCoreRank(): { rank: number; total: number } {
  const lines = readFileSync(CORPUS, 'utf8').split('\n');
  const counts: number[] = [];
  let total = 0;
  for (const l of lines) {
    const parts = l.split('\t');
    if (parts.length < 2) continue;
    const c = Number(parts[1]);
    if (!Number.isFinite(c)) continue;
    counts.push(c);
    total += c;
  }
  const floor = (CORE_PER_MILLION / 1e6) * total;
  let rank = 0;
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i]! >= floor) rank = i + 1;
    else break;
  }
  if (rank !== CORE_RANK) {
    throw new Error(
      `CORE_RANK is ${CORE_RANK} but ${CORE_PER_MILLION} per million falls at rank ${rank} `
      + `in the shipped corpus — the constant has drifted from its own definition`,
    );
  }
  return { rank, total };
}
