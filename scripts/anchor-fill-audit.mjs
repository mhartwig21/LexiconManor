/**
 * ANCHOR FILL AUDIT — the empty-parchment assertion (AAA §0.1 side-by-side,
 * 2.1 legibility at iPhone size). OWNER: anchor-rooms.
 *
 * WHY THIS EXISTS. Round 6 measured, at 390×844, that the Library left 341 of
 * 721 stage px empty (47%) — a 136px void above the title and a 133px void
 * below the button row — while running 84×58 tiles against NYT Connections'
 * ~89×90 at the same width. The Study measured 54% empty. Both were LAYOUT
 * CHOICES (fixed-size boards centred in a tall flex column), not constraints:
 * the Counting House composes to 9% empty on the same glass. Side by side with
 * the benchmark the Library read as a smaller game on the same phone, and no
 * test could say so — the round-6 probe measured the ratio and only printed it.
 *
 * It is an ASSERTION now. A future layout edit that re-opens the void fails
 * the tour instead of shipping. The measurement is the drop-in from
 * scripts/r6-critic-rooms2.mjs; only the pass/fail contract is new.
 *
 * Harness rules (AAA §0.4, non-negotiable on this box):
 *   - system Edge (`channel: 'msedge'`), never a downloaded browser;
 *   - ONE browser instance, one context, sequential routes;
 *   - viewport 390×844.
 *
 * Run:  npm run build && npx vite preview   (then, in another shell)
 *       node scripts/anchor-fill-audit.mjs
 * Exit code 1 on any room over budget, so it can gate a round.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/anchor-fill');
const BASE = process.env.MANOR_URL ?? 'http://localhost:4173/LexiconManor/';
mkdirSync(OUT, { recursive: true });

/**
 * Budgets, per room, as a fraction of the stage — a RATCHET, not an ideal.
 * Each is set just above the value measured after the round-7 layout pass, so
 * the number that ships is the number that is defended and any regression
 * trips the tour. Round-6 baselines are recorded beside them.
 *
 * A single cross-room number would be the wrong contract: a room with a 16-tile
 * board can bury the glass in ink, and a room whose entire content is one
 * sentence, two drawers and a text field cannot. What both owe is (a) no
 * regression and (b) no single hole big enough to read as a missing element —
 * that second part is MAX_VOID_PX, and it is the same for everybody.
 */
const BUDGET = {
  library: 0.28,       // round 6: 0.47 (341/721) with 84×58 tiles → now 0.26 at 84×96
  conservatory: 0.34,  // round 6: 0.34 → now 0.33 with a 335px hive (was 300px)
  gallery: 0.32,       // round 6: 0.30 (unchanged this round; no board resize)
  study: 0.40,         // round 6: 0.54 (391/721) with a 149px hole → now 0.38, no hole
};

/**
 * The single largest contiguous void is its own failure mode: the round-6
 * Study carried a 149px hole above its footer and the Darkroom a 185px one
 * mid-screen. A gap that size reads as an element that failed to render.
 *
 * The Conservatory is the one documented exception, and it is a DESIGN, not a
 * hole: `.hv-spacer` (anchor.css) deliberately banks the column's slack ABOVE
 * the entry/hive/controls cluster so the flower sits in the bottom-half thumb
 * zone and the room is playable one-handed for a full session (AAA 1.1
 * [PARITY]). Spelling Bee composes the same way. The allowance is set to the
 * measured value so it still ratchets — it does not mean "unbounded".
 */
const MAX_VOID_PX = 120;
const MAX_VOID_BY_ROOM = { conservatory: 175 };

const ROOM_KIND = { library: 'word-web', conservatory: 'hive', gallery: 'twistle', study: 'forgotten-word' };
const ROOM_ROOT = {
  'word-web': '.anch--library', hive: '.anch--conservatory',
  twistle: '.anch--gallery', 'forgotten-word': '.anch--study',
};
const CELL = { library: { col: 2, row: 2 }, conservatory: { col: 3, row: 2 }, gallery: { col: 6, row: 2 }, study: { col: 2, row: 3 } };

const log = (...a) => console.log('[fill]', ...a);
const results = {};
let failures = 0;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sleep = (ms) => page.waitForTimeout(ms);

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

  async function openRoom(cardId) {
    if (!(await ensureExploring())) return false;
    const kind = ROOM_KIND[cardId];
    await page.evaluate(({ cardId, cell, kind }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({
        manor: {
          ...st.manor, playerCell: cell,
          rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N', 'S', 'E', 'W'], solved: false, kind } },
        },
      });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, cell: CELL[cardId], kind });
    const ok = await page.waitForSelector(ROOM_ROOT[kind], { timeout: 10000 }).catch(() => null);
    await sleep(500);
    return !!ok;
  }

  /** Empty-parchment audit: rows of the stage with no painted content. */
  const deadSpace = () => page.evaluate(() => {
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
      if (merged.length && t <= merged[merged.length - 1][1] + 0.5) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b);
      } else merged.push([t, b]);
    }
    const gaps = [];
    let cur = sr.top;
    for (const [t, b] of merged) { if (t - cur > 8) gaps.push({ top: +cur.toFixed(0), h: +(t - cur).toFixed(0) }); cur = Math.max(cur, b); }
    if (sr.bottom - cur > 8) gaps.push({ top: +cur.toFixed(0), h: +(sr.bottom - cur).toFixed(0) });
    gaps.sort((a, b) => b.h - a.h);
    return {
      stageH: +sr.height.toFixed(0),
      totalEmpty: +gaps.reduce((s, g) => s + g.h, 0).toFixed(0),
      biggest: gaps.slice(0, 3),
    };
  });

  /** The tile geometry the side-by-side actually compares (AAA 2.1). */
  const tileBox = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  }, sel);

  for (const card of Object.keys(BUDGET)) {
    if (!(await openRoom(card))) { log('!! could not open', card); failures++; continue; }
    const dead = await deadSpace();
    const ratio = dead.totalEmpty / dead.stageH;
    const biggest = dead.biggest[0]?.h ?? 0;
    const row = { ...dead, ratio: +ratio.toFixed(3), budget: BUDGET[card] };
    if (card === 'library') row.tile = await tileBox('.ww-tile');
    if (card === 'conservatory') row.tile = await tileBox('.hv-cell');
    await page.screenshot({ path: join(OUT, `${card}.png`) });

    const voidCap = MAX_VOID_BY_ROOM[card] ?? MAX_VOID_PX;
    const overRatio = ratio > BUDGET[card];
    const overVoid = biggest > voidCap;
    row.pass = !overRatio && !overVoid;
    if (!row.pass) {
      failures++;
      log(`FAIL ${card}: ${dead.totalEmpty}/${dead.stageH}px empty (${(ratio * 100).toFixed(0)}%, budget ${(BUDGET[card] * 100).toFixed(0)}%)`,
        overVoid ? `— largest single void ${biggest}px > ${voidCap}px` : '');
    } else {
      log(`pass ${card}: ${(ratio * 100).toFixed(0)}% empty, largest void ${biggest}px`, row.tile ? JSON.stringify(row.tile) : '');
    }
    results[card] = row;
    await page.evaluate(() => window.__manorStore.getState().leaveRoom());
    await sleep(400);
  }

  writeFileSync(join(OUT, 'fill.json'), JSON.stringify(results, null, 1));
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`[fill] ${failures} room(s) over the empty-parchment budget`);
  process.exit(1);
}
log('all anchor rooms inside the empty-parchment budget');
