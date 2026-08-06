/** ROUND 7 anchor probe (temporary evidence run). System Edge, ONE instance. */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round7-anchor');
const BASE = process.env.MANOR_URL ?? 'http://localhost:4183/LexiconManor/';
mkdirSync(OUT, { recursive: true });
const boards = JSON.parse(readFileSync(resolve(root, 'content/generated/word-web.json'), 'utf8'));
const hives = JSON.parse(readFileSync(resolve(root, 'content/generated/hive.json'), 'utf8'));
const R = {};
const log = (...a) => console.log('[r7]', ...a);

const ROOM_KIND = { library: 'word-web', conservatory: 'hive', study: 'forgotten-word' };
const ROOM_ROOT = { 'word-web': '.anch--library', hive: '.anch--conservatory', 'forgotten-word': '.anch--study' };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);
  const shot = (n) => page.screenshot({ path: join(OUT, n + '.png') });

  await page.goto(BASE, { waitUntil: 'networkidle' });
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
  async function openRoom(cardId, cell, puzzleId) {
    if (!(await ensureExploring())) { log('!! no exploring'); return false; }
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
  const steps = () => page.evaluate(() => window.__manorStore.getState().stepsRemaining());
  const toast = () => page.evaluate(() => {
    const t = document.querySelector('.anch-toast');
    if (!t) return null;
    const bit = t.querySelector('.anch-toast__bit');
    return { main: (t.childNodes[0]?.textContent ?? '').trim(), bit: bit?.textContent?.trim() ?? null };
  });
  /**
   * Behaviour probe only: pointer events are dispatched straight at the tile,
   * bypassing the actionability/hit-test path. Reachability is §11's audit and
   * a different owner's; this run is measuring what the room SAYS.
   */
  const clickWords = async (ws) => {
    for (const w of ws) {
      const hit = await page.evaluate((word) => {
        const t = [...document.querySelectorAll('.ww-tile')]
          .find((el) => el.textContent.trim().toUpperCase() === word.toUpperCase());
        if (!t) return false;
        t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return true;
      }, w);
      if (!hit) log('!! tile not found', w);
      await sleep(70);
    }
  };
  const pressBtn = (text) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim().startsWith(t));
    if (!b) return false;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    b.click();
    return true;
  }, text);

  // ── LIBRARY: the two information bits ────────────────────────────────────
  // RoomHost re-selects by tier+seed and ignores the pinned puzzleId, so the
  // board is identified from the tiles on the glass, not assumed.
  await openRoom('library', { col: 2, row: 5 });
  const shown = await page.evaluate(() => [...document.querySelectorAll('.ww-tile')].map((t) => t.textContent.trim()));
  const board = boards.find((b) => {
    const ws = new Set(b.groups.flatMap((g) => g.words));
    return shown.length === 16 && shown.every((w) => ws.has(w));
  });
  if (!board) { log('!! could not identify the board from', shown.join(',')); }
  R.board = board && { id: board.id, tier: board.tier, amb: board.ambiguousWords, herrings: board.herrings, groups: board.groups.map((g) => g.theme) };

  // (a) scattered wrong guess — one word from each of the four groups.
  const before = await steps();
  await clickWords((board?.groups ?? []).map((g) => g.words[0]));
  log('weave scattered', await pressBtn('Weave'));
  await sleep(1600);
  R.scattered = { toast: await toast(), stepsBefore: before, stepsAfter: await steps() };
  await shot('lib-scattered');

  // (b) a guess that really chases the trap: 3 of the herring set + 1 other.
  await pressBtn('Clear');
  await sleep(300);
  const all = board ? board.groups.flatMap((g) => g.words) : [];
  const overlap = (sel) => Math.max(...board.groups.map((g) => sel.filter((w) => g.words.includes(w)).length));
  let chase = null;
  outer: for (const h of (board?.herrings ?? [])) {
    for (let i = 0; i < h.words.length; i++) for (let j = i + 1; j < h.words.length; j++) for (let k = j + 1; k < h.words.length; k++) {
      const base = [h.words[i], h.words[j], h.words[k]];
      for (const w of all) {
        if (base.includes(w)) continue;
        const sel = [...base, w];
        if (overlap(sel) <= 2) { chase = { sel, relation: h.relation, detail: h.detail }; break outer; }
      }
    }
  }
  if (chase && board) {
    await clickWords(chase.sel);
    log('weave chase', await pressBtn('Weave'));
    await sleep(1600);
    R.chase = { ...chase, toast: await toast(), steps: await steps() };
    await shot('lib-herring');
  }
  await leave();

  // ── STUDY: closeness ─────────────────────────────────────────────────────
  await openRoom('study', { col: 2, row: 3 });
  R.study = { rule: await page.evaluate(() => document.querySelector('.anch__rule')?.textContent) };
  const len = Number((R.study.rule || '').match(/(\d+)/)?.[1] ?? 9);
  await page.fill('.fw-input', 'A'.repeat(Math.max(3, len - 2)));
  await pressBtn('Whisper');
  await sleep(600);
  R.study.wrongLength = await toast();
  await page.fill('.fw-input', 'AEIOU'.repeat(6).slice(0, len));
  await pressBtn('Whisper');
  await sleep(700);
  R.study.wrongGuess = await toast();
  R.study.chips = await page.evaluate(() => [...document.querySelectorAll('.fw-tried__chip')].map((c) => c.textContent.trim()));
  await shot('study-closeness');
  await leave();

  // ── CONSERVATORY: Every Petal ────────────────────────────────────────────
  await openRoom('conservatory', { col: 3, row: 5 });
  const centre = await page.evaluate(() => document.querySelector('.hv-cell--center')?.textContent.trim());
  const outer = await page.evaluate(() => [...document.querySelectorAll('.hv-cell:not(.hv-cell--center)')].map((c) => c.textContent.trim()).sort().join(''));
  const hp = hives.find((h) => h.center === centre && [...h.outer].sort().join('') === outer);
  if (!hp) { log('!! could not identify the hive', centre, outer); }
  R.hive = { id: hp?.id, words: hp?.validWords.length };
  let shotBloom = false, shotPetal = false;
  for (const w of hp.validWords) {
    await page.keyboard.type(w, { delay: 3 });
    await page.keyboard.press('Enter');
    await sleep(60);
    if (!shotBloom && (await page.$('.hv-bloom:not(.hv-bloom--every)'))) { await sleep(700); await shot('hive-fullbloom'); shotBloom = true; }
    if (!shotPetal && (await page.$('.hv-bloom--every'))) {
      await sleep(900);
      R.hive.petalVignette = await page.evaluate(() => ({
        petals: document.querySelectorAll('.hv-bloom--every .hv-bloom__petal').length,
        title: document.querySelector('.hv-bloom--every .hv-bloom__title')?.textContent,
      }));
      await shot('hive-everypetal-vignette');
      shotPetal = true;
    }
  }
  await sleep(2400);
  R.hive.foundLabel = await page.evaluate(() => document.querySelector('.hv-found__toggle')?.textContent?.trim() ?? null);
  R.hive.landing = await page.evaluate(() => ({
    title: document.querySelector('.anch-done__title')?.textContent ?? null,
    fern: document.querySelector('.anch-done__fern')?.textContent ?? null,
    line: document.querySelector('.anch-done__line')?.textContent ?? null,
    trophyChips: document.querySelectorAll('.hv-trophy__list .anch-chip').length,
    hiveStillMounted: !!document.querySelector('.hv-board'),
    vignetteGone: !document.querySelector('.hv-bloom'),
  }));
  R.hive.gems = await page.evaluate(() => window.__manorStore.getState().currencies.gems);
  await shot('hive-everypetal-landing');

  writeFileSync(join(OUT, 'probe.json'), JSON.stringify(R, null, 1));
  log(JSON.stringify(R, null, 1));
} finally { await browser.close(); }
