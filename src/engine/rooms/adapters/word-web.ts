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

import type { Difficulty, Tier, WordWebPuzzle } from '../../types';
import { createRng, pick } from '../../rng';
import { startWordWeb, submitGroup, type WordWebState } from '../../word-web';
import type { RoomContext, RoomEvent, RoomOutcome, RoomPuzzleAdapter } from '../room-puzzle';
import wordWebData from '../../../../content/generated/word-web.json';

export const WORD_WEB_POOL = wordWebData as WordWebPuzzle[];

const TIER_DIFFICULTY: Record<Tier, Difficulty[]> = {
  1: ['medium', 'easy'],
  2: ['hard', 'medium'],
  3: ['expert', 'hard'],
};

/** What the view renders after the last action. Never consumed by slices. */
export type WordWebFeedback =
  | { kind: 'group-solved'; theme: string; tier: string; words: string[]; won: boolean }
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
  lastFeedback: WordWebFeedback | null;
}

export type WordWebAction =
  | { type: 'submit'; selection: string[] }
  /** Priced intruder nudge (AAA 2.10): names one word that didn't belong. */
  | { type: 'buy-hint' };

function isPerfect(s: WordWebRoomState): boolean {
  return s.costedMistakes === 0 && s.hintsBought === 0;
}

function outcomeOf(s: WordWebRoomState): RoomOutcome {
  return { status: s.web.status === 'won' ? 'solved' : 'active', perfect: isPerfect(s) };
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

export const wordWebAdapter: RoomPuzzleAdapter<WordWebPuzzle, WordWebRoomState, WordWebAction> = {
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

  start(puzzle: WordWebPuzzle, _ctx: RoomContext): WordWebRoomState {
    return {
      web: startWordWeb(puzzle),
      costedMistakes: 0,
      hintsBought: 0,
      attempts: 0,
      lastWrongSelection: null,
      lastFeedback: null,
    };
  },

  reduce(puzzle, state, action) {
    const events: RoomEvent[] = [];

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
        next = {
          ...next,
          lastWrongSelection: null,
          lastFeedback: { kind: 'group-solved', theme: result.theme, tier: result.tier, words: result.words, won: result.won },
        };
        events.push({ type: 'progress', detail: `group-solved:${result.tier}` });
        if (result.won) events.push({ type: 'solved', perfect: isPerfect(next) });
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
