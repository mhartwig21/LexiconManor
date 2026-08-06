import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_BLOCKLIST, gateOk, NAME_BLOCKLIST, TONE_BLOCKLIST, toneOk,
} from '../../content/generate-gate';
import { BLOCKLIST } from '../../content/lib/dictionary';
import type { CipherPuzzle } from '../../src/engine/puzzles/cipher';
import cipherData from '../../content/generated/cipher.json';

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
