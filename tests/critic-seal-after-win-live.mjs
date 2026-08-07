import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const SHOTS = resolve(root, 'docs/shots/critic-seal');
mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:4173/LexiconManor/';
const log = (...a) => console.log('[cs2]', ...a);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(15000);
const sleep = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: resolve(SHOTS, n + '.png') });
const drain = async (limit = 12) => {
  for (let i = 0; i < limit; i++) {
    const gone = await page.evaluate(() => {
      const m = document.querySelector('.mom');
      if (!m) return true;
      m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      m.click?.();
      return false;
    });
    if (gone) return; await sleep(220);
  }
};
async function playScene() {
  await page.waitForSelector('.dlg', { timeout: 8000 }).catch(() => {});
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const p = await page.$('.dlg-choice--primary');
    if (p) { await p.click(); await sleep(150); continue; }
    const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (c) { await c.click(); await sleep(150); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await sleep(150);
  }
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=Begin the first day', { timeout: 20000 });
  await page.click('text=Begin the first day');
  await page.waitForSelector('.chr-scene');
  await page.click('.chr-scene__btn');
  await playScene();
  await page.waitForSelector('.bp-sheet');
  await drain();

  // Seal a backlog, then win the volume at the door.
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.__manorStore.getState().collectFragmentForRoom('mystery');
    const s = window.__manorStore.getState();
    const cell = { col: 2, row: 5 };
    window.__manorStore.setState({
      manor: { ...s.manor, playerCell: cell, rooms: { ...s.manor.rooms,
        '2,5': { cardId: 'reading-nook', cell, doors: ['N', 'S'], solved: true, kind: 'parlor' } } },
    });
  });
  await sleep(400); await drain();
  await page.goto(BASE + '#/sanctum', { waitUntil: 'networkidle' });
  await page.waitForSelector('.snc-input');
  await sleep(500); await drain();
  await page.fill('.snc-input', 'LACUNA');
  await page.click('.snc-speak');
  await sleep(2500);
  const epi = await page.evaluate(() => {
    // step through the ceremony to the epilogue
    return document.querySelector('.snc')?.innerText ?? '';
  });
  await shot('10-won-reveal');
  // Advance to epilogue via the primary button chain
  for (let i = 0; i < 6; i++) {
    const b = await page.$('.snc-btn--primary');
    if (!b) break;
    const txt = (await b.textContent()) ?? '';
    if (/house sleep/i.test(txt)) break;
    await b.click(); await sleep(700);
    if (await page.$('.dlg')) { await playScene(); await sleep(500); }
  }
  const epiText = await page.evaluate(() => document.querySelector('.snc')?.innerText ?? '');
  log('--- CEREMONY / EPILOGUE ON GLASS ---\n' + epiText);
  await shot('11-epilogue');

  // NOW the journal on a CLOSED volume with sealed pages still filed.
  await page.goto(BASE + '#/journal', { waitUntil: 'networkidle' });
  await page.waitForSelector('.jrn-tabs');
  await sleep(700); await drain();
  const closed = await page.evaluate(() => {
    const t = document.querySelector('.jrn')?.innerText ?? '';
    return {
      text: t,
      solveInstructions: (t.match(/Solve a room|Finish a room|finishing a room/gi) ?? []).length,
      sealedLines: document.querySelectorAll('.jrn-poem__line--sealed').length,
      rail: !!document.querySelector('.jrn-rail__backlog'),
      nudge: document.querySelector('.jrn-nudge__text')?.innerText ?? null,
      state: (() => { const s = window.__manorStore.getState(); return { status: s.volume.status }; })(),
    };
  });
  log('CLOSED-VOLUME JOURNAL:', JSON.stringify({ solveInstructions: closed.solveInstructions, sealedLines: closed.sealedLines, rail: closed.rail, nudge: closed.nudge, state: closed.state }));
  log('--- JOURNAL AFTER THE WIN ---\n' + closed.text);
  await shot('12-journal-after-win');
} catch (e) {
  console.error('[cs2] ERROR', e.message);
  await shot('99b-failure').catch(() => {});
} finally {
  await browser.close();
}
