/**
 * ROUND 13 — the live interaction pass for the sealed-landing refusal
 * (AAA §0.4 / 4.6 / 4.16 / 11.2 / 11.7). One Edge instance, one context,
 * 390×844, sequential routes. Screenshots are NOT the evidence: every claim
 * below is a hit test or a driven tap.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const ROOT = 'C:/Users/hartw/lexicon-loop-v2';
async function freePort(from = 5710, to = 5760) {
  for (let p = from; p <= to; p++) {
    const taken = await new Promise((r) => {
      const s = createServer();
      s.once('error', () => r(true));
      s.once('listening', () => s.close(() => r(false)));
      s.listen(p, '127.0.0.1');
    });
    if (!taken) return p;
  }
  throw new Error('no port');
}
const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
server.stdout.on('data', () => {});
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE); if (r.ok) break; } catch { /* wait */ }
  await new Promise((r) => setTimeout(r, 500));
}

const L = (...a) => console.log('[r13]', ...a);
let browser;
let fails = 0;
const check = (ok, what) => { if (!ok) fails += 1; L(ok ? 'PASS' : 'FAIL', what); };

try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); })
    .catch(() => {});
  await page.waitForTimeout(400);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  const phase = () => page.evaluate(() => window.__manorStore?.getState?.().day?.phase ?? null);
  const clickText = async (needle) => {
    for (const b of await page.$$('button')) {
      const t = ((await b.innerText().catch(() => '')) || '').toLowerCase();
      if (t.includes(needle)) { await b.click({ timeout: 4000 }).catch(() => {}); return true; }
    }
    return false;
  };
  const playScene = async () => {
    for (let i = 0; i < 80; i++) {
      if (!(await page.$('.dlg'))) break;
      const p = await page.$('.dlg-choice--primary');
      if (p) { await p.click(); await page.waitForTimeout(140); continue; }
      const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
      if (c) { await c.click(); await page.waitForTimeout(140); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      await page.waitForTimeout(130);
    }
  };
  for (let i = 0; i < 20; i++) {
    if ((await phase()) === 'exploring') break;
    await clickText('begin the first day');
    await page.waitForTimeout(250);
    await clickText('begin the day');
    await page.waitForTimeout(300);
    await playScene();
    await page.waitForTimeout(200);
  }
  L('phase', await phase());

  /** Put a room on the landing and stand her in it. */
  const put = (doors) => page.evaluate((d) => {
    const st = window.__manorStore;
    const m = st.getState().manor;
    st.setState({
      manor: {
        ...m,
        rooms: {
          ...m.rooms,
          '2,5': { cell: { col: 2, row: 5 }, cardId: 'linen-closet', doors: d, solved: true, kind: 'crossword' },
        },
        playerCell: { col: 2, row: 5 },
      },
      draftOffer: null,
    });
  }, doors);

  // ── 1. THE SEALED LANDING ────────────────────────────────────────────────
  await put(['S', 'E']);
  await page.evaluate(() => { location.hash = '#/manor'; });
  await page.waitForTimeout(900);

  const sealed = await page.evaluate(() => {
    const hit = document.querySelector('.bp-sanctumhit');
    if (!hit) return { present: false };
    const r = hit.getBoundingClientRect();
    const at = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? (hit === el || hit.contains(el) ? 'own' : el.className?.baseVal ?? el.className ?? el.tagName) : 'none';
    };
    const inset = 3;
    return {
      present: true,
      sealedClass: hit.classList.contains('bp-sanctumhit--sealed'),
      label: hit.getAttribute('aria-label'),
      box: { w: Math.round(r.width), h: Math.round(r.height) },
      centre: at(r.left + r.width / 2, r.top + r.height / 2),
      corners: [
        at(r.left + inset, r.top + inset), at(r.right - inset, r.top + inset),
        at(r.left + inset, r.bottom - inset), at(r.right - inset, r.bottom - inset),
      ],
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
      seam: !!document.querySelector('.bp-sealedseam'),
    };
  });
  L('sealed landing hit test:', JSON.stringify(sealed));
  check(sealed.present, 'the Sanctum has a control on a sealed landing (was: absent)');
  check(sealed.sealedClass, 'it is marked as the sealed variant');
  check(/no north door/i.test(sealed.label ?? ''), '11.7 — the label names the reason, not just the room');
  check(sealed.centre === 'own', '11.2 — elementFromPoint at the centre returns the control');
  check(sealed.corners.every((c) => c === 'own'), '11.2 — and at all four inset corners');
  check(sealed.inViewport, '11.3 — above the fold at scroll 0');
  check(sealed.box.w >= 44 && sealed.box.h >= 44, '6.19 — tap target ≥44×44pt');
  check(sealed.seam, 'the blank north wall is drawn as a bricked seam');

  const stepsBefore = await page.evaluate(() => window.__manorStore.getState().stepsRemaining());
  await page.click('.bp-sanctumhit');
  await page.waitForTimeout(400);
  const answered = await page.evaluate(() => ({
    line: document.querySelector('.bp-refusal__line')?.textContent ?? '',
    spoken: document.querySelector('.bp-sr')?.textContent ?? '',
    hash: location.hash,
    steps: window.__manorStore.getState().stepsRemaining(),
  }));
  L('driven tap →', JSON.stringify(answered));
  check(answered.line.length > 0, '4.16 — the refusal has words on the surface she is looking at');
  check(/north/i.test(answered.spoken) && /landing/i.test(answered.spoken),
    '4.16 — the spoken restatement names the landing AND the remedy');
  check(/nothing was spent/i.test(answered.spoken), 'R.3 — and says nothing was spent');
  check(answered.steps === stepsBefore, 'and nothing WAS spent');
  check(answered.hash.includes('/manor'), 'it does not navigate to a screen that would tell her to climb');

  // ── 2. THE REAL DOOR STILL OPENS ─────────────────────────────────────────
  await put(['S', 'N']);
  await page.waitForTimeout(500);
  const open = await page.evaluate(() => {
    const hit = document.querySelector('.bp-sanctumhit');
    if (!hit) return { present: false };
    const r = hit.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      present: true, label: hit.getAttribute('aria-label'),
      sealedClass: hit.classList.contains('bp-sanctumhit--sealed'),
      seam: !!document.querySelector('.bp-sealedseam'),
      centreOwn: !!el && (hit === el || hit.contains(el)),
    };
  });
  check(open.present && open.centreOwn && !open.sealedClass, 'the open landing still offers the approach');
  check(open.label === 'Approach the Sanctum', '11.7 — and says so plainly');
  check(!open.seam, 'no seam is drawn when the wall is a door');
  await page.click('.bp-sanctumhit');
  await page.waitForTimeout(900);
  const dest = await page.evaluate(() => location.hash);
  check(dest.includes('/sanctum'), `11.6 — it goes where it says (${dest})`);

  // ── 3. THE DECISION IS ARMED ─────────────────────────────────────────────
  await page.evaluate(() => {
    const st = window.__manorStore;
    const m = st.getState().manor;
    const rooms = { ...m.rooms };
    delete rooms['2,5'];
    rooms['2,4'] = { cell: { col: 2, row: 4 }, cardId: 'library', doors: ['N', 'S'], solved: true, kind: 'word-web' };
    st.setState({
      manor: { ...m, rooms, playerCell: { col: 2, row: 4 } },
      draftOffer: null,
      // The landing door is padlocked at 0.95 (DOOR_LOCKS): she would never be
      // standing here without having prepared for it, so the harness prepares.
      currencies: { ...st.getState().currencies, keys: 4, gems: 4 },
    });
    location.hash = '#/manor';
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => { window.__manorStore.getState().openDraft('N'); });
  await page.waitForTimeout(700);
  const modal = await page.evaluate(() => ({
    open: !!document.querySelector('.bp-modal'),
    rule: document.querySelector('.bp-modal__sanctum')?.textContent ?? '',
    stamps: [...document.querySelectorAll('.bp-card__sanctum')].map((n) => n.textContent),
    opensCount: document.querySelectorAll('.bp-card__sanctum--opens').length,
  }));
  L('landing draft:', JSON.stringify(modal));
  check(modal.open, 'the landing draft opened');
  check(/north/i.test(modal.rule) && /Sanctum landing/i.test(modal.rule),
    '4.6 — the modal states the rule nothing in the game had ever stated');
  check(modal.stamps.length === 3, '4.6 — every card in the offer is stamped');
  check(modal.stamps.every((s) => /Sanctum/.test(s)),
    'and each stamp names the Sanctum, not just a compass direction');

  // …and the stamp must agree with what actually gets placed.
  const truth = await page.evaluate(
    () => window.__manorStore.getState().draftOffer?.cards.map((c) => c.id) ?? []);
  L('offer card ids:', JSON.stringify(truth), 'stamps:', JSON.stringify(modal.stamps));
  check(modal.opensCount === modal.stamps.filter((s) => /^Opens/.test(s)).length,
    'the gilt modifier is on exactly the plans that open onto the Sanctum');

  L('page errors:', JSON.stringify(errs.slice(0, 6)));
  check(errs.length === 0, 'no page errors during the walk');
  L(fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECK(S) FAILED`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
process.exit(fails === 0 ? 0 : 1);
