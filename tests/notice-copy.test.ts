/**
 * NOTICE-COPY LINT — AAA 11.18, plus the 11.15/11.16 chrome contract.
 * OWNER: A2 (Economy/Day).
 *
 * The round-6 escape this test exists to make impossible:
 *
 *   engine/manor/deck.ts had authored a payout line for every green room
 *   ("Two gems, cold and bright"; "Dry socks, and a spare key on the hook")
 *   and NOTHING IN THE APP EVER READ `.toast`. `applyDraftEffects` moved the
 *   gems and the keys and said nothing. The strings compiled, shipped, and
 *   were never once seen by a player. Unused notice copy is not dead data —
 *   it is a notice someone forgot to show (AAA 11.18).
 *
 * So: every authored notice string in the game is registered below with the
 * accessor that reads it, and the test asserts (a) the accessor really returns
 * that exact string, and (b) some shipped UI file actually calls the accessor.
 * A new payout line, a new carry-over promise or a new rank-up beat is covered
 * the moment it is authored — the tables are walked, not enumerated by hand.
 *
 * The companion assertions cover the two currency criteria the same defect
 * class produced: every chrome currency animates its own delta (11.15) and
 * every spendable currency is shown somewhere persistent (11.16).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CARRY_OVER_EFFECTS, SEALED_ROOM_BOUNTY, UTILITY_EFFECTS, carryOverFrom,
  payoutNoticeFor, sealedRoomNotice,
} from '../src/engine/manor/deck';
import { allRankUpLines, rankUpNotice } from '../src/ui/chrome/rank-up-lines';
import { momentForEvent } from '../src/ui/moment/moments';
import { LAYERS } from '../src/ui/chrome/layers';
import { MAX_AFFINITY_RANK } from '../src/engine/dialogue/affinity';
import { CHARACTER_IDS } from '../src/engine/types';
import { stepWords } from '../src/engine/economy/steps';

const root = join(__dirname, '..');

// ---------------------------------------------------------------------------
// The shipped UI corpus — what "has a render site" is checked against.
// ---------------------------------------------------------------------------

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (['.ts', '.tsx'].includes(extname(p))) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const UI_FILES = [
  ...sourcesUnder(join(root, 'src', 'ui')),
  ...sourcesUnder(join(root, 'src', 'pages')),
];

/** Files that actually *render*: the accessor must be called from one of them. */
const UI_SOURCE = UI_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');

function hasRenderSite(accessor: string): boolean {
  // The accessor must be imported AND invoked somewhere in shipped UI.
  return new RegExp(`\\b${accessor}\\s*\\(`).test(UI_SOURCE);
}

// ---------------------------------------------------------------------------
// The registry: every authored notice table, and the seam that reads it.
// ---------------------------------------------------------------------------

interface NoticeTable {
  what: string;
  accessor: string;
  /** Every string the table authors, read back THROUGH the accessor. */
  rendered(): string[];
  /** Every string the table authors, read straight off the source table. */
  authored(): string[];
}

const TABLES: NoticeTable[] = [
  {
    what: 'utility-room payout lines (UTILITY_EFFECTS[*].toast)',
    accessor: 'payoutNoticeFor',
    rendered: () =>
      Object.keys(UTILITY_EFFECTS)
        .map((id) => payoutNoticeFor(id)?.toast)
        .filter((s): s is string => typeof s === 'string'),
    authored: () => Object.values(UTILITY_EFFECTS).map((e) => e.toast),
  },
  {
    what: 'cross-day carry-over dawn lines (CARRY_OVER_EFFECTS[*].dawnLine)',
    accessor: 'dawnCarryOverLines',
    rendered: () => carryOverFrom(Object.keys(CARRY_OVER_EFFECTS)).lines,
    authored: () => Object.values(CARRY_OVER_EFFECTS).map((e) => e.dawnLine),
  },
  {
    // REVIEW_AA §5.7 — the dead end that pays. Registered the day it was
    // authored, because "a payout the app applies and never mentions" is
    // exactly the round-6 escape this file exists to make impossible, and a
    // silent gem is the same defect as a silent one was in 2026-08.
    what: 'the sealed-room bounty (SEALED_ROOM_BOUNTY.toast)',
    accessor: 'sealedRoomNotice',
    rendered: () => [sealedRoomNotice().toast],
    authored: () => [SEALED_ROOM_BOUNTY.toast],
  },
  {
    what: 'affinity rank-up acknowledgements (rank-up-lines LINES)',
    accessor: 'rankUpNotice',
    rendered: () =>
      CHARACTER_IDS.flatMap((c) =>
        Array.from({ length: MAX_AFFINITY_RANK }, (_, i) => rankUpNotice(c, i + 1)?.line),
      ).filter((s): s is string => typeof s === 'string'),
    authored: () => allRankUpLines(),
  },
];

describe('AAA 11.18 — no orphan notice copy', () => {
  it.each(TABLES.map((t) => [t.what, t] as const))(
    '%s: every authored string is reachable through its accessor',
    (_what, table) => {
      const rendered = new Set(table.rendered());
      for (const line of table.authored()) {
        expect(line.trim().length).toBeGreaterThan(0);
        expect(rendered.has(line)).toBe(true);
      }
    },
  );

  it.each(TABLES.map((t) => [t.what, t] as const))(
    '%s: the accessor is actually called by shipped UI',
    (_what, table) => {
      expect(hasRenderSite(table.accessor)).toBe(true);
    },
  );

  it('reads every green room\'s payout line — no card pays in silence', () => {
    for (const [cardId, effect] of Object.entries(UTILITY_EFFECTS)) {
      const notice = payoutNoticeFor(cardId);
      expect(notice, `no payout notice for ${cardId}`).not.toBeNull();
      expect(notice?.toast).toBe(effect.toast);
      // The eyebrow names the room, so the line is never anonymous prose.
      expect(notice?.title.trim().length).toBeGreaterThan(0);
      expect(notice?.title).not.toBe(cardId); // resolved to the card's name
    }
    // The specific strings the audit found stranded.
    expect(payoutNoticeFor('gem-vault')?.toast).toContain('Two gems');
    expect(payoutNoticeFor('boot-room')?.toast).toContain('spare key');
  });

  it('returns nothing for cards that pay nothing (no invented notices)', () => {
    expect(payoutNoticeFor('library')).toBeNull();
    expect(payoutNoticeFor('not-a-card')).toBeNull();
  });

  it('keeps shipped notice copy free of failure language (AAA 4.12)', () => {
    const banned = /\b(fail|failed|lose|lost|death|died|damage|defeat)\b/i;
    for (const table of TABLES) {
      for (const line of table.authored()) expect(line).not.toMatch(banned);
    }
  });
});

describe('AAA 5.7 — a rank-up is never a generic "+1"', () => {
  it('authors a distinct in-character line for every character at every rank', () => {
    const seen = new Set<string>();
    for (const character of CHARACTER_IDS) {
      for (let rank = 1; rank <= MAX_AFFINITY_RANK; rank++) {
        const notice = rankUpNotice(character, rank);
        expect(notice, `${character} rank ${rank} has no acknowledgement`).not.toBeNull();
        expect(notice!.line.length).toBeGreaterThan(20);
        // Never the same words twice — not across ranks, not across the cast.
        expect(seen.has(notice!.line)).toBe(false);
        seen.add(notice!.line);
        // Names the person, so the moment belongs to someone.
        expect(notice!.eyebrow.trim().length).toBeGreaterThan(0);
      }
    }
    expect(seen.size).toBe(CHARACTER_IDS.length * MAX_AFFINITY_RANK);
  });

  it('refuses ranks outside the ladder rather than render a half-moment', () => {
    expect(rankUpNotice('fern', 0)).toBeNull();
    expect(rankUpNotice('fern', MAX_AFFINITY_RANK + 1)).toBeNull();
    expect(rankUpNotice('fern', 1.5)).toBeNull();
  });

  it('is announced from an always-mounted layer, not from the scene', () => {
    // The valve (AAA 5.9) spends the day's conversation on the very node the
    // rank-up happens in, so the acknowledgement cannot live inside dialogue.
    // ROUND 9: the announcement moved from the notice rail to the moment layer
    // (see below); both are always-mounted, and the moment layer is the one
    // that also owes a persistent trace. What matters is that the copy has an
    // always-mounted render site and that the site reads the EVENT SPINE.
    const moments = readFileSync(join(root, 'src', 'ui', 'moment', 'moments.ts'), 'utf8');
    expect(moments).toContain('affinity-rank-up');
    expect(moments).toContain('rankUpNotice');
    const app = readFileSync(join(root, 'src', 'App.tsx'), 'utf8');
    expect(app).toContain('<MomentLayer />');
    const chrome = readFileSync(join(root, 'src', 'ui', 'chrome', 'GameChrome.tsx'), 'utf8');
    expect(chrome).toContain('<NoticeRail />');
  });

  it('announces a rank-up EXACTLY once — no channel says it twice', () => {
    // The round-6 fix shipped the bespoke line on the notice rail while the
    // moment layer independently mapped the same event to a generic seal, so
    // one rank-up produced two announcements in two voices in two bands. The
    // rail's branch is deleted; this pins it deleted. Comments are stripped so
    // the deletion may be DOCUMENTED in the file that no longer does it.
    const strip = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const rail = strip(readFileSync(join(root, 'src', 'ui', 'chrome', 'NoticeRail.tsx'), 'utf8'));
    expect(rail).not.toContain('affinity-rank-up');
    expect(rail).not.toContain('rankUpNotice');
  });

  it('carries the bespoke act as the seal\'s own words, not just a title', () => {
    // The defect was not that the seal was missing — it was that its whole
    // text was `${name} warms to you` for all 24 character x rank cases.
    const fern = momentForEvent(
      { type: 'affinity-rank-up', character: 'fern', rank: 2 },
      { fragment: () => null, answerFor: () => null, roomFor: () => null },
    );
    expect(fern?.quote).toBe(rankUpNotice('fern', 2)!.line);
    const portrait = momentForEvent(
      { type: 'affinity-rank-up', character: 'portrait', rank: 4 },
      { fragment: () => null, answerFor: () => null, roomFor: () => null },
    );
    expect(portrait?.quote).toBe(rankUpNotice('portrait', 4)!.line);
    // Different people, different ranks: never the same words.
    expect(fern?.quote).not.toBe(portrait?.quote);
  });
});

describe('AAA 11.15/11.16 — the chrome currencies', () => {
  const header = readFileSync(join(root, 'src', 'ui', 'chrome', 'DayHeader.tsx'), 'utf8');
  const chip = readFileSync(join(root, 'src', 'ui', 'chrome', 'CurrencyChip.tsx'), 'utf8');

  it('renders every currency through the chip that animates its own delta', () => {
    for (const currency of ['gems', 'keys', 'bookmarks'] as const) {
      expect(header).toMatch(new RegExp(`name="${currency}"`));
      expect(header).toMatch(new RegExp(`currencies\\.${currency}`));
    }
    // No currency may go back to being a static chip.
    expect(header).not.toMatch(/chr-chip__n tabular-nums">\{currencies\./);
    expect(chip).toContain('useDeltaFloats');
    expect(chip).toContain('chr-float');
  });

  it('shows bookmarks in the persistent bar, not only where they are spent', () => {
    // AAA 11.16: earned in letters, spent in a parlor two rooms away. The
    // dialogue scene may still show a pocket count; it may not be the only one.
    expect(header).toContain('name="bookmarks"');
    const css = readFileSync(join(root, 'src', 'ui', 'chrome', 'chrome.css'), 'utf8');
    expect(css).toContain('.chr-chip--bookmarks');
    // The float anchors against the chip itself, or it renders off the bar.
    expect(css).toMatch(/\.chr-chip\s*\{[^}]*position:\s*relative/);
  });

  it('keeps the notice rail above the overlays and un-tappable (AAA 11.5)', () => {
    const css = readFileSync(join(root, 'src', 'ui', 'chrome', 'chrome.css'), 'utf8');
    const rail = css.slice(css.indexOf('.chr-notices'), css.indexOf('.chr-notice__line'));
    // The rail used to say `z-index: 45` — a number picked to beat an overlay
    // band that was ALSO 40, in a file where the chrome bar had likewise
    // chosen 40 for itself. Those collisions are the 11.5 defect, and the
    // rungs are named now (src/ui/chrome/layers.ts). Same intent, asserted
    // against the published scale instead of a magic number: the rail clears
    // the overlays AND the bar.
    const rung = /z-index:\s*var\(--z-notice,\s*(\d+)\)/.exec(rail);
    expect(rung, '.chr-notices must take its rung from the layering scale').toBeTruthy();
    expect(Number(rung![1])).toBe(LAYERS.notice);
    expect(LAYERS.notice).toBeGreaterThan(LAYERS.overlay);
    expect(LAYERS.notice).toBeGreaterThan(LAYERS.chrome);
    expect(rail).toMatch(/pointer-events:\s*none/);
    // AAA 11.4: no hard-coded copy of the chrome bar's height, and no pixel
    // copy of the moment layer's card height either — the band is relative.
    expect(rail).not.toMatch(/top:\s*\d+px/);
    expect(rail).toMatch(/top:\s*\d+%/);
  });
});

// ---------------------------------------------------------------------------
// ROUND 42 — "1 steps" (docs/THE_CLIMB §1b)
// ---------------------------------------------------------------------------

describe('the unit is pluralised, now that the singular is reachable', () => {
  /**
   * ═══ THE DEFECT CLASS, AND WHY IT COULD NOT HAPPEN BEFORE ══════════════
   *
   * Twelve toast strings across five room adapters, the blueprint's rate card,
   * the draft card's stake line, the chrome counter's own label and its aria
   * name all wrote `${n} steps`, and every one of them was right BY ACCIDENT:
   * the cheapest thing in the game cost 2 steps, so `n` was never 1.
   *
   * Round 42 priced a move at 1, a wrong guess at 1, the cozy solve floor at 1
   * and four of the seven green cards at 1 — so the SINGULAR is now the
   * commonest number in the ledger, and "−1 steps" would have shipped on the
   * first wrong guess of the first room of the first evening.
   *
   * `stepWords` (engine/economy/steps.ts) owns the plural, in one place. This
   * walks every shipped source file for the ungrammatical form, so a new toast
   * that hand-builds it fails here rather than on the owner's phone.
   */
  const SOURCES = [
    ...sourcesUnder(join(root, 'src', 'ui')),
    ...sourcesUnder(join(root, 'src', 'pages')),
    ...sourcesUnder(join(root, 'src', 'engine')),
  ];

  it('never ships the string "1 steps", in copy or in a template', () => {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const text = readFileSync(file, 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        // Comments are prose about history and may quote the old form. (The
        // sources are CRLF and `.` does not match `\r`, so `//.*$` never
        // reaches `$` — the first draft of this lint flagged its own
        // explanatory comments. It strips by PREFIX instead.)
        const bare = line.replace(/\r/g, '').trim();
        if (bare.startsWith('*') || bare.startsWith('//') || bare.startsWith('/*')) continue;
        const code = bare.split('//')[0]!;
        if (/\b1 steps\b/.test(code)) offenders.push(`${file}:${i + 1}`);
      }
    }
    expect(offenders, `these ship "1 steps":\n${offenders.join('\n')}`).toEqual([]);
  });

  it('proves the lint by the strings it is written to condemn', () => {
    // NOT GREEN BY CONSTRUCTION: the regex really does catch the form, and
    // `stepWords` really does avoid it, at the magnitudes the game produces.
    expect(/\b1 steps\b/.test('Not quite — · −1 steps')).toBe(true);
    expect(stepWords(1)).toBe('1 step');
    expect(stepWords(-1)).toBe('-1 step');
    expect(stepWords(2)).toBe('2 steps');
    expect(stepWords(0)).toBe('0 steps');
    expect(/\b1 steps\b/.test(`· −${stepWords(1)}`)).toBe(false);
  });

  it('pluralises every payout line the shipped deck can print', () => {
    // The green cards NAME their own numbers, and round 42 moved four of them
    // to +1. Every one of those strings is walked here rather than spot-checked.
    for (const [id, effect] of Object.entries(UTILITY_EFFECTS)) {
      if ((effect.steps ?? 0) === 1) {
        expect(effect.toast, `${id} toast`).toContain('+1 step');
        expect(effect.toast, `${id} toast`).not.toMatch(/\b1 steps\b/);
      }
    }
    for (const [id, effect] of Object.entries(CARRY_OVER_EFFECTS)) {
      if ((effect.steps ?? 0) === 1) {
        expect(effect.promise, `${id} promise`).not.toMatch(/\b1 steps\b/);
      }
    }
  });
});
