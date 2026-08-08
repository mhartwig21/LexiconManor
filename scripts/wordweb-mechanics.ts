/**
 * THE WORD WEB MECHANIC CENSUS (REVIEW_AA §5.8).
 *
 * The review's charge was a number: *"67.3% of shipped groups are one of eleven
 * mechanical templates and the difficulty colours are decorative."* A number in
 * a review document is an assertion; a number a script prints is a measurement.
 * This is the script, and it confirms both halves exactly.
 *
 * It reads ONLY `content/generated/word-web.json` — the thing that ships. It
 * does not import the generator, does not re-run it, and does not consult the
 * authored source: a census that can only be taken by the machine that made the
 * thing is not a census. The taxonomy it classifies with lives in
 * `content/lib/wordweb-ladder.ts`, because the generator has to assign colours
 * from the same definitions the audit judges them by — a shared SPEC is the
 * point. What is deliberately NOT shared is the generator's internal
 * `familyOf`, which stays where it is, with `tests/puzzles/wordweb-ladder.test.ts`
 * failing if the two implementations ever disagree about a shipped label.
 *
 * Four measurements, four different questions:
 *
 *   TEMPLATE SHARE  — of the 11 label shapes the review named, what fraction of
 *     shipped groups is one of them? This is the review's headline figure.
 *   LETTER-MECHANIC SHARE — the same count with the compound frames taken out
 *     (see `LETTER_MECHANIC_FAMILIES` for why they are a different animal).
 *     This is the number that predicts whether the shelf feels like a checklist.
 *   FAMILY SHARE    — collapse the templates to the deduction performed, then
 *     ask what share of BOARDS each family appears on. A family is wallpaper if
 *     you meet it on too many nights, not if one board uses it twice.
 *   TIER HONESTY    — for each colour slot, the distribution of measured lateral
 *     distance. The colours are decorative exactly when this is flat.
 *
 * Run:  npx tsx scripts/wordweb-mechanics.ts
 *       npx tsx scripts/wordweb-mechanics.ts --json     (machine-readable)
 *       npx tsx scripts/wordweb-mechanics.ts --boards   (per-board detail)
 *       npx tsx scripts/wordweb-mechanics.ts --problems (every ladder failure)
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FINISH_MIN,
  LATERAL_BANDS,
  LETTER_MECHANIC_FAMILIES,
  POLICED_FAMILIES,
  SLOTS,
  TEMPLATES,
  WAY_IN_MAX,
  canonTheme,
  familySignature,
  familyOfTheme,
  isWayIn,
  ladderProblems,
  lateralOf,
  templateOf,
  type CensusBoard,
  type CensusFamily,
  type LadderProblem,
  type Slot,
} from '../content/lib/wordweb-ladder';

const here = dirname(fileURLToPath(import.meta.url));
const POOL = resolve(here, '..', 'content', 'generated', 'word-web.json');

// ---------------------------------------------------------------------------
// The census
// ---------------------------------------------------------------------------

export interface Census {
  boards: number;
  groups: number;
  templateCounts: Record<string, number>;
  templatedGroups: number;
  templateShare: number;
  familyGroupCounts: Record<string, number>;
  familyBoardCounts: Record<string, number>;
  familyBoardShare: Record<string, number>;
  topFamilyBoardShare: number;
  topLetterFamilyBoardShare: number;
  boardsWithRepeatedFamily: number;
  repeatedFamilyShare: number;
  letterMechanicGroups: number;
  letterMechanicShare: number;
  boardsWithTwoLetterMechanics: number;
  twoLetterMechanicShare: number;
  boardsWithNoWayIn: number;
  boardsWithNoFinish: number;
  topFamilySignature: [string, number] | null;
  topFamilySignatureShare: number;
  distinctFamilySignatures: number;
  distinctThemes: number;
  slotLateral: Record<Slot, { mean: number; min: number; max: number; n: number }>;
  ladderProblems: LadderProblem[];
  boardsWithLadderProblems: number;
}

export function census(boards: readonly CensusBoard[]): Census {
  const templateCounts: Record<string, number> = {};
  const familyGroupCounts: Record<string, number> = {};
  const familyBoardCounts: Record<string, number> = {};
  const themes = new Set<string>();
  const slotTotals: Record<Slot, number[]> = { yellow: [], green: [], blue: [], purple: [] };
  const problems: LadderProblem[] = [];
  const sigTally = new Map<string, number>();
  let templated = 0;
  let groups = 0;
  let repeatedFamilyBoards = 0;
  let letterGroups = 0;
  let twoLetterBoards = 0;
  let noWayIn = 0;
  let noFinish = 0;

  for (const b of boards) {
    const ambiguous = new Set(b.ambiguousWords ?? []);
    const seenFamilies = new Set<CensusFamily>();
    const familyHits = new Map<CensusFamily, number>();
    let boardLetterGroups = 0;

    for (const g of b.groups) {
      groups += 1;
      themes.add(canonTheme(g.theme));
      const tpl = templateOf(g.theme);
      templateCounts[tpl] = (templateCounts[tpl] ?? 0) + 1;
      if (tpl !== 'other') templated += 1;
      const fam = familyOfTheme(g.theme);
      familyGroupCounts[fam] = (familyGroupCounts[fam] ?? 0) + 1;
      seenFamilies.add(fam);
      familyHits.set(fam, (familyHits.get(fam) ?? 0) + 1);
      if (LETTER_MECHANIC_FAMILIES.includes(fam)) { letterGroups += 1; boardLetterGroups += 1; }
      slotTotals[g.tier].push(lateralOf(g, ambiguous).total);
    }

    if (boardLetterGroups >= 2) twoLetterBoards += 1;
    if (!b.groups.some(isWayIn)) noWayIn += 1;
    if (!b.groups.some((g) => lateralOf(g, ambiguous).total >= FINISH_MIN)) noFinish += 1;
    const sig = familySignature(b.groups);
    sigTally.set(sig, (sigTally.get(sig) ?? 0) + 1);

    for (const fam of seenFamilies) {
      familyBoardCounts[fam] = (familyBoardCounts[fam] ?? 0) + 1;
    }
    if ([...familyHits].some(([fam, n]) => n > 1 && POLICED_FAMILIES.includes(fam))) {
      repeatedFamilyBoards += 1;
    }
    problems.push(...ladderProblems(b));
  }

  const familyBoardShare: Record<string, number> = {};
  for (const [fam, n] of Object.entries(familyBoardCounts)) {
    familyBoardShare[fam] = n / boards.length;
  }
  const topFamilyBoardShare = Math.max(
    0,
    ...POLICED_FAMILIES.map((f) => familyBoardShare[f] ?? 0),
  );
  const topLetterFamilyBoardShare = Math.max(
    0,
    ...LETTER_MECHANIC_FAMILIES.map((f) => familyBoardShare[f] ?? 0),
  );
  const sigRows = [...sigTally].sort((a, b) => b[1] - a[1]);

  const slotLateral = {} as Census['slotLateral'];
  for (const s of SLOTS) {
    const xs = slotTotals[s];
    slotLateral[s] = {
      mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0,
      min: xs.length ? Math.min(...xs) : 0,
      max: xs.length ? Math.max(...xs) : 0,
      n: xs.length,
    };
  }

  return {
    boards: boards.length,
    groups,
    templateCounts,
    templatedGroups: templated,
    templateShare: groups ? templated / groups : 0,
    familyGroupCounts,
    familyBoardCounts,
    familyBoardShare,
    topFamilyBoardShare,
    topLetterFamilyBoardShare,
    boardsWithRepeatedFamily: repeatedFamilyBoards,
    repeatedFamilyShare: boards.length ? repeatedFamilyBoards / boards.length : 0,
    letterMechanicGroups: letterGroups,
    letterMechanicShare: groups ? letterGroups / groups : 0,
    boardsWithTwoLetterMechanics: twoLetterBoards,
    twoLetterMechanicShare: boards.length ? twoLetterBoards / boards.length : 0,
    boardsWithNoWayIn: noWayIn,
    boardsWithNoFinish: noFinish,
    topFamilySignature: sigRows[0] ?? null,
    topFamilySignatureShare: boards.length ? (sigRows[0]?.[1] ?? 0) / boards.length : 0,
    distinctFamilySignatures: sigRows.length,
    distinctThemes: themes.size,
    slotLateral,
    ladderProblems: problems,
    boardsWithLadderProblems: new Set(problems.map((p) => p.boardId)).size,
  };
}

export function loadPool(path: string = POOL): CensusBoard[] {
  return JSON.parse(readFileSync(path, 'utf8')) as CensusBoard[];
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function bar(n: number, max: number, width = 28): string {
  const filled = max > 0 ? Math.round((n / max) * width) : 0;
  return '█'.repeat(filled).padEnd(width, '·');
}

function main(): void {
  const args = process.argv.slice(2);
  const boards = loadPool();
  const c = census(boards);

  if (args.includes('--json')) {
    console.log(JSON.stringify(c, null, 2));
    return;
  }

  console.log('');
  console.log('  WORD WEB MECHANIC CENSUS');
  console.log(`  ${c.boards} boards · ${c.groups} groups · ${c.distinctThemes} distinct category labels`);
  console.log('');

  console.log('  TEMPLATE SHARE — the review’s eleven label shapes');
  const tplRows = TEMPLATES.map((t) => [t, c.templateCounts[t] ?? 0] as const)
    .sort((a, b) => b[1] - a[1]);
  const tplMax = Math.max(...tplRows.map((r) => r[1]), 1);
  for (const [name, n] of tplRows) {
    if (n === 0) continue;
    console.log(`    ${name.padEnd(15)} ${String(n).padStart(4)}  ${bar(n, tplMax)}  ${pct(n / c.groups)}`);
  }
  const other = c.templateCounts['other'] ?? 0;
  console.log(`    ${'(not templated)'.padEnd(15)} ${String(other).padStart(4)}  ${bar(other, tplMax)}  ${pct(other / c.groups)}`);
  console.log('');
  console.log(`    TEMPLATED (all 11): ${c.templatedGroups} of ${c.groups} groups = ${pct(c.templateShare)}`);
  console.log(`    LETTER MECHANICS  : ${c.letterMechanicGroups} of ${c.groups} groups = ${pct(c.letterMechanicShare)}`);
  console.log(`      (the difference is the compound frames — ‘___ BAR’, ‘IRON ___’, ‘Can Follow "EYE"’ —`);
  console.log(`       which are read in English, not decoded. See LETTER_MECHANIC_FAMILIES.)`);
  console.log(`    BOARDS RUNNING TWO LETTER MECHANICS: ${c.boardsWithTwoLetterMechanics} = ${pct(c.twoLetterMechanicShare)}`);
  console.log('');

  console.log('  FAMILY SHARE — boards carrying at least one group of each family');
  const famRows = Object.entries(c.familyBoardCounts).sort((a, b) => b[1] - a[1]);
  const famMax = Math.max(...famRows.map((r) => r[1]), 1);
  for (const [name, n] of famRows) {
    const policed = POLICED_FAMILIES.includes(name as CensusFamily) ? ' ' : ' ·';
    console.log(`    ${name.padEnd(13)}${policed}${String(n).padStart(4)}  ${bar(n, famMax)}  ${pct(n / c.boards)}`);
  }
  console.log(`    (· = not policed — semantics and trivia are the point, not the wallpaper)`);
  console.log('');
  console.log(`    TOP POLICED FAMILY:        ${pct(c.topFamilyBoardShare)} of boards`);
  console.log(`    TOP LETTER-MECHANIC FAMILY: ${pct(c.topLetterFamilyBoardShare)} of boards`);
  console.log(`    BOARDS WITH THE SAME POLICED FAMILY TWICE: ${c.boardsWithRepeatedFamily} = ${pct(c.repeatedFamilyShare)}`);
  console.log('');
  console.log('  ARCHITECTURE — which four tricks a board asks for');
  console.log(`    distinct family signatures: ${c.distinctFamilySignatures}`);
  console.log(
    `    most common: ${c.topFamilySignature ? `${c.topFamilySignature[0]} ×${c.topFamilySignature[1]}` : '—'} = ${pct(c.topFamilySignatureShare)}`,
  );
  console.log('');

  console.log('  TIER HONESTY — measured lateral distance per colour slot (0–9)');
  for (const s of SLOTS) {
    const d = c.slotLateral[s];
    const [lo, hi] = LATERAL_BANDS[s];
    console.log(
      `    ${s.padEnd(7)} n=${String(d.n).padStart(4)}  mean ${d.mean.toFixed(2)}  range ${d.min}–${d.max}   band ${lo}–${hi}`,
    );
  }
  const spread = c.slotLateral.purple.mean - c.slotLateral.yellow.mean;
  console.log('');
  console.log(`    LADDER SPREAD (purple mean − yellow mean): ${spread.toFixed(2)}`);
  console.log(`    BOARDS WITH NO WAY IN (no group ≤ ${WAY_IN_MAX}):  ${c.boardsWithNoWayIn} = ${pct(c.boardsWithNoWayIn / c.boards)}`);
  console.log(`    BOARDS WITH NO FINISH (no group ≥ ${FINISH_MIN}): ${c.boardsWithNoFinish} = ${pct(c.boardsWithNoFinish / c.boards)}`);
  console.log(
    `    BOARDS WHOSE COLOURS DO NOT MATCH THEIR DIFFICULTY: ${c.boardsWithLadderProblems} = ${pct(c.boardsWithLadderProblems / c.boards)}`,
  );
  const byKind = new Map<string, number>();
  for (const p of c.ladderProblems) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
  for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${kind.padEnd(11)} ${n}`);
  }
  console.log('');

  if (args.includes('--boards')) {
    console.log('  PER-BOARD DETAIL');
    for (const b of boards) {
      const amb = new Set(b.ambiguousWords ?? []);
      const line = SLOTS.map((s) => {
        const g = b.groups.find((x) => x.tier === s);
        return g ? `${s[0]}${lateralOf(g, amb).total}` : `${s[0]}-`;
      }).join(' ');
      const probs = ladderProblems(b);
      console.log(`    ${b.id.padEnd(10)} t${b.tier}  ${line}  ${probs.length ? '✗ ' + probs.map((p) => p.detail).join('; ') : ''}`);
    }
    console.log('');
  }

  if (args.includes('--problems')) {
    for (const p of c.ladderProblems) {
      console.log(`    ${p.boardId.padEnd(10)} ${p.kind.padEnd(10)} ${p.detail}`);
    }
  }
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) {
  main();
}
