/** Retry: pantry trap toast + music room decoy toast. One Edge instance. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round3');
const BASE = 'http://localhost:4173/LexiconManor/';
const plan = JSON.parse(readFileSync(resolve(SHOTS, 'plan.json'), 'utf8'));
const log = (...a) => console.log('[retry]', ...a);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(15000);
const shot = (name) => page.screenshot({ path: resolve(SHOTS, name + '.png') });
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
await page.reload({ waitUntil: 'networkidle' });

// Fast-forward: begin day, skip Bramble, land exploring with fixed seed.
await page.click('text=Begin the first day');
await page.waitForSelector('.chr-scene');
await page.click('.chr-scene__btn');
await page.waitForSelector('.dlg');
await page.click('.dlg__skip');
await page.waitForSelector('.dlg-choice--primary');
await page.click('.dlg-choice--primary');
await page.waitForSelector('.bp-sheet');
await page.evaluate((seed) => {
  const S = window.__manorStore;
  const st = S.getState();
  S.setState({
    day: { ...st.day, daySeed: seed },
    manor: { ...st.manor, daySeed: seed },
    ledger: { ...st.ledger, budget: 900 },
  });
}, plan.daySeed);

async function enterSeededRoom(kind, cardId, key, puzzleId) {
  await page.evaluate(({ kind, cardId, key, puzzleId }) => {
    const S = window.__manorStore;
    const st = S.getState();
    const [col, row] = key.split(',').map(Number);
    const cell = { col, row };
    S.setState({
      manor: {
        ...st.manor,
        rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N', 'E', 'S', 'W'], solved: false, kind, puzzleId } },
        playerCell: cell,
      },
      day: { ...st.day, activeRoom: { cellKey: key, kind, puzzleId, tier: 1 } },
    });
    location.hash = '#/room';
  }, { kind, cardId, key, puzzleId });
  await page.waitForSelector('.room-host');
  await sleep(300);
}

/** Click submit, then poll the toast slot and shoot the moment a toast lands. */
async function submitAndCatchToast(word, input, btn, shotName) {
  await page.fill(input, word);
  await page.click(btn);
  let seen = null;
  for (let i = 0; i < 30; i++) {
    seen = await page.evaluate(() => {
      const slot = document.querySelector('.m2-toastslot');
      const t = slot?.querySelector('.m2-toast');
      return t ? { cls: t.className, text: t.textContent } : null;
    });
    if (seen) break;
    await sleep(100);
  }
  log(shotName, 'toast:', JSON.stringify(seen));
  if (seen) await shot(shotName);
  return seen;
}

// --- Pantry ---
{
  const p = plan.category;
  await enterSeededRoom('category', 'pantry', p.cellKey, p.puzzleId);
  await page.waitForSelector('.m2--pantry');
  await page.fill('.m2-input', p.accepted[0]);
  await page.click('.m2-btn--primary');
  await sleep(1200); // let the "Shelved." toast clear
  const trap = typeof p.trap === 'string' ? p.trap : p.trap.word;
  const seen = await submitAndCatchToast(trap, '.m2-input', '.m2-btn--primary', '31-pantry-category-mistake-toast');
  if (!seen) log('PANTRY TOAST NEVER APPEARED');
  await sleep(800);
  for (const w of p.accepted.slice(1)) {
    if (await page.$('.m2-done')) break;
    await page.fill('.m2-input', w);
    await page.click('.m2-btn--primary');
    await sleep(300);
  }
  await page.waitForSelector('.m2-done');
  await sleep(500);
  await shot('32-pantry-category-solved');
  const done = await page.$('.room-host__footer .btn--primary');
  if (done) await done.click();
  await page.waitForSelector('.bp-sheet');
}

// --- Music Room ---
{
  const p = plan.rhyme;
  await enterSeededRoom('rhyme', 'music-room', p.cellKey, p.puzzleId);
  await page.waitForSelector('.m2--music');
  await page.fill('.m2-input', p.rounds[0].accepted[0]);
  await page.click('.m2-btn--primary');
  await sleep(1300);
  const seen = await submitAndCatchToast(p.decoy, '.m2-input', '.m2-btn--primary', '37-music-room-rhyme-mistake-toast');
  if (!seen) log('MUSIC TOAST NEVER APPEARED');
  await sleep(800);
  for (const round of p.rounds) {
    for (const w of round.accepted) {
      if (await page.$('.m2-done')) break;
      await page.fill('.m2-input', w);
      await page.click('.m2-btn--primary');
      await sleep(350);
    }
    if (await page.$('.m2-done')) break;
  }
  await page.waitForSelector('.m2-done');
  await sleep(500);
  await shot('38-music-room-rhyme-solved');
}

await browser.close();
log('done');
