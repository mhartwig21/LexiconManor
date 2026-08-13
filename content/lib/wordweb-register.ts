/**
 * THE REGISTER OF A CATEGORY — what KIND of thinking a solver must do to find
 * it, measured so that a gate can disagree with the author.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE COMPLAINT THIS FILE EXISTS TO MEASURE (round 51, the NYT-standards critic)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   "THE MEDIAN BOARD IS 3-OF-4 WORDPLAY. Nine boards are 4-of-4 with NO
 *    semantic category at all. PURPLE IS WORDPLAY ON 183 OF 183 BOARDS."
 *
 * A real Connections board mixes REGISTERS: one category is *things a
 * housekeeper counts*, another is *words hiding a smaller word*, and the
 * tension between those two KINDS of thinking is the puzzle. A board that is
 * three letter-tricks and a garnish asks one procedure three times.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `typeOfTheme`, WHICH THE GENERATOR ALREADY HAS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `generate-wordweb.ts:typeOfTheme` answers a different question (`semantic` /
 * `trivia` / `wordplay`) and answers it with a RESIDUAL BUCKET: eleven regexes
 * match wordplay and `return 'semantic'` catches everything else. So a label
 * shape nobody has written a regex for is silently counted as plain English —
 * the instrument agrees with the generator by construction, which is the
 * failure `docs/STATUS.md` §3.2 says this project keeps repeating.
 *
 * It also puts `___ FIRE` and `Contains "TEN"` in one bucket, and those are
 * not one kind of thinking. `content/lib/wordweb-ladder.ts` has said so since
 * round 13 in `LETTER_MECHANIC_FAMILIES` — *"solving `Contains "TEN"` is one
 * skill applied identically every time; solving `___ BAR` is a search of
 * English"* — and this file is that distinction promoted to a first-class axis.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE THREE REGISTERS, defined by the SOLVER'S OPERATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   MEANING  You must know what the words MEAN. Nothing is done to the string.
 *            `Things a Housekeeper Counts`, `Kinds of Cloud`, `Greek Gods`.
 *   PHRASE   You must know what the words COMBINE WITH. Still no operation on
 *            the string; it is a search of English phrase-space.
 *            `___ FIRE`, `Can Precede "KEEPER"`.
 *   FORM     You must operate on the LETTERS or the SOUNDS: scan for a
 *            substring, hear a rhyme, unscramble, add or drop a letter, notice
 *            a shape. `Contains "TEN"`, `Anagrams of "LISTEN"`, `Silent "N"`,
 *            `Words with All Five Vowels`.
 *
 * The task's own test applies: *"a category named 'Contains a hidden animal'
 * is wordplay whatever its words are; 'Things in a stillroom' is semantic
 * whatever its letters do."* The register is a fact about the INSTRUCTION.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE TWO WAYS THIS INSTRUMENT CAN DISAGREE WITH THE AUTHOR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A classifier whose last line is `return 'meaning'` is the same residual
 * bucket wearing a new name, so MEANING is not a default here — it is a
 * verdict that has to survive two independent challenges, and either one turns
 * a category into a FINDING rather than into a quiet pass.
 *
 *  1. `UNREADABLE` — the label makes a claim ABOUT THE STRING. Any label
 *     carrying a quoted token or a `___` slot is talking about spelling, so it
 *     cannot be MEANING however the family regexes fall out. This is the guard
 *     that catches the label shape nobody has written a rule for yet: a new
 *     `Ends in "ING"` family would be refused rather than absorbed.
 *
 *  2. `CONTAMINATED` — the WORDS betray the label. If all four tiles share a
 *     substring, a rhyme, an edge or a doubled letter, then a solver can find
 *     that group by looking at letters no matter what the category is called,
 *     and counting it as a second KIND of thinking is a lie. This challenge
 *     reads the shipped tiles and the pronouncing dictionary, neither of which
 *     the label controls, so an author cannot pass it by naming a category
 *     well — only by choosing words that genuinely do not rhyme.
 *
 * Both are reported. Nothing here silently reclassifies: `registerOf` returns
 * the register the label demands plus every challenge it failed, and the gate
 * decides what a failed challenge costs.
 */
import { canonTheme, familyOfTheme, type CensusFamily } from './wordweb-ladder';

export type Register = 'meaning' | 'phrase' | 'form';
export const REGISTERS: readonly Register[] = ['meaning', 'phrase', 'form'];

/**
 * The register each deduction family demands. Exhaustive over `CensusFamily`
 * on purpose — a new family is a compile error here rather than a silent
 * `meaning`.
 */
const REGISTER_BY_FAMILY: Record<CensusFamily, Register> = {
  // You know it or you do not; either way nothing is done to the letters.
  semantic: 'meaning',
  trivia: 'meaning',
  // A search of English phrase-space.
  compound: 'phrase',
  // An operation on the letters or the sounds.
  rhyme: 'form',
  contains: 'form',
  silent: 'form',
  'letter-swap': 'form',
  hidden: 'form',
  homophone: 'form',
  anagram: 'form',
  'letter-shape': 'form',
};

/** A label that talks about spelling cannot be plain English, whatever it is called. */
const TALKS_ABOUT_THE_STRING = /["“”]|___/;

export type Challenge =
  | { kind: 'unreadable'; detail: string }
  | { kind: 'contaminated'; detail: string };

export interface RegisterVerdict {
  register: Register;
  family: CensusFamily;
  /** Every challenge the verdict failed. Empty is the ordinary case. */
  challenges: Challenge[];
}

/**
 * A form relation that holds across ALL FOUR tiles — the relations the room's
 * own herring solver names, asked of one category instead of across two.
 *
 * COMPLETENESS IS THE POINT, and it is why this is not the herring detector
 * with the arguments changed. Two of four sharing an edge is noise; four of
 * four sharing one is a group a player can find with her eyes shut to the
 * label. Only the second is a reason to refuse a category the title MEANING.
 */
export interface Contamination { relation: string; detail: string }

const MIN_SHARED = 3;

function sharedSubstring(words: readonly string[]): string | null {
  const first = words[0] ?? '';
  const rest = words.slice(1);
  let best: string | null = null;
  for (let len = first.length; len >= MIN_SHARED; len -= 1) {
    for (let i = 0; i + len <= first.length; i += 1) {
      const sub = first.slice(i, i + len);
      if (rest.every((w) => w.includes(sub))) {
        if (!best || sub.length > best.length) best = sub;
      }
    }
    if (best) return best;
  }
  return best;
}

function sharedEdge(words: readonly string[]): string | null {
  const first = words[0] ?? '';
  for (const len of [4, 3]) {
    const head = first.slice(0, len);
    if (head.length === len && words.every((w) => w.startsWith(head))) return `starts ${head}`;
    const tail = first.slice(-len);
    if (tail.length === len && words.every((w) => w.endsWith(tail))) return `ends ${tail}`;
  }
  return null;
}

function doubledLetter(word: string): string | null {
  for (let i = 1; i < word.length; i += 1) if (word[i] === word[i - 1]) return word[i]!;
  return null;
}

/**
 * `rhymeKeysOf` is injected rather than imported so this module stays pure and
 * a caller with no pronouncing dictionary (a unit test, the client bundle)
 * gets every other challenge for free.
 */
export type RhymeKeys = (word: string) => readonly string[];

export function contaminationOf(
  words: readonly string[],
  rhymeKeysOf?: RhymeKeys,
): Contamination | null {
  const up = words.map((w) => canonTheme(w).toUpperCase());
  if (up.length < 2) return null;

  const sub = sharedSubstring(up);
  if (sub) return { relation: 'shared-substring', detail: sub };

  const edge = sharedEdge(up);
  if (edge) return { relation: 'shared-affix', detail: edge };

  const doubles = up.map(doubledLetter);
  if (doubles.every((d) => d !== null)) {
    const only = new Set(doubles as string[]);
    if (only.size === 1) return { relation: 'doubled-letter', detail: [...only][0]! };
  }

  if (rhymeKeysOf) {
    const keySets = up.map((w) => new Set(rhymeKeysOf(w)));
    if (keySets.every((s) => s.size > 0)) {
      const shared = [...keySets[0]!].filter((k) => keySets.every((s) => s.has(k)));
      if (shared.length > 0) return { relation: 'rhyme', detail: shared[0]! };
    }
  }
  return null;
}

/**
 * The register a category demands, and every challenge that verdict failed.
 *
 * `words` is optional only so a caller holding a label alone (the composer,
 * mid-choice) can ask the cheap half of the question; a gate must pass them,
 * because the contamination challenge is the half the label cannot fake.
 */
export function registerOf(
  rawTheme: string,
  words?: readonly string[],
  rhymeKeysOf?: RhymeKeys,
): RegisterVerdict {
  const theme = canonTheme(rawTheme);
  const family = familyOfTheme(theme);
  const register = REGISTER_BY_FAMILY[family];
  const challenges: Challenge[] = [];

  if (register === 'meaning' && TALKS_ABOUT_THE_STRING.test(theme)) {
    challenges.push({
      kind: 'unreadable',
      detail: `"${theme}" names a token or a slot, so it is a claim about spelling`,
    });
  }

  if (register === 'meaning' && words && words.length >= 3) {
    const c = contaminationOf(words, rhymeKeysOf);
    if (c) {
      challenges.push({
        kind: 'contaminated',
        detail: `all ${words.length} tiles share ${c.relation} (${c.detail}) — findable without reading them`,
      });
    }
  }

  return { register, family, challenges };
}

/** A category that counts toward the board's non-letter thinking. */
export function isClean(v: RegisterVerdict): boolean {
  return v.challenges.length === 0;
}

export interface BoardMix {
  counts: Record<Register, number>;
  /** MEANING categories that survived both challenges. */
  cleanMeaning: number;
  verdicts: RegisterVerdict[];
}

export function mixOf(
  groups: readonly { theme: string; words: string[] }[],
  rhymeKeysOf?: RhymeKeys,
): BoardMix {
  const verdicts = groups.map((g) => registerOf(g.theme, g.words, rhymeKeysOf));
  const counts: Record<Register, number> = { meaning: 0, phrase: 0, form: 0 };
  for (const v of verdicts) counts[v.register] += 1;
  const cleanMeaning = verdicts.filter((v) => v.register === 'meaning' && isClean(v)).length;
  return { counts, cleanMeaning, verdicts };
}
