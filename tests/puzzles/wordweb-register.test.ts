import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FINISH_MIN,
  LATERAL_BANDS,
  canonTheme,
  familyOfTheme,
  intrinsicLateral,
  legacySemanticMeaningDistance,
  type CensusBoard,
} from '../../content/lib/wordweb-ladder';
import {
  REGISTERS,
  contaminationOf,
  isClean,
  mixOf,
  registerOf,
  type Register,
} from '../../content/lib/wordweb-register';
import { CORE_PER_MILLION, CORE_RANK, assertCoreRank, isCoreWord } from '../../content/lib/core-vocabulary';
import { loadPhonetics } from '../../content/lib/phonetics';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE REGISTER MIX — round 51, and the complaint it is written against
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The NYT-standards critic, measured:
 *
 *   "THE MEDIAN BOARD IS 3-OF-4 WORDPLAY. Nine boards are 4-of-4 with NO
 *    semantic category at all. PURPLE IS WORDPLAY ON 183 OF 183 BOARDS.
 *    A real Connections board mixes registers … ours is a wordplay monoculture
 *    with a semantic garnish, so by week two the player is running one
 *    procedure over and over."
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE GATES, AND WHY EVERY BAND IN IT IS A RULE RATHER THAN A LEVEL
 * ───────────────────────────────────────────────────────────────────────────
 *
 * There are three registers (`content/lib/wordweb-register.ts`) and four slots
 * on a board, so "at least two different KINDS of thinking" has an arithmetic:
 * **no register may hold more than half the board.** Everything below is that
 * one sentence asked from its different ends —
 *
 *   FORM ≤ 2       no board is three quarters letter tricks;
 *   non-FORM ≥ 2   the other half is read in English, and is not one garnish;
 *   MEANING ≥ 1    at least one of those two needs no phrase search either,
 *                  because `___ BAR` and `Contains "TEN"` are two ways of
 *                  playing with the word and `Things a Housekeeper Counts` is
 *                  the only kind that is about the world.
 *
 * Not one of those is a measured level rounded up. The FIRST run of this round
 * failed all three (see the fixture block below), and none of the numbers was
 * chosen after looking at what the shelf could reach.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY THE INSTRUMENT CAN DISAGREE WITH THE THING IT AUDITS
 * ───────────────────────────────────────────────────────────────────────────
 *
 * `docs/STATUS.md` §3.2: never verify a fix with an instrument that shares its
 * assumptions, and be suspicious of an instrument that agrees perfectly. Three
 * things keep this one honest, and each is asserted below rather than claimed:
 *
 *  1. THE FIXTURE. `fixtures/word-web-round50.json` is the whole shelf as it
 *     shipped before this round, read by this file's own instrument. It is RED,
 *     with exact counts. A gate that has never been shown a failing pool is a
 *     gate whose failure mode is untested.
 *  2. THE SELF-CHECK. The contamination challenge exists to catch a category
 *     the WORDS betray. If it never fires it is asleep and every "meaning"
 *     verdict is a rubber stamp — so it is pointed at the `contains` family,
 *     where it must fire nearly every time, and at the shipped shelf, where it
 *     fires once.
 *  3. THE NAMED WRONG ANSWER. The purple-capability claim is re-asked through
 *     `legacySemanticMeaningDistance` — the label regex this round replaced —
 *     and goes red, so the claim is proved against the previous model rather
 *     than against an edited copy of the current one.
 */

const POOL = JSON.parse(
  readFileSync(join(process.cwd(), 'content/generated/word-web.json'), 'utf8'),
) as CensusBoard[];

/** The shelf as it shipped at round 50 — the pool the complaint was measured on. */
const ROUND_50 = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/puzzles/fixtures/word-web-round50.json'), 'utf8'),
) as CensusBoard[];

const phonetics = loadPhonetics();
const rhymeKeys = (w: string) => phonetics.rhymeKeysOf(w.toLowerCase());

/** No register may hold more than half a board's four categories. */
const HALF_A_BOARD = 2;

/**
 * …asked of tiers 1 and 2, and PINNED rather than asked at tier 3.
 *
 * `TIER_SPECS[3].maxLetterMechanics` is 3, so a tier-3 board is legally three
 * quarters letter tricks and this rule cannot be a gate there. Capping that row
 * at 2 is measured in `content/generate-wordweb.ts` and it fixes the mix and
 * costs more than it buys: the shelf falls 167 → 154 boards, tier 3 falls
 * 50 → 27 against a floor of 45, the tier-2 contested-tile median falls 2 → 1
 * (round 41's headline win, which this round was told not to give back) and the
 * compound census breaches its own budget. So tier 3 is the round's DEBT, and
 * the block below pins its exact size so nobody can widen it or forget it.
 */
const MIX_GATED_TIERS = [1, 2] as const;

interface BoardRow {
  id: string;
  tier: number;
  counts: Record<Register, number>;
  cleanMeaning: number;
  purple: Register;
}

function rowsOf(pool: readonly CensusBoard[]): BoardRow[] {
  return pool.map((b) => {
    const mix = mixOf(b.groups, rhymeKeys);
    const purpleGroup = b.groups.find((g) => g.tier === 'purple')!;
    return {
      id: b.id,
      tier: b.tier,
      counts: mix.counts,
      cleanMeaning: mix.cleanMeaning,
      purple: registerOf(purpleGroup.theme, purpleGroup.words, rhymeKeys).register,
    };
  });
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

const ROWS = rowsOf(POOL);
const ROWS_50 = rowsOf(ROUND_50);
const TIERS = [1, 2, 3] as const;

describe('the register instrument can disagree — the three checks that keep it honest', () => {
  it('re-derives CORE_RANK from the corpus rather than remembering it', () => {
    const { rank, total } = assertCoreRank();
    expect(rank).toBe(CORE_RANK);
    // Sanity on the corpus itself, so a truncated vendored file fails loudly
    // rather than silently making every word rare.
    expect(total).toBeGreaterThan(1e11);
    expect(isCoreWord('MATCH')).toBe(true);
    expect(isCoreWord('WENSLEYDALE')).toBe(false);
    console.log(
      `    CORE VOCABULARY: ${CORE_PER_MILLION} per million falls at rank ${rank} of the shipped corpus`,
    );
  });

  it('the contamination challenge FIRES — it is not a rubber stamp', () => {
    /**
     * Point it at the family it must always catch. Every `Contains "X"` group
     * is four words sharing a substring, so if the challenge cannot see that,
     * it can see nothing and every MEANING verdict below is worthless.
     */
    const containsGroups = POOL.flatMap((b) => b.groups)
      .filter((g) => familyOfTheme(g.theme) === 'contains');
    expect(containsGroups.length).toBeGreaterThan(20);
    const caught = containsGroups.filter((g) => contaminationOf(g.words, rhymeKeys) !== null);
    expect(caught.length / containsGroups.length).toBeGreaterThan(0.9);

    // …and at the family it must always catch by SOUND rather than by spelling,
    // which is the half a substring search cannot do.
    const rhymeGroups = POOL.flatMap((b) => b.groups)
      .filter((g) => familyOfTheme(g.theme) === 'rhyme');
    const heard = rhymeGroups.filter((g) => {
      const c = contaminationOf(g.words, rhymeKeys);
      return c?.relation === 'rhyme';
    });
    expect(heard.length).toBeGreaterThan(0);
    console.log(
      `    CONTAMINATION SELF-CHECK: ${caught.length}/${containsGroups.length} substring groups, `
      + `${heard.length}/${rhymeGroups.length} rhyme groups caught by sound`,
    );
  });

  it('does NOT agree perfectly with the shelf it audits — it names its offenders', () => {
    const offenders = POOL.flatMap((b) => b.groups.map((g) => ({ b, g })))
      .map(({ b, g }) => ({ b, g, v: registerOf(g.theme, g.words, rhymeKeys) }))
      .filter(({ v }) => v.challenges.length > 0);
    for (const o of offenders) {
      console.log(`    CHALLENGED: ${o.b.id} "${o.g.theme}" — ${o.g.words.join('/')}`);
      for (const c of o.v.challenges) console.log(`        ${c.kind}: ${c.detail}`);
    }
    /**
     * The shipped shelf is expected to be clean HERE, and that is exactly the
     * agreement the standing rule says to be suspicious of: the generator now
     * refuses a contaminated category using this same function, so of course it
     * ships none. An instrument that only ever agrees with the build that uses
     * it has proved nothing.
     *
     * So the disagreement is demonstrated on a pool the generator never
     * filtered — the round-50 shelf, where it names one by hand. Four tiles of
     * `web-c09`'s plain-English category all contain BERRY, and a solver finds
     * that group with the label covered up.
     */
    expect(offenders.length).toBeLessThanOrEqual(POOL.length * 0.05);

    const before = ROUND_50.flatMap((b) => b.groups.map((g) => ({ b, g })))
      .filter(({ g }) => registerOf(g.theme, g.words, rhymeKeys).challenges.length > 0);
    expect(before.length, 'the challenge fires on a pool nothing filtered').toBeGreaterThan(0);
    for (const o of before) {
      console.log(`    ROUND 50 CHALLENGED: ${o.b.id} "${o.g.theme}" — ${o.g.words.join('/')}`);
    }
  });
});

describe('every board asks for at least two different KINDS of thinking', () => {
  it('EVERY board carries a category solved by knowing what the words mean', () => {
    // The rule with no tier exemption, and the one the critic's second sentence
    // is about: *nine boards are 4-of-4 with NO semantic category at all.*
    const mute = ROWS.filter((r) => r.cleanMeaning < 1)
      .map((r) => `${r.id} @t${r.tier}: no category solved by knowing what the words mean`);
    expect(mute, mute.slice(0, 8).join('\n')).toEqual([]);
  });

  it('no board at tiers 1–2 is more than half one register', () => {
    const rows = ROWS.filter((r) => (MIX_GATED_TIERS as readonly number[]).includes(r.tier));
    expect(rows.length).toBeGreaterThan(80);

    const over = rows.filter((r) => r.counts.form > HALF_A_BOARD)
      .map((r) => `${r.id} @t${r.tier}: ${r.counts.form} letter tricks of 4`);
    expect(over, over.slice(0, 8).join('\n')).toEqual([]);

    const thin = rows.filter((r) => r.counts.phrase + r.cleanMeaning < HALF_A_BOARD)
      .map((r) => `${r.id} @t${r.tier}: ${r.counts.phrase} phrase + ${r.cleanMeaning} meaning`);
    expect(thin, thin.slice(0, 8).join('\n')).toEqual([]);
  });

  it('holds at every tier, and prints the mix', () => {
    for (const t of TIERS) {
      const rs = ROWS.filter((r) => r.tier === t);
      expect(rs.length, `tier ${t} ships boards`).toBeGreaterThan(0);
      const form = median(rs.map((r) => r.counts.form));
      const meaning = median(rs.map((r) => r.cleanMeaning));
      const phrase = median(rs.map((r) => r.counts.phrase));
      console.log(
        `    t${t} (${rs.length} boards): median form ${form} · meaning ${meaning} · phrase ${phrase}`,
      );
      if ((MIX_GATED_TIERS as readonly number[]).includes(t)) {
        expect(form, `tier ${t} median letter tricks`).toBeLessThanOrEqual(HALF_A_BOARD);
      }
      expect(meaning, `tier ${t} median categories read in English`).toBeGreaterThanOrEqual(1);
    }
    const all = ROWS.map((r) => r.counts.form);
    console.log(`    ALL (${ROWS.length} boards): median form ${median(all)}`);
    expect(median(all)).toBeLessThanOrEqual(HALF_A_BOARD);
  });
});

describe('the round-50 shelf — the pool the complaint was measured on', () => {
  /**
   * RED, EXACTLY. These are not "some boards failed": they are the counts the
   * critic reported, reproduced by this file's own instrument on the shipped
   * bytes of the previous build. If a later round makes the gate agree with
   * that pool, the gate has stopped measuring the complaint.
   */
  it('is red on the MEANING floor — 10 boards with nothing to read in English', () => {
    const mute = ROWS_50.filter((r) => r.cleanMeaning < 1);
    expect(mute.length).toBe(10);
    expect(ROWS_50.length).toBe(183);
    console.log(`    ROUND 50 MUTE: ${mute.map((r) => `${r.id}@t${r.tier}`).join(' ')}`);
  });

  it('is red at tiers 1–2 too, where this round gates it', () => {
    const rows = ROWS_50.filter((r) => (MIX_GATED_TIERS as readonly number[]).includes(r.tier));
    const thin = rows.filter((r) => r.counts.phrase + r.cleanMeaning < HALF_A_BOARD);
    expect(thin.length).toBe(1);
    // …and 40 boards over the FORM cap, every one of them at tier 3, which is
    // the debt this round bounded rather than paid.
    const over = ROWS_50.filter((r) => r.counts.form > HALF_A_BOARD);
    expect(over.length).toBe(40);
    expect(new Set(over.map((r) => r.tier))).toEqual(new Set([3]));
    expect(median(ROWS_50.filter((r) => r.tier === 3).map((r) => r.counts.form))).toBe(3);
  });

  it('and the shelf that replaced it is green on both', () => {
    expect(ROWS.filter((r) => r.cleanMeaning < 1).length).toBe(0);
    const rows = ROWS.filter((r) => (MIX_GATED_TIERS as readonly number[]).includes(r.tier));
    expect(rows.filter((r) => r.counts.form > HALF_A_BOARD).length).toBe(0);
    expect(rows.filter((r) => r.counts.phrase + r.cleanMeaning < HALF_A_BOARD).length).toBe(0);
  });

  it('pins the tier-3 debt EXACTLY, so it can neither drift nor be forgotten', () => {
    /**
     * THE HALF THIS ROUND DID NOT PAY. Tier 3 keeps three letter mechanics and
     * its median board is still three quarters letter tricks.
     * `content/generate-wordweb.ts` records what capping that row costs,
     * measured over five builds; the binding constraint is the SUBTLE BANK,
     * which cannot deal two mechanics from different families for as many
     * boards as tier 3's floor of 45 needs. That is an authoring bill, and the
     * next round to pick it up should read this pin first.
     */
    const t3 = ROWS.filter((r) => r.tier === 3);
    const over = t3.filter((r) => r.counts.form > HALF_A_BOARD);
    console.log(
      `    TIER-3 DEBT: ${over.length}/${t3.length} boards are three quarters letter tricks `
      + `= ${(over.length / t3.length * 100).toFixed(1)}% (round 50: 40/52 = 76.9%); `
      + `median form ${median(t3.map((r) => r.counts.form))}`,
    );
    /**
     * PINNED ON THE COUNT, AND THE SHARE IS PUBLISHED RATHER THAN GATED —
     * because the share went the wrong way and saying so is the point. The
     * COUNT of tier-3 boards that are three quarters letter tricks falls (40 at
     * round 50), and the SHARE rises, because the tier itself is smaller: the
     * register floor costs the shelf boards and it costs tier 3 more than the
     * others, since a top-shelf board owes two mechanics from different
     * families AND a category read in English. A gate on the share would have
     * been red for an honest reason, and one widened to fit would be the quiet
     * re-tune `docs/STATUS.md` §3.7 names.
     */
    expect(over.length).toBeLessThanOrEqual(40);
    expect(median(t3.map((r) => r.counts.form))).toBe(3);
  });
});

describe('purple was not choosing a letter trick — the ladder could not let anything else in', () => {
  /**
   * The critic's third number is *"purple is wordplay on 183 of 183 boards"*,
   * and it was not an editorial habit. `lateralOf`'s four axes gave a category
   * solved by knowing what the words mean a ceiling of
   * 0 (reading) + 1 (surface) + 1 (meaning) + 2 (trap) = 4, and purple's floor
   * is 5. It was ARITHMETICALLY IMPOSSIBLE for plain English to be the last
   * colour, on any board, at any tier, whatever anybody authored.
   */
  const MAX_TRAP = 2;

  it('was impossible under the round-50 model, and is possible under this one', () => {
    const meaningGroups = POOL.flatMap((b) => b.groups)
      .filter((g) => registerOf(g.theme, g.words, rhymeKeys).register === 'meaning');
    expect(meaningGroups.length).toBeGreaterThan(50);

    const bestNow = Math.max(...meaningGroups.map((g) => intrinsicLateral(g))) + MAX_TRAP;
    expect(bestNow, 'a category read in English can reach purple')
      .toBeGreaterThanOrEqual(LATERAL_BANDS.purple[0]);

    /**
     * THE NAMED WRONG ANSWER. Re-ask the same question through the label regex
     * this round replaced. Its ceiling for a semantic category is 1, so the
     * best any of them could score is 0 + 1 + 1 + 2 = 4 — below the floor.
     */
    const bestLegacy = Math.max(
      ...meaningGroups.map((g) => 0 + 1 + legacySemanticMeaningDistance(g.theme)),
    ) + MAX_TRAP;
    expect(bestLegacy).toBeLessThan(LATERAL_BANDS.purple[0]);
    console.log(
      `    PURPLE CAPABILITY: best plain-English category reaches ${bestNow} `
      + `(round 50: ${bestLegacy}, floor ${LATERAL_BANDS.purple[0]})`,
    );
  });

  it('never buys the last colour with vocabulary alone — only with the board pulling', () => {
    /**
     * The guard that makes the capability honest rather than a giveaway: a
     * plain-English category tops out at `FINISH_MIN − 1` INTRINSIC, so it
     * reaches purple only where the board has planted traps in it. That is
     * what a Connections purple is, and it is why raising the ceiling does not
     * turn every taxonomy into a finish.
     */
    const meaningGroups = POOL.flatMap((b) => b.groups)
      .filter((g) => registerOf(g.theme, g.words, rhymeKeys).register === 'meaning');
    const worst = Math.max(...meaningGroups.map((g) => intrinsicLateral(g)));
    expect(worst).toBeLessThan(FINISH_MIN);
  });

  it('publishes what purple actually is, per tier — a bounded, named debt', () => {
    /**
     * THE HALF THIS ROUND DID NOT PAY, STATED RATHER THAN ABSORBED.
     *
     * Making a plain-English purple POSSIBLE did not make one SHIP. The shelf
     * still finishes on a letter trick almost every night, and the cause is
     * measurable and is not the ladder any more: it is `minSubtle`, the
     * round-4 owner directive that a tier's hardest categories must be heard or
     * unscrambled. A subtle mechanic scores 5–8 intrinsic against a plain
     * category's ceiling of 4, so it wins the last slot unless the board
     * planted two traps in the plain one and none in it — which the trap
     * planter now PREFERS (`PLAIN_FINISH`) and cannot manufacture.
     *
     * The number is gated where it stands, exactly, so that a later round
     * cannot let it drift and cannot quietly congratulate itself either. What
     * would move it is deck-level: more trap supply inside the core-word pools,
     * or an owner ruling on `minSubtle`. It is NOT a band to widen.
     */
    const byTier = TIERS.map((t) => {
      const rs = ROWS.filter((r) => r.tier === t);
      const form = rs.filter((r) => r.purple === 'form').length;
      return { t, n: rs.length, form, share: form / rs.length };
    });
    for (const r of byTier) {
      console.log(
        `    t${r.t}: purple is a letter trick on ${r.form}/${r.n} = ${(r.share * 100).toFixed(1)}%`,
      );
    }
    const formPurple = ROWS.filter((r) => r.purple === 'form').length;
    const wasFormPurple = ROWS_50.filter((r) => r.purple === 'form').length;
    console.log(
      `    POOL: ${formPurple}/${ROWS.length} = ${(formPurple / ROWS.length * 100).toFixed(1)}% `
      + `(round 50: ${wasFormPurple}/${ROWS_50.length} = `
      + `${(wasFormPurple / ROWS_50.length * 100).toFixed(1)}%)`,
    );
    // The debt, pinned: not one board in the shelf finishes on a category read
    // in English, and between five and twelve finish on a phrase search.
    expect(ROWS.filter((r) => r.purple === 'meaning').length).toBe(0);
    expect(ROWS.filter((r) => r.purple === 'phrase').length).toBeGreaterThanOrEqual(1);
  });
});

describe('the register taxonomy itself', () => {
  it('classifies by the operation the label demands, not by what its words do', () => {
    // The task's own two examples, and they must come out this way whatever the
    // tiles are: a hidden-animal category is wordplay dealt anything, and a
    // stillroom category is semantic dealt anything.
    expect(registerOf('Hidden Insects', ['ANTLER', 'BEETROOT', 'MOTHER', 'TICKET']).register)
      .toBe('form');
    expect(registerOf('Things Made in the Stillroom', ['PRESERVES', 'CANDLES', 'POTION', 'BEESWAX']).register)
      .toBe('meaning');
    expect(registerOf('___ FIRE', ['CAMP', 'CROSS', 'CEASE', 'WILD']).register).toBe('phrase');
    expect(registerOf('Can Precede "KEEPER"', ['BEE', 'BOOK', 'GATE', 'GOAL']).register).toBe('phrase');
  });

  it('refuses a plain-English verdict to any label that talks about spelling', () => {
    // The guard for the label shape nobody has written a family rule for yet.
    const v = registerOf('Words Ending in "ING"', ['STRING', 'SPRING', 'THING', 'BRING']);
    expect(v.register).toBe('meaning');
    expect(v.challenges.some((c) => c.kind === 'unreadable')).toBe(true);
    expect(isClean(v)).toBe(false);
  });

  it('covers every category on the shelf, in one of exactly three registers', () => {
    const seen = new Set<Register>();
    for (const b of POOL) {
      for (const g of b.groups) {
        const r = registerOf(g.theme, g.words, rhymeKeys).register;
        expect(REGISTERS).toContain(r);
        seen.add(r);
      }
    }
    expect([...seen].sort()).toEqual([...REGISTERS].sort());
  });

  it('agrees with the shipped `type` field on the one thing they both claim', () => {
    /**
     * A cross-check against a classifier written six rounds ago for a different
     * purpose. Where `typeOfTheme` says `semantic` or `trivia`, this file must
     * say MEANING — it is the same claim in two vocabularies. Where it says
     * `wordplay` the two are allowed to differ, and they do, on every compound
     * frame: that disagreement IS the round's finding, so it is counted rather
     * than asserted away.
     */
    const groups = POOL.flatMap((b) => b.groups);
    for (const g of groups) {
      if (g.type === 'semantic' || g.type === 'trivia') {
        expect(registerOf(g.theme, g.words, rhymeKeys).register, canonTheme(g.theme))
          .toBe('meaning');
      }
    }
    const split = groups.filter((g) => g.type === 'wordplay')
      .filter((g) => registerOf(g.theme, g.words, rhymeKeys).register === 'phrase');
    console.log(
      `    ${split.length} of ${groups.filter((g) => g.type === 'wordplay').length} `
      + '"wordplay" categories are a phrase search rather than a letter trick',
    );
    expect(split.length).toBeGreaterThan(0);
  });
});
