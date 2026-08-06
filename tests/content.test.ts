import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPath, startHive, submitHiveWord, startWordWeb, submitGroup } from '../src/engine/index';
import type { ForgottenWordPuzzle, HivePuzzle, TwistlePuzzle, WordWebPuzzle } from '../src/engine/types';

/**
 * Guards over the committed content bundles: every shipped puzzle must be
 * structurally sound and winnable through the real engine.
 */

const dir = join(__dirname, '..', 'content', 'generated');
const load = <T>(name: string): T => JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;

const hive = load<HivePuzzle[]>('hive.json');
const twistle = load<TwistlePuzzle[]>('twistle.json');
const wordWeb = load<WordWebPuzzle[]>('word-web.json');
const forgottenWord = load<ForgottenWordPuzzle[]>('forgotten-word.json');

describe('hive bundle', () => {
  it('has a healthy pool with unique ids', () => {
    expect(hive.length).toBeGreaterThanOrEqual(300);
    expect(new Set(hive.map((p) => p.id)).size).toBe(hive.length);
  });

  it('every puzzle has a real pangram and is winnable via the engine', () => {
    for (const p of hive) {
      expect(p.pangrams.length, p.id).toBeGreaterThan(0);
      const allowed = new Set([p.center, ...p.outer]);
      expect(allowed.size, p.id).toBe(7);

      // Play greedily through the engine: submitting valid words must reach the threshold.
      let s = startHive(p);
      for (const word of [...p.validWords].sort((a, b) => b.length - a.length)) {
        if (s.status === 'won') break;
        const r = submitHiveWord(p, s, word, { entropyImmune: false, fadePick: (c) => c[0]! });
        expect(r.result.kind, `${p.id}: ${word}`).toBe('valid');
        s = r.state;
      }
      expect(s.status, `${p.id} unwinnable at threshold ${s.pointThreshold}`).toBe('won');
      expect(s.entropy, p.id).toBe(0);
    }
  });
});

describe('twistle bundle', () => {
  it('has a healthy pool with unique ids', () => {
    expect(twistle.length).toBeGreaterThanOrEqual(200);
    expect(new Set(twistle.map((p) => p.id)).size).toBe(twistle.length);
  });

  it('every target word is findable under the puzzle rules', () => {
    for (const p of twistle) {
      // Round 4: the board is square but no longer always 5×5 — tier 3 ships a
      // 6×6 Gallery. The per-tier size contract is asserted in
      // tests/puzzles/twistle-boards.test.ts; here we only insist the grid is a
      // complete square of its declared size.
      const size = p.size ?? 5;
      expect(p.grid.length, p.id).toBe(size * size);
      expect(p.targetWords.length, p.id).toBeGreaterThanOrEqual(p.targetCount);
      for (const w of p.targetWords) {
        expect(findPath(p.grid, w, p.rules), `${p.id}: ${w}`).not.toBeNull();
      }
    }
  });
});

describe('word web bundle', () => {
  it('every puzzle is 4 groups of 4 unique words and solvable via the engine', () => {
    /* Floor lowered 50 → 45 in round 9, deliberately, and this is the reason.
       Round 7 dropped six boards that carried no herring the planter could
       name, because a board whose acknowledged trap can never fire is the
       Library charging our prices for Connections. The pool landed at 51 — one
       board of headroom against a 50 floor — which meant the NEXT tightening
       of the herring budget would fail HERE, on pool size, rather than on the
       fairness rule that actually motivated the drop. A pool-size floor must
       not be the thing policing a fairness decision. Per-tier ≥10 floors live
       in tests/puzzles/anchors.test.ts and are the real guarantee. */
    expect(wordWeb.length).toBeGreaterThanOrEqual(45);
    for (const p of wordWeb) {
      expect(p.groups.length, p.id).toBe(4);
      const words = p.groups.flatMap((g) => g.words);
      expect(new Set(words).size, p.id).toBe(16);

      let s = startWordWeb(p);
      for (const g of p.groups) s = submitGroup(p, s, g.words).state;
      expect(s.status, p.id).toBe('won');
      expect(s.wrongAttempts, p.id).toBe(0);
    }
  });
});

describe('forgotten word bundle', () => {
  it('entries are complete and guessable', () => {
    expect(forgottenWord.length).toBeGreaterThanOrEqual(10);
    for (const p of forgottenWord) {
      expect(p.word.length, p.id).toBeLessThanOrEqual(15);
      expect(p.definitions.plain, p.id).toBeTruthy();
      expect(p.definitions.poetic, p.id).toBeTruthy();
      expect(p.definitions.riddle, p.id).toBeTruthy();
      expect(p.etymology, p.id).toBeTruthy();
      expect(p.usage, p.id).toContain('___');
    }
  });
});
