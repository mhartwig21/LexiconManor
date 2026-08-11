/**
 * r8-live-walk3.mjs — round 8 live pass, part 3: overlay exits below the fold,
 * lifecycle tap counts, the victory ceremony, empty/unauthored branches.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = process.env.WALK_VIEW === 'short'
  ? { width: 375, height: 667 } : { width: 390, height: 844 };

async function freePort(from = 5401, to = 5450) {
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
  throw new Error('no free port');
}
const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const say = (s) => console.log('[w3] ' + s);

const server = spawn(process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const up = (async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview did not answer');
})();

let browser;
try {
  await up;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  const geom = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const h = document.elementFromPoint(
      Math.min(Math.max(r.x + r.width / 2, 1), window.innerWidth - 1),
      Math.min(Math.max(r.y + r.height / 2, 1), window.innerHeight - 1));
    return { found: true, size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight,
      inFold: r.top >= 0 && r.bottom <= window.innerHeight,
      centreOwned: Boolean(h && (h === el || el.contains(h))),
      centreHit: h ? h.tagName.toLowerCase() + '.' + (typeof h.className === 'string' ? h.className : '') : 'null',
      text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
  }, sel);

  const controls = () => page.evaluate(() => [...document.querySelectorAll('button, a[href]')]
    .filter((b) => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().height > 0)
    .map((b) => b.innerText.replace(/\s+/g, ' ').trim().slice(0, 40) || b.getAttribute('aria-label')));

  async function playScene(countTaps) {
    let taps = 0;
    for (let i = 0; i < 70 && (await page.$('.dlg')); i++) {
      const p = await page.$('.dlg-choice--primary');
      if (p) { await p.click(); taps++; await page.waitForTimeout(180); continue; }
      const c = await page.$('.dlg-choice');
      if (c) { await c.click(); taps++; await page.waitForTimeout(180); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      taps++;
      await page.waitForTimeout(140);
    }
    return taps;
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title');

  /* --- pre-day branches of the other routes (fresh save, no day) --- */
  for (const route of ['#/journal', '#/room', '#/sanctum', '#/chronicles']) {
    await page.evaluate((r) => { location.hash = r; }, route);
    await page.waitForTimeout(600);
    say(`PRE-DAY ${route}: hash=${await page.evaluate(() => location.hash)} controls=${JSON.stringify(await controls())}`);
  }
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(400);

  /* --- taps from the morning card to the blueprint (11.24) --- */
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene');
  let taps = 0;
  await page.click('.chr-scene__btn'); taps++;
  await page.waitForSelector('.dlg');
  taps += await playScene();
  await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring');
  say(`TAPS from morning card to the blueprint (then +2 for Chronicles→control): ${taps}`);

  /* --- cabinet overlay: is its exit above the fold? --- */
  const cabBtn = await page.$$('.bp-btn--quiet');
  for (const b of cabBtn) if ((await b.innerText()).trim() === 'Cabinet') { await b.click(); break; }
  await page.waitForSelector('.bp-modal');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.bp-modal button')].find((x) => /Close the cabinet/.test(x.innerText));
    if (b) b.setAttribute('data-walk', 'cab');
  });
  say(`CABINET close button at scroll 0: ${JSON.stringify(await geom('[data-walk="cab"]'))}`);
  const sheet = await page.evaluate(() => {
    const s = document.querySelector('.bp-modal__sheet');
    return s ? { scrollHeight: s.scrollHeight, clientHeight: s.clientHeight, scrollTop: s.scrollTop,
      rect: Math.round(s.getBoundingClientRect().height) } : null;
  });
  say(`CABINET sheet scroll: ${JSON.stringify(sheet)}`);
  await page.evaluate(() => { const s = document.querySelector('.bp-modal__sheet'); s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(250);
  say(`CABINET close after scrolling the sheet to the bottom: ${JSON.stringify(await geom('[data-walk="cab"]'))}`);
  // scrim-tap fallback
  await page.mouse.click(VIEW.width / 2, 20);
  await page.waitForTimeout(300);
  say(`CABINET after tapping the scrim at y=20: modal still up = ${Boolean(await page.$('.bp-modal'))}`);
  if (await page.$('.bp-modal')) {
    await page.click('[data-walk="cab"]').catch(() => {});
    await page.waitForTimeout(300);
  }

  /* --- draft overlay geometry --- */
  await page.waitForSelector('.bp-ghost');
  await page.click('.bp-ghost');
  await page.waitForSelector('.bp-modal');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.bp-modal button')].find((x) => /Step back/.test(x.innerText));
    if (b) b.setAttribute('data-walk', 'draft');
  });
  say(`DRAFT cancel button: ${JSON.stringify(await geom('[data-walk="draft"]'))}`);
  say(`DRAFT modal controls: ${JSON.stringify(await controls())}`);
  await page.click('[data-walk="draft"]').catch(() => {});
  await page.waitForTimeout(400);
  say(`DRAFT cancel → hash ${await page.evaluate(() => location.hash)}, modal up=${Boolean(await page.$('.bp-modal'))}`);

  /* --- unregistered room kind (error branch) --- */
  await page.evaluate(() => {
    const store = window.__manorStore; const s = store.getState();
    const c = s.manor.playerCell; const key = `${c.col},${c.row}`;
    store.setState({ day: { ...s.day, activeRoom: { cellKey: key, kind: 'not-a-kind', tier: 1 } } });
    location.hash = '#/room';
  });
  await page.waitForTimeout(600);
  say(`UNREGISTERED ROOM branch: controls=${JSON.stringify(await controls())} exit=${JSON.stringify(await geom('.room-host__footer .btn, .page .btn'))}`);
  const btnSel = await page.$('.page .btn');
  if (btnSel) { await btnSel.click(); await page.waitForTimeout(500); }
  say(`UNREGISTERED ROOM exit → hash ${await page.evaluate(() => location.hash)}`);
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    window.__manorStore.setState({ day: { ...s.day, activeRoom: null } });
    location.hash = '#/';
  });
  await page.waitForTimeout(400);

  /* --- unauthored volume branch on /journal + /sanctum --- */
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    window.__manorStore.setState({ volume: { ...s.volume, volumeId: 'volume-not-authored' } });
  });
  for (const route of ['#/journal', '#/sanctum']) {
    await page.evaluate((r) => { location.hash = r; }, route);
    await page.waitForTimeout(600);
    say(`UNAUTHORED VOLUME ${route}: controls=${JSON.stringify(await controls())} backlink=${JSON.stringify(await geom('.backlink'))}`);
  }
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    window.__manorStore.setState({ volume: { ...s.volume, volumeId: 'volume-1' } });
    location.hash = '#/';
  });
  await page.waitForTimeout(500);

  /* --- the victory ceremony, driven through the real UI --- */
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    for (let i = 0; i < 17; i++) s.collectFragmentForRoom('mystery');
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForTimeout(700);
  // clear any moment on glass so it does not eat the taps
  for (let i = 0; i < 6 && (await page.$('.mom')); i++) { await page.click('.mom'); await page.waitForTimeout(200); }
  say(`SANCTUM before guess: controls=${JSON.stringify(await controls())}`);
  await page.fill('.snc-input', 'LACUNA');
  await page.click('.snc-speak');
  await page.waitForTimeout(2500);
  say(`CEREMONY phase 1 (won-reveal): controls=${JSON.stringify(await controls())}`);
  const c1 = await geom('.snc-btn--primary');
  say(`  exit/advance: ${JSON.stringify(c1)}`);
  await page.click('.snc-btn--primary').catch(() => {});
  await page.waitForTimeout(1200);
  say(`CEREMONY phase 2 (won-portrait): controls=${JSON.stringify(await controls())} dlg=${Boolean(await page.$('.dlg'))}`);
  if (await page.$('.dlg')) await playScene();
  else {
    for (let i = 0; i < 6; i++) {
      const b = await page.$('.snc-btn');
      if (!b) break;
      await b.click(); await page.waitForTimeout(500);
      if (await page.$('.snc-epilogue')) break;
    }
  }
  await page.waitForTimeout(800);
  say(`CEREMONY phase 3 (epilogue): controls=${JSON.stringify(await controls())} backlink=${JSON.stringify(await geom('.backlink'))}`);
  const closeBtn = await geom('.snc-btn--primary');
  say(`  "Let the house sleep": ${JSON.stringify(closeBtn)}`);
  await page.click('.snc-btn--primary').catch(() => {});
  await page.waitForTimeout(1200);
  say(`CEREMONY exit → hash ${await page.evaluate(() => location.hash)} phase=${await page.evaluate(() => window.__manorStore.getState().day?.phase ?? null)}`);
  say(`  after ceremony, controls=${JSON.stringify(await controls())}`);
} catch (e) {
  say(`THREW: ${e.message} @ ${e.stack?.split('\n')[1]?.trim()}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
