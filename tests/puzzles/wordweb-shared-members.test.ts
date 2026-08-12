import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findTraps, indexThemeMembers, memberTraps, poolQuartetProblems,
} from '../../content/generate-wordweb';

/**
 * ROUND 35 (BENCHMARKS §2) — THE FIFTH MEMBER THE LETTERS CANNOT SEE.
 *
 * A contested tile is the whole craft of the Connections format: the board is
 * built so an obvious-looking four is WRONG. Until this round the Library could
 * only discover one by SPELLING — three letters at a word's edge, a doubled
 * pair, a rhyme key, a `Contains "X"` token — and four hand-written categories
 * collide in their spelling about once, which is why 90 of 164 shipped boards
 * could not contest a second tile at any budget and the median sat at 1.
 *
 * `memberTraps` asks the other question: does this word BELONG to that
 * category. Because that answer comes from an authored list rather than from
 * the letters, it is a thing an editor can simply WRITE — which is what
 * Connections' editor does and what this generator could not.
 *
 * THIS FILE EXISTS BECAUSE OF STANDING RULE 1: no gate that passes by
 * construction, and no measurement that cannot fail. A detector that widens
 * the trap census raises the number the room is graded on whether or not it
 * found anything real, so both halves are pinned here — the board that HAS a
 * shared member yields exactly one thread naming it, and the board of four
 * genuinely disjoint categories yields none. The ceiling gate is pinned the
 * same way: handed two pools that share four words it goes red, handed two that
 * share three it goes green.
 */

const POOL = JSON.parse(
  readFileSync(join(process.cwd(), 'content', 'generated', 'word-web.json'), 'utf8'),
) as {
  id: string;
  tier: number;
  groups: { theme: string; words: string[] }[];
  ambiguousWords: string[];
  herrings: { words: string[]; relation: string; detail?: string }[];
}[];

const canonTheme = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

/** Four categories whose words share no letters worth the name and no members. */
const DISJOINT = [
  { theme: 'Test Sole Category Alpha', tier: 'yellow' as const, words: ['ALPHAONE', 'ALPHATWO', 'ALPHASIX', 'ALPHANIN'] },
  { theme: 'Test Sole Category Beta', tier: 'green' as const, words: ['BETAXONE', 'BETAXTWO', 'BETAXSIX', 'BETAXNIN'] },
  { theme: 'Test Sole Category Gamma', tier: 'blue' as const, words: ['GAMMYONE', 'GAMMYTWO', 'GAMMYSIX', 'GAMMYNIN'] },
  { theme: 'Test Sole Category Delta', tier: 'purple' as const, words: ['DELTQONE', 'DELTQTWO', 'DELTQSIX', 'DELTQNIN'] },
];

describe('the shared-member detector (BENCHMARKS §2)', () => {
  it('finds the fifth member an author put in two categories', () => {
    // TEACOSY belongs to both categories, honestly. Only the fourth member of
    // each says which one it is here.
    indexThemeMembers([
      { theme: 'Test Things on a Tea Tray', words: ['TEAPOTXX', 'SUGARBWL', 'MILKJUGX', 'STRAINER', 'TEACOSYX'] },
      { theme: 'Test Things Knitted by an Aunt', words: ['CARDIGAN', 'MITTENSX', 'BEDSOCKS', 'BALACLAV', 'TEACOSYX'] },
    ]);
    const board = [
      { theme: 'Test Things on a Tea Tray', tier: 'yellow' as const, words: ['TEAPOTXX', 'SUGARBWL', 'MILKJUGX', 'STRAINER'] },
      { theme: 'Test Things Knitted by an Aunt', tier: 'green' as const, words: ['CARDIGAN', 'MITTENSX', 'BEDSOCKS', 'TEACOSYX'] },
      DISJOINT[2]!,
      DISJOINT[3]!,
    ];
    const traps = memberTraps(board, []);
    expect(traps).toHaveLength(1);
    expect(traps[0]!.intruders).toEqual(['TEACOSYX']);
    expect(traps[0]!.relation).toBe('semantic');
    // The room must be able to say WHICH category it would have been.
    expect(traps[0]!.detail).toBe('Test Things on a Tea Tray');
    // And the thread it names is that category's four words plus the intruder.
    expect([...traps[0]!.words].sort())
      .toEqual(['MILKJUGX', 'STRAINER', 'SUGARBWL', 'TEACOSYX', 'TEAPOTXX']);
  });

  it('finds NOTHING on a board whose categories share no member', () => {
    indexThemeMembers(DISJOINT);
    expect(memberTraps(DISJOINT, [])).toEqual([]);
    // …and the shipping detector as a whole agrees: this board contests nothing.
    expect(findTraps(DISJOINT).filter((t) => t.key.startsWith('member:'))).toEqual([]);
  });

  it('says nothing twice: a letter trap already arguing about the tile wins', () => {
    indexThemeMembers([
      { theme: 'Test Things in a Bureau', words: ['BLOTTERX', 'INKWELLX', 'PENKNIFE', 'SEALWAXX', 'LEDGERXX'] },
    ]);
    const board = [
      { theme: 'Test Things in a Bureau', tier: 'yellow' as const, words: ['BLOTTERX', 'INKWELLX', 'PENKNIFE', 'SEALWAXX'] },
      { theme: 'Test Sole Category Beta', tier: 'green' as const, words: ['LEDGERXX', 'BETAXTWO', 'BETAXSIX', 'BETAXNIN'] },
      DISJOINT[2]!,
      DISJOINT[3]!,
    ];
    expect(memberTraps(board, [])).toHaveLength(1);
    const already = [{
      key: 'suffix:XXX',
      words: ['BLOTTERX', 'INKWELLX', 'PENKNIFE', 'SEALWAXX', 'LEDGERXX'],
      intruders: ['LEDGERXX'],
      relation: 'shared-affix' as const,
      score: 2,
    }];
    expect(memberTraps(board, already)).toEqual([]);
  });

  /**
   * A category the room has no true sentence for contests nothing. This is the
   * round-12 doubled-letter finding in a new place: the trap must be a thread
   * the player could genuinely have been following, and `Add a "T" for a New
   * Word` has no line in `herringLine` at all — shipped as `semantic` it would
   * come out as "these keep company", about four words that do not.
   */
  it('refuses a category whose truth the room cannot say out loud', () => {
    indexThemeMembers([
      { theme: 'Add a "Q" for a New Word', words: ['SWAPXONE', 'SWAPXTWO', 'SWAPXSIX', 'SWAPXNIN', 'SWAPXTEN'] },
    ]);
    const board = [
      { theme: 'Add a "Q" for a New Word', tier: 'yellow' as const, words: ['SWAPXONE', 'SWAPXTWO', 'SWAPXSIX', 'SWAPXNIN'] },
      { theme: 'Test Sole Category Beta', tier: 'green' as const, words: ['SWAPXTEN', 'BETAXTWO', 'BETAXSIX', 'BETAXNIN'] },
      DISJOINT[2]!,
      DISJOINT[3]!,
    ];
    expect(memberTraps(board, [])).toEqual([]);
  });
});

/**
 * The ceiling on a shared member, and the reason it is four: a board deals four
 * words from a pool, so two pools sharing four words can put the SAME whole
 * category on a board under two labels — a second right answer, which is the
 * one thing a contested tile must never become.
 */
describe('the shared-member ceiling (assertBankIsClean)', () => {
  const A = { theme: 'Pool A', words: ['ONE', 'TWO', 'SIX', 'NIN', 'TEN', 'ELV', 'TWV', 'THR'] };

  it('goes RED on two pools that share four words', () => {
    const B = { theme: 'Pool B', words: ['ONE', 'TWO', 'SIX', 'NIN', 'AAA', 'BBB', 'CCC', 'DDD'] };
    const problems = poolQuartetProblems([A, B]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Pool A');
    expect(problems[0]).toContain('Pool B');
  });

  it('goes GREEN on two pools that share three — which is the trap we want', () => {
    const B = { theme: 'Pool B', words: ['ONE', 'TWO', 'SIX', 'ZZZ', 'AAA', 'BBB', 'CCC', 'DDD'] };
    expect(poolQuartetProblems([A, B])).toEqual([]);
  });

  it('holds over the shipped bank', () => {
    // The pools themselves are linted at build time; this is the shelf-side
    // consequence — no board ships four words that are another board's whole
    // category under a different label.
    const byWords = new Map<string, string[]>();
    for (const b of POOL) {
      for (const g of b.groups) {
        const key = [...g.words].sort().join('|');
        byWords.set(key, [...(byWords.get(key) ?? []), `${b.id} "${g.theme}"`]);
      }
    }
    const twinned = [...byWords.values()].filter((v) => v.length > 1);
    expect(twinned.map((v) => v.join(' / ')), 'a 4-word set shipped twice').toEqual([]);
  });
});

/**
 * The artifact side. These read the SHIPPED json and re-derive everything, so a
 * hand-edited pool fails here exactly as a generator regression would.
 */
describe('what the shared members bought the shelf', () => {
  it('the median board contests two tiles (BENCHMARKS §2 asks for 2–4)', () => {
    const contested = POOL.map((b) => b.ambiguousWords.length).sort((a, b) => a - b);
    const median = contested[Math.floor(contested.length / 2)]!;
    expect(median, `distribution ${JSON.stringify(contested.reduce<Record<number, number>>(
      (acc, n) => { acc[n] = (acc[n] ?? 0) + 1; return acc; }, {},
    ))}`).toBeGreaterThanOrEqual(2);
  });

  it('the detector did not simply relabel the letter traps: it found new ones', () => {
    const semantic = POOL.flatMap((b) => b.herrings).filter((h) => h.relation === 'semantic');
    const compound = POOL.flatMap((b) => b.herrings).filter((h) => h.relation === 'compound');
    expect(semantic.length).toBeGreaterThan(20);
    expect(compound.length).toBeGreaterThan(20);
  });

  /**
   * …and it can still fail. Not every board has a shared member, and if this
   * ever reaches zero the detector has stopped being a discovery and become a
   * rubber stamp.
   */
  it('and it is not universal — plenty of boards contest nothing this way', () => {
    const without = POOL.filter(
      (b) => !b.herrings.some((h) => h.relation === 'semantic' || h.relation === 'compound'),
    );
    expect(without.length).toBeGreaterThan(10);
    expect(without.length).toBeLessThan(POOL.length);
  });

  /**
   * THE SENTENCE THE ROOM SAYS MUST BE TRUE OF THE BOARD IT SAYS IT ON.
   * Every named semantic thread claims "these belong under X" — so X has to be
   * a category actually on this board, and the thread has to be that category's
   * own four words plus exactly one interloper.
   */
  it('every named semantic thread points at a real group on its own board', () => {
    const problems: string[] = [];
    for (const b of POOL) {
      for (const h of b.herrings) {
        if (h.relation !== 'semantic') continue;
        if (!h.detail) { problems.push(`${b.id}: unnamed semantic thread`); continue; }
        const g = b.groups.find((x) => canonTheme(x.theme) === canonTheme(h.detail!));
        if (!g) { problems.push(`${b.id}: names "${h.detail}", not a group here`); continue; }
        const extra = h.words.filter((w) => !g.words.includes(w));
        if (h.words.length !== 5 || extra.length !== 1) {
          problems.push(`${b.id}: "${h.detail}" thread is ${h.words.join('/')}`);
        }
      }
    }
    expect(problems, problems.join(' ; ')).toEqual([]);
  });

  /** The compound line names the word the frame glues to, and it must be one. */
  it('every compound thread names the frame it belongs to', () => {
    const anchorOfTheme = (raw: string): string | null => {
      const t = canonTheme(raw);
      let m: RegExpMatchArray | null;
      if ((m = t.match(/^Can (?:Follow|Precede) "([A-Z]+)"$/))) return m[1]!;
      if ((m = t.match(/^(?:___ ([A-Z]+)|([A-Z]+) ___)$/))) return (m[1] ?? m[2])!;
      return null;
    };
    const problems: string[] = [];
    for (const b of POOL) {
      for (const h of b.herrings) {
        if (h.relation !== 'compound') continue;
        if (!h.detail) { problems.push(`${b.id}: unnamed compound thread`); continue; }
        const g = b.groups.find((x) => anchorOfTheme(x.theme) === h.detail);
        if (!g) { problems.push(`${b.id}: names “${h.detail}”, no frame here`); continue; }
        const extra = h.words.filter((w) => !g.words.includes(w));
        if (h.words.length !== 5 || extra.length !== 1) {
          problems.push(`${b.id}: “${h.detail}” thread is ${h.words.join('/')}`);
        }
      }
    }
    expect(problems, problems.join(' ; ')).toEqual([]);
  });
});
