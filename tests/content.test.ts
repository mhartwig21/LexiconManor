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

  /**
   * ROUND 12 (AAA 2.6 / volume-quality) — NO CATEGORY IS WALLPAPER.
   *
   * `BANK_REUSE_CAP = 3` in content/generate-wordweb.ts was documented as the
   * anti-wallpaper rule and enforced through a counter that only bank draws
   * ever incremented, so it did not apply to the source the shelf actually
   * grew from. Shipped before the fix: "Two Pairs of Double Letters" on 17 of
   * 164 boards — and on 7 of the 12 boards in the newest batch, whose word sets
   * were near-clones of each other (web-e10 {SUCCESS, BALLOON, GODDESS,
   * COMMITTEE} against web-e12 {SUCCESS, RACCOON, BALLOON, COMMITTEE}) because
   * the underlying pool is ~20 words wide and cannot supply 16 honest hands —
   * plus Heteronyms ×7, 'Silent "T"' ×7, 'Silent "G"' ×6, Palindromes ×5 and
   * thirteen more over budget. A player who visits the Library nightly met the
   * same brown-paper category one night in ten. The cap binds every theme now,
   * whatever wrote it, and this is the assertion that keeps it binding.
   */
  it('no category is the theme of more than three boards', () => {
    const canon = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    const tally = new Map<string, string[]>();
    for (const p of wordWeb as (WordWebPuzzle & { id: string })[]) {
      for (const g of p.groups) {
        const k = canon(g.theme);
        tally.set(k, [...(tally.get(k) ?? []), p.id]);
      }
    }
    const over = [...tally]
      .filter(([, ids]) => ids.length > 3)
      .map(([theme, ids]) => `"${theme}" ×${ids.length} (${ids.join(', ')})`);
    expect(over, over.join(' ; ')).toEqual([]);
  });

  /**
   * ROUND 12 (AAA 2.9 [BEAT]) — A "HIDDEN X" BOARD MAY NOT PRINT X.
   *
   * Three shipped boards falsified their own category on half their tiles:
   * web-28's "Hidden Vegetables" printed LEEKS and PEASE, web-46's "Hidden
   * Musical Instruments" printed LUTES and TUBAS, web-43's "Hidden Birds"
   * printed CRANES. Those are the noun with a plural on it — the vegetable is
   * not concealed inside an unrelated word, it IS the tile. Half the board
   * teaches "the bird is hidden", the other half teaches "the bird is printed",
   * which is the fairness complaint Connections gets and the one this
   * generator exists to fix. The generator lints its pools now; this is the
   * shipped-JSON half of that guard, and it also catches a member that hides
   * nothing at all (CHERISH has no CHERRY in it; THREAD has no THREE).
   */
  it('every "Hidden X" tile hides its noun rather than printing it', () => {
    const TOKENS: Record<string, string[]> = {
      'Hidden Numbers': ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'],
      'Hidden Colors': ['RED', 'BLUE', 'GREEN', 'TAN', 'ROSE', 'PLUM', 'JADE', 'GREY', 'PINK', 'GOLD', 'RUST', 'TEAL', 'AMBER', 'CORAL', 'OLIVE', 'INDIGO'],
      'Hidden Instruments': ['HARP', 'ORGAN', 'LUTE', 'VIOLA', 'CELLO', 'DRUM', 'HORN', 'BASS', 'OBOE', 'PIANO', 'TUBA', 'FIFE', 'BANJO', 'LYRE', 'SITAR', 'FLUTE'],
      'Hidden Body Parts': ['ARM', 'HIP', 'EAR', 'RIB', 'SHIN', 'SCALP', 'PALM', 'LIP', 'CHIN', 'HEEL', 'CALF', 'EYE', 'JAW', 'GUM', 'HAND', 'FOOT', 'SKIN', 'LUNG', 'LIVER', 'BROW', 'NOSE', 'NECK', 'KNEE', 'SHOULDER'],
      'Hidden Animals': ['COW', 'PIG', 'CAT', 'DOG', 'CROW', 'BEE', 'HEN', 'GOAT', 'APE', 'RAT', 'OWL', 'FOX', 'BAT', 'ANT', 'EWE', 'SOW'],
      'Hidden Birds': ['CROW', 'OWL', 'HEN', 'GULL', 'SWALLOW', 'ROOK', 'WREN', 'HAWK', 'DOVE', 'LARK', 'EMU', 'TERN', 'IBIS'],
      'Hidden Trees': ['PINE', 'ASH', 'FIR', 'ELM', 'PALM', 'OAK', 'BEECH', 'TEAK', 'YEW', 'MAPLE', 'CEDAR', 'BIRCH', 'LARCH', 'ASPEN'],
      'Hidden Fruits': ['PLUM', 'FIG', 'DATE', 'PEAR', 'LIME', 'GRAPE', 'LEMON', 'PEACH', 'APPLE', 'MELON', 'MANGO', 'CHERRY', 'OLIVE'],
      'Hidden Vegetables': ['PEA', 'CORN', 'BEET', 'KALE', 'LEEK', 'CHARD', 'BEAN', 'CHIVE', 'YAM', 'OKRA', 'ONION', 'TURNIP', 'CRESS'],
      'Hidden Insects': ['ANT', 'BEE', 'MOTH', 'WASP', 'GNAT', 'TICK', 'MIDGE', 'FLEA', 'APHID'],
      'Hidden Weather': ['RAIN', 'SNOW', 'HAIL', 'MIST', 'FOG', 'GALE', 'SUN', 'ICE', 'DEW', 'WIND', 'STORM', 'SLEET', 'FROST'],
    };
    // Plural/participle only — derivational endings are honest carriers
    // (MOTHER is not a moth, HAWKER is not a hawk), and CROW → CROWD is a word
    // in its own right, so a bare "D" counts only after an E-final noun.
    const printed = (token: string, word: string) =>
      word === token
      || ['S', 'ES', 'ED', 'ING', 'IES'].some((sfx) => word === token + sfx)
      || (token.endsWith('E') && word === `${token}D`);

    const problems: string[] = [];
    for (const p of wordWeb as (WordWebPuzzle & { id: string })[]) {
      for (const g of p.groups) {
        if (!/^Hidden /.test(g.theme)) continue;
        // "Hidden Numbers (Spelled Out)" and "Hidden Musical Instruments" are
        // the same claims as their shorter siblings.
        const key = g.theme.replace(' (Spelled Out)', '').replace('Musical ', '');
        const tokens = TOKENS[key];
        expect(tokens, `${p.id}: "${g.theme}" has no token list in this test`).toBeTruthy();
        for (const w of g.words) {
          const honest = tokens!.some((t) => w.includes(t) && !printed(t, w));
          if (honest) continue;
          const bare = tokens!.find((t) => printed(t, w));
          problems.push(bare
            ? `${p.id} "${g.theme}": ${w} prints ${bare}`
            : `${p.id} "${g.theme}": ${w} hides nothing`);
        }
      }
    }
    expect(problems, problems.join(' ; ')).toEqual([]);
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
