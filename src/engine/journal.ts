/**
 * The journal — OWNER: A7 (Mystery). Pure derivation, no state of its own.
 *
 * "The *deduction* is the player's, the *filing* is not" (MANOR_DESIGN §7).
 * Everything here is a pure function of (VolumeContent, VolumeState [, the
 * event stream]) → view-ready structure: grouped fragments, the definition
 * poem with `— ? —` gaps, letter-constraint engravings rendered against the
 * alphabet, cross-references, cozy nudges, and the Sanctum guess history
 * (the player's own elimination record, AAA 4.17).
 *
 * AAA hooks: 4.15 (auto-grouped, re-readable in ≤2 taps — the UI's job, fed
 * from here), 4.16 (insufficient-info nudges at the Sanctum), 4.14 (nothing
 * exists only in a transient scene — anything filed renders here forever).
 */

import type { VolumeState } from './types';
import type { GuessCloseness, RecordedEvent } from './events';
import {
  computeCloseness,
  type EngravingConstraint,
  type FragmentContent,
  type VolumeContent,
} from './volume';

// ---------------------------------------------------------------------------
// Filing: grouped, ordered fragments
// ---------------------------------------------------------------------------

export function isFound(state: VolumeState, fragmentId: string): boolean {
  return state.foundFragmentIds.includes(fragmentId);
}

export function isInterpreted(state: VolumeState, fragmentId: string): boolean {
  return state.interpretedFragmentIds.includes(fragmentId);
}

/** Found fragments of one kind, in revealOrder — a journal tab's spine. */
export function foundByKind(
  content: VolumeContent,
  state: VolumeState,
  kind: FragmentContent['kind'],
): FragmentContent[] {
  return content.fragments
    .filter((f) => f.kind === kind && isFound(state, f.id))
    .sort((a, b) => a.revealOrder - b.revealOrder);
}

/** One slot per authored definition line: the fragment if found, else a gap.
 *  The poem keeps its shape from day one — gaps are part of the reading. */
export interface DefinitionSlot {
  fragment: FragmentContent | null;
  revealOrder: number;
}

export function definitionSlots(content: VolumeContent, state: VolumeState): DefinitionSlot[] {
  return content.fragments
    .filter((f) => f.kind === 'definition-line')
    .sort((a, b) => a.revealOrder - b.revealOrder)
    .map((f) => ({ fragment: isFound(state, f.id) ? f : null, revealOrder: f.revealOrder }));
}

/** "See also" chips: related fragments the player has already found. */
export function crossRefs(
  content: VolumeContent,
  state: VolumeState,
  fragmentId: string,
): FragmentContent[] {
  const frag = content.fragments.find((f) => f.id === fragmentId);
  if (!frag?.relatedIds) return [];
  return frag.relatedIds
    .map((id) => content.fragments.find((f) => f.id === id))
    .filter((f): f is FragmentContent => !!f && isFound(state, f.id));
}

/** Fragment ids filed today — the journal's unread wax dots. */
export function filedToday(recentEvents: readonly RecordedEvent[], day: number): Set<string> {
  const out = new Set<string>();
  for (const e of recentEvents) {
    if (e.day === day && e.event.type === 'fragment-found') out.add(e.event.fragmentId);
  }
  return out;
}

/** The first found-but-uninterpreted fragment (Ellery's 'next' service). */
export function nextUninterpreted(content: VolumeContent, state: VolumeState): string | null {
  const found = content.fragments
    .filter((f) => isFound(state, f.id) && !isInterpreted(state, f.id))
    .sort((a, b) => a.revealOrder - b.revealOrder);
  return found[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// The alphabet plate — engravings rendered against the letters
// ---------------------------------------------------------------------------

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export interface AlphabetFacts {
  /** Letters proven absent from the word. */
  eliminated: Set<string>;
  /** Letters proven present. */
  required: Set<string>;
  knownLength: number | null;
  startsWith: string | null;
  /** The word's vowels in order, if engraved ("AUA"). */
  vowelSequence: string | null;
  /** Exactly one letter is doubled, the rest single. */
  oneLetterTwice: boolean;
  /** How many engraving constraints feed this plate (0 = plate still blank). */
  sources: number;
}

/** Derived only from FOUND engravings — the journal never spoils. */
export function alphabetFacts(content: VolumeContent, state: VolumeState): AlphabetFacts {
  const facts: AlphabetFacts = {
    eliminated: new Set(),
    required: new Set(),
    knownLength: null,
    startsWith: null,
    vowelSequence: null,
    oneLetterTwice: false,
    sources: 0,
  };
  for (const f of content.fragments) {
    if (f.kind !== 'engraving' || !f.constraint || !isFound(state, f.id)) continue;
    facts.sources++;
    applyConstraint(facts, f.constraint);
  }
  return facts;
}

function applyConstraint(facts: AlphabetFacts, c: EngravingConstraint): void {
  switch (c.kind) {
    case 'length':
      facts.knownLength = c.length;
      break;
    case 'shares-no-letter':
      for (const ch of c.word.toUpperCase()) facts.eliminated.add(ch);
      break;
    case 'starts-with':
      facts.startsWith = c.letter.toUpperCase();
      facts.required.add(c.letter.toUpperCase());
      break;
    case 'contains-letter':
      facts.required.add(c.letter.toUpperCase());
      break;
    case 'one-letter-twice':
      facts.oneLetterTwice = true;
      break;
    case 'vowel-sequence': {
      facts.vowelSequence = c.vowels.toUpperCase();
      const present = new Set(c.vowels.toUpperCase());
      for (const v of ['A', 'E', 'I', 'O', 'U']) {
        if (present.has(v)) facts.required.add(v);
        else facts.eliminated.add(v);
      }
      break;
    }
  }
}

/** The letter-box row: one slot per known letter, first letter inked if known. */
export function letterBoxes(facts: AlphabetFacts): (string | null)[] | null {
  if (facts.knownLength === null) return null;
  const boxes: (string | null)[] = Array.from({ length: facts.knownLength }, () => null);
  if (facts.startsWith && boxes.length > 0) boxes[0] = facts.startsWith;
  return boxes;
}

// ---------------------------------------------------------------------------
// Guess history — the player's own elimination record
// ---------------------------------------------------------------------------

export interface GuessRecord {
  day: number;
  guess: string;
  closeness: GuessCloseness;
  /** It turned out to be the word. */
  wasAnswer: boolean;
}

export function guessHistory(content: VolumeContent, state: VolumeState): GuessRecord[] {
  const answerNorm = content.answer.toUpperCase();
  return state.guesses.map((g, i) => ({
    day: g.day,
    guess: g.guess,
    closeness: computeCloseness(content.answer, g.guess, state.guesses.slice(0, i)),
    wasAnswer:
      g.guess === answerNorm ||
      content.accepted.some((a) => a.toUpperCase().replace(/[^A-Z]/g, '') === g.guess),
  }));
}

// ---------------------------------------------------------------------------
// Nudges — cozy-detective signaling (AAA 4.16), never silence
// ---------------------------------------------------------------------------

export interface SanctumReadiness {
  found: number;
  total: number;
  /** Enough on the desk that a guess is an act of deduction, not a dart throw. */
  enough: boolean;
  /** Sympathetic pre-guess line when the case file is thin. */
  nudge: string | null;
}

/** Below this many filed fragments the Portrait gently notes the thin file.
 *  A nudge only — never a gate (AAA 4.18: solvable from day one). */
export const THIN_FILE_THRESHOLD = 4;

export function sanctumReadiness(content: VolumeContent, state: VolumeState): SanctumReadiness {
  const found = state.foundFragmentIds.length;
  const total = content.fragments.length;
  const enough = found >= THIN_FILE_THRESHOLD;
  return {
    found,
    total,
    enough,
    nudge: enough
      ? null
      : found === 0
        ? 'The journal is still empty, dear. The manor hides its definition in engravings, memories, and the post — though the door will hear any word you bring it.'
        : `Only ${found} fragment${found === 1 ? '' : 's'} filed so far. The rooms above hold more of the definition — though the door will hear any word you bring it.`,
  };
}

/** The journal's own gentle next-thing pointer, shown under the case file. */
export function journalNudge(content: VolumeContent, state: VolumeState): string | null {
  if (state.status === 'solved') return null;
  const found = state.foundFragmentIds.length;
  if (found === 0) return 'Draft toward the violet rooms — the manor files what it finds, all by itself.';
  const uninterpreted = nextUninterpreted(content, state);
  const facts = alphabetFacts(content, state);
  if (facts.sources === 0) {
    return 'No engravings yet. They are cut into lintels and inkstands about the house — the alphabet plate is waiting for them.';
  }
  if (uninterpreted && found >= 3) {
    return 'Ellery could make more of one of these, if you brought her a cup of something warm.';
  }
  if (found < content.fragments.length) {
    return 'You might reread what the engravings say, dear — side by side, they narrow wonderfully.';
  }
  return 'Every fragment is filed. The rest is deduction — and one word, spoken at the top of the house.';
}
