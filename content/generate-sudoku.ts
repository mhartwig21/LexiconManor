import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, shuffle, type Rng } from '../src/engine/rng';
import {
  ABOVE_NYT_HARD, SUDOKU_TIER_GRADE, TECHNIQUE_LEVEL, countSolutions, digPuzzle,
  generateSolvedGrid, gridToString, parseGrid, rateSudoku, solveOne, solveWithTechniques,
  type SudokuPuzzle, type SudokuTier, type TechniqueId, type TechniqueLevel,
} from '../src/engine/puzzles/sudoku';

/**
 * Sudoku generator for The Counting House.
 *
 * OWNER DIRECTIVE (playtest round): the player is an EXPERT solver, so the TOP
 * of the ladder sits above anything a newspaper prints. What round 27 changed
 * is that the ladder now has a bottom and a middle as well, and all three rungs
 * are graded against a benchmark instead of against the generator's own output
 * histogram. `docs/BENCHMARKS.md` section 7 is that benchmark;
 * `SUDOKU_TIER_GRADE` in engine/puzzles/sudoku.ts is the row it is written into:
 *
 *   tier 1  locked candidates only       = NYT MEDIUM   ~30 givens (~51 blanks)
 *   tier 2  + naked/hidden pairs/triples = NYT HARD     ~26 givens (~55 blanks)
 *   tier 3  + wing / fish / colouring    ABOVE NYT HARD ~24 givens (~57 blanks)
 *
 * WHY THIS FILE GREW A DIG LADDER
 * Difficulty has two independent levers and this generator only ever pulled
 * one. Every board it shipped was dug to TRUE MINIMALITY, so all three tiers
 * came out at 24-25 givens: fifty-seven placements at every storey, and the
 * only thing that changed with the tier was the technique. That is why the
 * ground-floor room took twelve and a half minutes.
 *
 * So a board is now dug to ITS TIER'S GIVEN BAND (`SUDOKU_TIER_GRADE.givens`)
 * as well as rated by its technique ceiling. Each solved grid is dug FOUR ways
 * - three symmetric digs stopped at descending given floors, plus the old
 * symmetric-then-minimal pass - every result is rated, and a result is only
 * binned if its given count is inside the band its rating names. A shallow dig
 * that rates tier 3 is discarded (it is a tier-3 technique on a tier-1-length
 * board, which is not what the storey promises), and so is a minimal dig that
 * rates tier 1. Length and technique climb together or the board does not ship.
 *
 * The yield cost is real and worth stating: level-2 boards are the scarce bin
 * (~8% of dug boards before the given-band filter), which is why MAX_ATTEMPTS
 * is where it is. Boards that fall to singles alone (= NYT Easy) are discarded
 * outright: there is no easy bin anywhere in this pool.
 *
 * Boards the ladder cannot finish at all (they need forcing chains or
 * uniqueness arguments) are DISCARDED, not shipped at tier 3: a puzzle the
 * shipped rater cannot verify is a puzzle whose hint could lie.
 *
 * Pipeline, per board: seeded full grid -> 180-degree-symmetric dig (the
 * newspaper aesthetic) to a given floor -> optional single-cell finishing pass
 * to TRUE minimality for the deep end, every removal gated on the backtracking
 * solver still proving a UNIQUE solution -> rate -> bin if the length agrees.
 *
 * Every shipped board is re-verified in validate() (uniqueness, solution
 * match, tier requirement, tier-length band, and the round-27 grading gate:
 * no tier-2 board may require a wing/fish/colouring and every tier-3 board
 * must), and tests/puzzles/sudoku.test.ts replays that verification against the
 * shipped JSON so a hand-edited file cannot lie.
 */

const SEED = 20260811;

/** ~120 boards, evenly across the three technique tiers. */
const TARGET: Record<SudokuTier, number> = { 1: 40, 2: 40, 3: 40 };

/** Safety valve: total boards dug before we give up and report. */
const MAX_ATTEMPTS = 4000;

const TIERS: SudokuTier[] = [1, 2, 3];

function givenCount(givens: string): number {
  return [...givens].filter((c) => c !== '.').length;
}

/**
 * Symmetric dig, then a shuffled single-cell pass that removes every given
 * whose removal keeps the solution unique. The result is minimal: no further
 * cell can come out. This is the deep end of the dig ladder - it is what makes
 * a tier-3 board fifty-seven placements long.
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

/**
 * THE DIG LADDER (round 27). Symmetric digs stopped at descending given floors,
 * then the minimal pass. The floors bracket the three tier bands in
 * `SUDOKU_TIER_GRADE` from above, so the shallow digs are the only source of
 * tier-1-length boards and the minimal pass is the only source of tier-3-length
 * ones - a dig depth cannot supply a band it cannot reach.
 */
const DIG_FLOORS: readonly number[] = [31, 29, 26];

function digLadder(rng: Rng, solution: string): string[] {
  return [...DIG_FLOORS.map((floor) => digPuzzle(rng, solution, floor)), digMinimal(rng, solution)];
}

/** Does this board's LENGTH agree with the tier its technique ceiling names? */
function lengthAgrees(tier: SudokuTier, givens: string): boolean {
  const [lo, hi] = SUDOKU_TIER_GRADE[tier].givens;
  const n = givenCount(givens);
  return n >= lo && n <= hi;
}

/** Techniques a board needs that sit above NYT Hard (BENCHMARKS section 7). */
function huntsFor(techniques: readonly TechniqueId[]): TechniqueId[] {
  return techniques.filter((id) => ABOVE_NYT_HARD.includes(id));
}

function main() {
  const rng = createRng(SEED);
  const bins: Record<SudokuTier, SudokuPuzzle[]> = { 1: [], 2: [], 3: [] };
  const seen = new Set<string>();
  const started = Date.now();
  let attempts = 0;
  let dug = 0;
  let discardedEasy = 0;
  let discardedBeyond = 0;
  let discardedLength = 0;

  while (attempts < MAX_ATTEMPTS && TIERS.some((t) => bins[t].length < TARGET[t])) {
    attempts++;
    const solution = generateSolvedGrid(rng);

    for (const givens of digLadder(rng, solution)) {
      dug++;
      if (seen.has(givens)) continue;
      seen.add(givens);

      const rated = rateSudoku(givens);
      if (!rated) { discardedBeyond++; continue; }         // beyond the ladder
      if (rated.tier === 0) { discardedEasy++; continue; } // = NYT Easy: below the bar
      const tier = rated.tier;
      // ROUND 27 - LENGTH AND TECHNIQUE CLIMB TOGETHER OR THE BOARD DOES NOT
      // SHIP. A tier-3 technique on a thirty-given board is a five-minute room
      // wearing the top storey's name, and a tier-1 technique on a minimal dig
      // is the twelve-and-a-half-minute ground floor this round was called to
      // fix. Both are discarded here rather than argued about downstream.
      if (!lengthAgrees(tier, givens)) { discardedLength++; continue; }
      if (bins[tier].length >= TARGET[tier]) continue;

      bins[tier].push({
        id: `sudoku-t${tier}-${String(bins[tier].length + 1).padStart(2, '0')}`,
        tier,
        givens,
        solution,
        techniques: rated.techniques,
      });
    }
  }

  const puzzles = TIERS.flatMap((t) => bins[t]);
  validate(puzzles);

  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'generated', 'sudoku.json');
  writeFileSync(outPath, JSON.stringify(puzzles));

  // Report: tier counts, given-count spread, the technique ceiling each bin
  // actually exercises, and the round-27 grade - the share of each bin that
  // needs something above NYT Hard, which must be 0% at tier 2 and 100% at 3.
  console.log(`sudoku.json: ${puzzles.length} puzzles in ${((Date.now() - started) / 1000).toFixed(1)}s`
    + ` (${attempts} grids, ${dug} boards dug; discarded ${discardedEasy} singles-only,`
    + ` ${discardedBeyond} beyond-ladder, ${discardedLength} wrong-length-for-tier)`);
  for (const t of TIERS) {
    const bin = bins[t];
    if (bin.length === 0) { console.log(`  tier ${t}: NONE`); continue; }
    const gs = bin.map((p) => givenCount(p.givens)).sort((a, b) => a - b);
    const counts = new Map<TechniqueId, number>();
    for (const p of bin) {
      for (const id of p.techniques) {
        if (TECHNIQUE_LEVEL[id] >= t) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const spread = [...counts.entries()].sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id} x${n}`).join(', ');
    const hunts = bin.filter((p) => huntsFor(p.techniques).length > 0).length;
    console.log(`  tier ${t} (${SUDOKU_TIER_GRADE[t].nyt}): ${bin.length} boards`
      + ` - givens ${gs[0]}-${gs[gs.length - 1]} (median ${gs[Math.floor(gs.length / 2)]})`
      + ` - above-NYT-Hard ${((100 * hunts) / bin.length).toFixed(0)}% - ${spread}`);
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

    // ROUND 27 - LENGTH IS GRADED TOO. 17 is the mathematical minimum and
    // anything above 34 givens is a filler board, but the binding check is the
    // TIER's own band: a board must be as long as its storey claims.
    const g = givenCount(p.givens);
    if (g < 17 || g > 34) problems.push(`${p.id}: ${g} givens outside the 17-34 band`);
    const band = SUDOKU_TIER_GRADE[p.tier].givens;
    if (g < band[0] || g > band[1]) {
      problems.push(`${p.id}: ${g} givens outside tier ${p.tier} band ${band[0]}-${band[1]}`);
    }

    // THE GRADE (BENCHMARKS section 7): NYT Hard never asks for a wing, a fish
    // or a colouring chain, so tier 2 may not either - and tier 3 is defined as
    // the rung that does. Re-derived from the board, not read off the claim.
    const hunts = huntsFor(solveWithTechniques(p.givens, 3).techniques);
    if (p.tier <= 2 && hunts.length > 0) {
      problems.push(`${p.id}: tier ${p.tier} but needs ${hunts.join('/')} (above NYT Hard)`);
    }
    if (p.tier === 3 && hunts.length === 0) {
      problems.push(`${p.id}: tier 3 but needs nothing above NYT Hard`);
    }
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
