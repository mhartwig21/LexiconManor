/**
 * Round-3 capture helper: precompute, for a FIXED daySeed, which puzzle each
 * seeded room cell will select (RoomHost re-selects deterministically via
 * roomSeed(daySeed, cellKey)), plus everything a Playwright driver needs to
 * play it: answers, a deliberate-mistake input, tap paths, cipher mapping.
 * Output: docs/shots/round3/plan.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roomSeed } from '../src/engine/manor/grid';
import { getRoomAdapter } from '../src/engine/rooms/registry';
import { findPath } from '../src/engine/twistle';
import { CENTER_INDEX } from '../src/engine/twistle';

const DAY_SEED = 424242;
const TIER = 1 as const;

const CELLS: Record<string, string> = {
  hive: '0,1',
  twistle: '1,1',
  'word-web': '3,1',
  'forgotten-word': '4,1',
  cipher: '0,2',
  ladder: '1,2',
  category: '2,2',
  crossword: '3,2',
  rhyme: '4,2',
};

const plan: Record<string, unknown> = { daySeed: DAY_SEED, tier: TIER, cells: CELLS };

for (const [kind, key] of Object.entries(CELLS)) {
  const adapter = getRoomAdapter(kind as never)!;
  const seed = roomSeed(DAY_SEED, key);
  const puzzle: any = adapter.select({ tier: TIER, seed, seenIds: [] });
  const entry: any = { cellKey: key, puzzleId: puzzle.id };

  switch (kind) {
    case 'hive': {
      entry.center = puzzle.center;
      entry.outer = puzzle.outer;
      // Longest-first so we cross the 70% threshold in few submissions.
      entry.words = [...puzzle.validWords].sort((a: string, b: string) => b.length - a.length);
      // A wrong word: allowed letters + center, not in the list.
      const valid = new Set(puzzle.validWords);
      const c = puzzle.center;
      const o = puzzle.outer;
      let wrong: string | null = null;
      outer: for (const a of [c, ...o]) for (const b of [c, ...o]) for (const d of o) {
        const w = `${a}${b}${c}${d}`;
        if (!valid.has(w)) { wrong = w; break outer; }
      }
      entry.wrongWord = wrong;
      break;
    }
    case 'twistle': {
      entry.grid = puzzle.grid;
      entry.targetCount = puzzle.targetCount;
      entry.rules = puzzle.rules;
      entry.targetWords = puzzle.targetWords;
      const paths: { word: string; path: number[] }[] = [];
      for (const w of puzzle.targetWords) {
        if (paths.length >= puzzle.targetCount + 2) break;
        const p = findPath(puzzle.grid, w, puzzle.rules);
        if (p) paths.push({ word: w, path: p });
      }
      entry.solvePaths = paths;
      // Costed mistake = a word traceable ONLY off-center while centerRequired.
      entry.mistakePath = null;
      if (puzzle.rules.centerRequired) {
        for (const w of puzzle.targetWords) {
          const withC = findPath(puzzle.grid, w, puzzle.rules);
          const withoutC = findPath(puzzle.grid, w, { ...puzzle.rules, centerRequired: false });
          if (!withC && withoutC && !withoutC.includes(CENTER_INDEX)) {
            entry.mistakePath = { word: w, path: withoutC };
            break;
          }
        }
      }
      break;
    }
    case 'word-web': {
      entry.groups = puzzle.groups;
      // "one away": 3 from the first group + 1 from the second.
      entry.mistakeSelection = [...puzzle.groups[0].words.slice(0, 3), puzzle.groups[1].words[0]];
      break;
    }
    case 'forgotten-word': {
      entry.word = puzzle.word;
      entry.wrongGuess = puzzle.word === 'LANTERN' ? 'CANDLE' : 'LANTERN';
      break;
    }
    case 'cipher': {
      entry.ciphertext = puzzle.ciphertext;
      entry.plaintext = puzzle.plaintext;
      entry.reveals = puzzle.reveals;
      const mapping: Record<string, string> = {};
      for (let i = 0; i < puzzle.ciphertext.length; i++) {
        const cch = puzzle.ciphertext[i];
        if (/[A-Z]/.test(cch)) mapping[cch] = puzzle.plaintext[i];
      }
      for (const r of puzzle.reveals) delete mapping[r];
      entry.mapping = mapping;
      // Mistake: swap the plains of the first two cipher letters.
      const keys = Object.keys(mapping);
      const wrongMapping = { ...mapping };
      if (keys.length >= 2) {
        const [k1, k2] = keys;
        wrongMapping[k1] = mapping[k2];
        wrongMapping[k2] = mapping[k1];
      }
      entry.wrongMapping = wrongMapping;
      entry.swapped = keys.slice(0, 2);
      break;
    }
    case 'ladder': {
      entry.start = puzzle.start;
      entry.target = puzzle.target;
      entry.par = puzzle.par;
      entry.solution = puzzle.solution;
      break;
    }
    case 'category': {
      entry.label = puzzle.label;
      entry.target = puzzle.target;
      entry.accepted = puzzle.accepted.slice(0, 40);
      entry.trap = (puzzle.traps ?? [])[0]?.word ?? (puzzle.traps ?? [])[0] ?? null;
      entry.traps = puzzle.traps;
      break;
    }
    case 'crossword': {
      entry.size = puzzle.size;
      entry.entries = puzzle.entries;
      break;
    }
    case 'rhyme': {
      entry.rounds = puzzle.rounds;
      entry.decoy = puzzle.rounds[0].decoys?.[0] ?? null;
      break;
    }
  }
  plan[kind] = entry;
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/shots/round3/plan.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(plan, null, 2));
console.log('wrote', out);
for (const [k, v] of Object.entries(plan)) {
  if (typeof v === 'object' && v && 'puzzleId' in (v as any)) console.log(k, (v as any).puzzleId);
}
