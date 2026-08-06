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
 *     play, a pity letter arrives overnight carrying the next fragment. The
 *     channel is renewable (AAA 4.14): when every authored pity letter is
 *     spent, the house synthesizes another from a small authored pool of
 *     Posy bodies — a 17-fragment volume can never outlast the mercy
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
  /** Optional per-volume envelope copy for synthesized pity letters — falls
   *  back to DEFAULT_PITY_TEMPLATES (see synthesizedPityLetter). */
  pityTemplates?: PityTemplate[];
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
 *
 * `reservedIds` (AAA 4.14, testimony channel): fragments a still-live
 * character scene has promised to deliver in person step aside from the room
 * drip, so the journal never files a quote for a conversation that hasn't
 * happened — unless honoring every reservation would strand the drip
 * entirely, in which case the room wins (fragments must never be stranded).
 */
export function nextFragmentForRoom(
  def: VolumeDef,
  state: VolumeState,
  category: RoomCategory,
  opts?: { reservedIds?: ReadonlySet<string> },
): FragmentDef | null {
  const unfound = unfoundFragments(def, state);
  if (unfound.length === 0) return null;
  const reserved = opts?.reservedIds;
  const pool =
    reserved && unfound.some((f) => !reserved.has(f.id))
      ? unfound.filter((f) => !reserved.has(f.id))
      : unfound;
  return pool.find((f) => f.sourceRoomCategory === category) ?? pool[0]!;
}

/**
 * Fragment ids promised by not-yet-seen dialogue nodes (the additive
 * DialogueEffects.grantsFragmentIds field — empty until such nodes are
 * authored, so this is forward-compatible with A6's testimony scenes).
 * The shape is structural with `unknown` effects (narrowed defensively at
 * read time) so callers can pass real DialogueFiles without this module
 * importing dialogue code — and without breaking when A6's DialogueEffects
 * doesn't declare the field yet.
 */
export interface FragmentGrantingNode {
  id: string;
  effects?: unknown;
  choices?: readonly { effects?: unknown }[];
}

function grantsOf(effects: unknown): readonly string[] {
  if (!effects || typeof effects !== 'object') return [];
  const g = (effects as { grantsFragmentIds?: unknown }).grantsFragmentIds;
  return Array.isArray(g) ? g.filter((x): x is string => typeof x === 'string') : [];
}

export function reservedTestimonyIds(
  files: Iterable<{ nodes: readonly FragmentGrantingNode[] }>,
  seenNodeIds: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const file of files) {
    for (const node of file.nodes) {
      if (seenNodeIds.has(node.id)) continue; // already played — grant applied
      const blocks = [node.effects, ...(node.choices ?? []).map((c) => c.effects)];
      for (const e of blocks) {
        for (const id of grantsOf(e)) out.add(id);
      }
    }
  }
  return out;
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

/**
 * All letter ids this volume has opened, derived from the write-once flags.
 * This is the ONLY correct way to build `openedIds` for arrivedLetters:
 * filtering content.letters by flag misses synthesized pity letters
 * ('pity-extra-N'), which exist purely as derivation and must still count as
 * opened (they stay readable in the tray and advance the mint counter).
 */
export function openedLetterIds(volumeId: string, flags: Iterable<string>): Set<string> {
  const prefix = `vol.${volumeId}.opened-`;
  const out = new Set<string>();
  for (const f of flags) if (f.startsWith(prefix)) out.add(f.slice(prefix.length));
  return out;
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

// --- Synthesized pity letters — the mercy channel never exhausts (AAA 4.14).
// Two authored one-shots cannot honor an "any 3 consecutive days" guarantee
// over a 17-fragment volume; once every authored pity letter is opened and a
// drought holds again, the house writes another one itself.

export interface PityTemplate {
  subject: string;
  body: string;
}

/** Posy's rotating bodies for house-written pity letters. A volume may
 *  override via VolumeContent.pityTemplates. */
export const DEFAULT_PITY_TEMPLATES: readonly PityTemplate[] = [
  {
    subject: 'Under the tray again, dear',
    body: 'The house has taken to hiding things under my mail tray the moment a search goes quiet — no stamp, no sender, just your name in pencil. I have stopped pretending to be surprised.\n\nThe enclosure is filed in your journal already. Come by for tea; searches go better fed.\n\n— Posy',
  },
  {
    subject: 'Slipped beneath the Post Room door',
    body: 'This was on the mat this morning, half under the door, as if the house lost patience with the tray altogether. Same pencil. Same nothing else.\n\nI have filed the enclosure where it belongs. Whatever you are circling, keep circling — the house is plainly rooting for you.\n\n— Posy',
  },
  {
    subject: 'Tucked into the empty pigeonhole',
    body: 'There is one pigeonhole I keep empty on principle. This morning it was not. No postage, no sender — the house, showing off again because the hunt has gone quiet.\n\nThe enclosure is in your journal. Quiet spells end, dear; they always have.\n\n— Posy',
  },
];

/** Synthesized pity letters are namespaced so they can never collide with an
 *  authored letter id (skeletons use 'pity-1'; we use 'pity-extra-N'). */
export const SYNTH_PITY_PREFIX = 'pity-extra-';
const SYNTH_PITY_RE = /^pity-extra-([1-9]\d*)$/;

/** The Nth (1-based) house-written pity letter for this volume. */
export function synthesizedPityLetter(content: VolumeContent, n: number): LetterContent {
  const pool =
    content.pityTemplates && content.pityTemplates.length > 0
      ? content.pityTemplates
      : DEFAULT_PITY_TEMPLATES;
  const t = pool[(n - 1) % pool.length]!;
  return { id: `${SYNTH_PITY_PREFIX}${n}`, from: 'posy', pity: true, subject: t.subject, body: t.body };
}

/** How many synthesized pity letters have been opened (from the flag-derived
 *  opened-id set) — the next one issued is number highest+1. */
export function synthesizedPityCount(openedIds: ReadonlySet<string>): number {
  let highest = 0;
  for (const id of openedIds) {
    const m = SYNTH_PITY_RE.exec(id);
    if (m) highest = Math.max(highest, parseInt(m[1]!, 10));
  }
  return highest;
}

/** Resolve any letter id — authored or synthesized — to its content. */
export function findLetter(content: VolumeContent, letterId: string): LetterContent | undefined {
  const authored = content.letters.find((l) => l.id === letterId);
  if (authored) return authored;
  const m = SYNTH_PITY_RE.exec(letterId);
  return m ? synthesizedPityLetter(content, parseInt(m[1]!, 10)) : undefined;
}

/** Letters in the tray today, authored order preserved; synthesized pity
 *  letters (opened ones stay readable, plus at most one fresh one when the
 *  drought holds and no other unopened pity letter is already waiting). */
export function arrivedLetters(
  content: VolumeContent,
  state: VolumeState,
  day: number,
  opts: { droughtDays: number; openedIds: ReadonlySet<string> },
): LetterContent[] {
  const tray = content.letters.filter((l) => letterArrived(l, state, day, opts));
  const openedSynth = synthesizedPityCount(opts.openedIds);
  for (let n = 1; n <= openedSynth; n++) tray.push(synthesizedPityLetter(content, n));
  const hasFreshPity = tray.some((l) => l.pity && !opts.openedIds.has(l.id));
  if (
    !hasFreshPity &&
    state.status === 'active' &&
    opts.droughtDays >= PITY_DROUGHT_DAYS &&
    unfoundFragments(content, state).length > 0
  ) {
    tray.push(synthesizedPityLetter(content, openedSynth + 1));
  }
  return tray;
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
