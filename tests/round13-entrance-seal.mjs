/**
 * ROUND 13 — the one live probe this fix owes (AAA §0.4 / 11.19).
 *
 * The seal chain's ENTRANCE level. `src/pages/ManorPage.tsx` rendered only
 * `<UnreadMark>` on the blueprint's Journal button, so with five pages sealed a
 * live read was `{text:"Journal7", wax:1, seal:0}` — and after one glance at the
 * smudges the wax retired and the map showed a bare "Journal" with five pages
 * still not made out. A screenshot of that is indistinguishable from a clean
 * map, which is exactly why §11 is not passable from stills (§0.1.7).
 *
 * ONE browser instance, system Edge, closed in a finally. Point it at whatever
 * server is up:  node tests/round13-entrance-seal.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const log = (...a) => console.log('[r13]', ...a);
let failures = 0;
const ok = (m) => log('PASS —', m);
const fail = (m) => { failures++; log('FAIL —', m); };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(20000);
  const sleep = (ms) => page.waitForTimeout(ms);

  const drain = async (limit = 14) => {
    for (let i = 0; i < limit; i++) {
      const gone = await page.evaluate(() => {
        const m = document.querySelector('.mom');
        if (!m) return true;
        m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        m.click?.();
        return false;
      });
      if (gone) return;
      await sleep(250);
    }
  };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=Begin the first day');
  await page.click('text=Begin the first day');
  await page.waitForSelector('.chr-scene');
  await page.click('.chr-scene__btn');
  // Play the morning scene out.
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const p = await page.$('.dlg-choice--primary');
    if (p) { await p.click(); await sleep(120); continue; }
    const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (c) { await c.click(); await sleep(120); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await sleep(120);
  }
  await page.waitForSelector('.bp-sheet');
  await drain();

  // Plant five sealed pages through the REAL violet-room channel.
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.__manorStore.getState().collectFragmentForRoom('mystery');
  });
  await sleep(400);
  await drain();

  const read = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    const pre = `vol.${s.volume.volumeId}.`;
    const ids = (p) => s.flags.filter((f) => f.startsWith(pre + p)).map((f) => f.slice((pre + p).length));
    const leg = new Set(ids('legible-'));
    const sealed = ids('sealed-').filter((i) => !leg.has(i));
    const btn = [...document.querySelectorAll('.bp-btn--quiet')]
      .find((b) => /^\s*Journal/.test(b.textContent ?? ''));
    const sealN = btn?.querySelector('.sealed__n');
    const waxN = btn?.querySelector('.unread__n');
    const mark = btn?.querySelector('.sealed');
    let hit = null;
    if (mark) {
      const r = mark.getBoundingClientRect();
      hit = { inViewport: r.top >= 0 && r.bottom <= window.innerHeight, w: Math.round(r.width) };
    }
    return {
      sealedTruth: sealed.length,
      text: btn?.textContent.trim() ?? null,
      wax: btn ? btn.querySelectorAll('.unread').length : 0,
      waxN: waxN ? Number(waxN.textContent) : 0,
      seal: btn ? btn.querySelectorAll('.sealed').length : 0,
      sealN: sealN ? Number(sealN.textContent) : 0,
      hit,
      aria: mark?.getAttribute('aria-label') ?? null,
    };
  });

  const before = await read();
  log('blueprint entrance, five pages sealed:', JSON.stringify(before));
  if (before.sealedTruth !== 5) fail(`planted ${before.sealedTruth} sealed pages, expected 5`);
  else ok('five pages are sealed in the model');
  if (before.seal < 1) fail('the blueprint Journal entrance carries NO smudge marker (AAA 11.19)');
  else ok(`the entrance carries the smudge marker (${before.aria})`);
  if (before.sealN !== before.sealedTruth) {
    fail(`the entrance prints ${before.sealN} but ${before.sealedTruth} pages are sealed (AAA 11.21)`);
  } else ok(`the count is exact: ${before.sealN}`);
  if (before.hit && !before.hit.inViewport) fail('the marker is outside the visual viewport');

  // Now the half that made this worse than a gap: read the smudges, so wax
  // retires, and confirm the entrance still says something.
  await page.goto(BASE + '#/journal', { waitUntil: 'networkidle' });
  await page.waitForSelector('.jrn-tabs');
  await sleep(600); await drain();
  for (const t of ['Engravings', 'Testimony', 'The Word']) {
    const b = await page.$(`.jrn-tab:has-text("${t}")`);
    if (b) { await b.click(); await sleep(400); }
  }
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-sheet');
  await sleep(500); await drain();

  const after = await read();
  log('blueprint entrance after she has LOOKED at the smudges:', JSON.stringify(after));
  if (after.waxN !== 0 && after.wax !== 0) {
    log('note: wax has not fully retired yet (', after.waxN, ') — not this probe’s criterion');
  }
  if (after.seal < 1) {
    fail('once the wax retired the entrance went bare again — the seal chain still '
      + 'has no entrance level (this is the exact round-13 shape)');
  } else ok(`the entrance still says ${after.sealN} page(s) not yet made out after the glance`);

  log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
} finally {
  await browser.close();
}
process.exit(failures === 0 ? 0 : 1);
