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
    /* ROUND 10 — 45 → 150. The Library is the pool that runs dry first: it is
       the marquee room, it competes directly with NYT Connections, and at 51
       boards a player who visited it once a day exhausted the bottom of the
       house inside a fortnight. The floor is deliberately just under the
       shipped 152 so the next fairness tightening fails on the fairness rule
       it belongs to, not here (the round-9 lesson: a pool-size floor must
       never be the thing policing a fairness decision). Per-tier ≥45 floors
       live in tests/puzzles/anchors.test.ts and are the real guarantee that
       the shelf is stocked evenly rather than piled into one row. */
    expect(wordWeb.length).toBeGreaterThanOrEqual(150);
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

  /**
   * ROUND 11 (AAA 2.8 / content quality) — NO FOUR TILES SHIP TWICE.
   *
   * The 51 legacy `web-N` boards carried 204 group instances built from only
   * 126 distinct word-sets: CALM/SALMON/WOULD/YOLK was "Silent L" on four
   * separate nights, ANSWER/AWRY/WRENCH/WRINKLE was "Silent W" on four more,
   * and BALLOON/COFFEE/RACCOON/SUCCESS turned up on four again — inconsistently
   * tiered, so the same four tiles were the yellow group one night and the
   * green group another. To a player who visits the Library daily that is not
   * a deep pool, it is a shallow one printed four times. The generator's bank
   * groups are word POOLS now and every use draws a distinct hand; this is the
   * assertion that a future tweak cannot quietly undo it.
   */
  it('no 4-word set appears on two boards', () => {
    const owner = new Map<string, string>();
    const repeats: string[] = [];
    for (const p of wordWeb) {
      for (const g of p.groups) {
        const key = [...g.words].sort().join('|');
        const first = owner.get(key);
        if (first) repeats.push(`${p.id} repeats ${first}: ${g.words.join('/')}`);
        else owner.set(key, p.id);
      }
    }
    expect(repeats, repeats.join(' ; ')).toEqual([]);
    expect(owner.size).toBe(wordWeb.length * 4);
  });
});

describe('forgotten word bundle', () => {
  /**
   * Content floors for the Study (AAA 3.7). Round 7 took the pool 43 → 113;
   * the floor moves with it, because a shipped pool that quietly shrinks back
   * to a dozen entries is how a player meets the same word twice in a week.
   * Per-tier floors matter as much as the total: the Study's tier IS the
   * register of its clue, so a starved tier-3 shelf means a row-6 Study
   * repeating itself while 80 unused entries sit in the other two bands.
   * The register/leak/repetition gates themselves live in
   * `tests/forgotten-word-register.test.ts`.
   */
  it('ships a pool deep enough that rows do not repeat themselves', () => {
    expect(forgottenWord.length).toBeGreaterThanOrEqual(100);
    expect(new Set(forgottenWord.map((p) => p.id)).size).toBe(forgottenWord.length);
    const byTier = new Map<number, number>();
    for (const p of forgottenWord as (ForgottenWordPuzzle & { tier: number })[]) {
      byTier.set(p.tier, (byTier.get(p.tier) ?? 0) + 1);
    }
    for (const tier of [1, 2, 3]) {
      expect(byTier.get(tier) ?? 0, `tier ${tier}`).toBeGreaterThanOrEqual(30);
    }
  });

  it('entries are complete and guessable', () => {
    expect(forgottenWord.length).toBeGreaterThanOrEqual(100);
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
