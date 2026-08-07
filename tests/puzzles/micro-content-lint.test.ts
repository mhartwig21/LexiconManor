import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_BLOCKLIST, gateOk, NAME_BLOCKLIST, TONE_BLOCKLIST, toneOk,
} from '../../content/generate-gate';
import { BLOCKLIST } from '../../content/lib/dictionary';
import type { CipherPuzzle } from '../../src/engine/puzzles/cipher';
import type { CrosswordPuzzle } from '../../src/engine/puzzles/crossword';
import type { HivePuzzle, TwistlePuzzle, WordWebPuzzle } from '../../src/engine/types';
import cipherData from '../../content/generated/cipher.json';
import crosswordData from '../../content/generated/crossword.json';
import hiveData from '../../content/generated/hive.json';
import twistleData from '../../content/generated/twistle.json';
import wordWebData from '../../content/generated/word-web.json';

/**
 * Content lint — the COZY gate replayed against SHIPPED JSON (AAA COZY
 * pillar, 4.12 string-lint spirit, 3.7 editorial bar, wife-test 0.1.6).
 *
 * The generators apply content/generate-gate.ts at build time; this suite
 * fails CI if a gated word ever reappears in generated content, independent
 * of whether the generator was re-run honestly. (The rhyme/ladder/category
 * pools this suite once linted were retired with their rooms in the owner's
 * "fewer but better" cull — the gate anchors and the surviving Darkroom
 * phrases stay under lint.)
 */

const CIPHER_POOL = cipherData as CipherPuzzle[];

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
    /**
     * ROUND 12 — the slur hole. MIDGET sat in the Library's Hidden Insects
     * pool (it carries MIDGE) and shipped as a tile on web-44, set in Fell
     * caps: a widely-recognised slur for people with dwarfism, on a display
     * surface, in a game built for the owner's wife. It passed because
     * TONE_WORDS — a list that explicitly gates 'hick' as merely derogatory —
     * had no entry for the family at all.
     */
    for (const w of ['midget', 'midgets', 'spastic', 'imbecile', 'mongoloid']) {
      expect(TONE_BLOCKLIST.has(w), w).toBe(true);
    }
    for (const w of ['cory', 'benny', 'jill', 'howe', 'rex', 'dirk', 'hank', 'jean', 'kays', 'mays', 'shaw']) {
      expect(NAME_BLOCKLIST.has(w), w).toBe(true);
    }
    // Dictionary dregs never surface as the manor's voice (artifact gate).
    for (const w of ['dis', 'exec', 'pix', 'sarge']) {
      expect(ARTIFACT_BLOCKLIST.has(w), w).toBe(true);
    }
  });
});

describe('cipher.json lint (Darkroom)', () => {
  it('every plaintext word passes the tone gate', () => {
    for (const p of CIPHER_POOL) {
      for (const w of p.plaintext.split(/[^A-Za-z']+/).filter(Boolean)) {
        expect(toneOk(w.toLowerCase()), `${p.id}: ${w}`).toBe(true);
      }
    }
  });

  it('displayable() itself refuses a gated word (self-test)', () => {
    expect(displayable('kill')).toBe(false);
    expect(displayable('teapot')).toBe(true);
  });
});

/**
 * Round 4 extends the lint to every surviving room's DISPLAY surfaces. The
 * Conservatory prints its found words and its exit silhouettes; the Gallery
 * prints its targets as chips; the Library sets all sixteen tiles in display
 * type; the Linen Closet prints its answers. Each generator now applies the
 * gate at build time — this suite fails CI if a gated word ever reappears in
 * the shipped JSON, whether or not the generator was re-run honestly.
 */
describe('anchor + micro pool lint (the manor never prints a gated word)', () => {
  it('hive valid words all pass the cozy gate', () => {
    for (const p of hiveData as HivePuzzle[]) {
      for (const w of p.validWords) expect(displayable(w), `${p.id}: ${w}`).toBe(true);
    }
  });

  it('twistle target words all pass the cozy gate', () => {
    for (const p of twistleData as TwistlePuzzle[]) {
      for (const w of p.targetWords) expect(displayable(w), `${p.id}: ${w}`).toBe(true);
    }
  });

  it('word-web tiles all pass the tone gate', () => {
    for (const p of wordWebData as WordWebPuzzle[]) {
      for (const g of p.groups) {
        for (const w of g.words) expect(toneOk(w.toLowerCase()), `${p.id}: ${w}`).toBe(true);
      }
    }
  });

  it('crossword answers all pass the cozy gate', () => {
    for (const p of crosswordData as CrosswordPuzzle[]) {
      for (const e of p.entries) expect(displayable(e.answer), `${p.id}: ${e.answer}`).toBe(true);
    }
  });
});
