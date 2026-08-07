import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const ROOT = 'C:/Users/hartw/lexicon-loop-v2';
async function freePort(from = 5610, to = 5660) {
  for (let p = from; p <= to; p++) {
    const t = await new Promise((r) => {
      const s = createServer();
      s.once('error', () => r(true));
      s.once('listening', () => s.close(() => r(false)));
      s.listen(p, '127.0.0.1');
    });
    if (!t) return p;
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
server.stderr.on('data', (b) => process.stderr.write('[p] ' + b));
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE); if (r.ok) break; } catch { /* wait */ }
  await new Promise((r) => setTimeout(r, 500));
}
const L = (...a) => console.log('[live]', ...a);
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const S = () => page.evaluate(() => {
    const s = window.__manorStore?.getState?.();
    if (!s) return { noStore: 1 };
    return {
      day: s.day?.day ?? null, phase: s.day?.phase ?? null,
      steps: s.day ? s.stepsRemaining() : null,
      cell: s.manor?.playerCell, frags: s.volume.foundFragmentIds.length, hash: location.hash,
    };
  });
  L('boot', JSON.stringify(await S()));

  const playScene = async () => {
    for (let i = 0; i < 80; i++) {
      const dlg = await page.$('.dlg');
      if (!dlg) break;
      const p = await page.$('.dlg-choice--primary');
      if (p) { await p.click(); await page.waitForTimeout(150); continue; }
      const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
      if (c) { await c.click(); await page.waitForTimeout(150); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      await page.waitForTimeout(140);
    }
  };
  const clickText = async (needle) => {
    const bs = await page.$$('button');
    for (const b of bs) {
      const t = ((await b.innerText().catch(() => '')) || '').toLowerCase();
      if (t.includes(needle)) { await b.click({ timeout: 4000 }).catch(() => {}); return true; }
    }
    return false;
  };
  for (let i = 0; i < 20; i++) {
    const st = await S();
    if (st.phase === 'exploring') break;
    await clickText('begin the first day');
    await page.waitForTimeout(300);
    await clickText('begin the day');
    await page.waitForTimeout(350);
    await playScene();
    await page.waitForTimeout(200);
  }
  L('after morning', JSON.stringify(await S()));
  await page.screenshot({ path: resolve(ROOT, '.critic/01-blueprint.png') });

  await page.evaluate(() => { window.__manorStore.getState().collectFragmentForRoom('mystery'); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(ROOT, '.critic/02-seal-moment.png') });
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(ROOT, '.critic/03-journal-sealed.png') });
  L('JOURNAL SEALED >>>\n' + await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1500)));

  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    for (let i = 0; i < 20; i++) s.collectFragmentForRoom('mystery');
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__manorStore.getState().decipherFragments(20); });
  await page.waitForTimeout(500);
  L('after stuffing frags', JSON.stringify(await S()));
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(ROOT, '.critic/04-journal-full.png') });
  L('JOURNAL FULL >>>\n' + await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1800)));

  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(ROOT, '.critic/05-sanctum-not-at-door.png') });
  L('SANCTUM not-at-door >>>\n' + await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1500)));

  const put = (doors) => page.evaluate((d) => {
    const st = window.__manorStore;
    const s = st.getState();
    const m = s.manor;
    const rooms = { ...m.rooms };
    rooms['2,5'] = { cell: { col: 2, row: 5 }, cardId: 'linen-closet', doors: d, solved: false, category: 'puzzle' };
    st.setState({ manor: { ...m, rooms, playerCell: { col: 2, row: 5 } } });
  }, doors);

  await put(['S', 'E']);
  await page.evaluate(() => { location.hash = '#/manor'; });
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(ROOT, '.critic/06-landing-no-north.png') });
  const bp = await page.evaluate(() => ({
    hit: !!document.querySelector('.bp-sanctumhit'),
    text: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 900),
  }));
  L('BLUEPRINT on landing, NO north door: sanctum tappable =', bp.hit);
  L('BLUEPRINT TEXT >>>\n' + bp.text);
  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(ROOT, '.critic/07-sanctum-landing-nonorth.png') });
  L('SANCTUM on landing NO north >>>\n' + await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1300)));

  await put(['S', 'N']);
  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(ROOT, '.critic/08-sanctum-at-door.png') });
  L('SANCTUM at the door >>>\n' + await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1700)));

  const fillGuess = async (word) => {
    const inp = await page.$('input');
    if (!inp) return false;
    await inp.fill(word);
    const btns = await page.$$('button');
    for (const b of btns) {
      const t = (await b.innerText()).toLowerCase();
      if (t.includes('speak') || t.includes('say') || t.includes('guess') || t.includes('word')) { await b.click(); return true; }
    }
    await page.keyboard.press('Enter');
    return true;
  };
  await fillGuess('CANDLE');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(ROOT, '.critic/09-sanctum-wrong.png') });
  L('SANCTUM after wrong >>>\n' + await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1400)));

  await page.evaluate(() => {
    const st = window.__manorStore;
    const s = st.getState();
    st.setState({ volume: { ...s.volume, guesses: [] } });
  });
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await put(['S', 'N']);
  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForTimeout(1000);
  await fillGuess('LACUNA');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(ROOT, '.critic/10-sanctum-win.png') });
  L('SANCTUM after LACUNA >>>\n' + await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1700)));
  L('page errors:', JSON.stringify(errs.slice(0, 6)));
} finally {
  if (browser) await browser.close();
  server.kill();
}
