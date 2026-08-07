/** ROUND 11 probe 2 — system Edge, ONE instance, closed in a finally, 390x844@2x. */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round11-critic');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] ?? 'http://localhost:5741/LexiconManor/';
const load = (f) => JSON.parse(readFileSync(resolve(root, 'content/generated', f), 'utf8'));
const hives = load('hive.json'); const webs = load('word-web.json');
const R = {};
const KIND = { conservatory: 'hive', library: 'word-web', study: 'forgotten-word' };
const ROOT = { hive: '.anch--conservatory', 'word-web': '.anch--library', 'forgotten-word': '.anch--study' };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: join(OUT, n + '.png') });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
  await sleep(600);
  async function ensureExploring() {
    for (let i = 0; i < 80; i++) {
      const st = await page.evaluate(() => { const s = window.__manorStore?.getState(); return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor }; });
      if (st.phase === 'exploring' && st.hasManor) return true;
      if (await page.$('.dlg')) { const p = await page.$('.dlg-choice--primary');
        if (p) await p.click(); else { const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown'); }
        await sleep(200); continue; }
      const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(500); continue; }
      const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(500); continue; }
      const any = await page.$('button'); if (any && st.phase === null) { await any.click(); await sleep(400); continue; }
      await sleep(300);
    }
    return false;
  }
  async function openRoom(cardId, cell, tier) {
    if (!(await ensureExploring())) throw new Error('no exploring');
    const kind = KIND[cardId];
    await page.evaluate(({ cardId, cell, kind }) => { const st = window.__manorStore.getState(); const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell, steps: 99,
        rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind } } } });
      window.__manorStore.getState().enterRoom(key); }, { cardId, cell, kind });
    await page.waitForSelector(ROOT[kind], { timeout: 10000 }); await sleep(500);
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(500); };
  const clearMoments = async () => { for (let i = 0; i < 8; i++) {
    const gone = await page.evaluate(() => { const m = document.querySelector('.mom'); if (!m) return true;
      m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.click?.(); return false; }); if (gone) return; await sleep(400); } };

  // ── 1. Moment card: does it block the room it fires over? ──────────────
  await openRoom('conservatory', { col: 4, row: 2 });
  R.moment = await page.evaluate(() => { const m = document.querySelector('.mom'); if (!m) return { present: false };
    const cs = getComputedStyle(m); const r = m.getBoundingClientRect();
    return { present: true, pointerEvents: cs.pointerEvents, zIndex: cs.zIndex, position: cs.position,
      y: +r.y.toFixed(1), bottom: +r.bottom.toFixed(1), text: m.innerText.slice(0, 120).replace(/\n/g, ' | ') }; });
  await clearMoments();

  // ── 2. Conservatory: expand the found list; is the board still playable?
  const hl = await page.evaluate(() => ({ center: document.querySelector('.hv-cell--center .hv-cell__g').textContent.trim(),
    outer: [...document.querySelectorAll('.hv-cell:not(.hv-cell--center) .hv-cell__g')].map((e) => e.textContent.trim()) }));
  const hive = hives.find((p) => p.center === hl.center && p.outer.length === hl.outer.length && p.outer.every((l) => hl.outer.includes(l)));
  const snapshot = () => page.evaluate(() => {
    const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { y: +r.y.toFixed(1), bottom: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        inView: r.top >= 0 && r.bottom <= innerHeight, hit: (top === e || e.contains(top)) ? 'self' : (top?.className?.baseVal ?? top?.className ?? 'null') }; };
    const btn = (label) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === label); if (!b) return null;
      const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { y: +r.y.toFixed(1), bottom: +r.bottom.toFixed(1), inView: r.top >= 0 && r.bottom <= innerHeight,
        hit: (top === b || b.contains(top)) ? 'self' : (top?.className ?? 'null') }; };
    return { hive: q('.hv-board, .hv, svg.hv-svg, .hv-cell'), entry: q('.hv-entry'), deck: q('.room-deck'),
      enter: btn('Enter'), shuffle: btn('Shuffle'), del: btn('Delete'),
      dupChips: (() => { const strip = [...(document.querySelector('.hv-found__strip')?.children ?? [])].map(c => c.textContent.trim());
        const panel = [...document.querySelectorAll('.hv-found__panel .anch-chip, .hv-found__all .anch-chip, .hv-found__list .anch-chip')].map(c => c.textContent.trim());
        return { strip, panel, overlap: strip.filter(w => panel.includes(w)) }; })(),
      stageScrollH: document.querySelector('.room-host__stage')?.scrollHeight ?? null,
      stageH: document.querySelector('.room-host__stage')?.clientHeight ?? null };
  });
  if (hive) {
    const words = [...hive.validWords].sort((a, b) => b.length - a.length).slice(0, 10);
    for (const w of words) { await page.keyboard.type(w); await page.keyboard.press('Enter'); await sleep(130); }
    await sleep(400);
    R.conservatoryClosed = await snapshot();
    await page.evaluate(() => { const b = document.querySelector('.hv-found__more, .hv-found__toggle, .hv-found button'); b?.click(); });
    await sleep(500);
    R.conservatoryOpen = await snapshot();
    await shot('conservatory-found-expanded');
  }
  await leave();

  // ── 3. Library: the one-away bit (2.10) ────────────────────────────────
  await openRoom('library', { col: 1, row: 2 });
  await clearMoments();
  const tiles = await page.$$eval('.ww-tile', (els) => els.map((e) => e.textContent.trim()));
  const web = webs.find((b) => b.layout.length === tiles.length && b.layout.every((w, i) => w === tiles[i]));
  R.library = { boardId: web?.id, tier: web?.tier };
  const guess = async (words) => {
    await page.evaluate(() => document.querySelectorAll('.ww-tile--selected').forEach((t) => t.click()));
    for (const w of words) { await page.evaluate((x) => { const t = [...document.querySelectorAll('.ww-tile')].find((e) => e.textContent.trim() === x); t?.click(); }, w); await sleep(70); }
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Weave'); b?.click(); });
    await sleep(1150);
    return page.evaluate(() => { const root = document.querySelector('.anch--library');
      const t = root.querySelector('.anch-toast');
      return { main: t?.childNodes[0]?.textContent?.trim() ?? null, bit: root.querySelector('.anch-toast__bit')?.textContent.trim() ?? null,
        kind: t?.className ?? null, sel: root.querySelectorAll('.ww-tile--selected').length }; });
  };
  if (web) {
    const y = web.groups.find((g) => g.tier === 'yellow'); const o = web.groups.find((g) => g.tier !== 'yellow');
    R.library.oneAway = { picked: [...y.words.slice(0, 3), o.words[0]], notices: await guess([...y.words.slice(0, 3), o.words[0]]) };
    const h = web.herrings?.[0];
    if (h) R.library.herring = { picked: h.words.slice(0, 4), notices: await guess(h.words.slice(0, 4)) };
    R.library.scattered = { picked: web.groups.map((g) => g.words[0]), notices: await guess(web.groups.map((g) => g.words[0])) };
    await shot('library-bits');
  }
  await leave();

  // ── 4. Study at tier 3 ─────────────────────────────────────────────────
  await openRoom('study', { col: 5, row: 5 });
  await clearMoments();
  R.study3 = await page.evaluate(() => ({ tier: window.__manorStore.getState().room?.state?.tier ?? null,
    text: document.querySelector('.anch--study')?.innerText.slice(0, 700) }));
  await shot('study-t3');
  writeFileSync(join(OUT, 'metrics2.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
} finally { await browser.close(); }
