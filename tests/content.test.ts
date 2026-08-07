import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPath, startHive, submitHiveWord, startWordWeb, submitGroup } from '../src/engine/index';
import type { WordWebPuzzleEx } from '../src/engine/rooms/adapters/word-web';
import type { ForgottenWordPuzzle, HivePuzzle, TwistlePuzzle, WordWebPuzzle } from '../src/engine/types';
/**
 * ROUND 14 — the generator's own judgments, imported rather than restated.
 * `content/generate-wordweb.ts` runs `main()` only as the process entry point
 * now, so importing it is side-effect free (the round-6 fix, applied to the
 * Library). Restating the predicates here would let the two drift, which is the
 * exact failure mode AAA §0.5 exists to record.
 */
import {
  ARCHITECTURE_BUDGET, DECOY_MIN_SATISFIED, VISIBILITY_LOUD, WALLPAPER_FAMILIES,
  anchorIsFifthMember, anchorOf, canon, familyOf, isPlainish, satisfactionOf,
  typeOfTheme, visibilityOf,
} from '../content/generate-wordweb';

/**
 * Guards over the committed content bundles: every shipped puzzle must be
 * structurally sound and winnable through the real engine.
 */

const dir = join(__dirname, '..', 'content', 'generated');
const load = <T>(name: string): T => JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;

const hive = load<HivePuzzle[]>('hive.json');
const twistle = load<TwistlePuzzle[]>('twistle.json');
/**
 * The shipped Library board carries the fairness fields the ADAPTER declares
 * (`WordWebPuzzleEx`: typed groups, decoys, named herrings, opening layout) —
 * `WordWebPuzzle` in engine/types.ts is the narrower shape the pure engine
 * needs. The round-14 gates below judge the shipped file, so they read it
 * through the shipped type.
 */
const wordWeb = load<WordWebPuzzleEx[]>('word-web.json');
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

  /**
   * ====================================================================
   * ROUND 14 — the judgments the generator now makes about the shipped
   * shelf, re-asked here so a hand-edit or a future generator change
   * fails CI rather than the wife's evening.
   * ====================================================================
   */

  /**
   * AAA 2.11 [BEAT] — THE FINAL GROUP IS AN ACT OF NAMING.
   *
   * Decoys used to be drawn uniformly at random from other boards'
   * same-tier themes with no plausibility test at all: 206 of the 211
   * mechanically-checkable decoys on the round-13 shelf matched ZERO of
   * their group's four words. Driven at 390x844 on web-d13 the last four
   * tiles were BLACK / TABLE / HILL / DESK and the three buttons were
   * "Things in a Cinema", 'Can Follow "HONEY"' and "___ TOP" — two
   * obviously dead options and one satisfied by all four. That is a
   * rubber stamp, not the room's one [BEAT] over Connections.
   */
  it('every decoy describes at least one of its own four words, and never all four', () => {
    const dead: string[] = [];
    let seen = 0;
    for (const p of wordWeb) {
      for (const g of p.groups) {
        expect(g.decoys, `${p.id} "${g.theme}"`).toHaveLength(2);
        for (const d of g.decoys ?? []) {
          const n = satisfactionOf(d, g.words);
          seen += 1;
          if (n === 0) dead.push(`${p.id}: "${d}" fits none of ${g.words.join('/')}`);
          if (n === g.words.length) {
            dead.push(`${p.id}: "${d}" fits EVERY word of "${g.theme}"`);
          }
        }
      }
    }
    expect(dead, dead.slice(0, 8).join(' ; ')).toEqual([]);
    expect(seen).toBeGreaterThan(0);
  });

  it('most decoys are a real decision — 2 or 3 of the four satisfy them', () => {
    // Not 100%: four semantically unrelated words can share nothing
    // mechanical (web-d24's AIR / SNACK / LANGUAGE / DOG have no bigram,
    // no rhyme and no shared authored category between any two of them),
    // so the generator falls back to a one-tile claim rather than to a
    // dead one. Measured after the round-14 pass: 77%.
    const all = wordWeb.flatMap((p) => p.groups.flatMap(
      (g) => (g.decoys ?? []).map((d: string) => satisfactionOf(d, g.words)),
    ));
    const plausible = all.filter((n) => n >= DECOY_MIN_SATISFIED).length;
    expect(plausible / all.length).toBeGreaterThanOrEqual(0.7);
  });

  /**
   * AAA 2.12 — the easiest group is found first on 70%+ of boards. 43 of
   * the 162 round-13 boards put a bare visible letter-pattern in PURPLE,
   * and 8 were pure prefix sorts (web-22: CARGO / CARTON / CARPET /
   * CARNIVAL under `Contains "CAR"`). Four words that all start with CAR
   * are the first thing any eye finds on a 16-tile grid — that inverts
   * the criterion rather than missing it by a margin.
   */
  it('no bare edge-token sort wears blue or purple', () => {
    const loud = wordWeb.flatMap((p) => p.groups
      .filter((g) => visibilityOf(g.theme, g.words) >= VISIBILITY_LOUD
        && (g.tier === 'blue' || g.tier === 'purple'))
      .map((g) => `${p.id} ${g.tier} "${g.theme}"`));
    expect(loud, loud.join(' ; ')).toEqual([]);
  });

  it('the gimme reads as a gimme — yellow is plain English on a clear majority', () => {
    const plain = wordWeb.filter((p) => {
      const y = p.groups.find((g) => g.tier === 'yellow');
      return !!y && isPlainish(y.theme);
    }).length;
    expect(plain / wordWeb.length)
      .toBeGreaterThanOrEqual(ARCHITECTURE_BUDGET.minPlainYellowShare);
  });

  /**
   * AAA 2.8 — SOLVER-VERIFIED UNIQUENESS. `Rhymes with "PLUM"` on a board
   * carrying the tile PLUM is a four-word category with five satisfying
   * words; so is `Anagrams of "SEPAL"` beside the tile SEPAL. Either the
   * anchor moves off the board or the tile it names is an acknowledged
   * herring — on the intruder list and named on a wrong guess. Silence is
   * the failure the round-13 shelf shipped on three boards.
   */
  it('no label anchors on an unflagged tile of its own board', () => {
    const bad: string[] = [];
    for (const p of wordWeb) {
      const onBoard = new Set(p.groups.flatMap((g) => g.words));
      for (const g of p.groups) {
        if (!anchorIsFifthMember(g.theme, g.words, onBoard)) continue;
        const anchor = anchorOf(g.theme)!.word;
        const named = p.ambiguousWords.includes(anchor)
          && (p.herrings ?? []).some((h) => h.words.includes(anchor));
        if (!named) bad.push(`${p.id}: "${g.theme}" names the tile ${anchor}`);
      }
    }
    expect(bad, bad.join(' ; ')).toEqual([]);
  });

  /**
   * AAA 2.9 / anti-wallpaper — round 12's cap is keyed on the theme
   * STRING, so it could not see that `Contains "TEN"`, `Contains "CAR"`
   * and `Contains "ICE"` are one trick wearing three coats: "Two Pairs of
   * Double Letters" showed up once every 54 boards while some flavour of
   * Contains showed up two nights in three. This is the coarser counter,
   * keyed on the MECHANIC.
   */
  it('no mechanic family is the trick on more than its budgeted share of boards', () => {
    const tally = new Map<string, number>();
    for (const p of wordWeb) {
      for (const f of new Set(p.groups.map((g) => familyOf(g.theme)))) {
        if ((WALLPAPER_FAMILIES as readonly string[]).includes(f)) {
          tally.set(f, (tally.get(f) ?? 0) + 1);
        }
      }
    }
    const over = [...tally]
      .filter(([, n]) => n / wordWeb.length > ARCHITECTURE_BUDGET.maxFamilyShare)
      .map(([f, n]) => `${f} ${n}/${wordWeb.length}`);
    expect(over, over.join(' ; ')).toEqual([]);
  });

  /**
   * AAA 2.9 / editorial — 162 boards, one recipe. Every round-13 board had
   * exactly 2 or 3 wordplay categories: never 4, never fewer, no variance
   * in shape at all. Connections varies its architecture night to night
   * and that variance IS the surprise.
   *
   * ON THE RECORD (round 14): the finding also asked for boards at 1 and 0
   * wordplay — "tier 1 should be allowed to run all-semantic, the shape
   * Connections opens the week with". That contradicts AAA 2.9 [BEAT],
   * which is a PER-BOARD floor of "2+ categories solvable purely from
   * letters/wordplay visible on the tiles". A fix agent does not lower a
   * [BEAT] floor, so the variance added here is upward — a 4-wordplay
   * bucket, newly reachable because a compound category counts as plain
   * English for the way-in floor — and the downward half is an architect's
   * ruling on AAA_BAR 2.9, not a generator change.
   */
  it('the shelf is not one recipe — boards ship at three different wordplay counts', () => {
    const shape = new Map<number, number>();
    for (const p of wordWeb) {
      const w = p.groups.filter((g) => typeOfTheme(g.theme) === 'wordplay').length;
      shape.set(w, (shape.get(w) ?? 0) + 1);
      expect(w, `${p.id} — AAA 2.9 [BEAT] floor`).toBeGreaterThanOrEqual(2);
    }
    expect(shape.size, [...shape].sort().join(' ')).toBeGreaterThanOrEqual(3);
    for (const [, n] of shape) expect(n / wordWeb.length).toBeLessThanOrEqual(0.7);
  });

  /**
   * AAA 2.9 / editorial — ONE LABEL PER MECHANIC. BIG TOP / BIG DIPPER /
   * BIG LEAGUE / BIG PICTURE shipped as "Things That Can Be Big" on
   * web-b11 while the identical mechanic shipped as "BIG ___" on web-44,
   * and the "Things That Can Be" form typed as SEMANTIC — so the composer
   * counted 64 of the shelf's best compound categories as plain English
   * and ate them to reach a wordplay floor they already satisfied.
   */
  it('a compound-modifier category is labelled "X ___", never "Things That Can Be X"', () => {
    const mods = 'Iron|Flat|Sharp|Royal|Fresh|Sweet|Silver|Hard|Loose|Golden|Open'
      + '|Big|Bitter|Blue|Wild|Sticky|Tough|Rich|Crisp|Brass|Vintage|Salty|Overdue';
    const re = new RegExp(`^Things That Can Be "?(${mods})"?$`);
    const mixed = wordWeb.flatMap((p) => p.groups
      .filter((g) => re.test(canon(g.theme)))
      .map((g) => `${p.id} "${g.theme}"`));
    expect(mixed, mixed.join(' ; ')).toEqual([]);
  });
});

/**
 * ROUND 14 (COZY tone pillar) — NO PLAYER-VISIBLE STRING STINGS.
 *
 * These words shipped as findable, scored, REVEALED answers: twistle.json's
 * authored target sets carried LOSER x9, RAGE x12, ANGER x8, HATE x7, LOSE x11,
 * PANIC x4, FATAL x3, TERROR x2, HATRED x2, SPITE x2, SORROW; hive.json's
 * validWords added DOOM/DOOMED x15, TERROR x13, RAGE x14, REVENGE x3, VILE x2,
 * TORMENT. `src/engine/twistle.ts` prints unfound targets back to the player on
 * exit, so the Gallery could tell her at the end of a cozy afternoon that the
 * word she missed was LOSER.
 *
 * The gate was not lax, it was INCONSISTENT — it already blocked 'loss',
 * 'moan', 'dread', 'grim', 'cruel', 'lament' and 'hurt', and had no rule for
 * any of the above, none of which appeared in ALLOWED_WITH_RATIONALE either.
 * They were oversights, not judgments. This is the regression anchor: the whole
 * family, over every surface the manor prints in its own voice.
 */
describe('the cozy tone gate — emotional harshness (round 14)', () => {
  const HARSH = [
    'LOSE', 'LOSES', 'LOSING', 'LOSER', 'LOSERS',
    'HATE', 'HATES', 'HATED', 'HATING', 'HATEFUL', 'HATRED',
    'RAGE', 'RAGES', 'RAGED', 'RAGING',
    'ANGER', 'ANGERS', 'ANGERED', 'ANGRY', 'ANGRILY',
    'DOOM', 'DOOMS', 'DOOMED', 'TERROR', 'TERRORS', 'TERRIFY', 'TERRIFIED',
    'PANIC', 'PANICS', 'PANICKED', 'PANICKY',
    'REVENGE', 'VENGEANCE', 'VENGEFUL',
    'TORMENT', 'TORMENTS', 'TORMENTED', 'TORMENTOR',
    'SPITE', 'SPITEFUL', 'FATAL', 'FATALLY', 'FATALITY',
    'SORROW', 'SORROWS', 'SORROWFUL', 'VILE', 'VILER', 'VILEST',
  ];
  const harsh = new Set(HARSH);

  it('no Gallery target word stings', () => {
    const hits = twistle.flatMap((p) => p.targetWords.filter((w) => harsh.has(w.toUpperCase())));
    expect([...new Set(hits)], hits.join(',')).toEqual([]);
  });

  it('no Conservatory answer stings', () => {
    const hits = hive.flatMap((p) => p.validWords.filter((w) => harsh.has(w.toUpperCase())));
    expect([...new Set(hits)], hits.join(',')).toEqual([]);
  });

  it('no Library tile stings', () => {
    const hits = wordWeb.flatMap((p) => p.groups.flatMap(
      (g) => g.words.filter((w) => harsh.has(w.toUpperCase())),
    ));
    expect([...new Set(hits)], hits.join(',')).toEqual([]);
  });

  it('no Study headword stings', () => {
    const hits = forgottenWord.filter((p) => harsh.has(p.word.toUpperCase())).map((p) => p.word);
    expect(hits, hits.join(',')).toEqual([]);
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
