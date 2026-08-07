/**
 * ROUND 10 — room-level gap verification (Gallery win, Conservatory strip,
 * Counting House cell size, Darkroom idioms, Library wrong-guess bits).
 *
 * Harness rules (AAA §0.4, this dev box): system Edge via channel 'msedge',
 * ONE browser instance, closed in a finally, 390x844 @2x, sequential routes.
 *
 * Usage: node scripts/r10-room-gaps.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round10-rooms');
mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] ?? process.env.MANOR_URL ?? 'http://localhost:5741/LexiconManor/';
const load = (f) => JSON.parse(readFileSync(resolve(root, 'content/generated', f), 'utf8'));
const twistles = load('twistle.json');
const hives = load('hive.json');
const webs = load('word-web.json');
const R = {};
const log = (...a) => console.log('[r10]', ...a);

const KIND = { gallery: 'twistle', conservatory: 'hive', 'counting-house': 'sudoku', darkroom: 'cipher', library: 'word-web' };
const ROOT = { twistle: '.anch--gallery', hive: '.anch--conservatory', sudoku: '.ch', cipher: '.mic--darkroom', 'word-web': '.anch--library' };

// Same king-move solver as engine/twistle.ts, so the probe can trace real words.
const gridSize = (g) => Math.round(Math.sqrt(g.length));
const centerIndex = (n) => { const m = Math.floor((n - 1) / 2); return m * n + m; };
function findPath(grid, word, rules) {
  const target = word.toUpperCase();
  if (target.length < rules.minLength) return null;
  const n = gridSize(grid), centre = centerIndex(n);
  const neigh = (i) => {
    const r = Math.floor(i / n), c = i % n, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
    }
    return out;
  };
  const walk = (path, depth) => {
    if (depth === target.length) return (rules.centerRequired && !path.includes(centre)) ? null : path;
    for (const k of neigh(path[path.length - 1])) {
      if (path.includes(k) || grid[k] !== target[depth]) continue;
      const f = walk([...path, k], depth + 1);
      if (f) return f;
    }
    return null;
  };
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== target[0]) continue;
    const f = walk([i], 1);
    if (f) return f;
  }
  return null;
}

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
  async function openRoom(cardId, cell) {
    if (!(await ensureExploring())) throw new Error('never reached exploring');
    const kind = KIND[cardId];
    await page.evaluate(({ cardId, cell, kind }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell,
        rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind } } } });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, cell, kind });
    await page.waitForSelector(ROOT[kind], { timeout: 10000 });
    await sleep(500);
  }
  const leave = async () => { await page.evaluate(() => window.__manorStore.getState().leaveRoom()); await sleep(500); };
  /** Another owner's campaign-moment card; dismiss it so the shots show the room. */
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
  const box = (sel) => page.$eval(sel, (e) => {
    const r = e.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) };
  });

  // ── 1. THE GALLERY: what the win screen shows ────────────────────────────
  await openRoom('gallery', { col: 3, row: 2 });
  const gridLetters = await page.$$eval('.tw-cell', (els) => els.map((e) => e.childNodes[0].textContent.trim()));
  const tw = twistles.find((p) => p.grid.length === gridLetters.length && p.grid.every((l, i) => l === gridLetters[i]));
  log('gallery board', tw?.id, 'targets', tw?.targetCount);
  R.gallery = { boardId: tw?.id ?? null, size: gridLetters.length };
  if (tw) {
    const tapPath = async (path) => {
      for (const idx of path) {
        await page.evaluate((i) => {
          const el = document.querySelector(`[data-idx="${i}"]`);
          const g = el.closest('.tw-grid');
          const r = el.getBoundingClientRect();
          const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1 };
          g.dispatchEvent(new PointerEvent('pointerdown', o));
          g.dispatchEvent(new PointerEvent('pointerup', o));
        }, idx);
        await sleep(45);
      }
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Claim');
        b?.click();
      });
      await sleep(260);
    };
    for (const w of tw.targetWords.slice(0, tw.targetCount)) {
      const p = findPath(tw.grid, w, tw.rules);
      if (p) await tapPath(p);
    }
    await sleep(900);
    R.gallery.won = await page.$eval('.anch--gallery', (e) => e.className.includes('anch--verdict'));
    R.gallery.hasGrid = !!(await page.$('.tw-hung .tw-grid--hung'));
    R.gallery.threads = await page.$$eval('.tw-thread', (els) => els.length);
    R.gallery.hungCells = await page.$$eval('.tw-cell--hung', (els) => els.length);
    R.gallery.threadOpacity = await page.$eval('.tw-thread', (e) => getComputedStyle(e).opacity).catch(() => null);
    R.gallery.gridBox = await box('.tw-grid--hung').catch(() => null);
    R.gallery.doneBox = await box('.anch-done').catch(() => null);
    R.gallery.emptyBelow = await page.evaluate(() => {
      const d = document.querySelector('.anch-done');
      const stage = document.querySelector('.room-host__stage');
      if (!d || !stage) return null;
      return +(stage.getBoundingClientRect().bottom - d.getBoundingClientRect().bottom).toFixed(1);
    });
    /**
     * ROUND 11 (AAA 3.4 / 11.2) — THE WIN HEADLINE IS HIT-TESTED LIKE AN EXIT.
     *
     * Solving a room is the one event guaranteed to fire a Campaign moment,
     * and the moment layer sits at y 108–226 at 390x844 — straight across the
     * band the verdict headline prints in. `elementFromPoint` at the centre of
     * `.anch-done__title` returned `mom__where`, so the DEFAULT experience of a
     * Gallery win was the celebration painted over by the notice, and every
     * screenshot of it looked correct. Measured BEFORE `clearMoments()`, which
     * is the whole point: clearing the seal first is how the collision hid.
     */
    R.gallery.headlineHit = await page.evaluate(() => {
      const t = document.querySelector('.anch-done__title');
      if (!t) return { found: false };
      const r = t.getBoundingClientRect();
      const at = (x, y) => {
        const top = document.elementFromPoint(x, y);
        return top === t || t.contains(top) ? 'self' : (top?.className || top?.tagName || 'null');
      };
      const inset = 4;
      return {
        found: true,
        text: t.textContent.trim(),
        box: { y: +r.y.toFixed(1), h: +r.height.toFixed(1) },
        centre: at(r.x + r.width / 2, r.y + r.height / 2),
        corners: [
          at(r.left + inset, r.top + inset), at(r.right - inset, r.top + inset),
          at(r.left + inset, r.bottom - inset), at(r.right - inset, r.bottom - inset),
        ],
        momentUp: !!document.querySelector('.mom-layer'),
        momentBottom: +(document.querySelector('.mom-layer')?.getBoundingClientRect().bottom ?? 0).toFixed(1),
      };
    });
    // `null`, not `false`, when the run never reached the verdict: a harness
    // that reports a pass/fail for a screen it never opened is the same class
    // of lie as the sliced-chip detector this round replaced.
    R.gallery.headlineUncovered = !R.gallery.headlineHit.found
      ? null
      : R.gallery.headlineHit.centre === 'self'
        && R.gallery.headlineHit.corners.every((c) => c === 'self');
    log('gallery headline uncovered:', R.gallery.headlineUncovered,
      '(moment up:', R.gallery.headlineHit.momentUp, ')');
    await shot('gallery-won-with-moment');
    await clearMoments();
    await shot('gallery-won');
  }
  await leave();

  // ── 2. THE CONSERVATORY: is the found strip slicing a chip? ──────────────
  await openRoom('conservatory', { col: 4, row: 2 });
  const hiveLetters = await page.evaluate(() => ({
    center: document.querySelector('.hv-cell--center .hv-cell__g').textContent.trim(),
    outer: [...document.querySelectorAll('.hv-cell:not(.hv-cell--center) .hv-cell__g')].map((e) => e.textContent.trim()),
  }));
  const hive = hives.find((p) => p.center === hiveLetters.center
    && p.outer.length === hiveLetters.outer.length
    && p.outer.every((l) => hiveLetters.outer.includes(l)));
  log('hive board', hive?.id);
  R.conservatory = { boardId: hive?.id ?? null };
  if (hive) {
    const words = [...hive.validWords].sort((a, b) => b.length - a.length).slice(0, 10);
    for (const w of words) { await page.keyboard.type(w); await page.keyboard.press('Enter'); await sleep(160); }
    await sleep(400);
    R.conservatory.strip = await page.evaluate(() => {
      const strip = document.querySelector('.hv-found__strip');
      const sr = strip.getBoundingClientRect();
      const chips = [...strip.children].map((c) => {
        const r = c.getBoundingClientRect();
        return {
          word: c.textContent.trim(),
          left: +r.left.toFixed(1), right: +r.right.toFixed(1),
          visible: +(Math.min(r.right, sr.right) - r.left).toFixed(1),
          full: +r.width.toFixed(1),
          hidden: getComputedStyle(c).visibility === 'hidden',
        };
      });
      const cs = getComputedStyle(strip);
      /**
       * ROUND 11 — THE DETECTOR THAT COULD NOT FIRE.
       *
       * This test used to read `!c.hidden && c.left < sr.right && c.right >
       * sr.right`, and `c.hidden` is `visibility: hidden` — which is exactly
       * the mechanism the round-7/10 fix installed. So the detector was
       * switched off by the thing it was verifying: it recorded `"sliced": []`
       * on data where five chips were flagged `hidden: true` and LUGGAGE was
       * showing 14.3 of its 90.6 pixels. A self-certifying audit is worse than
       * no audit, because it is quoted as evidence.
       *
       * The primitive is now unconditional — ANY chip with 0 < visible < full
       * is `partial`, hidden or not — and the pass/fail split is stated
       * separately and explicitly:
       *   partial  every chip the strip is cutting, whatever its visibility
       *   sliced   the ones a player can actually SEE cut: painted, and not
       *            wholly inside the strip's right-edge fade. This is the
       *            list that must be empty.
       * The strip's own overflow/mask values are recorded alongside so a
       * future reader can see which mechanism was doing the work.
       */
      const fade = (() => {
        const mask = cs.maskImage || cs.webkitMaskImage || 'none';
        const m = mask.match(/calc\(100% - (\d+(?:\.\d+)?)px\)/);
        return mask === 'none' ? 0 : (m ? parseFloat(m[1]) : 0);
      })();
      const partial = chips.filter((c) => c.visible > 0.5 && c.visible < c.full - 0.5);
      const sliced = partial.filter((c) => !c.hidden);
      return { stripRight: +sr.right.toFixed(1), stripW: +sr.width.toFixed(1),
        overflowX: cs.overflowX, mask: cs.maskImage || cs.webkitMaskImage || 'none', fade,
        partial: partial.map((c) => `${c.word} ${c.visible}/${c.full}${c.hidden ? ' (hidden)' : ''}`),
        sliced: sliced.map((c) => c.word),
        chips };
    });
    await clearMoments();
    await shot('conservatory-strip');
  }
  await leave();

  // ── 3. THE COUNTING HOUSE: leaf + cell geometry ─────────────────────────
  await openRoom('counting-house', { col: 5, row: 2 });
  await page.waitForSelector('.ch-cell');
  R.countingHouse = {
    leaf: await box('.ch-leaf'),
    cell: await box('.ch-cell'),
    chPad: await page.$eval('.ch', (e) => {
      const cs = getComputedStyle(e);
      return { left: cs.paddingLeft, right: cs.paddingRight, width: e.getBoundingClientRect().width };
    }),
    stageW: await page.$eval('.room-host__stage', (e) => +e.getBoundingClientRect().width.toFixed(1)),
    padKey: await box('.ch-key'),
    undoPresent: !!(await page.$('.ch-key--verb')),
    leafFullyVisible: await page.evaluate(() => {
      const leaf = document.querySelector('.ch-leaf').getBoundingClientRect();
      const deck = document.querySelector('.room-deck').getBoundingClientRect();
      return leaf.bottom <= deck.top + 0.5 && leaf.top >= 0;
    }),
  };
  // Erase surgery: fill marks, select a many-marked cell, then peel.
  const tools = await page.$$('.ch-tools--free .ch-tool');
  await tools[1].click(); await sleep(350);
  const target = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.ch-cell')];
    const i = cells.findIndex((c) => ((c.querySelector('.ch-pencil')?.textContent ?? '').replace(/\s/g, '')).length >= 4);
    if (i < 0) return null;
    cells[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return { i, marks: (cells[i].querySelector('.ch-pencil').textContent ?? '').replace(/\s/g, '') };
  });
  await sleep(200);
  const eraseKey = () => page.$eval('.ch-key--wide', (e) => ({ label: e.textContent.trim(), disabled: e.disabled }));
  R.countingHouse.erase = { cell: target, keyBefore: await eraseKey() };
  await page.click('.ch-key--wide'); await sleep(250);
  R.countingHouse.erase.marksAfter = await page.evaluate((i) => {
    const c = document.querySelectorAll('.ch-cell')[i];
    return (c.querySelector('.ch-pencil')?.textContent ?? '').replace(/\s/g, '');
  }, target.i);
  R.countingHouse.erase.keyAfter = await eraseKey();
  // Undo puts it straight back.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.ch-key--verb')].find((x) => x.textContent.includes('Undo'));
    b?.click();
  });
  await sleep(250);
  R.countingHouse.erase.marksAfterUndo = await page.evaluate((i) => {
    const c = document.querySelectorAll('.ch-cell')[i];
    return (c.querySelector('.ch-pencil')?.textContent ?? '').replace(/\s/g, '');
  }, target.i);
  await clearMoments();
  await shot('counting-house');
  await leave();

  // ── 4. THE DARKROOM: how many idioms print the same quantity? ───────────
  await openRoom('darkroom', { col: 6, row: 2 });
  await page.waitForSelector('.dk-cell');
  R.darkroom = { meta: await page.$eval('.mic__meta', (e) => e.textContent.trim()) };
  // Pencil every blank with a deliberately wrong-ish letter so Develop reports.
  const letters = await page.$$eval('.dk-cell', (els) => [...new Set(els.map((e) => e.querySelector('.dk-cell__cipher').textContent.trim()))]);
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < letters.length; i++) {
    const c = letters[i];
    const done = await page.evaluate((cl) => {
      const t = [...document.querySelectorAll('.dk-cell')]
        .find((e) => e.querySelector('.dk-cell__cipher').textContent.trim() === cl);
      if (!t || t.className.includes('locked')) return 'locked';
      t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return 'sel';
    }, c);
    if (done === 'locked') continue;
    const key = ABC[i % 26];
    await page.evaluate((k) => {
      const b = [...document.querySelectorAll('.mic-key')].find((x) => x.textContent.trim() === k);
      b?.click();
    }, key);
    await sleep(40);
  }
  await sleep(200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.mic-btn')].find((x) => x.textContent.includes('Develop the print'));
    b?.click();
  });
  await sleep(700);
  R.darkroom.toast = await page.$eval('.mic-toast', (e) => e.textContent.trim()).catch(() => null);
  R.darkroom.prints = await page.$$eval('.dk-print', (els) => els.map((e) => e.textContent.trim())).catch(() => []);
  await clearMoments();
  await shot('darkroom-develop');
  await leave();

  // ── 5. THE LIBRARY: does every wrong guess pay a bit? (AAA 2.10) ────────
  await openRoom('library', { col: 2, row: 5 });
  const tiles = await page.$$eval('.ww-tile', (els) => els.map((e) => e.textContent.trim()));
  const web = webs.find((b) => {
    const ws = new Set(b.groups.flatMap((g) => g.words));
    return tiles.length === 16 && tiles.every((w) => ws.has(w));
  });
  log('library board', web?.id);
  R.library = { boardId: web?.id ?? null, herrings: web?.herrings?.length ?? 0 };
  const pick = async (ws) => {
    for (const w of ws) {
      await page.evaluate((word) => {
        const t = [...document.querySelectorAll('.ww-tile')].find((e) => e.textContent.trim() === word);
        t?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      }, w);
      await sleep(70);
    }
  };
  const weave = async () => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Weave');
      b?.click();
    });
    await sleep(1700);
    return page.evaluate(() => {
      const t = document.querySelector('.anch-toast');
      if (!t) return null;
      return { main: (t.childNodes[0]?.textContent ?? '').trim(), bit: t.querySelector('.anch-toast__bit')?.textContent?.trim() ?? null };
    });
  };
  const clear = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Clear');
    b?.click();
  });
  if (web) {
    // (a) plain-wrong, scattered: one word from each of the four groups.
    await pick(web.groups.map((g) => g.words[0]));
    R.library.scattered = await weave();
    await clear(); await sleep(200);
    // (b) a guess that really chases a planted trap: 3 of it + 1 outsider.
    const h = (web.herrings ?? [])[0];
    if (h) {
      const three = h.words.slice(0, 3);
      const outsider = web.groups.flatMap((g) => g.words).find((w) => !h.words.includes(w));
      await pick([...three, outsider]);
      R.library.herringChase = { picked: [...three, outsider], ...(await weave()) };
    }
    await clearMoments();
    await shot('library-bits');
  }
  await leave();

  writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
} finally {
  await browser.close();
}
