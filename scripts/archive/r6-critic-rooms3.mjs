/** ROUND 6 CRITIC PROBE v3 — library feedback + hive Every Petal. ONE msedge instance. */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round6-critic');
const BASE = 'http://localhost:4173/LexiconManor/';
mkdirSync(OUT, { recursive: true });
const hivePool = JSON.parse(readFileSync(resolve(root, 'content/generated/hive.json'), 'utf8'));
const webPool = JSON.parse(readFileSync(resolve(root, 'content/generated/word-web.json'), 'utf8'));
const R = {};
const log = (...a) => console.log('[r6c]', ...a);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: join(OUT, n + '.png') });
  const store = () => page.evaluate(() => { const s = window.__manorStore.getState(); return { phase: s.day?.phase ?? null, steps: s.stepsRemaining(), gems: s.currencies.gems }; });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(600);
  async function ensureExploring() {
    for (let i = 0; i < 80; i++) {
      const s = await store();
      const hasManor = await page.evaluate(() => !!window.__manorStore?.getState().manor);
      if (s.phase === 'exploring' && hasManor) return true;
      if (await page.$('.dlg')) {
        const p = await page.$('.dlg-choice--primary');
        if (p) await p.click(); else { const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown'); }
        await sleep(200); continue;
      }
      const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(500); continue; }
      const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(500); continue; }
      const any = await page.$('button'); if (any && s.phase === null) { await any.click(); await sleep(400); continue; }
      await sleep(300);
    }
    return false;
  }
  async function openRoom(cardId, cell, kind) {
    if (!(await ensureExploring())) { log('!! no exploring'); return false; }
    await page.evaluate(({ cardId, cell, kind }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell, rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind } } } });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, cell, kind });
    await sleep(900); return true;
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(400); };
  const toast = () => page.evaluate(() => document.querySelector('.anch-toast')?.textContent ?? null);

  // ═══ LIBRARY ═════════════════════════════════════════════════════════════
  await openRoom('library', { col: 2, row: 2 }, 'word-web');
  await page.waitForSelector('.ww-tile', { timeout: 8000 });
  const tileWords = await page.$$eval('.ww-tile', els => els.map(e => e.innerText.trim().toUpperCase()));
  const board = webPool.find(b => b.groups.flatMap(g => g.words).every(w => tileWords.includes(w.toUpperCase())));
  R.library = { tileWords, boardId: board?.id, amb: board?.ambiguousWords ?? [], themes: board?.groups.map(g => g.theme) };
  R.library.quotesInDom = await page.$$eval('.anch--library *', els => els.filter(e => !e.children.length && /["“”]/.test(e.textContent||'')).map(e => ({ t: e.textContent.trim().slice(0,44), codes: [...e.textContent].filter(c => /["“”]/.test(c)).map(c => 'U+'+c.codePointAt(0).toString(16).toUpperCase()) })));

  const clickWords = async (ws) => {
    for (const w of ws) {
      const tiles = await page.$$('.ww-tile');
      for (const t of tiles) { if ((await t.innerText()).trim().toUpperCase() === w.toUpperCase()) { await t.click(); break; } }
      await sleep(110);
    }
  };
  const weave = async () => { await page.click('.anch-btn--primary', { timeout: 4000 }).catch(() => log('!! weave disabled')); await sleep(2000); };
  const clearSel = async () => { const b = await page.$$('.anch-btn'); for (const x of b) if ((await x.innerText()).trim() === 'Clear') { await x.click().catch(()=>{}); break; } await sleep(300); };

  if (board) {
    // (a) plain-wrong: one word from each group, none ambiguous
    const plain = board.groups.map(g => g.words.find(w => !board.ambiguousWords?.includes(w)) ?? g.words[0]);
    await clickWords(plain); await weave();
    R.library.plainWrong = { toast: await toast(), steps: (await store()).steps };
    await shot('lib3-plainwrong');
    R.library.buttonsAfterWrong = await page.$$eval('.anch-btn', els => els.map(e => e.innerText.trim()));
    R.library.selectionKept = (await page.$$eval('.ww-tile--sel, .ww-tile.is-sel, .ww-tile[aria-pressed="true"]', e => e.length));
    // (b) herring guess
    await clearSel();
    if (board.ambiguousWords?.length) {
      const her = [...board.ambiguousWords];
      for (const g of board.groups) for (const w of g.words) { if (her.length >= 4) break; if (!her.includes(w)) her.push(w); }
      await clickWords(her.slice(0, 4)); await weave();
      R.library.herring = { sel: her.slice(0,4), toast: await toast() };
      await shot('lib3-herring');
    }
    // (c) solve → naming act
    await clearSel();
    for (const g of board.groups) { await clickWords(g.words); await weave(); await sleep(900); }
    R.library.namingDom = await page.evaluate(() => {
      const el = document.querySelector('.anch--library');
      return { html: [...el.querySelectorAll('button')].map(b => b.innerText.trim()).slice(0, 12), text: el.innerText.slice(0, 400) };
    });
    await shot('lib3-final');
  }
  await leave();

  // ═══ CONSERVATORY → Every Petal ══════════════════════════════════════════
  await openRoom('conservatory', { col: 3, row: 2 }, 'hive');
  await page.waitForSelector('.hv-cell', { timeout: 8000 });
  const center = await page.$eval('.hv-cell--center', e => e.innerText.trim());
  const outer = await page.$$eval('.hv-cell:not(.hv-cell--center)', els => els.map(e => e.innerText.trim()));
  const hp = hivePool.find(p => p.center === center && p.outer.slice().sort().join('') === outer.slice().sort().join(''));
  R.hive = { center, outer, id: hp?.id, words: hp?.validWords.length, total: hp?.totalPoints };
  R.hive.geomStart = await page.$eval('.hv-cell', e => { const r = e.getBoundingClientRect(); return { w:+r.width.toFixed(1), h:+r.height.toFixed(1), top:+r.top.toFixed(1) }; });
  let bloomed = false;
  if (hp) {
    for (const w of hp.validWords) {
      await page.keyboard.type(w, { delay: 25 });
      await sleep(120);
      await page.keyboard.press('Enter');
      await sleep(160);
      const lad = await page.evaluate(() => document.querySelector('.anch--conservatory')?.innerText ?? '');
      if (!bloomed && /Full Bloom/.test(lad)) {
        bloomed = true; await sleep(1600); await shot('hive3-fullbloom');
        R.hive.geomBloom = await page.$eval('.hv-cell', e => { const r = e.getBoundingClientRect(); return { w:+r.width.toFixed(1), h:+r.height.toFixed(1), top:+r.top.toFixed(1) }; });
      }
      if (await page.$('.anch-done__title')) break;
    }
  }
  await sleep(1500);
  R.hive.done = await page.evaluate(() => { const t = document.querySelector('.anch-done__title'); return t ? { title: t.innerText, fern: document.querySelector('.anch-done__fern')?.innerText, line: document.querySelector('.anch-done__line')?.innerText } : null; });
  R.hive.gems = (await store()).gems;
  R.hive.bloomed = bloomed;
  await shot('hive3-everypetal');
  await leave();

  writeFileSync(join(OUT, 'results3.json'), JSON.stringify(R, null, 1));
  log('done');
} finally { await browser.close(); }
