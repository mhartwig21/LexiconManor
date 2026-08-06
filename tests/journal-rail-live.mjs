/**
 * tests/journal-rail-live.mjs — OWNER: A7 (Mystery). THE LIVE EVIDENCE for the
 * round-6 §11 gap and for the round-10 design change.
 *
 * ═══ THE DEFECT BEING REGRESSION-TESTED (AAA 11.2 / 11.3) ═══
 * The journal's Sanctum control — "Take it to the Sanctum" — was the LAST child
 * of `.jrn-sheet`, a panel that scrolls internally inside a `position: fixed`
 * page. On a 390×844 screen with anything filed above it, the button sat below
 * the fold: `document.elementFromPoint` at its centre returned the sheet (or
 * nothing at all), and every screenshot of the page looked perfect. §0.1.7 is
 * explicit that a screenshot is not evidence for §11, so this drives the real
 * app in a real browser and asks the only question that matters.
 *
 * It also proves the round-10 loop end to end, because that too is a §11 shape
 * (a reward that only exists on a screen the player has no reason to open):
 * a fragment filed by ENTERING a violet room is on the glass and MARKED
 * undeciphered, and solving a room makes it out — verified by reading the DOM,
 * not the store.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser
 * instance, closed in a finally. 390×844.
 *
 * Run: `node tests/journal-rail-live.mjs`   (spawns its own vite dev server)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function freePort(from = 5261, to = 5320) {
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

const log = (...a) => console.log('[journal-rail]', ...a);
const ok = (m) => console.log('[journal-rail]   ✓', m);
let failures = 0;
const fail = (m) => { console.error('[journal-rail]   ✗ FAIL:', m); failures++; };
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };

/** The §0.4.5 artifact: one row per surface. */
const table = [];

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

let browser;
try {
  await serverUp;
  log('dev server up on', BASE);

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const boxOf = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, sel);

  /** Centre + the four inset corners (AAA 11.2 asks for all five). */
  const probePoints = (box, inset = 5) => ([
    ['centre', box.x + box.w / 2, box.y + box.h / 2],
    ['top-left', box.x + inset, box.y + inset],
    ['top-right', box.x + box.w - inset, box.y + inset],
    ['bottom-left', box.x + inset, box.y + box.h - inset],
    ['bottom-right', box.x + box.w - inset, box.y + box.h - inset],
  ]);

  /** Does `sel` answer at all five probe points, and is it above the fold? */
  async function hitTest(name, sel) {
    const box = await boxOf(sel);
    if (!box) { fail(`${name}: ${sel} is not in the DOM at all`); return { box: null }; }
    const failedBefore = failures;
    let answered = 'itself';
    for (const [where, x, y] of probePoints(box)) {
      // eslint-disable-next-line no-await-in-loop
      const hit = await page.evaluate(([s, px, py]) => {
        const target = document.querySelector(s);
        const el = document.elementFromPoint(px, py);
        if (!el) return { none: true };
        const cls = typeof el.className === 'string' ? el.className : (el.className?.baseVal ?? '');
        return { itself: el === target || target.contains(el), tag: el.tagName.toLowerCase(), cls };
      }, [sel, x, y]);
      if (hit.none) {
        fail(`${name}: elementFromPoint at the ${where} returned NULL — the control is outside the viewport (AAA 11.3)`);
        answered = 'null';
      } else if (!hit.itself) {
        fail(`${name}: the ${where} is answered by ${hit.tag}.${hit.cls}, not the control (AAA 11.2)`);
        answered = `${hit.tag}.${hit.cls}`;
      }
    }
    const fold = await page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, vh: window.innerHeight, w: r.width, h: r.height };
    }, sel);
    const above = fold.top >= 0 && fold.bottom <= fold.vh;
    check(above,
      `${name}: inside the visual viewport (${Math.round(fold.top)}–${Math.round(fold.bottom)} of ${fold.vh})`,
      `${name}: NOT inside the visual viewport (${Math.round(fold.top)}–${Math.round(fold.bottom)} of ${fold.vh}) — below the fold (AAA 11.3)`);
    check(fold.w >= 44 && fold.h >= 44,
      `${name}: meets the 44×44 floor (${Math.round(fold.w)}×${Math.round(fold.h)}, AAA 6.19)`,
      `${name}: ${Math.round(fold.w)}×${Math.round(fold.h)} is under the 44×44 tap floor (AAA 6.19)`);
    if (failures === failedBefore) ok(`${name}: answers at its centre and all four inset corners`);
    return { box, answered, above };
  }

  /* --- the walk ----------------------------------------------------------- */

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title', { timeout: 20000 });

  // Start the day and get out onto the blueprint (the real controls).
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene', { timeout: 8000 });
  await page.click('.chr-scene__btn');
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const primary = await page.$('.dlg-choice--primary');
    if (primary) { await primary.click(); await page.waitForTimeout(200); continue; }
    const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (choice) { await choice.click(); await page.waitForTimeout(200); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await page.waitForTimeout(180);
  }
  await page.waitForFunction(
    () => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 },
  );

  // ── The state the defect needed: a FULL journal (so the sheet scrolls) and
  //    the player standing at the landing (so the Sanctum control is live).
  //    Fragments arrive through the REAL slice actions, sealed exactly as a
  //    violet room files them.
  await page.evaluate(() => {
    const store = window.__manorStore;
    const s = store.getState();
    // A journal with real weight in it — that is the whole shape of the bug:
    // a short page hides nothing. Every ENGRAVING (and three other documents)
    // is filed SEALED, exactly as walking into a violet room files them; the
    // rest arrived by letter or testimony and are legible.
    const sealed = ['v1-d1', 'v1-d2', 'v1-t2', 'v1-e1', 'v1-e2', 'v1-e3', 'v1-e4', 'v1-e5', 'v1-e6'];
    for (const id of sealed) s.fileFragment(id, { sealed: true });
    for (const id of ['v1-d3', 'v1-d4', 'v1-d5', 'v1-d6', 'v1-t1', 'v1-t3', 'v1-t4', 'v1-t5']) {
      s.fileFragment(id);
    }
    const cell = { col: 2, row: 5 };
    store.setState({
      manor: {
        ...store.getState().manor,
        playerCell: cell,
        rooms: {
          ...store.getState().manor.rooms,
          '2,5': { cardId: 'reading-nook', cell, doors: ['N', 'S'], solved: false, kind: 'parlor' },
        },
      },
    });
  });
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForSelector('.jrn-sheet', { timeout: 8000 });
  await page.waitForTimeout(250);

  // 1. The sheet really does overflow — otherwise the regression test proves
  //    nothing, because a short page hides nothing.
  const overflow = await page.evaluate(async () => {
    const tabs = [...document.querySelectorAll('.jrn-tab')];
    let worst = { label: '', over: 0, scrollH: 0, clientH: 0 };
    for (const tab of tabs) {
      tab.click();
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 120));
      const sheet = document.querySelector('.jrn-sheet');
      const over = sheet.scrollHeight - sheet.clientHeight;
      if (over > worst.over) {
        worst = {
          label: (tab.textContent || '').trim(),
          over, scrollH: sheet.scrollHeight, clientH: sheet.clientHeight,
        };
      }
    }
    tabs[0].click();
    return worst;
  });
  check(overflow.over > 20,
    `the sheet overflows on "${overflow.label}" (${overflow.scrollH}px of content in ${overflow.clientH}px) — the shape that buried the control`,
    `no tab's sheet overflows (worst ${overflow.scrollH} vs ${overflow.clientH}) — this run cannot prove the fix; seed more fragments`);
  await page.waitForTimeout(200);

  // 2. THE HIT TEST, at scroll 0 (the round-6 gap).
  const rail = await hitTest('Sanctum control (rail, scroll 0)', '.jrn-nudge__link');
  table.push({
    surface: '/journal · Word tab (scroll 0)',
    control: '.jrn-nudge__link',
    hit: rail.answered ?? 'missing',
    fold: rail.above ? 'above' : 'BELOW',
  });

  // 3. …and it must stay uncovered at EVERY scroll position of the panel it
  //    belongs to (AAA 11.3's second clause), including the bottom.
  await page.evaluate(() => {
    const sheet = document.querySelector('.jrn-sheet');
    sheet.scrollTop = sheet.scrollHeight;
  });
  await page.waitForTimeout(150);
  const railScrolled = await hitTest('Sanctum control (sheet scrolled to bottom)', '.jrn-nudge__link');
  table.push({
    surface: '/journal · Word tab (sheet at bottom)',
    control: '.jrn-nudge__link',
    hit: railScrolled.answered ?? 'missing',
    fold: railScrolled.above ? 'above' : 'BELOW',
  });

  // 4. It also has to survive a TAB CHANGE — the rail is outside the sheet, so
  //    it is the one control on this page that must not depend on the tab.
  for (const label of ['Engravings', 'Testimony', 'Letters']) {
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((t) => {
      for (const b of document.querySelectorAll('.jrn-tab')) {
        if ((b.textContent || '').trim().startsWith(t)) { b.click(); return; }
      }
    }, label);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(180);
    // eslint-disable-next-line no-await-in-loop
    const r = await hitTest(`Sanctum control (${label} tab)`, '.jrn-nudge__link');
    table.push({
      surface: `/journal · ${label} tab`,
      control: '.jrn-nudge__link',
      hit: r.answered ?? 'missing',
      fold: r.above ? 'above' : 'BELOW',
    });
  }

  // 5. THE ROUND-10 LOOP, read off the glass.
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.jrn-tab')) {
      if ((b.textContent || '').trim().startsWith('Engravings')) { b.click(); return; }
    }
  });
  await page.waitForTimeout(200);
  const sealedBefore = await page.evaluate(() => ({
    cards: document.querySelectorAll('.jrn-card--sealed').length,
    labels: document.querySelectorAll('.jrn-sealed__label').length,
    backlog: (document.querySelector('.jrn-rail__count')?.textContent || '').trim(),
    plate: Boolean(document.querySelector('.jrn-plate')),
  }));
  check(sealedBefore.cards > 0 && sealedBefore.labels > 0,
    `entering filed ${sealedBefore.cards} document(s), each visibly MARKED undeciphered on the card`,
    'a fragment filed by entering a violet room is not marked undeciphered anywhere on the glass');
  check(sealedBefore.backlog !== '',
    `the footer rail names the backlog out loud ("${sealedBefore.backlog}" pages not yet made out)`,
    'the footer rail does not name the undeciphered backlog');
  check(!sealedBefore.plate,
    'the alphabet plate is still blank — a sealed engraving carries no constraint yet',
    'the alphabet plate is populated from engravings the player cannot read yet');

  // Solve a tier-3 room, through the real spine (app/slices/room.ts's event).
  await page.evaluate(() => {
    window.__manorStore.getState().recordEvent({
      type: 'room-solved', cellKey: '2,5', kind: 'word-web', tier: 3, perfect: false,
    });
  });
  await page.waitForTimeout(300);
  const sealedAfter = await page.evaluate(() => ({
    cards: document.querySelectorAll('.jrn-card--sealed').length,
    backlog: (document.querySelector('.jrn-rail__count')?.textContent || '').trim(),
  }));
  check(sealedAfter.cards < sealedBefore.cards,
    `solving made pages out on the glass (${sealedBefore.cards} sealed → ${sealedAfter.cards})`,
    `solving changed nothing on the glass (${sealedBefore.cards} sealed → ${sealedAfter.cards})`);
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.jrn-tab')) {
      if ((b.textContent || '').trim().startsWith('The Word')) { b.click(); return; }
    }
  });
  await page.waitForTimeout(200);
  const plateAfter = await page.evaluate(() => Boolean(document.querySelector('.jrn-plate')));
  check(plateAfter,
    'the alphabet plate appears once an engraving has been MADE OUT — solving is what narrows it',
    'the alphabet plate never appeared even after a solve made an engraving out');
  table.push({
    surface: '/journal · sealed → made out',
    control: '.jrn-card--sealed',
    hit: `${sealedBefore.cards} → ${sealedAfter.cards}`,
    fold: 'n/a',
  });

  // 6. THE DESTINATION (AAA 11.6): the control goes where its label says.
  const link = await page.$('.jrn-nudge__link');
  if (!link) fail('the Sanctum control vanished before the destination check');
  else {
    await link.click();
    await page.waitForTimeout(400);
    const where = await page.evaluate(() => location.hash);
    check(where.includes('/sanctum'),
      `"Take it to the Sanctum" lands on ${where}`,
      `"Take it to the Sanctum" landed on ${where}, not /sanctum (AAA 11.6)`);
    table.push({ surface: '/journal → /sanctum', control: '.jrn-nudge__link', hit: where, fold: 'n/a' });
  }

  // 7. And the way home still works from the journal (AAA 11.1/11.2).
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForSelector('.jrn-sheet', { timeout: 8000 });
  await page.waitForTimeout(200);
  const back = await hitTest('journal back control', '.backlink');
  table.push({
    surface: '/journal · exit', control: '.backlink',
    hit: back.answered ?? 'missing', fold: back.above ? 'above' : 'BELOW',
  });

  if (errors.length) fail('console/page errors: ' + errors.slice(0, 4).join(' | '));

  log('');
  log('| surface | control | hit-test | fold |');
  log('|---|---|---|---|');
  for (const r of table) log(`| ${r.surface} | ${r.control} | ${r.hit} | ${r.fold} |`);
} catch (e) {
  fail(`threw: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

log(failures ? `DONE WITH ${failures} FAILURE(S)` : 'DONE — the journal rail is reachable and solving is visibly what makes a page out');
process.exit(failures ? 1 : 0);
