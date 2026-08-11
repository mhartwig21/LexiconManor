import { describe, expect, it } from 'vitest';
import type { RoomContext, RoomEvent } from '../../src/engine/rooms/room-puzzle';
import { getRoomAdapter } from '../../src/engine/rooms/registry';

import {
  decodeMap, cipherLettersOf, startCipher, assignCipher, developCipher, revealCipherLetter,
  type CipherPuzzle,
} from '../../src/engine/puzzles/cipher';
import {
  cipherAdapter, CIPHER_POOL, type CipherRoomState,
} from '../../src/engine/puzzles/cipher-adapter';

/**
 * A4 — the surviving batch-1 micro room (the Darkroom) behind the RoomPuzzle
 * contract. (The Vestibule anagram and Staircase ladder were retired in the
 * owner's "fewer but better" cull.) Mistake-weight mappings are review
 * checkpoints against AAA §0.3:
 *  - Darkroom: penciling free; a full develop is a claim (weight 1) that
 *    always reports how many letters ring true.
 * Hints are always `hint` events (never mistakes) and forfeit perfect.
 */

const ctx = (tier: 1 | 2 | 3): RoomContext => ({ tier, seed: 42, volumeId: 'volume-1' });

const ofType = (events: RoomEvent[], type: RoomEvent['type']) => events.filter((e) => e.type === type);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// plain → cipher: A→B, C→D, E→F, H→I, S→T, T→U  (no fixed points)
const cipherFixture: CipherPuzzle = {
  id: 'cipher-fixture',
  plaintext: 'THE CAT SAT',
  ciphertext: 'UIF DBU TBU',
  reveals: ['U'], // cipher U = plain T, pre-developed
};

// ---------------------------------------------------------------------------
// Registry wiring
// ---------------------------------------------------------------------------

describe('registry (A4 fence)', () => {
  it('registers the cipher adapter with the right kind and size', () => {
    const adapter = getRoomAdapter('cipher');
    expect(adapter).toBeDefined();
    expect(adapter!.kind).toBe('cipher');
    expect(adapter!.size).toBe('micro');
  });
});

// ---------------------------------------------------------------------------
// Seeded, seen-aware, tier-banded selection
// ---------------------------------------------------------------------------

describe('select()', () => {
  it('cipher: deterministic for a given seed', () => {
    const a = cipherAdapter.select({ tier: 2, seed: 123, seenIds: [] });
    const b = cipherAdapter.select({ tier: 2, seed: 123, seenIds: [] });
    expect(cipherAdapter.puzzleId(a)).toBe(cipherAdapter.puzzleId(b));
  });

  /**
   * ROUND 4 CLEANUP: these two used to assert on the `difficulty` alias — the
   * field that duplicated `tier` and is now retired. The room's promise was
   * always about the tier; assert it in the units that carry it.
   */
  it('cipher: tier 1 serves tier-1 phrases', () => {
    for (const seed of [1, 7, 99, 1234]) {
      const p = cipherAdapter.select({ tier: 1, seed, seenIds: [] });
      expect(p.tier, `seed ${seed}`).toBe(1);
    }
  });

  it('cipher: tier 3 serves tier-3 phrases', () => {
    for (const seed of [1, 7, 99, 1234]) {
      const p = cipherAdapter.select({ tier: 3, seed, seenIds: [] });
      expect(p.tier, `seed ${seed}`).toBe(3);
    }
  });

  it('cipher: avoids seen puzzles, degrades gracefully when all seen', () => {
    const first = cipherAdapter.select({ tier: 2, seed: 5, seenIds: [] });
    const firstId = cipherAdapter.puzzleId(first);
    const second = cipherAdapter.select({ tier: 2, seed: 5, seenIds: [firstId] });
    expect(cipherAdapter.puzzleId(second)).not.toBe(firstId);
    // All seen → still returns a playable puzzle (repeat fallback).
    const all = CIPHER_POOL.map((p) => p.id);
    const fallback = cipherAdapter.select({ tier: 2, seed: 5, seenIds: all });
    expect(cipherAdapter.puzzleId(fallback)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Cipher — engine
// ---------------------------------------------------------------------------

describe('cipher engine', () => {
  it('decodeMap round-trips the fixture', () => {
    const truth = decodeMap(cipherFixture);
    expect(truth).toEqual({ U: 'T', I: 'H', F: 'E', D: 'C', B: 'A', T: 'S' });
    expect(cipherLettersOf(cipherFixture)).toEqual(['U', 'I', 'F', 'D', 'B', 'T']);
  });

  it('start pre-develops the reveals as locked', () => {
    const s = startCipher(cipherFixture);
    expect(s.guesses).toEqual({ U: 'T' });
    expect(s.locked).toEqual(['U']);
  });

  it('penciling is free-form; locked cells ignore it', () => {
    let s = startCipher(cipherFixture);
    s = assignCipher(s, 'I', 'H');
    expect(s.guesses['I']).toBe('H');
    s = assignCipher(s, 'I', null);
    expect(s.guesses['I']).toBeUndefined();
    const locked = assignCipher(s, 'U', 'Z');
    expect(locked.guesses['U']).toBe('T');
  });

  it('develop reports incomplete, murky-with-information, and solves', () => {
    let s = startCipher(cipherFixture);
    expect(developCipher(cipherFixture, s).result).toMatchObject({ kind: 'incomplete', missing: 5 });
    for (const [c, p] of [['I', 'H'], ['F', 'E'], ['D', 'C'], ['B', 'A']] as const) s = assignCipher(s, c, p);
    s = assignCipher(s, 'T', 'Z'); // one wrong
    const murky = developCipher(cipherFixture, s);
    expect(murky.result).toMatchObject({ kind: 'murky', correct: 5, total: 6 });
    s = assignCipher(murky.state, 'T', 'S');
    const done = developCipher(cipherFixture, s);
    expect(done.result).toEqual({ kind: 'developed' });
    expect(done.state.status).toBe('won');
  });

  /**
   * ROUND 5. The Darkroom used to charge twice for the same answer and then
   * forget it: `developCipher` had no memory, so a double-tap on "Develop the
   * print" cost another −2 (−3 at tier 3) for literally zero new information,
   * and the datum she DID pay for lived only in a 2s toast. The sibling room
   * already shipped both fixes (`checkedSignatures`, persistent wrong marks).
   */
  it('re-developing an IDENTICAL mapping is free, and every paid print persists', () => {
    let s = startCipher(cipherFixture);
    for (const [c, p] of [['I', 'H'], ['F', 'E'], ['D', 'C'], ['B', 'A'], ['T', 'Z']] as const) {
      s = assignCipher(s, c, p);
    }
    const first = developCipher(cipherFixture, s);
    expect(first.result).toMatchObject({ kind: 'murky', correct: 5, total: 6, charged: true });
    expect(first.state.prints).toEqual([{ correct: 5, total: 6 }]);

    // The same mapping again: same answer, no charge, no duplicate print.
    const again = developCipher(cipherFixture, first.state);
    expect(again.result).toMatchObject({ kind: 'murky', correct: 5, total: 6, charged: false });
    expect(again.state.prints).toEqual([{ correct: 5, total: 6 }]);

    // A different mapping is a new claim, and it joins the tray.
    const moved = assignCipher(again.state, 'T', 'Q');
    const third = developCipher(cipherFixture, moved);
    expect(third.result).toMatchObject({ charged: true });
    expect(third.state.prints).toHaveLength(2);
    // The run of counts is itself the memory prosthetic (AAA 3.3).
    expect(third.state.prints.map((p) => p.correct)).toEqual([5, 5]);
  });

  it('reveal fixes the most frequent blank-or-wrong letter and locks it', () => {
    const s = startCipher(cipherFixture);
    // Frequencies in "UIF DBU TBU": U=3, B=2, I=1, F=1, D=1, T=2 — U locked, so B or T (T first-appearance later; freq tie broken by frequency only → B=2, T=2, order stable by cipherLettersOf order: B before T? cipherLettersOf = U,I,F,D,B,T → stable sort keeps B first)
    const { state, letter } = revealCipherLetter(cipherFixture, s);
    expect(['B', 'T']).toContain(letter);
    expect(state.locked).toContain(letter);
    expect(state.guesses[letter!]).toBe(decodeMap(cipherFixture)[letter!]);
  });
});

// ---------------------------------------------------------------------------
// Cipher — adapter economy
// ---------------------------------------------------------------------------

describe('cipher adapter', () => {
  it('penciling emits no events and costs nothing', () => {
    const s0 = cipherAdapter.start(cipherFixture, ctx(1));
    const { events, outcome } = cipherAdapter.reduce(cipherFixture, s0, { type: 'pencil', cipherLetter: 'I', plain: 'H' });
    expect(events).toHaveLength(0);
    expect(outcome).toEqual({ status: 'active', perfect: true });
  });

  it('developing with blanks is malformed and free', () => {
    const s0 = cipherAdapter.start(cipherFixture, ctx(1));
    const { events, outcome } = cipherAdapter.reduce(cipherFixture, s0, { type: 'develop' });
    expect(ofType(events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    expect(outcome.perfect).toBe(true);
  });

  it('an identical re-develop is weight 0 — never charge twice for one claim', () => {
    let s = cipherAdapter.start(cipherFixture, ctx(3)) as CipherRoomState;
    for (const [c, p] of [['I', 'H'], ['F', 'E'], ['D', 'C'], ['B', 'A'], ['T', 'Z']] as const) {
      s = cipherAdapter.reduce(cipherFixture, s, { type: 'pencil', cipherLetter: c, plain: p }).state as CipherRoomState;
    }
    const first = cipherAdapter.reduce(cipherFixture, s, { type: 'develop' });
    expect(ofType(first.events, 'mistake')).toEqual([{ type: 'mistake', weight: 1, detail: 'murky' }]);
    expect((first.state as CipherRoomState).costedMistakes).toBe(1);

    const again = cipherAdapter.reduce(cipherFixture, first.state, { type: 'develop' });
    expect(ofType(again.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0, detail: 'murky' }]);
    expect((again.state as CipherRoomState).costedMistakes).toBe(1);
    expect((again.state as CipherRoomState).lastFeedback)
      .toMatchObject({ kind: 'murky', correct: 5, total: 6, charged: false });
  });

  it('a murky develop is a claim: weight 1, information kept, perfect forfeited', () => {
    let s = cipherAdapter.start(cipherFixture, ctx(1)) as CipherRoomState;
    for (const [c, p] of [['I', 'H'], ['F', 'E'], ['D', 'C'], ['B', 'A'], ['T', 'Z']] as const) {
      s = cipherAdapter.reduce(cipherFixture, s, { type: 'pencil', cipherLetter: c, plain: p }).state as CipherRoomState;
    }
    const { state, events, outcome } = cipherAdapter.reduce(cipherFixture, s, { type: 'develop' });
    expect(ofType(events, 'mistake')).toEqual([{ type: 'mistake', weight: 1, detail: 'murky' }]);
    expect((state as CipherRoomState).lastFeedback).toMatchObject({ kind: 'murky', correct: 5, total: 6 });
    expect(outcome).toMatchObject({ status: 'active', perfect: false });
  });

  it('a clean develop solves perfect; reveals forfeit it', () => {
    let s = cipherAdapter.start(cipherFixture, ctx(1)) as CipherRoomState;
    for (const [c, p] of [['I', 'H'], ['F', 'E'], ['D', 'C'], ['B', 'A'], ['T', 'S']] as const) {
      s = cipherAdapter.reduce(cipherFixture, s, { type: 'pencil', cipherLetter: c, plain: p }).state as CipherRoomState;
    }
    const done = cipherAdapter.reduce(cipherFixture, s, { type: 'develop' });
    expect(done.outcome).toEqual({ status: 'solved', perfect: true });
    expect(ofType(done.events, 'solved')).toEqual([{ type: 'solved', perfect: true }]);

    const s2 = cipherAdapter.start(cipherFixture, ctx(1));
    const revealed = cipherAdapter.reduce(cipherFixture, s2, { type: 'reveal-letter' });
    expect(revealed.events).toContainEqual({ type: 'hint', weight: 1 });
    expect(revealed.outcome.perfect).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shipped content pool — replay the generator's honesty guarantees
// ---------------------------------------------------------------------------

describe('shipped pools', () => {
  it('cipher: every puzzle round-trips, is deranged, and has a workable alphabet', () => {
    expect(CIPHER_POOL.length).toBeGreaterThanOrEqual(60);
    for (const p of CIPHER_POOL) {
      const truth = decodeMap(p);
      const decoded = [...p.ciphertext].map((ch) => truth[ch] ?? ch).join('');
      expect(decoded, p.id).toBe(p.plaintext);
      for (const [c, plain] of Object.entries(truth)) expect(c, p.id).not.toBe(plain);
      const plains = Object.values(truth);
      expect(new Set(plains).size, p.id).toBe(plains.length);
      expect(cipherLettersOf(p).length, p.id).toBeGreaterThanOrEqual(9);
      const distinct = cipherLettersOf(p);
      for (const r of p.reveals) expect(distinct, p.id).toContain(r);
    }
  });

  /**
   * ROUND 5 LAYOUT GUARD — "the tray must fit the glass".
   *
   * Shots 32/33 showed the final rank of cipher cells sliced in half by the
   * sticky `.room-deck` on a 33-letter phrase, and the pool runs to 41 letters
   * / 48 characters. A cryptogram is attacked by word shape and letter
   * frequency across the WHOLE phrase, so a hidden last word removes the
   * primary solving channel — and the occlusion was worst at tier 3, the long,
   * no-crib tier.
   *
   * This is a MODEL of the shipped geometry (ui/rooms/micro/micro.css +
   * room-host.css) at the smallest supported glass, 375x667. It is not a
   * browser measurement — scripts/round5-capture.mjs asserts the real bounding
   * boxes — but it is deterministic, it runs on every commit, and it makes a
   * CONTENT edit (a longer phrase) fail here rather than in her evening.
   */
  describe('the developing tray fits the glass (375x667)', () => {
    // --- the shipped CSS, transcribed -------------------------------------
    const VW = 375;
    const VH = 667;
    const CHROME = 50;            // tokens.css --chrome-h at max-height:700
    const FOOTER = 55;            // .room-host__footer: 44px btn + 0.65rem pad
    const MIC_PAD_X = 0.9 * 16;   // .mic padding-inline
    const MIC_PAD_TOP = 0.4 * 16; // .mic padding-top at max-height:900
    const MIC_GAP = 0.45 * 16;    // .mic gap at max-height:900
    const HEAD = 0;               // .mic__head hidden at max-height:700
    const DECK_PAD_TOP = 0.3 * 16;
    const DECK_GAP = 0.35 * 16;   // .room-deck gap at max-height:700
    const STATUS = 2.2 * 16;      // .mic-toastslot at max-height:900
    const KEYS = 3 * 44 + 2 * 4;  // .mic-keys: QWERTY rows at max-height:700
    const VERBS = 44;             // .mic-row
    const PRINTS = 20;            // .dk-prints — one compact line, worst case
    const SHEET_PAD_Y = 2 * 0.5 * 16;   // .dk-sheet padding at max-height:900
    const SHEET_PAD_X = 2 * 0.4 * 16;
    const WORD_GAP = 0.5 * 16;    // .dk-sheet column gap (dense, max-height:700)
    const LETTER_GAP = 6;         // .dk-word gap
    const clamp = (lo: number, v: number, hi: number) => Math.min(hi, Math.max(lo, v));

    const deck = DECK_PAD_TOP + STATUS + DECK_GAP + KEYS + DECK_GAP + VERBS;
    const stage = VH - CHROME - FOOTER;
    // Worst case: the head gone, the prints line present, three .mic gaps.
    const sheetBudget = stage - MIC_PAD_TOP - HEAD - 3 * MIC_GAP - PRINTS - deck;
    const sheetInner = VW - MIC_PAD_X - SHEET_PAD_X;

    /** Rows the flex-wrap tray takes for one phrase, at one cell width. */
    const rowsFor = (ciphertext: string, cellW: number) => {
      const widths = ciphertext.split(' ')
        .map((w) => [...w].filter((c) => /[A-Z]/i.test(c)).length)
        .filter((n) => n > 0)
        .map((n) => n * cellW + (n - 1) * LETTER_GAP);
      let rows = 1;
      let used = -1;
      for (const w of widths) {
        const next = used < 0 ? w : used + WORD_GAP + w;
        if (used >= 0 && next > sheetInner) { rows++; used = w; } else { used = next; }
      }
      return rows;
    };

    it('every shipped phrase clears the sticky deck at its shipped density', () => {
      expect(sheetBudget).toBeGreaterThan(0);
      for (const p of CIPHER_POOL) {
        const glyphs = [...p.ciphertext].filter((c) => /[A-Z]/i.test(c)).length;
        // CipherView adds `--dense` above 30 glyphs; micro.css sizes both.
        const dense = glyphs > 30;
        const cellW = dense ? clamp(24, 0.07 * VW, 32) : clamp(26, 0.08 * VW, 38);
        const cellH = dense ? clamp(30, 0.046 * VH, 42) : clamp(38, 0.056 * VH, 52);
        const rowGap = (dense ? 0.3 : 0.4) * 16;
        const rows = rowsFor(p.ciphertext, cellW);
        const height = rows * cellH + (rows - 1) * rowGap + SHEET_PAD_Y;
        expect(height, `${p.id} (${glyphs} glyphs, ${rows} rows) overruns the deck`)
          .toBeLessThanOrEqual(sheetBudget);
      }
    });
  });

  it('tier coverage: all three manor tiers shipped', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(CIPHER_POOL.filter((p) => (p.tier ?? 1) === tier).length, `tier ${tier}`)
        .toBeGreaterThanOrEqual(10);
    }
  });

  /**
   * Round 4 (owner: "longer phrases, no-crib tier 3"). The Darkroom's tiers are
   * defined by the CRIB the phrase hands you, and length climbs with the row.
   */
  describe('tier escalation (the crib rule)', () => {
    const at = (tier: 1 | 2 | 3) => CIPHER_POOL.filter((p) => (p.tier ?? 1) === tier);
    const shortestWord = (p: { plaintext: string }) =>
      Math.min(...p.plaintext.split(' ').map((w) => w.length));
    const letters = (p: { plaintext: string }) => p.plaintext.replace(/[^A-Z]/g, '').length;

    it('tier 1 always hands over a one-letter crib word plus three reveals', () => {
      for (const p of at(1)) {
        expect(shortestWord(p), p.id).toBe(1);
        expect(p.reveals.length, p.id).toBe(3);
      }
    });

    it('tier 2 has no one-letter word and exactly one revealed letter', () => {
      for (const p of at(2)) {
        expect(shortestWord(p), p.id).toBeGreaterThanOrEqual(2);
        expect(p.reveals.length, p.id).toBe(1);
      }
    });

    /**
     * ROUND 24 (REVEALS 0 → 2). Tier 3 still hands over no crib WORD — every
     * word is 3+ letters — but it now reveals two mid-frequency letters. The
     * no-reveal rule was leaning on a crib the generator never declared: 44%
     * of the pool was a stock proverb, and a proverb is recognisable, which is
     * the biggest crib a cryptogram has. With the proverbs cut (REVIEW_AA 5.9)
     * a 26–41 letter phrase over 13+ symbols with nothing revealed sits below
     * the frequency-analysis floor, so the two letters replace what
     * recognition used to do. It is still the hardest tier by a distance.
     */
    it('tier 3 has no crib WORD, a two-letter crib, and is long and wide', () => {
      for (const p of at(3)) {
        expect(shortestWord(p), p.id).toBeGreaterThanOrEqual(3);
        expect(p.reveals.length, p.id).toBe(2);
        expect(letters(p), p.id).toBeGreaterThanOrEqual(26);
        expect(cipherLettersOf(p).length, p.id).toBeGreaterThanOrEqual(13);
      }
    });

    it('phrases get longer as the row climbs', () => {
      const mean = (tier: 1 | 2 | 3) => {
        const arr = at(tier);
        return arr.reduce((a, p) => a + letters(p), 0) / arr.length;
      };
      expect(mean(3)).toBeGreaterThan(mean(2));
      expect(mean(3)).toBeGreaterThan(mean(1));
    });
  });
});
