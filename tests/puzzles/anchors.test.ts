import { describe, expect, it } from 'vitest';
import type {
  ForgottenWordPuzzle, HivePuzzle, TwistlePuzzle, WordWebPuzzle,
} from '../../src/engine/types';
import type { RoomContext, RoomEvent } from '../../src/engine/rooms/room-puzzle';
import { getRoomAdapter, registeredRoomKinds } from '../../src/engine/rooms/registry';
import {
  wordWebAdapter, WORD_WEB_POOL,
  type WordWebPuzzleEx, type WordWebRoomState,
} from '../../src/engine/rooms/adapters/word-web';
import {
  hiveAdapter, HIVE_POOL, HIVE_LADDER, ladderIndex, ladderThreshold, type HiveRoomState,
} from '../../src/engine/rooms/adapters/hive';
import {
  twistleAdapter, TWISTLE_POOL, type TwistleRoomState,
} from '../../src/engine/rooms/adapters/twistle';
import {
  forgottenWordAdapter, FORGOTTEN_WORD_POOL, closenessOf,
  type ForgottenWordRoomState,
} from '../../src/engine/rooms/adapters/forgotten-word';
import { fernLine, fernKeys } from '../../src/engine/rooms/fern-lines';
import { STEP_TABLE } from '../../src/engine/economy/steps';
import { findPath, puzzleSize } from '../../src/engine/twistle';
import {
  cribIndices, cribLetters, definitionForLevel, glossForLevel,
  maxGuessesForLevel, unshownDefinitions,
} from '../../src/engine/forgotten-word';
import { hiveWordPoints } from '../../src/engine/scoring';
import { bandOf, loadDictionary } from '../../content/lib/dictionary';
import { typeset } from '../../content/lib/typography';
import { familyOfTheme } from '../../content/lib/wordweb-ladder';
import { anArticle, herringLine } from '../../src/ui/rooms/anchor/herring-line';

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

const webPuzzle: WordWebPuzzleEx = {
  id: 'web-fixture',
  tier: 2,
  groups: [
    { theme: 'Breakfast', tier: 'yellow', words: ['WAFFLE', 'PANCAKE', 'TOAST', 'BAGEL'] },
    { theme: 'Basketball', tier: 'green', words: ['DUNK', 'BLOCK', 'ASSIST', 'REBOUND'] },
    { theme: 'Iron ___', tier: 'blue', words: ['FIST', 'WILL', 'CURTAIN', 'MAN'] },
    { theme: '___ Bar', tier: 'purple', words: ['CANDY', 'SALAD', 'SPACE', 'CROW'] },
  ],
  // BLOCK is a genuine 5th member of "Iron ___" — the trap, and the thread it
  // pretends to be (AAA 2.10, round 7: the relation is emitted, not discarded).
  ambiguousWords: ['BLOCK'],
  herrings: [
    { words: ['FIST', 'WILL', 'CURTAIN', 'MAN', 'BLOCK'], relation: 'semantic' },
  ],
};

const hivePuzzle: HivePuzzle = {
  id: 'hive-fixture',
  tier: 1,
  center: 'E',
  outer: ['S', 'T', 'A', 'R', 'N', 'I'],
  pangrams: ['RETAINS'],
  validWords: ['RETAINS', 'STARE', 'TEARS', 'RATE', 'NEAR', 'SEAT'],
  pointThreshold: 15,   // v1 threshold — must be ignored by the manor adapter
  totalPoints: 27,      // 14 + 5 + 5 + 1 + 1 + 1
};

const twistlePuzzle: TwistlePuzzle = {
  id: 'twistle-fixture',
  tier: 1,
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

  /**
   * ROUND 12 — TWO IDENTICAL LABELS IN THE NAMING ACT.
   *
   * The shipped shelf was half-typeset (168 themes with curly marks, 115 with
   * straight) and `WordWebView` prints every label through `typeset()`. Board
   * web-d06 stored `Can Follow “TEA”` as its purple theme and
   * `Can Follow "TEA"` as one of that group's decoys; `d !== theme` compared
   * the raw strings, so both survived, and the player was shown the same
   * sentence twice with one copy of it wrong. Tapping the wrong twin forfeits
   * the perfect grade and its +2 with nothing on the glass to choose by, which
   * is the unfairness AAA §2 exists to forbid. The corpus is uniform now and
   * the lint keeps it so — this asserts the room does not depend on that.
   */
  it('the three labels are three labels, whatever the corpus does to its quotes', () => {
    const twinned: WordWebPuzzleEx = {
      ...webPuzzle,
      id: 'web-twinned',
      groups: webPuzzle.groups.map((g, i) => (i === 3
        ? { ...g, theme: 'Can Follow “TEA”', decoys: ['Things on a Mantelpiece', 'Can Follow "TEA"'] }
        : g)),
    };
    let s: WordWebRoomState = wordWebAdapter.start(twinned, ctx(1));
    for (const g of twinned.groups) {
      s = wordWebAdapter.reduce(twinned, s, { type: 'submit', selection: g.words }).state;
    }
    const options = s.pendingNaming!.options;
    expect(options).toHaveLength(3);
    // As the player reads them, not as the JSON stores them.
    const shown = options.map((o) => typeset(o));
    expect(new Set(shown).size, shown.join(' / ')).toBe(3);
    expect(shown).toContain(typeset(s.pendingNaming!.theme));
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
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 1, detail: 'one-away' }]);
    expect(s.lastFeedback).toEqual({ kind: 'one-away' });
    expect(s.lastWrongSelection).toEqual(wrong);
    expect(r.outcome).toEqual({ status: 'active', perfect: false });
  });

  /**
   * AAA 2.10 [BEAT] — round 7. Three regressions guarded here:
   *   (a) the herring is acknowledged WITH ITS RELATION (the bar's own example
   *       is informative because it names the thread);
   *   (b) it only fires when ≥3 of her four tiles sat inside the trap. The old
   *       rule fired on ANY flagged word in the selection, which told a player
   *       who had never touched the trap that she had — misinformation, not a
   *       hint;
   *   (c) every wrong guess still yields ≥1 bit even with no trap in sight:
   *       `together` says how many of the four really do share a thread, which
   *       prunes the logic space Connections leaves untouched.
   */
  it('acknowledges a herring, with its relation, when she really chased it', () => {
    const s = startState();
    const r = wordWebAdapter.reduce(webPuzzle, s, {
      // FIST + WILL are Iron ___; BLOCK is the planted 5th member. Three of the
      // four tiles sit inside the trap, so she was demonstrably following it.
      type: 'submit', selection: ['FIST', 'WILL', 'BLOCK', 'TOAST'],
    });
    expect(r.state.lastFeedback).toMatchObject({
      kind: 'wrong',
      herring: { relation: 'semantic' },
      together: 2,
    });
    const fb = r.state.lastFeedback as { herring: { matched: string[] } };
    expect(fb.herring.matched.sort()).toEqual(['BLOCK', 'FIST', 'WILL']);
  });

  it('does NOT claim a herring the guess never chased (round-6 misinformation)', () => {
    const s = startState();
    const r = wordWebAdapter.reduce(webPuzzle, s, {
      // BLOCK is flagged, but only one other tile touches the trap — the old
      // rule printed the knowing line here anyway.
      type: 'submit', selection: ['BLOCK', 'WAFFLE', 'CANDY', 'FIST'],
    });
    expect(r.state.lastFeedback).toMatchObject({ kind: 'wrong', herring: null });
  });

  it('every wrong guess yields ≥1 bit: the free structural count (AAA 2.10)', () => {
    const s = startState();
    // Four words from four different groups: nothing belongs together.
    const scattered = wordWebAdapter.reduce(webPuzzle, s, {
      type: 'submit', selection: ['WAFFLE', 'DUNK', 'FIST', 'CANDY'],
    });
    expect(scattered.state.lastFeedback).toMatchObject({ kind: 'wrong', together: 1 });
    // Two from one group: a strictly different, strictly useful claim.
    const paired = wordWebAdapter.reduce(webPuzzle, s, {
      type: 'submit', selection: ['WAFFLE', 'PANCAKE', 'FIST', 'CANDY'],
    });
    expect(paired.state.lastFeedback).toMatchObject({ kind: 'wrong', together: 2 });
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

  it('ignores the v1 pointThreshold: the room is SOLVED and PAID at 70% of totalPoints', () => {
    // 70% of 27 = 18.9 → ceil 19.
    expect(ladderThreshold(hivePuzzle.totalPoints, 70)).toBe(19);
    let s = startState();
    let r = submit(s, 'RETAINS'); // pangram, 14 pts — over the v1 threshold of 15? No: 14 < 15 and < 19 either way
    expect(r.outcome.status).toBe('active');
    expect(r.state.fullBloom).toBe(false);
    r = submit(r.state, 'STARE'); // 14 + 5 = 19 ≥ 19 → Full Bloom
    // The payout, the grid's solved flag and the spine event all key off THIS
    // event, so walking out at Full Bloom pays the full solve (AAA 1.12).
    expect(eventsOfType(r.events, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
    expect(r.state.fullBloom).toBe(true);
  });

  /**
   * AAA 1.12 [COZY] — "the room is solved at 70%; walking away at Full Bloom
   * pays the full solve." Full Bloom is a LANDING, not an ejection. Returning
   * `status:'solved'` on the 70% crossing made RoomHost refuse every further
   * dispatch, which took the hive off the table mid-sentence AND made the
   * hidden Every Petal tier (1.11) unreachable dead code on every save.
   */
  it('Full Bloom does not close the room — the hive keeps listening (AAA 1.12)', () => {
    let s = startState();
    let r = submit(s, 'RETAINS');
    r = submit(r.state, 'STARE');           // Full Bloom crossing
    expect(r.outcome.status).toBe('active'); // still hers to play
    // …and a further find still scores, still emits, and never re-pays.
    const after = submit(r.state, 'TEARS');
    expect(after.state.hive.score).toBe(24);
    expect(eventsOfType(after.events, 'solved')).toEqual([]);
    expect(after.outcome.status).toBe('active');
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
      expect(eventsOfType(r.events, 'mistake'), word).toEqual([{ type: 'mistake', weight: 0, detail: reason }]);
      expect(r.state.costedMistakes, word).toBe(0);
      expect(r.state.lastFeedback, word).toMatchObject({ kind: 'invalid', reason, costed: false });
    }
  });

  it('already-found is free and never re-scores', () => {
    let s = startState();
    s = submit(s, 'STARE').state;
    const r = submit(s, 'STARE');
    expect(r.state.hive.score).toBe(5);
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0, detail: 'already-found' }]);
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
      expect(eventsOfType(r.events, 'mistake'), word).toEqual([{ type: 'mistake', weight: 'structural', detail: reason }]);
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

  it('finding every word pays the hidden Every Petal gem and ends the session', () => {
    let s = startState();
    let all: RoomEvent[] = [];
    let last = null as ReturnType<typeof submit> | null;
    for (const w of hivePuzzle.validWords) {
      const r = submit(s, w);
      s = r.state;
      last = r;
      all = [...all, ...r.events];
    }
    expect(s.hive.score).toBe(27);
    expect(eventsOfType(all, 'reward')).toEqual([{ type: 'reward', gems: 1 }]);
    expect(all.some((e) => e.type === 'progress' && e.detail === 'every-petal')).toBe(true);
    // Full Bloom's solve payout fires exactly once, on the 70% crossing.
    expect(eventsOfType(all, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
    // Every Petal is the one thing that actually closes the room.
    expect(s.fullBloom).toBe(true);
    expect(s.everyPetal).toBe(true);
    expect(last!.outcome).toEqual({ status: 'solved', perfect: true });
  });

  it('the Every Petal gem is reachable — the 1.11 tier is no longer dead code', () => {
    // Regression guard for the round-5 blocker: with `solved` at 70% ending the
    // session, no save could ever reach 100%, so `{type:'reward',gems:1}` was
    // unreachable by construction. Play PAST Full Bloom to the last word.
    let s = startState();
    let rewards = 0;
    for (const w of hivePuzzle.validWords) {
      const r = submit(s, w);
      s = r.state;
      // The host only stops dispatching when the outcome leaves 'active'.
      rewards += eventsOfType(r.events, 'reward').length;
      if (r.outcome.status !== 'active') break;
    }
    expect(rewards).toBe(1);
    expect(s.hive.score).toBe(s.maxScore);
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
// Fern's voice (AAA 1.15 [BEAT]) — the thing SB structurally cannot do
// ---------------------------------------------------------------------------

describe('fern lines', () => {
  const MOMENTS = ['first-word', 'good-word', 'pangram', 'full-bloom', 'every-petal'] as const;

  it('every moment the Conservatory can reach has a line, in character', () => {
    for (const key of MOMENTS) {
      const line = fernLine(key, 'hive-t1-1');
      expect(line, key).toMatch(/^Fern\b/);
    }
    // Every reachable ladder rung (Seed is the floor, never a tier-up).
    for (const rung of HIVE_LADDER.slice(1)) {
      expect(fernLine(`tier-up:${rung.name}`, 'hive-t1-1'), rung.name).toMatch(/^Fern\b/);
    }
  });

  it('offers ≥4 variants per authored key (never a stock phrase)', () => {
    for (const key of fernKeys()) {
      const variants = new Set(
        Array.from({ length: 400 }, (_, i) => fernLine(key as never, `probe-${i}`)),
      );
      expect(variants.size, key).toBeGreaterThanOrEqual(4);
    }
  });

  it('is deterministic per board — the same hive always says the same thing', () => {
    for (const key of MOMENTS) {
      expect(fernLine(key, 'hive-t2-9')).toBe(fernLine(key, 'hive-t2-9'));
    }
    // …and salted per key, so the pangram line does not depend on how many
    // rungs happened to fire before it.
    const a = MOMENTS.map((k) => fernLine(k, 'hive-t3-4'));
    expect(new Set(a).size).toBe(a.length);
  });

  it('an unauthored rung degrades to a warm generic, never an empty slot', () => {
    expect(fernLine('tier-up:Nonesuch', 'hive-t1-1')).toMatch(/^Fern\b/);
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
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0, detail: 'not-a-word' }]);
    expect(r.state.missedWords).toEqual(['RATS']);
    expect(r.state.costedMistakes).toBe(0);
    // Submitting the same miss again does not duplicate the memory.
    const r2 = submit(twistlePuzzle, r.state, 'RATS');
    expect(r2.state.missedWords).toEqual(['RATS']);
  });

  it('breaking the pre-warned center rule costs weight 1', () => {
    const s = start(twistleCenterPuzzle);
    const r = submit(twistleCenterPuzzle, s, 'STONE'); // valid path, skips center X
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 1, detail: 'breaks-rule' }]);
    expect(r.state.lastFeedback).toMatchObject({ kind: 'invalid', reason: 'breaks-rule', costed: true });
    expect(r.outcome.perfect).toBe(false);
  });

  it('malformed input is free', () => {
    const s = start(twistlePuzzle);
    for (const [word, detail] of [['PLA', 'too-short'], ['ZZZZ', 'not-on-grid']] as const) {
      const r = submit(twistlePuzzle, s, word);
      expect(eventsOfType(r.events, 'mistake'), word).toEqual([{ type: 'mistake', weight: 0, detail }]);
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

  /**
   * ROUND 14 (AAA 3.5 / 3.8) — the allowance used to run 5 / 4 / 3, shrinking
   * as the words got harder: every tier-3 entry is rare-or-archaic (median
   * corpus rank 157,866 against content/data/count_1w.txt; 15 of 43 absent from
   * a 333k-word corpus), and the top of the house answered that with THREE
   * blind guesses, no gloss and no crib. Wordle gives six on a word everybody
   * knows. Difficulty now constrains rather than starves: five whispers
   * everywhere, six at the bottom of the house.
   */
  it('never gives fewer than five whispers, however rare the word', () => {
    expect(start(1).fw.maxGuesses).toBe(6);
    expect(start(2).fw.maxGuesses).toBe(5);
    expect(start(3).fw.maxGuesses).toBe(5);
  });

  it('a first-breath correct guess is a perfect solve', () => {
    const r = guess(start(2), 'petrichor');
    expect(eventsOfType(r.events, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
    expect(r.outcome).toEqual({ status: 'solved', perfect: true });
  });

  it('a wrong guess (of an announced-plausible length) is a deliberate claim: weight 1', () => {
    const r = guess(start(1), 'RAINSTORM'); // 9 letters, same as PETRICHOR
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 1, detail: 'wrong' }]);
    expect(r.state.lastFeedback).toMatchObject({ kind: 'wrong', guess: 'RAINSTORM', guessesLeft: 5 });
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
    let s = start(3); // five whispers (round 14)
    s = guess(s, 'RAINSTORM').state;
    s = guess(s, 'DOWNPOURS').state;
    s = guess(s, 'SPLASHING').state;
    s = guess(s, 'RAINDROPS').state;
    const r = guess(s, 'SPRINKLED');
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
    // A repeat is not a new claim, so it never adds a new elimination row.
    expect(r.state.closeness).toHaveLength(1);
  });

  /**
   * ROUND 7 — AAA 4.17's closeness taxonomy, which the Sanctum mandates for
   * the identical verb at a LOWER price. The Study charged 2–3 steps per
   * whisper and returned one bit ("not that word"); the room we benchmark for
   * reveal juice is built entirely out of closeness.
   */
  it('closenessOf counts shared letters as a multiset and positions exactly', () => {
    expect(closenessOf('PETRICHOR', 'PETRICHOR')).toEqual({ shared: 9, exact: 9 });
    // R appears twice in PETRICHOR, so RAINSTORM's two R's both count.
    expect(closenessOf('PETRICHOR', 'RAINSTORM')).toEqual({ shared: 5, exact: 0 });
    // PET_ lines up letter for letter — the positional signal, on its own axis.
    expect(closenessOf('PETRICHOR', 'PETUNIAS')).toEqual({ shared: 4, exact: 3 });
    expect(closenessOf('PETRICHOR', 'ZZZZZZZZZ')).toEqual({ shared: 0, exact: 0 });
  });

  it('a wrong whisper answers with closeness, not a bare refusal (AAA 4.17)', () => {
    const r = guess(start(1), 'RAINSTORM');
    expect(r.state.lastFeedback).toEqual({
      kind: 'wrong',
      guess: 'RAINSTORM',
      guessesLeft: 5,
      shared: 5,
      exact: 0,
      rightLength: true,
    });
  });

  it('the elimination history keeps its closeness (AAA 3.3)', () => {
    let s = start(1);
    s = guess(s, 'RAINSTORM').state;
    s = guess(s, 'PETRIFIED').state;
    expect(s.closeness.map((c) => c.guess)).toEqual(['RAINSTORM', 'PETRIFIED']);
    expect(s.closeness[1]).toMatchObject({ guess: 'PETRIFIED' });
    // PETRIFIED shares P,E,T,R,I with PETRICHOR and four of them are in place.
    expect(s.closeness[1]!.exact).toBeGreaterThanOrEqual(4);
    // A free malformed refusal never writes a row.
    s = guess(s, 'LANTERN').state;
    expect(s.closeness).toHaveLength(2);
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
      // 2.7 herring budget: ≤4 (re-ruled in round 17 against BENCHMARKS §2's
      // 2–4 contested tiles; it was ≤3), all on the board.
      expect((p.ambiguousWords ?? []).length, p.id).toBeLessThanOrEqual(4);
      for (const w of p.ambiguousWords ?? []) expect(words, p.id).toContain(w);
      // 2.11 decoys for the act of naming. Compared AS SHOWN (round 12): the
      // shelf shipped `Can Follow “TEA”` beside `Can Follow "TEA"` on web-d06,
      // two strings and one sentence, and raw `not.toContain` waved it past.
      for (const g of p.groups) {
        expect(g.decoys?.length, `${p.id} "${g.theme}"`).toBe(2);
        const shown = [g.theme, ...(g.decoys ?? [])].map((t) => typeset(t));
        expect(new Set(shown).size, `${p.id}: ${shown.join(' / ')}`).toBe(3);
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

  /**
   * ROUND 7 — the channel that beats Connections is live on EVERY night.
   * 22 of the 55 shipped boards used to carry `ambiguousWords: []`, so on 40%
   * of boards the acknowledged-herring line could not fire at all, and the
   * ones that could printed a board-agnostic string naming neither the words
   * nor the relation. Both halves are now content invariants.
   */
  // ROUND 11: `hidden-string` split out of `shared-affix` — a word with the
  // group's string buried inside it (HAMMER against Contains "HAM") is a
  // different deduction from four words that share an edge, and the room now
  // says a different sentence about it.
  const HERRING_RELATIONS = ['rhyme', 'shared-affix', 'doubled-letter', 'semantic', 'hidden-string'];

  /**
   * ROUND 11 — THE ARCHITECTURE BUDGET (AAA 2.7 / 2.12).
   *
   * The herring budget was enforced board by board and violated pool-wide.
   * Measured on the round-10 shelf: 86 of 163 boards carried the identical
   * group-type signature (yellow semantic / green semantic / blue wordplay /
   * purple wordplay), the planted trap's home group sat in one colour slot on
   * 111 of 161 traps, and 119 of 175 named traps were shared-affix. Every
   * board was therefore solvable by the same learned shortcut — find the
   * substring group, find the fifth word containing that substring, hand it to
   * a semantic group — regardless of its words. Connections varies its
   * architecture day to day precisely so the meta cannot be learned; these are
   * the numbers that keep ours varied. Mirrors ARCHITECTURE_BUDGET in
   * content/generate-wordweb.ts, which fails the build on the same thresholds.
   */
  describe('the architecture budget: 163 boards, not one board 163 times', () => {
    const TIER_ORDER = ['yellow', 'green', 'blue', 'purple'] as const;

    /**
     * ROUND 13 (REVIEW_AA §5.8) — THIS TEST CHANGED WHAT IT MEASURES, AND THE
     * REASON IS THE POINT OF THE WHOLE ROUND.
     *
     * It used to read the four group TYPES off in colour order (`swww`) and
     * cap the top one at 35%. That was the right measurement for a shelf whose
     * colours came out of the authored JSON and were then shuffled for
     * novelty. It stopped being a measurement the moment `chooseColours`
     * started assigning colours from measured lateral distance: "plain English
     * first, transformation last" is now the PROMISE the colour ladder makes
     * to the player, so of course every board says it — `swww` went to 56% on
     * the first ladder-assigned build — and a 35% cap on it is a cap on the
     * fix. Keeping the old assertion would have meant deliberately mis-colouring
     * one board in three to satisfy a proxy for variety.
     *
     * What should still vary night to night is WHICH FOUR TRICKS she meets,
     * and that is the family signature. It is the stricter test of the two: the
     * old one had three symbols to play with, this one has eleven families and
     * therefore hundreds of legal shapes, and the pool has to spread across
     * them. Measured after the round: 65 distinct signatures, top one 13%.
     */
    const familySignatureOf = (p: WordWebPuzzleEx) =>
      p.groups.map((g) => familyOfTheme(g.theme)).sort().join('+');

    it('no single family signature owns more than 20% of the shelf', () => {
      const tally = new Map<string, number>();
      for (const p of WORD_WEB_POOL) {
        const s = familySignatureOf(p);
        tally.set(s, (tally.get(s) ?? 0) + 1);
      }
      const [top, n] = [...tally].sort((a, b) => b[1] - a[1])[0]!;
      expect(tally.size, 'distinct board architectures').toBeGreaterThanOrEqual(40);
      expect(n / WORD_WEB_POOL.length, `"${top}" is the dominant shape`).toBeLessThanOrEqual(0.20);
    });

    it('the planted trap does not always live in the same colour slot', () => {
      const home = new Map<string, number>();
      for (const p of WORD_WEB_POOL) {
        for (const w of p.ambiguousWords ?? []) {
          const g = p.groups.find((x) => x.words.includes(w));
          if (g) home.set(g.tier, (home.get(g.tier) ?? 0) + 1);
        }
      }
      const total = [...home.values()].reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
      for (const slot of TIER_ORDER) {
        expect((home.get(slot) ?? 0) / total, `traps living in the ${slot} group`)
          .toBeGreaterThanOrEqual(0.12);
      }
    });

    it('no single relation is the named thread of more than 40% of the traps', () => {
      const rel = new Map<string, number>();
      for (const p of WORD_WEB_POOL) {
        for (const h of p.herrings ?? []) rel.set(h.relation, (rel.get(h.relation) ?? 0) + 1);
      }
      const total = [...rel.values()].reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
      const [top, n] = [...rel].sort((a, b) => b[1] - a[1])[0]!;
      expect(n / total, `"${top}" is the dominant trap`).toBeLessThanOrEqual(0.40);
      // …and every relation the room can describe actually appears, or the
      // copy written for it is dead (AAA 11.18's spirit).
      expect(rel.size).toBeGreaterThanOrEqual(4);
    });
  });

  it('2.10: every board ships at least one trap, and every trap is NAMED', () => {
    for (const p of WORD_WEB_POOL) {
      const words = p.groups.flatMap((g) => g.words);
      expect((p.ambiguousWords ?? []).length, p.id).toBeGreaterThanOrEqual(1);
      expect(p.herrings?.length ?? 0, p.id).toBeGreaterThanOrEqual(1);
      for (const h of p.herrings ?? []) {
        expect(HERRING_RELATIONS, `${p.id} "${h.relation}"`).toContain(h.relation);
        // Fewer than 3 words could never satisfy the ≥3-of-4 match rule, so it
        // would be a set of dead copy that never reaches the player.
        expect(h.words.length, p.id).toBeGreaterThanOrEqual(3);
        expect(new Set(h.words).size, p.id).toBe(h.words.length);
        for (const w of h.words) expect(words, p.id).toContain(w);
        // A shared-affix trap that cannot point at the letters is not a hint.
        if (h.relation === 'shared-affix') expect(h.detail, p.id).toBeTruthy();
      }
      for (const w of p.ambiguousWords ?? []) {
        expect(
          (p.herrings ?? []).some((h) => h.words.includes(w)),
          `${p.id}: herring "${w}" has no named relation`,
        ).toBe(true);
      }
    }
  });

  it('2.10: on EVERY shipped board some wrong guess actually fires the trap', () => {
    /** A wrong (not one-away) selection with ≥3 tiles inside a named trap. */
    const chase = (p: (typeof WORD_WEB_POOL)[number]): string[] | null => {
      const all = p.groups.flatMap((g) => g.words);
      const overlap = (sel: string[]) =>
        Math.max(...p.groups.map((g) => sel.filter((w) => g.words.includes(w)).length));
      for (const h of p.herrings ?? []) {
        const hw = h.words;
        for (let i = 0; i < hw.length; i++) {
          for (let j = i + 1; j < hw.length; j++) {
            for (let k = j + 1; k < hw.length; k++) {
              const base = [hw[i]!, hw[j]!, hw[k]!];
              for (const w of all) {
                if (base.includes(w)) continue;
                const sel = [...base, w];
                if (overlap(sel) <= 2) return sel;
              }
            }
          }
        }
      }
      return null;
    };

    for (const p of WORD_WEB_POOL) {
      const sel = chase(p);
      expect(sel, `${p.id}: no wrong guess can reach its own trap`).not.toBeNull();
      const s = wordWebAdapter.start(p, ctx(p.tier ?? 1));
      const r = wordWebAdapter.reduce(p, s, { type: 'submit', selection: sel! });
      expect(r.state.lastFeedback, `${p.id}: ${sel!.join('/')}`).toMatchObject({ kind: 'wrong' });
      const fb = r.state.lastFeedback as { herring: { matched: string[] } | null; together: number };
      expect(fb.herring, `${p.id}: ${sel!.join('/')}`).not.toBeNull();
      expect(fb.herring!.matched.length, p.id).toBeGreaterThanOrEqual(3);
      expect([1, 2], p.id).toContain(fb.together);
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
    'Contains Roman Numerals',
    // ROUND 13 (REVIEW_AA §5.8) — six mechanics that are not one of the
    // eleven templates at all, added so `letter-shape` could stop being the
    // trick on one board in eight. Subtle in exactly the sense tier 3 means:
    // provable on the tile, invisible on a first read.
    'Words with All Five Vowels', 'Letters in Alphabetical Order',
    'Spelled Without a Vowel', 'Three Vowels in a Row',
    'The Same Letter Three Times', 'Made of a Repeated Syllable',
  ].includes(theme)) return true;
  return /^(Anagrams of|Rhymes with|Hidden |Silent |Two Pairs|Starts and Ends|Homophones|Add an? |Drop )/
    .test(theme);
}

describe('tier escalation — The Library (herring budget + category subtlety)', () => {
  const at = (tier: 1 | 2 | 3) => WORD_WEB_POOL.filter((p) => (p.tier ?? 1) === tier);

  /**
   * ROUND 10 — 10 → 45 per tier. The pool-size floor in tests/content.test.ts
   * only proves the Library is deep; this proves it is deep *evenly*. Before
   * the expansion the shelf ran 17/16/18 and, mid-expansion, 29/80/18 — a
   * middle-heavy house where the top row held twelve percent of the content
   * and the tier-3 cap was doing the shaping. A per-tier floor is what stops
   * a future generator tweak from refilling one row at another's expense.
   */
  it('all three tiers are stocked to a volume’s depth', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(at(tier).length, `tier ${tier}`).toBeGreaterThanOrEqual(45);
    }
  });

  /**
   * ROUND 12 — THE BUDGET COUNTS TRAPS, AND `ambiguousWords` IS NOT TRAPS.
   *
   * This test, and the generator's own validator, measured
   * `ambiguousWords.length` — the flat INTRUDER-WORD list — against a budget
   * whose spec field is `minHerrings` and whose docstring says "tier 3 must
   * ship 2–3 traps". Two intruder words caught by one `suffix:GHT` are ONE
   * thread and one sentence; they were counted as two. Measured on the round-11
   * shelf: 25 of the 52 shipped tier-3 boards carried exactly one named trap
   * while passing this two-trap check, so the row the player pays the most
   * steps to reach ran at tier-1 trap density on 48% of its boards and no test
   * could see it. `herrings` — the named threads, deduped by pattern — is the
   * number the room can actually say out loud, so it is the number the budget
   * asserts. The intruder list keeps its own, separate assertion below: it is
   * derived from the traps and is what the opening layout clusters on.
   */
  it('the herring budget widens with the row, and never past the AAA 2.7 cap of 4', () => {
    for (const p of at(1)) expect((p.herrings ?? []).length, p.id).toBeLessThanOrEqual(2);
    for (const p of at(2)) expect((p.herrings ?? []).length, p.id).toBeLessThanOrEqual(3);
    for (const p of at(3)) {
      expect((p.herrings ?? []).length, p.id).toBeGreaterThanOrEqual(2);
      expect((p.herrings ?? []).length, p.id).toBeLessThanOrEqual(4);
    }
    for (const p of WORD_WEB_POOL) {
      const intruders = p.ambiguousWords ?? [];
      expect(new Set(intruders).size, p.id).toBe(intruders.length);
      expect(intruders.length, p.id).toBeLessThanOrEqual((p.herrings ?? []).length);
      expect(intruders.length, p.id).toBeGreaterThanOrEqual(1);
    }
  });

  /**
   * ROUND 17 (BENCHMARKS §2) — CONTESTED TILES, WHICH IS THE NUMBER THE
   * FORMAT IS ACTUALLY MADE OF.
   *
   * The budget above counts THREADS — how many different sentences the room
   * can say on a wrong guess — and it has been the only assertion here since
   * round 12. It is the wrong headline. `ambiguousWords` is the deduped
   * intruder list, so a board can pass a two-thread check by saying two things
   * about one tile, and 118 of 141 boards were doing exactly that: mean 1.12
   * contested tiles, median 1, against the 2–4 BENCHMARKS §2 records for
   * Connections. With one contested tile, three of a board's four threads are
   * uncontested and the evening is a sort.
   *
   * The bar here is deliberately a POOL-WIDE distribution rather than a
   * per-board floor. A per-board floor of 2 is not reachable and would be
   * dishonest if it were: a board only contests a tile when one of its four
   * categories genuinely has a fifth member somewhere else on the board, and
   * the uniqueness solver spends the whole build making near-misses rare. What
   * the shelf can promise is that contesting one tile is no longer what almost
   * every night looks like.
   */
  it('the shelf contests more than one tile a night (BENCHMARKS §2)', () => {
    const contested = WORD_WEB_POOL.map((p) => (p.ambiguousWords ?? []).length);
    const mean = contested.reduce((a, b) => a + b, 0) / contested.length;
    const inBand = contested.filter((n) => n >= 2 && n <= 4).length / contested.length;
    // Round 16 measured 1.12 and 12%. Both floors sit under what this round
    // shipped and over what it replaced, so a regression in either direction
    // of the generator's trap budget fails here.
    expect(mean, `mean contested tiles ${mean.toFixed(2)}`).toBeGreaterThan(1.25);
    expect(inBand, `share inside 2–4: ${(inBand * 100).toFixed(0)}%`).toBeGreaterThan(0.25);
    // …and the top of the house is the trappiest row, which is what the tier
    // ceilings say and what round 16's flat 1.0/1.5/2.3 threads did not deliver
    // in tiles at all.
    const meanAt = (t: 1 | 2 | 3) => {
      const xs = at(t).map((p) => (p.ambiguousWords ?? []).length);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(meanAt(3), `t3 ${meanAt(3).toFixed(2)} vs t1 ${meanAt(1).toFixed(2)}`)
      .toBeGreaterThan(meanAt(1));
  });

  /**
   * ROUND 17 (AAA 2.10) — AND THE BOARD DOES NOT SAY THE SAME THING TWICE
   * WHEN IT HAS SOMETHING ELSE TO SAY.
   *
   * A board that ships three threads and names all three `rhyme` has one trap
   * wearing three coats. The pool-wide relation budget below (≤40% of named
   * threads) cannot see this: variety BETWEEN boards is not variety within the
   * evening, and the evening is what she plays.
   *
   * ═══ ROUND 18 — THIS GATE WAS GREEN ON THE POOL IT WAS WRITTEN TO CONDEMN ══
   *
   * It read `mono / multi <= 0.10`, where `mono` is "every named thread on this
   * board carries the SAME relation". Measured on round 16's shipped pool — the
   * pool the paragraph above is a complaint about — that is **4/75 = 5.3%**.
   * The gate passed there, it passed at round 17's HEAD, and it would have gone
   * on passing through any pool anyone is likely to ship. Worse, it was not
   * even a ratchet: round 17's own shelf measured 6/108 = 5.6%, WORSE than the
   * pool it condemned, and the bound never noticed.
   *
   * Two separate defects, and they have to be fixed together:
   *
   *   1. THE NAME DID NOT MATCH WHAT IT COMPUTED (standing rule 2). The title
   *      says "one thing three times"; the metric is "every thread is one
   *      relation", which on a two-thread board is one thing TWICE. And the
   *      literal claim in the title was never true of anything: **no board in
   *      round 16's pool, round 17's, or this one has ever named one relation
   *      three times** — 0/75, 0/101, 0/108. The gate condemned a shape that
   *      does not occur, which is why no threshold could give it teeth.
   *
   *   2. A REPEATED RELATION IS NOT THE DEFECT. web-32 names `rhyme` twice and
   *      is right to: ALTHOUGH/DOUGH/THOUGH and FLEA/ME/TEA are two different
   *      sounds and two different sentences. Charging a board for that is what
   *      made the metric un-tightenable — the honest end of it was already 0.
   *
   * WHAT IS ACTUALLY WRONG is narrower and much sharper, and it is on the
   * shelf: a board naming a thread that is identical in relation, detail AND
   * words to one it has already named. web-39 shipped
   * `hidden-string/MAN :: COMMAND DEMAND MAN ROMANCE WOMAN` **twice, word for
   * word**, and the room paid the tier's thread budget for two threads while
   * saying one sentence twice. `chooseTraps` could not see it: it dedupes on
   * `trap.key`, the PATTERN the solver matched, and `contains:MAN` and
   * `suffix:MAN` are two keys that flatten to one identical herring line once
   * the pattern is thrown away. `content/generate-wordweb.ts` now dedupes on
   * the emitted identity — what the player actually reads.
   *
   * So the bound is ZERO, not a percentage: there is no honest number of
   * boards that may say the same sentence twice.
   *
   * ═══ AND IT GOES RED ON THE POOL IT CONDEMNS ═══════════════════════════════
   *
   * Re-derived off the pools rather than chosen, and counted the way the
   * assertion below counts — relation AND detail AND words, so web-32's two
   * different rhymes are not in it. Replaying this exact predicate:
   *
   *   round 16 shelf (`git show 2bc55ff^:content/generated/word-web.json`)
   *     RED, 4 boards — web-52, web-55, web-b24, web-e01
   *   round 17 HEAD (the pool this round inherited)
   *     RED, 5 boards — web-13, web-39, web-55, web-b24, web-s21
   *   this round     GREEN
   *
   * The old bound could not have made either call at any threshold it could
   * honestly have been given: on its own metric those two pools measure 5.3%
   * and 5.6%, both under 0.10, and the newer of the two is the worse one.
   */
  it('no board names the same thread twice (2.10)', () => {
    const multi = WORD_WEB_POOL.filter((p) => (p.herrings ?? []).length >= 2);
    expect(multi.length, 'boards with 2+ named threads').toBeGreaterThan(40);
    // A thread is what the herring line SAYS: its relation, its detail and the
    // set it points at. Two threads sharing only a relation are two sentences.
    const said = (h: { relation: string; detail?: string; words: string[] }) =>
      `${h.relation}|${h.detail ?? ''}|${[...h.words].sort().join(',')}`;
    const twiceTold = multi
      .filter((p) => new Set(p.herrings!.map(said)).size < p.herrings!.length)
      .map((p) => `${p.id}: ${p.herrings!.map((h) => `${h.relation}/${h.detail ?? '-'}`).join(' + ')}`);
    expect(twiceTold, twiceTold.join(' ; ')).toEqual([]);
  });

  /**
   * ROUND 12 (AAA 2.10 [BEAT]) — A DOUBLED-LETTER TRAP NAMES THE SAME PAIR.
   *
   * The generator bucketed every word containing any doubled letter into one
   * `doubled-letter` set, so the "thread" the room sold a wrong guess was
   * "these each contain some repeated character": 52 of the 55 shipped
   * doubled-letter traps had NO doubled letter in common (web-2's ran
   * CHILLY/GIRAFFE/MILLER/STAFF/THRILL/WILLOW; web-4's ran DD, FF, OO, KK, EE,
   * LL, CC and SS across six words) and the room charged −2 steps to say
   * "CURRENT, FURROW, KEEP double a letter." The bar's model line is
   * informative because the relation is real.
   */
  it('2.10: a doubled-letter trap shares one pair, and names it', () => {
    for (const p of WORD_WEB_POOL) {
      for (const h of p.herrings ?? []) {
        if (h.relation !== 'doubled-letter') continue;
        expect(h.detail, `${p.id}: ${h.words.join('/')}`).toMatch(/^([A-Z])\1$/);
        for (const w of h.words) expect(w, `${p.id}: ${h.detail}`).toContain(h.detail!);
      }
    }
  });

  /**
   * ROUND 11 — the second clause used to read `at(1).some(has trivia)`, and it
   * was passing by accident. No `easy` board in the authored file carries a
   * trivia category at all, so a tier-1 gimme could only ever arrive by a
   * medium/hard board being DEMOTED with its gimme intact — and the round-11
   * bank expansion cut demotions from 21 to 3, which took the last one away.
   * The invariant that matters is unchanged and still asserted: the top of the
   * house bans the gimme outright, no board anywhere carries two, and the
   * allowance is genuinely exercised below tier 3.
   */
  it('tier 3 bans the trivia gimme; the lower rows are allowed one', () => {
    for (const p of at(3)) {
      expect(p.groups.filter((g) => g.type === 'trivia').length, p.id).toBe(0);
    }
    for (const p of WORD_WEB_POOL) {
      expect(p.groups.filter((g) => g.type === 'trivia').length, p.id).toBeLessThanOrEqual(1);
    }
    const gimmes = [...at(1), ...at(2)].filter((p) => p.groups.some((g) => g.type === 'trivia'));
    expect(gimmes.length).toBeGreaterThanOrEqual(1);
    // …and wherever it lands, it is the easiest group on its board (AAA 2.9).
    for (const p of gimmes) {
      expect(p.groups.find((g) => g.type === 'trivia')!.tier, p.id).toBe('yellow');
    }
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

  /**
   * The "bigger" half of the round-4 directive: the board itself grows at the
   * top of the manor. Full board contract (declared vs derived size, centre
   * tile, per-board solvability) lives in tests/puzzles/twistle-boards.test.ts.
   */
  it('the board itself grows: tier 3 is a 6×6, tiers 1–2 stay 5×5', () => {
    for (const tier of [1, 2] as const) {
      for (const p of at(tier)) expect(puzzleSize(p), p.id).toBe(5);
    }
    for (const p of at(3)) expect(puzzleSize(p), p.id).toBe(6);
  });

  it('the length floor is 5 everywhere; the centre tile is demanded from tier 2 up', () => {
    // ROUND 26 — this used to certify `minLength 4` and `centerRequired false`
    // on tiers 1–2, i.e. it wrote the Gallery's defect down as a contract: a
    // median 56 findable words per tier-1 board sat at exactly four letters,
    // which is the chaff the eye picks up without reading the grid. The floor
    // is 5 at every tier now, and the centre rule — the Wordle-hard-mode knob
    // that constrains the player rather than adding content — comes down a
    // storey to tier 2. See tests/puzzles/twistle-boards.test.ts for the
    // measured before/after this rests on.
    const centreFromTier2: Record<number, boolean> = { 1: false, 2: true, 3: true };
    for (const tier of [1, 2, 3] as const) {
      for (const p of at(tier)) {
        expect(p.rules.minLength, p.id).toBe(5);
        expect(p.rules.centerRequired, `${p.id} (tier ${tier})`).toBe(centreFromTier2[tier]!);
        for (const w of p.targetWords) expect(w.length, `${p.id}: ${w}`).toBeGreaterThanOrEqual(5);
      }
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

  /**
   * ROUND 11 (AAA 3.7) — the register is no longer the tier lever, because
   * keying it to the tier made 226 of the 339 authored definitions unreachable
   * AND put the weakest of the three in the biggest type in the first Study a
   * player ever meets. The poetry headlines everywhere the room is meant to
   * read; the top of the house still gets the riddle and nothing gentler; the
   * plain gloss is what tier 1 gets EXTRA, for free.
   */
  /**
   * ROUND 14 (AAA 3.5 / 3.8) — HARD MODE CONSTRAINS THE PLAYER, IT DOES NOT
   * REMOVE SOLVABILITY.
   *
   * The Study's writing was never the problem; the delivery was. Every tier-3
   * entry is rare-or-archaic — median corpus rank 157,866 against
   * `content/data/count_1w.txt`, 31 of 43 past rank 100k, and 15 (SMEUSE,
   * SELCOUTH, CLINQUANT, APRICITY, BRUMOUS, NOCTAMBULIST, TARADIDDLE,
   * LUCUBRATION, PILCROW, YESTREEN, OVERMORROW, ANTIMACASSAR, SENNIGHT,
   * HANDSEL, LIMNER) absent from a 333k-word corpus entirely — and against
   * that the room headlined the riddle, withheld the plain gloss, pre-revealed
   * nothing and gave THREE guesses. Wordle gives six on a word everybody knows.
   *
   * The knobs are off the rarity axis now. `content/generate-forgotten-word.ts`
   * measures every headword and fails the build if a rare one ships without all
   * three; this is the same claim asked of the SHIPPED pool.
   */
  it('a rare word never ships with the help turned down (gloss, five whispers, a crib)', () => {
    const thin: string[] = [];
    for (const p of FORGOTTEN_WORD_POOL) {
      const level = p.tier ?? 1;
      if (glossForLevel(p, level) !== p.definitions.plain) thin.push(`${p.id}: no gloss`);
      if (maxGuessesForLevel(level) < 5) thin.push(`${p.id}: ${maxGuessesForLevel(level)} whispers`);
      if (p.obscurity !== 'common' && cribIndices(p).length < 1) thin.push(`${p.id}: no crib`);
    }
    expect(thin, thin.join(' ; ')).toEqual([]);
  });

  it('the crib is proportional, deterministic, and empty for a word everybody knows', () => {
    for (const p of FORGOTTEN_WORD_POOL) {
      const idx = cribIndices(p);
      // Never more than a third of the word, and never the whole shape.
      expect(idx.length, p.id).toBeLessThan(Math.ceil(p.word.length / 2));
      expect(new Set(idx).size, p.id).toBe(idx.length);
      for (const i of idx) expect(i, p.id).toBeLessThan(p.word.length);
      // Deterministic across calls — AAA 3.3 survives a force-quit.
      expect(cribIndices(p), p.id).toEqual(idx);
      if (p.obscurity === 'common') expect(idx, p.id).toEqual([]);
      const letters = cribLetters(p);
      expect(letters.length, p.id).toBe(p.word.length);
      for (let i = 0; i < letters.length; i++) {
        expect(letters[i], `${p.id}@${i}`).toBe(idx.includes(i) ? p.word[i] : null);
      }
    }
    // The finding's own worked example: an archaic twelve-letter word opens
    // with three or four letters standing, the way a cryptic gives crossers.
    const long = FORGOTTEN_WORD_POOL.filter(
      (p) => p.obscurity === 'archaic' && p.word.length >= 12,
    );
    expect(long.length).toBeGreaterThan(0);
    for (const p of long) {
      expect(cribIndices(p).length, p.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('a tier-3 Study shows the RIDDLE and nothing gentler; the poetry leads below it', () => {
    for (const p of FORGOTTEN_WORD_POOL) {
      expect(definitionForLevel(p, 3), p.id).toBe(p.definitions.riddle);
      expect(definitionForLevel(p, 2), p.id).toBe(p.definitions.poetic);
      expect(definitionForLevel(p, 1), p.id).toBe(p.definitions.poetic);
      // ROUND 14 (AAA 3.5/3.8): the gloss is free at EVERY tier. It used to
      // be tier 1 only, which coupled the help to the rarity the wrong way
      // round — all 43 tier-3 entries are rare-or-archaic (median corpus rank
      // 157,866; 15 of them absent from a 333k-word corpus), and that was the
      // tier the room withheld the plain meaning from.
      for (const level of [1, 2, 3] as const) {
        expect(glossForLevel(p, level), `${p.id} @${level}`).toBe(p.definitions.plain);
      }
    }
    // …and the adapter hands the room's tier straight through.
    const puzzle = forgottenWordAdapter.select({ tier: 3, seed: 3, seenIds: [] });
    const state = forgottenWordAdapter.start(puzzle, ctx(3));
    expect(state.tier).toBe(3);
    expect(definitionForLevel(puzzle, state.tier)).toBe(puzzle.definitions.riddle);
  });

  /**
   * ROUND 11 (AAA 3.7) — NO AUTHORED REGISTER IS DEAD CONTENT. Every one of
   * the three definitions on every shipped entry must be reachable at some
   * tier the room can actually be drafted at, or it is writing nobody will
   * ever read. (Before this round the answer was 113 of 339 reachable.)
   */
  it('every authored register reaches glass in a single visit, at the entry’s own tier', () => {
    for (const p of FORGOTTEN_WORD_POOL) {
      // The adapter honours the room tier exactly (selectByTier), so THIS is
      // the only level this entry is ever read at.
      const level = p.tier ?? 1;
      const shown = new Set<string>([definitionForLevel(p, level)]);
      const g = glossForLevel(p, level);
      if (g) shown.add(g);
      for (const line of unshownDefinitions(p, level)) shown.add(line);
      for (const register of ['plain', 'poetic', 'riddle'] as const) {
        expect(shown.has(p.definitions[register]), `${p.id}: ${register} unreachable`).toBe(true);
      }
      // …and the room never prints the same line twice in one visit.
      expect(shown.size, p.id).toBe(new Set(Object.values(p.definitions)).size);
    }
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

// ---------------------------------------------------------------------------
// ROUND 12 — the acknowledged-herring SENTENCE (AAA 2.10 [BEAT]).
//
// The line is what a −2-step wrong guess actually buys, so it is asserted as
// copy, not merely as data. Before round 12 the generator bucketed every word
// containing any doubled letter into one relation and the room printed
// "CURRENT, FURROW, KEEP double a letter" — a property ~30% of English shares
// and a grouping nobody chases. The mechanism was live-verified on glass at
// 390×844 in round 11 and is unchanged; what moved is the claim it makes.
// ---------------------------------------------------------------------------

describe('the acknowledged herring names a thread she could have followed', () => {
  it('a doubled-letter trap names its pair, on every shipped board', () => {
    for (const p of WORD_WEB_POOL) {
      for (const h of p.herrings ?? []) {
        if (h.relation !== 'doubled-letter') continue;
        const line = herringLine({ ...h, matched: h.words.slice(0, 3) });
        // The letter itself, with the right article, and never the old
        // contentless "double a letter".
        const letter = h.detail![0]!;
        expect(line, `${p.id}: ${line}`).toContain(`double ${anArticle(letter)} ${letter}.`);
        expect(line.endsWith('But no.'), line).toBe(true);
      }
    }
  });

  it('every relation the pool ships has a sentence, and none is empty', () => {
    const seen = new Set<string>();
    for (const p of WORD_WEB_POOL) {
      for (const h of p.herrings ?? []) {
        seen.add(h.relation);
        const line = herringLine({ ...h, matched: h.words.slice(0, 3) });
        expect(line.length, `${p.id} ${h.relation}`).toBeGreaterThan(10);
        // It must name her own tiles or say how many there were — the round-6
        // line named neither the words nor the thread.
        expect(line, `${p.id} ${h.relation}`).toContain(h.words[0]!);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('all four tiles inside one trap are counted, not listed (390px budget)', () => {
    const line = herringLine({
      words: ['A', 'B', 'C', 'D'], relation: 'rhyme', matched: ['A', 'B', 'C', 'D'],
    });
    expect(line).toBe('All four of these do rhyme. But no.');
  });
});
