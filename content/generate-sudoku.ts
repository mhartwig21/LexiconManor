import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, shuffle, type Rng } from '../src/engine/rng';
import {
  TECHNIQUE_LEVEL, countSolutions, digPuzzle, generateSolvedGrid, gridToString, parseGrid,
  rateSudoku, solveOne, solveWithTechniques,
  type SudokuPuzzle, type SudokuTier, type TechniqueId, type TechniqueLevel,
} from '../src/engine/puzzles/sudoku';

/**
 * Sudoku generator for The Counting House.
 *
 * OWNER DIRECTIVE (playtest round): the player is an EXPERT solver, so
 * EXPERT IS THE BASELINE and the pool escalates from there. Difficulty is
 * therefore rated by the SOLVER TECHNIQUES a puzzle actually demands, never
 * by given count (given count is a famously bad proxy — a 30-given board can
 * need an X-wing and a 22-given board can fall to singles):
 *
 *   tier 1  locked candidates / naked+hidden pairs   ≈ NYT hard–expert
 *   tier 2  naked+hidden triples / X-wing
 *   tier 3  swordfish / XY-wing                      ≈ diabolical
 *
 * A shipped tier-N board must (a) solve completely with the full technique
 * ladder and (b) STALL when the ladder is capped one level below N — so the
 * tier is an honest requirement, not a label. Boards that fall to singles
 * alone (level 0) are discarded outright: there is no easy bin anywhere in
 * this pool.
 *
 * Pipeline, per board: seeded full grid → 180°-symmetric dig (the newspaper
 * aesthetic, and the bulk of the removals) → single-cell finishing pass to
 * TRUE minimality, every removal gated on the backtracking solver still
 * proving a UNIQUE solution → rate → bin. The finishing pass costs perfect
 * symmetry and buys difficulty: symmetric-only digging left a median of 28
 * givens, 72% of which fell to singles alone, and produced ZERO tier-2
 * boards in 600 attempts. Expert baseline wins that trade (owner directive).
 *
 * Boards the ladder cannot finish at all (~37% — they need forcing chains or
 * uniqueness arguments) are DISCARDED, not shipped at tier 3: a puzzle the
 * shipped rater cannot verify is a puzzle whose hint could lie.
 *
 * Every shipped board is re-verified in validate() (uniqueness, solution
 * match, tier requirement), and tests/puzzles/sudoku.test.ts replays that
 * verification against the shipped JSON so a hand-edited file cannot lie.
 */

const SEED = 20260806;

/** ~120 boards, evenly across the three technique tiers. */
const TARGET: Record<SudokuTier, number> = { 1: 40, 2: 40, 3: 40 };

/** Safety valve: total boards dug before we give up and report. */
const MAX_ATTEMPTS = 6000;

const TIERS: SudokuTier[] = [1, 2, 3];

function givenCount(givens: string): number {
  return [...givens].filter((c) => c !== '.').length;
}

/**
 * Symmetric dig, then a shuffled single-cell pass that removes every given
 * whose removal keeps the solution unique. The result is minimal: no further
 * cell can come out.
 */
function digMinimal(rng: Rng, solution: string): string {
  const values = parseGrid(digPuzzle(rng, solution));
  for (const i of shuffle(rng, [...Array(81).keys()])) {
    if (values[i] === 0) continue;
    const saved = values[i]!;
    values[i] = 0;
    if (countSolutions(gridToString(values)) !== 1) values[i] = saved;
  }
  return gridToString(values);
}

function main() {
  const rng = createRng(SEED);
  const bins: Record<SudokuTier, SudokuPuzzle[]> = { 1: [], 2: [], 3: [] };
  const seen = new Set<string>();
  const started = Date.now();
  let attempts = 0;
  let discardedEasy = 0;
  let discardedBeyond = 0;

  while (attempts < MAX_ATTEMPTS && TIERS.some((t) => bins[t].length < TARGET[t])) {
    attempts++;
    const solution = generateSolvedGrid(rng);
    const givens = digMinimal(rng, solution);
    if (seen.has(givens)) continue;
    seen.add(givens);

    const rated = rateSudoku(givens);
    if (!rated) { discardedBeyond++; continue; }         // beyond the ladder
    if (rated.tier === 0) { discardedEasy++; continue; } // singles-only: below the bar
    const tier = rated.tier;
    if (bins[tier].length >= TARGET[tier]) continue;

    bins[tier].push({
      id: `sudoku-t${tier}-${String(bins[tier].length + 1).padStart(2, '0')}`,
      tier,
      givens,
      solution,
      techniques: rated.techniques,
    });
  }

  const puzzles = TIERS.flatMap((t) => bins[t]);
  validate(puzzles);

  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'sudoku.json');
  writeFileSync(outPath, JSON.stringify(puzzles));

  // Report: tier counts, given-count spread, and which advanced techniques the
  // pool actually exercises (a tier-3 bin with no swordfish is worth knowing).
  console.log(`sudoku.json: ${puzzles.length} puzzles in ${((Date.now() - started) / 1000).toFixed(1)}s`
    + ` (${attempts} boards dug; discarded ${discardedEasy} singles-only, ${discardedBeyond} beyond-ladder)`);
  for (const t of TIERS) {
    const bin = bins[t];
    if (bin.length === 0) { console.log(`  tier ${t}: NONE`); continue; }
    const gs = bin.map((p) => givenCount(p.givens));
    const counts = new Map<TechniqueId, number>();
    for (const p of bin) {
      for (const id of p.techniques) {
        if (TECHNIQUE_LEVEL[id] >= t) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const spread = [...counts.entries()].sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id}×${n}`).join(', ');
    console.log(`  tier ${t}: ${bin.length} boards · givens ${Math.min(...gs)}-${Math.max(...gs)}`
      + ` (median ${gs.sort((a, b) => a - b)[Math.floor(gs.length / 2)]}) · ${spread}`);
    if (bin.length < TARGET[t]) console.log(`    (short of the ${TARGET[t]} target)`);
  }
}

/**
 * Fail the build on any board that is not a solver-verified, uniquely
 * solvable, honestly tiered puzzle. Deliberately re-derives everything from
 * the `givens` string — the JSON's own `solution`/`techniques` fields are
 * treated as claims to be checked, not inputs.
 */
function validate(puzzles: SudokuPuzzle[]) {
  const problems: string[] = [];
  const ids = new Set<string>();
  const grids = new Set<string>();

  for (const p of puzzles) {
    if (ids.has(p.id)) problems.push(`${p.id}: duplicate id`);
    ids.add(p.id);
    if (grids.has(p.givens)) problems.push(`${p.id}: duplicate board`);
    grids.add(p.givens);

    if (!/^[1-9.]{81}$/.test(p.givens)) { problems.push(`${p.id}: malformed givens`); continue; }
    if (!/^[1-9]{81}$/.test(p.solution)) { problems.push(`${p.id}: malformed solution`); continue; }

    // Every given must agree with the shipped solution.
    for (let i = 0; i < 81; i++) {
      if (p.givens[i] !== '.' && p.givens[i] !== p.solution[i]) {
        problems.push(`${p.id}: given at ${i} contradicts the solution`);
        break;
      }
    }

    // Uniqueness (the whole point) + the shipped solution IS that solution.
    const n = countSolutions(p.givens, 2);
    if (n !== 1) problems.push(`${p.id}: ${n === 0 ? 'no solution' : 'multiple solutions'}`);
    if (solveOne(p.givens) !== p.solution) problems.push(`${p.id}: shipped solution mismatch`);

    // Honest tier: solvable with the full ladder, and the ladder one level
    // below must STALL (i.e. a level-`tier` technique is genuinely required).
    const full = solveWithTechniques(p.givens, 3);
    if (!full.solved) problems.push(`${p.id}: not solvable with the technique ladder`);
    else if (full.grid !== p.solution) problems.push(`${p.id}: technique solve disagrees with the solution`);
    if (full.maxLevel !== p.tier) {
      problems.push(`${p.id}: declared tier ${p.tier} but rates ${full.maxLevel}`);
    }
    const below = solveWithTechniques(p.givens, (p.tier - 1) as TechniqueLevel);
    if (below.solved) problems.push(`${p.id}: tier ${p.tier} but solvable one level below`);
    if (!p.techniques.some((id) => TECHNIQUE_LEVEL[id] === p.tier)) {
      problems.push(`${p.id}: technique list carries no level-${p.tier} technique`);
    }
    // Expert baseline: there is no tier 0 in the shipped pool, ever.
    if (!TIERS.includes(p.tier)) problems.push(`${p.id}: tier ${p.tier} is outside the expert band`);

    // Layout/aesthetic floor: 17 is the mathematical minimum; anything above
    // 34 givens is a filler board regardless of what it "requires".
    const g = givenCount(p.givens);
    if (g < 17 || g > 34) problems.push(`${p.id}: ${g} givens outside the 17-34 band`);
  }

  for (const t of TIERS) {
    const n = puzzles.filter((p) => p.tier === t).length;
    if (n < 20) problems.push(`tier ${t}: only ${n} boards (need >= 20 for seen-tracking headroom)`);
  }

  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'));
    throw new Error(`sudoku validation failed with ${problems.length} problem(s)`);
  }
}

main();
