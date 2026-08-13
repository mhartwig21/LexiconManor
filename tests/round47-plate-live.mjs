/**
 * tests/round47-plate-live.mjs — OWNER: A7 (Mystery). THE LIVE EVIDENCE that
 * the field is ON THE GLASS, and that it is the number the dictionary gives.
 *
 * ═══ WHY THIS EXISTS ═══════════════════════════════════════════════════════
 * This repo's fourth standing failure mode is authored copy that ships
 * invisible — a sentence certified by reading the string the engine returns and
 * never once painted on the phone the game is judged on (round 44 lost three
 * rounds of Gallery craft to one media query). The plate's count is computed at
 * content-build time, carried in through the lazy content chunk, and rendered
 * inside a tab of an internally scrolled sheet: three separate places it could
 * be true and unseen.
 *
 * So every verdict here is a PAINTED STRING. It drives a real day in a real
 * Edge at both phone sizes, files engravings through the real slice actions in
 * the volume's own reveal order, and reads `.jrn-standing` off the DOM after
 * each one — against the chain `docs/MANOR_DESIGN.md` §7 publishes:
 *
 *     15,232 → 6,575 → 208 → 146 → 56 → 11 → 5 → 3 → 2 → 1
 *
 * It never asks the store what it computed; the store is where both halves of
 * a wrong number agree (round 45's rule, in the mystery's currency). It also
 * holds the two rules the surface is defined by:
 *   SILENT — nothing is painted while no engraving is made out. 171,755 is a
 *            true number and a useless one, and it is not printed.
 *   SEALED — a filed-but-smudged engraving moves the number by nothing, and
 *            deciphering it is what makes the field appear. That is where
 *            "solving matters" has had its teeth since round 10.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser
 * instance, closed in a finally. 375x667 FIRST, then 390x844.
 *
 * Run: `node tests/round47-plate-live.mjs`   (spawns its own vite dev server)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function freePort(from = 5341, to = 5399) {
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

const log = (...a) => console.log('[plate]', ...a);
const ok = (m) => console.log('[plate]   ✓', m);
let failures = 0;
const fail = (m) => { console.error('[plate]   ✗ FAIL:', m); failures++; };
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };

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

/** The published chain, in the volume's own reveal order. */
const CHAIN = [
  ['v1-e1', '15,232'],
  ['v1-e7', '6,575'],
  ['v1-e2', '208'],
  ['v1-e8', '146'],
  ['v1-e9', '56'],
  ['v1-e3', '11'],
  ['v1-e10', '5'],
  ['v1-e5', '3'],
  ['v1-e4', '2'],
  ['v1-e6', '1'],
];

const SIZES = [{ w: 375, h: 667 }, { w: 390, h: 844 }];

let browser;
try {
  await serverUp;
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const size of SIZES) {
    const label = `${size.w}x${size.h}`;
    log('─'.repeat(60));
    log(label);
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

    const openWordTab = async () => {
      await page.evaluate(() => { location.hash = '#/journal'; });
      await page.waitForSelector('.jrn-sheet', { timeout: 8000 });
      await page.evaluate(() => {
        const tab = [...document.querySelectorAll('.jrn-tab')]
          .find((t) => /word/i.test(t.textContent || ''));
        if (tab) tab.click();
      });
      await page.waitForTimeout(220);
    };
    /** What the glass says, or null when the surface is silent. */
    const painted = () => page.evaluate(() => {
      const el = document.querySelector('.jrn-standing');
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2),
      );
      return {
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        n: (el.querySelector('.jrn-standing__n')?.textContent || '').trim(),
        // Painted means ON the glass: inside the visual viewport, with nothing
        // else answering at its own centre.
        inView: r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0,
        own: !!hit && (el === hit || el.contains(hit)),
      };
    });

    // 1. SILENT with nothing made out.
    await openWordTab();
    check((await painted()) === null,
      `${label}: says nothing before a single engraving is made out`,
      `${label}: printed a field with nothing legible — there is no honest number yet`);

    // 2. A SEALED engraving moves nothing — filed by walking into a violet room.
    await page.evaluate(() => {
      window.__manorStore.getState().fileFragment('v1-e1', { sealed: true });
    });
    await openWordTab();
    check((await painted()) === null,
      `${label}: a SEALED engraving moves the field by nothing`,
      `${label}: a smudged page printed a field — the seal has stopped biting`);

    // 3. …and making it out is what puts the field on the glass.
    await page.evaluate(() => { window.__manorStore.getState().decipherFragments(1); });
    await openWordTab();
    const first = await painted();
    check(!!first && first.n === CHAIN[0][1],
      `${label}: deciphering it paints ${CHAIN[0][1]} — solving is what moves the plate`,
      `${label}: after deciphering, the glass reads "${first?.n ?? '(nothing)'}" — expected ${CHAIN[0][1]}`);
    check(!!first && first.own && first.inView,
      `${label}: …and the line is on the glass, unobstructed`,
      `${label}: the line is in the DOM but not on the glass (inView ${first?.inView}, own ${first?.own})`);

    // 4. THE CHAIN, one engraving at a time, read off the glass.
    let seen = first && first.n === CHAIN[0][1] ? 1 : 0;
    for (const [id, expected] of CHAIN.slice(1)) {
      // eslint-disable-next-line no-await-in-loop
      await page.evaluate((frag) => { window.__manorStore.getState().fileFragment(frag); }, id);
      // eslint-disable-next-line no-await-in-loop
      await openWordTab();
      // eslint-disable-next-line no-await-in-loop
      const p = await painted();
      if (!p) { fail(`${label}: nothing painted after ${id} — expected ${expected}`); continue; }
      check(p.n === expected,
        `${label}: after ${id} the glass reads ${p.n} still standing`,
        `${label}: after ${id} the glass reads "${p.n}" — the dictionary says ${expected}`);
      check(p.own && p.inView,
        `${label}: …and it is on the glass, unobstructed`,
        `${label}: after ${id} the line is in the DOM but not on the glass (inView ${p.inView}, own ${p.own})`);
      if (p.n === expected) seen++;
    }
    check(seen === CHAIN.length,
      `${label}: every step of the published chain is on the glass (${seen}/${CHAIN.length})`,
      `${label}: only ${seen} of ${CHAIN.length} chain steps painted`);

    // 5. …and the last word left is spoken in the singular ("1 words" is the
    //    round-42 lesson, and one is now the most important number on the tab).
    const last = await painted();
    check(!!last && /^1 word in the dictionary still fits it$/.test(last.text),
      `${label}: the last word standing is spoken in the singular`,
      `${label}: singular copy is wrong at one word — "${last ? last.text : '(nothing)'}"`);

    if (errors.length) fail(`${label}: console/page errors: ${errors.slice(0, 3).join(' | ')}`);
    await context.close();
  }
} catch (e) {
  fail(`threw: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

log(failures
  ? `DONE WITH ${failures} FAILURE(S)`
  : 'DONE — the field is on the glass at both sizes, and it is the dictionary’s own number');
process.exit(failures ? 1 : 0);
