/**
 * The Linen Closet — a sparse clue puzzle with a spine. OWNER: A5.
 *
 * NOT A CROSSWORD, and no longer scored as one (docs/LINEN_CLOSET.md is the
 * owner's ruling; docs/BENCHMARKS.md §10 is the benchmark that replaced the
 * Mini). A criss-cross of 3–4 clued words in a grid of at most 5×5, whose
 * letters are checked the way an NYT ACROSTIC's are — by a spine — rather
 * than by crossings, which a 174-word hand-authored bank provably cannot
 * supply (251 fully-checked masks enumerated, zero fillable).
 *
 * THE HEM. Every entry owns exactly ONE marked square. Read in clue order the
 * marked letters spell a further answer, and that answer carries a clue of its
 * own, printed in the list with the rest. It does the job crossings used to:
 * a wrong entry whose marked letter refuses the spine is refuted for free, and
 * a solver who reads the spine's clue first gets one letter in every entry.
 * Before the hem, 190 of 360 shipped entries had at most ONE letter anything
 * could contradict; the generator's freshness rule takes that to zero.
 *
 * Pure engine: no React, no DOM, no audio. Letters are probes and cost nothing
 * to place or erase (AAA 3.2/3.3). The single costed moment is a full-grid
 * claim: when every cell is filled the grid auto-checks — a miss shakes the
 * wrong cells and costs one weight-1 mistake. Re-checking an *identical* fill
 * is free (the game never double-charges the same claim), and wrong-cell marks
 * persist until the player edits them (memory prosthetic, AAA 3.3).
 * Revealing a cell is a step-priced hint; hints and costed checks forfeit
 * "perfect". THE HEM IS NEVER COSTED — it is derived from letters already on
 * the board, exactly as a crossing is.
 */

export type CrosswordDir = 'across' | 'down';

export interface CrosswordEntry {
  id: string;              // e.g. "1A", "2D" — unique within the puzzle
  dir: CrosswordDir;
  row: number;             // 0-based, top row = 0
  col: number;             // 0-based, left col = 0
  answer: string;          // uppercase A–Z
  clue: string;
}

/**
 * The hem: one marked square per entry, read in the order the clue list
 * prints (= `entries` order, which the generator writes in reading order).
 *
 * `cells[i]` is a cell of `entries[i]`, the cells are distinct, and the
 * solution letter at `cells[i]` is `answer[i]` — all four facts are enforced
 * by validateCrosswordPuzzle, so the view can render the strip without
 * re-deriving anything.
 */
export interface CrosswordSpine {
  /** The word the marked squares spell. Never one of the entries' answers. */
  answer: string;
  /** Its clue, from the same bank and in the same voice as the entries'. */
  clue: string;
  /** One marked cell index per entry, in entry order. */
  cells: number[];
}

export interface CrosswordPuzzle {
  id: string;
  size: number;            // grid is size×size; cells outside entries are linen
  entries: CrosswordEntry[]; // 3–4, solver-verified by the generator
  /**
   * Optional only so that a bundle predating the hem still loads rather than
   * crashing. Every puzzle the generator ships carries one, and the pool gate
   * in tests/puzzles/micro2.test.ts fails the build if one does not.
   */
  spine?: CrosswordSpine;
}

export interface CrosswordEngineState {
  /** Player letters by cell index (row * size + col). */
  letters: Record<number, string>;
  /** Cells the last full check marked wrong — cleared as they are edited. */
  wrongCells: number[];
  /** Cells revealed by step-priced hints (locked; count toward the fill). */
  revealedCells: number[];
  /** Fill signatures already charged — identical re-checks are free. */
  checkedSignatures: string[];
  /** Costed (wrong, newly-charged) checks. */
  costedChecks: number;
  hintsUsed: number;
  status: 'playing' | 'won';
}

export type CrosswordCheckResult =
  | { kind: 'solved' }
  /** charged=false when this exact fill was already checked (free re-shake). */
  | { kind: 'miss'; wrongCells: number[]; charged: boolean };

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export function entryCells(puzzle: CrosswordPuzzle, entry: CrosswordEntry): number[] {
  const cells: number[] = [];
  for (let i = 0; i < entry.answer.length; i++) {
    const row = entry.dir === 'down' ? entry.row + i : entry.row;
    const col = entry.dir === 'across' ? entry.col + i : entry.col;
    cells.push(row * puzzle.size + col);
  }
  return cells;
}

/** All open (playable) cell indices, ascending. */
export function openCells(puzzle: CrosswordPuzzle): number[] {
  const set = new Set<number>();
  for (const e of puzzle.entries) for (const c of entryCells(puzzle, e)) set.add(c);
  return [...set].sort((a, b) => a - b);
}

/** The solution letter for every open cell (generator-verified consistent). */
export function solutionLetters(puzzle: CrosswordPuzzle): Map<number, string> {
  const sol = new Map<number, string>();
  for (const e of puzzle.entries) {
    const cells = entryCells(puzzle, e);
    for (let i = 0; i < cells.length; i++) sol.set(cells[i]!, e.answer[i]!);
  }
  return sol;
}

/** Cells with more than one entry through them — the room's few crossings. */
export function crossedCells(puzzle: CrosswordPuzzle): Set<number> {
  const seen = new Set<number>();
  const twice = new Set<number>();
  for (const e of puzzle.entries) {
    for (const c of entryCells(puzzle, e)) {
      if (seen.has(c)) twice.add(c);
      seen.add(c);
    }
  }
  return twice;
}

/**
 * Every cell some OTHER entry (or the hem) can contradict. This is the
 * room's fairness number, and it is what BENCHMARKS §10 scores: before the
 * hem it was the crossings alone, and 52.8% of entries had at most one such
 * letter in the whole answer.
 */
export function checkedCells(puzzle: CrosswordPuzzle): Set<number> {
  const set = crossedCells(puzzle);
  for (const c of puzzle.spine?.cells ?? []) set.add(c);
  return set;
}

// ---------------------------------------------------------------------------
// The hem
// ---------------------------------------------------------------------------

/**
 * What the marked squares currently spell, one slot per entry, `null` where
 * the square is still empty. Derived from letters already on the board — this
 * is never a claim and is never charged.
 */
export function hemLetters(
  puzzle: CrosswordPuzzle,
  state: Pick<CrosswordEngineState, 'letters'>,
): (string | null)[] {
  return (puzzle.spine?.cells ?? []).map((c) => state.letters[c] ?? null);
}

/** Does the hem read the spine's answer right now? */
export function isHemSpelled(
  puzzle: CrosswordPuzzle,
  state: Pick<CrosswordEngineState, 'letters'>,
): boolean {
  const spine = puzzle.spine;
  if (!spine) return false;
  const got = hemLetters(puzzle, state);
  return got.length === spine.answer.length && got.every((ch, i) => ch === spine.answer[i]);
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function startCrossword(_puzzle: CrosswordPuzzle): CrosswordEngineState {
  return {
    letters: {},
    wrongCells: [],
    revealedCells: [],
    checkedSignatures: [],
    costedChecks: 0,
    hintsUsed: 0,
    status: 'playing',
  };
}

export function isOpenCell(puzzle: CrosswordPuzzle, index: number): boolean {
  return openCells(puzzle).includes(index);
}

/**
 * Place (letter) or erase (null) at an open cell. Free, always. Revealed
 * cells are locked; editing a wrong-marked cell lifts its mark.
 */
export function setCrosswordCell(
  puzzle: CrosswordPuzzle,
  state: CrosswordEngineState,
  index: number,
  letter: string | null,
): CrosswordEngineState {
  if (state.status !== 'playing') return state;
  if (!isOpenCell(puzzle, index)) return state;
  if (state.revealedCells.includes(index)) return state;
  const letters = { ...state.letters };
  if (letter === null) delete letters[index];
  else {
    const ch = letter.toUpperCase();
    if (!/^[A-Z]$/.test(ch)) return state;
    letters[index] = ch;
  }
  return {
    ...state,
    letters,
    wrongCells: state.wrongCells.filter((c) => c !== index),
  };
}

export function isGridFull(puzzle: CrosswordPuzzle, state: CrosswordEngineState): boolean {
  return openCells(puzzle).every((c) => state.letters[c] !== undefined);
}

export function fillSignature(puzzle: CrosswordPuzzle, state: CrosswordEngineState): string {
  return openCells(puzzle).map((c) => state.letters[c] ?? '.').join('');
}

/** Full-grid claim. Call only when the grid is full (adapter guards). */
export function checkCrossword(
  puzzle: CrosswordPuzzle,
  state: CrosswordEngineState,
): { state: CrosswordEngineState; result: CrosswordCheckResult } {
  if (state.status !== 'playing' || !isGridFull(puzzle, state)) {
    return { state, result: { kind: 'miss', wrongCells: [], charged: false } };
  }
  const sol = solutionLetters(puzzle);
  const wrong = openCells(puzzle).filter((c) => state.letters[c] !== sol.get(c));
  if (wrong.length === 0) {
    return { state: { ...state, wrongCells: [], status: 'won' }, result: { kind: 'solved' } };
  }
  const sig = fillSignature(puzzle, state);
  const charged = !state.checkedSignatures.includes(sig);
  return {
    state: {
      ...state,
      wrongCells: wrong,
      checkedSignatures: charged ? [...state.checkedSignatures, sig] : state.checkedSignatures,
      costedChecks: charged ? state.costedChecks + 1 : state.costedChecks,
    },
    result: { kind: 'miss', wrongCells: wrong, charged },
  };
}

/** Step-priced hint: reveal and lock the solution letter of one open cell. */
export function revealCrosswordCell(
  puzzle: CrosswordPuzzle,
  state: CrosswordEngineState,
  index: number,
): { state: CrosswordEngineState; letter: string | null } {
  if (state.status !== 'playing') return { state, letter: null };
  if (!isOpenCell(puzzle, index) || state.revealedCells.includes(index)) {
    return { state, letter: null };
  }
  const letter = solutionLetters(puzzle).get(index)!;
  const next: CrosswordEngineState = {
    ...state,
    letters: { ...state.letters, [index]: letter },
    revealedCells: [...state.revealedCells, index],
    wrongCells: state.wrongCells.filter((c) => c !== index),
    hintsUsed: state.hintsUsed + 1,
  };
  return { state: next, letter };
}

// ---------------------------------------------------------------------------
// Structural validation (generator + tests) — the "solver" for a criss-cross:
// every maximal run of ≥2 letters in the solution grid must be exactly one
// entry, intersections must agree, and the puzzle must be one connected piece.
// ---------------------------------------------------------------------------

export function validateCrosswordPuzzle(puzzle: CrosswordPuzzle): string[] {
  const problems: string[] = [];
  const { size, entries } = puzzle;
  if (size < 3 || size > 5) problems.push(`size ${size} out of range 3–5`);
  if (entries.length < 3 || entries.length > 4) problems.push(`${entries.length} entries (want 3–4)`);

  const ids = new Set<string>();
  const answers = new Set<string>();
  const sol = new Map<number, string>();
  for (const e of entries) {
    if (ids.has(e.id)) problems.push(`duplicate entry id ${e.id}`);
    ids.add(e.id);
    if (answers.has(e.answer)) problems.push(`duplicate answer ${e.answer}`);
    answers.add(e.answer);
    if (!/^[A-Z]{3,}$/.test(e.answer)) problems.push(`${e.id}: bad answer "${e.answer}"`);
    if (!e.clue || e.clue.trim().length === 0) problems.push(`${e.id}: empty clue`);
    const endRow = e.dir === 'down' ? e.row + e.answer.length - 1 : e.row;
    const endCol = e.dir === 'across' ? e.col + e.answer.length - 1 : e.col;
    if (e.row < 0 || e.col < 0 || endRow >= size || endCol >= size) {
      problems.push(`${e.id}: out of bounds`);
      continue;
    }
    const cells = entryCells(puzzle, e);
    for (let i = 0; i < cells.length; i++) {
      const existing = sol.get(cells[i]!);
      if (existing !== undefined && existing !== e.answer[i]) {
        problems.push(`${e.id}: intersection conflict at cell ${cells[i]}`);
      }
      sol.set(cells[i]!, e.answer[i]!);
    }
  }

  // Runs: every maximal horizontal/vertical run of >=2 letters is an entry.
  const runKeys = new Set(entries.map((e) => `${e.dir}:${e.row}:${e.col}:${e.answer.length}`));
  const at = (r: number, c: number) => (r < 0 || c < 0 || r >= size || c >= size ? undefined : sol.get(r * size + c));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (at(r, c) === undefined) continue;
      if (at(r, c - 1) === undefined && at(r, c + 1) !== undefined) {
        let len = 0;
        while (at(r, c + len) !== undefined) len++;
        if (!runKeys.has(`across:${r}:${c}:${len}`)) problems.push(`unintended across run at (${r},${c}) len ${len}`);
      }
      if (at(r - 1, c) === undefined && at(r + 1, c) !== undefined) {
        let len = 0;
        while (at(r + len, c) !== undefined) len++;
        if (!runKeys.has(`down:${r}:${c}:${len}`)) problems.push(`unintended down run at (${r},${c}) len ${len}`);
      }
    }
  }
  // Every entry of length >=2 must itself be a maximal run (no extensions).
  for (const e of entries) {
    const before = e.dir === 'across' ? at(e.row, e.col - 1) : at(e.row - 1, e.col);
    const after = e.dir === 'across'
      ? at(e.row, e.col + e.answer.length)
      : at(e.row + e.answer.length, e.col);
    if (before !== undefined || after !== undefined) problems.push(`${e.id}: run extends beyond entry`);
  }

  // Connectivity: entries form one piece via shared cells.
  if (entries.length > 1) {
    const cellsOf = entries.map((e) => new Set(entryCells(puzzle, e)));
    const joined = new Set<number>([0]);
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < entries.length; i++) {
        if (joined.has(i)) continue;
        for (const j of joined) {
          if ([...cellsOf[i]!].some((c) => cellsOf[j]!.has(c))) {
            joined.add(i);
            grew = true;
            break;
          }
        }
      }
    }
    if (joined.size !== entries.length) problems.push('entries are not connected');
  }

  // The hem. Four facts, so the view never re-derives any of them: one marked
  // cell per entry, in entry order; the cells are distinct; each belongs to
  // its own entry; and the solution letter there is the spine's letter.
  const spine = puzzle.spine;
  if (spine) {
    if (!/^[A-Z]{3,5}$/.test(spine.answer)) problems.push(`spine: bad answer "${spine.answer}"`);
    if (!spine.clue || spine.clue.trim().length === 0) problems.push('spine: empty clue');
    if (entries.some((e) => e.answer === spine.answer)) {
      problems.push(`spine: ${spine.answer} is also an entry`);
    }
    if (spine.cells.length !== entries.length) {
      problems.push(`spine: ${spine.cells.length} marked cells for ${entries.length} entries`);
    } else if (spine.answer.length !== entries.length) {
      problems.push(`spine: ${spine.answer} is ${spine.answer.length} letters for ${entries.length} entries`);
    } else {
      if (new Set(spine.cells).size !== spine.cells.length) problems.push('spine: two entries share a marked cell');
      for (let i = 0; i < spine.cells.length; i++) {
        const cell = spine.cells[i]!;
        if (!entryCells(puzzle, entries[i]!).includes(cell)) {
          problems.push(`spine: cell ${cell} is not in ${entries[i]!.id}`);
        } else if (sol.get(cell) !== spine.answer[i]) {
          problems.push(`spine: cell ${cell} reads ${sol.get(cell)}, spine wants ${spine.answer[i]}`);
        }
      }
    }
  }

  return problems;
}
