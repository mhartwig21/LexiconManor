/**
 * The Library — Word Web behind the RoomPuzzle contract. OWNER: A3.
 *
 * Wraps the existing pure engine (`startWordWeb`/`submitGroup`) — it does not
 * rewrite it. Mistake semantics (AAA §0.3 R.1, §2 word-web bullet):
 *   - wrong group / one-away  → mistake weight 1 (a guess is a claim here)
 *   - malformed input          → mistake weight 0 (AAA 3.2)
 *   - herring acknowledgment + one-away info ride on state feedback for the
 *     view; the priced intruder nudge (AAA 2.10) emits a `hint` event.
 */

import type { Difficulty, Tier, WordWebGroup, WordWebPuzzle } from '../../types';
import { createRng, pick, shuffle } from '../../rng';
import { startWordWeb, submitGroup, type WordWebState } from '../../word-web';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../room-puzzle';
import { getPools, lazyContent } from '../../../app/pools';

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
export interface WordWebPuzzleEx extends WordWebPuzzle {
  groups: WordWebGroupEx[];
  /** 2.6 adversarial opening layout: herrings clustered, no gift rows. */
  layout?: string[];
}

export const WORD_WEB_POOL = lazyContent<WordWebPuzzleEx[]>(
  () => getPools().wordWeb as WordWebPuzzleEx[],
);

const TIER_DIFFICULTY: Record<Tier, Difficulty[]> = {
  1: ['medium', 'easy'],
  2: ['hard', 'medium'],
  3: ['expert', 'hard'],
};

/** What the view renders after the last action. Never consumed by slices. */
export type WordWebFeedback =
  | { kind: 'group-solved'; theme: string; tier: string; words: string[]; won: boolean; named?: boolean }
  /** 2.11 act of naming: the last four are woven, but the thread must be named. */
  | { kind: 'name-final'; words: string[]; options: string[] }
  | { kind: 'one-away' }
  /** herring: selected words flagged ambiguous by the generator — the knowing line. */
  | { kind: 'wrong'; herring: string[] }
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
 * Decoy labels for the naming act: prefer the generator's authored pair,
 * fall back to plausible same-tier themes drawn deterministically from the pool.
 */
function namingOptions(puzzle: WordWebPuzzleEx, theme: string, tier: string): string[] {
  const group = puzzle.groups.find((g) => g.theme === theme);
  let decoys = (group?.decoys ?? []).filter((d) => d !== theme).slice(0, 2);
  if (decoys.length < 2) {
    const rng = createRng([...puzzle.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7));
    const pool = WORD_WEB_POOL
      .filter((p) => p.id !== puzzle.id)
      .flatMap((p) => p.groups.filter((g) => g.tier === tier).map((g) => g.theme))
      .filter((t) => t !== theme && !decoys.includes(t));
    while (decoys.length < 2 && pool.length > 0) {
      const t = pick(rng, pool);
      if (!decoys.includes(t)) decoys = [...decoys, t];
    }
  }
  const rng = createRng([...puzzle.id].reduce((h, ch) => (h * 33 + ch.charCodeAt(0)) | 0, 13));
  return shuffle(rng, [theme, ...decoys]);
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

  select({ tier, seed, seenIds }) {
    const rng = createRng(seed);
    const seen = new Set(seenIds);
    for (const difficulty of TIER_DIFFICULTY[tier]) {
      const fresh = WORD_WEB_POOL.filter((p) => p.difficulty === difficulty && !seen.has(p.id));
      if (fresh.length > 0) return pick(rng, fresh);
    }
    const anyFresh = WORD_WEB_POOL.filter((p) => !seen.has(p.id));
    return anyFresh.length > 0 ? pick(rng, anyFresh) : pick(rng, WORD_WEB_POOL);
  },

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
        const herring = (puzzle.ambiguousWords ?? []).filter((w) => sel.includes(w));
        next = {
          ...next,
          costedMistakes: next.costedMistakes + 1,
          lastWrongSelection: sel,
          lastFeedback: { kind: 'wrong', herring },
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
