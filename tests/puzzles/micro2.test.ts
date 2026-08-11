import { describe, expect, it } from 'vitest';
import type { RoomContext, RoomEvent } from '../../src/engine/rooms/room-puzzle';
import { getRoomAdapter, registeredRoomKinds } from '../../src/engine/rooms/registry';
import {
  checkCrossword, checkedCells, crossedCells, entryCells, hemLetters, isGridFull, isHemSpelled,
  openCells, setCrosswordCell, solutionLetters, startCrossword, validateCrosswordPuzzle,
  type CrosswordPuzzle,
} from '../../src/engine/puzzles/crossword';
import { crosswordAdapter, CROSSWORD_POOL, type CrosswordRoomState } from '../../src/engine/puzzles/crossword-adapter';
import clueBank from '../../content/authored/crossword-clues.json';

const CLUE_BANK = clueBank as {
  clues: { word: string; clues: string[]; wry: string[]; difficulty: string }[];
};

/**
 * A5 — the surviving batch-2 micro room (Linen Closet crossword) behind the
 * RoomPuzzle contract. (The Music Room rhyme chain and Pantry category
 * sprint were retired in the owner's "fewer but better" cull.) Mistake-weight
 * mappings are review checkpoints against AAA §0.3: free letter probes; only
 * the full-grid claim costs; hints price through the `hint` event and forfeit
 * perfect.
 */

const ctx = (tier: 1 | 2 | 3): RoomContext => ({ tier, seed: 7, volumeId: 'volume-1' });

const eventsOfType = (events: RoomEvent[], type: RoomEvent['type']) =>
  events.filter((e) => e.type === type);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const cwPuzzle: CrosswordPuzzle = {
  id: 'cw-fixture',
  size: 5,
  entries: [
    { id: '1D', dir: 'down', row: 1, col: 3, answer: 'BED', clue: 'Where the day ends' },
    { id: '2A', dir: 'across', row: 2, col: 0, answer: 'CAKE', clue: 'Celebration slice' },
    { id: '2D', dir: 'down', row: 2, col: 0, answer: 'CAT', clue: 'Dewey, for one' },
  ],
};

// ---------------------------------------------------------------------------
// Registry wiring
// ---------------------------------------------------------------------------

describe('registry (A5)', () => {
  it('registers crossword as a micro room', () => {
    const adapter = getRoomAdapter('crossword');
    expect(adapter).toBeDefined();
    expect(adapter!.kind).toBe('crossword');
    expect(adapter!.size).toBe('micro');
    expect(registeredRoomKinds()).toEqual(expect.arrayContaining(['crossword']));
  });
});

// ---------------------------------------------------------------------------
// Seeded, seen-aware selection (shared select contract)
// ---------------------------------------------------------------------------

describe('selection', () => {
  it('crossword: deterministic by seed', () => {
    const a = crosswordAdapter.select({ tier: 2, seed: 123, seenIds: [] });
    const b = crosswordAdapter.select({ tier: 2, seed: 123, seenIds: [] });
    expect(crosswordAdapter.puzzleId(a)).toBe(crosswordAdapter.puzzleId(b));
  });

  it('crossword: avoids seen puzzles while fresh ones remain', () => {
    const first = crosswordAdapter.select({ tier: 1, seed: 5, seenIds: [] });
    const firstId = crosswordAdapter.puzzleId(first);
    const second = crosswordAdapter.select({ tier: 1, seed: 5, seenIds: [firstId] });
    expect(crosswordAdapter.puzzleId(second)).not.toBe(firstId);
  });

  it('crossword: falls back gracefully when everything is seen', () => {
    const all = CROSSWORD_POOL.map((p) => p.id);
    const picked = crosswordAdapter.select({ tier: 3, seed: 9, seenIds: all });
    expect(all).toContain(crosswordAdapter.puzzleId(picked));
  });
});

// ---------------------------------------------------------------------------
// Crossword — pool honesty + engine + adapter economy
// ---------------------------------------------------------------------------

describe('crossword pool', () => {
  /**
   * ROUND 29 PANEL GUARD. The clue panel is capped at FIVE whole rows on the
   * smallest glass the game ships to (a5micro.css, `@media (max-height:700)`),
   * and the hem's clue is a row like any other — so a board may print at most
   * four entries. Round 5's version of this test allowed five entries and no
   * hem, which is exactly the six-row board that put 3D, 4A and 5A behind the
   * keyboard at 375x667. A content edit that reintroduces it fails here
   * instead of in her evening.
   */
  it('never ships more rows than the clue panel can show: entries + the hem <= 5', () => {
    for (const p of CROSSWORD_POOL) {
      expect(p.entries.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.entries.length + (p.spine ? 1 : 0), p.id).toBeLessThanOrEqual(5);
    }
  });

  it('ships puzzles for every manor tier', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(CROSSWORD_POOL.filter((p) => (p.tier ?? 1) === tier).length, `tier ${tier}`)
        .toBeGreaterThanOrEqual(10);
    }
  });

  /**
   * Round 4 (owner: "5x5 tier 3 with harder clue styles"). The closet grows
   * with the row and the clue register hardens at the top.
   */
  describe('tier escalation', () => {
    const at = (tier: 1 | 2 | 3) => CROSSWORD_POOL.filter((p) => (p.tier ?? 1) === tier);

    it('the grid and the entry count both grow with the row', () => {
      for (const p of at(1)) {
        expect(p.size, p.id).toBe(4);
        expect(p.entries.length, p.id).toBe(3);
      }
      for (const p of at(2)) {
        expect(p.size, p.id).toBe(5);
        expect(p.entries.length, p.id).toBe(4);
      }
      // ROUND 29: tier 3 was five entries on a 5x5 and is four entries + the
      // hem. That is a declared SHORTENING — 5 clues printed then, 5 printed
      // now, ~17 letters to type then, ~14 now — and it is what keeps the
      // worst board in the pool inside a five-row clue panel. Tier 3 is
      // separated from tier 2 by its WORDS and its clue REGISTER (below),
      // which is AAA 3.8's hard-mode philosophy rather than more to do.
      for (const p of at(3)) {
        expect(p.size, p.id).toBe(5);
        expect(p.entries.length, p.id).toBe(4);
      }
    });

    it('tier 3 reads at least two clues in the wry (misdirecting) style', () => {
      const wry = new Set(
        CLUE_BANK.clues.flatMap((c) => c.wry),
      );
      for (const p of at(3)) {
        const printed = [...p.entries.map((e) => e.clue), ...(p.spine ? [p.spine.clue] : [])];
        const wryCount = printed.filter((c) => wry.has(c)).length;
        expect(wryCount, p.id).toBeGreaterThanOrEqual(2);
      }
    });

    it('tiers 1 and 2 keep the plain definition register', () => {
      const wry = new Set(
        CLUE_BANK.clues.flatMap((c) => c.wry),
      );
      for (const p of [...at(1), ...at(2)]) {
        for (const e of p.entries) expect(wry.has(e.clue), `${p.id} ${e.id}`).toBe(false);
        if (p.spine) expect(wry.has(p.spine.clue), `${p.id} hem`).toBe(false);
      }
    });

    it('tier 3 always headlines a hard or expert bank word', () => {
      const byWord = new Map(CLUE_BANK.clues.map((c) => [c.word, c.difficulty]));
      for (const p of at(3)) {
        const diffs = p.entries.map((e) => byWord.get(e.answer));
        expect(diffs.some((d) => d === 'hard' || d === 'expert'), p.id).toBe(true);
      }
    });
  });

  it('every shipped puzzle passes the structural solver (runs, crossings, connectivity)', () => {
    for (const p of CROSSWORD_POOL) {
      expect(validateCrosswordPuzzle(p), p.id).toEqual([]);
    }
  });

  /**
   * REVIEW_AA 5.9, pinned. Both reviewers measured the Linen Closet at 155
   * unique clues across 360 entries (0.431) and 115 unique answers, with SUN
   * headlining twelve puzzles and "Parchment guide" printed eight times: the
   * pool exhausted itself on the tenth closet and the room became a typing
   * test, taking the best house-voice writing in the repository down with it.
   *
   * The generator now spends a fresh clue on every use and carries the
   * cursors across all three tiers, so this is 1.000 by construction. The
   * gate is here because the failure mode is silent — a reused clue looks
   * exactly like a written one until you have seen it twice.
   */
  describe('clue freshness (REVIEW_AA 5.9)', () => {
    const entries = CROSSWORD_POOL.flatMap((p) => p.entries);

    it('no clue is ever printed twice in the whole shipped pool', () => {
      const seen = new Map<string, string>();
      const repeats: string[] = [];
      let printed = 0;
      for (const p of CROSSWORD_POOL) {
        // ROUND 29: the hem's clue is PRINTED in the same list, so it is under
        // the same rule. 396 sentences now, not 312.
        for (const text of [...p.entries.map((e) => e.clue), ...(p.spine ? [p.spine.clue] : [])]) {
          printed++;
          const first = seen.get(text);
          if (first !== undefined) repeats.push(`"${text}" — ${first} and ${p.id}`);
          else seen.set(text, p.id);
        }
      }
      expect(repeats).toEqual([]);
      expect(seen.size / printed).toBeGreaterThanOrEqual(0.9);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('no answer headlines more than four of the ninety puzzles', () => {
      const uses = new Map<string, number>();
      for (const e of entries) uses.set(e.answer, (uses.get(e.answer) ?? 0) + 1);
      for (const [answer, n] of uses) expect(n, answer).toBeLessThanOrEqual(4);
      expect(uses.size).toBeGreaterThanOrEqual(140);
    });

    it('every bank word carries a pool of clues, not one sentence', () => {
      for (const c of CLUE_BANK.clues) {
        expect(c.clues.length, c.word).toBeGreaterThanOrEqual(2);
        expect(c.wry.length, c.word).toBeGreaterThanOrEqual(1);
      }
      const all = CLUE_BANK.clues.flatMap((c) => [...c.clues, ...c.wry]);
      expect(new Set(all).size, 'two bank words share a clue').toBe(all.length);
    });
  });
});

/**
 * ═══ THE HEM (docs/BENCHMARKS.md §10, docs/LINEN_CLOSET.md) ════════════════
 *
 * The room's letters are checked the way an NYT Acrostic's are — by a spine —
 * because 251 enumerated fully-checked masks are all unfillable from this
 * bank. These are the gates on that, and the point of the two RED PROOFS
 * below is that neither number can be true by construction: both are measured
 * on boards that are perfectly valid puzzles and fail anyway.
 */
describe('the hem (BENCHMARKS §10)', () => {
  /** Every board's marked cells, with whether each was already crossed. */
  const marks = CROSSWORD_POOL.flatMap((p) => {
    const crossed = crossedCells(p);
    return (p.spine?.cells ?? []).map((c) => ({ id: p.id, cell: c, fresh: !crossed.has(c) }));
  });
  /** Checked letters per entry, over the whole shipped pool. */
  const perEntry = CROSSWORD_POOL.flatMap((p) => {
    const checked = checkedCells(p);
    return p.entries.map((e) => {
      const cells = entryCells(p, e);
      return { id: `${p.id} ${e.id}`, checked: cells.filter((c) => checked.has(c)).length };
    });
  });

  it('every shipped board carries a hem, and the structural solver accepts it', () => {
    for (const p of CROSSWORD_POOL) {
      expect(p.spine, `${p.id} has no hem`).toBeDefined();
      expect(p.spine!.cells.length, p.id).toBe(p.entries.length);
      expect(p.spine!.answer.length, p.id).toBe(p.entries.length);
      expect(validateCrosswordPuzzle(p), p.id).toEqual([]);
    }
  });

  it('the hem is a SECOND answer — never one of the words already on the board', () => {
    for (const p of CROSSWORD_POOL) {
      expect(p.entries.map((e) => e.answer), p.id).not.toContain(p.spine!.answer);
    }
  });

  /**
   * GATE 1 — a marked square must fall on a letter no crossing already checks.
   * Marking a crossing is legal, cheap, and buys the room NOTHING, which is
   * why the generator throws away 64,977 layouts rather than do it.
   */
  it('every marked square lands on a letter no crossing already checks', () => {
    const stale = marks.filter((m) => !m.fresh);
    expect(stale.map((m) => `${m.id}#${m.cell}`), 'marked squares on an already-crossed letter').toEqual([]);
    // Exactly one mark per entry across the pool — so an empty `stale` cannot
    // be an empty `marks` wearing a disguise.
    expect(marks.length, 'one marked square per entry')
      .toBe(CROSSWORD_POOL.reduce((n, p) => n + p.entries.length, 0));
  });

  /**
   * GATE 1, PROVEN RED. The board below is a perfectly good puzzle — the
   * structural solver returns an empty problem list for it — and its hem marks
   * the ONE cell its two entries already share. The gate above has to condemn
   * it, or it is not a gate. The first build of this round's generator shipped
   * 90 boards at 0.679 on exactly this mistake, and every other gate in the
   * file stayed green.
   */
  it('and that gate goes RED on a board whose hem marks a crossing', () => {
    // CAT across and COT down share the C at (1,1); TEA down shares CAT's T.
    const entries = [
      { id: '1A', dir: 'across', row: 1, col: 1, answer: 'CAT', clue: 'Dewey, for one' },
      { id: '1D', dir: 'down', row: 1, col: 1, answer: 'COT', clue: 'A small bed' },
      { id: '2D', dir: 'down', row: 1, col: 3, answer: 'TEA', clue: 'What the pot is for' },
    ] as CrosswordPuzzle['entries'];
    const bare: CrosswordPuzzle = { id: 'hem-marks-a-crossing', size: 5, entries };
    expect(validateCrosswordPuzzle(bare), 'the board under the bad hem is a valid puzzle').toEqual([]);
    // A of CAT (fresh), C of COT (the crossing), E of TEA (fresh) -> "ACE".
    const lazy: CrosswordPuzzle = {
      ...bare,
      spine: { answer: 'ACE', clue: 'Best in the pack', cells: [1 * 5 + 2, 1 * 5 + 1, 2 * 5 + 3] },
    };
    expect(validateCrosswordPuzzle(lazy), 'the lazy hem is structurally legal — that is the point').toEqual([]);
    const crossed = crossedCells(lazy);
    const fresh = lazy.spine!.cells.filter((c) => !crossed.has(c)).length;
    expect(fresh / lazy.spine!.cells.length, 'a hem that marks a crossing must not measure 1.0').toBeLessThan(1);
    // And the entry whose only mark was already crossed keeps its thin answer.
    const checked = checkedCells(lazy);
    const cot = lazy.entries[1]!;
    expect(entryCells(lazy, cot).filter((c) => checked.has(c)).length,
      'COT gains nothing from a hem that marks the letter it already shared').toBe(1);
  });

  /**
   * GATE 2 — the number the hem exists for. Before it, 190 of 360 entries
   * (52.8%) had at most ONE letter anything on the board could contradict:
   * a wrong word looked exactly as right as a right one until she paid for a
   * check. See BENCHMARKS §10's table.
   */
  it('no entry is left with a single checked letter', () => {
    const thin = perEntry.filter((e) => e.checked <= 1);
    expect(thin.map((e) => e.id), 'entries with at most one checked letter').toEqual([]);
    expect(perEntry.length, 'every entry in the pool was measured')
      .toBe(CROSSWORD_POOL.reduce((n, p) => n + p.entries.length, 0));
  });

  /**
   * GATE 2, PROVEN RED, on the shape the room actually shipped at HEAD: the
   * same boards with their hems taken off. If this measured zero, the gate
   * above would be a tautology about connectivity.
   */
  it('and that gate goes RED on the same boards with their hems taken off', () => {
    const hemless = CROSSWORD_POOL.map((p) => ({ ...p, spine: undefined }) as CrosswordPuzzle);
    const thin = hemless.flatMap((p) => {
      const checked = checkedCells(p);
      return p.entries.filter((e) => entryCells(p, e).filter((c) => checked.has(c)).length <= 1);
    });
    expect(thin.length, 'a hemless pool must still be full of single-checked entries').toBeGreaterThan(0);
  });

  /**
   * The headline number, pinned. Crossings alone check two fifths of the
   * letters in this pool; with one marked square per entry it is well over
   * half. Both halves are asserted, so the pin can go red in either direction
   * — a thinner hem or a denser layout both fail here.
   */
  it('most of an answer is under outside check now, not two fifths of it', () => {
    let slots = 0;
    let checked = 0;
    let hemlessChecked = 0;
    for (const p of CROSSWORD_POOL) {
      const withHem = checkedCells(p);
      const withoutHem = crossedCells(p);
      for (const e of p.entries) {
        const cells = entryCells(p, e);
        slots += cells.length;
        checked += cells.filter((c) => withHem.has(c)).length;
        hemlessChecked += cells.filter((c) => withoutHem.has(c)).length;
      }
    }
    expect(hemlessChecked / slots, 'the crossings alone').toBeLessThan(0.45);
    expect(checked / slots, 'crossings + the hem').toBeGreaterThan(0.55);
  });

  /**
   * THE CLOCK. The hem adds a row to the clue list, and the evening has no
   * time left to give — so the board is not allowed to grow to pay for it.
   * These are the numbers the pool this replaces actually shipped, measured
   * off `content/generated/crossword.json` at round-28 HEAD:
   *
   *     tier 1   mean 8.40 squares   median 8    range 7-10
   *     tier 2   mean 13.30          median 13   range 11-16
   *     tier 3   mean 16.10          median 16   range 13-18
   *
   * The hem's freshness rule pulls the search toward SPARSER layouts (fewer
   * crossings means more uncrossed letters to mark), so this is a live risk
   * rather than a hypothetical: unconstrained, the first hemmed pool measured
   * 9.00 and 14.50 at tiers 1 and 2. The generator caps the running mean and
   * this replays the check on what shipped.
   */
  it('does not buy the hem with squares: the board is no bigger than it was', () => {
    const WAS = { 1: 8.4, 2: 13.3, 3: 16.1 } as const;
    // Tier 3 traded its fifth entry for the hem, so it is held well under.
    const NOW_CAP = { 1: 8.4, 2: 13.3, 3: 14 } as const;
    for (const tier of [1, 2, 3] as const) {
      const boards = CROSSWORD_POOL.filter((p) => (p.tier ?? 1) === tier);
      expect(boards.length, `tier ${tier} pool`).toBeGreaterThanOrEqual(10);
      const squares = boards.map((p) => openCells(p).length);
      const mean = squares.reduce((a, b) => a + b, 0) / squares.length;
      expect(mean, `tier ${tier} board grew: ${mean.toFixed(2)} squares against ${WAS[tier]} before the hem`)
        .toBeLessThanOrEqual(NOW_CAP[tier]);
    }
  });

  /**
   * And the trade at the top of the ladder, stated as a number rather than as
   * a claim: tier 3 gave up its fifth entry, so it prints the same five rows
   * and asks for fewer letters than it used to.
   */
  it('tier 3 prints as many rows as before and asks for fewer letters', () => {
    const t3 = CROSSWORD_POOL.filter((p) => (p.tier ?? 1) === 3);
    for (const p of t3) {
      expect(p.entries.length + 1, `${p.id} printed rows`).toBe(5);
    }
    const squares = t3.map((p) => openCells(p).length);
    const mean = squares.reduce((a, b) => a + b, 0) / squares.length;
    expect(mean, 'tier 3 must ask for fewer letters than the 16.10 it used to').toBeLessThan(16.1);
  });

  it('reads the marked letters in clue order, and only spells when they are right', () => {
    const p = CROSSWORD_POOL.find((x) => (x.tier ?? 1) === 3)!;
    const sol = solutionLetters(p);
    let st = startCrossword(p);
    expect(hemLetters(p, st)).toEqual(p.spine!.cells.map(() => null));
    expect(isHemSpelled(p, st)).toBe(false);
    for (const c of p.spine!.cells) st = setCrosswordCell(p, st, c, sol.get(c)!);
    expect(hemLetters(p, st).join('')).toBe(p.spine!.answer);
    expect(isHemSpelled(p, st)).toBe(true);
    // One marked square wrong and the hem refuses. That refusal is the
    // refutation a crossing used to provide, and it costs nothing.
    const first = p.spine!.cells[0]!;
    st = setCrosswordCell(p, st, first, sol.get(first) === 'A' ? 'B' : 'A');
    expect(isHemSpelled(p, st)).toBe(false);
  });

  it('reading the hem is never a claim: it charges nothing and ends nothing', () => {
    const p = CROSSWORD_POOL.find((x) => (x.tier ?? 1) === 3)!;
    const sol = solutionLetters(p);
    let s = crosswordAdapter.start(p, ctx(3)) as CrosswordRoomState;
    const events: RoomEvent[] = [];
    for (const c of p.spine!.cells) {
      const out = crosswordAdapter.reduce(p, s, { type: 'set-cell', index: c, letter: sol.get(c)! });
      s = out.state as CrosswordRoomState;
      events.push(...out.events);
    }
    expect(isHemSpelled(p, s.cw), 'the hem reads').toBe(true);
    expect(events, 'spelling the hem emitted an event').toEqual([]);
    expect(s.cw.costedChecks).toBe(0);
    expect(s.cw.status, 'the hem alone must not solve the room').toBe('playing');
  });

  /**
   * The hem is only a check if it can be READ. Nothing may be marked twice and
   * nothing may be marked outside its own entry — the view mirrors
   * `spine.cells[i]` onto clue row i without re-deriving anything.
   */
  it('one marked square per entry, in clue order, each inside its own answer', () => {
    for (const p of CROSSWORD_POOL) {
      const cells = p.spine!.cells;
      expect(new Set(cells).size, `${p.id} marks a square twice`).toBe(cells.length);
      cells.forEach((c, i) => {
        expect(entryCells(p, p.entries[i]!), `${p.id} mark ${i}`).toContain(c);
      });
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

  it('entryCells walks each entry in order', () => {
    const cells = entryCells(cwPuzzle, cwPuzzle.entries[0]!);
    expect(cells.length).toBe(3);
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
    expect(eventsOfType(charged, 'mistake')).toEqual([{ type: 'mistake', weight: 1, detail: 'checked-wrong' }]);
    expect(s.cw.wrongCells).toEqual([lastCell]);

    // Clear and retype the same wrong letter: same claim, no second charge.
    let r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: lastCell, letter: null });
    s = r.state;
    r = crosswordAdapter.reduce(cwPuzzle, s, { type: 'set-cell', index: lastCell, letter: 'Z' });
    expect(eventsOfType(r.events, 'mistake')).toEqual([{ type: 'mistake', weight: 0, detail: 'checked-wrong' }]);

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
