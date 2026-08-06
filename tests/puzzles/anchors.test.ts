import { describe, expect, it } from 'vitest';
import type {
  ForgottenWordPuzzle, HivePuzzle, TwistlePuzzle, WordWebPuzzle,
} from '../../src/engine/types';
import type { RoomContext, RoomEvent } from '../../src/engine/rooms/room-puzzle';
import { getRoomAdapter, registeredRoomKinds } from '../../src/engine/rooms/registry';
import {
  wordWebAdapter, WORD_WEB_POOL, type WordWebRoomState,
} from '../../src/engine/rooms/adapters/word-web';
import {
  hiveAdapter, HIVE_POOL, HIVE_LADDER, ladderIndex, ladderThreshold, type HiveRoomState,
} from '../../src/engine/rooms/adapters/hive';
import {
  twistleAdapter, TWISTLE_POOL, type TwistleRoomState,
} from '../../src/engine/rooms/adapters/twistle';
import {
  forgottenWordAdapter, FORGOTTEN_WORD_POOL, type ForgottenWordRoomState,
} from '../../src/engine/rooms/adapters/forgotten-word';
import { STEP_TABLE } from '../../src/engine/economy/steps';
import { findPath } from '../../src/engine/twistle';
import { definitionForLevel } from '../../src/engine/forgotten-word';
import { hiveWordPoints } from '../../src/engine/scoring';
import { bandOf, loadDictionary } from '../../content/lib/dictionary';

/**
 * A3 — the four anchor rooms behind the RoomPuzzle contract.
 * Mistake-weight mappings are review checkpoints against AAA §0.3:
 * R.1 (invalid dictionary words are free), 3.2 (malformed input is free),
 * and the −2/−3 table only for deliberate claims in deduction rooms.
 */

const ctx = (tier: 1 | 2 | 3): RoomContext => ({ tier, seed: 42, volumeId: 'volume-1' });

const eventsOfType = (events: RoomEvent[], type: RoomEvent['type']) =>
  events.filter((e) => e.type === type);

// ---------------------------------------------------------------------------
// Fixtures (mirroring tests/engine.test.ts shapes)
// ---------------------------------------------------------------------------

const webPuzzle: WordWebPuzzle = {
  id: 'web-fixture',
  difficulty: 'medium', tier: 2,
  groups: [
    { theme: 'Breakfast', tier: 'yellow', words: ['WAFFLE', 'PANCAKE', 'TOAST', 'BAGEL'] },
    { theme: 'Basketball', tier: 'green', words: ['DUNK', 'BLOCK', 'ASSIST', 'REBOUND'] },
    { theme: 'Iron ___', tier: 'blue', words: ['FIST', 'WILL', 'CURTAIN', 'MAN'] },
    { theme: '___ Bar', tier: 'purple', words: ['CANDY', 'SALAD', 'SPACE', 'CROW'] },
  ],
  ambiguousWords: ['SPACE'],
};

const hivePuzzle: HivePuzzle = {
  id: 'hive-fixture',
  difficulty: 'easy', tier: 1,
  center: 'E',
  outer: ['S', 'T', 'A', 'R', 'N', 'I'],
  pangrams: ['RETAINS'],
  validWords: ['RETAINS', 'STARE', 'TEARS', 'RATE', 'NEAR', 'SEAT'],
  pointThreshold: 15,   // v1 threshold — must be ignored by the manor adapter
  totalPoints: 27,      // 14 + 5 + 5 + 1 + 1 + 1
};

const twistlePuzzle: TwistlePuzzle = {
  id: 'twistle-fixture',
  difficulty: 'easy', tier: 1,
  // S T O N E
  // A R A T S
  // L E X I C
  // P L A N T
  // G H O S T
  grid: [...'STONE', ...'ARATS', ...'LEXIC', ...'PLANT', ...'GHOST'],
  targetWords: ['STONE', 'PLAN', 'PLANT'],
  targetCount: 2,
  rules: { minLength: 4, centerRequired: false },
};

const twistleCenterPuzzle: TwistlePuzzle = {
  ...twistlePuzzle,
  id: 'twistle-center-fixture',
  rules: { minLength: 4, centerRequired: true },
};

const fwPuzzle: ForgottenWordPuzzle = {
  id: 'fw-fixture',
  word: 'PETRICHOR',
  obscurity: 'rare', tier: 3,
  definitions: {
    plain: 'The smell of rain on dry earth.',
    poetic: 'The stone remembers the storm.',
    riddle: 'What the dust exhales when the sky finally weeps.',
  },
  etymology: 'From petra (stone) and ichor (the blood of gods).',
  usage: 'After the long drought, the first shower filled the garden with ___.',
};

// ---------------------------------------------------------------------------
// Registry wiring
// ---------------------------------------------------------------------------

describe('registry', () => {
  it('registers all four anchor adapters with the right kind and size', () => {
    for (const kind of ['word-web', 'hive', 'twistle', 'forgotten-word'] as const) {
      const adapter = getRoomAdapter(kind);
      expect(adapter, kind).toBeDefined();
      expect(adapter!.kind).toBe(kind);
      expect(adapter!.size).toBe('anchor');
    }
    expect(registeredRoomKinds()).toEqual(
      expect.arrayContaining(['forgotten-word', 'hive', 'twistle', 'word-web']),
    );
  });
});

// ---------------------------------------------------------------------------
// Seeded, seen-aware selection (shared select contract)
// ---------------------------------------------------------------------------

describe('selection', () => {
  const cases = [
    { name: 'word-web', adapter: wordWebAdapter, pool: WORD_WEB_POOL },
    { name: 'hive', adapter: hiveAdapter, pool: HIVE_POOL },
    { name: 'twistle', adapter: twistleAdapter, pool: TWISTLE_POOL },
    { name: 'forgotten-word', adapter: forgottenWordAdapter, pool: FORGOTTEN_WORD_POOL },
  ] as const;

  it('is deterministic per seed', () => {
    for (const { name, adapter } of cases) {
      const a = adapter.select({ tier: 2, seed: 123, seenIds: [] });
      const b = adapter.select({ tier: 2, seed: 123, seenIds: [] });
      expect(adapter.puzzleId(a as never), name).toBe(adapter.puzzleId(b as never));
    }
  });

  it('avoids seen puzzles while any fresh remain', () => {
    for (const { name, adapter } of cases) {
      const first = adapter.select({ tier: 1, seed: 7, seenIds: [] });
      const firstId = adapter.puzzleId(first as never);
      const second = adapter.select({ tier: 1, seed: 7, seenIds: [firstId] });
      expect(adapter.puzzleId(second as never), name).not.toBe(firstId);
    }
  });

  /**
   * Round 4 (owner: "escalating difficulty as you move closer to the door").
   * The tier a room asks for is the tier it gets — EXACTLY, across many seeds.
   * The old band-based selector let tier 3 serve the same 'hard' puzzle tier 2
   * served; this is the regression guard for that leak.
   */
  it('serves the EXACT tier it is asked for, on every seed', () => {
    for (const tier of [1, 2, 3] as const) {
      for (const { name, adapter, pool } of cases) {
        const typed = pool as readonly { tier?: 1 | 2 | 3 }[];
        expect(typed.some((p) => p.tier === tier), `${name} pool has tier ${tier}`).toBe(true);
        for (let seed = 1; seed <= 40; seed++) {
          const p = adapter.select({ tier, seed, seenIds: [] }) as { tier?: 1 | 2 | 3 };
          expect(p.tier, `${name} tier ${tier} seed ${seed}`).toBe(tier);
        }
      }
    }
  });

  it('keeps the tier promise even when every puzzle at that tier is seen', () => {
    for (const { name, adapter, pool } of cases) {
      const typed = pool as readonly { id: string; tier?: 1 | 2 | 3 }[];
      const seen = typed.filter((p) => p.tier === 3).map((p) => p.id);
      const p = adapter.select({ tier: 3, seed: 11, seenIds: seen }) as { tier?: 1 | 2 | 3 };
      expect(p.tier, `${name} exhausted tier 3`).toBe(3);
    }
  });

  it('falls back to a repeat rather than crashing when the pool is exhausted', () => {
    const allIds = WORD_WEB_POOL.map((p) => p.id);
    const p = wordWebAdapter.select({ tier: 1, seed: 5, seenIds: allIds });
    expect(allIds).toContain(p.id);
  });
});

// ---------------------------------------------------------------------------
// Word Web (The Library)
// ---------------------------------------------------------------------------

describe('word-web adapter', () => {
  const startState = () => wordWebAdapter.start(webPuzzle, ctx(1));

  it('solves through all four groups, names the final thread, perfect outcome (AAA 2.11)', () => {
    let s: WordWebRoomState = startState();
    let lastEvents: RoomEvent[] = [];
    for (const g of webPuzzle.groups) {
      const r = wordWebAdapter.reduce(webPuzzle, s, { type: 'submit', selection: g.words });
      s = r.state;
      lastEvents = r.events;
      expect(eventsOfType(r.events, 'progress').length).toBeGreaterThan(0);
    }
    // The last four fell together, but the room is NOT solved yet: the final
    // group is never pure leftovers — the thread must be named first.
    expect(eventsOfType(lastEvents, 'solved')).toEqual([]);
    expect(s.pendingNaming).not.toBeNull();
    expect(s.lastFeedback?.kind).toBe('name-final');
    const options = s.pendingNaming!.options;
    expect(options).toHaveLength(3);
    expect(options).toContain(s.pendingNaming!.theme);

    const named = wordWebAdapter.reduce(webPuzzle, s, { type: 'name-theme', theme: s.pendingNaming!.theme });
    expect(eventsOfType(named.events, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
    expect(named.outcome).toEqual({ status: 'solved', perfect: true });
    expect(named.state.web.status).toBe('won');
  });

  it('naming the final thread wrong still solves, but forfeits perfect — never steps', () => {
    let s: WordWebRoomState = startState();
    for (const g of webPuzzle.groups) {
      s = wordWebAdapter.reduce(webPuzzle, s, { type: 'submit', selection: g.words }).state;
    }
    const wrongLabel = s.pendingNaming!.options.find((t) => t !== s.pendingNaming!.theme)!;
    const r = wordWebAdapter.reduce(webPuzzle, s, { type: 'name-theme', theme: wrongLabel });
    expect(eventsOfType(r.events, 'mistake')).toEqual([]); // no step cost for a missed name
    expect(eventsOfType(r.events, 'solved')).toEqual([{ type: 'solved', perfect: false }]);
    expect(r.outcome).toEqual({ status: 'solved', perfect: false });
    expect(r.state.namedCorrectly).toBe(false);
  });

  it('a wrong group costs weight 1 and forfeits perfect; selection info is kept', () => {
    let s = startState();
    const wrong = ['WAFFLE', 'PANCAKE', 'TOAST', 'DUNK'];
    const r = wordWebAdapter.reduce(webPuzzle, s, { type: 'submit', selection: wrong });
    s = r.state;
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 1 }]);
    expect(s.lastFeedback).toEqual({ kind: 'one-away' });
    expect(s.lastWrongSelection).toEqual(wrong);
    expect(r.outcome).toEqual({ status: 'active', perfect: false });
  });

  it('acknowledges planted herrings on a wrong guess (AAA 2.10)', () => {
    const s = startState();
    const r = wordWebAdapter.reduce(webPuzzle, s, {
      type: 'submit', selection: ['SPACE', 'DUNK', 'FIST', 'WAFFLE'],
    });
    expect(r.state.lastFeedback).toMatchObject({ kind: 'wrong', herring: ['SPACE'] });
  });

  it('malformed input is free (AAA 3.2)', () => {
    const s = startState();
    const r = wordWebAdapter.reduce(webPuzzle, s, { type: 'submit', selection: ['WAFFLE'] });
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    expect(r.state.costedMistakes).toBe(0);
  });

  it('a bought nudge names a true intruder and emits a costed hint', () => {
    let s = startState();
    s = wordWebAdapter.reduce(webPuzzle, s, {
      type: 'submit', selection: ['WAFFLE', 'PANCAKE', 'TOAST', 'DUNK'],
    }).state;
    const r = wordWebAdapter.reduce(webPuzzle, s, { type: 'buy-hint' });
    expect(eventsOfType(r.events, 'hint')).toEqual([{ type: 'hint', weight: 1 }]);
    expect(r.state.lastFeedback).toEqual({ kind: 'hint', intruder: 'DUNK' });
    expect(r.state.hintsBought).toBe(1);
  });

  it('a nudge with no wrong guess yet is a silent no-op', () => {
    const s = startState();
    const r = wordWebAdapter.reduce(webPuzzle, s, { type: 'buy-hint' });
    expect(r.events).toEqual([]);
    expect(r.state.hintsBought).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Hive (The Conservatory)
// ---------------------------------------------------------------------------

describe('hive adapter', () => {
  const startState = () => hiveAdapter.start(hivePuzzle, ctx(1));
  const submit = (s: HiveRoomState, word: string) =>
    hiveAdapter.reduce(hivePuzzle, s, { type: 'submit', word });

  it('ignores the v1 pointThreshold: the room solves at 70% of totalPoints', () => {
    // 70% of 27 = 18.9 → ceil 19.
    expect(ladderThreshold(hivePuzzle.totalPoints, 70)).toBe(19);
    let s = startState();
    let r = submit(s, 'RETAINS'); // pangram, 14 pts — over the v1 threshold of 15? No: 14 < 15 and < 19 either way
    expect(r.outcome.status).toBe('active');
    r = submit(r.state, 'STARE'); // 14 + 5 = 19 ≥ 19 → Full Bloom
    expect(eventsOfType(r.events, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
    expect(r.outcome).toEqual({ status: 'solved', perfect: true });
  });

  it('a pangram emits a pangram progress beat and tier-ups fire per rung', () => {
    const s = startState();
    const r = submit(s, 'RETAINS'); // 14 of 27 ≈ 52% → Seed→Garden in one leap
    const details = r.events.filter((e) => e.type === 'progress').map((e) => (e as { detail?: string }).detail);
    expect(details).toContain('pangram');
    expect(details).toContain('tier-up:Sprout');
    expect(details).toContain('tier-up:Garden');
    expect(ladderIndex(27, 14)).toBe(HIVE_LADDER.findIndex((t) => t.name === 'Garden'));
  });

  it('invalid dictionary words are free — AAA R.1 (the economy ruling)', () => {
    const s = startState();
    for (const [word, reason] of [
      ['TREES', 'not-in-word-list'],
      ['TEA', 'too-short'],
    ] as const) {
      const r = submit(s, word);
      expect(eventsOfType(r.events, 'mistake'), word).toEqual([{ type: 'mistake', weight: 0 }]);
      expect(r.state.costedMistakes, word).toBe(0);
      expect(r.state.lastFeedback, word).toMatchObject({ kind: 'invalid', reason, costed: false });
    }
  });

  it('already-found is free and never re-scores', () => {
    let s = startState();
    s = submit(s, 'STARE').state;
    const r = submit(s, 'STARE');
    expect(r.state.hive.score).toBe(5);
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    expect(r.state.lastFeedback).toMatchObject({ kind: 'invalid', reason: 'already-found' });
  });

  it('pre-warned structural violations cost the flat structural row (−1, AAA R.1)', () => {
    const s = startState();
    for (const [word, reason] of [
      ['STAR', 'missing-center'],   // no center letter — live coloring warned
      ['EXAMS', 'bad-letters'],     // X/M not in the hive — muted in the entry
    ] as const) {
      const r = submit(s, word);
      // Never the −2/−3 deduction row: weight 'structural' maps to a flat −1
      // at every tier in STEP_TABLE.
      expect(eventsOfType(r.events, 'mistake'), word).toEqual([{ type: 'mistake', weight: 'structural' }]);
      expect(r.state.lastFeedback, word).toMatchObject({ kind: 'invalid', reason, costed: true });
      expect(r.outcome.perfect, word).toBe(false);
    }
  });

  it("STEP_TABLE prices 'structural' at −1 for every tier", () => {
    for (const tier of [1, 2, 3] as const) {
      expect(STEP_TABLE.mistake('structural', tier)).toBe(-1);
    }
    // The deliberate-claim row stays −2 (−3 at tier 3).
    expect(STEP_TABLE.mistake(1, 1)).toBe(-2);
    expect(STEP_TABLE.mistake(1, 3)).toBe(-3);
  });

  it('entropy is retired: letters never fade, the hive is never lost', () => {
    let s = startState();
    for (let i = 0; i < 10; i++) s = submit(s, 'QQQQE').state; // bad letters, ten times
    expect(s.hive.fadedLetters).toEqual([]);
    expect(s.hive.entropy).toBe(0);
    expect(s.hive.status).toBe('playing');
  });

  it('finding every word pays the hidden Every Petal gem', () => {
    let s = startState();
    let all: RoomEvent[] = [];
    for (const w of hivePuzzle.validWords) {
      const r = submit(s, w);
      s = r.state;
      all = [...all, ...r.events];
    }
    expect(s.hive.score).toBe(27);
    expect(eventsOfType(all, 'reward')).toEqual([{ type: 'reward', gems: 1 }]);
    expect(all.some((e) => e.type === 'progress' && e.detail === 'every-petal')).toBe(true);
    // Full Bloom's solve payout fires exactly once, on the 70% crossing.
    expect(eventsOfType(all, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
  });

  it('a costed slip forfeits perfect on the eventual solve', () => {
    let s = startState();
    s = submit(s, 'STAR').state;      // missing center → weight 1
    s = submit(s, 'RETAINS').state;
    const r = submit(s, 'STARE');
    expect(eventsOfType(r.events, 'solved')).toEqual([{ type: 'solved', perfect: false }]);
  });
});

// ---------------------------------------------------------------------------
// Twistle (The Gallery)
// ---------------------------------------------------------------------------

describe('twistle adapter', () => {
  const start = (p: TwistlePuzzle) => twistleAdapter.start(p, ctx(1));
  const submit = (p: TwistlePuzzle, s: TwistleRoomState, word: string) =>
    twistleAdapter.reduce(p, s, { type: 'submit', word });

  it('solves at targetCount with progress beats along the way', () => {
    let s = start(twistlePuzzle);
    let r = submit(twistlePuzzle, s, 'STONE');
    expect(r.events).toContainEqual({ type: 'progress', detail: 'word-found:1/2' });
    expect(r.outcome.status).toBe('active');
    r = submit(twistlePuzzle, r.state, 'PLAN');
    expect(eventsOfType(r.events, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
    expect(r.outcome).toEqual({ status: 'solved', perfect: true });
  });

  it('a real path that is not a target is a free probe, remembered forever (3.3)', () => {
    const s = start(twistlePuzzle);
    const r = submit(twistlePuzzle, s, 'RATS');
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    expect(r.state.missedWords).toEqual(['RATS']);
    expect(r.state.costedMistakes).toBe(0);
    // Submitting the same miss again does not duplicate the memory.
    const r2 = submit(twistlePuzzle, r.state, 'RATS');
    expect(r2.state.missedWords).toEqual(['RATS']);
  });

  it('breaking the pre-warned center rule costs weight 1', () => {
    const s = start(twistleCenterPuzzle);
    const r = submit(twistleCenterPuzzle, s, 'STONE'); // valid path, skips center X
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 1 }]);
    expect(r.state.lastFeedback).toMatchObject({ kind: 'invalid', reason: 'breaks-rule', costed: true });
    expect(r.outcome.perfect).toBe(false);
  });

  it('malformed input is free', () => {
    const s = start(twistlePuzzle);
    for (const word of ['PLA', 'ZZZZ']) {
      const r = submit(twistlePuzzle, s, word);
      expect(eventsOfType(r.events, 'mistake'), word).toEqual([{ type: 'mistake', weight: 0 }]);
    }
  });
});

// ---------------------------------------------------------------------------
// Forgotten Word (The Study)
// ---------------------------------------------------------------------------

describe('forgotten-word adapter', () => {
  const start = (tier: 1 | 2 | 3) => forgottenWordAdapter.start(fwPuzzle, ctx(tier));
  const guess = (s: ForgottenWordRoomState, word: string) =>
    forgottenWordAdapter.reduce(fwPuzzle, s, { type: 'guess', word });

  it('guess allowance scales with tier (5 / 4 / 3)', () => {
    expect(start(1).fw.maxGuesses).toBe(5);
    expect(start(2).fw.maxGuesses).toBe(4);
    expect(start(3).fw.maxGuesses).toBe(3);
  });

  it('a first-breath correct guess is a perfect solve', () => {
    const r = guess(start(2), 'petrichor');
    expect(eventsOfType(r.events, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
    expect(r.outcome).toEqual({ status: 'solved', perfect: true });
  });

  it('a wrong guess (of an announced-plausible length) is a deliberate claim: weight 1', () => {
    const r = guess(start(1), 'RAINSTORM'); // 9 letters, same as PETRICHOR
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 1 }]);
    expect(r.state.lastFeedback).toMatchObject({ kind: 'wrong', guess: 'RAINSTORM', guessesLeft: 4 });
  });

  it('a wrong-LENGTH guess is malformed input: free, no whisper consumed (AAA 3.2)', () => {
    const r = guess(start(1), 'LANTERN'); // 7 letters against a 9-letter card
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    expect(r.state.lastFeedback).toEqual({ kind: 'invalid', reason: 'wrong-length' });
    expect(r.state.fw.guesses).toEqual([]);           // whisper NOT consumed
    expect(r.state.costedMistakes).toBe(0);
    expect(r.outcome.perfect).toBe(true);
  });

  it('unsealing a clue is a costed hint that forfeits perfect', () => {
    let s = start(1);
    const r = forgottenWordAdapter.reduce(fwPuzzle, s, { type: 'unseal-clue', clue: 'etymology' });
    expect(eventsOfType(r.events, 'hint')).toEqual([{ type: 'hint', weight: 1 }]);
    expect(r.state.fw.unlockedClues).toEqual(['etymology']);
    s = r.state;
    // Unsealing the same clue twice never double-charges.
    const r2 = forgottenWordAdapter.reduce(fwPuzzle, s, { type: 'unseal-clue', clue: 'etymology' });
    expect(r2.events).toEqual([]);
    const win = guess(s, 'PETRICHOR');
    expect(eventsOfType(win.events, 'solved')).toEqual([{ type: 'solved', perfect: false }]);
  });

  it('out of whispers auto-abandons — never a fail — and reveals for closure', () => {
    let s = start(3); // 3 guesses
    s = guess(s, 'RAINSTORM').state;
    s = guess(s, 'DOWNPOURS').state;
    const r = guess(s, 'SPLASHING');
    expect(r.outcome).toEqual({ status: 'abandoned', perfect: false });
    expect(r.state.lastFeedback).toEqual({ kind: 'slipped', word: 'PETRICHOR' });
    expect(r.events.some((e) => e.type === 'progress' && e.detail === 'slipped-away')).toBe(true);
  });

  it('a repeated whisper is a free slip', () => {
    let s = start(1);
    s = guess(s, 'RAINSTORM').state;
    const r = guess(s, 'rainstorm');
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    expect(r.state.fw.guesses).toEqual(['RAINSTORM']);
  });
});

// ---------------------------------------------------------------------------
// Shipped-content invariants (the generators' contract with the rooms)
// ---------------------------------------------------------------------------

describe('shipped content — Conservatory pool (BENCHMARKS §1 / AAA 3.5)', () => {
  /**
   * Round 4: the curated band is now PER TIER and shrinks as you climb — the
   * owner's "smaller curated word count so it fits the day" for the top of the
   * house. Tier 1 still sits inside the SB 45–80 shape.
   */
  const HIVE_WORD_BANDS: Record<1 | 2 | 3, [number, number]> = {
    1: [48, 80], 2: [40, 62], 3: [26, 44],
  };

  it('every puzzle is curated into its tier word band, shrinking with the row', () => {
    for (const p of HIVE_POOL) {
      const [lo, hi] = HIVE_WORD_BANDS[p.tier ?? 1];
      expect(p.validWords.length, p.id).toBeGreaterThanOrEqual(lo);
      expect(p.validWords.length, p.id).toBeLessThanOrEqual(hi);
    }
    const avg = (tier: 1 | 2 | 3) => {
      const arr = HIVE_POOL.filter((p) => (p.tier ?? 1) === tier);
      return arr.reduce((a, p) => a + p.validWords.length, 0) / arr.length;
    };
    expect(avg(1)).toBeGreaterThan(avg(2));
    expect(avg(2)).toBeGreaterThan(avg(3));
  });

  /**
   * The Full-Bloom bar rises without moving the 70% ladder (owner: "higher
   * Full-Bloom bar"). `everyday point share` is the fraction of a room's total
   * points reachable using only everyday-band vocabulary. At tier 1 it clears
   * 70%, so Full Bloom is attainable on common words alone; at tier 3 it sits
   * far below 70%, so Full Bloom cannot be reached without the rarer finds —
   * the same 70% rung, a much harder climb.
   */
  it('the Full-Bloom bar rises with the row (everyday point share)', () => {
    const dict = loadDictionary();
    const share = (p: (typeof HIVE_POOL)[number]) => {
      let everyday = 0;
      for (const w of p.validWords) {
        if (bandOf(dict.rankOf(w.toLowerCase())) !== 'everyday') continue;
        everyday += hiveWordPoints(w, new Set(w).size === 7);
      }
      return everyday / p.totalPoints;
    };
    const mean = (tier: 1 | 2 | 3) => {
      const arr = HIVE_POOL.filter((p) => (p.tier ?? 1) === tier);
      return arr.reduce((a, p) => a + share(p), 0) / arr.length;
    };
    expect(mean(1)).toBeGreaterThan(mean(2));
    expect(mean(2)).toBeGreaterThan(mean(3));
    // Tier 3 can never Full Bloom (70%) on everyday vocabulary alone.
    for (const p of HIVE_POOL.filter((p) => (p.tier ?? 1) === 3)) {
      expect(share(p), p.id).toBeLessThan(0.7);
    }
  });

  it('tier 3 hives are pangram-scarce compared with tier 1', () => {
    const avgPangrams = (tier: 1 | 2 | 3) => {
      const arr = HIVE_POOL.filter((p) => (p.tier ?? 1) === tier);
      return arr.reduce((a, p) => a + p.pangrams.length, 0) / arr.length;
    };
    expect(avgPangrams(1)).toBeGreaterThan(avgPangrams(3));
  });

  it('the S-ban holds and every puzzle keeps a pangram', () => {
    for (const p of HIVE_POOL) {
      expect(p.validWords.some((w) => w.endsWith('S')), p.id).toBe(false);
      expect(p.pangrams.length, p.id).toBeGreaterThan(0);
    }
  });

  it('all three tiers are stocked', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(HIVE_POOL.filter((p) => (p.tier ?? 1) === tier).length, `tier ${tier}`)
        .toBeGreaterThanOrEqual(30);
    }
  });
});

describe('shipped content — Library boards (AAA 2.6–2.11)', () => {
  it('every board carries the fairness fields: layout, herring budget, typed groups, decoys', () => {
    for (const p of WORD_WEB_POOL) {
      const words = p.groups.flatMap((g) => g.words);
      // 2.6 adversarial opening layout: a permutation of the 16 words.
      expect(p.layout?.length, p.id).toBe(16);
      expect(new Set(p.layout).size, p.id).toBe(16);
      for (const w of p.layout!) expect(words, p.id).toContain(w);
      // 2.7 herring budget: ≤3, all on the board.
      expect((p.ambiguousWords ?? []).length, p.id).toBeLessThanOrEqual(3);
      for (const w of p.ambiguousWords ?? []) expect(words, p.id).toContain(w);
      // 2.11 decoys for the act of naming.
      for (const g of p.groups) {
        expect(g.decoys?.length, `${p.id} "${g.theme}"`).toBe(2);
        expect(g.decoys, `${p.id} "${g.theme}"`).not.toContain(g.theme);
      }
    }
  });

  it('2.9: ≤1 trivia category (always yellow) and ≥2 wordplay categories per board', () => {
    for (const p of WORD_WEB_POOL) {
      const trivia = p.groups.filter((g) => g.type === 'trivia');
      expect(trivia.length, p.id).toBeLessThanOrEqual(1);
      for (const g of trivia) expect(g.tier, `${p.id} "${g.theme}"`).toBe('yellow');
      expect(p.groups.filter((g) => g.type === 'wordplay').length, p.id).toBeGreaterThanOrEqual(2);
      for (const g of p.groups) expect(['semantic', 'trivia', 'wordplay'], p.id).toContain(g.type);
    }
  });

  it('planted herrings cluster adjacently in the opening layout (2.6)', () => {
    for (const p of WORD_WEB_POOL) {
      const herrings = p.ambiguousWords ?? [];
      if (herrings.length < 2) continue;
      const idxs = herrings.map((w) => p.layout!.indexOf(w)).sort((a, b) => a - b);
      expect(idxs[idxs.length - 1]! - idxs[0]!, p.id).toBe(herrings.length - 1);
    }
  });
});

describe('shipped content — Study pool (AAA 3.7)', () => {
  it('the pool is a volume deep (≥30) with all four obscurities stocked', () => {
    expect(FORGOTTEN_WORD_POOL.length).toBeGreaterThanOrEqual(30);
    for (const o of ['common', 'medium', 'rare', 'archaic'] as const) {
      expect(FORGOTTEN_WORD_POOL.some((p) => p.obscurity === o), o).toBe(true);
    }
  });

  it('the three definition registers are genuinely distinct per entry', () => {
    for (const p of FORGOTTEN_WORD_POOL) {
      expect(p.definitions.plain, p.id).not.toBe(p.definitions.poetic);
      expect(p.definitions.poetic, p.id).not.toBe(p.definitions.riddle);
      expect(p.definitions.plain, p.id).not.toBe(p.definitions.riddle);
    }
  });

  it('no clue leaks the answer stem (the fw-serendipity lesson)', () => {
    for (const p of FORGOTTEN_WORD_POOL) {
      const stem = p.word.slice(0, 4).toLowerCase();
      for (const clue of [
        p.definitions.plain, p.definitions.poetic, p.definitions.riddle,
        p.etymology, p.usage,
      ]) {
        expect(clue.toLowerCase().includes(stem), `${p.id}: "${clue}"`).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Round 4 — the three tiers are STRUCTURALLY different, not relabelled
// (owner directive: "fewer but better quality and escalating difficulty as you
//  move closer to the door"). Each block below is the shipped-content proof
//  for one anchor room's tier ladder.
// ---------------------------------------------------------------------------

/** Mirrors content/generate-wordweb.ts's SUBTLE class (kept explicit here). */
function isSubtleTheme(theme: string): boolean {
  if (['Palindromes', 'Semordnilaps', 'Heteronyms', 'Contronyms',
    'Contronyms (Own Opposite)', 'Onomatopoeia', 'Portmanteau Words',
    'Contains Roman Numerals'].includes(theme)) return true;
  return /^(Anagrams of|Rhymes with|Hidden |Silent |Two Pairs|Starts and Ends)/.test(theme);
}

describe('tier escalation — The Library (herring budget + category subtlety)', () => {
  const at = (tier: 1 | 2 | 3) => WORD_WEB_POOL.filter((p) => (p.tier ?? 1) === tier);

  it('all three tiers are stocked', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(at(tier).length, `tier ${tier}`).toBeGreaterThanOrEqual(10);
    }
  });

  it('the herring budget widens with the row, and never past the AAA 2.7 cap of 3', () => {
    for (const p of at(1)) expect((p.ambiguousWords ?? []).length, p.id).toBeLessThanOrEqual(1);
    for (const p of at(2)) expect((p.ambiguousWords ?? []).length, p.id).toBeLessThanOrEqual(2);
    for (const p of at(3)) {
      expect((p.ambiguousWords ?? []).length, p.id).toBeGreaterThanOrEqual(2);
      expect((p.ambiguousWords ?? []).length, p.id).toBeLessThanOrEqual(3);
    }
  });

  it('tier 3 bans the trivia gimme; tier 1 is allowed one', () => {
    for (const p of at(3)) {
      expect(p.groups.filter((g) => g.type === 'trivia').length, p.id).toBe(0);
    }
    expect(at(1).some((p) => p.groups.some((g) => g.type === 'trivia'))).toBe(true);
  });

  it('tier 3 boards carry at least two SUBTLE categories', () => {
    for (const p of at(3)) {
      const subtle = p.groups.filter((g) => isSubtleTheme(g.theme)).length;
      expect(subtle, `${p.id}: ${p.groups.map((g) => g.theme).join(' | ')}`).toBeGreaterThanOrEqual(2);
    }
    const mean = (tier: 1 | 2 | 3) => {
      const arr = at(tier);
      return arr.reduce((a, p) => a + p.groups.filter((g) => isSubtleTheme(g.theme)).length, 0) / arr.length;
    };
    expect(mean(3)).toBeGreaterThan(mean(1));
  });
});

describe('tier escalation — The Gallery (bigger asks, twistier paths)', () => {
  const at = (tier: 1 | 2 | 3) => TWISTLE_POOL.filter((p) => (p.tier ?? 1) === tier);

  it('all three tiers are stocked', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(at(tier).length, `tier ${tier}`).toBeGreaterThanOrEqual(30);
    }
  });

  it('tier 3 raises the word-length floor and demands the centre tile', () => {
    for (const p of at(1)) {
      expect(p.rules.minLength, p.id).toBe(4);
      expect(p.rules.centerRequired, p.id).toBe(false);
    }
    for (const p of at(2)) {
      expect(p.rules.minLength, p.id).toBe(4);
      expect(p.rules.centerRequired, p.id).toBe(false);
    }
    for (const p of at(3)) {
      expect(p.rules.minLength, p.id).toBe(5);
      expect(p.rules.centerRequired, p.id).toBe(true);
      for (const w of p.targetWords) expect(w.length, `${p.id}: ${w}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('target words get longer as the row climbs', () => {
    const meanLen = (tier: 1 | 2 | 3) => {
      const arr = at(tier);
      const all = arr.flatMap((p) => p.targetWords);
      return all.reduce((a, w) => a + w.length, 0) / all.length;
    };
    expect(meanLen(3)).toBeGreaterThan(meanLen(2));
    expect(meanLen(2)).toBeGreaterThanOrEqual(meanLen(1));
  });

  it('every shipped target still has a legal path under its own rules', () => {
    for (const p of TWISTLE_POOL) {
      for (const w of p.targetWords) {
        expect(findPath(p.grid, w, p.rules), `${p.id}: ${w}`).not.toBeNull();
      }
    }
  });
});

describe('tier escalation — The Study (three registers, riddle-only at the top)', () => {
  const at = (tier: 1 | 2 | 3) => FORGOTTEN_WORD_POOL.filter((p) => (p.tier ?? 1) === tier);
  const FIRST_PERSON = /\b(I|I'm|I've|me|my|mine)\b/;

  it('all three tiers are stocked', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(at(tier).length, `tier ${tier}`).toBeGreaterThanOrEqual(10);
    }
  });

  it('a tier-3 Study shows the RIDDLE and nothing gentler', () => {
    for (const p of FORGOTTEN_WORD_POOL) {
      expect(definitionForLevel(p, 3), p.id).toBe(p.definitions.riddle);
      expect(definitionForLevel(p, 2), p.id).toBe(p.definitions.poetic);
      expect(definitionForLevel(p, 1), p.id).toBe(p.definitions.plain);
    }
    // …and the adapter hands the room's tier straight through.
    const puzzle = forgottenWordAdapter.select({ tier: 3, seed: 3, seenIds: [] });
    const state = forgottenWordAdapter.start(puzzle, ctx(3));
    expect(state.tier).toBe(3);
    expect(definitionForLevel(puzzle, state.tier)).toBe(puzzle.definitions.riddle);
  });

  it('the registers are three different KINDS of sentence, not three phrasings', () => {
    for (const p of FORGOTTEN_WORD_POOL) {
      // Only the riddle speaks in the first person (or asks outright).
      expect(FIRST_PERSON.test(p.definitions.plain), `${p.id} plain`).toBe(false);
      expect(FIRST_PERSON.test(p.definitions.poetic), `${p.id} poetic`).toBe(false);
      expect(
        FIRST_PERSON.test(p.definitions.riddle) || p.definitions.riddle.trim().endsWith('?'),
        `${p.id} riddle`,
      ).toBe(true);
    }
  });

  it('no two registers lean on the same content words', () => {
    const STOP = new Set(['a', 'an', 'and', 'as', 'at', 'be', 'but', 'by', 'for', 'from',
      'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'up', 'was', 'what',
      'when', 'which', 'who', 'with', 'you', 'your', 'i', 'me', 'my', 'am', 'are', 'no',
      'not', 'so', 'than', 'then', 'there', 'they', 'this', 'too', 'very']);
    const words = (t: string) => new Set(
      t.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w)),
    );
    const share = (a: string, b: string) => {
      const A = words(a), B = words(b);
      if (A.size === 0 || B.size === 0) return 0;
      let n = 0;
      for (const w of A) if (B.has(w)) n++;
      return n / Math.min(A.size, B.size);
    };
    for (const p of FORGOTTEN_WORD_POOL) {
      const d = p.definitions;
      expect(share(d.plain, d.poetic), `${p.id} plain/poetic`).toBeLessThanOrEqual(0.4);
      expect(share(d.poetic, d.riddle), `${p.id} poetic/riddle`).toBeLessThanOrEqual(0.4);
      expect(share(d.plain, d.riddle), `${p.id} plain/riddle`).toBeLessThanOrEqual(0.4);
    }
  });
});
