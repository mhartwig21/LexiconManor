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
 *   7. ACCOUNT   the day's account, opened by a real tap on the candle, prints
 *                a column that ADDS UP TO ITS OWN TOTAL, summed off the
 *                rendered text — and that total is the number the ledger really
 *                holds. (Round 35.)
 *   8. LETTER    the opened letter is readable WHOLE inside the scrollport it
 *                was pinned to the top of, down to its sign-off, with the
 *                clause naming the speaking tube among the paragraphs that made
 *                it. (Round 35.)
 *   9. LANDING   the landing draft — the one door whose choice decides whether
 *                a 22-step climb reaches anything — is walked, and its known
 *                overflow is bounded by the lines the landing itself prints.
 *                (Round 35; see judgeLanding for why it is debt and not a bug.)
 *  10. CLIP      SVG text is judged in the coordinate system the clipping
 *                happens in — `getBBox()` against `viewBox` — because a clipped
 *                glyph's bounding rect reports that it fits. (Round 35.)
 *
 * ROUND 35 — WHY 7 THROUGH 10 EXIST. A live verifier broke three surfaces and
 * watched this file stay green on all three: the day's account capped to hold
 * 191px of rows in 60 AND its closing sentence deleted; the Journal's Letters
 * tab, which the walk reached on the one tab that fits and never opened a
 * letter on; and the landing offer, a scene the walk did not visit at all.
 * Those were not gaps in judgement — every verdict above was working. They were
 * gaps in the WALK, which is the failure mode a verdict list cannot show you.
 * A filter over an empty list is green, so each of the three now carries a
 * coverage floor of its own (COVERAGE_FLOORS) and cannot fail silently again.
 *
 * The same round folded in what was left of three live drivers CI has never
 * once run — `test:ledger`, `test:key-and-letter`, `test:purse-and-map`, zero
 * hits in .github/workflows/deploy.yml — and deleted the files. Sixty-two
 * rotting drivers is what this gate was built to end, not to add three to.
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
 *       Re-introduces eleven of those defects INTO THE RUNNING APP, one at a
 *       time, and fails unless the gate goes red on the expected class. This
 *       is the falsification pass; see PROOFS below for what each injects. The
 *       last five are round 35's: the verifier's own sabotages, re-run against
 *       the gate that could not see them.
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
  {
    scene: 'journal:letter',
    match: 'jrn-sheet',
    why: 'the journal is a growing record — engravings, testimony and letters accumulate for'
      + ' the length of a volume — and round 32 fixed it by making it overflow HONESTLY'
      + ' (`.jrn-sheet > * { flex: none }`), because the shipped defect was a sheet that'
      + ' squeezed each card below its own content and reported nothing to scroll to',
    ownedBy: 'LETTER',
  },
  {
    scene: 'landing-offer',
    match: 'bp-modal__sheet',
    why: 'DEBT, NOT A DECISION, AND NOW SMALLER THAN THE LINES IT IS MADE OF. Round 19 cut'
      + ' this sheet 768 -> 682 against 613px of glass; round 37 merged the orientation rule'
      + ' into the Sanctum rule (they became one fact when the landing became three cells)'
      + ' and cut it 682 -> 640, i.e. 27px over at 375x667 and 31px at 390x844. What is left'
      + ' is LESS than the three per-card opens-onto stamps alone (56px), so the only'
      + ' remaining payment is round 13\'s rule that every card prints its own answer — a'
      + ' design ruling, not a tuning, and the owner has already frozen the door-plan line'
      + ' those stamps sit beside. Until he takes it, judgeLanding owns the number',
    ownedBy: 'LANDING',
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
  /**
   * ROUND 35 — THE THREE SURFACES THE GATE COULD NOT SEE.
   *
   * All three were found by a verifier BREAKING them and watching this file
   * stay green. The day's account is the flagship of round 19 and the answer
   * to the single worst negative finding of the cold read (three unexplained
   * counter movements); the letter is the game's tutorial document; the
   * landing offer is the most expensive tap in the campaign. Nothing guarded
   * any of them.
   */
  {
    scene: 'ledger', sel: '.chr-ledger__note',
    says: 'Only what is written here was charged', expect: 'visible',
    why: 'the sentence that closes three surviving wrong beliefs at once — the verifier'
      + ' DELETED it and this gate passed',
  },
  {
    scene: 'ledger', sel: '.chr-ledger__title', says: 'The day’s account', expect: 'visible',
  },
  {
    scene: 'landing-offer', sel: '.bp-modal__sanctum',
    says: 'reaches the sealed door', expect: 'visible',
    why: 'the round-13 blocker: the modal named door DIRECTIONS and never once named the'
      + ' Sanctum, so the most expensive tap in the campaign was made blind',
  },
  {
    scene: 'landing-offer', sel: '.bp-modal__orient', expect: 'hidden',
    why: 'ROUND 37 — it is not deleted, it is MERGED. At every other door the rotation rule'
      + ' ("each plan is turned to the gilt door at your feet") and the Sanctum rule are two'
      + ' facts; at this one, since the landing became three cells and can be entered from'
      + ' the south, the east or the west, they are one fact with two halves — which way she'
      + ' came is what decides which plans can open north. `.bp-modal__sanctum` carries both'
      + ' halves here and is asserted visible one row up, so nothing has left the glass; what'
      + ' left is a paragraph break worth 42px on the one sheet that cannot afford it',
  },
  {
    scene: 'draft-offer', sel: '.bp-modal__orient',
    says: 'turned to the gilt door at your feet', expect: 'visible',
    why: 'and the other half of the same claim: the merge above is LANDING-ONLY, so the'
      + ' rotation rule must still be on the glass at every ordinary door. Without this row'
      + ' the hidden-at-the-landing entry could be satisfied by deleting the line outright',
  },
  /**
   * ROUND 32/33's LIVE DRIVERS, FOLDED IN. `test:ledger`, `test:key-and-letter`
   * and `test:purse-and-map` were three more scripts CI never ran (grep the
   * workflow: zero hits). Everything they claimed that is expressible as "this
   * authored line is on this glass" is claimed here instead, where it runs on
   * every push, and the three files are deleted — sixty-two rotting drivers is
   * what this gate was built to end, not to add three more to.
   */
  {
    scene: 'blueprint', sel: '.chr-key',
    says: 'only the bookmarks keep overnight', expect: 'visible', inert: true,
    why: 'round 19\'s currency key — both cold readers believed keys and gems carried over',
  },
  {
    scene: 'blueprint', sel: '.bp-foot__tier', expect: 'visible',
    why: 'round 33: the footer plate names the storey she is standing on, in the one'
      + ' vocabulary rowName owns — the sheet used to say "ground floors" over a half landing',
  },
  {
    scene: 'draft-offer', sel: '.bp-card__meta', expect: 'hidden',
    why: 'round 33 retired the jargon row (`standard · tiers I–III`): rarity is the deck\'s'
      + ' business and the tier is already stated once, at the top. Both blind testers named'
      + ' this row unprompted as something they never worked out',
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
    /**
     * A declaration that hands its number to a NAMED verdict is not an
     * exemption — it is a referral, and the marginal floor would only
     * double-report what that verdict already owns (and, worse, would go red
     * on a day the panel happened to overflow by 40px instead of 70). The
     * field is `ownedBy` and it must name a klass that really exists.
     */
    if (declared.ownedBy) continue;
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
    /**
     * DECLARED-INERT COPY CANNOT BE ASKED THIS QUESTION, AND SAYING SO IS
     * BETTER THAN GUESSING.
     *
     * `.chr-key` is `pointer-events: none` on purpose — an opaque slip that ate
     * a tap aimed at the blueprint would be the round-15 defect wearing a fix's
     * clothes. So `elementFromPoint` at its centre returns the drawing beneath
     * it, always, on a perfectly healthy page, and the occlusion probe is
     * simply the wrong instrument. Presence, size and text are still asserted
     * here; the inertness itself is asserted by `judgeInert`, which makes the
     * fall-through a CLAIM rather than an excuse for skipping this one.
     */
    if (!f.unoccluded && f.inert) {
      // nothing: the probe cannot speak for a layer that declines every tap
    } else if (!f.unoccluded) {
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

/* ═══════════════════════════ ROUND 35's VERDICTS ═══════════════════════════
   Three surfaces the gate walked past, and one clip rule an SVG makes invisible.
   Each of these is a claim about the EXPERIENCE — can she read it, does it add
   up, is the number the day really charged — not about the artifact. That
   distinction is this campaign's whole scar tissue.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Parse "−7" / "+18" / "12" off the glass. Unicode minus, as rendered. */
export function glassNum(text) {
  const s = String(text ?? '').trim().replace(/[−–—]/g, '-').replace(/[^0-9+-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * THE DAY'S ACCOUNT MUST ADD UP ON THE GLASS.
 *
 * The cold read's worst negative finding was three counter movements neither
 * stranger could explain, and round 19's answer was this sheet. A sheet that
 * prints a column which does not sum to its own total is worse than no sheet:
 * it converts "I don't know why" into "the game is lying to me".
 *
 * The sum is taken from the RENDERED TEXT, never recomputed from the store —
 * recomputing would be the fold read back to itself, which is exactly the
 * self-referential measurement that shipped twice in this campaign. The store
 * is consulted for ONE thing the glass cannot check about itself: that the
 * printed total is the number the ledger actually holds.
 */
export function judgeAccount(sheet) {
  if (!sheet) {
    return [{ klass: 'ACCOUNT', scene: 'ledger', what: '.chr-ledger__sheet',
      message: 'a real tap on the candle did not put the day\'s account on the glass' }];
  }
  const out = [];
  const printed = sheet.rows.reduce((sum, r) => sum + glassNum(r.n), 0);
  const total = glassNum(sheet.total);
  if (printed !== total) {
    out.push({ klass: 'ACCOUNT', scene: 'ledger', what: '.chr-ledger__total',
      message: `the rows printed on the glass sum to ${printed} and the printed total says ${total}`
        + ' — the one surface in the game whose whole job is to add up does not' });
  }
  if (total !== sheet.storeSteps) {
    out.push({ klass: 'ACCOUNT', scene: 'ledger', what: '.chr-ledger__total',
      message: `the sheet prints ${total} steps left and the ledger holds ${sheet.storeSteps}`
        + ' — the account is not an account of THIS day' });
  }
  const allowance = sheet.rows[0];
  if (!allowance || !/allowance/.test(allowance.why) || glassNum(allowance.n) !== sheet.storeBudget) {
    out.push({ klass: 'ACCOUNT', scene: 'ledger', what: '.chr-ledger__list',
      message: `the first row must be the morning's allowance at the ledger's budget (${sheet.storeBudget});`
        + ` it reads ${JSON.stringify(allowance ?? null)} — without it the column cannot add up` });
  }
  if (sheet.retireMounted) {
    out.push({ klass: 'ACCOUNT', scene: 'ledger', what: '.chr-retire',
      message: 'the destructive retire control is live behind the open account (AAA 11.5)'
        + ' — opening the day\'s account has become a second way to end the day' });
  }
  return out;
}

/**
 * THE TUTORIAL DOCUMENT MUST BE READABLE WHOLE.
 *
 * Round 32's defect, verbatim: `.jrn-sheet` is a flex column, a flex item
 * shrinks by default, `.jrn-letter` carries `overflow: hidden` — so Posy's
 * welcome letter measured 496px of body inside a 328px card while the sheet
 * reported `scrollHeight === clientHeight`. NOTHING TO SCROLL TO. One tester's
 * copy stopped one clause before the sentence naming the speaking tube, the
 * game's core verb, and he never learned the tube exists; the tester who read
 * that sentence spoke a word down it on day one. Same build, opposite games.
 *
 * The sheet is a DECLARED scroller (the journal grows all volume), so the
 * scroll verdict cannot make this claim — this one can, and it is the claim
 * that matters: every paragraph of the opened letter is inside the scrollport
 * it was pinned to the top of, the tube sentence among them, down to the
 * sign-off, with nothing painted over it.
 */
export function judgeLetter(letter) {
  if (!letter) {
    return [{ klass: 'LETTER', scene: 'journal:letter', what: '.jrn-letter[data-letter-open]',
      message: 'a real tap on the Letters tab and on the letter did not open it' }];
  }
  const out = [];
  const off = letter.paras.filter((p) => !p.onGlass);
  if (off.length) {
    out.push({ klass: 'LETTER', scene: 'journal:letter', what: '.jrn-letter__body p',
      message: `${off.length} of ${letter.paras.length} paragraphs are outside the scrollport the`
        + ` letter was pinned to the top of, starting ${JSON.stringify(off[0].txt.slice(0, 52))}` });
  }
  for (const [what, needle] of [['the speaking tube', LETTER_TUBE], ['the sign-off', LETTER_SIGNOFF]]) {
    const para = letter.paras.find((p) => p.txt.includes(needle));
    if (!para) {
      out.push({ klass: 'LETTER', scene: 'journal:letter', what,
        message: `no paragraph of the letter contains ${JSON.stringify(needle)} — either the copy`
          + ' drifted from the gate or the letter is not the one the gate was written about' });
    } else if (!para.onGlass) {
      out.push({ klass: 'LETTER', scene: 'journal:letter', what,
        message: `${JSON.stringify(needle)} is in the document and off the scrollport — this is the`
          + ' exact clause one blind tester never reached, and he never learned the tube exists' });
    }
  }
  if (letter.cardClips) {
    out.push({ klass: 'LETTER', scene: 'journal:letter', what: '.jrn-letter',
      message: `the card is clipping its own body — ${letter.cardScrollH}px of letter in a`
        + ` ${letter.cardClientH}px box, under \`overflow: hidden\`, with no gesture that reaches it` });
  }
  if (letter.coveredBy.length) {
    out.push({ klass: 'LETTER', scene: 'journal:letter', what: '.jrn-letter__body',
      message: `something is painted over the letter: ${letter.coveredBy.join(', ')}` });
  }
  return out;
}

const LETTER_TUBE = 'brass speaking tube';
const LETTER_SIGNOFF = '— Posy, Post Room';

/**
 * THE LANDING OFFER — WALKED, MEASURED, AND ITS DEBT BOUNDED.
 *
 * This sheet does not fit. Measured in a real landing draft: 682px of content
 * in 613px of glass at 375x667 and 821 in 742 at 390x844 before round 37;
 * **640 in 613 and 773 in 742 after it**, i.e. 27px and 31px over. Round 19
 * cut it 768 -> 682 and said, correctly, that what is left needs a design
 * answer rather than another 4% of glass; round 37 took the half of that
 * answer its own change made true — with the landing three cells wide, "each
 * plan turns to the wall at your feet" and "only a plan that opens north gets
 * in" stopped being two facts and became one sentence, worth 42px and 48px.
 *
 * WHAT IS LEFT IS NOW SMALLER THAN THE THREE PER-CARD STAMPS (56px), which is
 * a sharper statement of the debt than the old one: the whole residue is round
 * 13's rule that EVERY card prints its own opens-onto answer, and the owner has
 * frozen the door-plan line those stamps sit beside. That is a design ruling,
 * not a tuning, and not one to invent blind.
 *
 * SO THE GATE DOES THE HONEST THING INSTEAD OF THE COMFORTABLE ONE. It walks
 * the scene, it prints the number on every run, and it bounds the debt with a
 * claim that can fail: THE OVERFLOW MUST BE NO MORE THAN THE LINES THE LANDING
 * ITSELF PRINTS. The budget is measured off the glass — the Sanctum rule's own
 * box plus the three per-card stamps — so the assertion is "this sheet
 * overflows by the Sanctum copy AND BY NOTHING ELSE". Add a fifth line, let a
 * card name wrap, grow the header, and the overflow passes the budget and this
 * goes red. Take the design decision and the overflow goes to zero, at which
 * point the declaration in DECLARED_SCROLLERS should be deleted with it.
 *
 * A ceiling written as a magic number would have been the other option, and it
 * would have been a number nobody could argue with and nobody would look at.
 */
export function judgeLanding(m) {
  if (!m) {
    return [{ klass: 'LANDING', scene: 'landing-offer', what: 'the Sanctum landing draft',
      message: 'no landing offer could be opened — the most expensive draft in the campaign'
        + ' went unwalked, which is the state this verdict exists to end' }];
  }
  const out = [];
  if (m.stamps.length !== m.cards) {
    out.push({ klass: 'LANDING', scene: 'landing-offer', what: '.bp-card__sanctum',
      message: `${m.stamps.length} of ${m.cards} cards say whether they reach the Sanctum — round 13`
        + ' prints BOTH answers on purpose, because a card that says nothing beside two that do'
        + ' reads as a rendering gap rather than as a plan that seals the door' });
  }
  for (const s of m.stamps) {
    if (s.h === 0) {
      out.push({ klass: 'LANDING', scene: 'landing-offer', what: '.bp-card__sanctum',
        message: `a stamp reading ${JSON.stringify(s.text)} is mounted and measures 0px — the way this`
          + ' house loses a sentence is not by deleting it' });
    }
  }
  if (m.overflow > m.budget) {
    out.push({ klass: 'LANDING', scene: 'landing-offer', what: '.bp-modal__sheet',
      message: `overflows ${m.overflow}px, and the lines the landing itself adds account for only`
        + ` ${m.budget}px of that (the Sanctum rule at ${m.ruleH}px plus ${m.stamps.length} stamps)`
        + ' — something OTHER than the Sanctum copy has grown this sheet, and the known debt was'
        + ' bounded precisely so that this would be visible' });
  }
  return out;
}

/**
 * ═══ THE LANDING IS THREE CELLS, AND THE VOW IS TAKEN AT ALL THREE ════════
 *
 * ROUND 37 widened the landing from one cell to three (docs/THE_CLIMB §2), and
 * everything the unit suite can say about that it says against `atSanctumDoor`
 * — a pure predicate over a `ManorState`. What it cannot say is whether the
 * BLUEPRINT agrees: the vow control used to be a rect nailed over `SANCTUM_CELL`
 * and the sealed seam a bar nailed over `SANCTUM_DOOR_CELL`, so a predicate that
 * says yes at (1,5) and a sheet that draws the control at (2,6) is a green suite
 * and an unreachable ending on the west landing. That is this project's own
 * recurring failure — verifying a fix with an instrument that shares its
 * assumptions — so the claim is made where it can be false: in the built app,
 * at each cell in turn, with the control's own box measured against the player
 * token's own box.
 *
 * For every landing cell the walk asserts, in both states:
 *   OPEN   — `.bp-sanctumhit` exists, is not the sealed variant, and its hit
 *            zone sits DIRECTLY ABOVE HER: same column as the token, one cell
 *            up. A control drawn over a fixed column would fail two cells in
 *            three, which is exactly the defect this round could have shipped.
 *   SEALED — `.bp-sanctumhit--sealed` exists (round 13: the refusal is a real
 *            control, never a vanished one) and the bricked seam is drawn on
 *            HER north wall, not on a fixed one.
 */
export function judgeLandingCells(cells) {
  const out = [];
  const want = 3;
  if (!cells || cells.length < want) {
    out.push({ klass: 'VOW', scene: 'landing-cells', what: 'the Sanctum landing',
      message: `${cells?.length ?? 0} of ${want} landing cells were walked — round 37 made the`
        + ' ending reachable from three cells, and a walk that only visits one cannot tell'
        + ' a three-cell landing from the single square it replaced' });
  }
  for (const c of cells ?? []) {
    if (!c.open) {
      out.push({ klass: 'VOW', scene: 'landing-cells', what: `col ${c.col}, plan opens north`,
        message: 'no `.bp-sanctumhit` control on the sheet — the engine says she is at the'
          + ' Sanctum door and the blueprint offers no way to take the vow' });
    } else if (!c.aboveHer) {
      out.push({ klass: 'VOW', scene: 'landing-cells', what: `col ${c.col}, the vow's own box`,
        message: `the vow control is drawn at x ${Math.round(c.hitMidX)} while she is standing at`
          + ` x ${Math.round(c.tokenMidX)}, ${Math.round(c.dy)}px above her — it is nailed to a`
          + ' fixed cell rather than to the chamber door over her head, so two of the three'
          + ' landings send her tap into the wrong square' });
    }
    if (!c.sealedControl) {
      out.push({ klass: 'VOW', scene: 'landing-cells', what: `col ${c.col}, plan seals`,
        message: 'no `.bp-sanctumhit--sealed` control — the round-13 blocker, back: a landing'
          + ' that refuses by drawing nothing is indistinguishable from a bug on the most'
          + ' expensive arrival in the campaign' });
    }
    if (!c.seam) {
      out.push({ klass: 'VOW', scene: 'landing-cells', what: `col ${c.col}, the sealed seam`,
        message: 'the bricked seam is not drawn on her own north wall — the one fact the game'
          + ' never drew, drawn at the wrong cell is drawn nowhere' });
    }
  }
  return out;
}

/**
 * AN SVG ROOT CLIPS AT ITS viewBox, AND A CLIPPED GLYPH STILL MEASURES FINE.
 *
 * `getBoundingClientRect()` on an SVG child reports its TRANSFORMED GEOMETRY,
 * not what survived the root's clip — which is how round 28's first cut of the
 * blueprint's margin key lost the last glyph of "A MOVE" on both shipped phones
 * while every box in every measurement looked comfortable. The verdict is
 * therefore taken in the coordinate system the clipping actually happens in:
 * `getBBox()` against `viewBox`. `test:purse-and-map` is the only thing that
 * has ever checked this, and CI has never run it.
 */
export function judgeClip(lines) {
  return lines.filter((l) => !l.inside).map((l) => ({
    klass: 'CLIP', scene: l.scene, what: l.sel,
    message: `${JSON.stringify(l.text)} is laid at user units x ${Math.round(l.bbox.x)}–${Math.round(l.bbox.right)}`
      + ` / y ${Math.round(l.bbox.y)}–${Math.round(l.bbox.bottom)} in a ${Math.round(l.viewBox.w)}x${Math.round(l.viewBox.h)}`
      + ' viewBox — the root clips there, so the part outside it is drawn on no phone,'
      + ' and its bounding rect will go on reporting that it fits',
  }));
}

/**
 * AND THE MIRROR OF judgeHits: some things must NOT own their own surface.
 *
 * The currency key is a caption laid over the blueprint. Round 15's defect was
 * a layer that ate a tap aimed at something else — so "is it on the glass" is
 * only half the claim, and the other half is "and it takes nothing".
 */
export function judgeInert(probes) {
  return probes.filter((p) => p.swallows).map((p) => ({
    klass: 'HITS', scene: p.scene, what: p.sel,
    message: 'is declared inert and answers at its own centre — it is swallowing taps meant for'
      + ' the page underneath it (the round-15 defect)',
  }));
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
  scenes: 13,        // front-step, chronicles, blueprint, 2 offers, cabinet, 7 rooms, ledger, journal x2, sanctum
  probes: 400,       // controls x 5 points, across the whole walk
  scrollRows: 10,    // documentElement alone contributes one per scene
  copyAssertions: 8, // COPY entries applicable to this glass
  driven: 5,         // the taps made with real pointer input
  /**
   * ROUND 35. Each of the three surfaces the verifier broke gets a floor of
   * its own, because "the walk silently failed to reach it" and "the walk
   * reached it and it was fine" are the two states this gate exists to tell
   * apart — and a `null` measurement flowing into a verdict that filters an
   * empty list is precisely how it stayed green while all three were broken.
   */
  accountRows: 3,    // the allowance + the day's charges, on the glass
  letterParas: 3,    // Posy's welcome letter is four paragraphs
  landingStamps: 3,  // one Sanctum answer per card, both answers printed
  clipLines: 2,      // the blueprint margin's key is two sentences
  /**
   * ROUND 37. The landing is three cells; a walk that visits one of them
   * cannot tell the new ending from the single square it replaced, and
   * `judgeLandingCells` filters a list — so an empty list has to be a finding
   * in its own right rather than a silent pass.
   */
  landingCells: 3,   // the vow, offered and refused at each landing cell
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
  /**
   * ROUND 35. The verifier's first sabotage, verbatim: cap the day's account
   * to 60px so it holds 191px of rows. The list is not declared anywhere, so
   * it is an ordinary scroll finding — the point of the fixture is that the
   * measurement now REACHES this scene at all.
   */
  check("the day's account capped so it holds 191px of rows in 60",
    judgeScroll([{ scene: 'ledger', sel: 'ul.chr-ledger__list', clientH: 60, scrollH: 191, clientW: 311, scrollW: 311 }]),
    ['SCROLL']);
  check('the same account at its real size',
    judgeScroll([{ scene: 'ledger', sel: 'ul.chr-ledger__list', clientH: 191, scrollH: 191, clientW: 311, scrollW: 311 }]),
    []);
  check('a declaration that hands its number to a named verdict is not marginal-flagged',
    judgeScroll([{ scene: 'landing-offer', sel: 'div.bp-modal__sheet', clientH: 613, scrollH: 682, clientW: 343, scrollW: 343 }]),
    []);
  check('...and it is still declared per SCENE — an ordinary offer that scrolls is a defect',
    judgeScroll([{ scene: 'draft-offer', sel: 'div.bp-modal__sheet', clientH: 613, scrollH: 682, clientW: 343, scrollW: 343 }]),
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
  check('a declared-inert caption, which every healthy page reports as "covered"',
    judgeCopy([{ scene: 'blueprint', sel: '.chr-key', expect: 'visible', inert: true, found: true, w: 189, h: 34, unoccluded: false, occludedBy: 'svg', text: 'gems · keys · bookmarks only the bookmarks keep overnight', says: 'only the bookmarks keep overnight' }]),
    []);
  check('...and inert does not excuse the words drifting',
    judgeCopy([{ scene: 'blueprint', sel: '.chr-key', expect: 'visible', inert: true, found: true, w: 189, h: 34, unoccluded: false, occludedBy: 'svg', text: 'gems · keys · bookmarks', says: 'only the bookmarks keep overnight' }]),
    ['COPY']);
  check('...nor the slip never being drawn at all',
    judgeCopy([{ scene: 'blueprint', sel: '.chr-key', expect: 'visible', inert: true, found: true, w: 0, h: 0, unoccluded: false }]),
    ['COPY']);
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

  // --- ACCOUNT (round 35, hole 1) ------------------------------------------
  const goodAccount = {
    rows: [{ why: 'the morning’s allowance', n: '+18' }, { why: 'walk ×2', n: '−4' }],
    total: '14', storeSteps: 14, storeBudget: 18, retireMounted: false,
  };
  check('the day’s account, adding up',
    judgeAccount(goodAccount),
    []);
  check('a candle that opened nothing',
    judgeAccount(null),
    ['ACCOUNT']);
  check('a column that does not sum to its own total',
    judgeAccount({ ...goodAccount, rows: [{ why: 'the morning’s allowance', n: '+18' }, { why: 'walk ×2', n: '−9' }] }),
    ['ACCOUNT']);
  check('an account of somebody else’s day',
    judgeAccount({ ...goodAccount, total: '14', storeSteps: 9 }),
    ['ACCOUNT']);
  check('the allowance row dropped, so nothing adds up',
    judgeAccount({ ...goodAccount, rows: [{ why: 'walk ×2', n: '−4' }], total: '-4', storeSteps: -4 }),
    ['ACCOUNT']);
  check('the retire control left live under the open account (AAA 11.5)',
    judgeAccount({ ...goodAccount, retireMounted: true }),
    ['ACCOUNT']);

  // --- LETTER (round 35, hole 2) -------------------------------------------
  const wholeLetter = {
    paras: [
      { txt: 'Dear newcomer,', onGlass: true },
      { txt: 'there is a brass speaking tube in the entrance hall', onGlass: true },
      { txt: '— Posy, Post Room', onGlass: true },
    ],
    cardClips: false, cardScrollH: 436, cardClientH: 436, coveredBy: [],
  };
  check('the whole letter, readable to its sign-off',
    judgeLetter(wholeLetter),
    []);
  check('a Letters tab that never opened',
    judgeLetter(null),
    ['LETTER']);
  check('THE SHIPPED ROUND-32 DEFECT: the card clipping its own body with nothing to scroll to',
    judgeLetter({ ...wholeLetter, cardClips: true, cardScrollH: 496, cardClientH: 328 }),
    ['LETTER']);
  check('...and the clause naming the tube pushed off the scrollport with it',
    judgeLetter({
      ...wholeLetter,
      paras: wholeLetter.paras.map((p, i) => (i > 0 ? { ...p, onGlass: false } : p)),
    }),
    ['LETTER', 'LETTER', 'LETTER']);
  check('copy that drifted out from under the gate',
    judgeLetter({ ...wholeLetter, paras: [{ txt: 'Dear newcomer,', onGlass: true }] }),
    ['LETTER', 'LETTER']);
  check('Posy standing in front of her own letter',
    judgeLetter({ ...wholeLetter, coveredBy: ['dlg__sheet'] }),
    ['LETTER']);

  // --- LANDING (round 35, hole 3) ------------------------------------------
  const stamp = { text: 'Turns its back on the Sanctum', h: 19 };
  const landingToday = {
    cards: 3, stamps: [stamp, stamp, stamp], ruleH: 43, budget: 100, overflow: 69,
  };
  check('the landing offer overflowing by exactly the Sanctum copy — the known, bounded debt',
    judgeLanding(landingToday),
    []);
  check('a landing draft the walk could not open',
    judgeLanding(null),
    ['LANDING']);
  check('the debt growing past the lines it was attributed to',
    judgeLanding({ ...landingToday, overflow: 132 }),
    ['LANDING']);
  check('a card that says nothing where two say something (round 13)',
    judgeLanding({ ...landingToday, stamps: [stamp, stamp] }),
    ['LANDING']);
  check('a stamp authored, mounted, and drawn at nothing',
    judgeLanding({ ...landingToday, stamps: [stamp, stamp, { ...stamp, h: 0 }] }),
    ['LANDING']);

  // --- VOW (round 37 — the landing is three cells) -------------------------
  const atCol = (col) => ({
    col, open: true, sealedControl: true, seam: true, aboveHer: true,
    hitMidX: 100, tokenMidX: 100, dy: 64,
  });
  const allThree = [atCol(1), atCol(2), atCol(3)];
  check('the vow offered and refused at each of the three landing cells',
    judgeLandingCells(allThree),
    []);
  check('a walk that only ever stood on the middle landing',
    judgeLandingCells([atCol(2)]),
    ['VOW']);
  check('THE DEFECT ROUND 37 COULD HAVE SHIPPED: the vow nailed to a fixed column',
    judgeLandingCells([
      { ...atCol(1), aboveHer: false, hitMidX: 164, tokenMidX: 100 },
      atCol(2),
      { ...atCol(3), aboveHer: false, hitMidX: 164, tokenMidX: 228 },
    ]),
    ['VOW', 'VOW']);
  check('a landing whose engine says door and whose sheet draws none',
    judgeLandingCells([atCol(1), { ...atCol(2), open: false }, atCol(3)]),
    ['VOW']);
  check('the round-13 blocker, back at one cell: a refusal that draws nothing',
    judgeLandingCells([atCol(1), atCol(2), { ...atCol(3), sealedControl: false }]),
    ['VOW']);
  check('the bricked seam drawn at a fixed wall rather than hers',
    judgeLandingCells([{ ...atCol(1), seam: false }, atCol(2), atCol(3)]),
    ['VOW']);
  check('a walk that never reached the landing storey at all',
    judgeLandingCells(null),
    ['VOW']);

  // --- CLIP / INERT --------------------------------------------------------
  const vb = { w: 300, h: 420 };
  check('round 28’s lost glyph: a key line laid past the viewBox that clips it',
    judgeClip([{ scene: 'blueprint', sel: '.bp-key__line', text: 'A MOVE', inside: false, bbox: { x: 8, right: 312, y: 400, bottom: 412 }, viewBox: vb }]),
    ['CLIP']);
  check('a key line inside the drawing',
    judgeClip([{ scene: 'blueprint', sel: '.bp-key__line', text: 'A MOVE', inside: true, bbox: { x: 8, right: 280, y: 400, bottom: 412 }, viewBox: vb }]),
    []);
  check('round 15: a caption swallowing the tap aimed under it',
    judgeInert([{ scene: 'blueprint', sel: '.chr-key', swallows: true }]),
    ['HITS']);
  check('a caption that lets the tap through',
    judgeInert([{ scene: 'blueprint', sel: '.chr-key', swallows: false }]),
    []);

  // --- BLIND (the anti-construction guard) ---------------------------------
  const fullWalk = {
    scenes: 18, probes: 1600, scrollRows: 260, copyAssertions: 12, driven: 6,
    accountRows: 7, letterParas: 4, landingStamps: 3, clipLines: 2, landingCells: 3,
  };
  check('a probe selector that stopped matching anything',
    judgeCoverage({ ...fullWalk, probes: 0 }),
    ['BLIND']);
  check('a scene that painted no controls at all',
    judgeCoverage({ ...fullWalk, perScene: { 'room:study': 0 } }),
    ['BLIND']);
  check('a copy manifest that quietly stopped applying',
    judgeCoverage({ ...fullWalk, copyAssertions: 0 }),
    ['BLIND']);
  /**
   * THE THREE HOLES, AS COVERAGE. Every one of the round-35 verdicts filters a
   * list, and a filter over an empty list is green — so the walk failing to
   * reach the account, the letter or the landing must be a finding in its own
   * right, and not a silent zero.
   */
  check('a walk that never reached the day’s account',
    judgeCoverage({ ...fullWalk, accountRows: 0 }),
    ['BLIND']);
  check('a walk that never opened the letter',
    judgeCoverage({ ...fullWalk, letterParas: 0 }),
    ['BLIND']);
  check('a walk that never opened a landing draft',
    judgeCoverage({ ...fullWalk, landingStamps: 0 }),
    ['BLIND']);
  check('a walk that stopped seeing the margin’s key',
    judgeCoverage({ ...fullWalk, clipLines: 0 }),
    ['BLIND']);
  check('a walk that never stood on a landing cell (round 37)',
    judgeCoverage({ ...fullWalk, landingCells: 0 }),
    ['BLIND']);
  check('a full walk',
    judgeCoverage({ ...fullWalk, perScene: { 'room:study': 14 } }),
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
  {
    id: 'vow-nailed-to-one-cell',
    klass: 'VOW',
    /**
     * ROUND 37, THE DEFECT THIS ROUND COULD HAVE SHIPPED. The landing became
     * three cells and `atSanctumDoor` moved with it; the blueprint's vow
     * control was a rect nailed over `SANCTUM_CELL`. A unit suite over the
     * predicate cannot see that at all — it is green while two of the three
     * ways into the ending send the tap into a wall.
     *
     * Staged by shoving the vow control two columns east, which is exactly the
     * displacement a fixed rect produces at the west landing.
     */
    why: 'the Sanctum vow drawn at a fixed column rather than over the landing she is standing on',
    css: '.bp-sanctumhit { transform: translateX(128px) !important; }',
  },
  {
    id: 'landing-refuses-by-vanishing',
    klass: 'VOW',
    /**
     * The round-13 blocker, re-broken at the class that fixed it: a landing
     * whose plan turns its back on the chamber draws NOTHING, on the most
     * expensive arrival in the campaign. It shipped that way for four rounds.
     */
    why: 'the sealed landing refusing by drawing no control at all, the round-13 blocker',
    css: '.bp-sanctumhit--sealed, .bp-sealedseam { display: none !important; }',
  },

  /* ═══ ROUND 35 — THE THREE HOLES, RE-BROKEN ════════════════════════════════
     Each of these is a defect a live verifier really introduced and this gate
     really failed to notice. They are here so that the next agent to widen a
     selector or rename a class finds out from the gate rather than from a
     stranger on a phone. */
  {
    id: 'ledger-capped',
    klass: 'SCROLL',
    /**
     * THE VERIFIER'S OWN SABOTAGE, VERBATIM: cap the day's account so it holds
     * 191px of rows in 60px of glass. The gate passed. It passed because it had
     * never once tapped the candle.
     */
    why: 'the day’s account capped to a third of its rows — round 19’s flagship surface, unguarded',
    css: '.chr-ledger__list { max-height: 60px !important; height: 60px !important; overflow-y: auto !important; }',
  },
  {
    id: 'ledger-lies',
    klass: 'ACCOUNT',
    why: 'a column that does not add up to its own printed total — worse than no account at all,'
      + ' because it turns "I don’t know why" into "the game is lying to me"',
    init: () => {
      const patch = () => {
        const n = document.querySelector('.chr-ledger__row .chr-ledger__n');
        if (n && n.textContent !== '+999') n.textContent = '+999';
      };
      new MutationObserver(patch).observe(document, { childList: true, subtree: true });
    },
  },
  {
    id: 'letter-clipped',
    klass: 'LETTER',
    /**
     * ROUND 32's DEFECT, RESTORED BY DELETING ITS FIX. `.jrn-sheet > * { flex:
     * none }` is the whole of that fix; without it a flex item's default shrink
     * squeezes the card below its content height, `.jrn-letter`'s `overflow:
     * hidden` clips the rest, and 250px of the game's tutorial document become
     * unreachable by any gesture — with `scrollHeight === clientHeight` on the
     * sheet, so nothing anywhere reports a problem.
     */
    why: 'the sheet eating the letter instead of scrolling it — the clause naming the speaking tube,'
      + ' unreachable, which is the difference between two testers’ entire games',
    css: '.jrn-sheet > * { flex: 1 1 auto !important; }',
  },
  {
    id: 'sanctum-rule-retired',
    klass: 'COPY',
    /**
     * The way this house loses a sentence is never by deleting it: `.mic__sub`,
     * the Gallery's studies line and the Linen Closet's nameplate were all
     * authored, all committed, and all `display: none` on the phones the game
     * ships on. The landing rule is one breakpoint from the same fate.
     */
    why: 'the round-13 rule taken off the phone by a media query, on the most expensive draft in the campaign',
    css: '.bp-modal__sanctum { display: none !important; }',
  },
  {
    id: 'landing-debt-grows',
    klass: 'LANDING',
    /**
     * The known debt is bounded by the lines the landing itself prints. This
     * adds 90px that the landing does NOT print — the shape of every future
     * "just one more line on the card" — and the budget must refuse it.
     */
    why: 'the landing offer growing by something other than the Sanctum copy its debt is attributed to',
    css: '.bp-modal__cards { padding-bottom: 90px !important; }',
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
    /**
     * ROUND 35. The day's account is an overlay with a FULL-SCREEN SCRIM
     * BUTTON under it (`.chr-ledger__scrim`, "Close the day's account"), which
     * is the correct design — a tap anywhere outside puts the account away, and
     * the bar above it goes `pointer-events: none` so tapping the candle that
     * opened it closes it again. Probing the body while it is up reported 94
     * failures on the first run: every control on the blueprint beneath
     * answering as the scrim, which is not a defect but the whole point of a
     * scrim, plus the scrim's own centre answering as the sheet on top of it.
     * The topmost interactive layer here is the SHEET, so that is what is
     * probed — the same rule the `.mom` / `.dlg` / `.bp-modal` entries follow.
     */
    || document.querySelector('.chr-ledger__sheet')
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
    /**
     * A STICKY FOOT OVER A PANEL THAT IS GENUINELY SCROLLED IS A SCROLL AWAY,
     * NOT A BURIED CONTROL — the same rule `visibleBox` already applies to a
     * control below its own scrollport, stated for the partial case.
     *
     * `.bp-modal__foot` is `position: sticky` at the bottom of the sheet's own
     * scrollport, and it holds the modal's only labelled exit — that is round
     * 20's fix for a Cabinet whose "Close" opened at top 3282 in an 844px
     * glass. On a sheet that overflows, the last card's bottom edge is under it
     * at rest and clear of it after a scroll, exactly as the sheet's bottom
     * padding is written to guarantee. The Cabinet has had this property since
     * round 20 and this probe never fired on it by luck of where its rows fall;
     * the landing offer made it fire. Calling that "a tap goes somewhere else"
     * would be the gate getting switched off in a week.
     *
     * IT IS NARROW ON PURPOSE. It applies only when the answering element is
     * really `position: sticky`, and only when a shared ancestor is really
     * overflowing RIGHT NOW. A control buried under a fixed bar on a panel that
     * does not scroll is still, correctly, a defect.
     */
    const scrolledAway = (hit) => {
      let sticky = null;
      for (let n = hit; n && n !== document.body; n = n.parentElement) {
        if (getComputedStyle(n).position === 'sticky') { sticky = n; break; }
      }
      if (!sticky) return false;
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (!n.contains(sticky)) continue;
        const cs = getComputedStyle(n);
        const scrolls = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
        if (scrolls && n.scrollHeight > n.clientHeight + 1) return true;
      }
      return false;
    };
    for (const [point, x, y] of points) {
      const hit = document.elementFromPoint(x, y);
      const owned = !!hit && (hit === el || el.contains(hit));
      if (!owned && hit && scrolledAway(hit)) { clipped++; continue; }
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

/**
 * THE DAY'S ACCOUNT, read back off the glass.
 *
 * The rows and the total are TEXT, deliberately: the claim is that the column
 * a player can see adds up, so re-deriving it from the store would be the fold
 * read back to itself. `storeSteps` / `storeBudget` are the two numbers the
 * glass genuinely cannot check about itself.
 */
function measureAccount() {
  const sheet = document.querySelector('.chr-ledger__sheet');
  if (!sheet) return null;
  const s = window.__manorStore.getState();
  return {
    rows: [...sheet.querySelectorAll('.chr-ledger__row')].map((r) => ({
      why: r.querySelector('.chr-ledger__why')?.textContent?.trim() ?? '',
      n: r.querySelector('.chr-ledger__n')?.textContent?.trim() ?? '',
    })),
    total: sheet.querySelector('.chr-ledger__total .chr-ledger__n')?.textContent?.trim() ?? '',
    storeSteps: s.stepsRemaining(),
    storeBudget: s.ledger.budget,
    // AAA 11.5: `data-overlay` makes DayHeader stop rendering the destructive
    // control entirely, so its absence is the contract, not a side effect.
    retireMounted: !!document.querySelector('.chr-retire'),
  };
}

/** The opened letter, against the scrollport it was pinned to the top of. */
function measureLetter() {
  const sheet = document.querySelector('.jrn-sheet');
  const card = document.querySelector('.jrn-letter[data-letter-open="true"]');
  const body = card?.querySelector('.jrn-letter__body');
  if (!sheet || !card || !body) return null;
  const sr = sheet.getBoundingClientRect();
  const br = body.getBoundingClientRect();
  /* `elementsFromPoint` returns topmost first, so everything BEFORE the body
     (or one of its own children) is standing in front of it. The letter's own
     <p> is the first hit on a healthy page and must not count as a coverer —
     that is the difference between this and a naive `[0]`. */
  const stack = document.elementsFromPoint(
    br.x + br.width / 2, Math.min(br.y + 20, window.innerHeight - 4),
  );
  const coveredBy = [];
  for (const el of stack) {
    if (el === body || body.contains(el)) break;
    coveredBy.push(typeof el.className === 'string' && el.className ? el.className : el.tagName);
  }
  if (document.querySelector('.dlg')) coveredBy.push('.dlg');
  return {
    paras: [...body.querySelectorAll('p')].map((p) => {
      const r = p.getBoundingClientRect();
      return { txt: p.textContent, onGlass: r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1 };
    }),
    cardClips: card.scrollHeight > card.clientHeight + 1,
    cardScrollH: card.scrollHeight,
    cardClientH: card.clientHeight,
    coveredBy,
  };
}

/** The landing offer's overflow, and the lines the landing itself accounts for. */
function measureLanding() {
  const sheet = document.querySelector('.bp-modal__sheet');
  const rule = document.querySelector('.bp-modal__sanctum');
  if (!sheet || !rule) return null;
  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    const mt = parseFloat(getComputedStyle(el).marginTop) || 0;
    return Math.round(r.height + mt);
  };
  const stamps = [...document.querySelectorAll('.bp-card__sanctum')].map((el) => ({
    text: el.textContent.trim(), h: boxOf(el),
  }));
  const ruleH = boxOf(rule);
  return {
    cards: document.querySelectorAll('.bp-card').length,
    stamps,
    ruleH,
    budget: ruleH + stamps.reduce((n, s) => n + s.h, 0),
    overflow: sheet.scrollHeight - sheet.clientHeight,
  };
}

/**
 * One landing cell, in both states. Run once per cell with the store already
 * standing her there; reads only what the sheet drew.
 */
function measureLandingCell(col) {
  const rectOf = (el) => (el ? el.getBoundingClientRect() : null);
  const hit = document.querySelector('.bp-sanctumhit:not(.bp-sanctumhit--sealed) .bp-hit__zone');
  const token = document.querySelector('.bp-token');
  const h = rectOf(hit);
  const t = rectOf(token);
  const drawn = Boolean(h) && h.width > 0 && h.height > 0;
  const hitMidX = h ? h.x + h.width / 2 : NaN;
  const tokenMidX = t ? t.x + t.width / 2 : NaN;
  const dy = h && t ? (t.y + t.height / 2) - (h.y + h.height / 2) : NaN;
  return {
    col,
    open: drawn,
    hitMidX,
    tokenMidX,
    dy,
    // Same column as the token, and one cell straight up: the tolerance is
    // half a cell, so a control nailed to a neighbouring column fails.
    aboveHer: Boolean(h && t) && Math.abs(hitMidX - tokenMidX) < h.width / 2
      && dy > h.height * 0.5 && dy < h.height * 1.6,
  };
}

/**
 * …and the other state: the plan turns its back on the chamber.
 *
 * DRAWN, not merely mounted. `display: none` leaves a node exactly where
 * `querySelector` finds it, and the way this house loses a control is not by
 * deleting it — the round-13 blocker WAS a control that measured nothing. Both
 * halves are judged on their boxes.
 */
function measureLandingCellSealed() {
  // A horizontal SVG path has a real width and NO height, so the test is "has
  // an extent at all" rather than "has both". Hidden either way measures 0x0.
  const drawn = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  return {
    sealedControl: drawn('.bp-sanctumhit--sealed .bp-hit__zone'),
    seam: drawn('.bp-sealedseam'),
  };
}

/**
 * The blueprint's margin key, judged where the clipping happens: `getBBox()`
 * in user units against the root's `viewBox`, never the transformed rect.
 */
function measureClipLines() {
  const svg = document.querySelector('svg.bp-sheet');
  if (!svg) return [];
  const vb = svg.viewBox.baseVal;
  return [...document.querySelectorAll('.bp-key__line')].map((t) => {
    const bb = t.getBBox();
    return {
      sel: '.bp-key__line',
      text: t.textContent.replace(/\s+/g, ' ').trim(),
      bbox: { x: bb.x, y: bb.y, right: bb.x + bb.width, bottom: bb.y + bb.height },
      viewBox: { w: vb.width, h: vb.height },
      inside: bb.x >= vb.x - 0.5 && bb.x + bb.width <= vb.x + vb.width + 0.5
        && bb.y >= vb.y - 0.5 && bb.y + bb.height <= vb.y + vb.height + 0.5,
    };
  });
}

/** Layers declared inert: on the glass, and taking nothing. */
function measureInert(sels) {
  return sels.flatMap((sel) => {
    const el = document.querySelector(sel);
    if (!el) return [];
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return [];
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return [{ sel, swallows: !!(hit && el.contains(hit)) }];
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

async function walkOneViewport(browser, base, vp, inject, quiet) {
  const findings = [];
  const consoleErrors = [];
  const roomsSeen = [];
  const counts = {
    scenes: 0, probes: 0, scrollRows: 0, copyAssertions: 0, driven: 0, perScene: {},
    accountRows: 0, letterParas: 0, landingStamps: 0, clipLines: 0, landingCells: 0,
  };
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
    /**
     * THE CURRENCY KEY IS A TIMED, ONE-TIME SLIP, AND THE GATE HAD TO LEARN IT.
     *
     * The first run of this assertion reported `.chr-key` "authored and mounted
     * but measures 0 x 0" at both sizes — which was the gate being right about
     * the wrong instant. `chrome.css` fades it in on a 1400ms delay with
     * `animation-fill-mode: both`, so for the first 1.4 seconds of `exploring`
     * it is genuinely at zero opacity, and `stable()` settles long before that.
     *
     * It is worth writing down rather than working around: this line lives on a
     * timer, and a timer is exactly what standing rule 4 is about — the
     * step-reason words were correct, routed correctly, and moved neither cold
     * reader because they lived 1150ms in a corner. The gate waits for the
     * instant the player would see, and if that instant never comes, judgeCopy
     * says so.
     */
    await page.waitForFunction(() => {
      const el = document.querySelector('.chr-key');
      return !!el && Number(getComputedStyle(el).opacity) > 0.9;
    }, null, { timeout: 6000 }).catch(() => { /* judged by COPY below, not thrown */ });
    await audit('blueprint');

    /**
     * ROUND 35 — TWO CLAIMS THE BLUEPRINT CARRIES THAT NO BOX CAN MAKE.
     * The margin's key is SVG <text>: it clips at the root's viewBox and its
     * bounding rect will report a clipped glyph as comfortably inside. The
     * currency key is a caption over the drawing: being ON the glass is only
     * half of it, and the other half is that it takes no tap meant for the
     * page beneath. Both come from `test:purse-and-map` / `test:key-and-letter`
     * — two of the three drivers CI has never once run.
     */
    {
      const lines = await stable(page, () => page.evaluate(measureClipLines));
      counts.clipLines += lines.length;
      findings.push(...judgeClip(lines.map((l) => ({ ...l, scene: 'blueprint' }))));
      const inert = await stable(page, () => page.evaluate(measureInert, ['.chr-key']));
      findings.push(...judgeInert(inert.map((p) => ({ ...p, scene: 'blueprint' }))));
    }

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

    /**
     * ═══ THE LANDING DRAFT (round 35, hole 3) ═══════════════════════════════
     * The one door in the game whose choice decides whether a 22-step climb
     * reaches anything. It has never been walked, and it does not fit: 682px in
     * 613px of glass at 375x667, and — new this round, and contrary to what the
     * last two rounds believed — 821 in 742 at 390x844 as well.
     *
     * SETUP ONLY, and the line is worth stating: the store stands her on (2,4)
     * with the landing above her empty and a key in her purse, and then the
     * REAL `openDraft` rolls the REAL offer through the real deck. Nothing here
     * skips a control the gate is about to make a claim about. The key matters:
     * a row-5 door padlocks at 55%, so without one the walk would silently
     * measure a shorter sheet on the days the lock fell — the worst case is the
     * only honest one to hold a debt ceiling against.
     */
    scene = 'landing-offer';
    const onLanding = await page.evaluate(() => {
      const store = window.__manorStore;
      const s = store.getState();
      const rooms = { ...s.manor.rooms };
      const cell = { col: 2, row: 4 };
      delete rooms['2,5'];
      rooms['2,4'] = {
        cardId: 'library', cell, doors: ['N', 'S', 'E', 'W'], solved: false, kind: 'word-web',
      };
      store.setState({ manor: { ...s.manor, rooms, playerCell: cell } });
      const s2 = store.getState();
      store.setState({ draftOffer: null, currencies: { ...s2.currencies, keys: 3 } });
      store.getState().openDraft('N');
      return !!store.getState().draftOffer;
    });
    if (onLanding) {
      await page.waitForSelector('.bp-modal', { timeout: 10000 }).catch(() => {});
      await audit('landing-offer');
      const landing = await stable(page, () => page.evaluate(measureLanding));
      counts.landingStamps += landing?.stamps.length ?? 0;
      findings.push(...judgeLanding(landing));
      if (landing && !quiet) {
        log(`  landing offer: overflows ${landing.overflow}px against a ${landing.budget}px`
          + ` budget of Sanctum copy — KNOWN DEBT, bounded, needs a layout decision`);
      }
      await page.evaluate(() => window.__manorStore.setState({ draftOffer: null }));
      await page.waitForSelector('.bp-modal', { state: 'detached', timeout: 8000 }).catch(() => {});
    } else {
      findings.push(...judgeLanding(null));
    }

    /**
     * ═══ THE VOW, AT EVERY LANDING CELL (round 37) ═══════════════════════════
     * SETUP ONLY: the store stands her on each landing cell in turn with a real
     * placed room, and then the REAL blueprint decides whether there is a
     * control over her head and where it is drawn. Nothing here skips a control
     * the gate is about to make a claim about — the last cell's open state is
     * taken with a REAL POINTER TAP, and the Sanctum screen has to answer it.
     */
    scene = 'landing-cells';
    const landingCells = [];
    const landingCols = await page.evaluate(() => window.__LANDING_COLS__ ?? [1, 2, 3]);
    for (const col of landingCols) {
      const stand = async (doors) => page.evaluate(([c, d]) => {
        const store = window.__manorStore;
        const s = store.getState();
        const cell = { col: c, row: 5 };
        const rooms = { ...s.manor.rooms };
        rooms[`${c},5`] = {
          cardId: 'reading-nook', cell, doors: d, solved: true, kind: 'parlor',
        };
        store.setState({ draftOffer: null, manor: { ...s.manor, rooms, playerCell: cell } });
      }, [col, doors]);
      await stand(['S', 'N']);
      await page.waitForTimeout(160);
      const open = await stable(page, () => page.evaluate(measureLandingCell, col));
      await stand(['S', 'E']);
      await page.waitForTimeout(160);
      const sealed = await stable(page, () => page.evaluate(measureLandingCellSealed));
      landingCells.push({ ...open, ...sealed });
    }
    counts.landingCells += landingCells.length;
    findings.push(...judgeLandingCells(landingCells));
    await audit('landing-cells');
    {
      // …and the WEST landing takes the vow with a real pointer tap, because
      // the middle cell is the one every older driver already stands on.
      const west = landingCols[0];
      await page.evaluate((c) => {
        const store = window.__manorStore;
        const s = store.getState();
        const cell = { col: c, row: 5 };
        const rooms = { ...s.manor.rooms };
        rooms[`${c},5`] = {
          cardId: 'reading-nook', cell, doors: ['S', 'N'], solved: true, kind: 'parlor',
        };
        store.setState({ draftOffer: null, manor: { ...s.manor, rooms, playerCell: cell } });
      }, west);
      await page.waitForTimeout(220);
      const vow = await page.$('.bp-sanctumhit:not(.bp-sanctumhit--sealed) .bp-hit__zone');
      const vbox = vow ? await vow.boundingBox() : null;
      if (vbox) {
        await page.mouse.move(vbox.x + vbox.width / 2, vbox.y + vbox.height / 2);
        await page.mouse.down();
        await page.mouse.up();
        counts.driven += 1;
        const arrived = await page.waitForSelector('.snc-page', { timeout: 8000 }).catch(() => null);
        if (!arrived) {
          findings.push({ klass: 'VOW', scene: 'landing-cells',
            what: `col ${west}, a real tap on the vow`,
            message: 'the tap landed on the control and the Sanctum never opened — the west'
              + ' landing draws a way in that does not go anywhere' });
        }
        // Back to the sheet by ROUTE, never by reloading: a reload restarts the
        // day, and every scene downstream of this one would then be measuring a
        // different app. `--prove` caught precisely that — `room-goes-dark`
        // stopped going red the first time this block navigated instead of
        // routing.
        await page.evaluate(() => { location.hash = '#/'; });
        await page.waitForSelector('svg.bp-sheet', { timeout: 20000 }).catch(() => {});
        await clearMoments(page);
      } else {
        findings.push({ klass: 'VOW', scene: 'landing-cells',
          what: `col ${west}, a real tap on the vow`,
          message: 'no vow control had a box to tap — the driven half of this verdict never ran' });
      }
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

    /**
     * ═══ THE DAY'S ACCOUNT (round 35, hole 1) ═══════════════════════════════
     * Round 19's flagship, and the answer to the single worst negative finding
     * of the cold read: three counter movements neither stranger could explain.
     * A verifier capped `.chr-ledger__list` to 60px so it held 191px of rows
     * AND deleted the closing sentence, and this gate passed both.
     *
     * The charges go in through `applyStepEntry` — the audited path, the same
     * one a move takes — because a column of one entry proves nothing about a
     * column. THE CANDLE IS THEN TAPPED WITH REAL MOUSE INPUT: the game commits
     * on pointerdown/pointerup, and "the sheet opens" is the claim.
     */
    scene = 'ledger';
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 40000 });
    await ensureExploring(page);
    await clearMoments(page);
    await page.evaluate(() => {
      const s = () => window.__manorStore.getState();
      const at = Date.now();
      s().applyStepEntry({ reason: 'move', delta: -2, at, roomKey: '1,0' });
      s().applyStepEntry({ reason: 'move', delta: -2, at, roomKey: '2,0' });
      s().applyStepEntry({ reason: 'move', delta: -7, at, roomKey: '1,3>1,4' });
      s().applyStepEntry({ reason: 'solve', delta: 4, at });
      s().applyStepEntry({ reason: 'hint', delta: -2, at });
      s().applyStepEntry({ reason: 'gift', delta: -1, at });
    });
    await clearMoments(page);
    const candle = await page.evaluate(() => {
      const el = document.querySelector('.chr-steps__open');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!candle) {
      findings.push({ klass: 'ACCOUNT', scene: 'ledger', what: '.chr-steps__open',
        message: 'there is no candle to tap — the day\'s account has no way in' });
    } else {
      await page.mouse.move(candle.x, candle.y);
      await page.mouse.down();
      await page.waitForTimeout(60);
      await page.mouse.up();
      await page.waitForSelector('.chr-ledger__sheet', { timeout: 8000 }).catch(() => {});
      await audit('ledger');
      const account = await stable(page, () => page.evaluate(measureAccount));
      counts.accountRows += account?.rows.length ?? 0;
      findings.push(...judgeAccount(account));
      counts.driven += 1;
      findings.push(...judgeDriven([{
        scene: 'ledger', what: 'the candle', ok: !!account,
        message: account ? 'unrolled the day\'s account beneath it' : 'a real tap on it opened nothing',
      }]));
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForSelector('.chr-ledger', { state: 'detached', timeout: 8000 }).catch(() => {});
    }

    // The standing pages.
    for (const [hash, label] of [['#/journal', 'page:journal'], ['#/sanctum', 'page:sanctum']]) {
      scene = label;
      await page.goto(base + hash, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.page, .jrn-page, .snc', { timeout: 15000 }).catch(() => {});
      await clearMoments(page);
      await audit(label);

      /**
       * ═══ THE LETTER (round 35, hole 2) ══════════════════════════════════
       * The gate walked the Journal on the tab it happens to open on — the one
       * tab that fits — and never touched the Letters tab, where round 32's
       * defect lived: 496px of Posy's welcome letter inside a 328px card under
       * `overflow: hidden`, with the sheet reporting nothing to scroll to. The
       * clause that names the speaking tube was simply unreachable, and the
       * tester who got that build never learned the game's core verb exists.
       *
       * Reached the way she reaches it: a real tap on the tab, a real tap on
       * the seal. Measured at 375x667 on HEAD, the sheet holds 592px in 484 —
       * so it IS scrolling, honestly, and it is declared (the journal grows all
       * volume). What is asserted is the thing a declaration cannot dodge: the
       * letter it pinned to the top is readable whole, to its sign-off.
       */
      if (label !== 'page:journal') continue;
      scene = 'journal:letter';
      const tab = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.jrn-tab')].find((x) => /Letters/.test(x.textContent));
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (tab) {
        await page.mouse.click(tab.x, tab.y);
        await page.waitForTimeout(320);
        const head = await page.evaluate(() => {
          const h = document.querySelector('.jrn-letter__head');
          if (!h) return null;
          const r = h.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        if (head) {
          await page.mouse.click(head.x, head.y);
          await page.waitForSelector('.jrn-letter[data-letter-open="true"]', { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(420);
        }
      }
      await audit('journal:letter');
      const letter = await stable(page, () => page.evaluate(measureLetter));
      counts.letterParas += letter?.paras.length ?? 0;
      findings.push(...judgeLetter(letter));
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
      const pass = await walkOneViewport(browser, base, vp, inject, quiet);
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
          + ` · ${c.copyAssertions} copy lines · ${c.driven} driven taps`
          + ` · ${c.accountRows} account rows · ${c.letterParas} letter paragraphs`
          + ` · ${c.landingStamps} Sanctum stamps · ${c.landingCells} landing cells`
          + ` · ${c.clipLines} key lines`
          + ` · ${mine.length} finding(s)`);
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
    console.log('[glass]        The day’s account adds up on the glass, Posy’s letter is readable to its');
    console.log('[glass]        sign-off, and the landing offer’s overflow is still only the Sanctum copy.');
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
