import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CategoryEntry, CategoryPuzzle, CategoryTrap } from '../src/engine/puzzles/category';
import type { Difficulty } from '../src/engine/types';

/**
 * Category-sprint builder for The Pantry. OWNER: A5.
 *
 * Reads the hand-curated content/authored/categories.json, validates it,
 * expands word-form variants, and ships CategoryPuzzle[] with target/par
 * baked in.
 *
 * Plural honesty (3.5 integrity; BENCHMARKS §1 "editor bans S"): every
 * accepted string is a {word, lemma} pair — BLACKBIRDS carries lemma
 * BLACKBIRD, GEESE carries GOOSE — and the engine counts LEMMAS, so typing
 * your last answer plus S earns the 'already shelved' toast, never a second
 * point. Variants come from an irregular-plural table first (GOOSE→GEESE,
 * CALF→CALVES; never a naive +S, so GOOSES/CALFS cannot ship), then the
 * regular rules, and only when the resulting form exists in enable1.
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

/** Irregular singular→plural. Words listed here NEVER take a naive +S. */
const IRREGULAR_PLURALS: Record<string, string> = {
  GOOSE: 'GEESE', OX: 'OXEN', CALF: 'CALVES', FOOT: 'FEET', TOOTH: 'TEETH',
  MOUSE: 'MICE', MAN: 'MEN', WOMAN: 'WOMEN', CHILD: 'CHILDREN',
  LEAF: 'LEAVES', LOAF: 'LOAVES', HALF: 'HALVES', KNIFE: 'KNIVES',
  WIFE: 'WIVES', LIFE: 'LIVES', WOLF: 'WOLVES', HOOF: 'HOOVES',
  SCARF: 'SCARVES', SHELF: 'SHELVES', THIEF: 'THIEVES', ELF: 'ELVES',
  // zero-plural animals: no separate plural form to add
  SHEEP: 'SHEEP', DEER: 'DEER', FISH: 'FISH', SWINE: 'SWINE',
};
const IRREGULAR_SINGULARS: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR_PLURALS).filter(([s, p]) => s !== p).map(([s, p]) => [p, s]),
);

/** Regular plural of a word, or null when it has an irregular form. */
function regularPlural(word: string): string | null {
  if (IRREGULAR_PLURALS[word]) return null;
  if (word.endsWith('Y') && !/[AEIOU]Y$/.test(word)) return word.slice(0, -1) + 'IES';
  if (/(S|X|Z|CH|SH)$/.test(word)) return word + 'ES';
  return word + 'S';
}

/** Best-effort singular of a word (irregulars first, then regular rules). */
function singularOf(word: string): string | null {
  if (IRREGULAR_SINGULARS[word]) return IRREGULAR_SINGULARS[word]!;
  if (word.endsWith('IES') && word.length > 4) return word.slice(0, -3) + 'Y';
  if (/(X|Z|CH|SH|SS)ES$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('S') && !word.endsWith('SS') && word.length > 3) return word.slice(0, -1);
  return null;
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

    // Lemma of an authored member: its singular when that form is itself a
    // member or a real word (GEESE→GOOSE, CHIVES→CHIVE); otherwise itself.
    const memberSet = new Set(cat.members);
    const lemmaOfMember = (m: string): string => {
      const sing = singularOf(m);
      if (sing && (memberSet.has(sing) || enable1.has(sing))) return sing;
      return m;
    };

    const byWord = new Map<string, CategoryEntry>();
    const addEntry = (word: string, lemma: string, curated: boolean) => {
      if (word.length < 3) return;
      if (!curated && !enable1.has(word)) return; // fabricated forms must be real words
      if (!byWord.has(word)) byWord.set(word, { word, lemma });
    };

    for (const m of cat.members) {
      if (!/^[A-Z]{2,15}$/.test(m)) {
        problems.push(`${cat.id}: member "${m}" is not plain uppercase letters`);
        continue;
      }
      const lemma = lemmaOfMember(m);
      addEntry(m, lemma, true);
      if (m.length >= 3 && !enable1.has(m)) warns.push(`${cat.id}: "${m}" not in enable1 (kept — curated)`);
      // Variant expansion: irregular plural first, else regular; plus the
      // singular of an authored plural. All map to the same lemma.
      const irr = IRREGULAR_PLURALS[m];
      if (irr && irr !== m) addEntry(irr, lemma, false);
      else if (!irr) {
        const plural = regularPlural(m);
        if (plural) addEntry(plural, lemma, false);
      }
      const sing = singularOf(m);
      if (sing) addEntry(sing, lemma, false);
    }
    const accepted = [...byWord.values()].sort((a, b) => a.word.localeCompare(b.word));
    const acceptedWords = new Set(accepted.map((e) => e.word));
    const lemmas = new Set(accepted.map((e) => e.lemma));

    for (const t of cat.traps) {
      if (!/^[A-Z]{2,15}$/.test(t.word)) problems.push(`${cat.id}: trap "${t.word}" malformed`);
      if (!t.note || t.note.length > 90) problems.push(`${cat.id}: trap "${t.word}" needs a note ≤90 chars`);
      if (acceptedWords.has(t.word)) problems.push(`${cat.id}: trap "${t.word}" is also accepted`);
      // A trap's expanded variants must not sneak into accepted either way.
      const trapKin = [IRREGULAR_PLURALS[t.word], regularPlural(t.word), singularOf(t.word)];
      for (const v of trapKin) {
        if (v && acceptedWords.has(v)) problems.push(`${cat.id}: trap variant "${v}" is accepted — resolve the clash`);
      }
    }
    if (lemmas.size < target + 4) {
      problems.push(`${cat.id}: only ${lemmas.size} distinct lemmas for target ${target} (want ≥ target+4)`);
    }

    puzzles.push({
      id: `category-${cat.id}`,
      difficulty: cat.difficulty,
      label: cat.label,
      flavor: cat.flavor,
      accepted,
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
