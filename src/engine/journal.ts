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

import { MANOR_ROWS, type VolumeState } from './types';
import type { GuessCloseness } from './events';
import { BASE_DAY_BUDGET, moveAt } from './economy/steps';
import {
  computeCloseness,
  FRAGMENTS_TO_DEDUCE,
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

/**
 * ROUND-10: every derivation below takes an optional `sealedIds` — the
 * fragments that are FILED BUT NOT YET MADE OUT (engine/volume.ts
 * `sealedFragmentIds`). Omitting it means "nothing is sealed", which is both
 * the pre-round-10 behaviour and the truth for any save written before the
 * mechanic existed, so no caller and no existing test had to change.
 *
 * A sealed fragment is hers forever and is always visible; what it does NOT do
 * is speak. It contributes no constraint to the alphabet plate, no line to the
 * poem, no "see also" chip and nothing for Ellery to read — until a solved
 * word game makes it out. That is the whole of the owner's design change, and
 * it is enforced here rather than in the view so a UI regression cannot hand
 * the information back.
 */
export interface SealedOpts {
  /** Fragment ids filed but not yet deciphered. Absent = none. */
  sealedIds?: ReadonlySet<string>;
}

/** Filed AND made out — the only fragments that carry information. */
export function isLegible(state: VolumeState, fragmentId: string, opts?: SealedOpts): boolean {
  return isFound(state, fragmentId) && !opts?.sealedIds?.has(fragmentId);
}

/** One slot per authored definition line: the fragment if found, else a gap.
 *  The poem keeps its shape from day one — gaps are part of the reading.
 *  A found-but-sealed line occupies its slot as a *torn leaf*: she has it, she
 *  cannot read it yet, and the slot says so rather than pretending it is
 *  still missing. */
export interface DefinitionSlot {
  fragment: FragmentContent | null;
  revealOrder: number;
  /** The leaf is in the journal but not yet made out. */
  sealed: boolean;
}

export function definitionSlots(
  content: VolumeContent,
  state: VolumeState,
  opts?: SealedOpts,
): DefinitionSlot[] {
  return content.fragments
    .filter((f) => f.kind === 'definition-line')
    .sort((a, b) => a.revealOrder - b.revealOrder)
    .map((f) => ({
      fragment: isFound(state, f.id) ? f : null,
      revealOrder: f.revealOrder,
      sealed: isFound(state, f.id) && !!opts?.sealedIds?.has(f.id),
    }));
}

/** "See also" chips: related fragments the player has already MADE OUT — a
 *  cross-reference to a page she cannot read yet is not a cross-reference. */
export function crossRefs(
  content: VolumeContent,
  state: VolumeState,
  fragmentId: string,
  opts?: SealedOpts,
): FragmentContent[] {
  const frag = content.fragments.find((f) => f.id === fragmentId);
  if (!frag?.relatedIds) return [];
  return frag.relatedIds
    .map((id) => content.fragments.find((f) => f.id === id))
    .filter((f): f is FragmentContent => !!f && isLegible(state, f.id, opts));
}

/** The first made-out-but-uninterpreted fragment (Ellery's 'next' service).
 *  She reads English, not smudges: a sealed page is skipped until it is made
 *  out, which is also what makes a perfect solve's free reading worth having. */
export function nextUninterpreted(
  content: VolumeContent,
  state: VolumeState,
  opts?: SealedOpts,
): string | null {
  const found = content.fragments
    .filter((f) => isLegible(state, f.id, opts) && !isInterpreted(state, f.id))
    .sort((a, b) => a.revealOrder - b.revealOrder);
  return found[0]?.id ?? null;
}

/**
 * What an undeciphered page LOOKS like. Not the text: a run of ink-strokes the
 * same shape and length as the writing under it, so a card reads as a real
 * document she is holding rather than as an empty placeholder — and so nothing
 * of the fragment's content can leak through the DOM (the strokes are derived
 * from word LENGTHS only, and every render site marks the element aria-hidden;
 * the sighted and the screen-reader player learn exactly the same amount,
 * which is nothing).
 *
 * ROUND 13: moved down here out of ui/journal/JournalView.tsx, because the
 * Sanctum epilogue needs it too (AAA 4.15 — one rule for both surfaces) and a
 * ceremony screen must not have to import a whole page component, with its
 * stylesheet, to draw a smudge.
 */
export function smudge(text: string, maxWords = 22): string {
  return text
    .split(/\s+/)
    .slice(0, maxWords)
    .map((w) => '·'.repeat(Math.max(1, Math.min(9, w.replace(/[^\p{L}]/gu, '').length))))
    .join(' ');
}

/** How many filed pages are still waiting to be made out (the journal's
 *  footer rail says this number out loud — it is the reason to go solve). */
export function sealedCount(state: VolumeState, opts?: SealedOpts): number {
  const sealed = opts?.sealedIds;
  if (!sealed || sealed.size === 0) return 0;
  return state.foundFragmentIds.filter((id) => sealed.has(id)).length;
}

// ---------------------------------------------------------------------------
// Unread — real state, not recency (AAA 11.19–11.22)
// ---------------------------------------------------------------------------

/**
 * `filedToday(recentEvents, day)` used to live here and it was a lie.
 *
 * It answered "was this fragment filed on the current day number?", read off
 * `day.recentEvents` — which `pruneEventsAtDusk` empties every night. So a
 * fragment the player never actually looked at lost its marker at dusk, and a
 * fragment she read the instant it arrived kept one until dusk. That is a
 * RECENCY badge wearing state's clothes, the exact shape AAA 11.20 fails.
 *
 * Unread is now real persisted state, modelled on the one marker in this app
 * that was always honest: the letters' write-once `vol.<id>.opened-<letterId>`
 * flags (engine/volume.openedLetterFlag). A fragment is unread until it has
 * actually been displayed, at which point the journal writes
 * `vol.<id>.viewed-<fragmentId>` — write-once, in the save, therefore surviving
 * tab switches, screen changes, the day roll and a force-quit (AAA 11.20).
 *
 * Flags, not a new save field, for three reasons: it is the same mechanism as
 * the letters (one model for "the player has seen this"), `docs/flags.md`
 * already reserves `vol.*` for the volume machine, and `app/store.ts`'s
 * `selectSave` projection is architect-frozen — a new `JournalSave` field
 * could not be persisted without editing it (see SHARED-FILE REQUESTS).
 */
export function viewedFragmentFlag(volumeId: string, fragmentId: string): string {
  return `vol.${volumeId}.viewed-${fragmentId}`;
}

/**
 * Fragment ids this volume has shown the player WHILE THEY WERE READABLE.
 *
 * ROUND-12 NARROWING (see `glancedFragmentFlag`): the meaning of this flag has
 * not changed for any save ever written — before the seal existed every filed
 * page was legible, so "displayed" and "displayed legibly" were the same
 * sentence — but it is now only half of "she has looked at this".
 */
export function viewedFragmentIds(volumeId: string, flags: Iterable<string>): Set<string> {
  const prefix = `vol.${volumeId}.viewed-`;
  const out = new Set<string>();
  for (const f of flags) if (f.startsWith(prefix)) out.add(f.slice(prefix.length));
  return out;
}

/**
 * ── ROUND-12 DEFECT: ONE MARK, TWO MEANINGS (AAA 11.20 false by design) ─────
 *
 * Round 10 made `displayedFragmentIds` skip sealed pages, so a card the player
 * had fully looked at kept its wax mark for as long as the hand stayed
 * illegible. The comment defending it said the mark was truthful because
 * "there IS something here she has not read" — but that is not what the mark
 * says. Wax on the Journal entrance says *you have not looked at this*, and she
 * had. The marker was answering two different questions with one glyph, so it
 * could not clear on viewing (11.20) and its count could not match the number
 * of unviewed items (11.21): a player who read every card still saw "3".
 *
 * The two states are both real and both worth telling her about, so they get
 * two vocabularies:
 *
 *   UNREAD  — wax. State: you have not looked at this card.
 *   SEALED  — smudge (an unbroken seal, an ink ring, never wax). Promise: this
 *             page is yours and is not yet made out; solve a room.
 *
 * Four coherent combinations, all reachable, all rendered:
 *
 *   | seen? | legible? | wax | smudge |
 *   |-------|----------|-----|--------|
 *   | no    | no       |  ●  |   ⊖    |  a torn leaf she has not even opened to
 *   | yes   | no       |  ·  |   ⊖    |  she has seen the smudge; it still is one
 *   | no    | yes      |  ●  |   ·    |  legible and never looked at — INCLUDING
 *   |       |          |     |        |  a page she glanced at while sealed and
 *   |       |          |     |        |  which a solve has since made out
 *   | yes   | yes      |  ·  |   ·    |  read
 *
 * The third row is the other half of the directive: a page becoming legible IS
 * information she has not seen, so it must re-raise unread. That falls out of
 * the encoding rather than needing a rule — seeing a smudge writes `glanced-`,
 * and only seeing the WORDS writes `viewed-`, so the instant `legible-` lands
 * the page is once again "displayed, but never displayed readably".
 *
 * Why a second flag and not a rewrite of the first: flags are write-once and
 * `viewed-` already means "seen it readable" in every save that exists,
 * including the owner's live one and the migration backfill
 * (VIEWED_BACKFILL_FLAG, app/migrations.ts — A8's file, untouched). Encoding
 * the new state as the NEW flag is the only version of this change that does
 * not re-mark sixteen pages she has been reading for a fortnight.
 */
export function glancedFragmentFlag(volumeId: string, fragmentId: string): string {
  return `vol.${volumeId}.glanced-${fragmentId}`;
}

/** Fragment ids this volume has shown the player WHILE THEY WERE SEALED. */
export function glancedFragmentIds(volumeId: string, flags: Iterable<string>): Set<string> {
  const prefix = `vol.${volumeId}.glanced-`;
  const out = new Set<string>();
  for (const f of flags) if (f.startsWith(prefix)) out.add(f.slice(prefix.length));
  return out;
}

/**
 * Has the player actually looked at this page IN ITS CURRENT STATE? The one
 * predicate the whole unread chain hangs on (AAA 11.20).
 */
export function hasSeen(
  fragmentId: string,
  input: { viewedIds: ReadonlySet<string>; glancedIds?: ReadonlySet<string>; sealedIds?: ReadonlySet<string> },
): boolean {
  return input.sealedIds?.has(fragmentId)
    ? !!input.glancedIds?.has(fragmentId)
    : input.viewedIds.has(fragmentId);
}

/**
 * Set once by the save migration. Before viewed-flags existed there was no
 * record of what had been read, so everything already filed is taken as read
 * — a live save must not open the journal wearing sixteen wax dots for pages
 * its owner has been reading for a fortnight (AAA 11.21: no marker where
 * nothing is unread).
 */
export const VIEWED_BACKFILL_FLAG = 'sys.unread.backfilled';

export type JournalTab = 'word' | 'engravings' | 'testimony' | 'letters';

/**
 * Filed-but-not-made-out, by the tab that shows it. The SECOND chain: the
 * smudge marker's entrance count, tab counts and per-card ids all come from
 * here, exactly as the wax marker's do from `JournalUnread`. It is deliberately
 * the same shape, so a reader of either one knows how to read the other — and
 * so the two can never be summed by accident into a single dishonest number.
 */
export interface JournalSealed {
  word: readonly string[];
  engravings: readonly string[];
  testimony: readonly string[];
  /** Every still-sealed fragment id, all tabs. */
  fragments: readonly string[];
  /** Exactly the number of pages filed and not yet made out. */
  total: number;
}

export interface JournalUnread {
  /** Unviewed definition lines (the Word tab). */
  word: readonly string[];
  engravings: readonly string[];
  testimony: readonly string[];
  /** Arrived-but-unopened letter ids — the seals are their own marker. */
  letters: readonly string[];
  /** Every unviewed fragment id, all tabs. Feeds the per-card markers. */
  fragments: readonly string[];
  /** Exactly the number of unviewed items behind the Journal entrance. */
  total: number;
  /**
   * The other axis (round 12). NOT part of `total`: a page she has looked at
   * and cannot read yet is not unread, and counting it as unread is the exact
   * defect this field exists to end.
   */
  sealed: JournalSealed;
}

export const NOTHING_SEALED: JournalSealed = Object.freeze({
  word: Object.freeze([]) as readonly string[],
  engravings: Object.freeze([]) as readonly string[],
  testimony: Object.freeze([]) as readonly string[],
  fragments: Object.freeze([]) as readonly string[],
  total: 0,
});

export const NOTHING_UNREAD: JournalUnread = Object.freeze({
  word: Object.freeze([]) as readonly string[],
  engravings: Object.freeze([]) as readonly string[],
  testimony: Object.freeze([]) as readonly string[],
  letters: Object.freeze([]) as readonly string[],
  fragments: Object.freeze([]) as readonly string[],
  total: 0,
  sealed: NOTHING_SEALED,
});

export interface UnreadInput {
  /** Seen while READABLE — engine/journal.viewedFragmentIds. */
  viewedIds: ReadonlySet<string>;
  /** Seen while SEALED — engine/journal.glancedFragmentIds. Absent = none. */
  glancedIds?: ReadonlySet<string>;
  /** Filed but not made out — engine/volume.sealedFragmentIds. Absent = none. */
  sealedIds?: ReadonlySet<string>;
  /** Letters in the tray today (engine/volume.arrivedLetters). */
  arrivedLetterIds: readonly string[];
  /** engine/volume.openedLetterIds — the existing honest marker. */
  openedLetterIds: ReadonlySet<string>;
}

/**
 * Both chains in one derivation: the entrance counts, the per-tab counts, and
 * the per-card ids all come from HERE, so the three levels of AAA 11.19 cannot
 * disagree with each other or with the items themselves — and the wax chain
 * and the smudge chain cannot disagree about which page is which.
 *
 * Omitting `sealedIds`/`glancedIds` means "nothing is sealed", which is the
 * pre-seal truth and the truth of every save written before round 10, so the
 * derivation degrades to the plain `!viewed` rule with no caller changes.
 */
export function journalUnread(
  content: VolumeContent,
  state: VolumeState,
  input: UnreadInput,
): JournalUnread {
  const byKind = (kind: FragmentContent['kind'], keep: (id: string) => boolean): string[] =>
    content.fragments
      .filter((f) => f.kind === kind && isFound(state, f.id) && keep(f.id))
      .sort((a, b) => a.revealOrder - b.revealOrder)
      .map((f) => f.id);

  // UNREAD: she has not looked at this card in the state it is in now.
  const unseen = (id: string) => !hasSeen(id, input);
  const word = byKind('definition-line', unseen);
  const engravings = byKind('engraving', unseen);
  const testimony = byKind('testimony', unseen);
  const letters = input.arrivedLetterIds.filter((id) => !input.openedLetterIds.has(id));
  const fragments = [...word, ...engravings, ...testimony];

  // SEALED: the hand is not made out yet, whether or not she has looked.
  const smudged = (id: string) => !!input.sealedIds?.has(id);
  const sWord = byKind('definition-line', smudged);
  const sEngravings = byKind('engraving', smudged);
  const sTestimony = byKind('testimony', smudged);
  const sFragments = [...sWord, ...sEngravings, ...sTestimony];

  return {
    word,
    engravings,
    testimony,
    letters,
    fragments,
    total: fragments.length + letters.length,
    sealed: {
      word: sWord,
      engravings: sEngravings,
      testimony: sTestimony,
      fragments: sFragments,
      total: sFragments.length,
    },
  };
}

/**
 * Exactly the fragments a tab puts on the glass. Marking viewed is driven off
 * this and nothing else — a tab being *selected* is not viewing, and a tab
 * being deselected is not un-viewing (the round-5 bug: `dot && !active`
 * suppressed the marker while the tab was open and handed it straight back on
 * return).
 */
export function displayedFragmentIds(
  content: VolumeContent,
  state: VolumeState,
  tab: JournalTab,
): string[] {
  // ROUND 12 — THIS FUNCTION ANSWERS ONE QUESTION AND IT IS NOT ABOUT INK.
  //
  // Round 10 filtered sealed pages out of here, which made "displayed" mean
  // "displayed legibly" and left a card she had fully looked at wearing an
  // unread mark. The mark is about her eyes, not about the hand: a sealed leaf
  // she has opened the tab and looked at HAS been displayed to her, and it is
  // the SMUDGE marker's job — not wax's — to say the ink has run.
  //
  // So this returns everything the tab puts on the glass, sealed included, and
  // the caller (app/slices/journal.markFragmentsViewed) records what she saw in
  // the state she saw it in: `glanced-` for a smudge, `viewed-` for words. A
  // later decipher therefore re-raises unread all on its own, because the page
  // has still never been displayed READABLY.
  switch (tab) {
    case 'word':
      return definitionSlots(content, state)
        .filter((s) => s.fragment)
        .map((s) => s.fragment!.id);
    case 'engravings':
      return foundByKind(content, state, 'engraving').map((f) => f.id);
    case 'testimony':
      return foundByKind(content, state, 'testimony').map((f) => f.id);
    // Letters are not "viewed" by opening the tab: the seal is unbroken until
    // she breaks it, and openLetter already records that (AAA 11.20).
    case 'letters':
      return [];
  }
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

/**
 * Derived only from engravings that are found AND MADE OUT — the journal never
 * spoils, and (round 10) never reads an inscription the player has not yet
 * deciphered. This is where "solving matters" has its teeth: the constraint
 * that the plate tests against the alphabet arrives when a word game is
 * solved, not when a violet door is opened.
 */
export function alphabetFacts(
  content: VolumeContent,
  state: VolumeState,
  opts?: SealedOpts,
): AlphabetFacts {
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
    if (f.kind !== 'engraving' || !f.constraint || !isLegible(state, f.id, opts)) continue;
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

/**
 * The verdict the Portrait actually delivered on a refused word.
 *
 * The journal is a memory prosthetic, not an oracle (MANOR_DESIGN §7, AAA
 * 3.3): it re-presents what she was TOLD, never a sharper fact than anyone
 * spoke. It used to print `${sharedLetters} letters shared`, an exact
 * distinct-letter intersection count, free, once a day, forever — a
 * Mastermind channel that solves the letter set right past the engraving
 * economy. Nobody in the fiction ever says a number; the Portrait speaks in
 * these five shades, so these five shades are what gets filed.
 *
 * The order below IS the authored priority order of his
 * `portrait.guess.*` variants (repeat 720 > right-length 715 >
 * warm-letters 710 > one-letter 705 > cold 700) — tests/journal.test.ts pins
 * the two together so a content edit can never leave the journal quoting a
 * line he did not say.
 */
export type GuessVerdict = 'repeat' | 'right-shape' | 'circling' | 'one-letter' | 'cold';

export function guessVerdict(c: GuessCloseness): GuessVerdict {
  if (c.repeat) return 'repeat';
  if (c.rightLength) return 'right-shape';
  if (c.sharedLetters >= 2) return 'circling';
  if (c.sharedLetters >= 1) return 'one-letter';
  return 'cold';
}

/** Marginal shorthand for each verdict — his words, shortened, not a metric. */
export const VERDICT_TOKENS: Readonly<Record<GuessVerdict, string>> = {
  repeat: 'the door had heard it',
  'right-shape': 'the right shape',
  circling: 'the hinges shifted',
  'one-letter': 'one letter true',
  cold: 'not a letter of it',
};

export interface GuessRecord {
  day: number;
  guess: string;
  /** What the Portrait said of it, in his taxonomy — never a letter count. */
  verdict: GuessVerdict;
  /** It turned out to be the word. */
  wasAnswer: boolean;
}

export function guessHistory(content: VolumeContent, state: VolumeState): GuessRecord[] {
  const answerNorm = content.answer.toUpperCase();
  return state.guesses.map((g, i) => ({
    day: g.day,
    guess: g.guess,
    // computeCloseness stays the dialogue selector's input; only its coarse
    // verdict is ever shown to the player.
    verdict: guessVerdict(computeCloseness(content.answer, g.guess, state.guesses.slice(0, i))),
    wasAnswer:
      g.guess === answerNorm ||
      content.accepted.some((a) => a.toUpperCase().replace(/[^A-Z]/g, '') === g.guess),
  }));
}

// ---------------------------------------------------------------------------
// Arrival — what the walk up actually was (AAA 4.16 / 5.1, MANOR_DESIGN §7)
// ---------------------------------------------------------------------------

/**
 * ROUND-8 DEFECT: THE CLIMAX WITH NO JOURNEY BEHIND IT.
 *
 * The Portrait opened every first visit with "So you have climbed far enough
 * to ask" — measured live on day 2, standing in the Entrance Hall, with zero
 * fragments, reached by tapping a link in the journal. The line was addressed
 * to someone who had climbed nothing, because the door was a menu item.
 *
 * The door is now the door: `SanctumView` only puts the guess box on glass
 * when `atSanctumDoor(manor)` — she is on the landing and the room she
 * drafted there drew a north door. That makes an arrival a real event, and
 * this taxonomy is what lets him speak to the one she actually had. It is the
 * same shape as `guessVerdict` above (a coarse shade, never a number), and
 * the authored `portrait.arrive.*` variants are keyed by it — the closeness
 * variants already proved the pattern works.
 *
 *   first — she has never stood here before, in this volume
 *   spent — she got here on fumes: not enough left to climb another storey,
 *           so this is the last thing today will be
 *   again — she has been here before and has road left under her
 */
export type ArrivalShade = 'first' | 'spent' | 'again';

/**
 * The step floor for "spent": one more storey's walk at the top of the house
 * — below that the landing IS the end of the evening — read off the live
 * movement table rather than re-typed, so retuning the climb retunes the line
 * that comments on it.
 *
 * Clamped to a third of the day's budget so the shade can never swallow the
 * others: a future `MOVE_COST_BY_ROW` that priced the top storey at half a day
 * would otherwise make EVERY arrival "spent" and turn the other two variants
 * into unseeable content (the AAA 5.5 starvation shape, in code rather than
 * in priorities).
 */
export const SPENT_ARRIVAL_STEPS = Math.min(
  -moveAt(MANOR_ROWS - 1),
  Math.floor(BASE_DAY_BUDGET / 3),
);

export function arrivalShade(opts: { firstEver: boolean; stepsLeft: number }): ArrivalShade {
  if (opts.firstEver) return 'first';
  if (opts.stepsLeft <= SPENT_ARRIVAL_STEPS) return 'spent';
  return 'again';
}

/** `vol.<volumeId>.landing-reached` — write-once, set by the volume machine
 *  the first time she actually stands at the door (docs/flags.md `vol.*`). */
export function landingFlag(volumeId: string): string {
  return `vol.${volumeId}.landing-reached`;
}

// ---------------------------------------------------------------------------
// Nudges — cozy-detective signaling (AAA 4.16), never silence
// ---------------------------------------------------------------------------

export interface SanctumReadiness {
  /** Pages in the journal, readable or not — what she has been collecting. */
  filed: number;
  /** Pages she can actually READ — what she knows (round 11, see below). */
  legible: number;
  total: number;
  /** Past the thin-file band: the case file is worth carrying upstairs. */
  enough: boolean;
  /**
   * Enough READABLE pages that the constraint set can actually pin a word
   * (`DEDUCTION_FLOOR`). Only here does the insufficient-info nudge stand
   * down — see the round-14 note on that constant.
   */
  deducible: boolean;
}

/**
 * Below this many filed fragments the Portrait gently notes the thin file.
 * A nudge only — never a gate (AAA 4.18: solvable from day one).
 *
 * The nudge COPY is not here. It used to be: two strings in this module, in
 * the housekeeper's voice ("The journal is still empty, dear…"), painted
 * unattributed on the Sanctum screen directly beneath the Portrait's line —
 * who says "dear" exactly zero times across his authored lines. It now lives
 * where every other character reaction lives, as authored JSON
 * (`portrait.gate.empty-journal` / `portrait.gate.thin-file`, AAA 5.13);
 * their `fragmentCount` conditions mirror this constant and
 * tests/journal.test.ts pins them together.
 */
export const THIN_FILE_THRESHOLD = 4;

/**
 * ── ROUND-14 DEFECT: THE 4.16 NUDGE RETIRED AT 4 AND DEDUCTION NEEDED 13. ───
 *
 * `enough` used to be `legible >= THIN_FILE_THRESHOLD`, and SanctumView
 * suppressed the WHOLE nudge on it. The Portrait's authored gate lines covered
 * ≤0 and 1–3 and stopped. So from four readable pages to about thirteen — the
 * majority of the volume's duration, measured median day 5 to median day 20 for
 * PROFILE_DECENT — she stood at the door, spent her one word a day, and got
 * exactly the silence AAA 4.16 forbids ("an explicit sympathetic nudge, never
 * silence"). Two numbers existed for one concept and neither doc named the
 * other, which is the §0.5 escape shape: a criterion no critic can fail.
 *
 * The band edge is now the mystery's own constant (`FRAGMENTS_TO_DEDUCE`,
 * engine/volume.ts) rather than a second literal, the authored bands tile
 * 0 → DEDUCTION_FLOOR with no gap and no overlap, and tests/journal.test.ts
 * pins the JSON, this constant and A2's `KNOWLEDGE.fragmentsToDeduce` to each
 * other — exactly as the thin-file pair was already pinned.
 *
 * THIN_FILE_THRESHOLD keeps its own, smaller job: below it the file is *thin*
 * (the journal rail's "worth taking upstairs"), which is a different sentence
 * to "this file cannot yet name a word".
 */
export const DEDUCTION_FLOOR = FRAGMENTS_TO_DEDUCE[0];

/**
 * ROUND-11 DEFECT: EVERY FRAGMENT GATE COUNTED PAGES SHE CANNOT READ.
 *
 * This function (and `dialogueContext.fragmentsFound` behind the authored
 * `fragmentCount` conditions) read `state.foundFragmentIds.length` flat, so a
 * player holding four sealed smudges — zero constraints on the alphabet plate,
 * nothing in the poem, nothing for Ellery — cleared THIN_FILE_THRESHOLD and
 * RETIRED the Portrait's thin-file nudge, the one AAA 4.16 signal in the game.
 * It also contradicted the module's own rule: `nextUninterpreted`, `crossRefs`
 * and `alphabetFacts` all take SealedOpts because "she reads English, not
 * smudges", yet the count that decides whether she is ready to guess did not.
 *
 * So readiness now carries BOTH numbers and hangs `enough` on the legible one.
 * `filed` is not dropped — "she has been collecting" is a real and different
 * thing to signal (the Sanctum link says both, which is the enticing version
 * of the sealed state rather than a hidden one), and the authored dialogue
 * splits the same way: `fragmentCount` for collecting, `fragmentsLegible` for
 * knowing (engine/dialogue/conditions.ts).
 */
export function sanctumReadiness(
  content: VolumeContent,
  state: VolumeState,
  opts?: SealedOpts,
): SanctumReadiness {
  const filed = state.foundFragmentIds.length;
  const legible = filed - sealedCount(state, opts);
  return {
    filed,
    legible,
    total: content.fragments.length,
    enough: legible >= THIN_FILE_THRESHOLD,
    deducible: legible >= DEDUCTION_FLOOR,
  };
}

/**
 * The journal's own gentle next-thing pointer, shown under the case file.
 * Rendered by the UI as a pencilled marginal note signed "— E.": Ellery reads
 * the journal over the player's shoulder, so the ghost librarian owns the
 * "dear" and the pointer is somebody's voice rather than the furniture's.
 */
export function journalNudge(
  content: VolumeContent,
  state: VolumeState,
  opts?: SealedOpts,
): string | null {
  if (state.status === 'solved') return null;
  const found = state.foundFragmentIds.length;
  if (found === 0) return 'Draft toward the violet rooms, dear — the manor files what it finds, all by itself.';
  // The backlog outranks every other pointer: a page she cannot read yet is
  // the most useful thing anyone could point at, and the answer to it is a
  // word game (the round-10 loop, in Ellery's voice).
  const sealed = sealedCount(state, opts);
  if (sealed > 0) {
    // ROUND 13 (AAA 6.16): Ellery no longer recites the rail's instruction.
    // The Word tab was printing "solve a room" five times in three verbs — once
    // per sealed line, again here, again in the rail — and the tier hint twice.
    // The rail owns the instruction and the tier hint (it has the count beside
    // it); Ellery says the thing only Ellery can say, which is that she cannot
    // read them either. Two lines, two different sentences.
    return sealed === 1
      ? 'One leaf here is not made out yet, dear. I am no more use on it than you are — bring it back to me once it is.'
      : `${sealed} of these are not made out yet, dear. I cannot read a word of them either, and I have had eleven years of practice.`;
  }
  const uninterpreted = nextUninterpreted(content, state, opts);
  const facts = alphabetFacts(content, state, opts);
  if (facts.sources === 0) {
    return 'No engravings yet. They are cut into lintels and inkstands about the house — the alphabet plate is waiting for them.';
  }
  if (uninterpreted && found >= 3) {
    return 'Bring me one of these over something warm and I will read it again, more slowly.';
  }
  if (found < content.fragments.length) {
    return 'You might reread what the engravings say, dear — side by side, they narrow wonderfully.';
  }
  return 'Every fragment is filed. The rest is deduction — and one word, spoken at the top of the house.';
}
