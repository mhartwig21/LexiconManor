/** ROUND 6 CRITIC PROBE v2. System Edge, ONE instance, closed in finally. */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round6-critic');
const BASE = 'http://localhost:4173/LexiconManor/';
mkdirSync(OUT, { recursive: true });
const hivePool = JSON.parse(readFileSync(resolve(root, 'content/generated/hive.json'), 'utf8'));
const R = {};
const log = (...a) => console.log('[r6b]', ...a);

const ROOM_KIND = { library: 'word-web', conservatory: 'hive', gallery: 'twistle', study: 'forgotten-word', darkroom: 'cipher', 'linen-closet': 'crossword', 'counting-house': 'sudoku' };
const ROOM_ROOT = { 'word-web': '.anch--library', hive: '.anch--conservatory', twistle: '.anch--gallery', 'forgotten-word': '.anch--study', cipher: '.mic--darkroom', crossword: '.m2--linen', sudoku: '.ch' };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: join(OUT, n + '.png') });
  const store = () => page.evaluate(() => { const s = window.__manorStore.getState(); return { phase: s.day?.phase ?? null, day: s.day?.day ?? null, steps: s.stepsRemaining(), gems: s.currencies.gems }; });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(600);

  async function ensureExploring() {
    for (let i = 0; i < 80; i++) {
      const s = await store();
      const hasManor = await page.evaluate(() => !!window.__manorStore?.getState().manor);
      if (s.phase === 'exploring' && hasManor) return true;
      if (await page.$('.dlg')) {
        const p = await page.$('.dlg-choice--primary');
        if (p) await p.click(); else {
          const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
          if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown');
        }
        await sleep(200); continue;
      }
      const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(500); continue; }
      const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(500); continue; }
      const any = await page.$('button'); if (any && s.phase === null) { await any.click(); await sleep(400); continue; }
      await sleep(300);
    }
    return false;
  }
  async function openRoom(cardId, cell, puzzleId) {
    if (!(await ensureExploring())) { log('!! no exploring for', cardId); return false; }
    const kind = ROOM_KIND[cardId];
    await page.evaluate(({ cardId, cell, kind, puzzleId }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell, rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind, puzzleId } } } });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, cell, kind, puzzleId });
    const ok = await page.waitForSelector(ROOM_ROOT[kind], { timeout: 10000 }).catch(() => null);
    await sleep(500); return !!ok;
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(400); };

  /** Empty-parchment audit: rows of the stage with no painted content. */
  const deadSpace = async () => page.evaluate(() => {
    const stage = document.querySelector('.room-host__stage');
    const sr = stage.getBoundingClientRect();
    const leaves = [];
    for (const el of stage.querySelectorAll('*')) {
      if (el.children.length && !/^(BUTTON|SVG|OL|UL)$/.test(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 1 || r.width < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const hasInk = (el.textContent || '').trim().length > 0 || el.tagName === 'SVG'
        || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderTopWidth !== '0px';
      if (hasInk) leaves.push([Math.max(r.top, sr.top), Math.min(r.bottom, sr.bottom)]);
    }
    leaves.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [t, b] of leaves) {
      if (merged.length && t <= merged[merged.length - 1][1] + 0.5) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b);
      else merged.push([t, b]);
    }
    const gaps = [];
    let cur = sr.top;
    for (const [t, b] of merged) { if (t - cur > 8) gaps.push({ top: +cur.toFixed(0), h: +(t - cur).toFixed(0) }); cur = Math.max(cur, b); }
    if (sr.bottom - cur > 8) gaps.push({ top: +cur.toFixed(0), h: +(sr.bottom - cur).toFixed(0) });
    gaps.sort((a, b) => b.h - a.h);
    return { stageH: +sr.height.toFixed(0), totalEmpty: +gaps.reduce((s, g) => s + g.h, 0).toFixed(0), biggest: gaps.slice(0, 3) };
  });

  // ═══ LIBRARY: wrong-guess bits + naming act + quotes ═════════════════════
  await openRoom('library', { col: 2, row: 2 }, 'web-1');
  R.library = { dead: await deadSpace() };
  R.library.quotes = await page.evaluate(() => [...document.querySelectorAll('.anch--library *')]
    .filter(e => !e.children.length && /["“”]/.test(e.textContent || ''))
    .map(e => ({ t: e.textContent.trim().slice(0, 40), codes: [...e.textContent].filter(c => /["“”]/.test(c)).map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()) })));
  // deliberate wrong guess: pick 4 tiles from 4 different groups
  const board = JSON.parse(readFileSync(resolve(root, 'content/generated/word-web.json'), 'utf8')).find(b => b.id === 'web-1');
  R.library.board = { amb: board.ambiguousWords, groups: board.groups.map(g => g.theme) };
  const mixed = board.groups.map(g => g.words[0]);
  const clickWords = async (ws) => {
    for (const w of ws) {
      const tiles = await page.$$('.ww-tile');
      let hit = false;
      for (const t of tiles) {
        const txt = (await t.innerText()).trim().toUpperCase();
        if (txt === w.toUpperCase()) { await t.click(); hit = true; break; }
      }
      if (!hit) log('!! tile not found', w);
      await sleep(90);
    }
  };
  await clickWords(mixed);
  await page.click('.anch-btn--primary', { timeout: 4000 }).catch(() => log('!! weave disabled (plain)'));
  await sleep(1800);
  R.library.plainWrongToast = await page.evaluate(() => document.querySelector('.anch-toast')?.textContent ?? null);
  R.library.stepsAfterWrong = (await store()).steps;
  await shot('lib-10-plainwrong');
  // herring guess: include both ambiguous words
  await page.click('.anch-btn:has-text("Clear")').catch(() => {});
  await sleep(300);
  const herringSel = [...board.ambiguousWords];
  for (const g of board.groups) for (const w of g.words) { if (herringSel.length >= 4) break; if (!herringSel.includes(w)) herringSel.push(w); }
  await clickWords(herringSel);
  await page.click('.anch-btn--primary', { timeout: 4000 }).catch(() => log('!! weave disabled (herring)'));
  await sleep(1800);
  R.library.herringToast = await page.evaluate(() => document.querySelector('.anch-toast')?.textContent ?? null);
  await shot('lib-11-herring');
  R.library.hintButton = await page.evaluate(() => [...document.querySelectorAll('.anch-btn')].map(b => b.textContent.trim()));
  // solve to the naming act
  await page.click('.anch-btn:has-text("Clear")').catch(() => {});
  for (const g of board.groups) {
    await sleep(400);
    await clickWords(g.words);
    await page.click('.anch-btn--primary', { timeout: 4000 }).catch(() => log('!! weave disabled (solve)'));
    await sleep(2200);
  }
  R.library.naming = await page.evaluate(() => {
    const n = document.querySelector('.ww-naming, [class*=naming]');
    return n ? n.textContent.trim().slice(0, 240) : null;
  });
  await shot('lib-12-naming');
  R.library.deadSolved = await deadSpace();
  await leave();

  // ═══ CONSERVATORY → Every Petal ══════════════════════════════════════════
  const hp = hivePool[0];
  await openRoom('conservatory', { col: 3, row: 2 }, hp.id);
  R.hive = { id: hp.id, wordCount: hp.validWords.length, dead: await deadSpace() };
  R.hive.geomStart = await page.evaluate(() => { const c = document.querySelector('.hv-cell'); const r = c.getBoundingClientRect(); const h = document.querySelector('.hv, .hv-hive, .anch--conservatory svg')?.getBoundingClientRect(); return { cellW: +r.width.toFixed(1), cellH: +r.height.toFixed(1), cellTop: +r.top.toFixed(1), hiveW: h && +h.width.toFixed(1) }; });
  let bloomCaptured = false;
  for (let i = 0; i < hp.validWords.length; i++) {
    const w = hp.validWords[i];
    await page.keyboard.type(w, { delay: 4 });
    await page.keyboard.press('Enter');
    await sleep(70);
    if (!bloomCaptured) {
      const lad = await page.evaluate(() => document.querySelector('.hv-ladder__name, [class*=ladder]')?.textContent ?? '');
      if (/Full Bloom/.test(lad)) {
        bloomCaptured = true; await sleep(1400); await shot('hive-10-fullbloom');
        R.hive.geomBloom = await page.evaluate(() => { const c = document.querySelector('.hv-cell'); const r = c.getBoundingClientRect(); return { cellW: +r.width.toFixed(1), cellH: +r.height.toFixed(1), cellTop: +r.top.toFixed(1) }; });
        R.hive.deadBloom = await deadSpace();
      }
    }
    if (await page.$('.anch-done__title')) break;
  }
  await sleep(1200);
  R.hive.everyPetalPanel = await page.evaluate(() => {
    const t = document.querySelector('.anch-done__title')?.textContent ?? null;
    return t && { title: t, fern: document.querySelector('.anch-done__fern')?.textContent, line: document.querySelector('.anch-done__line')?.textContent };
  });
  R.hive.gems = (await store()).gems;
  await shot('hive-11-everypetal');
  await leave();

  // ═══ GALLERY solved ══════════════════════════════════════════════════════
  await openRoom('gallery', { col: 6, row: 2 });
  R.twistle = { dead: await deadSpace() };
  await leave();
  // ═══ others ══════════════════════════════════════════════════════════════
  for (const [card, cell] of [['study', { col: 2, row: 3 }], ['darkroom', { col: 4, row: 2 }], ['linen-closet', { col: 3, row: 3 }], ['counting-house', { col: 5, row: 2 }]]) {
    if (await openRoom(card, cell)) { R[card] = { dead: await deadSpace() }; await leave(); }
  }

  writeFileSync(join(OUT, 'results2.json'), JSON.stringify(R, null, 1));
  log('written');
} finally { await browser.close(); }
