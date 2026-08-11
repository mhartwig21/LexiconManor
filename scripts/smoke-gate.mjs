/**
 * scripts/smoke-gate.mjs — THE GLASS GATE. OWNER: feedback-loop.
 *
 * WHY THIS FILE EXISTS, stated plainly so the next agent does not have to
 * re-derive it.
 *
 * The suite is ~1,358 tests over 49 files and not one of them has ever looked
 * at a screen. Every content invariant is re-solved by an independent solver,
 * the engine logic is genuinely tested, the economy is simulated — and every
 * defect the owner found by playing lived on the GLASS:
 *
 *   · a clue tap that typed a letter into the grid;
 *   · three clues sitting behind the keyboard;
 *   · the Darkroom's flavour line invisible on EVERY shipped phone
 *     (`display: none` under `@media (max-height: 900px)`, against 844);
 *   · a moment seal covering the goodnight for ~10 seconds;
 *   · an offer sheet already scrolling 29px.
 *
 * There were 62 Playwright drivers in this directory and CI ran NONE of them.
 * Each was written by one agent, ran once, found its bug and rotted — which is
 * why the Linen Closet's clue panel was "fixed" in three separate rounds. The
 * counter-example is `scripts/lint-chrome-clearance.mjs`: it is wired into CI,
 * it has a self-test, and its class of defect stopped recurring. This file is
 * that shape, pointed at the glass.
 *
 * WHAT IT ASSERTS, at 375x667 FIRST and then 390x844, against the BUILT app
 * served by `vite preview` (which refuses to start on a dist that does not
 * match this tree — scripts/dist-guard.ts):
 *
 *   1. EDITION   the app boots, and the edition the SERVER serves is the
 *                edition this checkout built. "Tests green" is not "the deploy
 *                served" and a probe that cannot name its build is a rumour.
 *   2. ROOMS     all seven rooms are entered and their boards render with the
 *                right shape of cells on the glass.
 *   3. SCROLL    nothing scrolls that could fit — clientHeight vs scrollHeight
 *                on every scene, room, overlay and page. One declared scroller
 *                is allowed (below), and even it must overflow by MORE than a
 *                tuning's worth, because a panel that scrolls by 29px is a
 *                panel that was meant to fit and missed.
 *   4. HITS      every interactive control hit-tests as ITSELF, at its centre
 *                and at all four edge midpoints, inset by a radius-scaled
 *                amount so pills and hexes are not falsely missed. A control
 *                whose centre answers as something else is worse than dead:
 *                one of them typed a letter into a puzzle. Three rooms are
 *                additionally DRIVEN with real page.mouse input (six taps),
 *                because hit-testing geometry is not the same claim as "the
 *                tap does what it says".
 *   5. CONSOLE   no console errors and no page errors, anywhere in the walk.
 *   6. COPY      authored copy that is supposed to be on the glass IS on the
 *                glass: present, non-zero, unoccluded, and reading what it was
 *                authored to read. Copy the house deliberately hides on a
 *                given glass is declared as hidden, so un-hiding it is also a
 *                change the gate notices.
 *
 * IT IS NOT A GATE THAT PASSES BY CONSTRUCTION. Two mechanisms, both cheap:
 *
 *   `node scripts/smoke-gate.mjs --self-test`
 *       Runs every verdict function against fixtures — the measurement that
 *       shipped each historical bug, and the fixed form beside it. Runs in CI
 *       ahead of the browser pass. A gate whose judgement has never been
 *       watched fail is a gate nobody knows works.
 *
 *   `node scripts/smoke-gate.mjs --prove`
 *       Re-introduces six of those defects INTO THE RUNNING APP, one at a
 *       time, and fails unless the gate goes red on the expected class. This
 *       is the falsification pass; see PROOFS below for what each injects.
 *
 * HARNESS RULES (local, and they are local rules):
 *   · System Edge — `chromium.launch({ channel: 'msedge' })`. NEVER download a
 *     playwright browser on the owner's machine: the download silently fails.
 *   · ONE browser instance, closed in a `finally`.
 *   · CI is a different machine and says so: it sets MANOR_GATE_CHANNEL to a
 *     browser it has actually installed (see .github/workflows/deploy.yml).
 *
 * Run:  node scripts/smoke-gate.mjs            (npm run gate:glass)
 *       node scripts/smoke-gate.mjs --self-test
 *       node scripts/smoke-gate.mjs --prove
 *       node scripts/smoke-gate.mjs --vp=375x667      (one glass, for triage)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLocalStamp, readServedStamp, fetchEdition } from './edition.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ───────────────────────────── THE CONTRACT ──────────────────────────────
   Everything the gate knows about this game lives here, in data, so the next
   agent can read the claim without reading the driver.
   ──────────────────────────────────────────────────────────────────────── */

/** 375 FIRST. Nearly every defect in this campaign has lived only there. */
const VIEWPORTS = [
  { w: 375, h: 667, tag: '375x667' },
  { w: 390, h: 844, tag: '390x844' },
];

/**
 * The seven rooms, each by the card the deck really ships, the kind its
 * adapter is registered under, the root its view paints, and the shape of
 * board that proves it rendered rather than merely mounted.
 *
 * `pin` fixes the puzzle so the walk is the same walk every time: an
 * un-pinned board makes the scroll and copy measurements a function of
 * whichever puzzle the seed handed us, which is how a gate becomes flaky.
 */
const ROOMS = [
  { card: 'library',       kind: 'word-web',       root: '.anch--library',      cells: '.ww-tile',                    min: 8 },
  { card: 'conservatory',  kind: 'hive',           root: '.anch--conservatory', cells: '.hv-cell',                    min: 7 },
  { card: 'gallery',       kind: 'twistle',        root: '.anch--gallery',      cells: '.tw-cell',                    min: 16 },
  { card: 'study',         kind: 'forgotten-word', root: '.anch--study',        cells: '.fw-slot',                    min: 3 },
  { card: 'darkroom',      kind: 'cipher',         root: '.mic--darkroom',      cells: '.dk-cell',                    min: 8,  pin: 'cipher-t3-40' },
  { card: 'linen-closet',  kind: 'crossword',      root: '.m2--linen',          cells: '.lc-cell:not(.lc-cell--void)', min: 12, pin: 'crossword-t3-19' },
  { card: 'counting-house',kind: 'sudoku',         root: '.ch',                 cells: '.ch-cell',                    min: 81 },
];

/**
 * THE ONE DECLARED SCROLLER. Chronicles' ledger is a record of every day ever
 * played; it cannot fit a phone and was never meant to. Everything else in
 * this house fits, and the gate says so.
 *
 * A declared scroller still has a floor: overflowing by less than
 * MARGINAL_OVERFLOW_PX means the panel was sized to hold its content and
 * missed — the offer sheet shipped scrolling 29px, which is exactly this
 * shape. So "allowed" means "allowed to scroll PROPERLY", never "exempt".
 */
const DECLARED_SCROLLERS = [
  {
    scene: 'page:chronicles',
    match: 'chron__ledger',
    why: 'the ledger is every day the house has ever had; it cannot fit a phone',
  },
  {
    scene: 'cabinet',
    match: 'bp-modal__sheet',
    why: 'the Floorplan Cabinet is the WHOLE live deck, browsable — the one sheet in the'
      + ' house that is a list by design (and whose sticky foot lint R5 already polices)',
  },
];
const MARGINAL_OVERFLOW_PX = 64;
/** Sub-pixel layout noise. Anything at or under this is not a scrollbar. */
const SCROLL_TOLERANCE_PX = 1;

/**
 * AUTHORED COPY THAT MUST BE ON THE GLASS — and the copy the house
 * deliberately takes OFF a given glass, which is just as much a decision.
 *
 * `expect: 'visible'`  the element exists, has a non-zero box, is unoccluded
 *                      at its own centre, and its text contains `says`.
 * `expect: 'hidden'`   the element is absent or zero-sized on this glass, ON
 *                      PURPOSE, and `why` records whose purpose. Un-hiding it
 *                      changes the room's fit and the gate wants to be told.
 *
 * The Darkroom line is first because it is the reason this section exists: it
 * was authored, committed, shipped, and drawn on no phone that exists.
 */
const COPY = [
  { scene: 'front-step', sel: '.bp-scene__title', says: 'Lexicon Manor', expect: 'visible' },
  { scene: 'front-step', sel: '.bp-btn--seal', says: 'Begin the first day', expect: 'visible' },
  {
    scene: 'room:darkroom', sel: '.mic-toastslot .mic__meta',
    says: 'One letter stands for one letter, all the way through.',
    expect: 'visible',
    why: 'the Darkroom is the one room with no NYT twin; this sentence IS the rule',
  },
  {
    scene: 'room:counting-house', sel: '.ch__meta',
    says: 'Every row, column and quarter holds all nine.',
    expect: 'visible',
  },
  { scene: 'room:conservatory', sel: '.anch__title', says: 'The Conservatory', expect: 'visible' },
  { scene: 'room:gallery', sel: '.anch__title', says: 'The Gallery', expect: 'visible' },
  { scene: 'room:library', sel: '.anch__title', says: 'The Library', expect: 'visible' },
  {
    scene: 'room:study', sel: '.anch__title', says: 'The Study', expect: 'visible',
    only: ['390x844'],
  },
  {
    scene: 'room:study', sel: '.anch__title', expect: 'hidden', only: ['375x667'],
    why: 'anchor.css @media (max-height: 700px) retires the Study nameplate — the room is named on the blueprint she walked in from',
  },
  {
    scene: 'room:linen-closet', sel: '.m2__head', expect: 'hidden',
    why: 'a5micro.css @media (max-height: 900px) retires the nameplate on BOTH shipped phones, to buy the square its 44px',
  },
  {
    scene: 'room:linen-closet', sel: '.lc-clue:not(.lc-clue--hem) .lc-clue__text', expect: 'visible',
    why: 'the clue list IS the puzzle; three of them once sat behind the keyboard',
  },
  /**
   * ROUND 34 (COMPREHENSION, cold read 11 Aug). Two rules of play that the
   * rooms knew and never said, now said — and registered HERE, because the way
   * this house loses a sentence is not by deleting it. `.mic__sub`, the
   * Gallery's studies line and the Linen Closet's nameplate were all authored,
   * all committed, and all `display: none` on the phones the game ships on. A
   * new sentence that is not in this table is a sentence one breakpoint away
   * from never being read again.
   *
   * The Gallery's corner clause is asserted at BOTH sizes deliberately: it
   * lives in the trace tray precisely so that the `max-height: 700px` band —
   * which retires `.anch__flavour` — cannot reach it.
   */
  {
    scene: 'room:gallery', sel: '.tw-word__hint',
    says: 'trace or tap a word — a corner is a turn', expect: 'visible',
    why: 'the ask prices "a corner each" and neither cold reader could tell what a corner was',
  },
];

/**
 * Console noise that is not a defect. EMPTY, and that is the point — the walk
 * is silent today and the gate holds it there. An entry here must say who
 * emits it and why it cannot be fixed.
 */
const CONSOLE_ALLOW = [];

/* ─────────────────────────────── VERDICTS ────────────────────────────────
   Pure functions over measurements. They are what `--self-test` proves, and
   they are separated from the driving so that a fixture can be fed the exact
   numbers a historical defect produced.
   ──────────────────────────────────────────────────────────────────────── */

/** True when a measured overflow row is the sr-only clip idiom, not a panel. */
export function isScreenReaderClip(row) {
  return row.clientW <= 2 || row.clientH <= 2;
}

export function judgeScroll(rows, scrollers = DECLARED_SCROLLERS) {
  const out = [];
  for (const row of rows) {
    if (isScreenReaderClip(row)) continue;
    const dy = row.scrollH - row.clientH;
    const dx = row.scrollW - row.clientW;
    if (dy <= SCROLL_TOLERANCE_PX && dx <= SCROLL_TOLERANCE_PX) continue;
    const declared = scrollers.find(
      (s) => (!s.scene || s.scene === row.scene) && row.sel.includes(s.match),
    );
    if (!declared) {
      out.push({
        klass: 'SCROLL', scene: row.scene, what: row.sel,
        message: `scrolls ${dy}px down / ${dx}px across (${row.clientH}px of glass holding ${row.scrollH}px)`
          + ' — nothing in this house scrolls that could fit',
      });
      continue;
    }
    if (dy > SCROLL_TOLERANCE_PX && dy <= MARGINAL_OVERFLOW_PX) {
      out.push({
        klass: 'SCROLL', scene: row.scene, what: row.sel,
        message: `is a declared scroller overflowing by only ${dy}px — that is a panel sized to hold`
          + ` its content that missed, not a panel meant to scroll (declared: ${declared.why})`,
      });
    }
  }
  return out;
}

export function judgeHits(probes) {
  return probes.filter((p) => !p.owned).map((p) => ({
    klass: 'HITS', scene: p.scene, what: p.what,
    message: `${p.point} (${p.x}, ${p.y}) answers as ${p.answered} — the control does not own its own`
      + ' surface, and a tap there goes somewhere else',
  }));
}

export function judgeDriven(results) {
  return results.filter((r) => !r.ok).map((r) => ({
    klass: 'HITS', scene: r.scene, what: r.what,
    message: `driven with real pointer input: ${r.message}`,
  }));
}

export function judgeCopy(findings) {
  const out = [];
  for (const f of findings) {
    if (f.expect === 'hidden') {
      if (f.found && f.w * f.h > 0) {
        out.push({
          klass: 'COPY', scene: f.scene, what: f.sel,
          message: `is on the glass at ${f.w}x${f.h}, but this glass is declared to retire it`
            + `${f.why ? ` (${f.why})` : ''} — the room's fit was budgeted without it`,
        });
      }
      continue;
    }
    if (!f.found) {
      out.push({ klass: 'COPY', scene: f.scene, what: f.sel, message: 'is not in the document at all' });
      continue;
    }
    if (f.w * f.h === 0) {
      out.push({
        klass: 'COPY', scene: f.scene, what: f.sel,
        message: `is authored and mounted but measures ${f.w} x ${f.h} — it has never been drawn on this glass`
          + `${f.why ? ` (${f.why})` : ''}`,
      });
      continue;
    }
    if (!f.unoccluded) {
      out.push({
        klass: 'COPY', scene: f.scene, what: f.sel,
        message: `is covered at its own centre by ${f.occludedBy} — it is on the glass and unreadable`,
      });
      continue;
    }
    if (f.says && !(f.text || '').includes(f.says)) {
      out.push({
        klass: 'COPY', scene: f.scene, what: f.sel,
        message: `reads ${JSON.stringify((f.text || '').slice(0, 80))} — the gate was told it says ${JSON.stringify(f.says)}`,
      });
    }
  }
  return out;
}

export function judgeConsole(entries, allow = CONSOLE_ALLOW) {
  return entries
    .filter((e) => !allow.some((rx) => rx.test(e.text)))
    .map((e) => ({ klass: 'CONSOLE', scene: e.scene, what: e.kind, message: e.text }));
}

export function judgeRooms(entries, rooms = ROOMS) {
  const out = [];
  for (const room of rooms) {
    const got = entries.find((e) => e.card === room.card);
    if (!got) {
      out.push({ klass: 'ROOMS', scene: `room:${room.card}`, what: room.root, message: 'was never entered' });
      continue;
    }
    if (!got.rendered) {
      out.push({ klass: 'ROOMS', scene: `room:${room.card}`, what: room.root, message: 'never painted its root' });
      continue;
    }
    if (got.w * got.h === 0) {
      out.push({
        klass: 'ROOMS', scene: `room:${room.card}`, what: room.root,
        message: `painted its root at ${got.w} x ${got.h} — the room is mounted and invisible`,
      });
      continue;
    }
    if (got.cells < room.min) {
      out.push({
        klass: 'ROOMS', scene: `room:${room.card}`, what: room.cells,
        message: `${got.cells} cells on the board, and the room needs at least ${room.min} — the board did not render`,
      });
    }
  }
  return out;
}

export function judgeEdition({ served, local, app }) {
  const out = [];
  if (!served) {
    return [{ klass: 'EDITION', scene: 'boot', what: 'build-stamp.json',
      message: 'the server serves no build stamp — nothing measured here is attributable to a build' }];
  }
  if (!local) {
    return [{ klass: 'EDITION', scene: 'boot', what: 'dist/build-stamp.json',
      message: 'this checkout has no built dist to compare the server against' }];
  }
  if (served.source !== local.source) {
    out.push({ klass: 'EDITION', scene: 'boot', what: 'edition',
      message: `the server is serving edition ${served.id} and this tree built ${local.id}`
        + ' — the gate would be measuring somebody else\'s game' });
  }
  if (app && !local.source.startsWith(app)) {
    out.push({ klass: 'EDITION', scene: 'boot', what: '__MANOR_BUILD__',
      message: `the JS the browser ran carries source ${app}, and dist/build-stamp.json says`
        + ` ${local.source.slice(0, 16)} — the served bundle is not the stamped build` });
  }
  return out;
}

/**
 * THE ANTI-CONSTRUCTION GUARD (standing rule 1).
 *
 * Every other verdict in this file is a filter over a list of measurements,
 * and a filter over an EMPTY list is green. Rename `.lc-clue`, drop the
 * `button` out of the probe selector, break `measureCopy`, and this gate would
 * pass every commit for the rest of the campaign while looking at nothing —
 * which is precisely how a sweep last round found a suite that was GREEN on
 * the pool it was written to condemn.
 *
 * So the gate states what it EXPECTED to measure and fails if it measured
 * less. The floors are deliberately far below the real numbers (which the run
 * prints): they are there to catch a probe that has gone blind, not to police
 * the composition of a scene.
 */
export function judgeCoverage(counts, floors = COVERAGE_FLOORS) {
  const out = [];
  for (const [what, floor] of Object.entries(floors)) {
    const got = counts[what] ?? 0;
    if (got < floor) {
      out.push({
        klass: 'BLIND', scene: 'the gate itself', what,
        message: `measured ${got} where at least ${floor} was expected — the probe has gone blind,`
          + ' and a gate that measures nothing passes everything',
      });
    }
  }
  for (const [sceneName, n] of Object.entries(counts.perScene ?? {})) {
    if (n === 0) {
      out.push({
        klass: 'BLIND', scene: sceneName, what: 'interactive controls',
        message: 'not one control was probed on this scene — either the scene never painted or the probe cannot see it',
      });
    }
  }
  return out;
}

/**
 * Floors, per viewport pass. Real numbers on the current tree are printed by
 * every run; these sit far under them on purpose.
 */
export const COVERAGE_FLOORS = {
  scenes: 10,        // front-step, chronicles, blueprint, offer, cabinet, 7 rooms, journal, sanctum
  probes: 400,       // controls x 5 points, across the whole walk
  scrollRows: 10,    // documentElement alone contributes one per scene
  copyAssertions: 8, // COPY entries applicable to this glass
  driven: 5,         // the taps made with real pointer input
};

/* ─────────────────────────────── SELF-TEST ───────────────────────────────
   A verdict nobody has watched fail is a verdict nobody knows works. Every
   fixture below is either a measurement a shipped defect really produced or
   the fixed form beside it.
   ──────────────────────────────────────────────────────────────────────── */

export function selfTest() {
  const fail = [];
  const check = (name, got, want) => {
    const g = got.map((v) => v.klass).sort().join(',');
    const w = [...want].sort().join(',');
    if (g !== w) fail.push(`${name}: expected [${w}] got [${g}]`);
  };

  // --- SCROLL -------------------------------------------------------------
  check('the offer sheet that shipped scrolling 29px',
    judgeScroll([{ scene: 'draft-offer', sel: 'div.bp-modal__sheet', clientH: 611, scrollH: 640, clientW: 343, scrollW: 343 }]),
    ['SCROLL']);
  check('a panel that fits',
    judgeScroll([{ scene: 'blueprint', sel: 'div.bp-grid', clientH: 400, scrollH: 400, clientW: 343, scrollW: 343 }]),
    []);
  check('one pixel of subpixel noise is not a scrollbar',
    judgeScroll([{ scene: 'blueprint', sel: 'div.bp-grid', clientH: 400, scrollH: 401, clientW: 343, scrollW: 343 }]),
    []);
  check("Chronicles' ledger is declared and genuinely long",
    judgeScroll([{ scene: 'page:chronicles', sel: 'div.chron__ledger', clientH: 441, scrollH: 2237, clientW: 343, scrollW: 343 }]),
    []);
  check('a declared scroller that overflows by a tuning is still a miss',
    judgeScroll([{ scene: 'page:chronicles', sel: 'div.chron__ledger', clientH: 441, scrollH: 470, clientW: 343, scrollW: 343 }]),
    ['SCROLL']);
  check('a declared scroller is declared per SCENE, not everywhere',
    judgeScroll([{ scene: 'room:library', sel: 'div.chron__ledger', clientH: 100, scrollH: 900, clientW: 343, scrollW: 343 }]),
    ['SCROLL']);
  check('the sr-only clip idiom is not a scrollport',
    judgeScroll([{ scene: 'blueprint', sel: 'span.chr-sr', clientH: 1, scrollH: 22, clientW: 1, scrollW: 29 }]),
    []);
  check('sideways counts too',
    judgeScroll([{ scene: 'room:gallery', sel: 'div.tw-grid', clientH: 300, scrollH: 300, clientW: 343, scrollW: 420 }]),
    ['SCROLL']);

  // --- HITS ---------------------------------------------------------------
  check('the clue row whose centre answered as the keyboard',
    judgeHits([{ scene: 'room:linen-closet', what: 'li.lc-clue', point: 'centre', x: 187, y: 512, owned: false, answered: 'button.lc-key' }]),
    ['HITS']);
  check('a control that owns its own centre and edges',
    judgeHits([{ scene: 'room:linen-closet', what: 'li.lc-clue', point: 'centre', x: 187, y: 400, owned: true, answered: 'li.lc-clue' }]),
    []);
  check('a driven tap that typed into the grid',
    judgeDriven([{ scene: 'room:linen-closet', what: 'clue 3-Down', ok: false, message: 'tapping the clue typed a letter into the grid' }]),
    ['HITS']);
  check('a driven tap that did what it says',
    judgeDriven([{ scene: 'room:linen-closet', what: 'clue 3-Down', ok: true, message: 'selected 3-Down' }]),
    []);

  // --- COPY ---------------------------------------------------------------
  check('the Darkroom line, authored and drawn on no phone that exists',
    judgeCopy([{ scene: 'room:darkroom', sel: '.mic__sub', expect: 'visible', found: true, w: 0, h: 0, unoccluded: true, text: '' }]),
    ['COPY']);
  check('the same line, once it is actually drawn',
    judgeCopy([{ scene: 'room:darkroom', sel: '.mic__meta', expect: 'visible', found: true, w: 311, h: 18, unoccluded: true, text: 'One letter stands for one letter, all the way through.', says: 'One letter stands for one letter' }]),
    []);
  check('the goodnight under a moment seal',
    judgeCopy([{ scene: 'night', sel: '.chr-night__line', expect: 'visible', found: true, w: 300, h: 20, unoccluded: false, occludedBy: 'div.mom__seal' }]),
    ['COPY']);
  check('copy that was renamed out from under the manifest',
    judgeCopy([{ scene: 'room:library', sel: '.anch__title', expect: 'visible', found: true, w: 200, h: 24, unoccluded: true, text: 'The Reading Room', says: 'The Library' }]),
    ['COPY']);
  check('copy the manifest names and the room never mounts',
    judgeCopy([{ scene: 'room:library', sel: '.anch__title', expect: 'visible', found: false }]),
    ['COPY']);
  check('a nameplate this glass is declared to retire',
    judgeCopy([{ scene: 'room:linen-closet', sel: '.m2__head', expect: 'hidden', found: true, w: 0, h: 0 }]),
    []);
  check('...and the same nameplate drawn anyway, eating the budget',
    judgeCopy([{ scene: 'room:linen-closet', sel: '.m2__head', expect: 'hidden', found: true, w: 343, h: 40 }]),
    ['COPY']);

  // --- CONSOLE ------------------------------------------------------------
  check('a page error anywhere in the walk',
    judgeConsole([{ scene: 'room:study', kind: 'pageerror', text: "Cannot read properties of undefined (reading 'clue')" }]),
    ['CONSOLE']);
  check('a silent walk',
    judgeConsole([]),
    []);

  // --- ROOMS --------------------------------------------------------------
  const oneRoom = [{ card: 'library', root: '.anch--library', cells: '.ww-tile', min: 8 }];
  check('a room that never painted',
    judgeRooms([{ card: 'library', rendered: false }], oneRoom),
    ['ROOMS']);
  check('a room mounted at zero size',
    judgeRooms([{ card: 'library', rendered: true, w: 0, h: 0, cells: 16 }], oneRoom),
    ['ROOMS']);
  check('a room whose board did not render',
    judgeRooms([{ card: 'library', rendered: true, w: 343, h: 500, cells: 0 }], oneRoom),
    ['ROOMS']);
  check('a room that is genuinely there',
    judgeRooms([{ card: 'library', rendered: true, w: 343, h: 500, cells: 16 }], oneRoom),
    []);
  check('a room the walk never reached',
    judgeRooms([], oneRoom),
    ['ROOMS']);

  // --- BLIND (the anti-construction guard) ---------------------------------
  check('a probe selector that stopped matching anything',
    judgeCoverage({ scenes: 12, probes: 0, scrollRows: 40, copyAssertions: 9, driven: 6 }),
    ['BLIND']);
  check('a scene that painted no controls at all',
    judgeCoverage({ scenes: 12, probes: 900, scrollRows: 40, copyAssertions: 9, driven: 6, perScene: { 'room:study': 0 } }),
    ['BLIND']);
  check('a copy manifest that quietly stopped applying',
    judgeCoverage({ scenes: 12, probes: 900, scrollRows: 40, copyAssertions: 0, driven: 6 }),
    ['BLIND']);
  check('a full walk',
    judgeCoverage({ scenes: 12, probes: 900, scrollRows: 40, copyAssertions: 9, driven: 6, perScene: { 'room:study': 14 } }),
    []);

  // --- EDITION ------------------------------------------------------------
  check('a server serving somebody else\'s build',
    judgeEdition({ served: { id: 'aaaaaaa', source: 'aaaa' }, local: { id: 'bbbbbbb', source: 'bbbb' } }),
    ['EDITION']);
  check('a server with no stamp at all',
    judgeEdition({ served: null, local: { id: 'b', source: 'bbbb' } }),
    ['EDITION']);
  check('the bundle the browser ran is not the stamped build',
    judgeEdition({ served: { id: 'a', source: 'abcdef0123456789ff' }, local: { id: 'a', source: 'abcdef0123456789ff' }, app: '0000000000000000' }),
    ['EDITION']);
  check('the honest case',
    judgeEdition({ served: { id: 'a', source: 'abcdef0123456789ff' }, local: { id: 'a', source: 'abcdef0123456789ff' }, app: 'abcdef0123456789' }),
    []);

  return fail;
}

/* ──────────────────────────────── PROOFS ─────────────────────────────────
   Historical defects, re-introduced into the RUNNING app one at a time. Each
   must make the gate red on its own class, or `--prove` fails. This is the
   answer to "a gate nobody has watched fail is not a gate".
   ──────────────────────────────────────────────────────────────────────── */

export const PROOFS = [
  {
    id: 'copy-darkroom',
    klass: 'COPY',
    why: 'the shipped bug verbatim: a max-height media query against a phone that is shorter than it',
    css: '@media (max-height: 900px) { .mic-toastslot .mic__meta { display: none !important; } }',
  },
  {
    id: 'scroll-room',
    klass: 'SCROLL',
    why: 'a room stage sized under its board — the offer sheet scrolling 29px, made obvious',
    css: '.room-host__stage { max-height: 220px !important; overflow-y: auto !important; }',
  },
  {
    id: 'keyboard-reaches-up',
    klass: 'HITS',
    /**
     * THE SHIPPED SHAPE, VERBATIM: "three clues sitting behind the keyboard",
     * and "a clue tap that typed a letter into the grid". Both were one thing —
     * the key deck owning surface above itself. The pseudo-element extends the
     * keyboard's hit area 220px up over the board without painting a pixel, so
     * the screenshots stay identical and every square in the closet and every
     * slot in the darkroom starts answering as the keys.
     */
    why: 'the keyboard owning the surface above it — the clue tap that typed a letter, and the three clues behind the deck',
    css: '.lc-keys, .mic-keys { position: relative !important; } '
      + '.lc-keys::before, .mic-keys::before { content: ""; position: absolute;'
      + ' left: 0; right: 0; bottom: 100%; height: 220px; }',
  },
  {
    id: 'room-goes-dark',
    klass: 'ROOMS',
    why: 'a room that mounts and paints nothing — the failure mode a screenshot pass reads as "empty room, probably fine"',
    css: '.anch--library { display: none !important; }',
  },
  {
    id: 'edition-drift',
    klass: 'EDITION',
    /**
     * The two poisoned hostile reviews: a probe measuring a build that was not
     * the tree it named. `vite preview` already refuses to serve a stale dist,
     * so the only way to stage this is to make the BUNDLE lie about its own
     * fingerprint — which is exactly the residual hole the app-source check
     * exists to close.
     */
    why: 'the bundle the browser ran carrying a different source fingerprint than the dist claims',
    init: () => {
      const patch = () => {
        const dt = [...document.querySelectorAll('.chron__debug dt')]
          .find((d) => d.textContent.trim() === 'source');
        const dd = dt?.nextElementSibling;
        if (dd && dd.textContent !== 'deadbeefdeadbeef') dd.textContent = 'deadbeefdeadbeef';
      };
      new MutationObserver(patch).observe(document, { childList: true, subtree: true });
    },
  },
  {
    id: 'console-noise',
    klass: 'CONSOLE',
    why: 'a page that complains on the way past, which today nothing does',
    init: () => { setTimeout(() => console.error('[proof] the manor tripped over the rug'), 400); },
  },
];

/* ──────────────────────────────── DRIVING ──────────────────────────────── */

const RULE = '─'.repeat(78);
const log = (...a) => console.log('[glass]', ...a);

async function freePort(from = 5911, to = 5989) {
  for (let p = from; p <= to; p++) {
    let taken = false;
    for (const host of ['127.0.0.1', '::1', undefined]) {
      // eslint-disable-next-line no-await-in-loop
      taken = taken || await new Promise((res) => {
        const s = createServer();
        s.once('error', () => res(true));
        s.once('listening', () => s.close(() => res(false)));
        if (host) s.listen(p, host); else s.listen(p);
      });
    }
    if (!taken) return p;
  }
  throw new Error('no free port in 5911-5989');
}

/**
 * `vite preview` — NOT `vite dev`. The gate's whole first claim is about the
 * BUILT app, and vite.config.ts refuses to preview a dist that does not match
 * this checkout (scripts/dist-guard.ts), so a stale build cannot even come up.
 */
async function startPreview(port) {
  const server = spawn(
    process.execPath,
    [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let died = null;
  let stderr = '';
  server.stderr.on('data', (b) => { stderr += String(b); });
  server.on('exit', (code) => { died = code; });
  const base = `http://localhost:${port}/LexiconManor/`;
  for (let i = 0; i < 80; i++) {
    if (died !== null) {
      throw new Error(
        `vite preview exited ${died} before serving. It refuses to serve a dist that does not\n`
        + `match this tree — run \`npm run build\` first.\n${stderr.trim()}`,
      );
    }
    try { const r = await fetch(base); if (r.ok) return { server, base }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  server.kill();
  throw new Error('vite preview never answered');
}

/**
 * Measure the same thing twice and only believe it when it agrees with itself.
 *
 * The alternative is sleeping, and a sleep long enough to be safe on a loaded
 * CI box is a sleep that makes the gate too slow to run — while a sleep short
 * enough to be fast is how a gate becomes flaky, and a flaky gate teaches the
 * team that red means nothing. This waits on the CONDITION (the glass has
 * stopped moving) instead.
 */
async function stable(page, fn, { tries = 6, gap = 120 } = {}) {
  let prev = JSON.stringify(await fn());
  for (let i = 0; i < tries; i++) {
    await page.waitForTimeout(gap);
    const next = JSON.stringify(await fn());
    if (next === prev) return JSON.parse(next);
    prev = next;
  }
  return JSON.parse(prev);
}

/* --- browser-side measurement, sent in as one function each ---------------- */

function measureScroll() {
  const out = [];
  const de = document.documentElement;
  out.push({
    sel: 'documentElement', clientH: de.clientHeight, scrollH: de.scrollHeight,
    clientW: de.clientWidth, scrollW: de.scrollWidth,
  });
  const name = (e) => {
    const parts = [];
    let n = e;
    while (n && n.nodeType === 1 && parts.length < 3) {
      const cls = typeof n.className === 'string' && n.className.trim()
        ? '.' + n.className.trim().split(/\s+/).join('.') : '';
      parts.unshift(n.tagName.toLowerCase() + cls);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
  const clips = (v) => v === 'auto' || v === 'scroll' || v === 'hidden' || v === 'clip';
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    // overflow:visible clips nothing and scrolls nothing — an inline rule whose
    // scrollHeight exceeds its 6px box is decoration, not a buried panel.
    if (!clips(cs.overflowY) && !clips(cs.overflowX)) continue;
    if (el.clientHeight === 0) continue;
    out.push({
      sel: name(el), clientH: el.clientHeight, scrollH: el.scrollHeight,
      clientW: el.clientWidth, scrollW: el.scrollWidth,
    });
  }
  return out;
}

/**
 * THE CLIPPED, VISIBLE BOX of an element — what a thumb can actually reach.
 *
 * WHY THIS IS NOT `getBoundingClientRect()`. The first version of this probe
 * used the raw rect and immediately reported three failures on Chronicles at
 * 390x844: the "Start a new volume" button's centre answered as `div#root`.
 * It was not a defect. The button lives INSIDE `.chron__ledger`, which is a
 * real scroller, and the centre of its raw rect was simply below the
 * scrollport — the browser was right to say nothing was there. A gate that
 * calls a normally-scrolled control broken is a gate that gets switched off in
 * a week.
 *
 * So the box is intersected with the client box of every ancestor that clips,
 * and with the viewport, following the actual CSS rule about who clips whom:
 * a `fixed` element is clipped by none of them, and an `absolute` element is
 * clipped only by positioned ancestors. What survives is the surface the
 * control really presents to a thumb, and THAT is what must answer as itself.
 *
 * `visibleBox` is written out inside BOTH browser-side probes rather than
 * shared: each is serialised to the page on its own, so a shared helper in
 * this module would simply be undefined over there.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Probe every interactive control at the centre and the four EDGE MIDPOINTS of
 * its visible box, inset by a radius-scaled amount.
 *
 * Fixed corner insets give false misses on this game's controls — the hive is
 * hexagonal and half the buttons are pills — so corners are never probed and
 * the inset is a fraction of the control, not a constant.
 *
 * Only the TOPMOST interactive layer is probed. When a moment seal or a
 * dialogue or a modal is up, the controls underneath are SUPPOSED not to
 * answer, and probing them would produce a gate that is red by design.
 */
function probeHits() {
  const layer =
    document.querySelector('.mom')
    || document.querySelector('.dlg')
    || document.querySelector('.bp-modal')
    || document.body;
  const ident = (e) => {
    if (!e) return 'nothing';
    const cls = typeof e.className === 'string' && e.className.trim()
      ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const label = e.getAttribute?.('aria-label');
    return e.tagName.toLowerCase() + cls + (label ? `[${label}]` : '');
  };
  const visibleBox = (el) => {
    const r = el.getBoundingClientRect();
    const box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    const pos = getComputedStyle(el).position;
    if (pos !== 'fixed') {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        // An absolutely positioned box is only clipped by ancestors that are
        // themselves positioned — the containing-block rule, not a heuristic.
        if (pos === 'absolute' && cs.position === 'static') continue;
        if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
        const q = n.getBoundingClientRect();
        box.l = Math.max(box.l, q.left + (parseFloat(cs.borderLeftWidth) || 0));
        box.t = Math.max(box.t, q.top + (parseFloat(cs.borderTopWidth) || 0));
        box.r = Math.min(box.r, q.right - (parseFloat(cs.borderRightWidth) || 0));
        box.b = Math.min(box.b, q.bottom - (parseFloat(cs.borderBottomWidth) || 0));
      }
    }
    box.l = Math.max(box.l, 0);
    box.t = Math.max(box.t, 0);
    box.r = Math.min(box.r, window.innerWidth - 1);
    box.b = Math.min(box.b, window.innerHeight - 1);
    return box;
  };
  const SELECTOR = 'button, a[href], summary, input, select, textarea, [role="button"], [role="tab"]';
  const out = [];
  let clipped = 0;
  for (const el of layer.querySelectorAll(SELECTOR)) {
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === 'none') continue;      // deliberately inert
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (Number(cs.opacity) === 0) continue;         // mid-transition, not on the glass
    const raw = el.getBoundingClientRect();
    if (raw.width < 3 || raw.height < 3) continue;  // sr-only clip idiom
    const box = visibleBox(el);
    const w = box.r - box.l;
    const h = box.b - box.t;
    // Scrolled out of its own scrollport, or off the glass. Reaching it is a
    // scroll away, and this probe is about identity, not about reach.
    if (w < 3 || h < 3) { clipped++; continue; }
    const inset = Math.max(2, Math.min(10, Math.min(w, h) * 0.15));
    const cx = box.l + w / 2;
    const cy = box.t + h / 2;
    const points = [
      ['centre', cx, cy],
      ['top edge', cx, box.t + inset],
      ['bottom edge', cx, box.b - inset],
      ['left edge', box.l + inset, cy],
      ['right edge', box.r - inset, cy],
    ];
    for (const [point, x, y] of points) {
      const hit = document.elementFromPoint(x, y);
      const owned = !!hit && (hit === el || el.contains(hit));
      out.push({
        what: ident(el), point, x: Math.round(x), y: Math.round(y),
        owned, answered: owned ? 'itself' : ident(hit),
      });
    }
  }
  out.clippedOut = clipped;
  return out;
}

function measureCopy(entries) {
  return entries.map((e) => {
    const el = document.querySelector(e.sel);
    if (!el) return { ...e, found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const drawn = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
    const w = drawn ? Math.round(r.width) : 0;
    const h = drawn ? Math.round(r.height) : 0;
    let unoccluded = true;
    let occludedBy = null;
    if (drawn) {
      // Same clipping rule as the hit probe: ask at the centre of what is
      // actually on the glass, not at the centre of the raw rect.
      let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      const pos = cs.position;
      if (pos !== 'fixed') {
        for (let n = el.parentElement; n; n = n.parentElement) {
          const ps = getComputedStyle(n);
          if (pos === 'absolute' && ps.position === 'static') continue;
          if (ps.overflowY === 'visible' && ps.overflowX === 'visible') continue;
          const q = n.getBoundingClientRect();
          box = {
            l: Math.max(box.l, q.left), t: Math.max(box.t, q.top),
            r: Math.min(box.r, q.right), b: Math.min(box.b, q.bottom),
          };
        }
      }
      box.l = Math.max(box.l, 0); box.t = Math.max(box.t, 0);
      box.r = Math.min(box.r, window.innerWidth - 1); box.b = Math.min(box.b, window.innerHeight - 1);
      const hit = box.r - box.l > 0 && box.b - box.t > 0
        ? document.elementFromPoint((box.l + box.r) / 2, (box.t + box.b) / 2)
        : null;
      unoccluded = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      if (!unoccluded) {
        const cls = typeof hit.className === 'string' && hit.className.trim()
          ? '.' + hit.className.trim().split(/\s+/).join('.') : '';
        occludedBy = hit.tagName.toLowerCase() + cls;
      }
    }
    return { ...e, found: true, w, h, unoccluded, occludedBy, text: (el.textContent || '').trim() };
  });
}

/* --- the walk -------------------------------------------------------------- */

/**
 * Reach `exploring` the way a player does — the front step, the morning scene,
 * the day's dialogue — rather than by writing the phase into the store. The
 * store is used for SETUP (placing a room under her feet) and never to skip a
 * control the gate is about to make a claim about.
 */
async function ensureExploring(page) {
  for (let i = 0; i < 120; i++) {
    const st = await page.evaluate(() => {
      const s = window.__manorStore?.getState();
      return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor };
    });
    if (st.phase === 'exploring' && st.hasManor) return true;
    if (await page.$('.dlg')) {
      const primary = await page.$('.dlg-choice--primary');
      if (primary) await primary.click();
      else {
        const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
        if (choice) await choice.click();
        else await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      }
      await page.waitForTimeout(160);
      continue;
    }
    const skip = await page.$('.chr-dusk__skip');
    if (skip) { await skip.click(); await page.waitForTimeout(350); continue; }
    const scene = await page.$('.chr-scene__btn');
    if (scene) { await scene.click(); await page.waitForTimeout(350); continue; }
    const seal = await page.$('.bp-btn--seal');
    if (seal) { await seal.click(); await page.waitForTimeout(350); continue; }
    await page.waitForTimeout(200);
  }
  return false;
}

/**
 * A campaign moment genuinely intercepts pointer events — that is the design,
 * a moment is meant to be tapped away. They are dismissed one tap each, the
 * way a player dismisses them, and only when the moment is not itself the
 * subject of the measurement.
 */
async function clearMoments(page) {
  for (let i = 0; i < 12; i++) {
    const seal = await page.$('.mom');
    if (!seal) return;
    const box = await seal.boundingBox();
    if (!box) return;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** Place a room under her feet and walk in. SETUP only — see the header. */
async function enterRoom(page, room) {
  await page.evaluate(({ card, kind, pin }) => {
    const store = window.__manorStore;
    const s = store.getState();
    const cell = { col: s.manor.playerCell.col, row: s.manor.playerCell.row };
    const key = `${cell.col},${cell.row}`;
    store.setState({
      manor: {
        ...s.manor,
        rooms: { ...s.manor.rooms, [key]: { cardId: card, cell, doors: ['N', 'S', 'E', 'W'], solved: false, kind, puzzleId: pin } },
      },
    });
    const s2 = store.getState();
    store.setState({ day: { ...s2.day, steps: 400 } });
    s2.enterRoom(key);
  }, { card: room.card, kind: room.kind, pin: room.pin ?? undefined });
  try {
    await page.waitForSelector(room.root, { timeout: 12000 });
    await page.waitForFunction(
      ({ cells, min }) => document.querySelectorAll(cells).length >= min,
      { cells: room.cells, min: room.min }, { timeout: 12000 },
    );
  } catch { /* judged below, not thrown */ }
  await clearMoments(page);
}

async function leaveRoom(page) {
  await page.evaluate(() => window.__manorStore.getState().leaveRoom());
  await page.waitForSelector('.bp-page', { timeout: 10000 }).catch(() => {});
  await clearMoments(page);
}

/* --- driven checks: real pointer input, real consequences ------------------ */

/**
 * Three taps the gate makes with `page.mouse`, because the game commits on
 * pointerdown/pointerup and `element.click()` drives nothing here. Geometry
 * says a control owns its surface; these say the tap does what it says.
 */
async function drivenChecks(page, scene, card) {
  const out = [];
  if (card === 'linen-closet') {
    // THE TAP THAT TYPED A LETTER. Every clue row the panel actually paints.
    const rows = await page.evaluate(() => {
      const panel = document.querySelector('.lc-clues');
      if (!panel) return [];
      const pr = panel.getBoundingClientRect();
      const cs = getComputedStyle(panel);
      const top = pr.top + (parseFloat(cs.borderTopWidth) || 0);
      const bottom = pr.bottom - (parseFloat(cs.borderBottomWidth) || 0);
      return [...document.querySelectorAll('.lc-clue:not(.lc-clue--hem)')].map((el) => {
        const r = el.getBoundingClientRect();
        const shown = Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, top)) / r.height;
        return {
          id: el.querySelector('.lc-clue__id')?.textContent.trim() ?? '?',
          cx: r.x + r.width / 2, cy: r.y + r.height / 2, shown: +shown.toFixed(3),
        };
      });
    });
    /**
     * WHAT THE CONTRACT ACTUALLY IS, since round 20: the clue rows are `<li>`,
     * not buttons. "They commit nothing, they are read, and being read is the
     * whole job" (CrosswordView). So the claim is NOT "a tap selects the clue"
     * — it is the stronger, quieter one: a tap on a clue changes NOTHING. The
     * shipped defect was a tap at a clue's own centre turning "123" into
     * "1G23", i.e. the keyboard answering for the panel; the row moving the
     * active entry would be the same defect wearing a nicer coat.
     */
    for (const row of rows) {
      if (row.shown <= 0) continue;
      if (row.shown < 0.999) {
        out.push({ scene, what: `clue ${row.id}`, ok: false,
          message: `the panel paints only ${(row.shown * 100).toFixed(0)}% of the row — a clue sliced by its own scrollport is a clue she cannot read` });
        continue;
      }
      const read = () => page.evaluate(() => ({
        grid: [...document.querySelectorAll('.lc-cell__ch')].map((e) => e.textContent).join('|'),
        active: document.querySelector('.lc-clue--active .lc-clue__id')?.textContent.trim() ?? null,
      }));
      const before = await read();
      await page.mouse.click(row.cx, row.cy);
      const after = await read();
      if (after.grid !== before.grid) {
        out.push({ scene, what: `clue ${row.id}`, ok: false, message: 'tapping the clue typed a letter into the grid' });
      } else if (after.active !== before.active) {
        out.push({ scene, what: `clue ${row.id}`, ok: false,
          message: `tapping the clue moved the active entry from ${before.active} to ${after.active} — the row is a label and commits nothing` });
      } else {
        out.push({ scene, what: `clue ${row.id}`, ok: true, message: 'read, and committed nothing' });
      }
    }
  }
  if (card === 'darkroom') {
    const cell = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.dk-cell:not(.dk-cell--locked)')][0];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { label: el.getAttribute('aria-label'), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!cell) out.push({ scene, what: 'cipher slot', ok: false, message: 'the tray has no un-developed slot to tap' });
    else {
      await page.mouse.click(cell.x, cell.y);
      const sel = await page.evaluate(() => document.querySelector('.dk-cell--sel')?.getAttribute('aria-label') ?? null);
      out.push({ scene, what: 'cipher slot', ok: sel === cell.label,
        message: sel === cell.label ? 'selected the slot under the thumb' : `selected ${sel} instead of ${cell.label}` });
    }
  }
  if (card === 'conservatory') {
    const petal = await page.evaluate(() => {
      const el = document.querySelector('.hv-cell--p0');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { letter: el.textContent.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!petal) out.push({ scene, what: 'hive petal', ok: false, message: 'the hive drew no petals' });
    else {
      await page.mouse.click(petal.x, petal.y);
      // `.hv-entry` is the word she is building; at rest it holds the hint
      // "tap the hive, or type", and one tap must replace that with the letter.
      const entry = await page.evaluate(() => ({
        text: document.querySelector('.hv-entry')?.textContent?.trim() ?? '',
        hint: !!document.querySelector('.hv-entry__hint'),
      }));
      const ok = !entry.hint && entry.text.includes(petal.letter);
      out.push({ scene, what: `hive petal ${petal.letter}`, ok,
        message: ok ? 'the letter arrived in the word' : `tapping ${petal.letter} left the entry reading ${JSON.stringify(entry.text)}` });
    }
  }
  return out;
}

/* --- one full pass over one glass ------------------------------------------ */

async function walkOneViewport(browser, base, vp, inject) {
  const findings = [];
  const consoleErrors = [];
  const roomsSeen = [];
  const counts = { scenes: 0, probes: 0, scrollRows: 0, copyAssertions: 0, driven: 0, perScene: {} };
  let appSource = null;
  let scene = 'boot';

  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push({ scene, kind: 'console.error', text: m.text() }); });
  page.on('pageerror', (e) => consoleErrors.push({ scene, kind: 'pageerror', text: String(e.message || e) }));

  if (inject?.init) await page.addInitScript(inject.init);

  const audit = async (label) => {
    scene = label;
    if (inject?.css) await page.addStyleTag({ content: inject.css }).catch(() => {});
    counts.scenes += 1;
    const rows = await stable(page, () => page.evaluate(measureScroll));
    counts.scrollRows += rows.length;
    findings.push(...judgeScroll(rows.map((r) => ({ ...r, scene: label }))));
    const probes = await stable(page, () => page.evaluate(probeHits));
    counts.probes += probes.length;
    counts.perScene[label] = probes.length;
    findings.push(...judgeHits(probes.map((p) => ({ ...p, scene: label }))));
    const wanted = COPY.filter((c) => c.scene === label && (!c.only || c.only.includes(vp.tag)));
    if (wanted.length) {
      const got = await stable(page, () => page.evaluate(measureCopy, wanted));
      counts.copyAssertions += got.length;
      findings.push(...judgeCopy(got));
    }
  };

  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 40000 });
    await page.waitForSelector('.bp-btn--seal', { timeout: 40000 });
    await audit('front-step');

    // EDITION — the fingerprint compiled INTO the bundle the browser just ran.
    scene = 'page:chronicles';
    await page.goto(`${base}#/chronicles`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.chron', { timeout: 20000 });
    appSource = await page.evaluate(() => {
      const sum = [...document.querySelectorAll('.chron__debug summary')][0];
      if (sum && !sum.parentElement.open) sum.parentElement.open = true;
      const dts = [...document.querySelectorAll('.chron__debug dt')];
      const dt = dts.find((d) => d.textContent.trim() === 'source');
      return dt?.nextElementSibling?.textContent.trim() ?? null;
    });
    await audit('page:chronicles');

    // The walk proper.
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 40000 });
    if (!(await ensureExploring(page))) {
      findings.push({ klass: 'ROOMS', scene: 'blueprint', what: 'the day',
        message: 'the walk never reached `exploring` — the house would not open' });
      return { findings, consoleErrors, roomsSeen, appSource, counts };
    }
    await clearMoments(page);
    await audit('blueprint');

    // The draft offer sheet — the overlay that shipped scrolling 29px.
    scene = 'draft-offer';
    const opened = await page.evaluate(() => {
      const s = window.__manorStore.getState();
      for (const dir of ['N', 'E', 'W', 'S']) {
        s.openDraft(dir);
        if (window.__manorStore.getState().draftOffer) return dir;
      }
      return null;
    });
    if (opened) {
      await page.waitForSelector('.bp-modal', { timeout: 10000 }).catch(() => {});
      await audit('draft-offer');
      await page.evaluate(() => window.__manorStore.setState({ draftOffer: null }));
      await page.waitForSelector('.bp-modal', { state: 'detached', timeout: 8000 }).catch(() => {});
    }

    // The Cabinet — opened with a real tap on a real button.
    scene = 'cabinet';
    const cab = await page.$('.bp-scene__row button:has-text("Cabinet"), button:has-text("Cabinet")');
    if (cab) {
      const box = await cab.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        if (await page.waitForSelector('.bp-modal', { timeout: 8000 }).catch(() => null)) {
          await audit('cabinet');
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForSelector('.bp-modal', { state: 'detached', timeout: 8000 }).catch(() => {});
        }
      }
    }

    // Seven rooms.
    for (const room of ROOMS) {
      scene = `room:${room.card}`;
      await enterRoom(page, room);
      const shape = await page.evaluate(({ root, cells }) => {
        const el = document.querySelector(root);
        if (!el) return { rendered: false, w: 0, h: 0, cells: 0 };
        const r = el.getBoundingClientRect();
        return { rendered: true, w: Math.round(r.width), h: Math.round(r.height), cells: document.querySelectorAll(cells).length };
      }, { root: room.root, cells: room.cells });
      roomsSeen.push({ card: room.card, ...shape });
      if (shape.rendered) {
        await audit(`room:${room.card}`);
        const driven = await drivenChecks(page, `room:${room.card}`, room.card);
        counts.driven += driven.length;
        findings.push(...judgeDriven(driven));
      }
      await leaveRoom(page);
    }

    // The standing pages.
    for (const [hash, label] of [['#/journal', 'page:journal'], ['#/sanctum', 'page:sanctum']]) {
      scene = label;
      await page.goto(base + hash, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.page, .jrn-page, .snc', { timeout: 15000 }).catch(() => {});
      await clearMoments(page);
      await audit(label);
    }
  } finally {
    await ctx.close();
  }
  return { findings, consoleErrors, roomsSeen, appSource, counts };
}

/* ──────────────────────────────── THE GATE ─────────────────────────────── */

function channel() {
  // Local rule: system Edge, never a downloaded browser. CI is a different
  // machine and names its own — see the workflow.
  return process.env.MANOR_GATE_CHANNEL ?? 'msedge';
}

async function runGate({ viewports, inject, quiet }) {
  const port = await freePort();
  const { server, base } = await startPreview(port);
  let findings = [];
  let browser;
  try {
    const served = await readServedStamp(base);
    const local = readLocalStamp();
    if (!quiet) log(await fetchEdition(base));

    const ch = channel();
    browser = await chromium.launch(ch === 'chromium' ? { headless: true } : { channel: ch, headless: true });

    for (const vp of viewports) {
      if (!quiet) log(`${RULE}\n[glass] ${vp.tag}`);
      const pass = await walkOneViewport(browser, base, vp, inject);
      const tagged = (f) => ({ ...f, vp: vp.tag });
      findings.push(...pass.findings.map(tagged));
      findings.push(...judgeConsole(pass.consoleErrors).map(tagged));
      findings.push(...judgeRooms(pass.roomsSeen).map(tagged));
      findings.push(...judgeEdition({ served, local, app: pass.appSource }).map(tagged));
      findings.push(...judgeCoverage(pass.counts).map(tagged));
      if (!quiet) {
        const mine = findings.filter((f) => f.vp === vp.tag);
        const c = pass.counts;
        log(`${vp.tag}: ${pass.roomsSeen.filter((r) => r.rendered).length}/7 rooms rendered`
          + ` · ${c.scenes} scenes · ${c.probes} hit probes · ${c.scrollRows} scrollports`
          + ` · ${c.copyAssertions} copy lines · ${c.driven} driven taps · ${mine.length} finding(s)`);
      }
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  return findings;
}

function report(findings) {
  const byClass = new Map();
  for (const f of findings) byClass.set(f.klass, (byClass.get(f.klass) ?? 0) + 1);
  console.log(RULE);
  if (!findings.length) {
    console.log('[glass] PASS — the built app boots, seven rooms render, nothing scrolls that could fit,');
    console.log('[glass]        every control owns its own surface, the walk is silent, and the copy is on the glass.');
    return 0;
  }
  for (const f of findings) {
    console.error(`[glass] ${f.klass.padEnd(7)} ${(f.vp ?? '').padEnd(8)} ${f.scene}  ${f.what}`);
    console.error(`[glass]         ${f.message}`);
  }
  console.log(RULE);
  console.error(`[glass] FAIL — ${findings.length} finding(s): `
    + [...byClass].map(([k, n]) => `${k} ${n}`).join(' · '));
  return 1;
}

/* ──────────────────────────────────  CLI  ─────────────────────────────── */

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--vp='))?.slice(5);
  const viewports = only ? VIEWPORTS.filter((v) => v.tag === only) : VIEWPORTS;

  if (args.includes('--self-test')) {
    const failures = selfTest();
    for (const f of failures) console.error(`[glass] self-test: ${f}`);
    if (failures.length) {
      console.error('[glass] SELF-TEST FAIL — the gate no longer judges what it was written to judge.');
      process.exit(1);
    }
    console.log(`[glass] self-test ok — ${'every verdict still goes red on the measurement its defect really produced'}.`);
  } else if (args.includes('--prove')) {
    // FALSIFICATION. Re-introduce each shipped defect and demand the gate see it.
    console.log(`[glass] PROVING THE GATE — ${PROOFS.length} shipped defects, re-introduced one at a time.`);
    const clean = await runGate({ viewports: [VIEWPORTS[0]], inject: null, quiet: true });
    console.log(`[glass] baseline (no injection): ${clean.length} finding(s)` + (clean.length ? ' — expected 0' : ' ✓'));
    let bad = clean.length ? 1 : 0;
    for (const proof of PROOFS) {
      const found = await runGate({ viewports: [VIEWPORTS[0]], inject: proof, quiet: true });
      const hits = found.filter((f) => f.klass === proof.klass);
      const ok = hits.length > 0;
      if (!ok) bad++;
      console.log(`${RULE}`);
      console.log(`[glass] ${ok ? 'RED as required' : 'STAYED GREEN — THE GATE IS BLIND'}: ${proof.id} (${proof.klass})`);
      console.log(`[glass]   ${proof.why}`);
      console.log(`[glass]   ${found.length} finding(s), ${hits.length} of class ${proof.klass}`);
      for (const h of hits.slice(0, 3)) console.log(`[glass]     · ${h.scene} ${h.what}: ${h.message}`);
    }
    console.log(RULE);
    if (bad) { console.error(`[glass] PROOF FAILED — ${bad} case(s) the gate cannot see.`); process.exit(1); }
    console.log('[glass] PROVEN — every re-introduced defect turned this gate red.');
  } else {
    const failures = selfTest();
    if (failures.length) {
      for (const f of failures) console.error(`[glass] self-test: ${f}`);
      console.error('[glass] refusing to run: the gate\'s own judgement is broken.');
      process.exit(1);
    }
    const t0 = Date.now();
    const findings = await runGate({ viewports, inject: null, quiet: false });
    const code = report(findings);
    console.log(`[glass] ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    process.exit(code);
  }
}
