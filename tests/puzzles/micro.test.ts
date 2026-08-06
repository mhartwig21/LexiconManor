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
  difficulty: 'easy',
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

  it('cipher: tier 1 draws from the medium/easy band', () => {
    for (const seed of [1, 7, 99, 1234]) {
      const p = cipherAdapter.select({ tier: 1, seed, seenIds: [] }) as { difficulty: string };
      expect(['medium', 'easy']).toContain(p.difficulty);
    }
  });

  it('cipher: tier 3 draws from the expert/hard band', () => {
    for (const seed of [1, 7, 99, 1234]) {
      const p = cipherAdapter.select({ tier: 3, seed, seenIds: [] }) as { difficulty: string };
      expect(['expert', 'hard']).toContain(p.difficulty);
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

  it('a murky develop is a claim: weight 1, information kept, perfect forfeited', () => {
    let s = cipherAdapter.start(cipherFixture, ctx(1)) as CipherRoomState;
    for (const [c, p] of [['I', 'H'], ['F', 'E'], ['D', 'C'], ['B', 'A'], ['T', 'Z']] as const) {
      s = cipherAdapter.reduce(cipherFixture, s, { type: 'pencil', cipherLetter: c, plain: p }).state as CipherRoomState;
    }
    const { state, events, outcome } = cipherAdapter.reduce(cipherFixture, s, { type: 'develop' });
    expect(ofType(events, 'mistake')).toEqual([{ type: 'mistake', weight: 1 }]);
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

    it('tier 3 is the no-crib tier: no short words, no reveals, long and wide', () => {
      for (const p of at(3)) {
        expect(shortestWord(p), p.id).toBeGreaterThanOrEqual(3);
        expect(p.reveals.length, p.id).toBe(0);
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
