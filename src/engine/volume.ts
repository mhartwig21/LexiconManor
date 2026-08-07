/**
 * The volume mystery FSM — OWNER: A7 (Mystery). Pure TS, no React/DOM/JSON.
 *
 * The manor's meta-puzzle (MANOR_DESIGN §7, ARCHITECTURE §7): a word was
 * struck from every dictionary, its definition survives as fragments, and the
 * Sanctum door wants the word *typed*.
 *
 * TWO GATES, NOT ONE (AAA 4.10e; MANOR_DESIGN §7 was rewritten to match in
 * round 14). The answer is fixed at volume start and no fragment is ever
 * mechanically required — 4.18's solvable-in-principle promise is intact, and
 * this module is where it is kept: `applyGuess` asks the constraint set
 * nothing. But knowing the word is only the FIRST gate; the second is standing
 * at the door, and since round 7 `guessAtSanctum` refuses a word spoken from
 * anywhere but the landing. A bare, perfectly efficient day-1 ascent costs 22
 * against a day-1 pot of 21 (`reserveToTop(1)` vs `BASE_DAY_BUDGET +
 * FIRST_MORNING_POT`), so the climb is bought with refunds and the measured
 * day-1 landing reach is 3.3–6.5%. "Solvable on day one" is a statement about
 * the ANSWER, never a prediction about the evening.
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
  CharacterId, DayRecord, FragmentDef, FragmentKind, LetterDef, RoomCategory, Tier, VolumeDef,
  VolumeState,
} from './types';
import type { GuessCloseness, RecordedEvent } from './events';
import type { RoomPuzzleKind } from './rooms/room-puzzle';

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
  /**
   * WHICH SOLVE CHANNEL PAYS THIS PAGE (round 17 — REVIEW_AA §5.1).
   *
   * Authored routing, and the one thing that decides whether the best writing
   * in the volume is reachable by playing the game. Absent, the channel is
   * INFERRED from `(sourceRoomCategory, kind)` exactly as it was before this
   * field existed — see `isChannelFragment`.
   *
   * The two labels used to be welded together, and that weld is what REVIEW_AA
   * §5.1 measured: `kind: 'definition-line'` implied "only the Study pays this",
   * and the Study is `tierRange: [3,3], rarity: 'rare', gemCost: 2`. So all six
   * lines of the definition — the best prose in the repository — were behind the
   * rarest room in the deck, and the ordinary word games could pay exactly two
   * fragments in the whole volume. Solving every board in the manor moved the
   * mystery by nothing from about day 2 onward.
   *
   * Splitting them separates two questions that were never the same question:
   *   - `sourceRoomCategory` — WHERE THE FICTION PUTS IT, and therefore which
   *     room the violet drip prefers to hand it over in (`nextFragmentForRoom`);
   *   - `channel` — WHICH SOLVE PAYS FOR IT.
   * A torn leaf in the lexicographer's hand can be a page the violet rooms keep
   * AND a page an ordinary evening's solve earns. Before, it had to be one.
   */
  channel?: SolveChannelId;
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
// The deduction band — how many READABLE pages actually pin the word
// ---------------------------------------------------------------------------

/**
 * ── ROUND-14 DEFECT: TWO NUMBERS FOR ONE CONCEPT, AND NEITHER NAMED THE OTHER.
 *
 * `THIN_FILE_THRESHOLD` (engine/journal.ts) is 4, and it retired the Portrait's
 * insufficient-info nudge — the one AAA 4.16 signal in the game. The campaign
 * model's `KNOWLEDGE.fragmentsToDeduce` is [13, 17], and
 * tests/volume-solvability.test.ts proves why: volume 1's six engravings run
 * 171755 → 15232 → 298 → 22 → 11 → 2 → 1, so FIVE of them still leave two
 * candidate words. Between those two numbers — measured, median day 5 to
 * median day 20 for PROFILE_DECENT, the majority of the volume's duration —
 * the player stood at the door, spent her one word a day and got silence,
 * because the nudge had already stood down.
 *
 * This band is the one place that number lives on the mystery's side of the
 * fence. `engine/journal.DEDUCTION_FLOOR` is `[0]` of it, the authored
 * `portrait.gate.*` bands tile up to it, and tests/journal.test.ts pins all
 * three to each other AND to `KNOWLEDGE.fragmentsToDeduce` in A2's model, so
 * the two cannot drift apart again in either direction.
 *
 *   [0] the optimistic end — she guesses between the last two candidates
 *   [1] the resistant end — the constraint set has to close all the way
 *
 * It is a property of the CONSTRAINT SET, not a difficulty knob: re-derive it
 * from tests/volume-solvability.test.ts's chain when a volume's engravings
 * change, never by feel.
 *
 * ── ROUND 18 (REVIEW_AA §5.1/§5.2 fallout): 13 → 15 ────────────────────────
 *
 * Not a difficulty knob after all — a correction forced by the other two
 * changes. §5.1 routed the spine through the word games and §5.2 bolted a
 * speaking tube to the Entrance Hall, and together they removed both walls at
 * once: knowledge arrived daily AND the door stopped being a lottery, so the
 * skilled player closed the volume in ten evenings and 7% of her campaigns
 * ended inside the first week. A game that publishes a 14–28 day volume cannot
 * be finished in six.
 *
 * 15 is still read off the chain, not off feel. tests/volume-solvability.test.ts
 * filters the dictionary by the six engravings in reveal order: the fifth
 * leaves LACUNA and LAGUNA both standing, and only the sixth (`contains C`)
 * separates them. The optimistic end is therefore "she holds everything except
 * the tie-breaker and guesses between two words" — with 6 engravings, 6
 * definition lines and 5 testimonies authored, holding five of six engravings
 * plus the surrounding prose IS fifteen pages. 13 was the old drip's number,
 * measured when a third of the volume was unreachable in a fortnight.
 */
export const FRAGMENTS_TO_DEDUCE: readonly [number, number] = [15, 17];

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

// ---------------------------------------------------------------------------
// Room-SOLVE channels — the word games pay the mystery (AAA 4.14 / 11.17)
// ---------------------------------------------------------------------------

/**
 * ROUND-8 DEFECT: THE LABELLED CHANNEL WITH NO EMITTER.
 *
 * `nextFragmentForRoom` above had exactly one live caller — the violet-room
 * branch of A1's `chooseCard` — so *drafting a mystery room* was the only room
 * channel in the game. Volume 1 nevertheless labels fragments
 * `sourceRoomCategory: "puzzle"`, and `RoomEvent.reward.fragmentId` is
 * consumed by `app/slices/room.ts` and emitted by no adapter. A source
 * category no room can answer to is a dead reward class (AAA 11.17), and it
 * made the word games and the mystery mechanically disjoint: the Study — the
 * room MANOR_DESIGN §6 calls the meta-mystery's engine — moved the mystery
 * not at all.
 *
 * A solve channel closes that. It is a STRICT match (category *and* fragment
 * kind, never the global fallback `nextFragmentForRoom` uses): a channel with
 * nothing authored for it pays nothing rather than quietly draining the
 * violet drip, so the number of fragments a volume routes through the word
 * games is an authoring decision visible in the volume JSON.
 *
 *   - THE STUDY (`forgotten-word`, MANOR_DESIGN §6 "feeds the meta-mystery
 *     directly"). Its own puzzles are the lexicographer's unfinished entries
 *     (tests/volume-premise.test.ts), so finishing one and being handed a line
 *     of the entry he *unfinished on purpose* is the room's whole point.
 *   - THE LINTEL — every other word game in the house.
 *
 * Both are valved to once per day per channel by the caller (see
 * `solveChannelFiledToday`), so a five-room evening is not a fragment
 * firehose and `tests/volume-pacing.test.ts` keeps measuring 4.10e.
 *
 * ── ROUND-17 (REVIEW_AA §5.1): WHICH CHANNEL IS AUTHORED, NOT DEDUCED ───────
 *
 * The two channels above used to be defined by fragment KIND: the Study paid
 * definition lines, the lintel paid engravings, and nothing else was sayable.
 * That is a routing rule disguised as a taxonomy, and REVIEW_AA measured what
 * it cost. Volume 1 authors seventeen fragments; under the kind rule exactly
 * TWO were reachable by an ordinary evening's solve, three needed a `rare`
 * tier-3 two-gem room, eight needed a violet draw and four needed a character.
 * All six definition lines — the best prose in the repository — sat behind the
 * deck's rarest doors, and the game's own simulation measured a solve making a
 * page out on 0.23 of the median player's days.
 *
 * So a fragment now NAMES its channel (`FragmentContent.channel`), and the
 * (category, kind) pair below is only the default when it does not. The channel
 * definitions keep their `kind` because that default is still the right one for
 * an unlabelled volume — but the number of fragments a volume routes through
 * the word games is now an authoring decision visible on one line of the volume
 * JSON, which is what this header claimed all along and could not deliver.
 */
// Declared in ./types so `events.ts` (which volume.ts imports) can stamp it on
// `fragment-found` without importing upward. Re-exported here because this is
// the module that owns what a channel *is*.
export type { SolveChannelId } from './types';
import type { SolveChannelId } from './types';

export interface SolveChannel {
  /** Stable name — the authored `FragmentContent.channel` label, the daily
   *  valve, and the tests. */
  id: SolveChannelId;
  /** The (category, kind) pair a fragment falls into when it declares no
   *  `channel` of its own. Inference only — never a second gate on top of an
   *  explicit label (see `isChannelFragment`). */
  category: RoomCategory;
  kind: FragmentKind;
}

export const STUDY_CHANNEL: SolveChannel = {
  id: 'study', category: 'puzzle', kind: 'definition-line',
};
export const LINTEL_CHANNEL: SolveChannel = {
  id: 'lintel', category: 'puzzle', kind: 'engraving',
};

/** Which channel a solved room of this kind pays into. */
export function solveChannelFor(kind: RoomPuzzleKind): SolveChannel {
  return kind === 'forgotten-word' ? STUDY_CHANNEL : LINTEL_CHANNEL;
}

/**
 * Does this fragment belong to that channel? (Also the valve's predicate.)
 *
 * An explicit `FragmentContent.channel` WINS OUTRIGHT — it is not an extra
 * condition layered on the inferred one, or the whole point of the field would
 * be lost the moment an authored label disagreed with the fragment's kind,
 * which is exactly the case §5.1 exists to make expressible (a definition line
 * paid by an ordinary word game). Fragments with no label keep the pre-round-17
 * inference, so a volume that never uses the field behaves exactly as before.
 *
 * A fragment still belongs to at most ONE channel either way: labels are a
 * single id, and the two inferred pairs are disjoint (same category, different
 * kinds). `tests/volume-channels.test.ts` pins that as a property of the
 * authored volume rather than trusting the argument.
 */
export function isChannelFragment(f: FragmentDef, channel: SolveChannel): boolean {
  const declared = (f as FragmentContent).channel;
  if (declared) return declared === channel.id;
  return f.sourceRoomCategory === channel.category && f.kind === channel.kind;
}

/**
 * The fragment a solved room hands over: lowest unfound `revealOrder` in the
 * channel, or null. STRICT — no fallback (see the header). Reserved testimony
 * is honoured for symmetry with the room drip, though a channel never selects
 * testimony in the first place.
 */
export function fragmentForSolveChannel(
  def: VolumeDef,
  state: VolumeState,
  channel: SolveChannel,
  opts?: { reservedIds?: ReadonlySet<string> },
): FragmentDef | null {
  const reserved = opts?.reservedIds;
  return (
    unfoundFragments(def, state).find(
      (f) => isChannelFragment(f, channel) && !reserved?.has(f.id),
    ) ?? null
  );
}

/**
 * HOW MANY PAGES THIS VOLUME ROUTES THROUGH THIS CHANNEL.
 *
 * ── ROUND-17 DEFECT (verifier): THE MODEL WAS STILL MEASURING THE OLD ROUTING.
 *
 * `KNOWLEDGE.studyChannelStock`/`lintelChannelStock` in economy/simulate.ts were
 * LITERALS — `3` and `2` — with a docstring naming the authored counts they were
 * copied from. The §5.1 re-route changed those counts to 2 and 11 in the volume
 * JSON and the literals stayed, so `simulateCampaigns` — the instrument REVIEW_AA
 * §8 says to re-run to check the work — went on modelling the starved channel it
 * was written against. That is the review's own §0 finding one level down: the
 * team measuring yesterday's game, this time because a constant was transcribed
 * instead of derived.
 *
 * So the count is computed from the authored volume now, through the same
 * `isChannelFragment` predicate the live game routes on. A re-route moves the
 * simulation automatically, and the two can no longer disagree.
 */
export function channelStock(def: VolumeDef, channel: SolveChannel): number {
  return def.fragments.filter((f) => isChannelFragment(f, channel)).length;
}

/**
 * The daily valve, derived off the audited spine rather than stored: has this
 * channel already paid today? `recentEvents` are day-stamped and live in the
 * save, so this survives a screen change, a reload and a force-quit, and it
 * resets exactly when the day does — no new save field, no in-memory counter
 * that a refresh could hand back (the AAA 11.20 lesson, applied to a valve).
 */
export function solveChannelFiledToday(
  _def: VolumeDef,
  channel: SolveChannel,
  recentEvents: readonly RecordedEvent[],
  day: number,
): boolean {
  return recentEvents.some((r) => {
    if (r.day !== day) return false;
    const ev = r.event;
    // ROUND 18: `via` — the TAP, not the page. See events.ts `fragment-found`.
    // Asking `isChannelFragment(theFragment, channel)` here made a violet draw
    // spend the solve channel's daily allowance as soon as §5.1's re-route put
    // lintel-labelled pages into the drip.
    return ev.type === 'fragment-found' && ev.via === channel.id;
  });
}

/** Every source category the authored volume actually labels — the manifest
 *  `tests/volume-channels.test.ts` walks so a label with no emitter fails the
 *  build rather than shipping as decoration (AAA 11.17). */
export function declaredSourceCategories(def: VolumeDef): RoomCategory[] {
  const out: RoomCategory[] = [];
  for (const f of def.fragments) {
    if (!out.includes(f.sourceRoomCategory)) out.push(f.sourceRoomCategory);
  }
  return out;
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

/**
 * THE LEGIBLE-DAY MARK — the round-13 fix to the pity floor (AAA 4.14).
 *
 * THE DEFECT, in one sentence: the mercy channel was switched off by pages she
 * could not read. `DayRecord.fragmentsFound` counts `fragment-found`, and a
 * violet room fires that for a SEALED page too (deliberately — the moment layer
 * has to see the seal). So a smudge reset the drought to zero, and the player
 * the seal is designed to press — drafting violet rooms, solving nothing — had
 * the one [BEAT] guarantee in 4.14 ("≥1 new fragment within any 3 consecutive
 * days") silently withdrawn by the very documents that taught her nothing.
 *
 * Round 11 audited this exact "counted pages she cannot read" shape and fixed
 * three of the four sites (`sanctumReadiness`, `fragmentsLegible`,
 * `simulateCampaign`'s deduction counter) and left the mercy channel.
 *
 * THE MARK. A day on which at least one page she can actually READ landed —
 * a legible filing (letter enclosure, testimony, the solve channel) or a solve
 * deciphering the backlog — writes `vol.<volumeId>.made-out-day-<N>`, the same
 * write-once flag mechanism the seal itself rides (docs/flags.md, round 10).
 * It is a per-day family, so it needs no save-schema change and no field on the
 * architect-owned `DayRecord`; the chronicles keep printing the FILED count,
 * which is the right number for a chronicle ("what arrived"), while the drought
 * reads the LEGIBLE one, which is the right number for mercy ("what taught her
 * anything").
 */
export function legibleDayFlag(volumeId: string, day: number): string {
  return `vol.${volumeId}.made-out-day-${Math.max(0, Math.floor(day))}`;
}

/** The day numbers on which this volume made something out (from the flags). */
export function legibleDays(volumeId: string, flags: Iterable<string>): Set<number> {
  const out = new Set<number>();
  const prefix = `vol.${volumeId}.made-out-day-`;
  for (const f of flags) {
    if (!f.startsWith(prefix)) continue;
    const n = Number.parseInt(f.slice(prefix.length), 10);
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

export interface DroughtOpts {
  /**
   * The days on which something LEGIBLE landed (`legibleDays`). Supplied, the
   * drought counts days since she last learned anything; omitted, it falls back
   * to `DayRecord.fragmentsFound`, which counts smudges — correct only for a
   * caller that genuinely means "documents arrived".
   */
  legibleDays?: ReadonlySet<number>;
}

/** Days of completed play since a fragment last appeared (from the banked
 *  DayRecords — chronicles are the one persistent per-day record). */
export function fragmentDroughtDays(
  dayRecords: readonly DayRecord[],
  opts?: DroughtOpts,
): number {
  const legible = opts?.legibleDays;
  let drought = 0;
  for (let i = dayRecords.length - 1; i >= 0; i--) {
    const record = dayRecords[i]!;
    const learned = legible ? legible.has(record.day) : record.fragmentsFound > 0;
    if (learned) break;
    drought++;
  }
  return drought;
}

/**
 * The one-call form every live caller should use: how many days since she last
 * made anything out, read off the volume's own flags. Exists so no surface can
 * accidentally pass the smudge-counting default — the mistake this whole block
 * is here to end.
 */
export function legibleDroughtDays(
  volumeId: string,
  flags: Iterable<string>,
  dayRecords: readonly DayRecord[],
): number {
  return fragmentDroughtDays(dayRecords, { legibleDays: legibleDays(volumeId, flags) });
}

/**
 * ROUND 18 (REVIEW_AA §5.1): 3 → 2.
 *
 * The review's success metric is *"a legible fragment on ≥90% of the first 14
 * days"*, and its caution in the same breath is *"keep the mercy system as a
 * floor, but it should stop being the primary path"*. Those pull opposite ways,
 * and the measurement says where the line is: at 3 the median player learned
 * something on 75% of her first fortnight; at 2 it is 80%; at 1 it is 100% —
 * but at 1 the pity letter IS the drip, which is the thing the review told us
 * not to do. So 2: two blank evenings in a row is a drought, one is a quiet
 * night the seal is allowed to make her sit through.
 *
 * (The remaining gap to 90% is not tunable — it is arithmetic. See
 * `scripts/review-metrics.ts`: 17 authored fragments cannot cover 14 days at
 * one a day AND still leave a four-week campaign. Volume 1 needs more authored
 * pages, not a smaller drought.)
 */
export const PITY_DROUGHT_DAYS = 2;

/** Should the pity channel fire? (Also exported for A1's violet-offer seeding.) */
export function pityDue(
  def: VolumeDef,
  state: VolumeState,
  dayRecords: readonly DayRecord[],
  opts?: DroughtOpts,
): boolean {
  return (
    state.status === 'active' &&
    unfoundFragments(def, state).length > 0 &&
    fragmentDroughtDays(dayRecords, opts) >= PITY_DROUGHT_DAYS
  );
}

// ---------------------------------------------------------------------------
// LEGIBILITY — entering gets the document, solving makes it legible
// ---------------------------------------------------------------------------

/**
 * ROUND-10 DESIGN CHANGE — "WHAT IS THE POINT OF SOLVING THE WORD PUZZLES?"
 *
 * Owner directive, verbatim: *"What's the point of solving the word puzzles?
 * Solving them needs to matter, even if they're not blocking (I like they're
 * not blocking from a cozy pov)."*
 *
 * The verified defect: a violet room handed over its fragment on ENTRY
 * (app/slices/manor.ts), fully readable, and a solved word game paid back
 * steps. So the player could walk into the Archive, walk out without touching
 * anything, and keep the clue — the word games funded the mystery without ever
 * BEING the mystery.
 *
 * The fix keeps the cozy promise (nothing is ever locked away) and still makes
 * the puzzle the thing that moves the case:
 *
 *   - ENTERING a mystery room still files the fragment, forever, immediately —
 *     but SEALED: a torn leaf, a smudged rubbing, a page not yet made out. It
 *     is hers regardless, it is visible in the journal, and it is never
 *     required for anything (AAA 4.18 — a sharp player still wins on day one,
 *     because the answer is fixed at volume start and no fragment gates the
 *     door).
 *   - SOLVING a word game MAKES PAGES OUT. The room's own solve-channel
 *     fragment arrives already legible (you solved for it), and the solve
 *     additionally deciphers `decipherYield(tier)` of the sealed backlog —
 *     ONE at the ground floor, THREE at the top (AAA 4.10's "tier scales the
 *     yield").
 *
 * A sealed engraving therefore carries no machine-checkable constraint yet:
 * `alphabetFacts` reads only made-out engravings (engine/journal.ts), which is
 * exactly the mechanical teeth the directive asks for — the plate narrows when
 * she SOLVES, not when she walks.
 *
 * ── PERSISTENCE, WITHOUT A SAVE-SCHEMA CHANGE ──────────────────────────────
 * `VolumeState` is frozen in engine/types.ts and `app/store.ts`'s `selectSave`
 * projection is architect-owned, so legibility rides the same write-once flag
 * mechanism the letters' `opened-` and the journal's `viewed-` markers already
 * use (docs/flags.md `vol.*`).
 *
 * It takes TWO flags rather than one, deliberately, and the reason is the live
 * save: a fragment is sealed iff `sealed-<id>` is set AND `legible-<id>` is
 * not. Flags are write-once (never unset), so "made out" has to be its own
 * flag; and because the DEFAULT of a save that has neither flag is *legible*,
 * every fragment already filed in the owner's live save stays readable. A
 * single `legible-` opt-in flag would have re-sealed sixteen pages she has
 * been reading for a fortnight, and would have needed a migration in another
 * agent's file to avoid it.
 */
export function sealedFragmentFlag(volumeId: string, fragmentId: string): string {
  return `vol.${volumeId}.sealed-${fragmentId}`;
}

export function legibleFragmentFlag(volumeId: string, fragmentId: string): string {
  return `vol.${volumeId}.legible-${fragmentId}`;
}

function idsWithPrefix(prefix: string, flags: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const f of flags) if (f.startsWith(prefix)) out.add(f.slice(prefix.length));
  return out;
}

/**
 * The fragments of this volume that are filed but NOT yet made out. Derived,
 * never stored: `sealed-` minus `legible-`, so the write-once rule holds and a
 * save written before this mechanic existed reports nothing sealed.
 */
/**
 * The fragments this volume has explicitly MADE OUT — the `legible-` flags on
 * their own. Not the complement of `sealedFragmentIds`: a page that arrived
 * legible in the first place (a letter's enclosure, testimony spoken in
 * person, a solve-channel fragment) never carries the flag, because it never
 * needed one. This set is exactly "pages a solved room deciphered", which is
 * what the moment layer diffs to announce the round-10 reward (AAA 11.11).
 */
export function madeOutFragmentIds(volumeId: string, flags: Iterable<string>): Set<string> {
  return idsWithPrefix(`vol.${volumeId}.legible-`, flags);
}

export function sealedFragmentIds(volumeId: string, flags: Iterable<string>): Set<string> {
  const all = [...flags];
  const sealed = idsWithPrefix(`vol.${volumeId}.sealed-`, all);
  for (const id of idsWithPrefix(`vol.${volumeId}.legible-`, all)) sealed.delete(id);
  return sealed;
}

/**
 * How many sealed pages one solve makes out, by the room's row-band tier.
 * THE TIER SCALING (owner directive 4): "a tier-3 room near the top yields
 * more mystery material than a ground-floor one". Strictly increasing, and
 * pinned by tests/journal.test.ts so a retune cannot flatten it silently.
 */
export const DECIPHER_YIELD_BY_TIER: readonly number[] = [1, 2, 3];

export function decipherYield(tier: Tier): number {
  return DECIPHER_YIELD_BY_TIER[Math.max(0, Math.min(2, tier - 1))]!;
}

/**
 * Which sealed pages a solve makes out: the oldest still-sealed fragments on
 * the drip (lowest `revealOrder` first), so the definition poem fills from the
 * top and the journal never leaves an early gap staring at her while a late
 * one resolves.
 */
export function fragmentsToDecipher(
  def: VolumeDef,
  state: VolumeState,
  sealedIds: ReadonlySet<string>,
  count: number,
): string[] {
  if (count <= 0) return [];
  const found = new Set(state.foundFragmentIds);
  return [...def.fragments]
    .filter((f) => found.has(f.id) && sealedIds.has(f.id))
    .sort((a, b) => a.revealOrder - b.revealOrder)
    .slice(0, count)
    .map((f) => f.id);
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
