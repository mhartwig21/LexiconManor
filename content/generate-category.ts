import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CategoryPuzzle, CategoryTrap } from '../src/engine/puzzles/category';
import type { Difficulty } from '../src/engine/types';

/**
 * Category-sprint builder for The Pantry. OWNER: A5.
 *
 * Reads the hand-curated content/authored/categories.json, validates it,
 * expands cheap word-form variants (plural/singular forms that exist in
 * enable1 — BASIL→BASILS never appears because enable1 says so, HERB→HERBS
 * does), and ships CategoryPuzzle[] with target/par baked in.
 *
 * Sprint economy (MANOR_DESIGN §11, AAA 3.6): parTicks = 2×target — at the
 * view's 8s cadence a 5-word shelf allows 80 comfortable seconds; ticks past
 * par cost a weight-1 mistake each, capped at maxCostedTicks (3), then the
 * pantry stops charging. Never a real-time fail state.
 */

const dir = dirname(fileURLToPath(import.meta.url));

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const TARGETS: Record<Difficulty, number> = { easy: 5, medium: 5, hard: 4, expert: 4 };
const MAX_COSTED_TICKS = 3;

interface AuthoredCategory {
  id: string;
  label: string;
  flavor?: string;
  difficulty: Difficulty;
  members: string[];
  traps: CategoryTrap[];
}

function variantsOf(word: string, enable1: Set<string>): string[] {
  const out: string[] = [];
  const candidates: string[] = [];
  // pluralize
  if (word.endsWith('Y') && !/[AEIOU]Y$/.test(word)) candidates.push(word.slice(0, -1) + 'IES');
  else if (/(S|X|Z|CH|SH)$/.test(word)) candidates.push(word + 'ES');
  else candidates.push(word + 'S');
  // singularize
  if (word.endsWith('IES')) candidates.push(word.slice(0, -3) + 'Y');
  else if (word.endsWith('ES')) candidates.push(word.slice(0, -2));
  if (word.endsWith('S') && !word.endsWith('SS')) candidates.push(word.slice(0, -1));
  for (const c of candidates) {
    if (c.length >= 3 && enable1.has(c)) out.push(c);
  }
  return out;
}

function main() {
  const raw = JSON.parse(readFileSync(join(dir, 'authored', 'categories.json'), 'utf8')) as {
    categories: AuthoredCategory[];
  };
  const enable1 = new Set(
    readFileSync(join(dir, 'data', 'enable1.txt'), 'utf8').split('\n').map((w) => w.trim().toUpperCase()),
  );

  const problems: string[] = [];
  const warns: string[] = [];
  const ids = new Set<string>();
  const puzzles: CategoryPuzzle[] = [];

  for (const cat of raw.categories) {
    if (ids.has(cat.id)) problems.push(`${cat.id}: duplicate id`);
    ids.add(cat.id);
    if (!cat.label || cat.label.length > 48) problems.push(`${cat.id}: bad label`);
    if (!DIFFS.includes(cat.difficulty)) problems.push(`${cat.id}: bad difficulty`);
    const target = TARGETS[cat.difficulty];

    const accepted = new Set<string>();
    for (const m of cat.members) {
      if (!/^[A-Z]{2,15}$/.test(m)) {
        problems.push(`${cat.id}: member "${m}" is not plain uppercase letters`);
        continue;
      }
      accepted.add(m);
      for (const v of variantsOf(m, enable1)) accepted.add(v);
      if (m.length >= 3 && !enable1.has(m)) warns.push(`${cat.id}: "${m}" not in enable1 (kept — curated)`);
    }
    for (const t of cat.traps) {
      if (!/^[A-Z]{2,15}$/.test(t.word)) problems.push(`${cat.id}: trap "${t.word}" malformed`);
      if (!t.note || t.note.length > 90) problems.push(`${cat.id}: trap "${t.word}" needs a note ≤90 chars`);
      if (accepted.has(t.word)) problems.push(`${cat.id}: trap "${t.word}" is also accepted`);
      // A trap's expanded variants must not sneak into accepted either way.
      for (const v of variantsOf(t.word, enable1)) {
        if (accepted.has(v)) problems.push(`${cat.id}: trap variant "${v}" is accepted — resolve the clash`);
      }
    }
    if (accepted.size < target + 4) {
      problems.push(`${cat.id}: only ${accepted.size} accepted for target ${target} (want ≥ target+4)`);
    }

    puzzles.push({
      id: `category-${cat.id}`,
      difficulty: cat.difficulty,
      label: cat.label,
      flavor: cat.flavor,
      accepted: [...accepted].sort(),
      traps: cat.traps,
      target,
      parTicks: target * 2,
      maxCostedTicks: MAX_COSTED_TICKS,
    });
  }

  for (const difficulty of DIFFS) {
    const n = puzzles.filter((p) => p.difficulty === difficulty).length;
    if (n < 4) problems.push(`only ${n} ${difficulty} categories — author more (want ≥4 per difficulty)`);
    console.log(`${difficulty}: ${n} categories`);
  }

  if (warns.length > 0) console.warn(warns.join('\n'));
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    throw new Error(`category validation failed with ${problems.length} problem(s)`);
  }

  writeFileSync(join(dir, 'generated', 'category.json'), JSON.stringify(puzzles));
  console.log(`category.json: ${puzzles.length} categories`);
}

main();
