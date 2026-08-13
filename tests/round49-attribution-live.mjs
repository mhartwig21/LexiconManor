/**
 * tests/round49-attribution-live.mjs — OWNER: A7 (Mystery).
 * THE LIVE EVIDENCE that a page says WHICH ROOM produced it, on the glass.
 *
 * ═══ WHY THIS GATE EXISTS, AND WHAT IT REPLACES ════════════════════════════
 *
 * THE OWNER'S RULING, 13 Aug:
 *
 *   *"I think we want to keep true to Blue Prince where certain clues about the
 *    benefits of rooms aren't immediately apparent. Saying +1 page feeds
 *    everything to the player. But when a page is revealed, the player has to
 *    be able to figure out — oh, this room provided me a page!"*
 *
 * Round 46 printed `+1 page` on the draft card and measured the win: a word
 * room outbid on its face fell 11.3% → 7.5%. That measurement is now retired
 * (`tests/word-room-face.test.ts` says so in its own header and explains why a
 * ratchet on it would fail the build for obeying the owner). It is retired
 * because it measures the wrong thing under the ruling — and a round that
 * retires a gate owes a replacement that can go red.
 *
 * THIS IS THE REPLACEMENT, and it gates the only half of the ruling that CAN be
 * gated. Whether she deduces the rule is the cold read's question and nothing
 * in this repo may pretend to answer it. Whether the game gives her the
 * evidence to deduce it from is checkable, and it is this: **every page-granting
 * event names its room ON THE GLASS as it lands, and again in the journal
 * afterwards.**
 *
 * ═══ THE RULES THIS FILE OBEYS ═════════════════════════════════════════════
 *
 * 1. EVERY VERDICT IS A PAINTED STRING. Round 44 lost three rounds of craft to
 *    a media query that deleted an authored sentence at 375×667 — certified by
 *    reading the string the engine returned and never once painted on the phone
 *    the game is judged on. So nothing here asks the store what it recorded:
 *    the check is `.mom__title` / `.jrn-card__whence` textContent, plus
 *    `elementFromPoint` at the element's own centre so "in the DOM" cannot pass
 *    for "on the glass".
 * 2. THE INSTRUMENT DOES NOT SHARE THE THING'S ASSUMPTIONS (STATUS §3.2). The
 *    expected room name comes from the DECK — the words printed on the card she
 *    drafted — not from the composer under test and not from the flag it read.
 * 3. THE INPUT IS REAL. The solve is dispatched through `applyRoomEvents`,
 *    which is the ONE seam every room adapter's solve travels (app/slices/
 *    room.ts) — it pays the steps, marks the room solved, and emits the same
 *    `room-solved` onto the spine that a traced word emits. Nothing downstream
 *    of that (the watcher, `creditSolve`, the flags, the seal, the journal) is
 *    faked or bypassed, and that whole chain is what is under test.
 *
 * ═══ --prove: THE RED IS THE PREVIOUS COMMIT, NOT A MOCK ═══════════════════
 * `--prove` runs the identical scenarios through the pre-round-49 call shape —
 * `creditSolve(kind, tier, perfect)` with no cell, `collectFragmentForRoom
 * ('mystery')` with no card — which is exactly how the shipped game called them
 * yesterday. Every attribution check must go RED. If any survives, this file is
 * reading something other than the attribution it claims to read.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser instance,
 * closed in a finally. 375x667 FIRST, then 390x844.
 *
 * Run: `node tests/round49-attribution-live.mjs [--prove]`
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROVE = process.argv.includes('--prove');

/**
 * THE EXPECTED NAMES, READ OFF THE DECK ITSELF rather than typed here. If a
 * card is renamed, this file follows it; if the deck stops naming rooms, this
 * file fails to build its own expectations rather than passing on a stale
 * literal. Parsed out of the source because the deck is TS and this harness is
 * a plain node script — the same reason the plate gate reads its chain from a
 * published document rather than importing it.
 */
function deckNames() {
  const src = readFileSync(resolve(ROOT, 'src/engine/manor/deck.ts'), 'utf8');
  const out = new Map();
  for (const m of src.matchAll(/\{\s*id:\s*'([a-z0-9-]+)',\s*name:\s*'([^']+)'/g)) {
    out.set(m[1], m[2]);
  }
  if (out.size < 20) throw new Error(`deck parse found only ${out.size} cards`);
  return out;
}
const NAMES = deckNames();

async function freePort(from = 5401, to = 5459) {
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
  throw new Error(`no free port in ${from}-${to}`);
}

const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;

const tag = PROVE ? '[attrib:prove]' : '[attrib]';
const log = (...a) => console.log(tag, ...a);
const ok = (m) => console.log(tag, '  ✓', m);
let failures = 0;
let reds = 0;
const fail = (m) => { console.error(tag, '  ✗ FAIL:', m); failures++; };
/**
 * TWO KINDS OF VERDICT, AND CONFLATING THEM IS THE FIRST THING THIS FILE GOT
 * WRONG. The first draft inverted EVERY check under --prove and duly reported
 * the gate "not going red" on four assertions that are true under both builds
 * by construction — "the seal gives away not one word of the page" is round
 * 11's rule and has nothing to do with round 49. A harness demanding a red from
 * a check its own injection cannot touch is measuring itself, which is this
 * project's oldest failure wearing an injection flag.
 *
 * `attrib`    — a claim ABOUT THE ATTRIBUTION. Green normally; under --prove it
 *               MUST be false, because that build recorded no room at all.
 * `invariant` — a property the attribution rides beside and must not break (the
 *               seal is painted; a sealed page still quotes nothing; no room is
 *               named that she was never in). Asserted identically in both runs.
 */
const attrib = (cond, good, bad) => {
  if (PROVE) {
    if (cond) fail(`stayed GREEN on the pre-round-49 build: ${good}`);
    else { reds++; console.log(tag, '  ✓ RED as required:', bad); }
    return;
  }
  if (cond) ok(good); else fail(bad);
};
const invariant = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
const serverUp = new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error('vite did not start within 60s')), 60000);
  server.stdout.on('data', (b) => {
    if (String(b).includes('ready in') || String(b).includes('Local:')) { clearTimeout(timer); res(); }
  });
  server.stderr.on('data', (b) => process.stderr.write(`[vite] ${b}`));
  server.on('exit', (c) => { clearTimeout(timer); rej(new Error(`vite exited early (${c})`)); });
});

const SIZES = [{ w: 375, h: 667 }, { w: 390, h: 844 }];

/** Put the seal away, however many are queued behind it. */
async function clearMoments(page) {
  for (let i = 0; i < 12; i++) {
    const seal = await page.$('.mom');
    if (!seal) return;
    const box = await seal.boundingBox();
    if (!box) return;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(200);
  }
}

/**
 * THE SEAL AS THE PLAYER SEES IT — its title, and whether that title is
 * actually PAINTED.
 *
 * `elementFromPoint` is deliberately NOT the test here, and that is a finding
 * rather than a shortcut: over a playfield the seal is `pointer-events: none`
 * by design (round 15 — a tappable card over the board swallowed taps aimed at
 * cells), so the thing answering at its centre is the room underneath and an
 * ownership probe would call every in-room reward invisible. The painted test
 * is therefore the one that catches the failure this repo actually ships: a
 * sentence deleted by a media query at one size. Computed `display`,
 * `visibility` and `opacity` on the TITLE ITSELF, plus a real rect inside the
 * viewport. (The journal's lines are ordinary content and DO get the ownership
 * probe — see `whenceLines`.)
 */
const seal = (page) => page.evaluate(() => {
  const el = document.querySelector('.mom');
  if (!el) return null;
  const t = el.querySelector('.mom__title');
  if (!t) return { title: '', painted: false };
  const r = t.getBoundingClientRect();
  const cs = getComputedStyle(t);
  return {
    title: (t.textContent || '').replace(/\s+/g, ' ').trim(),
    where: (el.querySelector('.mom__where')?.textContent || '').replace(/\s+/g, ' ').trim(),
    painted: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05
      && r.width > 0 && r.height > 0
      && r.top >= 0 && r.bottom <= window.innerHeight
      && r.left >= 0 && r.right <= window.innerWidth,
  };
});

/**
 * EVERY SEAL ONE ACTION PRODUCED, in the order the glass showed them.
 *
 * A solve banks several grants at once — the channel page, the backlog coming
 * out, sometimes a keepsake or a plate — and they queue. Asserting on
 * "whatever is on glass now" made this file read a keepsake and call the
 * attribution missing, which is the instrument being wrong about the build.
 * So the queue is WATCHED rather than sampled: poll until it has been empty for
 * a beat, collecting each distinct card as it presses in. Docked seals cannot
 * be tapped away (see above), so this waits out their own dwell — slow, and the
 * only honest way to see what the player would have seen.
 */
async function drainSeals(page, budgetMs = 20000) {
  const seen = [];
  const t0 = Date.now();
  let emptyFor = 0;
  while (Date.now() - t0 < budgetMs) {
    // eslint-disable-next-line no-await-in-loop
    const s = await seal(page);
    if (s && s.title) {
      if (!seen.some((x) => x.title === s.title)) seen.push(s);
      emptyFor = 0;
    } else {
      emptyFor += 250;
      if (emptyFor >= 1000 && seen.length > 0) break;
      if (emptyFor >= 3000) break;
    }
    // eslint-disable-next-line no-await-in-loop
    await page.mouse.click(4, 4).catch(() => {});   // dismisses a tappable card
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(250);
  }
  return seen;
}

/** The first drained seal whose title matches, or null. */
const sealMatching = (seals, re) => seals.find((s) => re.test(s.title)) ?? null;

/** Every provenance line painted on the journal tab that is open right now. */
const whenceLines = (page) => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.jrn-card__whence, .jrn-sealed__label')) {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2),
    );
    out.push({
      text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
      inView: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0,
      own: !!hit && (el === hit || el.contains(hit)),
    });
  }
  return out;
});

async function openJournal(page, tabWord) {
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForSelector('.jrn-sheet', { timeout: 8000 });
  await page.evaluate((want) => {
    const t = [...document.querySelectorAll('.jrn-tab')]
      .find((x) => new RegExp(want, 'i').test(x.textContent || ''));
    if (t) t.click();
  }, tabWord);
  await page.waitForTimeout(260);
}

/** Stand her in a real room of this card, on a real cell, and walk in. */
async function placeAndEnter(page, cardId, kind, row) {
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    if (s.day?.activeRoom) s.leaveRoom();
  });
  await page.waitForTimeout(200);
  return page.evaluate(({ card, k, r }) => {
    const store = window.__manorStore;
    const s = store.getState();
    const cell = { col: s.manor.playerCell.col, row: r };
    const key = `${cell.col},${cell.row}`;
    store.setState({
      manor: {
        ...s.manor,
        playerCell: { ...cell },
        rooms: {
          ...s.manor.rooms,
          [key]: { cardId: card, cell, doors: ['N', 'S', 'E', 'W'], solved: false, kind: k },
        },
      },
    });
    const s2 = store.getState();
    s2.applyStepEntry({ reason: 'snack', delta: 200, at: Date.now() });
    s2.enterRoom(key);
    return key;
  }, { card: cardId, k: kind, r: row });
}

let browser;
try {
  await serverUp;
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const size of SIZES) {
    const label = `${size.w}x${size.h}`;
    log('─'.repeat(64));
    log(label, PROVE ? '(pre-round-49 call shape: no room recorded)' : '');
    const context = await browser.newContext({
      viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.bp-scene__title', { timeout: 20000 });

    // A real day, started the way a player starts one.
    await page.click('.bp-btn--seal');
    await page.waitForSelector('.chr-scene', { timeout: 8000 });
    await page.click('.chr-scene__btn');
    for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
      const primary = await page.$('.dlg-choice--primary');
      if (primary) { await primary.click(); await page.waitForTimeout(180); continue; }
      const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
      if (choice) { await choice.click(); await page.waitForTimeout(180); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      await page.waitForTimeout(160);
    }
    await page.waitForFunction(
      () => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 },
    );
    await clearMoments(page);

    /* ══ 1. A WORD ROOM SOLVED — the page it hands over says whose it is ════
       The Long Gallery rather than the Gallery, on purpose: they are one puzzle
       kind and two cards, so a seal reading "The Gallery" here would be the
       right kind and the wrong room, and would teach her to draft the wrong
       card. That is exactly the case a kind-keyed attribution would pass.

       THE NAMES ARE MATCHED WITHOUT THEIR ARTICLE. Every card is "The …", and
       the copy correctly writes "the Long Gallery" inside a sentence and "The
       Long Gallery gives up…" at the head of one; a matcher that demanded the
       capital would fail the journal for being grammatical. */
    const bare = (id) => NAMES.get(id).replace(/^The /, '');
    const LONG_GALLERY = bare('long-gallery');
    const GALLERY = bare('gallery');
    const ARCHIVE = bare('archive');
    const DARKROOM = bare('darkroom');

    await placeAndEnter(page, 'long-gallery', 'twistle', 3);
    await clearMoments(page);
    await page.evaluate((prove) => {
      const s = window.__manorStore.getState();
      // THE ONE SEAM EVERY ADAPTER'S SOLVE TRAVELS. Under --prove the room is
      // credited the pre-round-49 way: creditSolve with no cell, which is how
      // the shipped game called it yesterday.
      if (prove) {
        const active = s.day.activeRoom;
        s.creditSolve(active.kind, active.tier, false);
      } else {
        s.applyRoomEvents([{ type: 'solved', perfect: false }], { status: 'solved', perfect: false });
      }
    }, PROVE);

    const solveSeals = await drainSeals(page);
    const pageSeal = sealMatching(solveSeals, /gives up|line of his|engraving|clue fragment/i);
    const titles = () => JSON.stringify(solveSeals.map((s) => s.title));
    attrib(!!pageSeal && pageSeal.title.includes(LONG_GALLERY),
      `${label}: the page a solve hands over names the ${LONG_GALLERY} on the seal — “${pageSeal?.title}”`,
      `${label}: no seal from a solved room named the room. Seals shown: ${titles()}`);
    invariant(!pageSeal || pageSeal.painted,
      `${label}: …and that title is painted, inside the viewport`,
      `${label}: the arrival seal is in the DOM and not painted (${JSON.stringify(pageSeal)})`);
    // It must not name the WRONG room of the same kind.
    invariant(!pageSeal || !new RegExp(`\\b${GALLERY}\\b`).test(pageSeal.title.replace(LONG_GALLERY, '')),
      `${label}: …and it is the card she drafted, not the other room of that kind`,
      `${label}: the seal named the wrong room of the same kind — “${pageSeal?.title}”`);

    /* ══ 2. …AND THE JOURNAL STILL SAYS SO TOMORROW ════════════════════════
       The seal is 5.6 seconds long and she may have been mid-tap. The rule has
       to survive a night's sleep, so the filed page carries it too. */
    await openJournal(page, 'word');
    const wordTab = await whenceLines(page);
    const wordText = () => JSON.stringify(wordTab.map((l) => l.text)).slice(0, 240);
    attrib(wordTab.some((l) => l.text.includes(LONG_GALLERY)),
      `${label}: the filed page still names the ${LONG_GALLERY} in the journal`,
      `${label}: no line on the Word tab names the room — the rule dies with the seal (lines: ${wordText()})`);
    // NOT vacuous: an `every` over an empty list is true, so the population is
    // required first. Under --prove there is no such line and the check is
    // skipped out loud rather than passing on nothing.
    const namedLines = wordTab.filter((l) => l.text.includes(LONG_GALLERY));
    if (namedLines.length === 0) log('  · (no provenance line to check for paint)');
    else {
      invariant(namedLines.every((l) => l.own && l.inView),
        `${label}: …and that line is painted on the glass, unobstructed`,
        `${label}: the journal's provenance line is in the DOM and not on the glass`);
    }

    /* ══ 3. A VIOLET ROOM'S TORN LEAF names the room she walked into ═══════ */
    await page.evaluate(() => { location.hash = '#/manor'; });
    await page.waitForTimeout(400);
    await clearMoments(page);
    await page.evaluate((prove) => {
      const s = window.__manorStore.getState();
      if (prove) s.collectFragmentForRoom('mystery');
      else s.collectFragmentForRoom('mystery', 'archive');
    }, PROVE);
    const leafSeals = await drainSeals(page);
    const leafSeal = sealMatching(leafSeals, /not yet made out/i);
    attrib(!!leafSeal && leafSeal.title.includes(ARCHIVE),
      `${label}: a torn leaf names the ${ARCHIVE} as it lands — “${leafSeal?.title}”`,
      `${label}: the torn leaf's seal named no room. Seals shown: ${JSON.stringify(leafSeals.map((s) => s.title))}`);
    // Round 11's rule is not traded away for the attribution: still no quote.
    invariant(!leafSeal || !/breath|nothing|remains/i.test(leafSeal.title),
      `${label}: …and it still gives away not one word of the page`,
      `${label}: the sealed arrival leaked its own contents: “${leafSeal?.title}”`);

    /* ══ 4. THE ROOM THAT MAKES IT OUT IS A DIFFERENT ROOM, AND IS CREDITED ═
       This is the half COMPREHENSION found nobody had learned: solving a word
       game is what makes the smudged backlog speak. If the Darkroom's work were
       credited to the Archive she would deduce precisely the wrong rule. */
    await placeAndEnter(page, 'darkroom', 'cipher', 2);
    await clearMoments(page);
    await page.evaluate((prove) => {
      const s = window.__manorStore.getState();
      if (prove) {
        const active = s.day.activeRoom;
        s.creditSolve(active.kind, active.tier, false);
      } else {
        s.applyRoomEvents([{ type: 'solved', perfect: false }], { status: 'solved', perfect: false });
      }
    }, PROVE);
    const outSeals = await drainSeals(page);
    const madeOut = sealMatching(outSeals, /makes out|made out/i);
    attrib(!!madeOut && madeOut.title.includes(DARKROOM),
      `${label}: the room that MAKES OUT the backlog is credited — “${madeOut?.title}”`,
      `${label}: the made-out seal named no room. Seals shown: ${JSON.stringify(outSeals.map((s) => s.title))}`);
    invariant(!madeOut || !madeOut.title.includes(ARCHIVE),
      `${label}: …and it is not credited to the room that filed the leaf`,
      `${label}: the deciphering was credited to the ${ARCHIVE}, which teaches the wrong rule`);
    invariant(!madeOut || madeOut.painted,
      `${label}: …and that title is painted, inside the viewport`,
      `${label}: the made-out seal is in the DOM and not painted (${JSON.stringify(madeOut)})`);

    // …and the journal carries BOTH rooms on that one page.
    await openJournal(page, 'word');
    const both = await whenceLines(page);
    attrib(both.some((l) => l.text.includes(ARCHIVE) && l.text.includes(DARKROOM)),
      `${label}: the journal keeps both rooms on the leaf — carried out of one, made out in the other`,
      `${label}: no journal line carries both rooms (lines: ${JSON.stringify(both.map((l) => l.text)).slice(0, 240)})`);

    /* ══ 5. NOTHING IS INVENTED ════════════════════════════════════════════
       Testimony spoken in a parlor has no room, and the journal must print no
       provenance for it rather than guessing one off the authored `source`
       line — which is where the writing IS in the house, not where she got it.
       This one is NOT inverted under --prove: an invented room would be worse
       under either build, so it is a plain assertion in both. */
    await page.evaluate(() => { window.__manorStore.getState().fileFragment('v1-t2'); });
    await page.waitForTimeout(400);
    await clearMoments(page);
    await openJournal(page, 'testimony');
    const testimony = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.jrn-card')]
        .find((c) => /Bramble/i.test(c.textContent || ''));
      return card ? !!card.querySelector('.jrn-card__whence') : null;
    });
    if (testimony === true) fail(`${label}: testimony from a parlor printed a room it never came from`);
    else if (testimony === null) fail(`${label}: the testimony card never rendered`);
    else ok(`${label}: testimony from a parlor claims no room — nothing is invented`);

    if (errors.length) fail(`${label}: console/page errors: ${errors.slice(0, 3).join(' | ')}`);
    await context.close();
  }
} catch (e) {
  fail(`threw: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

if (PROVE) {
  log(failures
    ? `DONE WITH ${failures} FAILURE(S) — the gate did not go red where it must`
    : `DONE — every attribution check went RED on the pre-round-49 build (${reds} reds)`);
} else {
  log(failures
    ? `DONE WITH ${failures} FAILURE(S)`
    : 'DONE — every page names the room that produced it, on the glass and in the journal, at both sizes');
}
process.exit(failures ? 1 : 0);
