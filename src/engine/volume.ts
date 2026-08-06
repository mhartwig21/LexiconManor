/**
 * The volume mystery FSM — OWNER: A7 (Mystery). Pure TS, no React/DOM/JSON.
 *
 * The manor's meta-puzzle (MANOR_DESIGN §7, ARCHITECTURE §7): a word was
 * struck from every dictionary, its definition survives as fragments, and the
 * Sanctum door wants the word *typed*. Knowledge is the progression — the
 * answer is fixed at volume start and no fragment is mechanically required
 * (AAA 4.18): a sharp player can win on day one.
 *
 * This module is pure: content (VolumeContent) flows in as a parameter, state
 * (VolumeState, frozen in engine/types.ts) flows through. The journal slice
 * (app/slices/journal.ts) is the only store-mutating caller.
 *
 * Core rulings encoded here:
 *   - one Sanctum guess per day (anti-brute-force; a wrong guess is met with
 *     a sympathetic sigh, never a penalty — AAA 4.17)
 *   - closeness metadata on wrong guesses (shared letters / right length /
 *     repeat) so the Portrait's reaction variants key off it
 *   - deterministic fragment drip: rooms pull the lowest unfound revealOrder,
 *     preferring fragments sourced from that room category (AAA 4.14)
 *   - pity rule: if no new fragment has appeared in PITY_DROUGHT_DAYS days of
 *     play, a pity letter arrives overnight carrying the next fragment
 *   - letter-constraint engravings are machine-readable (EngravingConstraint)
 *     so the journal can render them against the alphabet and the solvability
 *     test can prove the constraint set admits exactly one dictionary answer
 */

import type {
  CharacterId, DayRecord, FragmentDef, LetterDef, RoomCategory, VolumeDef, VolumeState,
} from './types';
import type { GuessCloseness } from './events';

// ---------------------------------------------------------------------------
// Letter-constraint engravings — machine-readable clue algebra
// ---------------------------------------------------------------------------

/**
 * Each engraving fragment carries one constraint. Individually soft (each
 * admits hundreds+ of dictionary words), jointly sufficient (the volume's
 * full set admits exactly the answer — proven by tests/volume-solvability).
 */
export type EngravingConstraint =
  | { kind: 'length'; length: number }
  | { kind: 'shares-no-letter'; word: string }
  | { kind: 'starts-with'; letter: string }
  | { kind: 'contains-letter'; letter: string }
  /** Exactly one letter appears exactly twice; every other letter once. */
  | { kind: 'one-letter-twice' }
  /** The word's vowels (a/e/i/o/u), in order, spell exactly this string. */
  | { kind: 'vowel-sequence'; vowels: string };

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/** Does a single constraint admit this (lowercase a–z) word? */
export function constraintAdmits(c: EngravingConstraint, word: string): boolean {
  switch (c.kind) {
    case 'length':
      return word.length === c.length;
    case 'shares-no-letter': {
      const banned = new Set(c.word.toLowerCase());
      for (const ch of word) if (banned.has(ch)) return false;
      return true;
    }
    case 'starts-with':
      return word.startsWith(c.letter.toLowerCase());
    case 'contains-letter':
      return word.includes(c.letter.toLowerCase());
    case 'one-letter-twice': {
      const counts = new Map<string, number>();
      for (const ch of word) counts.set(ch, (counts.get(ch) ?? 0) + 1);
      let twice = 0;
      for (const n of counts.values()) {
        if (n > 2) return false;
        if (n === 2) twice++;
      }
      return twice === 1;
    }
    case 'vowel-sequence': {
      let seq = '';
      for (const ch of word) if (VOWELS.has(ch)) seq += ch;
      return seq === c.vowels.toLowerCase();
    }
  }
}

export function constraintsAdmit(cs: readonly EngravingConstraint[], word: string): boolean {
  return cs.every((c) => constraintAdmits(c, word));
}

/** All words a constraint set admits — the solvability-proof workhorse. */
export function solveConstraints(
  cs: readonly EngravingConstraint[],
  words: Iterable<string>,
): string[] {
  const out: string[] = [];
  for (const w of words) if (constraintsAdmit(cs, w)) out.push(w);
  return out;
}

// ---------------------------------------------------------------------------
// Volume content — authored shape (extends the frozen VolumeDef additively)
// ---------------------------------------------------------------------------

export interface FragmentContent extends FragmentDef {
  /** Engravings only: the machine-readable form of the inscription. */
  constraint?: EngravingConstraint;
  /** Testimony only: whose memory this is (journal cameo + grouping). */
  speaker?: CharacterId;
  /** Where it was found, for the journal card header ("Gallery lintel"). */
  source?: string;
  /** Ellery's reading of it — revealed by her interpret service. */
  interpretation?: string;
  /** Journal cross-references ("see also" chips) — ids in the same volume. */
  relatedIds?: string[];
}

export interface LetterContent extends LetterDef {
  /** Envelope line shown before the seal is broken. */
  subject?: string;
  /** Fragments filed when the letter is opened (second source type, AAA 4.14). */
  grantsFragmentIds?: string[];
  /** Held back until this many fragments are found. */
  minFragments?: number;
  /** Pity letter: arrives only during a fragment drought; grants the next
   *  unfound fragment dynamically (see letterGrants). */
  pity?: boolean;
  /** Epilogue letter: arrives only once the volume is solved. */
  afterSolved?: boolean;
}

export interface VolumeContent extends VolumeDef {
  title: string;
  epigraph?: string;
  fragments: FragmentContent[];
  letters: LetterContent[];
}

// ---------------------------------------------------------------------------
// Guessing at the Sanctum
// ---------------------------------------------------------------------------

/** Uppercase, letters only — "the lacuna " and "Lacuna" both become "LACUNA".
 *  A leading article is stripped only as a separate word, never from inside
 *  a single typed word ("theory" stays "THEORY"). */
export function normalizeGuess(raw: string): string {
  const dearticled = raw.trim().replace(/^(the|an|a)\s+/i, '');
  return dearticled.toUpperCase().replace(/[^A-Z]/g, '');
}

/** Distinct letters shared with the answer + shape metadata (AAA 4.17). */
export function computeCloseness(
  answer: string,
  guess: string,
  previousGuesses: readonly { guess: string }[],
): GuessCloseness {
  const a = new Set(answer.toUpperCase());
  const g = new Set(guess.toUpperCase());
  let shared = 0;
  for (const ch of g) if (a.has(ch)) shared++;
  return {
    sharedLetters: shared,
    rightLength: guess.length === answer.length,
    repeat: previousGuesses.some((p) => p.guess === guess),
  };
}

export function hasGuessedOnDay(state: VolumeState, day: number): boolean {
  return state.guesses.some((g) => g.day === day);
}

export type GuessResult =
  | { kind: 'solved'; word: string }
  | { kind: 'wrong'; guess: string; closeness: GuessCloseness }
  /** The daily guess is already spent — the door hears one word a day. */
  | { kind: 'gate' }
  | { kind: 'empty' };

/**
 * The daily Sanctum guess. Pure: returns the next state + a typed result.
 * Never a penalty — a wrong guess consumes only the daily attempt and is
 * journaled so the player can see her own elimination history.
 */
export function applyGuess(
  def: VolumeDef,
  state: VolumeState,
  raw: string,
  day: number,
): { state: VolumeState; result: GuessResult } {
  const guess = normalizeGuess(raw);
  if (state.status !== 'active') return { state, result: { kind: 'gate' } };
  if (!guess) return { state, result: { kind: 'empty' } };
  if (hasGuessedOnDay(state, day)) return { state, result: { kind: 'gate' } };

  const accepted = def.accepted.map((w) => normalizeGuess(w));
  const closeness = computeCloseness(def.answer, guess, state.guesses);
  const entry = { day, guess };
  if (accepted.includes(guess)) {
    return {
      state: { ...state, day, guesses: [...state.guesses, entry], status: 'solved' },
      result: { kind: 'solved', word: normalizeGuess(def.answer) },
    };
  }
  return {
    state: { ...state, day, guesses: [...state.guesses, entry] },
    result: { kind: 'wrong', guess, closeness },
  };
}

/** `vol.<volumeId>.solved` — reserved in docs/flags.md, set by this machine. */
export function solvedFlag(volumeId: string): string {
  return `vol.${volumeId}.solved`;
}

// ---------------------------------------------------------------------------
// Fragment drip — deterministic, category-aware, never RNG-gated (AAA 4.14)
// ---------------------------------------------------------------------------

export function unfoundFragments(def: VolumeDef, state: VolumeState): FragmentDef[] {
  const found = new Set(state.foundFragmentIds);
  return [...def.fragments]
    .filter((f) => !found.has(f.id))
    .sort((a, b) => a.revealOrder - b.revealOrder);
}

/**
 * The fragment a room of this category yields: the lowest unfound revealOrder
 * among fragments sourced from that category, falling back to the lowest
 * unfound overall — so no fragment is ever stranded behind a room type the
 * dice refuse to offer (the Blue Prince fix).
 */
export function nextFragmentForRoom(
  def: VolumeDef,
  state: VolumeState,
  category: RoomCategory,
): FragmentDef | null {
  const unfound = unfoundFragments(def, state);
  if (unfound.length === 0) return null;
  return unfound.find((f) => f.sourceRoomCategory === category) ?? unfound[0]!;
}

/** Days of completed play since a fragment last appeared (from the banked
 *  DayRecords — chronicles are the one persistent per-day record). */
export function fragmentDroughtDays(dayRecords: readonly DayRecord[]): number {
  let drought = 0;
  for (let i = dayRecords.length - 1; i >= 0; i--) {
    if (dayRecords[i]!.fragmentsFound > 0) break;
    drought++;
  }
  return drought;
}

export const PITY_DROUGHT_DAYS = 3;

/** Should the pity channel fire? (Also exported for A1's violet-offer seeding.) */
export function pityDue(
  def: VolumeDef,
  state: VolumeState,
  dayRecords: readonly DayRecord[],
): boolean {
  return (
    state.status === 'active' &&
    unfoundFragments(def, state).length > 0 &&
    fragmentDroughtDays(dayRecords) >= PITY_DROUGHT_DAYS
  );
}

// ---------------------------------------------------------------------------
// Letters — overnight post from the cast (arrivals are pure derivation)
// ---------------------------------------------------------------------------

/** Write-once flag marking a letter opened: `vol.<volumeId>.opened-<letterId>`. */
export function openedLetterFlag(volumeId: string, letterId: string): string {
  return `vol.${volumeId}.opened-${letterId}`;
}

export function letterArrived(
  letter: LetterContent,
  state: VolumeState,
  day: number,
  opts: { droughtDays: number; openedIds: ReadonlySet<string> },
): boolean {
  if ((letter.earliestDay ?? 1) > day) return false;
  if (letter.afterSolved && state.status !== 'solved') return false;
  if ((letter.minFragments ?? 0) > state.foundFragmentIds.length) return false;
  if (letter.pity) {
    // A pity letter stays in the tray once delivered (already opened), but a
    // fresh one only arrives while the drought actually holds.
    if (opts.openedIds.has(letter.id)) return true;
    return opts.droughtDays >= PITY_DROUGHT_DAYS && state.status === 'active';
  }
  return true;
}

/** Letters in the tray today, authored order preserved. */
export function arrivedLetters(
  content: VolumeContent,
  state: VolumeState,
  day: number,
  opts: { droughtDays: number; openedIds: ReadonlySet<string> },
): LetterContent[] {
  return content.letters.filter((l) => letterArrived(l, state, day, opts));
}

/**
 * What a letter files when its seal is broken. Static grants file their listed
 * fragments (skipping any already found); a pity letter grants the next
 * unfound fragment on the drip, whatever it is.
 */
export function letterGrants(
  content: VolumeContent,
  letter: LetterContent,
  state: VolumeState,
): string[] {
  if (letter.pity) {
    const next = unfoundFragments(content, state)[0];
    return next ? [next.id] : [];
  }
  const found = new Set(state.foundFragmentIds);
  return (letter.grantsFragmentIds ?? []).filter((id) => !found.has(id));
}

// ---------------------------------------------------------------------------
// Volume lifecycle
// ---------------------------------------------------------------------------

export function freshVolumeState(volumeId: string, day: number): VolumeState {
  return {
    volumeId,
    day,
    foundFragmentIds: [],
    interpretedFragmentIds: [],
    guesses: [],
    status: 'active',
  };
}

/** Roll the manor to the next volume: fresh state, the old journal archives
 *  (still readable — the caller keeps the closed VolumeContent around). */
export function advanceVolume(next: VolumeDef, day: number): VolumeState {
  return freshVolumeState(next.id, day);
}
