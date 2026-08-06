import { describe, expect, it } from 'vitest';
import type { RoomContext, RoomEvent } from '../../src/engine/rooms/room-puzzle';
import { getRoomAdapter } from '../../src/engine/rooms/registry';

import {
  signatureOf, startAnagram, submitAnagram, revealAnagramLetter,
  type AnagramPuzzle,
} from '../../src/engine/puzzles/anagram';
import {
  anagramAdapter, ANAGRAM_POOL, type AnagramRoomState,
} from '../../src/engine/puzzles/anagram-adapter';

import {
  oneLetterApart, startLadder, submitLadderRung, stepBack, shortestLadderPath,
  type LadderPuzzle,
} from '../../src/engine/puzzles/ladder';
import {
  ladderAdapter, LADDER_POOL, LADDER_SOLUTION_WORDS, LADDER_WORDS, type LadderRoomState,
} from '../../src/engine/puzzles/ladder-adapter';

import {
  decodeMap, cipherLettersOf, startCipher, assignCipher, developCipher, revealCipherLetter,
  type CipherPuzzle,
} from '../../src/engine/puzzles/cipher';
import {
  cipherAdapter, CIPHER_POOL, type CipherRoomState,
} from '../../src/engine/puzzles/cipher-adapter';

/**
 * A4 — the three batch-1 micro rooms behind the RoomPuzzle contract.
 * Mistake-weight mappings are review checkpoints against AAA §0.3:
 *  - Vestibule: a submitted arrangement is a claim (weight 1); malformed free.
 *  - Staircase: a traced rung is a probe — every refusal weight 0.
 *  - Darkroom: penciling free; a full develop is a claim (weight 1) that
 *    always reports how many letters ring true.
 * Hints are always `hint` events (never mistakes) and forfeit perfect.
 */

const ctx = (tier: 1 | 2 | 3): RoomContext => ({ tier, seed: 42, volumeId: 'volume-1' });

const ofType = (events: RoomEvent[], type: RoomEvent['type']) => events.filter((e) => e.type === type);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const anagramFixture: AnagramPuzzle = {
  id: 'anagram-fixture',
  difficulty: 'medium',
  rounds: [
    { scramble: ['T', 'P', 'O', 'S'], accepted: ['OPTS', 'POST', 'POTS', 'SPOT', 'STOP', 'TOPS'], answer: 'STOP' },
    { scramble: ['R', 'A', 'E', 'H', 'T'], accepted: ['EARTH', 'HATER', 'HEART'], answer: 'HEART' },
  ],
};

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
  it('registers the three micro adapters with the right kind and size', () => {
    for (const kind of ['anagram', 'cipher', 'ladder'] as const) {
      const adapter = getRoomAdapter(kind);
      expect(adapter, kind).toBeDefined();
      expect(adapter!.kind).toBe(kind);
      expect(adapter!.size).toBe('micro');
    }
  });
});

// ---------------------------------------------------------------------------
// Seeded, seen-aware, tier-banded selection (shared shape across all three)
// ---------------------------------------------------------------------------

describe('select()', () => {
  const cases = [
    { name: 'anagram', adapter: anagramAdapter, pool: ANAGRAM_POOL },
    { name: 'cipher', adapter: cipherAdapter, pool: CIPHER_POOL },
    { name: 'ladder', adapter: ladderAdapter, pool: LADDER_POOL },
  ] as const;

  for (const { name, adapter, pool } of cases) {
    it(`${name}: deterministic for a given seed`, () => {
      const a = adapter.select({ tier: 2, seed: 123, seenIds: [] });
      const b = adapter.select({ tier: 2, seed: 123, seenIds: [] });
      expect(adapter.puzzleId(a as never)).toBe(adapter.puzzleId(b as never));
    });

    it(`${name}: tier 1 draws from the medium/easy band`, () => {
      for (const seed of [1, 7, 99, 1234]) {
        const p = adapter.select({ tier: 1, seed, seenIds: [] }) as { difficulty: string };
        expect(['medium', 'easy']).toContain(p.difficulty);
      }
    });

    it(`${name}: tier 3 draws from the expert/hard band`, () => {
      for (const seed of [1, 7, 99, 1234]) {
        const p = adapter.select({ tier: 3, seed, seenIds: [] }) as { difficulty: string };
        expect(['expert', 'hard']).toContain(p.difficulty);
      }
    });

    it(`${name}: avoids seen puzzles, degrades gracefully when all seen`, () => {
      const first = adapter.select({ tier: 2, seed: 5, seenIds: [] });
      const firstId = adapter.puzzleId(first as never);
      const second = adapter.select({ tier: 2, seed: 5, seenIds: [firstId] });
      expect(adapter.puzzleId(second as never)).not.toBe(firstId);
      // All seen → still returns a playable puzzle (repeat fallback).
      const all = pool.map((p: { id: string }) => p.id);
      const fallback = adapter.select({ tier: 2, seed: 5, seenIds: all });
      expect(adapter.puzzleId(fallback as never)).toBeTruthy();
    });
  }
});

// ---------------------------------------------------------------------------
// Anagram — engine
// ---------------------------------------------------------------------------

describe('anagram engine', () => {
  it('signatureOf is order-insensitive and uppercases', () => {
    expect(signatureOf('stop')).toBe(signatureOf(['P', 'O', 'T', 'S']));
  });

  it('accepts any word in the anagram class, not just the seed answer', () => {
    const s = startAnagram(anagramFixture);
    const { state, result } = submitAnagram(anagramFixture, s, 'spot');
    expect(result.kind).toBe('valid');
    expect(state.round).toBe(1);
    expect(state.solvedWords).toEqual(['SPOT']);
    expect(state.status).toBe('playing');
  });

  it('walks rounds and wins on the last', () => {
    let s = startAnagram(anagramFixture);
    s = submitAnagram(anagramFixture, s, 'STOP').state;
    const { state, result } = submitAnagram(anagramFixture, s, 'HEART');
    expect(result).toMatchObject({ kind: 'valid', won: true });
    expect(state.status).toBe('won');
    expect(state.solvedWords).toEqual(['STOP', 'HEART']);
  });

  it('rejects wrong letters as malformed and remembers wrong claims', () => {
    const s = startAnagram(anagramFixture);
    expect(submitAnagram(anagramFixture, s, 'STAB').result).toMatchObject({ kind: 'invalid', reason: 'wrong-letters' });
    const claim = submitAnagram(anagramFixture, s, 'TSOP');
    expect(claim.result).toMatchObject({ kind: 'invalid', reason: 'not-a-word' });
    expect(claim.state.triedWrong).toContain('TSOP');
    const repeat = submitAnagram(anagramFixture, claim.state, 'TSOP');
    expect(repeat.result).toMatchObject({ kind: 'invalid', reason: 'already-tried' });
  });

  it('reveal never gives away the final letter', () => {
    let s = startAnagram(anagramFixture);
    const letters: (string | null)[] = [];
    for (let i = 0; i < 6; i++) {
      const r = revealAnagramLetter(anagramFixture, s);
      s = r.state;
      letters.push(r.letter);
    }
    // STOP: reveals S, T, O then refuses (last letter is the player's).
    expect(letters).toEqual(['S', 'T', 'O', null, null, null]);
    expect(s.revealedCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Anagram — adapter economy
// ---------------------------------------------------------------------------

describe('anagram adapter', () => {
  it('a non-word arrangement is a free probe: weight 0, perfect kept (R.1)', () => {
    // In a single-answer anagram nearly every wrong arrangement IS a
    // non-word — taxing it would tax the room's only exploration verb.
    const s0 = anagramAdapter.start(anagramFixture, ctx(1));
    const { state, events, outcome } = anagramAdapter.reduce(anagramFixture, s0, { type: 'submit', word: 'TSOP' });
    expect(ofType(events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    expect(outcome).toMatchObject({ status: 'active', perfect: true });
    expect((state as AnagramRoomState).costedMistakes).toBe(0);
  });

  it('malformed input is free (weight 0)', () => {
    const s0 = anagramAdapter.start(anagramFixture, ctx(1));
    const { events, outcome } = anagramAdapter.reduce(anagramFixture, s0, { type: 'submit', word: 'ZZZZ' });
    expect(ofType(events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    expect(outcome.perfect).toBe(true);
  });

  it('hints price through hint events and forfeit perfect', () => {
    const s0 = anagramAdapter.start(anagramFixture, ctx(1));
    const { state, events } = anagramAdapter.reduce(anagramFixture, s0, { type: 'reveal-letter' });
    expect(events).toContainEqual({ type: 'hint', weight: 1 });
    let s = state as AnagramRoomState;
    expect(s.hintsBought).toBe(1);
    s = anagramAdapter.reduce(anagramFixture, s, { type: 'submit', word: 'STOP' }).state as AnagramRoomState;
    const fin = anagramAdapter.reduce(anagramFixture, s, { type: 'submit', word: 'HEART' });
    expect(fin.outcome).toEqual({ status: 'solved', perfect: false });
  });

  it('a clean solve is perfect and emits progress per round + solved', () => {
    const s0 = anagramAdapter.start(anagramFixture, ctx(1));
    const r1 = anagramAdapter.reduce(anagramFixture, s0, { type: 'submit', word: 'POST' });
    expect(ofType(r1.events, 'progress')).toHaveLength(1);
    const r2 = anagramAdapter.reduce(anagramFixture, r1.state, { type: 'submit', word: 'EARTH' });
    expect(ofType(r2.events, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
    expect(r2.outcome).toEqual({ status: 'solved', perfect: true });
  });

  it('exhausted reveals are a no-op (no double-charge)', () => {
    let s = anagramAdapter.start(anagramFixture, ctx(1)) as AnagramRoomState;
    for (let i = 0; i < 3; i++) {
      s = anagramAdapter.reduce(anagramFixture, s, { type: 'reveal-letter' }).state as AnagramRoomState;
    }
    const { events, state } = anagramAdapter.reduce(anagramFixture, s, { type: 'reveal-letter' });
    expect(events).toHaveLength(0);
    expect((state as AnagramRoomState).hintsBought).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Ladder — engine
// ---------------------------------------------------------------------------

describe('ladder engine', () => {
  it('oneLetterApart', () => {
    expect(oneLetterApart('COLD', 'CORD')).toBe(true);
    expect(oneLetterApart('COLD', 'COLD')).toBe(false);
    expect(oneLetterApart('COLD', 'CORN')).toBe(false);
    expect(oneLetterApart('COLD', 'COLDS')).toBe(false);
  });

  it('shortestLadderPath finds an optimal climb over a toy lexicon', () => {
    const words = new Set(['COLD', 'CORD', 'CARD', 'WARD', 'WARM', 'CORM']);
    const path = shortestLadderPath('COLD', 'WARM', words);
    expect(path).not.toBeNull();
    expect(path![0]).toBe('COLD');
    expect(path![path!.length - 1]).toBe('WARM');
    for (let i = 1; i < path!.length; i++) {
      expect(oneLetterApart(path![i - 1]!, path![i]!)).toBe(true);
    }
    expect(path!.length).toBe(5); // COLD CORD CARD WARD WARM (or via CORM, same length)
  });

  it('rungs validate length, adjacency, novelty, and dictionary', () => {
    const puzzle: LadderPuzzle = {
      id: 'ladder-fixture', difficulty: 'easy', start: 'COLD', target: 'WARM', par: 4,
      solution: ['COLD', 'CORD', 'CARD', 'WARD', 'WARM'],
    };
    const isWord = (w: string) => ['CORD', 'CARD', 'WARD'].includes(w);
    let s = startLadder(puzzle);
    expect(submitLadderRung(puzzle, s, 'COLDS', isWord).result).toMatchObject({ reason: 'wrong-length' });
    expect(submitLadderRung(puzzle, s, 'CARD', isWord).result).toMatchObject({ reason: 'not-one-step' });
    expect(submitLadderRung(puzzle, s, 'COLD', isWord).result).toMatchObject({ reason: 'not-one-step' });
    expect(submitLadderRung(puzzle, s, 'CORD', isWord).result).toMatchObject({ kind: 'valid', steps: 1 });
    s = submitLadderRung(puzzle, s, 'CORD', isWord).state;
    expect(submitLadderRung(puzzle, s, 'COLD', isWord).result).toMatchObject({ reason: 'already-used' });
    expect(submitLadderRung(puzzle, s, 'WORD', isWord).result).toMatchObject({ reason: 'not-a-word' });
    s = stepBack(s);
    expect(s.rungs).toEqual(['COLD']);
    s = stepBack(s); // never below the start
    expect(s.rungs).toEqual(['COLD']);
  });
});

// ---------------------------------------------------------------------------
// Ladder — adapter economy (against the SHIPPED lexicon: probes are honest)
// ---------------------------------------------------------------------------

describe('ladder adapter', () => {
  const puzzle = LADDER_POOL.find((p) => p.difficulty === 'easy')!;

  /** A one-letter variant of the start that is NOT a shipped word (a refused probe). */
  function gibberishNeighbor(word: string): string {
    for (const ch of 'QXZJVK') {
      for (let i = 0; i < word.length; i++) {
        const cand = word.slice(0, i) + ch + word.slice(i + 1);
        if (cand !== word && !LADDER_WORDS.has(cand) && cand !== puzzle.target) return cand;
      }
    }
    throw new Error('no gibberish neighbor found');
  }

  it('climbing the shipped solution solves at par, perfect, with progress per rung', () => {
    let s = ladderAdapter.start(puzzle, ctx(1)) as LadderRoomState;
    for (let i = 1; i < puzzle.solution.length; i++) {
      const r = ladderAdapter.reduce(puzzle, s, { type: 'step', word: puzzle.solution[i]! });
      expect(ofType(r.events, 'progress')).toHaveLength(1);
      s = r.state as LadderRoomState;
      if (i < puzzle.solution.length - 1) {
        expect(r.outcome.status).toBe('active');
      } else {
        expect(r.outcome).toEqual({ status: 'solved', perfect: true });
        expect(ofType(r.events, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
      }
    }
  });

  it('a refused probe costs nothing and is remembered', () => {
    const s0 = ladderAdapter.start(puzzle, ctx(1));
    const probe = gibberishNeighbor(puzzle.start);
    const { state, events, outcome } = ladderAdapter.reduce(puzzle, s0, { type: 'step', word: probe });
    expect(ofType(events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    expect(outcome.perfect).toBe(true);
    expect((state as LadderRoomState).missedWords).toContain(probe);
  });

  it('buying a stone is a hint (weight 1), marks the rung, forfeits perfect', () => {
    const s0 = ladderAdapter.start(puzzle, ctx(1));
    const { state, events } = ladderAdapter.reduce(puzzle, s0, { type: 'buy-stone' });
    expect(events).toContainEqual({ type: 'hint', weight: 1 });
    const s = state as LadderRoomState;
    expect(s.engine.rungs).toHaveLength(2);
    expect(s.engine.rungs[1]).toBe(puzzle.solution[1]); // BFS-optimal from the start
    expect(s.boughtRungs).toEqual([1]);
    expect(s.hintsBought).toBe(1);
  });

  it('stepping back is free and un-marks a bought rung', () => {
    const s0 = ladderAdapter.start(puzzle, ctx(1));
    const bought = ladderAdapter.reduce(puzzle, s0, { type: 'buy-stone' }).state as LadderRoomState;
    const { state, events } = ladderAdapter.reduce(puzzle, bought, { type: 'step-back' });
    expect(events).toHaveLength(0);
    const s = state as LadderRoomState;
    expect(s.engine.rungs).toEqual([puzzle.start]);
    expect(s.boughtRungs).toEqual([]);
  });

  it('finishing over par solves but is not perfect', () => {
    // Same board, par tightened by one below the shipped optimum — the climb
    // lands one over "par", exercising the at-par gate for perfect.
    const tightened: LadderPuzzle = { ...puzzle, par: puzzle.par - 1 };
    let s = ladderAdapter.start(tightened, ctx(1)) as LadderRoomState;
    let last: ReturnType<typeof ladderAdapter.reduce> | null = null;
    for (let i = 1; i < tightened.solution.length; i++) {
      last = ladderAdapter.reduce(tightened, s, { type: 'step', word: tightened.solution[i]! });
      s = last.state as LadderRoomState;
    }
    expect(last!.outcome).toEqual({ status: 'solved', perfect: false });
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
// Shipped content pools — replay the generators' honesty guarantees
// ---------------------------------------------------------------------------

describe('shipped pools', () => {
  it('anagram: every round is honest (class-complete letters, unspoiled scramble)', () => {
    expect(ANAGRAM_POOL.length).toBeGreaterThanOrEqual(200);
    for (const p of ANAGRAM_POOL) {
      expect(p.rounds.length).toBeGreaterThanOrEqual(1);
      expect(p.rounds.length).toBeLessThanOrEqual(3);
      for (const r of p.rounds) {
        const sig = signatureOf(r.scramble);
        expect(r.accepted, p.id).toContain(r.answer);
        for (const w of r.accepted) expect(signatureOf(w), p.id).toBe(sig);
        expect(r.accepted, p.id).not.toContain(r.scramble.join(''));
      }
    }
  });

  it('ladder: every shipped solution is a legal climb through the shipped lexicon', () => {
    expect(LADDER_POOL.length).toBeGreaterThanOrEqual(200);
    expect(LADDER_WORDS.size).toBeGreaterThan(1000);
    for (const p of LADDER_POOL) {
      expect(p.solution[0], p.id).toBe(p.start);
      expect(p.solution[p.solution.length - 1], p.id).toBe(p.target);
      expect(p.solution.length, p.id).toBe(p.par + 1);
      for (let i = 1; i < p.solution.length; i++) {
        expect(oneLetterApart(p.solution[i - 1]!, p.solution[i]!), p.id).toBe(true);
        // Every rung — including what "Next stone" can sell — is a
        // frequency-floored COMMON word (Koster-fairness, BENCHMARKS §2),
        // and the probe dictionary accepts all of them.
        expect(LADDER_SOLUTION_WORDS.has(p.solution[i]!), p.id).toBe(true);
        expect(LADDER_WORDS.has(p.solution[i]!), p.id).toBe(true);
      }
      expect(LADDER_SOLUTION_WORDS.has(p.start), p.id).toBe(true);
      expect(LADDER_SOLUTION_WORDS.has(p.target), p.id).toBe(true);
    }
  });

  it('ladder: par is optimal over the climbing lexicon (sampled BFS re-verification)', () => {
    // Par is defined over the curated climbing lexicon — that is the claim
    // "perfect climb" grades against. Probes through the wider dictionary
    // may legitimately beat it; the adapter treats at-or-under par as perfect.
    const sample = [0, 59, 60, 119, 120, 179, 180, 239].map((i) => LADDER_POOL[i]).filter(Boolean);
    for (const p of sample) {
      const best = shortestLadderPath(p!.start, p!.target, LADDER_SOLUTION_WORDS);
      expect(best, p!.id).not.toBeNull();
      expect(best!.length - 1, p!.id).toBe(p!.par);
    }
  });

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

  it('difficulty coverage: all four bands shipped for each game', () => {
    for (const pool of [ANAGRAM_POOL, CIPHER_POOL, LADDER_POOL] as { difficulty: string }[][]) {
      const bands = new Set(pool.map((p) => p.difficulty));
      for (const d of ['easy', 'medium', 'hard', 'expert']) expect(bands).toContain(d);
    }
  });
});
