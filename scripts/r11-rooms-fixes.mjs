/**
 * ROUND 11 — verification for this round's room fixes (AAA §0.4: driven, not
 * photographed).
 *
 *   11.1 / 1.5  the Conservatory's found-list toggle no longer unmounts the
 *               playfield (hive, entry line and the Delete/Shuffle/ENTER deck
 *               stay mounted, sized and hit-testable while the sheet is open)
 *               and the collapsed strip is not printed a second time
 *   3.7         the Study headlines the POETRY at tier 1 with the plain gloss
 *               free beneath it, and prints the rest of the entry on the win
 *
 * The Gallery's win-headline hit test lives in scripts/r10-room-gaps.mjs,
 * beside the rest of the room-gap probes.
 *
 * Harness rules (this dev box): system Edge via channel 'msedge', ONE browser,
 * closed in a finally, 390x844 @2x, sequential routes.
 *
 * Usage: node scripts/r11-rooms-fixes.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round11-rooms');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] ?? process.env.MANOR_URL ?? 'http://localhost:5741/LexiconManor/';
const load = (f) => JSON.parse(readFileSync(resolve(root, 'content/generated', f), 'utf8'));
const hives = load('hive.json');
const fws = load('forgotten-word.json');
const R = {};
const log = (...a) => console.log('[r11]', ...a);

const KIND = { conservatory: 'hive', study: 'forgotten-word' };
const ROOT = { hive: '.anch--conservatory', 'forgotten-word': '.anch--study' };

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
      const st = await page.evaluate(() => {
        const s = window.__manorStore?.getState();
        return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor };
      });
      if (st.phase === 'exploring' && st.hasManor) return true;
      if (await page.$('.dlg')) {
        const p = await page.$('.dlg-choice--primary');
        if (p) await p.click();
        else {
          const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
          if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown');
        }
        await sleep(200); continue;
      }
      const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(500); continue; }
      const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(500); continue; }
      const any = await page.$('button'); if (any && st.phase === null) { await any.click(); await sleep(400); continue; }
      await sleep(300);
    }
    return false;
  }
  async function openRoom(cardId, cell, tier = 1) {
    if (!(await ensureExploring())) throw new Error('never reached exploring');
    const kind = KIND[cardId];
    await page.evaluate(({ cardId, cell, kind }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell,
        rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N', 'S', 'E', 'W'], solved: false, kind } } } });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, cell, kind });
    await page.waitForSelector(ROOT[kind], { timeout: 10000 });
    void tier;
    await sleep(500);
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(500); };
  const clearMoments = async () => {
    for (let i = 0; i < 6; i++) {
      const gone = await page.evaluate(() => {
        const m = document.querySelector('.mom');
        if (!m) return true;
        m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        m.click?.();
        return false;
      });
      if (gone) return;
      await sleep(500);
    }
  };

  /** Box + centre hit test, the §0.4 primitive. */
  const probe = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      y: +r.y.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1),
      inView: r.top >= 0 && r.bottom <= window.innerHeight,
      hit: top === el || el.contains(top) ? 'self' : (top?.className || top?.tagName || 'null'),
    };
  }, sel);

  // ── THE CONSERVATORY: open the found list, is the room still there? ──────
  await openRoom('conservatory', { col: 4, row: 2 });
  const hl = await page.evaluate(() => ({
    center: document.querySelector('.hv-cell--center .hv-cell__g').textContent.trim(),
    outer: [...document.querySelectorAll('.hv-cell:not(.hv-cell--center) .hv-cell__g')].map((e) => e.textContent.trim()),
  }));
  const hive = hives.find((p) => p.center === hl.center && p.outer.length === hl.outer.length
    && p.outer.every((l) => hl.outer.includes(l)));
  R.conservatory = { boardId: hive?.id ?? null };
  if (hive) {
    for (const w of [...hive.validWords].sort((a, b) => b.length - a.length).slice(0, 10)) {
      await page.keyboard.type(w); await page.keyboard.press('Enter'); await sleep(140);
    }
    await sleep(400);
    await clearMoments();

    const snapshot = async () => ({
      hive: await probe('.hv-board'),
      entry: await probe('.hv-entry'),
      deck: await probe('.room-deck'),
      enter: await page.evaluate(() => {
        const b = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Enter');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { y: +r.y.toFixed(1), h: +r.height.toFixed(1), hit: top === b || b.contains(top) ? 'self' : (top?.className ?? 'null') };
      }),
      shuffle: await page.evaluate(() => !!([...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Shuffle'))),
      del: await page.evaluate(() => !!([...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Delete'))),
      stripChips: await page.$$eval('.hv-found__strip > *', (els) => els
        .filter((e) => getComputedStyle(e).visibility !== 'hidden')
        .map((e) => e.textContent.trim())),
      sheetChips: await page.$$eval('.hv-foundsheet .anch-chip', (els) => els.map((e) => e.textContent.trim()))
        .catch(() => []),
    });

    R.conservatory.closed = await snapshot();
    await shot('conservatory-closed');
    await page.click('.hv-found__toggle');
    await sleep(400);
    R.conservatory.open = await snapshot();
    R.conservatory.sheet = await probe('.hv-foundsheet');
    R.conservatory.duplicated = R.conservatory.open.stripChips
      .filter((w) => R.conservatory.open.sheetChips.includes(w));
    await shot('conservatory-found-open');
    // …and the board underneath is still LIVE: type a word with the sheet up.
    const stillPlayable = await page.evaluate(() => {
      const cell = document.querySelector('.hv-cell--center');
      const r = cell.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { centreHexHit: top === cell || cell.contains(top) ? 'self' : (top?.className ?? 'null') };
    });
    R.conservatory.open.centreHexHit = stillPlayable.centreHexHit;
    await page.click('.hv-found__toggle');
    await sleep(300);
    R.conservatory.reclosed = await snapshot();
  }
  await leave();

  // ── THE STUDY: which register is the headline at tier 1? ────────────────
  await openRoom('study', { col: 1, row: 1 });
  await clearMoments();
  R.study = await page.evaluate(() => ({
    tierRule: document.querySelector('.anch__rule')?.textContent.trim() ?? null,
    headline: document.querySelector('.fw-def__text')?.textContent.trim() ?? null,
    gloss: document.querySelector('.fw-def__gloss')?.textContent.trim() ?? null,
  }));
  const entry = fws.find((p) => R.study.headline?.includes(p.definitions.poetic.slice(0, 24)));
  R.study.matched = entry ? { id: entry.id, tier: entry.tier } : null;
  R.study.headlineIsPoetic = !!entry && R.study.headline.includes(entry.definitions.poetic);
  R.study.glossIsPlain = !!entry && R.study.gloss === entry.definitions.plain;
  await shot('study-tier1');
  if (entry) {
    // …and the two registers the puzzle did not use are printed on the win,
    // so nothing authored to the 3.7 standard is unreachable (round 11).
    await page.fill('.fw-input', entry.word);
    await page.click('.anch-btn--primary');
    await page.waitForTimeout(entry.word.length * 110 + 900);
    await clearMoments();
    R.study.win = await page.evaluate(() => ({
      cap: document.querySelector('.fw-entry__cap')?.textContent.trim() ?? null,
      lines: [...document.querySelectorAll('.fw-entry__line')].map((e) => e.textContent.trim()),
    }));
    R.study.winShowsEveryRegister = ['plain', 'poetic', 'riddle'].every((k) => {
      const line = entry.definitions[k];
      return R.study.win.lines.includes(line) || R.study.headline.includes(line) || R.study.gloss === line;
    });
    await shot('study-won');
  }
  await leave();

  writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(R, null, 2));
  log(JSON.stringify(R, null, 2));
} finally {
  await browser.close();
}
