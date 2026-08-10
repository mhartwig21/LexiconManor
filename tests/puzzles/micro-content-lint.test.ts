import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_BLOCKLIST, gateOk, NAME_BLOCKLIST, proseProblems, TONE_BLOCKLIST, toneOk,
} from '../../content/generate-gate';
import { BLOCKLIST } from '../../content/lib/dictionary';
import type { CipherPuzzle } from '../../src/engine/puzzles/cipher';
import type { CrosswordPuzzle } from '../../src/engine/puzzles/crossword';
import type {
  ForgottenWordPuzzle, HivePuzzle, TwistlePuzzle, WordWebPuzzle,
} from '../../src/engine/types';
import cipherData from '../../content/generated/cipher.json';
import crosswordData from '../../content/generated/crossword.json';
import forgottenWordData from '../../content/generated/forgotten-word.json';
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
    /**
     * ROUND 9 — the escape this suite could not have caught, because it only
     * ever asked whether a LEMMA was on a LIST. RETARDED shipped 9× to the
     * Conservatory and once as a Gallery target with `retard` unlisted; the
     * fix is families, in content/lib/safety.ts, and the whole battery lives
     * in tests/content-safety.test.ts. These anchors keep the two suites
     * honest about each other.
     */
    for (const w of [
      'retard', 'retarded', 'retardation', 'retardant',   // the family, not the lemma
      'coon', 'pedophile', 'queers', 'gimp', 'cripple', 'dildos', 'nazi',
    ]) {
      expect(gateOk(w), w).toBe(false);
      expect(toneOk(w), w).toBe(false);
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
 * ROUND 24 (REVIEW_AA 5.9) — the Darkroom's plaintexts are the manor's own.
 *
 * Every one of these shipped in cipher.json until this round: 61.7 per cent
 * of the pool decoded to a public-domain proverb, and the tier split ran
 * backwards — tier 1 was 67 per cent stock and tier 3, the tier nobody
 * reaches early, held the lexicographer's voice. A short cryptogram is solved
 * by recognising the phrase, so the recognisable half was also the solvable
 * half, and the house had written the unsolvable one.
 *
 * They are pinned here rather than merely deleted because the phrase list is
 * a hand-authored array and the cheapest way to top it up is to reach for the
 * proverbs again. Nothing in a lexicographer's darkroom decodes to an apple a
 * day.
 */
const CUT_PROVERBS: readonly string[] = [
  'A BIRD IN THE HAND IS WORTH TWO IN THE BUSH',
  'A CAT MAY LOOK AT A KING',
  'A FRIEND IN NEED IS A FRIEND INDEED',
  'A JOURNEY OF A THOUSAND MILES BEGINS WITH A SINGLE STEP',
  'A PENNY SAVED IS A PENNY EARNED',
  'A PICTURE IS WORTH A THOUSAND WORDS',
  'A ROLLING STONE GATHERS NO MOSS',
  'A STITCH IN TIME SAVES NINE',
  'A WATCHED POT NEVER BOILS',
  'ABSENCE MAKES THE HEART GROW FONDER',
  'ACTIONS SPEAK LOUDER THAN WORDS',
  'ALL GOOD THINGS MUST COME TO AN END',
  'ALL THAT GLITTERS IS NOT GOLD',
  'AN APPLE A DAY KEEPS THE DOCTOR AWAY',
  'BEAUTY IS IN THE EYE OF THE BEHOLDER',
  'BETTER LATE THAN NEVER',
  'BIRDS OF A FEATHER FLOCK TOGETHER',
  'DO NOT COUNT YOUR CHICKENS BEFORE THEY HATCH',
  'DO NOT PUT ALL YOUR EGGS IN ONE BASKET',
  'EASY COME EASY GO',
  'EVERY CLOUD HAS A SILVER LINING',
  'EVERY DOG HAS ITS DAY',
  'EVERY PATH HAS ITS PUDDLE',
  'EVERY ROSE HAS ITS THORN',
  'FIRST THINGS FIRST',
  'FORTUNE FAVORS THE BOLD',
  'GOOD THINGS COME TO THOSE WHO WAIT',
  'GREAT OAKS FROM LITTLE ACORNS GROW',
  'HASTE MAKES WASTE',
  'HOME IS WHERE THE HEART IS',
  'HONESTY IS THE BEST POLICY',
  'IF THE SHOE FITS WEAR IT',
  'IT TAKES TWO TO TANGO',
  'LAUGHTER IS THE BEST MEDICINE',
  'LET SLEEPING DOGS LIE',
  'LITTLE BY LITTLE THE BIRD BUILDS ITS NEST',
  'LOOK BEFORE YOU LEAP',
  'MAKE HAY WHILE THE SUN SHINES',
  'MANY HANDS MAKE LIGHT WORK',
  'NEVER JUDGE A BOOK BY ITS COVER',
  'NO NEWS IS GOOD NEWS',
  'NO TIME LIKE THE PRESENT',
  'ONE GOOD TURN DESERVES ANOTHER',
  'OUT OF SIGHT OUT OF MIND',
  'PRACTICE MAKES PERFECT',
  'ROME WAS NOT BUILT IN A DAY',
  'SLOW AND STEADY WINS THE RACE',
  'STILL WATERS RUN DEEP',
  'STRIKE WHILE THE IRON IS HOT',
  'THE APPLE NEVER FALLS FAR FROM THE TREE',
  'THE BEST THINGS IN LIFE ARE FREE',
  'THE EARLY BIRD CATCHES THE WORM',
  'THE GRASS IS ALWAYS GREENER ON THE OTHER SIDE',
  'THE PEN IS MIGHTIER THAN THE SWORD',
  'THE PROOF IS IN THE PUDDING',
  'THE SQUEAKY WHEEL GETS THE GREASE',
  'THERE IS NO PLACE LIKE HOME',
  'TIME AND TIDE WAIT FOR NO MAN',
  'TWO HEADS ARE BETTER THAN ONE',
  'VARIETY IS THE SPICE OF LIFE',
  'WASTE NOT WANT NOT',
  'WELL BEGUN IS HALF DONE',
  'WHEN IN ROME DO AS THE ROMANS DO',
  'WHERE THERE IS SMOKE THERE IS FIRE',
  'YOU CANNOT HAVE YOUR CAKE AND EAT IT TOO',
  'YOU REAP WHAT YOU SOW',
];

describe('cipher.json house voice (REVIEW_AA 5.9)', () => {
  it('no stock proverb has crept back into the Darkroom', () => {
    const shipped = new Set(CIPHER_POOL.map((p) => p.plaintext));
    for (const proverb of CUT_PROVERBS) expect(shipped.has(proverb), proverb).toBe(false);
  });

  it('every tier is reachable and none is starved of phrases', () => {
    for (const tier of [1, 2, 3] as const) {
      const n = CIPHER_POOL.filter((p) => ((p as { tier?: number }).tier ?? 1) === tier).length;
      expect(n, `tier ${tier}`).toBeGreaterThanOrEqual(25);
    }
  });

  /**
   * The positive half of the claim, and the shape of the original defect.
   *
   * A phrase counts as house-voiced if it carries a noun out of the manor's
   * own vocabulary — the cast, the rooms, the lexicographer's materials. It
   * is a proxy and deliberately an undercount: several of the best lines
   * (PATIENT HANDS MEND WHAT HASTE UNDID, WATER THEN MORE WATER) are squarely
   * in a character's register without naming anything.
   *
   * The gate that matters is the SPREAD. The review's finding was not that
   * the house voice was missing — it was that the voice was rationed to tier
   * 3, the tier the deck opens last, while tier 1 got the proverbs. So every
   * tier carries the floor, and tier 1 is never the poorest of the three.
   */
  it('every tier carries the house voice, and tier 1 is not the poorest', () => {
    const HOUSE = /\b(BRAMBLE|ELLERY|POSY|FERN|DEWEY|MANOR|HOUSE|HOUSES|LEXICON|PORTRAIT|LIBRARY|GARDEN|GARDENS|GARDENER|SHELF|SHELVES|DRAWER|LETTER|LETTERS|POST|PARCEL|INK|MARGIN|MARGINS|PAGE|PAGES|BOOK|BOOKS|WORD|WORDS|KETTLE|KETTLES|TEA|SCONE|CANDLE|CANDLES|LAMP|LAMPS|STAIR|STAIRS|ROOM|ROOMS|DOOR|DOORS|DUST|DUSTY|SEED|SEEDS|GUEST|READER|READERS|READING|STAMP|STRING|CAT|PAPER|MASTER|PANTRY|CELLAR|ORCHARD|POETRY|INDEX|FRAME|WING|IVY|MILK|BOOTS|PLANTS|MOP|HEARTH|NOTICES)\b/;
    const rate = (tier: 1 | 2 | 3) => {
      const at = CIPHER_POOL.filter((p) => ((p as { tier?: number }).tier ?? 1) === tier);
      return at.filter((p) => HOUSE.test(p.plaintext)).length / at.length;
    };
    const [t1, t2, t3] = [rate(1), rate(2), rate(3)];
    for (const [tier, r] of [[1, t1], [2, t2], [3, t3]] as const) {
      expect(r, `tier ${tier}`).toBeGreaterThanOrEqual(0.7);
    }
    expect(t1).toBeGreaterThanOrEqual(Math.min(t2, t3));
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

  /**
   * ROUND 9 (safety sweep) — the surfaces this suite could not see.
   *
   * Everything above lints WORDS. Three player-visible surfaces are SENTENCES
   * and had no lint at all: the Library's category labels and its naming-act
   * decoys (which the player reads as prose and picks between), and the whole
   * of the Study — headword, three definitions, etymology and usage — whose
   * generator called no gate whatsoever. Prose gets the absolute standard
   * (`proseProblems`), never the tone list, so Ellery keeps her grief.
   */
  it('word-web category labels and decoys carry nothing on the absolute standard', () => {
    for (const p of wordWebData as WordWebPuzzle[]) {
      for (const g of p.groups) {
        // `decoys` is a generator-side fairness field (AAA 2.11) that
        // engine/types.ts does not model; read it structurally.
        const decoys = (g as { decoys?: string[] }).decoys ?? [];
        for (const label of [g.theme, ...decoys]) {
          expect(proseProblems(label), `${p.id}: "${label}"`).toEqual([]);
        }
      }
    }
  });

  it('forgotten-word headwords pass the cozy gate and their prose the absolute standard', () => {
    for (const e of forgottenWordData as ForgottenWordPuzzle[]) {
      expect(displayable(e.word), `${e.id}: ${e.word}`).toBe(true);
      for (const text of [
        e.definitions.plain, e.definitions.poetic, e.definitions.riddle,
        e.etymology, e.usage,
      ]) {
        expect(proseProblems(text ?? ''), `${e.id}: ${text}`).toEqual([]);
      }
    }
  });
});
