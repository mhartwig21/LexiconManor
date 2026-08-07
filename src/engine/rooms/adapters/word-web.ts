/**
 * The Library — Word Web behind the RoomPuzzle contract. OWNER: A3.
 *
 * Wraps the existing pure engine (`startWordWeb`/`submitGroup`) — it does not
 * rewrite it. Mistake semantics (AAA §0.3 R.1, §2 word-web bullet):
 *   - wrong group / one-away  → mistake weight 1 (a guess is a claim here)
 *   - malformed input          → mistake weight 0 (AAA 3.2)
 *   - herring acknowledgment + one-away info ride on state feedback for the
 *     view; the priced intruder nudge (AAA 2.10) emits a `hint` event.
 *
 * ROUND 7 — AAA 2.10 [BEAT], "every wrong guess yields ≥1 bit". It did not:
 * a plain-wrong guess returned the bare word `wrong`, so the room charged 2–3
 * steps and replied with nothing the shake had not already said, and the
 * herring line fired whenever ANY flagged word merely sat in the selection —
 * misinformation, not a hint. Two changes, both free with the guess she has
 * already paid for: `together` (how many of her four really do share a thread,
 * which prunes the LOGIC space, not just the option space) and a herring match
 * gated on ≥3 of the four tiles sitting inside one NAMED trap, so the knowing
 * line can say which words and which thread.
 */

import type { Tier, WordWebGroup, WordWebPuzzle } from '../../types';
import { createRng, pick, shuffle } from '../../rng';
import { startWordWeb, submitGroup, type WordWebState } from '../../word-web';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../room-puzzle';
import { getPools, lazyContent } from '../../../app/pools';
import { selectByTier } from './tier-select';

/**
 * Generator enrichments carried in the content JSON (content/generate-wordweb.ts)
 * beyond the frozen WordWebPuzzle shape — extra optional fields ride along in
 * the JSON and are typed here, adapter-locally, without touching engine/types.ts.
 */
export interface WordWebGroupEx extends WordWebGroup {
  /** 2.9 tiering audit tag: how the category is solvable. */
  type?: 'semantic' | 'trivia' | 'wordplay';
  /** 2.11 naming act: two plausible decoy labels for this group, from the pool. */
  decoys?: string[];
}
/**
 * AAA 2.10 [BEAT] — a planted trap AND the thread it imitates, emitted by
 * content/generate-wordweb.ts. `words` is the whole set that shares the
 * relation (the group it apes plus its intruders), which is what lets the room
 * check whether the player was actually chasing THIS trap before it says so.
 */
/**
 * ROUND 11 adds `hidden-string`, split out of `shared-affix`. A trap on a
 * `Contains "HAM"` group is HAMMER — a word with the group's string buried
 * inside it — and calling that the same relation as "these four all end in
 * -GHT" made the room say the same sentence about two different deductions
 * (and hid the fact that 68% of the shelf's acknowledged herrings were one
 * kind of trap). Both carry `detail`: the letters you can point at.
 */
export type WordWebHerringRelation =
  | 'rhyme' | 'shared-affix' | 'doubled-letter' | 'semantic' | 'hidden-string';
export interface WordWebHerring {
  words: string[];
  relation: WordWebHerringRelation;
  /** The shared letters, when the relation is one you can point at. */
  detail?: string;
}
/** A herring the player's selection actually landed on, with her own words. */
export interface WordWebHerringMatch extends WordWebHerring {
  matched: string[];
}

export interface WordWebPuzzleEx extends WordWebPuzzle {
  groups: WordWebGroupEx[];
  /** 2.6 adversarial opening layout: herrings clustered, no gift rows. */
  layout?: string[];
  /** 2.10 named traps. Absent on pre-round-7 fixtures; then nothing is claimed. */
  herrings?: WordWebHerring[];
  /**
   * Round 4 — manor row band. Now declared REQUIRED on WordWebPuzzle in
   * engine/types.ts (the honest home); restated here only for the doc.
   * Tier differences are structural: tier 1 keeps its trivia gimme and ships
   * at most one loose trap; tier 3 bans trivia, requires two SUBTLE categories
   * (rhyme / anagram / silent-letter / hidden word), and must carry 2–3 tight
   * traps that the build-time solver scored.
   */
  tier: Tier;
}

export const WORD_WEB_POOL = lazyContent<WordWebPuzzleEx[]>(
  () => getPools().wordWeb as WordWebPuzzleEx[],
);

/** What the view renders after the last action. Never consumed by slices. */
export type WordWebFeedback =
  | { kind: 'group-solved'; theme: string; tier: string; words: string[]; won: boolean; named?: boolean }
  /** 2.11 act of naming: the last four are woven, but the thread must be named. */
  | { kind: 'name-final'; words: string[]; options: string[] }
  | { kind: 'one-away' }
  /**
   * A plain-wrong claim. AAA 2.10 [BEAT] — it never returns only "no":
   *   - `herring` is set when ≥3 of her four tiles sit inside ONE named trap,
   *     so the room can name the words AND the thread they really share;
   *   - `together` is the free structural bit Connections withholds: how many
   *     of the four DO belong to one group (1 = no two of these share a thread,
   *     2 = two of these do). The engine intercepts 3 as one-away and 4 as a
   *     solve, so this is always 1 or 2 here — and either value prunes the
   *     logic space, not just the option space.
   */
  | { kind: 'wrong'; herring: WordWebHerringMatch | null; together: 1 | 2 }
  | { kind: 'hint'; intruder: string }
  | { kind: 'invalid'; reason: 'need-four' | 'unknown-word' | 'finished' };

export interface WordWebRoomState {
  web: WordWebState;
  costedMistakes: number;
  hintsBought: number;
  /** Total submissions — keys the view's verdict animations. */
  attempts: number;
  /** The last wrong selection, kept so a bought hint can name an intruder. */
  lastWrongSelection: string[] | null;
  /**
   * AAA 2.11: the final group is never pure leftovers. When the last four fall,
   * the player names the thread from three labels before the room solves; the
   * perfect grade and its +2 payout are gated on choosing correctly.
   */
  pendingNaming: { theme: string; tier: string; words: string[]; options: string[] } | null;
  /** null until the naming act happens; false forfeits perfect, never steps. */
  namedCorrectly: boolean | null;
  lastFeedback: WordWebFeedback | null;
}

export type WordWebAction =
  | { type: 'submit'; selection: string[] }
  /** Priced intruder nudge (AAA 2.10): names one word that didn't belong. */
  | { type: 'buy-hint' }
  /** AAA 2.11: pick the final thread's label from three options. */
  | { type: 'name-theme'; theme: string };

function isPerfect(s: WordWebRoomState): boolean {
  return s.costedMistakes === 0 && s.hintsBought === 0 && s.namedCorrectly !== false;
}

function outcomeOf(s: WordWebRoomState): RoomOutcome {
  const solved = s.web.status === 'won' && s.pendingNaming === null;
  return { status: solved ? 'solved' : 'active', perfect: isPerfect(s) };
}

/**
 * ROUND 12 — the identity a naming option has to be unique BY is the string
 * the player reads, not the string the JSON stores.
 *
 * `content/generated/word-web.json` was half-typeset (168 themes with curly
 * marks, 115 with straight), and `WordWebView` prints every label through
 * `typeset()`. Board web-d06 therefore stored `Can Follow “TEA”` as the true
 * theme and `Can Follow "TEA"` as one of its decoys — two different strings,
 * so the `d !== theme` filter passed them both, and the naming act offered the
 * SAME LABEL TWICE with one copy of it wrong. Tapping the wrong twin forfeits
 * the perfect grade and its +2 (AAA 2.11) with nothing on screen to tell them
 * apart, which is the exact unfairness §2 exists to forbid.
 *
 * The corpus is uniformly typeset now and the lint keeps it that way
 * (content/lint-typography.ts walks `content/generated/**` as of this round),
 * but the fairness of the naming act must not depend on the corpus being
 * tidy: options are de-duplicated by the label AS SHOWN — quote handedness
 * folded away, since no pair of labels is ever meant to differ only by it.
 * (Folded here rather than by importing `typeset()`: nothing in `src/engine`
 * imports from `content/`, and this is a comparison key, not a renderer.)
 */
const asShown = (label: string) => label
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/**
 * Decoy labels for the naming act: prefer the generator's authored pair,
 * fall back to plausible same-tier themes drawn deterministically from the pool.
 * Always three labels the player can tell apart, or as many distinct ones as
 * the shelf can supply.
 */
function namingOptions(puzzle: WordWebPuzzleEx, theme: string, tier: string): string[] {
  const taken = new Set([asShown(theme)]);
  const take = (label: string): boolean => {
    const shown = asShown(label);
    if (taken.has(shown)) return false;
    taken.add(shown);
    return true;
  };

  const group = puzzle.groups.find((g) => g.theme === theme);
  let decoys = (group?.decoys ?? []).filter(take).slice(0, 2);
  if (decoys.length < 2) {
    const rng = createRng([...puzzle.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7));
    const pool = WORD_WEB_POOL
      .filter((p) => p.id !== puzzle.id)
      .flatMap((p) => p.groups.filter((g) => g.tier === tier).map((g) => g.theme));
    // Bounded: the pool is finite and every miss is a duplicate we have already
    // seen, so the walk terminates even when the shelf runs out of labels.
    for (let i = 0; i < pool.length && decoys.length < 2; i++) {
      const t = pick(rng, pool);
      if (take(t)) decoys = [...decoys, t];
    }
  }
  const rng = createRng([...puzzle.id].reduce((h, ch) => (h * 33 + ch.charCodeAt(0)) | 0, 13));
  return shuffle(rng, [theme, ...decoys]);
}

/**
 * AAA 2.10 — the acknowledged herring, and ONLY when it is honest.
 *
 * The round-6 rule fired the knowing line whenever any flagged word merely sat
 * in the selection, so a guess that had nothing to do with the trap was told it
 * had — the line was misinformation dressed as a hint. A trap is only claimed
 * when ≥3 of her four tiles are inside it: at that point she demonstrably
 * followed the false thread, and naming it is a real bit.
 */
function matchHerring(puzzle: WordWebPuzzleEx, selection: string[]): WordWebHerringMatch | null {
  let best: WordWebHerringMatch | null = null;
  for (const h of puzzle.herrings ?? []) {
    const matched = selection.filter((w) => h.words.includes(w));
    if (matched.length < 3) continue;
    if (!best || matched.length > best.matched.length) best = { ...h, matched };
  }
  return best;
}

/** How many of the four genuinely belong to one thread (the free bit). */
function togetherCount(puzzle: WordWebPuzzle, selection: string[]): number {
  let best = 0;
  for (const g of puzzle.groups) {
    const n = selection.filter((w) => g.words.includes(w)).length;
    if (n > best) best = n;
  }
  return best;
}

/** The intruder: a word in the wrong selection outside its best-overlap group. */
function findIntruder(puzzle: WordWebPuzzle, selection: string[]): string | null {
  let best: { overlap: number; group: (typeof puzzle.groups)[number] } | null = null;
  for (const group of puzzle.groups) {
    const overlap = selection.filter((w) => group.words.includes(w)).length;
    if (!best || overlap > best.overlap) best = { overlap, group };
  }
  if (!best) return null;
  return selection.find((w) => !best!.group.words.includes(w)) ?? null;
}

export const wordWebAdapter: RoomPuzzleAdapter<WordWebPuzzleEx, WordWebRoomState, WordWebAction> = {
  kind: 'word-web',
  size: 'anchor',

  select: (opts) => selectByTier(WORD_WEB_POOL, opts),

  start(puzzle: WordWebPuzzleEx, _ctx: RoomContext): WordWebRoomState {
    return {
      web: startWordWeb(puzzle),
      costedMistakes: 0,
      hintsBought: 0,
      attempts: 0,
      lastWrongSelection: null,
      pendingNaming: null,
      namedCorrectly: null,
      lastFeedback: null,
    };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];

    if (action.type === 'name-theme') {
      const pending = state.pendingNaming;
      if (!pending) return { state, events, outcome: outcomeOf(state) };
      const named = action.theme === pending.theme;
      const next: WordWebRoomState = {
        ...state,
        attempts: state.attempts + 1,
        pendingNaming: null,
        namedCorrectly: named,
        lastFeedback: {
          kind: 'group-solved', theme: pending.theme, tier: pending.tier,
          words: pending.words, won: true, named,
        },
      };
      events.push({ type: 'progress', detail: named ? 'named-true' : 'named-miss' });
      events.push({ type: 'solved', perfect: isPerfect(next) });
      return { state: next, events, outcome: outcomeOf(next) };
    }

    if (action.type === 'buy-hint') {
      const intruder = state.lastWrongSelection ? findIntruder(puzzle, state.lastWrongSelection) : null;
      if (!intruder) return { state, events, outcome: outcomeOf(state) };
      events.push({ type: 'hint', weight: 1 });
      const next: WordWebRoomState = {
        ...state,
        hintsBought: state.hintsBought + 1,
        lastFeedback: { kind: 'hint', intruder },
      };
      return { state: next, events, outcome: outcomeOf(next) };
    }

    const { state: web, result } = submitGroup(puzzle, state.web, action.selection);
    let next: WordWebRoomState = { ...state, web, attempts: state.attempts + 1 };

    switch (result.kind) {
      case 'solved': {
        if (result.won) {
          // AAA 2.11: intercept the final submit — the last thread must be
          // named before the room solves. No `solved` event yet; the naming
          // reply emits it (and gates the perfect grade on a correct name).
          const options = namingOptions(puzzle, result.theme, result.tier);
          next = {
            ...next,
            lastWrongSelection: null,
            pendingNaming: { theme: result.theme, tier: result.tier, words: result.words, options },
            lastFeedback: { kind: 'name-final', words: result.words, options },
          };
          events.push({ type: 'progress', detail: `group-solved:${result.tier}` });
          break;
        }
        next = {
          ...next,
          lastWrongSelection: null,
          lastFeedback: { kind: 'group-solved', theme: result.theme, tier: result.tier, words: result.words, won: false },
        };
        events.push({ type: 'progress', detail: `group-solved:${result.tier}` });
        break;
      }
      case 'one-away': {
        next = {
          ...next,
          costedMistakes: next.costedMistakes + 1,
          lastWrongSelection: action.selection.map((w) => w.toUpperCase()),
          lastFeedback: { kind: 'one-away' },
        };
        events.push({ type: 'mistake', weight: 1 });
        break;
      }
      case 'wrong': {
        const sel = action.selection.map((w) => w.toUpperCase());
        next = {
          ...next,
          costedMistakes: next.costedMistakes + 1,
          lastWrongSelection: sel,
          lastFeedback: {
            kind: 'wrong',
            herring: matchHerring(puzzle, sel),
            together: (Math.min(2, Math.max(1, togetherCount(puzzle, sel))) as 1 | 2),
          },
        };
        events.push({ type: 'mistake', weight: 1 });
        break;
      }
      case 'invalid': {
        next = { ...next, lastFeedback: { kind: 'invalid', reason: result.reason } };
        if (result.reason !== 'finished') events.push({ type: 'mistake', weight: 0 });
        break;
      }
    }

    return { state: next, events, outcome: outcomeOf(next) };
  },

  puzzleId: (p) => p.id,
};
