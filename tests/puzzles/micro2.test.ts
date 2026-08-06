import { describe, expect, it } from 'vitest';
import type { RoomContext, RoomEvent } from '../../src/engine/rooms/room-puzzle';
import { getRoomAdapter, registeredRoomKinds } from '../../src/engine/rooms/registry';
import {
  checkCrossword, entryCells, isGridFull, openCells, setCrosswordCell, solutionLetters,
  startCrossword, validateCrosswordPuzzle, type CrosswordPuzzle,
} from '../../src/engine/puzzles/crossword';
import { crosswordAdapter, CROSSWORD_POOL, type CrosswordRoomState } from '../../src/engine/puzzles/crossword-adapter';
import {
  humRhymeHint, startRhyme, submitRhyme, type RhymePuzzle,
} from '../../src/engine/puzzles/rhyme';
import { rhymeAdapter, RHYME_POOL, type RhymeRoomState } from '../../src/engine/puzzles/rhyme-adapter';
import {
  startCategory, submitCategory, tickCategory, underPar, type CategoryPuzzle,
} from '../../src/engine/puzzles/category';
import { categoryAdapter, CATEGORY_POOL, type CategoryRoomState } from '../../src/engine/puzzles/category-adapter';
import { rhymeKeyOfPron } from '../../content/lib/phonetics';

/**
 * A5 — micro batch 2 (Linen Closet crossword, Music Room rhyme chain,
 * Pantry category sprint) behind the RoomPuzzle contract. Mistake-weight
 * mappings are review checkpoints against AAA §0.3: generative rooms'
 * misses are free; only pre-warned traps/claims cost; hints price through
 * the `hint` event and forfeit perfect.
 */

const ctx = (tier: 1 | 2 | 3): RoomContext => ({ tier, seed: 7, volumeId: 'volume-1' });

const eventsOfType = (events: RoomEvent[], type: RoomEvent['type']) =>
  events.filter((e) => e.type === type);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const cwPuzzle: CrosswordPuzzle = {
  id: 'cw-fixture',
  difficulty: 'easy',
  size: 5,
  entries: [
    { id: '1D', dir: 'down', row: 1, col: 3, answer: 'BED', clue: 'Where the day ends' },
    { id: '2A', dir: 'across', row: 2, col: 0, answer: 'CAKE', clue: 'Celebration slice' },
    { id: '2D', dir: 'down', row: 2, col: 0, answer: 'CAT', clue: 'Dewey, for one' },
  ],
};

const rhymePuzzle: RhymePuzzle = {
  id: 'rhyme-fixture',
  difficulty: 'easy',
  rounds: [
    {
      prompt: 'DOUGH',
      accepted: ['GLOW', 'SNOW', 'FLOW', 'BELOW'],
      decoys: ['COUGH', 'TOUGH'],
      homophones: ['DOE'],
      near: ['MELLOW'],
      target: 2,
    },
    {
      prompt: 'DAY',
      accepted: ['MAY', 'SAY', 'WAY'],
      decoys: [],
      homophones: [],
      near: [],
      target: 2,
    },
  ],
};

const catPuzzle: CategoryPuzzle = {
  id: 'cat-fixture',
  difficulty: 'easy',
  label: 'Herbs on the rack',
  accepted: [
    { word: 'BASIL', lemma: 'BASIL' },
    { word: 'THYME', lemma: 'THYME' },
    { word: 'SAGE', lemma: 'SAGE' },
    { word: 'SAGES', lemma: 'SAGE' },
    { word: 'MINT', lemma: 'MINT' },
    { word: 'MINTS', lemma: 'MINT' },
    { word: 'DILL', lemma: 'DILL' },
  ],
  traps: [{ word: 'GINGER', note: 'A root, and it knows it.' }],
  target: 3,
  parTicks: 4,
  maxCostedTicks: 2,
};

// ---------------------------------------------------------------------------
// Registry wiring
// ---------------------------------------------------------------------------

describe('registry (A5)', () => {
  it('registers category, crossword, rhyme as micro rooms', () => {
    for (const kind of ['category', 'crossword', 'rhyme'] as const) {
      const adapter = getRoomAdapter(kind);
      expect(adapter, kind).toBeDefined();
      expect(adapter!.kind).toBe(kind);
      expect(adapter!.size).toBe('micro');
    }
    expect(registeredRoomKinds()).toEqual(
      expect.arrayContaining(['category', 'crossword', 'rhyme']),
    );
  });
});

// ---------------------------------------------------------------------------
// Seeded, seen-aware selection (shared select contract)
// ---------------------------------------------------------------------------

describe('selection', () => {
  const cases = [
    { name: 'crossword', adapter: crosswordAdapter, pool: CROSSWORD_POOL },
    { name: 'rhyme', adapter: rhymeAdapter, pool: RHYME_POOL },
    { name: 'category', adapter: categoryAdapter, pool: CATEGORY_POOL },
  ] as const;

  for (const { name, adapter, pool } of cases) {
    it(`${name}: deterministic by seed`, () => {
      const a = adapter.select({ tier: 2, seed: 123, seenIds: [] });
      const b = adapter.select({ tier: 2, seed: 123, seenIds: [] });
      expect(adapter.puzzleId(a as never)).toBe(adapter.puzzleId(b as never));
    });

    it(`${name}: avoids seen puzzles while fresh ones remain`, () => {
      const first = adapter.select({ tier: 1, seed: 5, seenIds: [] });
      const firstId = adapter.puzzleId(first as never);
      const second = adapter.select({ tier: 1, seed: 5, seenIds: [firstId] });
      expect(adapter.puzzleId(second as never)).not.toBe(firstId);
    });

    it(`${name}: falls back gracefully when everything is seen`, () => {
      const all = pool.map((p: { id: string }) => p.id);
      const picked = adapter.select({ tier: 3, seed: 9, seenIds: all });
      expect(all).toContain(adapter.puzzleId(picked as never));
    });
  }
});

// ---------------------------------------------------------------------------
// Crossword — pool honesty + engine + adapter economy
// ---------------------------------------------------------------------------

describe('crossword pool', () => {
  it('ships puzzles for every difficulty', () => {
    for (const d of ['easy', 'medium', 'hard', 'expert'] as const) {
      expect(CROSSWORD_POOL.filter((p) => p.difficulty === d).length).toBeGreaterThanOrEqual(10);
    }
  });

  it('every shipped puzzle passes the structural solver (runs, crossings, connectivity)', () => {
    for (const p of CROSSWORD_POOL) {
      expect(validateCrosswordPuzzle(p), p.id).toEqual([]);
    }
  });
});

describe('crossword engine', () => {
  it('letters are free probes; editing lifts a wrong mark', () => {
    let s = startCrossword(cwPuzzle);
    s = setCrosswordCell(cwPuzzle, s, 10, 'X');
    expect(s.letters[10]).toBe('X');
    s = { ...s, wrongCells: [10] };
    s = setCrosswordCell(cwPuzzle, s, 10, 'C');
    expect(s.wrongCells).toEqual([]);
  });

  it('check solves a correct grid and never rejects the truth', () => {
    let s = startCrossword(cwPuzzle);
    for (const [cell, ch] of solutionLetters(cwPuzzle)) s = setCrosswordCell(cwPuzzle, s, cell, ch);
    expect(isGridFull(cwPuzzle, s)).toBe(true);
    const { state, result } = checkCrossword(cwPuzzle, s);
    expect(result.kind).toBe('solved');
    expect(state.status).toBe('won');
  });

  it('fixture is itself structurally valid', () => {
    expect(validateCrosswordPuzzle(cwPuzzle)).toEqual([]);
  });
});

describe('crossword adapter economy', () => {
  const fillAll = (mut: (cell: number, ch: string) => void) => {
    for (const [cell, ch] of solutionLetters(cwPuzzle)) mut(cell, ch);
  };

  it('perfect solve: only free placements, then solved+perfect', () => {
    let s = crosswordAdapter.start(cwPuzzle, ctx(1));
    const all: RoomEvent[] = [];
    let outcome;
    fillAll((cell, ch) => {
      const r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: cell, letter: ch });
      s = r.state;
      all.push(...r.events);
      outcome = r.outcome;
    });
    expect(outcome).toEqual({ status: 'solved', perfect: true });
    expect(eventsOfType(all, 'solved')).toEqual([{ type: 'solved', perfect: true }]);
    expect(eventsOfType(all, 'mistake')).toEqual([]);
  });

  it('a wrong full grid costs weight 1; the identical re-fill is weight 0', () => {
    let s = crosswordAdapter.start(cwPuzzle, ctx(1));
    const sol = solutionLetters(cwPuzzle);
    const cells = openCells(cwPuzzle);
    const lastCell = cells[cells.length - 1]!;
    let charged: RoomEvent[] = [];
    for (const cell of cells) {
      const ch = cell === lastCell ? 'Z' : sol.get(cell)!;
      const r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: cell, letter: ch });
      s = r.state;
      charged.push(...r.events);
    }
    expect(eventsOfType(charged, 'mistake')).toEqual([{ type: 'mistake', weight: 1 }]);
    expect(s.cw.wrongCells).toEqual([lastCell]);

    // Clear and retype the same wrong letter: same claim, no second charge.
    let r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: lastCell, letter: null });
    s = r.state;
    r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: lastCell, letter: 'Z' });
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);

    // Fixing the letter solves it — but the costed check forfeited perfect.
    r = crosswordAdapter.reduce(cwPuzzle, r.state, { type: 'set-cell', index: lastCell, letter: sol.get(lastCell)! });
    expect(r.outcome).toEqual({ status: 'solved', perfect: false });
  });

  it('reveal prices as a hint, locks the cell, and forfeits perfect', () => {
    let s = crosswordAdapter.start(cwPuzzle, ctx(2));
    const r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'reveal-cell', index: 10 });
    expect(eventsOfType(r.events, 'hint')).toEqual([{ type: 'hint', weight: 1 }]);
    expect(r.state.cw.letters[10]).toBe('C');
    // Locked: typing over a revealed cell is ignored.
    const r2 = crosswordAdapter.reduce(cwPuzzle, r.state, { type: 'set-cell', index: 10, letter: 'X' });
    expect(r2.state.cw.letters[10]).toBe('C');
    expect(r.outcome.perfect).toBe(false);
  });

  it('a reveal that completes the grid resolves the room', () => {
    let s: CrosswordRoomState = crosswordAdapter.start(cwPuzzle, ctx(1));
    const sol = solutionLetters(cwPuzzle);
    const cells = openCells(cwPuzzle);
    const lastCell = cells[cells.length - 1]!;
    for (const cell of cells) {
      if (cell === lastCell) continue;
      s = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: cell, letter: sol.get(cell)! }).state;
    }
    const r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'reveal-cell', index: lastCell });
    expect(r.outcome.status).toBe('solved');
    expect(r.outcome.perfect).toBe(false); // the hint forfeited it
  });
});

// ---------------------------------------------------------------------------
// Rhyme — pool honesty + engine + adapter economy
// ---------------------------------------------------------------------------

describe('rhyme pool', () => {
  it('ships puzzles for every difficulty', () => {
    for (const d of ['easy', 'medium', 'hard', 'expert'] as const) {
      expect(RHYME_POOL.filter((p) => p.difficulty === d).length).toBeGreaterThanOrEqual(10);
    }
  });

  it('rounds are structurally honest (sets disjoint, target coverable)', () => {
    for (const p of RHYME_POOL) {
      for (const r of p.rounds) {
        expect(r.accepted.length, `${p.id} accepted`).toBeGreaterThan(r.target);
        expect(r.accepted, `${p.id} prompt`).not.toContain(r.prompt);
        for (const d of r.decoys) {
          expect(r.accepted, `${p.id} decoy ${d}`).not.toContain(d);
          expect(r.near, `${p.id} decoy/near ${d}`).not.toContain(d);
        }
        for (const n of r.near) expect(r.accepted, `${p.id} near ${n}`).not.toContain(n);
        for (const h of r.homophones) expect(r.accepted, `${p.id} homophone ${h}`).not.toContain(h);
      }
    }
  });
});

describe('rhyme engine + adapter economy', () => {
  it('chains rounds and solves on the final verse', () => {
    let s: RhymeRoomState = rhymeAdapter.start(rhymePuzzle, ctx(1));
    let r = rhymeAdapter.reduce(rhymePuzzle, s, { type: 'submit', word: 'glow' });
    expect(eventsOfType(r.events, 'progress')).toEqual([{ type: 'progress', detail: 'rhyme-found' }]);
    r = rhymeAdapter.reduce(rhymePuzzle, r.state, { type: 'submit', word: 'SNOW' });
    expect(r.state.rh.round).toBe(1); // verse complete → next prompt
    expect(r.outcome.status).toBe('active');
    r = rhymeAdapter.reduce(rhymePuzzle, r.state, { type: 'submit', word: 'may' });
    r = rhymeAdapter.reduce(rhymePuzzle, r.state, { type: 'submit', word: 'way' });
    expect(r.outcome).toEqual({ status: 'solved', perfect: true });
    expect(r.state.rh.foundRounds).toEqual([['GLOW', 'SNOW'], ['MAY', 'WAY']]);
  });

  it('the eye-rhyme decoy is the only costed miss; near/homophone/miss are free', () => {
    let s: RhymeRoomState = rhymeAdapter.start(rhymePuzzle, ctx(1));
    let r = rhymeAdapter.reduce(rhymePuzzle, s, { type: 'submit', word: 'cough' });
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 1 }]);
    r = rhymeAdapter.reduce(rhymePuzzle, r.state, { type: 'submit', word: 'mellow' });
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    r = rhymeAdapter.reduce(rhymePuzzle, r.state, { type: 'submit', word: 'doe' });
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    r = rhymeAdapter.reduce(rhymePuzzle, r.state, { type: 'submit', word: 'zzzz' });
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
    // A decoy forfeits perfect even after a full solve.
    r = rhymeAdapter.reduce(rhymePuzzle, r.state, { type: 'submit', word: 'glow' });
    r = rhymeAdapter.reduce(rhymePuzzle, r.state, { type: 'submit', word: 'snow' });
    r = rhymeAdapter.reduce(rhymePuzzle, r.state, { type: 'submit', word: 'may' });
    r = rhymeAdapter.reduce(rhymePuzzle, r.state, { type: 'submit', word: 'say' });
    expect(r.outcome).toEqual({ status: 'solved', perfect: false });
  });

  it('repeats are remembered and free; the prompt itself is refused kindly', () => {
    let s = startRhyme(rhymePuzzle);
    let out = submitRhyme(rhymePuzzle, s, 'blorp');
    expect(out.result.kind).toBe('miss');
    out = submitRhyme(rhymePuzzle, out.state, 'blorp');
    expect(out.result.kind).toBe('already-tried');
    out = submitRhyme(rhymePuzzle, out.state, 'dough');
    expect(out.result.kind).toBe('prompt');
    out = submitRhyme(rhymePuzzle, out.state, 'glow');
    out = submitRhyme(rhymePuzzle, out.state, 'glow');
    expect(out.result.kind).toBe('already-found');
  });

  it('humming walks silhouettes most-common-first and prices as a hint', () => {
    let s: RhymeRoomState = rhymeAdapter.start(rhymePuzzle, ctx(1));
    const r = rhymeAdapter.reduce(rhymePuzzle, s, { type: 'hum' });
    expect(eventsOfType(r.events, 'hint')).toEqual([{ type: 'hint', weight: 1 }]);
    expect(r.state.rh.silhouettes).toEqual([{ length: 4, first: 'G' }]); // GLOW is first
    expect(r.outcome.perfect).toBe(false);

    // Exhausting the hummable space emits nothing costed.
    let st = r.state;
    for (let i = 0; i < 10; i++) st = rhymeAdapter.reduce(rhymePuzzle, st, { type: 'hum' }).state;
    const last = rhymeAdapter.reduce(rhymePuzzle, st, { type: 'hum' });
    expect(eventsOfType(last.events, 'hint')).toEqual([]);
  });

  it('engine hint never duplicates a silhouette shape', () => {
    let s = startRhyme(rhymePuzzle);
    const shapes = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const { state, silhouette } = humRhymeHint(rhymePuzzle, s);
      s = state;
      if (silhouette) {
        const key = `${silhouette.length}:${silhouette.first}`;
        expect(shapes.has(key)).toBe(false);
        shapes.add(key);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Category — pool honesty + engine + adapter economy
// ---------------------------------------------------------------------------

describe('category pool', () => {
  it('ships at least 4 categories per difficulty', () => {
    for (const d of ['easy', 'medium', 'hard', 'expert'] as const) {
      expect(CATEGORY_POOL.filter((p) => p.difficulty === d).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('categories are honest: traps disjoint from accepted, targets coverable, par sane', () => {
    for (const p of CATEGORY_POOL) {
      const words = p.accepted.map((e) => e.word);
      // Target must be coverable in distinct ANSWERS (lemmas), not spellings.
      const lemmas = new Set(p.accepted.map((e) => e.lemma));
      expect(lemmas.size, p.id).toBeGreaterThanOrEqual(p.target + 4);
      for (const t of p.traps) {
        expect(words, `${p.id} trap ${t.word}`).not.toContain(t.word);
        expect(t.note.length, `${p.id} trap note`).toBeGreaterThan(0);
      }
      expect(p.parTicks).toBeGreaterThanOrEqual(p.target);
      expect(p.maxCostedTicks).toBeGreaterThan(0);
    }
  });

  it('plural inflation is dead: a plural of a shelved word is already-found, pool-wide', () => {
    // Every shipped category: pick any two spellings sharing a lemma and
    // verify the second scores nothing (3.5; BENCHMARKS §1 "editor bans S").
    let pairsChecked = 0;
    for (const p of CATEGORY_POOL) {
      const byLemma = new Map<string, string[]>();
      for (const e of p.accepted) {
        byLemma.set(e.lemma, [...(byLemma.get(e.lemma) ?? []), e.word]);
      }
      for (const forms of byLemma.values()) {
        if (forms.length < 2) continue;
        let out = submitCategory(p, startCategory(p), forms[0]!);
        expect(out.result.kind, `${p.id} ${forms[0]}`).toBe('found');
        out = submitCategory(p, out.state, forms[1]!);
        expect(out.result.kind, `${p.id} ${forms[1]}`).toBe('already-found');
        expect(out.state.found, p.id).toHaveLength(1);
        pairsChecked++;
      }
    }
    expect(pairsChecked).toBeGreaterThan(20); // the expansion really ships pairs
  });
});

describe('category engine + adapter economy', () => {
  it('shelving to target solves; under par pays a gem; perfect when clean', () => {
    let s: CategoryRoomState = categoryAdapter.start(catPuzzle, ctx(1));
    let r = categoryAdapter.reduce(catPuzzle, s, { type: 'submit', word: 'basil' });
    expect(eventsOfType(r.events, 'progress')).toEqual([{ type: 'progress', detail: 'shelved' }]);
    r = categoryAdapter.reduce(catPuzzle, r.state, { type: 'submit', word: 'thyme' });
    r = categoryAdapter.reduce(catPuzzle, r.state, { type: 'submit', word: 'MINT' });
    expect(r.outcome).toEqual({ status: 'solved', perfect: true });
    expect(eventsOfType(r.events, 'reward')).toEqual([{ type: 'reward', gems: 1 }]);
  });

  it('the curated trap costs weight 1 with its authored note; misses are free', () => {
    let s: CategoryRoomState = categoryAdapter.start(catPuzzle, ctx(1));
    let r = categoryAdapter.reduce(catPuzzle, s, { type: 'submit', word: 'ginger' });
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 1 }]);
    expect(r.state.lastFeedback).toEqual({ kind: 'trap', word: 'GINGER', note: 'A root, and it knows it.' });
    r = categoryAdapter.reduce(catPuzzle, r.state, { type: 'submit', word: 'turnip' });
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0 }]);
  });

  it('ticks are free until par, cost weight 1 after, and the charge is capped', () => {
    let s: CategoryRoomState = categoryAdapter.start(catPuzzle, ctx(1));
    const weights: (number | null)[] = [];
    for (let i = 0; i < 9; i++) {
      const r = categoryAdapter.reduce(catPuzzle, s, { type: 'tick' });
      s = r.state;
      const m = eventsOfType(r.events, 'mistake');
      weights.push(m.length > 0 ? (m[0] as { weight: number }).weight : null);
    }
    // par 4 → ticks 1-4 free, 5-6 charged (cap 2), 7-9 free again.
    expect(weights).toEqual([null, null, null, null, 1, 1, null, null, null]);
    expect(s.cat.ticks).toBe(9);
    expect(s.cat.costedTicks).toBe(2);
  });

  it('late finish still solves — no real-time fail — but forfeits par gem and perfect', () => {
    let s = startCategory(catPuzzle);
    for (let i = 0; i < 6; i++) s = tickCategory(catPuzzle, s).state;
    expect(underPar(catPuzzle, s)).toBe(false);
    let out = submitCategory(catPuzzle, s, 'basil');
    out = submitCategory(catPuzzle, out.state, 'sage');
    out = submitCategory(catPuzzle, out.state, 'dill');
    expect(out.state.status).toBe('won');
    // through the adapter: same path, no gem, not perfect
    let rs: CategoryRoomState = categoryAdapter.start(catPuzzle, ctx(1));
    for (let i = 0; i < 6; i++) rs = categoryAdapter.reduce(catPuzzle, rs, { type: 'tick' }).state;
    let r = categoryAdapter.reduce(catPuzzle, rs, { type: 'submit', word: 'basil' });
    r = categoryAdapter.reduce(catPuzzle, r.state, { type: 'submit', word: 'sage' });
    r = categoryAdapter.reduce(catPuzzle, r.state, { type: 'submit', word: 'dill' });
    expect(r.outcome.status).toBe('solved');
    expect(r.outcome.perfect).toBe(false);
    expect(eventsOfType(r.events, 'reward')).toEqual([]);
  });

  it('ticks after the win are inert', () => {
    let s: CategoryRoomState = categoryAdapter.start(catPuzzle, ctx(1));
    for (const w of ['basil', 'thyme', 'mint']) {
      s = categoryAdapter.reduce(catPuzzle, s, { type: 'submit', word: w }).state;
    }
    const r = categoryAdapter.reduce(catPuzzle, s, { type: 'tick' });
    expect(r.events).toEqual([]);
    expect(r.state.cat.ticks).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Phonetics — the rhyme model itself (build-time module, unit-testable)
// ---------------------------------------------------------------------------

describe('phonetics rhyme keys', () => {
  it('keys run from the last primary-stressed vowel to the end, stress-stripped', () => {
    expect(rhymeKeyOfPron(['D', 'OW1'])).toBe('OW');
    expect(rhymeKeyOfPron(['S', 'T', 'OW1', 'N'])).toBe('OW N');
    expect(rhymeKeyOfPron(['AH0', 'W', 'EY1'])).toBe('EY');           // AWAY → EY
    expect(rhymeKeyOfPron(['HH', 'IH1', 'S', 'T', 'ER0', 'IY0'])).toBe('IH S T ER IY'); // HISTORY
  });

  it('falls back to secondary stress, then any vowel; none → null', () => {
    expect(rhymeKeyOfPron(['K', 'AE2', 'T'])).toBe('AE T');
    expect(rhymeKeyOfPron(['DH', 'AH0'])).toBe('AH');
    expect(rhymeKeyOfPron(['S', 'T'])).toBeNull();
  });
});
