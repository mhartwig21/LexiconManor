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

/** The first found-but-uninterpreted fragment (Ellery's 'next' service). */
export function nextUninterpreted(content: VolumeContent, state: VolumeState): string | null {
  const found = content.fragments
    .filter((f) => isFound(state, f.id) && !isInterpreted(state, f.id))
    .sort((a, b) => a.revealOrder - b.revealOrder);
  return found[0]?.id ?? null;
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

/** Fragment ids this volume has actually shown the player. */
export function viewedFragmentIds(volumeId: string, flags: Iterable<string>): Set<string> {
  const prefix = `vol.${volumeId}.viewed-`;
  const out = new Set<string>();
  for (const f of flags) if (f.startsWith(prefix)) out.add(f.slice(prefix.length));
  return out;
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
}

export const NOTHING_UNREAD: JournalUnread = Object.freeze({
  word: Object.freeze([]) as readonly string[],
  engravings: Object.freeze([]) as readonly string[],
  testimony: Object.freeze([]) as readonly string[],
  letters: Object.freeze([]) as readonly string[],
  fragments: Object.freeze([]) as readonly string[],
  total: 0,
});

export interface UnreadInput {
  viewedIds: ReadonlySet<string>;
  /** Letters in the tray today (engine/volume.arrivedLetters). */
  arrivedLetterIds: readonly string[];
  /** engine/volume.openedLetterIds — the existing honest marker. */
  openedLetterIds: ReadonlySet<string>;
}

/**
 * The whole unread chain in one derivation: the entrance count, the per-tab
 * counts, and the per-card ids all come from HERE, so the three levels of
 * AAA 11.19 cannot disagree with each other or with the items themselves.
 */
export function journalUnread(
  content: VolumeContent,
  state: VolumeState,
  input: UnreadInput,
): JournalUnread {
  const unviewed = (kind: FragmentContent['kind']): string[] =>
    content.fragments
      .filter((f) => f.kind === kind && isFound(state, f.id) && !input.viewedIds.has(f.id))
      .sort((a, b) => a.revealOrder - b.revealOrder)
      .map((f) => f.id);

  const word = unviewed('definition-line');
  const engravings = unviewed('engraving');
  const testimony = unviewed('testimony');
  const letters = input.arrivedLetterIds.filter((id) => !input.openedLetterIds.has(id));
  const fragments = [...word, ...engravings, ...testimony];
  return { word, engravings, testimony, letters, fragments, total: fragments.length + letters.length };
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
  found: number;
  total: number;
  /** Enough on the desk that a guess is an act of deduction, not a dart throw. */
  enough: boolean;
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

export function sanctumReadiness(content: VolumeContent, state: VolumeState): SanctumReadiness {
  const found = state.foundFragmentIds.length;
  return {
    found,
    total: content.fragments.length,
    enough: found >= THIN_FILE_THRESHOLD,
  };
}

/**
 * The journal's own gentle next-thing pointer, shown under the case file.
 * Rendered by the UI as a pencilled marginal note signed "— E.": Ellery reads
 * the journal over the player's shoulder, so the ghost librarian owns the
 * "dear" and the pointer is somebody's voice rather than the furniture's.
 */
export function journalNudge(content: VolumeContent, state: VolumeState): string | null {
  if (state.status === 'solved') return null;
  const found = state.foundFragmentIds.length;
  if (found === 0) return 'Draft toward the violet rooms, dear — the manor files what it finds, all by itself.';
  const uninterpreted = nextUninterpreted(content, state);
  const facts = alphabetFacts(content, state);
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
