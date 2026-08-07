/**
 * The journal derivations + the journal slice — OWNER: A7 (Mystery).
 * Pure-engine tests for grouping/gaps/alphabet/nudges, plus an integration
 * pass through the real store (fileFragment → event spine, the Sanctum
 * guess flow, letters setting write-once flags).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DayRecord, ManorState, PlacedRoom, VolumeState } from '../src/engine/types';
import { cellKey, createManor, SANCTUM_DOOR_CELL } from '../src/engine/manor/grid';
import {
  decipherYield, freshVolumeState, fragmentsToDecipher, FRAGMENTS_TO_DEDUCE, legibleDayFlag,
  legibleDroughtDays, legibleFragmentFlag, openedLetterFlag, sealedFragmentFlag,
  sealedFragmentIds, solvedFlag,
  DECIPHER_YIELD_BY_TIER,
  type VolumeContent,
} from '../src/engine/volume';
import {
  alphabetFacts, arrivalShade, crossRefs, DEDUCTION_FLOOR, definitionSlots, displayedFragmentIds,
  foundByKind, glancedFragmentFlag, glancedFragmentIds, guessHistory, guessVerdict, hasSeen,
  isLegible, journalNudge, journalUnread, landingFlag, letterBoxes, nextUninterpreted,
  NOTHING_UNREAD, sanctumReadiness, sealedCount, SPENT_ARRIVAL_STEPS, THIN_FILE_THRESHOLD,
  VERDICT_TOKENS, viewedFragmentFlag, viewedFragmentIds,
  type GuessVerdict, type JournalTab,
} from '../src/engine/journal';
import { KNOWLEDGE } from '../src/engine/economy/simulate';
import { solveKeys } from '../src/engine/economy/steps';
import { FLAG_REGEX } from '../src/engine/dialogue/validate';
import { getDialogueFile } from '../src/engine/dialogue/content';
import { selectSave, useManorStore } from '../src/app/store';
import { exportSaveCode, importSaveCode } from '../src/app/save';

const volume = JSON.parse(
  readFileSync(join(__dirname, '..', 'content', 'authored', 'volumes', 'volume-1.json'), 'utf8'),
) as VolumeContent;

const fresh = (): VolumeState => freshVolumeState(volume.id, 1);
const withFound = (...ids: string[]): VolumeState => ({ ...fresh(), foundFragmentIds: ids });

/** Four banked days of play, a page filed on every one of them — the walker's
 *  chronicle, which is what made the old filing-based drought read zero. */
const records4: DayRecord[] = [1, 2, 3, 4].map((day) => ({
  day, endedAt: day * 1000, cause: 'steps-exhausted',
  roomsDrafted: 3, roomsSolved: 0, stepsSpent: 18, fragmentsFound: 1,
}));

describe('definition poem — gaps keep the shape (— ? —)', () => {
  it('always renders six slots, found lines in revealOrder, the rest gaps', () => {
    const slots = definitionSlots(volume, withFound('v1-d3', 'v1-d1'));
    expect(slots.length).toBe(6);
    expect(slots[0]!.fragment?.id).toBe('v1-d1');
    expect(slots[1]!.fragment).toBeNull();
    expect(slots[2]!.fragment?.id).toBe('v1-d3');
    expect(slots.filter((s) => s.fragment === null).length).toBe(4);
  });

  it('groups by kind in revealOrder for the tabs', () => {
    const found = withFound('v1-e3', 'v1-e1', 'v1-t2');
    expect(foundByKind(volume, found, 'engraving').map((f) => f.id)).toEqual(['v1-e1', 'v1-e3']);
    expect(foundByKind(volume, found, 'testimony').map((f) => f.id)).toEqual(['v1-t2']);
  });

  it('cross-references only surface once both ends are found', () => {
    expect(crossRefs(volume, withFound('v1-e1'), 'v1-e1')).toEqual([]);
    const both = withFound('v1-e1', 'v1-t2');
    expect(crossRefs(volume, both, 'v1-e1').map((f) => f.id)).toContain('v1-t2');
  });
});

describe('alphabet plate — engravings rendered against the letters', () => {
  it('stays blank until an engraving is found', () => {
    expect(alphabetFacts(volume, fresh()).sources).toBe(0);
    expect(letterBoxes(alphabetFacts(volume, fresh()))).toBeNull();
  });

  it('accumulates eliminations, requirements, length and first letter', () => {
    const s = withFound('v1-e1', 'v1-e2', 'v1-e3', 'v1-e4', 'v1-e6');
    const facts = alphabetFacts(volume, s);
    expect(facts.knownLength).toBe(6);
    expect(facts.startsWith).toBe('L');
    for (const ch of 'WORDSMITH') expect(facts.eliminated.has(ch), ch).toBe(true);
    // vowel-sequence AUA also eliminates E, I, O and requires A + U
    expect(facts.eliminated.has('E')).toBe(true);
    expect(facts.required.has('A')).toBe(true);
    expect(facts.required.has('U')).toBe(true);
    expect(facts.required.has('C')).toBe(true);
    expect(facts.vowelSequence).toBe('AUA');
    const boxes = letterBoxes(facts)!;
    expect(boxes.length).toBe(6);
    expect(boxes[0]).toBe('L');
    expect(boxes.slice(1)).toEqual([null, null, null, null, null]);
  });

  it('never contradicts the answer (facts derived from found engravings only)', () => {
    const all = withFound(...volume.fragments.map((f) => f.id));
    const facts = alphabetFacts(volume, all);
    for (const ch of volume.answer.toUpperCase()) {
      expect(facts.eliminated.has(ch), ch).toBe(false);
    }
    for (const req of facts.required) {
      expect(volume.answer.toUpperCase().includes(req), req).toBe(true);
    }
  });
});

describe('guess history — her own elimination record (AAA 4.17)', () => {
  it('files the verdict per guess and marks the winning word', () => {
    const s: VolumeState = {
      ...fresh(),
      guesses: [
        { day: 2, guess: 'VELLUM' },
        { day: 3, guess: 'VELLUM' },
        { day: 4, guess: 'LACUNA' },
      ],
      status: 'solved',
    };
    const h = guessHistory(volume, s);
    expect(h[0]!.verdict).not.toBe('repeat');
    expect(h[1]!.verdict).toBe('repeat');
    expect(h[2]!.wasAnswer).toBe(true);
    expect(h[0]!.wasAnswer).toBe(false);
  });

  // The journal is a memory prosthetic, not an oracle (AAA 3.3 / 4.15): it
  // may only re-present what a character actually said. An exact shared-letter
  // COUNT — which the record used to publish, free, once a day, forever — is
  // a Mastermind channel that solves the letter set independently of the whole
  // engraving economy, and nobody in the fiction ever speaks a number.
  it('never exposes a numeric closeness anywhere in the record', () => {
    const s: VolumeState = { ...fresh(), guesses: [{ day: 2, guess: 'CANDLE' }] };
    const rec = guessHistory(volume, s)[0]!;
    expect(rec).not.toHaveProperty('closeness');
    for (const value of Object.values(rec)) {
      if (typeof value === 'object' && value !== null) {
        expect(Object.keys(value)).not.toContain('sharedLetters');
      }
    }
    expect(VERDICT_TOKENS[rec.verdict]).not.toMatch(/\d/);
  });

  // The five shades ARE the Portrait's authored variants, in his priority
  // order (repeat 720 > right-length 715 > warm-letters 710 > one-letter 705
  // > cold 700). Pinning them together stops the journal quoting a line he
  // does not have.
  it('the verdict taxonomy matches the Portrait\'s authored variants', () => {
    const nodeFor: Record<GuessVerdict, string> = {
      repeat: 'portrait.guess.repeat',
      'right-shape': 'portrait.guess.right-length',
      circling: 'portrait.guess.warm-letters',
      'one-letter': 'portrait.guess.one-letter',
      cold: 'portrait.guess.cold',
    };
    const portrait = getDialogueFile('portrait');
    const priority = (id: string) => {
      const n = portrait.nodes.find((x) => x.id === id);
      expect(n, `${id} must exist`).toBeTruthy();
      return n!.priority;
    };
    const order: GuessVerdict[] = ['repeat', 'right-shape', 'circling', 'one-letter', 'cold'];
    for (let i = 1; i < order.length; i++) {
      expect(priority(nodeFor[order[i - 1]!]), `${order[i - 1]} outranks ${order[i]}`)
        .toBeGreaterThan(priority(nodeFor[order[i]!]));
    }
    // And each shade the taxonomy names is the one that node actually fires on.
    expect(guessVerdict({ sharedLetters: 0, rightLength: false, repeat: true })).toBe('repeat');
    expect(guessVerdict({ sharedLetters: 0, rightLength: true, repeat: false })).toBe('right-shape');
    expect(guessVerdict({ sharedLetters: 2, rightLength: false, repeat: false })).toBe('circling');
    expect(guessVerdict({ sharedLetters: 1, rightLength: false, repeat: false })).toBe('one-letter');
    expect(guessVerdict({ sharedLetters: 0, rightLength: false, repeat: false })).toBe('cold');
  });
});

/**
 * The arrival taxonomy (round-8 defect): the Portrait used to open every
 * first visit with "So you have climbed far enough to ask" — measured live on
 * day 2 from the Entrance Hall, with nothing filed, reached by a link in the
 * journal. He was congratulating a climb nobody made. The shades below are
 * what he now answers, and each one must have an authored line, exactly the
 * way the five closeness shades do.
 */
describe('arrival shades — the climax answers the walk she had (AAA 4.16 / 5.1)', () => {
  it('classifies first / spent / again off the real movement table', () => {
    expect(arrivalShade({ firstEver: true, stepsLeft: 40 })).toBe('first');
    // Even on fumes, a first arrival is a first arrival.
    expect(arrivalShade({ firstEver: true, stepsLeft: 0 })).toBe('first');
    expect(arrivalShade({ firstEver: false, stepsLeft: SPENT_ARRIVAL_STEPS })).toBe('spent');
    expect(arrivalShade({ firstEver: false, stepsLeft: SPENT_ARRIVAL_STEPS + 1 })).toBe('again');
    // "Spent" is priced off the climb itself, never a magic number.
    expect(SPENT_ARRIVAL_STEPS).toBeGreaterThan(0);
  });

  it('every shade has an authored portrait.arrive.* line on the door screen', () => {
    const portrait = getDialogueFile('portrait');
    for (const shade of ['first', 'spent', 'again'] as const) {
      const node = portrait.nodes.find((n) => n.id === `portrait.arrive.${shade}`);
      expect(node, `portrait.arrive.${shade} is missing — the fallback would carry it alone`).toBeTruthy();
      expect(node!.trigger, 'arrival lines ride the door screen\'s own slot').toBe('sanctum-idle');
      expect(node!.once, 'an arrival line is not a one-shot').toBe(false);
    }
  });

  it('only the first-arrival line is allowed to mention the climb', () => {
    const portrait = getDialogueFile('portrait');
    const text = (id: string) =>
      portrait.nodes.find((n) => n.id === id)!.lines.map((l) => l.text).join(' ');
    expect(text('portrait.arrive.first')).toMatch(/climb|stair|storey/i);
    // A repeat visit must not be told it has "climbed far enough to ask" —
    // the exact sentence that shipped, on a day with no climb in it.
    expect(text('portrait.arrive.again')).not.toMatch(/climbed far enough/i);
  });

  it('the landing flag is a legal vol.* write-once flag (docs/flags.md)', () => {
    expect(landingFlag(volume.id)).toBe(`vol.${volume.id}.landing-reached`);
    expect(landingFlag(volume.id)).toMatch(FLAG_REGEX);
  });
});

describe('nudges — sympathetic, never silence (AAA 4.16)', () => {
  it('a thin case file is flagged thin, never gated', () => {
    const r = sanctumReadiness(volume, fresh());
    expect(r.enough).toBe(false);
  });

  it(`the thin-file signal stands down at ${THIN_FILE_THRESHOLD} fragments`, () => {
    const ids = volume.fragments.slice(0, THIN_FILE_THRESHOLD).map((f) => f.id);
    const r = sanctumReadiness(volume, withFound(...ids));
    expect(r.enough).toBe(true);
  });

  // The nudge COPY is the Portrait's, and it lives in his authored JSON
  // (AAA 5.13) — it used to be two strings in engine/journal.ts written in
  // the housekeeper's voice ("…dear") and painted unattributed under his line
  // on the one screen where he is meant to be at his most forbidding.
  it('the thin-file nudge is authored, in the Portrait\'s register, and covers every thin count', () => {
    const portrait = getDialogueFile('portrait');
    const gates = portrait.nodes.filter((n) => n.id.startsWith('portrait.gate.'));
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) {
      expect(g.once).toBe(false);
      // Round 5: moved off 'idle' onto its own trigger. On 'idle' these were
      // eligible in his ordinary rotation, so a parlor visit could serve
      // "your journal is empty" as small talk — the sentence only means
      // anything on the Sanctum door screen.
      expect(g.trigger).toBe('sanctum-idle');
      for (const line of g.lines) {
        expect(line.speaker).toBe('portrait');
        // His address term is "reader". "dear" belongs to Bramble, Ellery and Posy.
        expect(line.text.toLowerCase()).not.toMatch(/\bdear\b/);
      }
    }
    // ── ROUND-14 BLOCKER: THE NUDGE RETIRED AT 4 AND DEDUCTION NEEDED 13. ──
    // The bands used to stop at THIN_FILE_THRESHOLD, and SanctumView suppressed
    // the whole nudge there, so from four readable pages to about thirteen —
    // measured median day 5 to median day 20 for PROFILE_DECENT, most of the
    // volume — she stood at the door and got the silence 4.16 forbids. The
    // bands now tile 0 → DEDUCTION_FLOOR with no gap and no overlap, and the
    // ceiling is DERIVED (engine/volume.FRAGMENTS_TO_DEDUCE) rather than
    // retyped, so this cannot come apart again by editing one number.
    //
    // ROUND 11: the gates count pages she can READ, not pages she is carrying
    // (engine/journal.sanctumReadiness) — four sealed smudges used to retire
    // the one AAA 4.16 signal in the game for a player with no constraint on
    // the alphabet plate at all.
    const covering = (count: number) =>
      gates.filter((g) =>
        (g.conditions ?? []).every((c) =>
          c.kind === 'fragmentsLegible' &&
          (c.gte === undefined || count >= c.gte) &&
          (c.lte === undefined || count <= c.lte)));
    for (let n = 0; n < DEDUCTION_FLOOR; n++) {
      expect(covering(n).length, `no authored gate line for ${n} legible fragments`)
        .toBeGreaterThanOrEqual(1);
      // Two eligible bands at one count is a coin toss between two sentences
      // about the same file — the tiling has to be a partition, not a pile.
      expect(covering(n).map((g) => g.id), `overlapping gate bands at ${n}`).toHaveLength(1);
    }
    // ...and the signal stands down exactly where deduction becomes possible.
    expect(covering(DEDUCTION_FLOOR)).toEqual([]);
    // The old edge is still a real edge, and it is INSIDE the nudged range now.
    expect(covering(THIN_FILE_THRESHOLD).length).toBe(1);
    expect(THIN_FILE_THRESHOLD).toBeLessThan(DEDUCTION_FLOOR);
  });

  /**
   * THE TWO NUMBERS ARE ONE NUMBER (round 14). `DEDUCTION_FLOOR` and the
   * campaign model's `KNOWLEDGE.fragmentsToDeduce` described the same
   * quantity — how many readable pages pin the word — from opposite sides of
   * the codebase, and neither doc named the other. They are pinned to each
   * other here, in the mystery's own suite, so a re-derivation in either place
   * goes red instead of silently re-opening the silent band.
   */
  it('the deduction floor is the same number the campaign model samples', () => {
    expect(DEDUCTION_FLOOR).toBe(FRAGMENTS_TO_DEDUCE[0]);
    expect(FRAGMENTS_TO_DEDUCE[0]).toBe(KNOWLEDGE.fragmentsToDeduce[0]);
    expect(FRAGMENTS_TO_DEDUCE[1]).toBe(KNOWLEDGE.fragmentsToDeduce[1]);
    // Sanity on the band itself: optimistic end below resistant end, and the
    // resistant end inside the volume's authored supply.
    expect(FRAGMENTS_TO_DEDUCE[0]).toBeLessThan(FRAGMENTS_TO_DEDUCE[1]);
    expect(FRAGMENTS_TO_DEDUCE[1]).toBeLessThanOrEqual(volume.fragments.length);
  });

  it('readiness reports both bands, and they are not the same band', () => {
    const ids = (n: number) => volume.fragments.slice(0, n).map((f) => f.id);
    const at = (n: number) => sanctumReadiness(volume, withFound(...ids(n)));
    expect(at(THIN_FILE_THRESHOLD).enough).toBe(true);
    expect(at(THIN_FILE_THRESHOLD).deducible).toBe(false);
    expect(at(DEDUCTION_FLOOR).deducible).toBe(true);
    expect(at(DEDUCTION_FLOOR - 1).deducible).toBe(false);
  });

  /**
   * The screen that suppresses the nudge must suppress it on the DEDUCTION
   * band, not on the thin-file one. This is a source lint because the defect
   * was a single identifier: `readiness.enough` where `readiness.deducible`
   * belonged, and every test in this file stayed green through it.
   */
  it('the Sanctum door retires the nudge only once she can deduce', () => {
    const src = readFileSync(
      join(__dirname, '..', 'src', 'ui', 'sanctum', 'SanctumView.tsx'), 'utf8',
    );
    expect(src).toMatch(/readiness\.deducible \|\| guessedToday/);
    expect(src, 'the thin-file edge must not gate the nudge again')
      .not.toMatch(/readiness\.enough \|\| guessedToday/);
  });

  // The engine must not have quietly regrown the strings.
  it('sanctumReadiness carries counts only — no prose', () => {
    const r = sanctumReadiness(volume, fresh());
    expect(Object.keys(r).sort()).toEqual(['deducible', 'enough', 'filed', 'legible', 'total']);
  });

  // ── ROUND-11 BLOCKER: THE GATES COUNTED PAGES SHE CANNOT READ. ────────────
  it('a file of SMUDGES is still a thin file (AAA 4.16)', () => {
    const ids = volume.fragments.slice(0, THIN_FILE_THRESHOLD).map((f) => f.id);
    const state = withFound(...ids);
    const sealed = { sealedIds: new Set(ids) };
    const r = sanctumReadiness(volume, state, sealed);
    expect(r.filed).toBe(THIN_FILE_THRESHOLD);
    expect(r.legible).toBe(0);
    // The one 4.16 signal in the game must still be standing.
    expect(r.enough).toBe(false);
    // ...and the moment one of them is made out, the count moves by one.
    const partly = { sealedIds: new Set(ids.slice(1)) };
    expect(sanctumReadiness(volume, state, partly).legible).toBe(1);
    // Both numbers survive: "she has been collecting" is a real, different fact.
    expect(sanctumReadiness(volume, state, partly).filed).toBe(THIN_FILE_THRESHOLD);
  });

  it('the Sanctum link says BOTH numbers whenever they differ', () => {
    const src = readFileSync(
      join(__dirname, '..', 'src', 'ui', 'sanctum', 'SanctumView.tsx'), 'utf8',
    );
    expect(src).toMatch(/readiness\.filed/);
    expect(src).toMatch(/readiness\.legible/);
    expect(src).toMatch(/made out/);
    // The old line read "N of 17 fragments filed" and nothing else.
    expect(src).not.toMatch(/readiness\.found/);
  });

  it('the journal nudge always has something warm to say while active', () => {
    expect(journalNudge(volume, fresh())).toBeTruthy();
    expect(journalNudge(volume, withFound('v1-d1'))).toBeTruthy();
    const all = withFound(...volume.fragments.map((f) => f.id));
    expect(journalNudge(volume, all)).toBeTruthy();
    expect(journalNudge(volume, { ...all, status: 'solved' })).toBeNull();
  });

});

// ---------------------------------------------------------------------------
// The unread chain (AAA 11.19-11.22)
// ---------------------------------------------------------------------------

const noLetters = { arrivedLetterIds: [] as string[], openedLetterIds: new Set<string>() };
const unread = (state: VolumeState, viewed: string[] = [], letters = noLetters) =>
  journalUnread(volume, state, { viewedIds: new Set(viewed), ...letters });

describe('unread is state, not recency', () => {
  it('is empty when nothing is filed — no marker where nothing is unread (11.21)', () => {
    const u = unread(fresh());
    expect(u.total).toBe(0);
    expect(u.fragments).toEqual([]);
  });

  it('marks every filed-but-unviewed fragment, grouped by the tab that shows it', () => {
    const state = withFound('v1-d1', 'v1-e1', 'v1-t2');
    const u = unread(state);
    expect(u.word).toEqual(['v1-d1']);
    expect(u.engravings).toEqual(['v1-e1']);
    expect(u.testimony).toEqual(['v1-t2']);
    // The entrance count is EXACTLY the number of unviewed items (11.21).
    expect(u.total).toBe(3);
    expect(u.total).toBe(u.fragments.length + u.letters.length);
  });

  it('retires only what has been viewed, and only that', () => {
    const state = withFound('v1-d1', 'v1-e1', 'v1-t2');
    const u = unread(state, ['v1-e1']);
    expect(u.engravings).toEqual([]);
    expect(u.total).toBe(2);
  });

  it('never marks a fragment the volume has not filed', () => {
    // Viewed-but-unfound and unfound-entirely both contribute nothing.
    expect(unread(fresh(), ['v1-d1']).total).toBe(0);
  });

  it('counts arrived-but-unopened letters, and drops them once opened', () => {
    const state = fresh();
    const tray = { arrivedLetterIds: ['first-post', 'readers-note'], openedLetterIds: new Set(['first-post']) };
    const u = unread(state, [], tray);
    expect(u.letters).toEqual(['readers-note']);
    expect(u.total).toBe(1);
  });

  it('takes no event stream and no day number — nothing dusk can prune (11.20)', () => {
    // The old `filedToday(recentEvents, day)` answered "filed on day N?" off
    // day.recentEvents, which pruneEventsAtDusk empties every night — so an
    // unviewed fragment silently lost its marker overnight and a fragment read
    // the instant it arrived kept one until dusk. The derivation's whole input
    // surface is now (content, volume state, viewed/opened ids): three
    // arguments, none of them day-scoped. The store-level proof that the
    // marker survives an actual day roll is in the slice suite below.
    expect(journalUnread.length).toBe(3);
  });
});

describe('viewed flags — the same write-once model as the letters', () => {
  it('round-trips a fragment id through the flag namespace', () => {
    const flag = viewedFragmentFlag('volume-1', 'v1-d1');
    expect(flag).toBe('vol.volume-1.viewed-v1-d1');
    expect([...viewedFragmentIds('volume-1', [flag, 'vol.volume-1.opened-first-post'])]).toEqual(['v1-d1']);
  });

  it('ignores flags belonging to another volume', () => {
    expect(viewedFragmentIds('volume-2', ['vol.volume-1.viewed-v1-d1']).size).toBe(0);
  });

  it('every authored fragment id yields a flag docs/flags.md accepts', () => {
    // setFlag silently REJECTS anything off-grammar, which would make the
    // marker un-clearable. A future volume authoring dotted ids (frag.v1.03)
    // must fail here, not in the wife's save.
    for (const f of volume.fragments) {
      expect(FLAG_REGEX.test(viewedFragmentFlag(volume.id, f.id))).toBe(true);
    }
  });
});

describe('displayedFragmentIds — viewing is what a tab puts on the glass', () => {
  const state = withFound('v1-d1', 'v1-e1', 'v1-t2');
  it('reports exactly the found fragments each tab renders', () => {
    expect(displayedFragmentIds(volume, state, 'word')).toEqual(['v1-d1']);
    expect(displayedFragmentIds(volume, state, 'engravings')).toEqual(['v1-e1']);
    expect(displayedFragmentIds(volume, state, 'testimony')).toEqual(['v1-t2']);
  });
  it('never claims a letter was viewed by opening the tab — the seal is the marker', () => {
    expect(displayedFragmentIds(volume, state, 'letters')).toEqual([]);
  });
  it('viewing every tab in turn clears the whole chain, and nothing else does', () => {
    const tabs: JournalTab[] = ['word', 'engravings', 'testimony', 'letters'];
    const viewed = tabs.flatMap((t) => displayedFragmentIds(volume, state, t));
    expect(unread(state, viewed).total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ROUND 12 — ONE MARK, TWO MEANINGS (the AAA 11.20 blocker)
// ---------------------------------------------------------------------------

/**
 * The defect: `displayedFragmentIds` excluded SEALED cards, so a page the
 * player had fully looked at kept its wax marker simply because the hand was
 * not legible yet. Wax therefore meant BOTH "you have not seen this" and "this
 * is not deciphered" — 11.20 requires it to clear on viewing and on nothing
 * else, and 11.21 requires any count beside it to be exactly the number of
 * unviewed items.
 *
 * The fix gives the second state its own vocabulary. These tests walk all four
 * combinations of (seen?, legible?) and pin each one's two markers.
 */
describe('the two markers — wax is "unseen", the seal is "unmade-out"', () => {
  /** Derive both chains the way `useJournalUnread` does. */
  const marks = (
    state: VolumeState,
    o: { viewed?: string[]; glanced?: string[]; sealed?: string[] } = {},
    letters = noLetters,
  ) =>
    journalUnread(volume, state, {
      viewedIds: new Set(o.viewed ?? []),
      glancedIds: new Set(o.glanced ?? []),
      sealedIds: new Set(o.sealed ?? []),
      ...letters,
    });

  const state = withFound('v1-d1');

  it('(1) UNREAD + SEALED — never opened, and not made out', () => {
    const m = marks(state, { sealed: ['v1-d1'] });
    expect(m.word).toEqual(['v1-d1']);          // wax: she has not looked
    expect(m.total).toBe(1);
    expect(m.sealed.word).toEqual(['v1-d1']);   // seal: the ink has run
    expect(m.sealed.total).toBe(1);
  });

  it('(2) READ + SEALED — she has looked at the smudge; it is still a smudge', () => {
    // THE CASE THAT WAS FALSE BY DESIGN. Wax must be gone: nothing here is
    // unseen. The seal must remain: nothing here is deciphered.
    const m = marks(state, { sealed: ['v1-d1'], glanced: ['v1-d1'] });
    expect(m.word).toEqual([]);
    expect(m.total).toBe(0);
    expect(m.sealed.word).toEqual(['v1-d1']);
    expect(m.sealed.total).toBe(1);
  });

  it('(3) UNREAD + LEGIBLE — readable and never looked at', () => {
    const m = marks(state);
    expect(m.word).toEqual(['v1-d1']);
    expect(m.total).toBe(1);
    expect(m.sealed.total).toBe(0);
  });

  it('(4) READ + LEGIBLE — no marker of either kind', () => {
    const m = marks(state, { viewed: ['v1-d1'] });
    expect(m.total).toBe(0);
    expect(m.sealed.total).toBe(0);
  });

  it('THE TRANSITION: making a glanced page out RE-RAISES unread', () => {
    // A page becoming legible is information she has not seen. Glancing at a
    // smudge is not reading the sentence under it, so the moment a solve makes
    // it out the page is unread again — and the seal marker retires.
    const glanced = { sealed: ['v1-d1'], glanced: ['v1-d1'] };
    expect(marks(state, glanced).total).toBe(0);

    // …a room is solved; `legible-v1-d1` lands, so it leaves the sealed set.
    const after = marks(state, { glanced: ['v1-d1'] });
    expect(after.word).toEqual(['v1-d1']);
    expect(after.total).toBe(1);
    expect(after.sealed.total).toBe(0);

    // …and reading it NOW is what finally retires the wax, for good.
    expect(marks(state, { glanced: ['v1-d1'], viewed: ['v1-d1'] }).total).toBe(0);
  });

  it('a glance is not a reading: the glance flag alone never clears a legible page', () => {
    // The encoding's whole load-bearing property. If `glanced-` could stand in
    // for `viewed-`, the transition above would silently stop firing.
    expect(marks(state, { glanced: ['v1-d1'] }).total).toBe(1);
  });

  it('hasSeen is the one predicate, and it asks about the CURRENT state', () => {
    const viewedIds = new Set(['v1-d1']);
    const glancedIds = new Set(['v1-e1']);
    // Legible → the reading flag decides.
    expect(hasSeen('v1-d1', { viewedIds, glancedIds })).toBe(true);
    expect(hasSeen('v1-e1', { viewedIds, glancedIds })).toBe(false);
    // Sealed → the glance flag decides, and only the glance flag.
    const sealedIds = new Set(['v1-d1', 'v1-e1']);
    expect(hasSeen('v1-d1', { viewedIds, glancedIds, sealedIds })).toBe(false);
    expect(hasSeen('v1-e1', { viewedIds, glancedIds, sealedIds })).toBe(true);
  });

  it('TRUTHFUL COUNTS at every level, on a mixed journal (11.19/11.21)', () => {
    // Six filed pages in three tabs, in all four states at once.
    const mixed = withFound('v1-d1', 'v1-d2', 'v1-e1', 'v1-e2', 'v1-t2', 'v1-t3');
    const m = marks(mixed, {
      sealed: ['v1-d2', 'v1-e1', 'v1-t3'],
      glanced: ['v1-d2'],                       // seen while sealed
      viewed: ['v1-d1', 'v1-e2'],               // read
    });
    // Word: d1 read+legible, d2 read+sealed → no wax, one ring.
    expect(m.word).toEqual([]);
    expect(m.sealed.word).toEqual(['v1-d2']);
    // Engravings: e1 unread+sealed, e2 read+legible → one wax, one ring.
    expect(m.engravings).toEqual(['v1-e1']);
    expect(m.sealed.engravings).toEqual(['v1-e1']);
    // Testimony: t2 unread+legible, t3 unread+sealed → two wax, one ring.
    expect(m.testimony).toEqual(['v1-t2', 'v1-t3']);
    expect(m.sealed.testimony).toEqual(['v1-t3']);

    // The entrance numbers are exactly the sums of the tab numbers, and the
    // two chains are never added together.
    expect(m.total).toBe(m.word.length + m.engravings.length + m.testimony.length + m.letters.length);
    expect(m.total).toBe(3);
    expect(m.sealed.total).toBe(3);
    expect(m.fragments).toEqual(['v1-e1', 'v1-t2', 'v1-t3']);
    expect(m.sealed.fragments).toEqual(['v1-d2', 'v1-e1', 'v1-t3']);
  });

  it('a sealed page is still counted as unread when she has not opened the tab', () => {
    // Truthful in the other direction too (11.21): "read-but-sealed" is a
    // state she has to actually reach, not the default for anything sealed.
    const m = marks(withFound('v1-d1', 'v1-e1'), { sealed: ['v1-d1', 'v1-e1'] });
    expect(m.total).toBe(2);
    expect(m.sealed.total).toBe(2);
  });

  it('degrades to the pre-seal rule when no seal information is supplied', () => {
    // Every caller predating round 10 (and every save that has no seal flags)
    // must land on exactly the old behaviour.
    expect(unread(withFound('v1-d1')).total).toBe(1);
    expect(unread(withFound('v1-d1'), ['v1-d1']).total).toBe(0);
    expect(unread(withFound('v1-d1')).sealed.total).toBe(0);
    expect(NOTHING_UNREAD.sealed.total).toBe(0);
  });

  it('the glance flag lives in the docs/flags.md namespace, per volume', () => {
    const flag = glancedFragmentFlag('volume-1', 'v1-d1');
    expect(flag).toBe('vol.volume-1.glanced-v1-d1');
    expect([...glancedFragmentIds('volume-1', [flag, viewedFragmentFlag('volume-1', 'v1-e1')])])
      .toEqual(['v1-d1']);
    expect(glancedFragmentIds('volume-2', [flag]).size).toBe(0);
    for (const f of volume.fragments) {
      expect(FLAG_REGEX.test(glancedFragmentFlag(volume.id, f.id)), f.id).toBe(true);
    }
  });

  it('a live save written before the glance flag existed keeps its pages read', () => {
    // The reason the NEW state got the NEW flag: `viewed-` already means "seen
    // it readable" in the owner's save and in the migration backfill, and
    // nothing sealed exists there. Re-deriving must not re-mark a fortnight of
    // reading.
    const legacyFlags = volume.fragments.map((f) => viewedFragmentFlag(volume.id, f.id));
    const all = withFound(...volume.fragments.map((f) => f.id));
    const m = journalUnread(volume, all, {
      viewedIds: viewedFragmentIds(volume.id, legacyFlags),
      glancedIds: glancedFragmentIds(volume.id, legacyFlags),   // empty
      sealedIds: sealedFragmentIds(volume.id, legacyFlags),     // empty
      ...noLetters,
    });
    expect(m.total).toBe(0);
    expect(m.sealed.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ROUND 10 — entering gets the document, solving makes it legible
// ---------------------------------------------------------------------------

/**
 * The owner's directive, in one suite: *"What's the point of solving the word
 * puzzles? Solving them needs to matter, even if they're not blocking."*
 *
 * The verified defect: a violet room paid out its fragment on ENTRY, fully
 * readable, so a player could walk into the Archive, walk straight out, and
 * keep the clue — the word games funded the mystery without ever being it.
 * A filed fragment is now either SEALED (hers, visible, permanent, and not yet
 * made out) or LEGIBLE, and SOLVING is what moves one to the other.
 */
describe('sealed fragments — filed forever, made out by solving', () => {
  const sealedOf = (...ids: string[]) => ({ sealedIds: new Set(ids) });

  it('derives sealed = sealed-flag MINUS legible-flag, per volume', () => {
    const flags = [
      sealedFragmentFlag('volume-1', 'v1-d1'),
      sealedFragmentFlag('volume-1', 'v1-e1'),
      legibleFragmentFlag('volume-1', 'v1-e1'),      // this one has been made out
      sealedFragmentFlag('volume-2', 'v2-d1'),        // another volume entirely
    ];
    expect([...sealedFragmentIds('volume-1', flags)]).toEqual(['v1-d1']);
    expect([...sealedFragmentIds('volume-2', flags)]).toEqual(['v2-d1']);
  });

  it('reports NOTHING sealed for a save written before the mechanic existed', () => {
    // The reason legibility takes two write-once flags instead of one: a live
    // save carries neither, and its default must be "readable". A single
    // `legible-` opt-in would have re-sealed sixteen pages the owner has been
    // reading for a fortnight.
    expect(sealedFragmentIds('volume-1', ['vol.volume-1.viewed-v1-d1']).size).toBe(0);
    expect(sealedCount(withFound('v1-d1', 'v1-e1'))).toBe(0);
  });

  it('every fragment id yields sealed/legible flags docs/flags.md accepts', () => {
    for (const f of volume.fragments) {
      expect(FLAG_REGEX.test(sealedFragmentFlag(volume.id, f.id)), f.id).toBe(true);
      expect(FLAG_REGEX.test(legibleFragmentFlag(volume.id, f.id)), f.id).toBe(true);
    }
  });

  it('a sealed engraving contributes NOTHING to the alphabet plate', () => {
    // The mechanical teeth of the whole design change: the constraint the
    // journal tests against the alphabet arrives when a word game is solved,
    // not when a violet door is opened.
    const state = withFound('v1-e1', 'v1-e3');
    expect(alphabetFacts(volume, state).knownLength).toBe(6);
    const half = alphabetFacts(volume, state, sealedOf('v1-e1'));
    expect(half.knownLength).toBeNull();
    expect(half.startsWith).toBe('L');
    expect(half.sources).toBe(1);
    const none = alphabetFacts(volume, state, sealedOf('v1-e1', 'v1-e3'));
    expect(none.sources).toBe(0);
    expect(letterBoxes(none)).toBeNull();
  });

  it('a sealed definition line holds its slot as a torn leaf, not as a gap', () => {
    const slots = definitionSlots(volume, withFound('v1-d1'), sealedOf('v1-d1'));
    expect(slots[0]!.fragment?.id).toBe('v1-d1');   // she HAS it
    expect(slots[0]!.sealed).toBe(true);            // she cannot read it yet
    expect(slots[1]!.fragment).toBeNull();          // and this one is a real gap
    expect(slots[1]!.sealed).toBe(false);
  });

  it('Ellery will not read a smudge: nextUninterpreted skips sealed pages', () => {
    const state = withFound('v1-d1', 'v1-e1');
    expect(nextUninterpreted(volume, state)).toBe('v1-d1');
    expect(nextUninterpreted(volume, state, sealedOf('v1-d1'))).toBe('v1-e1');
    expect(nextUninterpreted(volume, state, sealedOf('v1-d1', 'v1-e1'))).toBeNull();
  });

  it('a cross-reference to a page she cannot read is not a cross-reference', () => {
    const both = withFound('v1-e1', 'v1-t2');
    expect(crossRefs(volume, both, 'v1-e1').map((f) => f.id)).toContain('v1-t2');
    expect(crossRefs(volume, both, 'v1-e1', sealedOf('v1-t2'))).toEqual([]);
  });

  it('ROUND 12 — a sealed page IS displayed: the tab puts it on the glass', () => {
    // This test used to assert the opposite, and that assertion was the
    // round-12 blocker (AAA 11.20 false by design): filtering sealed pages out
    // of `displayedFragmentIds` made wax mean "not deciphered" as well as "not
    // looked at", so a card she had fully looked at kept its unread mark.
    // `displayedFragmentIds` answers ONE question — what did the tab show her —
    // and the seal is the other marker's business entirely.
    const state = withFound('v1-e1');
    expect(displayedFragmentIds(volume, state, 'engravings')).toEqual(['v1-e1']);
    expect(displayedFragmentIds(volume, withFound('v1-d1'), 'word')).toEqual(['v1-d1']);
  });

  it('isLegible is found AND made out', () => {
    const state = withFound('v1-d1');
    expect(isLegible(state, 'v1-d1')).toBe(true);
    expect(isLegible(state, 'v1-d1', sealedOf('v1-d1'))).toBe(false);
    expect(isLegible(state, 'v1-e1')).toBe(false);   // not even found
  });

  it('TIER SCALES THE YIELD: a tier-3 room makes out more than a ground-floor one', () => {
    expect(decipherYield(1)).toBe(1);
    expect(decipherYield(2)).toBe(2);
    expect(decipherYield(3)).toBe(3);
    for (let i = 1; i < DECIPHER_YIELD_BY_TIER.length; i++) {
      expect(DECIPHER_YIELD_BY_TIER[i]!).toBeGreaterThan(DECIPHER_YIELD_BY_TIER[i - 1]!);
    }
  });

  it('makes out the OLDEST sealed pages first, and never more than it has', () => {
    const state = withFound('v1-e1', 'v1-d1', 'v1-t2');
    const sealed = new Set(['v1-e1', 'v1-d1', 'v1-t2']);
    // revealOrder: v1-d1 = 1, v1-e1 = 2, v1-t2 = 3.
    expect(fragmentsToDecipher(volume, state, sealed, 2)).toEqual(['v1-d1', 'v1-e1']);
    expect(fragmentsToDecipher(volume, state, sealed, 9)).toEqual(['v1-d1', 'v1-e1', 'v1-t2']);
    expect(fragmentsToDecipher(volume, state, sealed, 0)).toEqual([]);
    // Never a fragment that is not filed, however sealed the flag claims it is.
    expect(fragmentsToDecipher(volume, withFound('v1-d1'), sealed, 3)).toEqual(['v1-d1']);
  });

  /**
   * ROUND 13 (AAA 6.16) — THE NUDGE NAMES THE BACKLOG; IT NO LONGER RECITES
   * THE RAIL'S INSTRUCTION.
   *
   * At 390px with five sealed pages the Word tab printed the same instruction
   * five times in three different verbs — once per sealed line, again in this
   * nudge, again in the footer rail — and the tier hint three times. The rail
   * is the surface that owns it (pinned outside the scroll, count and tier hint
   * beside it); Ellery says the thing only Ellery can say. So the assertion
   * inverts: the count still has to be here (it is the useful half), and the
   * instruction must NOT be.
   */
  it('the journal points her at the backlog, in a voice, and does not repeat the rail', () => {
    const state = withFound('v1-d1', 'v1-e1');
    const nudge = journalNudge(volume, state, sealedOf('v1-d1', 'v1-e1'));
    expect(nudge).toBeTruthy();
    expect(nudge).toContain('2');
    expect(nudge!.toLowerCase()).toContain('not made out');
    expect(nudge!.toLowerCase()).not.toMatch(/solve|finish a room|the higher the room|harder the room/);
    expect(sealedCount(state, sealedOf('v1-d1', 'v1-e1'))).toBe(2);
  });

  /** The single-page voice keeps the same discipline (state, no instruction). */
  it('the one-page nudge says the state and not the instruction', () => {
    const state = withFound('v1-d1');
    const nudge = journalNudge(volume, state, sealedOf('v1-d1'));
    expect(nudge!.toLowerCase()).toContain('not made out');
    expect(nudge!.toLowerCase()).not.toMatch(/solve|finish a room|the higher the room/);
  });
});

/**
 * A manor with the player standing on the landing, through a north door into
 * the sealed Sanctum — the ONLY place the door hears a word (AAA 4.10e). The
 * guess fixtures below stand here because the game makes her stand here.
 */
function manorAtTheDoor(): ManorState {
  const base = createManor(1);
  const landing: PlacedRoom = {
    cardId: 'reading-nook', cell: SANCTUM_DOOR_CELL, doors: ['N', 'S'],
    solved: true, kind: 'parlor',
  };
  return {
    ...base,
    rooms: { ...base.rooms, [cellKey(SANCTUM_DOOR_CELL)]: landing },
    playerCell: { ...SANCTUM_DOOR_CELL },
  };
}

describe('journal slice through the real store', () => {
  beforeEach(() => {
    // Reset only the pieces this suite exercises (the store is a singleton).
    useManorStore.setState({
      volume: fresh(),
      flags: [],
      recentEvents: [],
      counters: {},
      day: null,
      manor: manorAtTheDoor(),
    });
  });

  it('the door refuses a word spoken from anywhere but the landing', () => {
    // The round-7 blocker in one case: from the Entrance Hall the guess is
    // simply not heard — no attempt spent, nothing journaled, no penalty.
    useManorStore.setState({ manor: createManor(1) });
    useManorStore.getState().guessAtSanctum('lacuna');
    const st = useManorStore.getState();
    expect(st.volume.status).toBe('active');
    expect(st.volume.guesses).toEqual([]);
    expect(st.counters['sanctum-guess-wrong']).toBeUndefined();
  });

  it('fileFragment files once, forever, and rings the event spine', () => {
    const s = useManorStore.getState();
    s.fileFragment('v1-d1');
    s.fileFragment('v1-d1'); // idempotent
    s.fileFragment('not-a-real-fragment'); // stale ids never corrupt state
    const after = useManorStore.getState();
    expect(after.volume.foundFragmentIds).toEqual(['v1-d1']);
    expect(after.counters['fragment-found']).toBe(1);
  });

  it('interpretFragment: only found fragments, "next" resolves in revealOrder', () => {
    const s = useManorStore.getState();
    s.interpretFragment('v1-d1'); // not found yet → no-op
    expect(useManorStore.getState().volume.interpretedFragmentIds).toEqual([]);
    s.fileFragment('v1-e1');
    s.fileFragment('v1-d1');
    s.interpretFragment('next'); // lowest revealOrder found → v1-d1
    expect(useManorStore.getState().volume.interpretedFragmentIds).toEqual(['v1-d1']);
    expect(nextUninterpreted(volume, useManorStore.getState().volume)).toBe('v1-e1');
  });

  it('guessAtSanctum: wrong journals + emits closeness; the gate holds for the day', () => {
    const s = useManorStore.getState();
    s.guessAtSanctum('vellum');
    let st = useManorStore.getState();
    expect(st.volume.guesses.length).toBe(1);
    expect(st.counters['sanctum-guess-wrong']).toBe(1);
    s.guessAtSanctum('lagoon'); // same day → gate, nothing recorded
    st = useManorStore.getState();
    expect(st.volume.guesses.length).toBe(1);
    expect(st.counters['sanctum-guess-wrong']).toBe(1);
  });

  it('the winning word solves the volume, sets the reserved flag, rings the spine', () => {
    const s = useManorStore.getState();
    s.guessAtSanctum('  the Lacuna ');
    const st = useManorStore.getState();
    expect(st.volume.status).toBe('solved');
    expect(st.flags).toContain(solvedFlag(volume.id));
    expect(st.counters['volume-solved']).toBe(1);
    // beginNextVolume is a warm no-op until a volume-2 is authored.
    s.beginNextVolume();
    expect(useManorStore.getState().volume.volumeId).toBe(volume.id);
  });

  /**
   * ═══ ROUND-13 BLOCKER (AAA 4.14): THE PITY FLOOR'S DAY MARK ═══════════════
   *
   * The write side of the fix, through the real slice. A page she cannot read
   * must not mark the day, or the mercy channel is switched off by exactly the
   * documents that taught her nothing.
   */
  it('only a page she can READ marks the day for the pity floor', () => {
    useManorStore.setState({ day: { ...useManorStore.getState().day, day: 4 } as never });
    const s = useManorStore.getState();

    s.fileFragment('v1-d1', { sealed: true });          // walked into a violet room
    expect(useManorStore.getState().flags).not.toContain(legibleDayFlag(volume.id, 4));
    expect(legibleDroughtDays(volume.id, useManorStore.getState().flags, records4)).toBe(4);

    s.fileFragment('v1-t1');                            // testimony, spoken aloud
    expect(useManorStore.getState().flags).toContain(legibleDayFlag(volume.id, 4));
    expect(legibleDroughtDays(volume.id, useManorStore.getState().flags, records4)).toBe(0);
  });

  it('making the backlog out marks the day even though nothing new was filed', () => {
    useManorStore.setState({ day: { ...useManorStore.getState().day, day: 6 } as never });
    const s = useManorStore.getState();
    s.fileFragment('v1-d1', { sealed: true });
    s.fileFragment('v1-e1', { sealed: true });
    expect(useManorStore.getState().flags).not.toContain(legibleDayFlag(volume.id, 6));

    expect(s.decipherFragments(1).length).toBe(1);
    expect(useManorStore.getState().flags).toContain(legibleDayFlag(volume.id, 6));
  });

  /**
   * ═══ ROUND-13 BLOCKER (AAA 4.15): THE CLOSED VOLUME'S ARCHIVE CONTRADICTED
   *     ITS OWN CEREMONY ════════════════════════════════════════════════════
   *
   * Won at the door holding three sealed definition lines. The epilogue printed
   * all three IN CLEAR (`definitionSlots(content, volume)` with no `sealedIds`)
   * while the Journal — which the ceremony's own copy names as the permanent
   * trace, "the journal keeps the rest" — rendered the same three lines as
   * dot-runs telling her to go solve a room, on a volume whose status is
   * 'solved', with the footer rail and Ellery's pointer both retired so there
   * was no count and no context left for the instruction. The text she earned
   * existed legibly only on a ceremony screen, which is exactly what 4.15
   * forbids.
   *
   * Fix (a) of the two the finding offered, and the cozy reading: the volume
   * closed, so the house gave her the rest. One rule, every surface.
   */
  it('closing the volume makes every filed page legible — the archive matches the ceremony', () => {
    const s = useManorStore.getState();
    // Three pages walked out of violet rooms and never made out.
    s.fileFragment('v1-d1', { sealed: true });
    s.fileFragment('v1-e1', { sealed: true });
    s.fileFragment('v1-t1', { sealed: true });
    expect(sealedFragmentIds(volume.id, useManorStore.getState().flags).size).toBe(3);

    s.guessAtSanctum('lacuna');

    const st = useManorStore.getState();
    expect(st.volume.status).toBe('solved');
    // No smudge survives the closing of the book — so the journal, the tabs,
    // the entrance count and the digest all agree with the epilogue.
    expect(sealedFragmentIds(volume.id, st.flags).size).toBe(0);
    for (const id of ['v1-d1', 'v1-e1', 'v1-t1']) {
      expect(st.flags).toContain(legibleFragmentFlag(volume.id, id));
    }
    // Routed through the ordinary decipher channel, so the spine carries it.
    expect(st.counters['fragment-made-out']).toBe(1);
    // And the archive reads as prose, not as dot-runs (the surface the
    // ceremony promised).
    const slots = definitionSlots(volume, st.volume, {
      sealedIds: sealedFragmentIds(volume.id, st.flags),
    });
    expect(slots.filter((x) => x.fragment).every((x) => !x.sealed)).toBe(true);
    // The dead instruction is gone with the smudges: nothing left to nudge at.
    expect(journalNudge(volume, st.volume, {
      sealedIds: sealedFragmentIds(volume.id, st.flags),
    })).toBeNull();
  });

  it('a volume won with nothing sealed rings no phantom decipher', () => {
    const s = useManorStore.getState();
    s.fileFragment('v1-d1');           // arrived legible; no seal to retire
    s.guessAtSanctum('lacuna');
    const st = useManorStore.getState();
    expect(st.volume.status).toBe('solved');
    expect(st.counters['fragment-made-out']).toBeUndefined();
  });

  it('openLetter: write-once flag, grants filed before the event, pity grants drip', () => {
    const s = useManorStore.getState();
    s.fileFragment('v1-d1');
    s.openLetter('readers-note');
    let st = useManorStore.getState();
    expect(st.flags).toContain(openedLetterFlag(volume.id, 'readers-note'));
    expect(st.volume.foundFragmentIds).toContain('v1-d2');
    expect(st.counters['letter-opened']).toBe(1);
    s.openLetter('readers-note'); // sealed once, broken once
    expect(useManorStore.getState().counters['letter-opened']).toBe(1);

    s.openLetter('under-the-tray'); // pity: grants the lowest unfound (v1-e1)
    st = useManorStore.getState();
    expect(st.volume.foundFragmentIds).toContain('v1-e1');
  });

  it('openLetter resolves house-written pity letters (pity-extra-N) too', () => {
    const s = useManorStore.getState();
    s.openLetter('pity-extra-1'); // synthesized — not in content.letters
    const st = useManorStore.getState();
    expect(st.flags).toContain(openedLetterFlag(volume.id, 'pity-extra-1'));
    expect(st.volume.foundFragmentIds).toEqual(['v1-d1']); // grants the drip's next
    expect(st.counters['letter-opened']).toBe(1);
    s.openLetter('pity-extra-1'); // write-once, like any letter
    expect(useManorStore.getState().counters['letter-opened']).toBe(1);
    s.openLetter('not-a-letter-at-all'); // unknown ids stay a no-op
    expect(useManorStore.getState().counters['letter-opened']).toBe(1);
  });

  it('markFragmentsViewed writes the write-once flag, once, and only for filed ids', () => {
    const s = useManorStore.getState();
    s.fileFragment('v1-d1');
    s.fileFragment('v1-e1');
    s.markFragmentsViewed(['v1-d1', 'not-a-real-fragment']);
    let st = useManorStore.getState();
    expect(st.flags).toContain(viewedFragmentFlag(volume.id, 'v1-d1'));
    expect(st.flags).not.toContain(viewedFragmentFlag(volume.id, 'not-a-real-fragment'));
    // v1-e1 was never displayed, so it stays unread (11.20: viewing, and
    // nothing else, retires the marker).
    expect(st.flags).not.toContain(viewedFragmentFlag(volume.id, 'v1-e1'));

    const before = st.flags.length;
    s.markFragmentsViewed(['v1-d1']); // idempotent — no save churn
    st = useManorStore.getState();
    expect(st.flags.length).toBe(before);
  });

  it('an UNVIEWED fragment keeps its marker across the dusk that prunes the day (11.20)', () => {
    const s = useManorStore.getState();
    useManorStore.setState({
      day: {
        day: 3, phase: 'exploring', daySeed: 1, activeRoom: null,
      } as unknown as NonNullable<ReturnType<typeof useManorStore.getState>['day']>,
    });
    s.fileFragment('v1-e1');
    const seen = () =>
      journalUnread(volume, useManorStore.getState().volume, {
        viewedIds: viewedFragmentIds(volume.id, useManorStore.getState().flags),
        ...noLetters,
      });
    expect(seen().engravings).toEqual(['v1-e1']);

    // The day rolls. pruneEventsAtDusk keeps only the CLOSING day's events, so
    // it takes two dusks for a day-3 filing to leave the stream entirely —
    // which is exactly how long the old `filedToday` marker lasted, and why it
    // looked like it worked.
    const store = () => useManorStore.getState();
    store().endDay('steps-exhausted');   // dusk of day 3
    store().advanceDayPhase();           // → night
    store().startDay();                  // day 4
    store().endDay('steps-exhausted');   // dusk of day 4 — day 3 is gone
    expect(
      store().recentEvents.some((e) => e.event.type === 'fragment-found'),
    ).toBe(false);
    // The marker is still there, because it was never made of that.
    expect(seen().engravings).toEqual(['v1-e1']);
    expect(seen().total).toBe(1);

    // And it retires on viewing, permanently.
    useManorStore.getState().markFragmentsViewed(['v1-e1']);
    expect(seen().total).toBe(0);
  });

  it('collectFragmentForRoom walks the drip for A1’s violet rooms', () => {
    const s = useManorStore.getState();
    const first = s.collectFragmentForRoom('mystery');
    expect(first).toBe('v1-d1');
    const second = s.collectFragmentForRoom('puzzle');
    expect(second).toBe('v1-e1');
    expect(useManorStore.getState().volume.foundFragmentIds).toEqual(['v1-d1', 'v1-e1']);
  });
});

// ---------------------------------------------------------------------------
// ROUND 10 — the award path, driven through the real store (AAA 11.17)
// ---------------------------------------------------------------------------

describe('solving matters — the live channel, end to end', () => {
  const sealedNow = () => sealedFragmentIds(volume.id, useManorStore.getState().flags);

  beforeEach(() => {
    useManorStore.setState({
      volume: fresh(),
      flags: [],
      recentEvents: [],
      counters: {},
      day: { day: 1, phase: 'exploring', daySeed: 1, activeRoom: null },
      manor: manorAtTheDoor(),
      currencies: { gems: 0, keys: 0, bookmarks: 0 },
      ledger: { budget: 18, entries: [] },
      seenPuzzleIds: {
        'forgotten-word': [], hive: [], twistle: [], 'word-web': [],
        cipher: [], crossword: [], sudoku: [],
      },
    });
  });

  it('ENTERING files the fragment — undeciphered, hers, and required for nothing', () => {
    const filed = useManorStore.getState().collectFragmentForRoom('mystery');
    expect(filed).toBe('v1-d1');
    const st = useManorStore.getState();
    // It is HERS: filed forever, on the spine, in the journal.
    expect(st.volume.foundFragmentIds).toEqual(['v1-d1']);
    expect(st.counters['fragment-found']).toBe(1);
    // …and it is SEALED: marked undeciphered, contributing nothing.
    expect(st.flags).toContain(sealedFragmentFlag(volume.id, 'v1-d1'));
    expect(sealedNow().has('v1-d1')).toBe(true);
    expect(definitionSlots(volume, st.volume, { sealedIds: sealedNow() })[0]!.sealed).toBe(true);
    // Walking out without touching a puzzle does not take it back.
    expect(useManorStore.getState().volume.foundFragmentIds).toEqual(['v1-d1']);
  });

  it('SOLVING makes it legible — and the engraving then reaches the alphabet plate', () => {
    const s = useManorStore.getState();
    // Two violet rooms walked into: a torn leaf and the six-candles plate,
    // both filed, both smudged.
    s.fileFragment('v1-d1', { sealed: true });
    s.fileFragment('v1-e1', { sealed: true });   // the `length: 6` engraving
    expect(alphabetFacts(volume, useManorStore.getState().volume, { sealedIds: sealedNow() })
      .knownLength).toBeNull();

    // A tier-1 room, solved: ONE page made out — the oldest first.
    useManorStore.getState().creditSolve('cipher', 1, false);
    expect(sealedNow().has('v1-d1')).toBe(false);
    expect(sealedNow().has('v1-e1')).toBe(true);
    expect(useManorStore.getState().flags).toContain(legibleFragmentFlag(volume.id, 'v1-d1'));
    // The plate is still blank: the engraving is hers and still unreadable.
    expect(alphabetFacts(volume, useManorStore.getState().volume, { sealedIds: sealedNow() })
      .knownLength).toBeNull();

    // A tier-3 room, solved: the rest of the backlog at once (tier scales it).
    useManorStore.getState().creditSolve('cipher', 3, false);
    expect(sealedNow().size).toBe(0);
    // …and NOW the engraving speaks to the plate.
    expect(alphabetFacts(volume, useManorStore.getState().volume, { sealedIds: sealedNow() })
      .knownLength).toBe(6);
  });

  it('A PERFECT solve buys the reading Ellery would charge affinity for', () => {
    const s = useManorStore.getState();
    s.collectFragmentForRoom('mystery');           // v1-d1, sealed
    s.creditSolve('cipher', 1, false);             // made out, but not read
    expect(useManorStore.getState().volume.interpretedFragmentIds).toEqual([]);

    s.collectFragmentForRoom('mystery');           // v1-e1, sealed
    s.creditSolve('cipher', 1, true);              // perfect: makes out AND reads
    const st = useManorStore.getState();
    expect(st.volume.interpretedFragmentIds).toContain('v1-d1');
    expect(st.counters['fragment-interpreted']).toBe(1);
  });

  it('never reads a page it cannot make out (the perfect bonus is not a bypass)', () => {
    const s = useManorStore.getState();
    s.collectFragmentForRoom('mystery');           // v1-d1, sealed
    // A perfect solve of a room whose channel has nothing left to give: the
    // decipher happens first, so the reading lands on the page it just made
    // out — never on one still sealed.
    s.interpretFragment('v1-d1');                  // named outright while sealed → refused
    expect(useManorStore.getState().volume.interpretedFragmentIds).toEqual([]);
  });

  it('the SPINE drives it: a room-solved event pays the mystery with no direct call', () => {
    // AAA 11.17 wants the award path DRIVEN, not merely present. This is the
    // real wiring: app/slices/room.ts records `room-solved`, the journal
    // slice's spine watcher hears it, and the whole credit runs.
    const s = useManorStore.getState();
    s.collectFragmentForRoom('mystery');           // v1-d1, sealed
    expect(sealedNow().has('v1-d1')).toBe(true);

    s.recordEvent({ type: 'room-solved', cellKey: '2,3', kind: 'crossword', tier: 2, perfect: false });

    const st = useManorStore.getState();
    expect(sealedNow().has('v1-d1')).toBe(false);          // made out by the solve

    // …AND the room's own channel paid a second page, already legible.
    //
    // ROUND 17 (REVIEW_AA §5.1): this used to look for an id starting `v1-e`,
    // because the lintel channel could only ever pay an engraving. The re-route
    // means the lintel now pays whatever the volume routes to it — on a fresh
    // file that is a definition line — so the assertion is about the CHANNEL
    // paying exactly once and paying legibly, which is what the spine wiring is
    // actually responsible for. Which page it is belongs to the volume JSON and
    // is asserted there (tests/volume-channels.test.ts).
    const paid = st.volume.foundFragmentIds.filter((id) => id !== 'v1-d1');
    expect(paid.length, 'the lintel channel did not pay the solve').toBe(1);
    expect(sealedNow().has(paid[0]!), 'a page earned by solving arrived sealed').toBe(false);
  });

  it('KEYS ACCRUE FROM SOLVES — the climb is bought with skill (owner directive 3)', () => {
    useManorStore.setState({
      day: {
        day: 1, phase: 'exploring', daySeed: 1,
        activeRoom: { cellKey: '2,3', kind: 'crossword', puzzleId: 'x', tier: 2 },
      },
    });
    expect(useManorStore.getState().currencies.keys).toBe(0);
    useManorStore.getState().applyRoomEvents(
      [{ type: 'solved', perfect: false }], { status: 'solved', perfect: false },
    );
    const st = useManorStore.getState();
    expect(st.currencies.keys).toBe(solveKeys(2));
    expect(st.currencies.keys).toBeGreaterThan(0);
    expect(st.counters['room-solved']).toBe(1);
    // The step payout is untouched by the key payout (one ledger, AAA 4.9).
    expect(st.ledger.entries.some((e) => e.reason === 'solve')).toBe(true);
  });

  it('pays no key on the ground floor, where there is nothing to unlock', () => {
    useManorStore.setState({
      day: {
        day: 1, phase: 'exploring', daySeed: 1,
        activeRoom: { cellKey: '2,1', kind: 'crossword', puzzleId: 'x', tier: 1 },
      },
    });
    useManorStore.getState().applyRoomEvents(
      [{ type: 'solved', perfect: false }], { status: 'solved', perfect: false },
    );
    expect(useManorStore.getState().currencies.keys).toBe(0);
  });

  it('AAA 4.18 — the volume is still winnable on day one with NOTHING made out', () => {
    // The cozy promise, tested rather than asserted: sealing changes what she
    // can READ, never what she is allowed to DO. A player who guesses the word
    // on day one, holding nothing but smudges, wins on day one.
    const s = useManorStore.getState();
    s.collectFragmentForRoom('mystery');
    s.collectFragmentForRoom('mystery');
    expect(sealedNow().size).toBe(2);
    s.guessAtSanctum('lacuna');
    const st = useManorStore.getState();
    expect(st.volume.status).toBe('solved');
    expect(st.flags).toContain(solvedFlag(volume.id));
    // …and the sealed pages are still hers, still filed, still nothing's gate.
    expect(st.volume.foundFragmentIds.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ROUND 12 — the two markers, driven through the real store
// ---------------------------------------------------------------------------

/**
 * The engine suite proves the derivation. This one proves the WIRING: that the
 * journal sheet's own call — `markFragmentsViewed(displayedFragmentIds(tab))` —
 * writes the right flag for the state the page was in, that a decipher
 * re-raises unread on real state, and that both facts survive a day roll and a
 * reload, which is the whole of AAA 11.20's "across the day roll and a
 * force-quit".
 */
describe('unread vs sealed — through the store, the day roll and a reload', () => {
  const store = () => useManorStore.getState();
  const sealedSet = () => sealedFragmentIds(volume.id, store().flags);
  /** Exactly what `useJournalUnread` computes, from live persisted state. */
  const marksNow = () =>
    journalUnread(volume, store().volume, {
      viewedIds: viewedFragmentIds(volume.id, store().flags),
      glancedIds: glancedFragmentIds(volume.id, store().flags),
      sealedIds: sealedSet(),
      ...noLetters,
    });
  /** What the journal sheet does while the player is looking at a tab. */
  const lookAt = (tab: JournalTab) =>
    store().markFragmentsViewed(displayedFragmentIds(volume, store().volume, tab));

  beforeEach(() => {
    useManorStore.setState({
      volume: fresh(),
      flags: [],
      recentEvents: [],
      counters: {},
      day: { day: 1, phase: 'exploring', daySeed: 1, activeRoom: null },
      manor: manorAtTheDoor(),
      currencies: { gems: 0, keys: 0, bookmarks: 0 },
      ledger: { budget: 18, entries: [] },
      seenPuzzleIds: {
        'forgotten-word': [], hive: [], twistle: [], 'word-web': [],
        cipher: [], crossword: [], sudoku: [],
      },
    });
  });

  it('looking at a sealed page writes GLANCED, not VIEWED', () => {
    store().collectFragmentForRoom('mystery');          // v1-d1, sealed
    expect(marksNow().total).toBe(1);                   // unread AND sealed
    expect(marksNow().sealed.total).toBe(1);

    lookAt('word');

    expect(store().flags).toContain(glancedFragmentFlag(volume.id, 'v1-d1'));
    // The reading flag must NOT be minted: she saw a smudge, not a sentence.
    // If it were, the decipher below could never raise the marker again.
    expect(store().flags).not.toContain(viewedFragmentFlag(volume.id, 'v1-d1'));
    expect(marksNow().total).toBe(0);                   // wax retires (11.20)
    expect(marksNow().sealed.total).toBe(1);            // the ring stands
  });

  it('looking at a legible page writes VIEWED, and that is the end of it', () => {
    store().fileFragment('v1-t2');                      // testimony arrives legible
    expect(marksNow().testimony).toEqual(['v1-t2']);
    lookAt('testimony');
    expect(store().flags).toContain(viewedFragmentFlag(volume.id, 'v1-t2'));
    expect(store().flags).not.toContain(glancedFragmentFlag(volume.id, 'v1-t2'));
    expect(marksNow().total).toBe(0);
    expect(marksNow().sealed.total).toBe(0);
  });

  it('THE TRANSITION, live: a solve makes the page out and unread comes BACK', () => {
    store().collectFragmentForRoom('mystery');          // v1-d1, sealed
    lookAt('word');                                     // she has seen the smudge
    expect(marksNow().total).toBe(0);

    // A room is solved: the spine watcher deciphers the backlog.
    store().recordEvent({
      type: 'room-solved', cellKey: '2,3', kind: 'crossword', tier: 1, perfect: false,
    });

    expect(sealedSet().has('v1-d1')).toBe(false);
    const m = marksNow();
    expect(m.word).toContain('v1-d1');                  // it is new information
    expect(m.sealed.fragments).not.toContain('v1-d1');  // and no longer a smudge

    // Reading it now — and only now — retires the wax for good.
    lookAt('word');
    expect(store().flags).toContain(viewedFragmentFlag(volume.id, 'v1-d1'));
    expect(marksNow().word).not.toContain('v1-d1');
  });

  it('both markers survive the DAY ROLL that prunes the event stream (11.20)', () => {
    store().collectFragmentForRoom('mystery');          // v1-d1, sealed, unread
    store().fileFragment('v1-t2');                      // legible, unread
    lookAt('word');                                     // the smudge is now seen
    const before = marksNow();
    expect(before.fragments).toEqual(['v1-t2']);        // only v1-t2 is unread
    expect(before.sealed.fragments).toEqual(['v1-d1']);

    store().endDay('steps-exhausted');
    store().advanceDayPhase();
    store().startDay();
    store().endDay('steps-exhausted');
    expect(store().recentEvents.some((e) => e.event.type === 'fragment-found')).toBe(false);

    const after = marksNow();
    expect(after.fragments).toEqual(['v1-t2']);
    expect(after.total).toBe(1);
    expect(after.sealed.fragments).toEqual(['v1-d1']);
    expect(after.sealed.total).toBe(1);
  });

  it('and survive a RELOAD — the flags are in the save, not in the session', () => {
    store().collectFragmentForRoom('mystery');          // v1-d1, sealed
    store().fileFragment('v1-t2');                      // legible
    lookAt('word');                                     // glanced
    lookAt('testimony');                                // viewed

    // Round-trip the real persisted projection (this is also the save-code
    // path of AAA 7.19, so the two storage containers agree as well).
    const restored = importSaveCode(exportSaveCode(selectSave(store())));
    expect(restored).toBeTruthy();
    const rf = restored!.journal.flags;
    expect(rf).toContain(glancedFragmentFlag(volume.id, 'v1-d1'));
    expect(rf).toContain(viewedFragmentFlag(volume.id, 'v1-t2'));

    const m = journalUnread(volume, restored!.volume, {
      viewedIds: viewedFragmentIds(volume.id, rf),
      glancedIds: glancedFragmentIds(volume.id, rf),
      sealedIds: sealedFragmentIds(volume.id, rf),
      ...noLetters,
    });
    expect(m.total).toBe(0);                            // nothing unlooked-at
    expect(m.sealed.total).toBe(1);                     // one page still smudged
    expect(m.sealed.fragments).toEqual(['v1-d1']);
  });

  it('the entrance count equals the tab counts equals the card ids (11.19/11.21)', () => {
    store().collectFragmentForRoom('mystery');          // v1-d1, sealed
    store().collectFragmentForRoom('puzzle');           // v1-e1, sealed
    store().fileFragment('v1-t2');                      // legible
    lookAt('engravings');                               // glance at v1-e1 only

    const m = marksNow();
    // Wax: v1-d1 (never opened) + v1-t2 (legible, never opened) = 2, exactly.
    expect(m.fragments).toEqual(['v1-d1', 'v1-t2']);
    expect(m.total).toBe(2);
    expect(m.word.length + m.engravings.length + m.testimony.length + m.letters.length)
      .toBe(m.total);
    // Seal: v1-d1 and v1-e1, each counted on its own tab and nowhere else.
    expect(m.sealed.total).toBe(2);
    expect(m.sealed.word).toEqual(['v1-d1']);
    expect(m.sealed.engravings).toEqual(['v1-e1']);
    expect(m.sealed.testimony).toEqual([]);
    // The two chains overlap (v1-d1 is both) and are never summed — which is
    // precisely the conflation round 12 exists to end.
    expect(m.fragments.filter((id) => m.sealed.fragments.includes(id))).toEqual(['v1-d1']);
  });

  it('markFragmentsViewed still refuses ids the volume has not filed', () => {
    store().collectFragmentForRoom('mystery');          // v1-d1, sealed
    store().markFragmentsViewed(['v1-d1', 'not-a-real-fragment']);
    expect(store().flags).toContain(glancedFragmentFlag(volume.id, 'v1-d1'));
    expect(store().flags).not.toContain(glancedFragmentFlag(volume.id, 'not-a-real-fragment'));
    const before = store().flags.length;
    store().markFragmentsViewed(['v1-d1']);             // idempotent, no churn
    expect(store().flags.length).toBe(before);
  });
});
