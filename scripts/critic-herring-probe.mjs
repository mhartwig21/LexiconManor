/** The acknowledged herring (AAA 2.10) + toast legibility window. ONE Edge. */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/critic-rooms');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5741/LexiconManor/';
const webs = JSON.parse(readFileSync(resolve(root, 'content/generated/word-web.json'), 'utf8'));
const fws = JSON.parse(readFileSync(resolve(root, 'content/generated/forgotten-word.json'), 'utf8'));
const R = {};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
  await sleep(600);
  for (let i = 0; i < 90; i++) {
    const st = await page.evaluate(() => { const s = window.__manorStore?.getState(); return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor }; });
    if (st.phase === 'exploring' && st.hasManor) break;
    if (await page.$('.dlg')) {
      const p = await page.$('.dlg-choice--primary');
      if (p) await p.click();
      else { const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown'); }
      await sleep(180); continue;
    }
    const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(400); continue; }
    const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(400); continue; }
    const any = await page.$('button'); if (any && st.phase === null) { await any.click(); await sleep(350); continue; }
    await sleep(250);
  }
  const enter = async (cardId, kind, cell, sel) => {
    await page.evaluate(({ cardId, kind, cell }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ day: { ...st.day, steps: 400 }, manor: { ...st.manor, playerCell: cell,
        rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind } } } });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, kind, cell });
    await page.waitForSelector(sel, { timeout: 10000 }); await sleep(600);
  };
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(400); };

  // ── Library: force a selection that is a genuine herring chase ───────────
  await enter('library', 'word-web', { col: 1, row: 4 }, '.anch--library');
  const tiles = await page.$$eval('.ww-tile', (e) => e.map((x) => x.textContent.trim()));
  const board = webs.find((b) => b.layout.length === tiles.length && b.layout.every((w) => tiles.includes(w)));
  R.boardId = board.id; R.tier = board.tier;
  const h = (board.herrings || [])[0];
  const groups = board.groups;
  const together = (sel) => Math.max(...groups.map((g) => sel.filter((w) => g.words.includes(w)).length));
  let pick = null;
  if (h) {
    const combos = [];
    const H = h.words.filter((w) => tiles.includes(w));
    for (let a = 0; a < H.length; a++) for (let b = a + 1; b < H.length; b++) for (let c = b + 1; c < H.length; c++) {
      const trio = [H[a], H[b], H[c]];
      for (const x of tiles) {
        if (trio.includes(x)) continue;
        const sel = [...trio, x];
        if (together(sel) <= 2) { combos.push(sel); }
      }
    }
    pick = combos[0] ?? null;
  }
  R.herringDef = h; R.selection = pick; R.together = pick ? together(pick) : null;
  const tap = (w) => page.evaluate((word) => { const t = [...document.querySelectorAll('.ww-tile')].find((e) => e.textContent.trim() === word);
    t?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })); t?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); }, w);
  if (pick) {
    for (const w of pick) { await tap(w); await sleep(70); }
    await sleep(150);
    await page.evaluate(() => { const b = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Weave'); if (b && !b.disabled) b.click(); });
    // sample the toast every 100ms for 8s
    const timeline = [];
    for (let t = 0; t < 80; t++) {
      const s = await page.evaluate(() => {
        const el = document.querySelector('.anch-toast');
        if (!el) return null;
        const bit = el.querySelector('.anch-toast__bit');
        const r = el.getBoundingClientRect();
        return { main: el.firstChild?.textContent?.trim() ?? el.textContent.trim(), bit: bit ? bit.textContent.trim() : null,
          op: +getComputedStyle(el).opacity, y: +r.y.toFixed(0), h: +r.height.toFixed(0),
          inView: r.top >= 0 && r.bottom <= window.innerHeight };
      });
      timeline.push({ ms: t * 100, s });
      await sleep(100);
    }
    R.timeline = timeline.filter((x, i) => i % 3 === 0 || (x.s && x.s.bit));
    R.bitEverSeen = timeline.some((x) => x.s && x.s.bit);
    R.bitVisibleMs = timeline.filter((x) => x.s && x.s.bit && x.s.op > 0.5).length * 100;
    R.toastVisibleMs = timeline.filter((x) => x.s && x.s.main && x.s.op > 0.5).length * 100;
    R.finalToast = timeline[timeline.length - 1].s;
    await page.screenshot({ path: join(OUT, 'lib-herring-bit.png') });
  }
  // 375x667 layout of the library
  await page.setViewportSize({ width: 375, height: 667 }); await sleep(700);
  R.at375 = await page.evaluate(() => {
    const grid = document.querySelector('.ww-grid'); const deck = document.querySelector('.room-deck');
    const stage = document.querySelector('.room-stage');
    const gr = grid?.getBoundingClientRect(); const dr = deck?.getBoundingClientRect();
    const weave = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Weave');
    const wr = weave?.getBoundingClientRect();
    const hit = wr ? document.elementFromPoint(wr.x + wr.width / 2, wr.y + wr.height / 2) : null;
    return { grid: gr ? { y: +gr.y.toFixed(1), bottom: +gr.bottom.toFixed(1) } : null,
      deck: dr ? { y: +dr.y.toFixed(1), bottom: +dr.bottom.toFixed(1) } : null,
      weave: wr ? { h: +wr.height.toFixed(1), w: +wr.width.toFixed(1), bottom: +wr.bottom.toFixed(1), inView: wr.top >= 0 && wr.bottom <= window.innerHeight, hit: hit === weave || weave.contains(hit) ? 'self' : (hit?.className ?? 'null') } : null,
      vh: window.innerHeight, stageOver: stage ? stage.scrollHeight - stage.clientHeight : null,
      docOver: document.documentElement.scrollHeight - window.innerHeight };
  });
  await page.screenshot({ path: join(OUT, 'lib-375.png') });
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  await leave();

  // ── Study: what does a tier-3 room actually show? ────────────────────────
  await enter('study', 'forgotten-word', { col: 2, row: 5 }, '.anch--study');
  R.study = await page.evaluate(() => {
    const t = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
    return {
      texts: [...document.querySelectorAll('.anch--study p, .anch--study .anch-card, .anch--study h2, .anch--study h3, .anch--study div')]
        .map((e) => e.children.length === 0 ? e.textContent.trim() : null).filter((x) => x && x.length > 12).slice(0, 20),
      rule: t('.anch__rule'), flavour: t('.anch__flavour'),
      clueButtons: [...document.querySelectorAll('.anch-btn')].map((b) => b.textContent.trim()),
    };
  });
  const fwWord = await page.evaluate(() => window.__manorStore.getState().day?.activeRoom ?? null);
  R.study.tierFromRoom = fwWord;
  await page.screenshot({ path: join(OUT, 'study-t3.png') });
  void fws;

  writeFileSync(join(OUT, 'herring.json'), JSON.stringify(R, null, 1));
  console.log(JSON.stringify(R, null, 1).slice(0, 9000));
} finally {
  await browser.close();
}
