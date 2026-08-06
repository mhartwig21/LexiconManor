import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARTIFACT_BLOCKLIST, gateOk, NAME_BLOCKLIST, TONE_BLOCKLIST, toneOk,
} from '../../content/generate-gate';
import { BLOCKLIST } from '../../content/lib/dictionary';
import { loadPhonetics, rhymeKeyOfPron } from '../../content/lib/phonetics';
import type { RhymePuzzle } from '../../src/engine/puzzles/rhyme';
import type { LadderPuzzle } from '../../src/engine/puzzles/ladder';
import type { CategoryPuzzle } from '../../src/engine/puzzles/category';
import rhymeData from '../../content/generated/rhyme.json';
import ladderData from '../../content/generated/ladder.json';
import categoryData from '../../content/generated/category.json';

/**
 * Content lint — the COZY gate replayed against SHIPPED JSON (AAA COZY
 * pillar, 4.12 string-lint spirit, 3.7 editorial bar, wife-test 0.1.6).
 *
 * The generators apply content/generate-gate.ts at build time; this suite
 * fails CI if a gated word ever reappears in generated content ("rhymes
 * with DICK" in gilt display type, TITS sold as the next stone, CORY as a
 * prompt), independent of whether the generator was re-run honestly.
 *
 * Sections that need the build-time corpora (cmudict, enable1) skip
 * gracefully when the files are absent, so the pure-JSON lint always runs.
 */

const RHYME_POOL = rhymeData as RhymePuzzle[];
const ladderBundle = ladderData as { words: string[]; solutionWords: string[]; puzzles: LadderPuzzle[] };
const CATEGORY_POOL = categoryData as CategoryPuzzle[];

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content', 'data');
const authoredDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content', 'authored');

/** Every reason a word may never be shown as the manor's own voice. */
function displayable(word: string): boolean {
  const w = word.toLowerCase();
  return gateOk(w) && !BLOCKLIST.has(w);
}

describe('gate self-check', () => {
  it('the blocklists cover the flagged shipping offenders', () => {
    // Regression anchors from the review: each of these once shipped.
    for (const w of ['dick', 'tit', 'kill', 'dead', 'grim', 'cruel', 'loss', 'ill', 'hurt', 'pills',
      'tits', 'poop', 'hell', 'damn', 'died', 'snot', 'shitty', 'fucks']) {
      expect(TONE_BLOCKLIST.has(w), w).toBe(true);
    }
    for (const w of ['cory', 'benny', 'jill', 'howe', 'rex', 'dirk', 'hank', 'jean', 'kays', 'mays', 'shaw']) {
      expect(NAME_BLOCKLIST.has(w), w).toBe(true);
    }
    for (const w of ['pacs', 'shew', 'gies', 'lacs', 'prog', 'diss', 'shes']) {
      // Dictionary dregs can never be SOLD as rungs: they are either gated
      // outright or excluded by the frequency floor below.
      expect(ARTIFACT_BLOCKLIST.has(w) || !ladderBundle.solutionWords.includes(w.toUpperCase()), w).toBe(true);
    }
  });
});

describe('rhyme.json lint (Music Room)', () => {
  it('every displayed word passes the tone/proper-noun/artifact gate', () => {
    for (const p of RHYME_POOL) {
      for (const r of p.rounds) {
        for (const w of [r.prompt, ...r.accepted, ...r.decoys, ...r.near, ...r.homophones]) {
          expect(displayable(w), `${p.id}: ${w}`).toBe(true);
        }
      }
    }
  });

  it('no two rounds ship the same puzzle twice (accepted sets are distinct)', () => {
    const seen = new Map<string, string>();
    for (const p of RHYME_POOL) {
      for (const r of p.rounds) {
        const key = [...r.accepted].sort().join('|');
        expect(seen.get(key), `${p.id} duplicates ${seen.get(key)} (prompt ${r.prompt})`).toBeUndefined();
        seen.set(key, p.id);
      }
    }
  });
});

describe('ladder.json lint (Staircase)', () => {
  it('endpoints and every solution rung pass the full gate; probes pass tone', () => {
    const solutionSet = new Set(ladderBundle.solutionWords);
    for (const w of ladderBundle.solutionWords) expect(displayable(w), w).toBe(true);
    for (const w of ladderBundle.words) {
      expect(toneOk(w) && !BLOCKLIST.has(w.toLowerCase()), w).toBe(true);
    }
    for (const p of ladderBundle.puzzles) {
      for (const w of p.solution) {
        // The climbing lexicon is the curated common-word list — anything
        // the room prints or sells as an answer must live inside it.
        expect(solutionSet.has(w), `${p.id}: ${w}`).toBe(true);
      }
    }
  });
});

describe('category.json lint (Pantry)', () => {
  it('accepted words and traps are tone-clean', () => {
    for (const p of CATEGORY_POOL) {
      for (const e of p.accepted) {
        expect(toneOk(e.word) && !BLOCKLIST.has(e.word.toLowerCase()), `${p.id}: ${e.word}`).toBe(true);
      }
      for (const t of p.traps) {
        expect(toneOk(t.word), `${p.id}: trap ${t.word}`).toBe(true);
      }
    }
  });

  const enable1Path = join(dataDir, 'enable1.txt');
  it.skipIf(!existsSync(enable1Path))('no fabricated non-words: every accepted form is dictionary-real or hand-curated', () => {
    const enable1 = new Set(
      readFileSync(enable1Path, 'utf8').split('\n').map((w) => w.trim().toUpperCase()),
    );
    const authored = JSON.parse(readFileSync(join(authoredDir, 'categories.json'), 'utf8')) as {
      categories: { members: string[] }[];
    };
    const curated = new Set(authored.categories.flatMap((c) => c.members));
    for (const p of CATEGORY_POOL) {
      for (const e of p.accepted) {
        // GOOSES/CALFS must never ship: generator-fabricated variants exist
        // only when the dictionary knows them; curated members stand as-is.
        expect(enable1.has(e.word) || curated.has(e.word), `${p.id}: ${e.word}`).toBe(true);
      }
    }
  });
});

describe('rhyme phonetics replay (build corpora required)', () => {
  const cmudictPath = join(dataDir, 'cmudict.dict');
  it.skipIf(!existsSync(cmudictPath))(
    'every accepted word shares the prompt\'s PRIMARY rhyme family; families never repeat',
    () => {
      const ph = loadPhonetics();
      const primaryKey = (w: string): string | null => {
        const pron = ph.pronsOf(w.toLowerCase())[0];
        return pron ? rhymeKeyOfPron(pron) : null;
      };
      const seenFamilies = new Map<string, string>();
      for (const p of RHYME_POOL) {
        for (const r of p.rounds) {
          const fam = primaryKey(r.prompt);
          expect(fam, `${p.id}: prompt ${r.prompt} has no rhyme key`).not.toBeNull();
          expect(seenFamilies.get(fam!), `${p.id}: family ${fam} already shipped by ${seenFamilies.get(fam!)}`).toBeUndefined();
          seenFamilies.set(fam!, p.id);
          for (const w of r.accepted) {
            // "The ear decides": one pronunciation family per round — words
            // that rhyme only via an alternate pronunciation or different
            // stress (RECORD-the-verb for BOARD) belong in `near`, free.
            expect(ph.rhymesWith(r.prompt.toLowerCase(), w.toLowerCase()), `${p.id}: ${w} !~ ${r.prompt}`).toBe(true);
            expect(primaryKey(w), `${p.id}: ${w} rhymes only via alternate pron/stress`).toBe(fam);
          }
          for (const d of r.decoys) {
            expect(ph.rhymesWith(r.prompt.toLowerCase(), d.toLowerCase()), `${p.id}: decoy ${d} rhymes with ${r.prompt}`).toBe(false);
          }
        }
      }
    },
  );
});
