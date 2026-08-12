/**
 * tests/round38-gallery-live.mjs — THE GROUND FLOOR FINALLY HAS A SECOND CLASS.
 * OWNER: round 38 (BENCHMARKS §8, COMPREHENSION item 9).
 *
 * Run:  node tests/round38-gallery-live.mjs          (npm run test:gallery-ground)
 *       node tests/round38-gallery-live.mjs --prove
 *       node tests/round38-gallery-live.mjs --vp=375x667
 *
 * ═══ WHY THIS FILE EXISTS ══════════════════════════════════════════════════
 *
 * Two strangers played the live build blind and both finished the Gallery
 * believing that ONLY THE FIVE PRE-CHOSEN WORDS COUNT — that a real word on a
 * legal path scores nothing. That belief is precisely what round 28's two-class
 * board was built to kill, and round 34 then attacked the EVIDENCE for it: a +1
 * on the kept chip, a caption over each pile, separated rows. All of it real,
 * all of it measured on the painted glass by `round34-rooms-live.mjs` — on a
 * TIER-3 board.
 *
 * The reason neither reader learned it was simpler and worse than the copy.
 * Measured on the pool round 28 shipped: **tiers 1 and 2 carried a median of
 * ZERO studies.** The ground floor is 62% of the rooms the median player enters,
 * and in every one of them the second class did not exist — not hidden, not
 * badly captioned: ABSENT. A tester on a tier-1 board who traced a real word
 * off the ask was told it was not on the curator's list, and she was reading her
 * screen correctly. The belief was TRUE where she formed it.
 *
 * Round 38 widened acceptance from "the ask's frequency band, at the ask's
 * lengths" to "every word of the dictionary you can trace under the rules the
 * board prints", and the ground floor went from a median 0 studies to 79. This
 * file is the instrument that says whether a STRANGER would now find that out —
 * with her finger, on the room she actually meets, at both shipped sizes.
 *
 * ═══ WHAT IT MEASURES, AND WHY IT CANNOT PASS BY CONSTRUCTION ══════════════
 *
 *   GROUND/KEPT   Trace a word ON A TIER-1 BOARD that the round-28 accept-list
 *                 could not have carried — chosen by the RULE that excluded it
 *                 (Norvig rank outside tier 1's `everyday` band, or longer than
 *                 the ask's eight letters) rather than from a saved copy of the
 *                 old pool, so the check is still honest after the old pool is
 *                 gone. GRIDS, rank 20,286, is such a word: 286 places past a
 *                 band boundary she cannot see and has never been told about.
 *                 Then require the ROOM to have kept it — a chip painted with a
 *                 positive mark, and the standing's own score risen by it.
 *   GROUND/TOLD   And that it SAID so at the moment of the gesture: a toast
 *                 naming the word, in the room's positive voice, painted where
 *                 the eye is. Read out of the live DOM's geometry and text, not
 *                 out of a class name — `.anch-toast--good` on a `display:none`
 *                 element is the exact failure class this house keeps shipping.
 *
 * `--prove` re-introduces the shipped forms one at a time and fails unless the
 * check goes red on each. Two of them are round 28's own ground floor as it
 * really was: a room that answers a traced real word with a strike.
 *
 * HARNESS RULES (local, and they are local rules):
 *   · System Edge — `chromium.launch({ channel: 'msedge' })`. NEVER download a
 *     playwright browser on this machine: the download silently fails.
 *   · ONE browser, closed in a `finally`. 375x667 FIRST, then 390x844.
 *   · The game commits on pointerdown/pointerup, so `element.click()` drives
 *     nothing — every gesture here is `page.mouse`.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The ground floor's own board — tier 1, 5×5, no centre rule. */
const GALLERY = { card: 'gallery', kind: 'twistle', root: '.anch--gallery', pin: 'twistle-t1-1' };

/** Where tier 1's ask draws its vocabulary (`bandOf`'s `everyday`). */
const TIER1_BAND = 20_000;
/** The longest word the ASK may be made of (`ASK_MAX_LENGTH`). */
const ASK_MAX_LENGTH = 8;

const PROOFS = [
  {
    name: 'round 28\'s ground floor: a real traced word answered with a strike',
    check: 'GROUND/KEPT',
    // The board still accepts it; the STRIP no longer says so. This is the
    // pixel-level shape of what a tier-1 player saw before this round.
    css: '.anch-chip--study { display: none !important; }',
  },
  {
    name: 'a kept word with no mark of being kept',
    check: 'GROUND/KEPT',
    css: '.anch-chip__pts { display: none !important; }',
  },
  {
    name: 'the verdict authored and never painted (the house speciality)',
    check: 'GROUND/TOLD',
    css: '.anch-toast { display: none !important; }',
  },
  {
    // Round 34's finding, asked of the ground floor: the board sized against a
    // CONSTANT guess at the deck instead of the deck it measures this frame.
    // Right for an empty deck — which is the only deck a tier-1 board has ever
    // had, and the reason this proof matters here.
    name: 'the board sized against a guessed deck instead of the measured one',
    check: 'GROUND/FIT',
    css: '.anch--gallery .tw-grid { max-width: min(100%, calc(var(--stage-h, 100vh) - var(--tw-reserve, 17.5rem))) !important; }',
  },
];

/* ─────────────────────────────── HARNESS ────────────────────────────────── */

async function freePort(from = 5951, to = 5999) {
  for (let p = from; p <= to; p++) {
    const ok = await new Promise((res) => {
      const s = createServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}

async function startPreview(port) {
  const server = spawn(
    process.execPath,
    [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let died = null;
  let stderr = '';
  server.stderr.on('data', (b) => { stderr += String(b); });
  server.on('exit', (code) => { died = code; });
  const base = `http://localhost:${port}/LexiconManor/`;
  for (let i = 0; i < 80; i++) {
    if (died !== null) {
      throw new Error(
        `vite preview exited ${died} before serving — it refuses to serve a dist that does not\n`
        + `match this tree. Run \`npm run build\` first.\n${stderr.trim()}`,
      );
    }
    try { const r = await fetch(base); if (r.ok) return { server, base }; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  server.kill();
  throw new Error('vite preview never answered');
}

const channel = () => process.env.MANOR_GATE_CHANNEL ?? 'msedge';

async function tap(page, x, y, settle = 170) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(settle);
}

async function clearMoments(page) {
  for (let i = 0; i < 12; i++) {
    const seal = await page.$('.mom');
    if (!seal) return;
    const box = await seal.boundingBox();
    if (!box) return;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** Reach `exploring` the way a player does — the front step, the morning. */
async function ensureExploring(page, base) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 40000 });
  for (let i = 0; i < 140; i++) {
    try {
      const st = await page.evaluate(() => {
        const s = window.__manorStore?.getState();
        return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor };
      });
      if (st.phase === 'exploring' && st.hasManor) { await clearMoments(page); return true; }
      if (await page.$('.dlg')) {
        const primary = await page.$('.dlg-choice--primary');
        if (primary) await primary.click({ timeout: 2000 }).catch(() => {});
        else {
          const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
          if (choice) await choice.click({ timeout: 2000 }).catch(() => {});
          else await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
        }
        await page.waitForTimeout(160); continue;
      }
      for (const sel of ['.chr-dusk__skip', '.chr-scene__btn', '.bp-btn--seal']) {
        const el = await page.$(sel);
        if (el) { await el.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(320); break; }
      }
    } catch { /* navigated mid-probe — come round again */ }
    await page.waitForTimeout(160);
  }
  return false;
}

/** SETUP ONLY — place the room under her feet and walk in. */
async function enterRoom(page, room) {
  await page.evaluate(({ card, kind, pin }) => {
    const store = window.__manorStore;
    const s = store.getState();
    const cell = { col: s.manor.playerCell.col, row: s.manor.playerCell.row };
    const key = `${cell.col},${cell.row}`;
    store.setState({
      manor: {
        ...s.manor,
        rooms: { ...s.manor.rooms, [key]: { cardId: card, cell, doors: ['N', 'S', 'E', 'W'], solved: false, kind, puzzleId: pin } },
      },
    });
    const s2 = store.getState();
    store.setState({ day: { ...s2.day, steps: 400 } });
    s2.enterRoom(key);
  }, { card: room.card, kind: room.kind, pin: room.pin });
  await page.waitForSelector(room.root, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(420);
  await clearMoments(page);
}

/* ──────────────────────────── THE MEASUREMENT ───────────────────────────── */

/** An independent path solver — deliberately not the engine's. */
function tracePath(grid, size, word, centreRequired) {
  const centre = Math.floor((size - 1) / 2) * size + Math.floor((size - 1) / 2);
  const neighbours = (i) => {
    const r = Math.floor(i / size); const c = i % size; const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr; const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
        out.push(nr * size + nc);
      }
    }
    return out;
  };
  const walk = (path, depth) => {
    if (depth === word.length) return (!centreRequired || path.includes(centre)) ? path : null;
    for (const n of neighbours(path[path.length - 1])) {
      if (path.includes(n) || grid[n] !== word[depth]) continue;
      const got = walk([...path, n], depth + 1);
      if (got) return got;
    }
    return null;
  };
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== word[0]) continue;
    const got = walk([i], 1);
    if (got) return got;
  }
  return null;
}

/**
 * A word this board accepts that ROUND 28's ground floor could not have — by
 * its own two rules, not by comparison with a file: outside tier 1's `everyday`
 * band, or longer than the ask. Shortest first, because a short chip is the
 * hardest case for everything else the strip has to do.
 */
function wordRound28Refused(board, ranks) {
  const size = board.size ?? Math.round(Math.sqrt(board.grid.length));
  const grid = board.grid.map((g) => g.toUpperCase());
  return (board.extraWords ?? [])
    .map((w) => {
      const rank = ranks.get(w.toLowerCase()) ?? 1_000_000;
      return { w, rank, why: w.length > ASK_MAX_LENGTH ? `${w.length} letters` : `rank ${rank}` };
    })
    .filter((x) => x.w.length > ASK_MAX_LENGTH || (x.rank > TIER1_BAND && x.rank < 1_000_000))
    .sort((a, b) => a.w.length - b.w.length || a.rank - b.rank)
    .map((x) => ({ ...x, path: tracePath(grid, size, x.w, !!board.rules.centerRequired) }))
    .find((x) => x.path);
}

async function claim(page, path) {
  for (const idx of path) {
    const at = await page.evaluate((i) => {
      const c = document.querySelector(`.tw-grid [data-idx="${i}"]`);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, idx);
    if (!at) return false;
    await tap(page, at.x, at.y, 90);
  }
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.anch-btn--primary')].find((e) => e.textContent.trim() === 'Claim');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!btn) return false;
  await tap(page, btn.x, btn.y, 260);
  return true;
}

/** Text of an element only if a real reader could see it, at its own centre. */
const PAINTED = `(el) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  if (r.width < 1 || r.height < 1) return null;
  if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.1) return null;
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) return null;
  return { text: el.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom) };
}`;

async function checkGroundFloor(page, board, ranks) {
  const out = [];
  const target = wordRound28Refused(board, ranks);
  if (!target) {
    return [{
      check: 'GROUND/KEPT', ok: false,
      message: `${board.id} accepts nothing the round-28 ground floor would have refused —`
        + ' the accept-list has narrowed back to the ask\'s own band and length',
    }];
  }

  const before = await page.evaluate(() => {
    const s = document.querySelector('.tw-standing__score');
    return Number((s?.textContent ?? '0').replace(/\D/g, ''));
  });

  if (!(await claim(page, target.path))) {
    return [{ check: 'GROUND/KEPT', ok: false, message: `the trace of ${target.w} never reached the board` }];
  }

  // The toast rides the standing's slot for 1.4s — read it while it is up.
  const told = await page.evaluate((painted) => {
    // eslint-disable-next-line no-eval
    const seen = eval(painted);
    const el = document.querySelector('.anch-toast');
    const shot = seen(el);
    return shot ? { ...shot, kind: el.className } : null;
  }, PAINTED);
  out.push({
    check: 'GROUND/TOLD',
    ok: !!told && new RegExp(target.w, 'i').test(told.text) && /study/i.test(told.text)
      && /\+\s*\d/.test(told.text) && /--good/.test(told.kind),
    message: told
      ? `the room answered the gesture: “${told.text}” (${/--good/.test(told.kind) ? 'in its good voice' : 'in its REFUSAL voice'})`
      : `nothing was painted where the room answers — a stranger traced ${target.w} and watched the screen say nothing`,
  });

  await page.waitForTimeout(1600);

  const kept = await page.evaluate((painted) => {
    // eslint-disable-next-line no-eval
    const seen = eval(painted);
    const chips = [...document.querySelectorAll('.anch-chip--study')].map((el) => {
      const shot = seen(el);
      if (!shot) return null;
      return {
        ...shot,
        mark: [...el.children]
          .filter((c) => { const q = c.getBoundingClientRect(); return q.width > 0 && q.height > 0; })
          .map((c) => c.textContent.trim()).filter(Boolean),
        strike: getComputedStyle(el).textDecorationLine,
      };
    }).filter(Boolean);
    const struck = [...document.querySelectorAll('.anch-chip--muted')].map((el) => seen(el)).filter(Boolean);
    const score = Number((document.querySelector('.tw-standing__score')?.textContent ?? '0').replace(/\D/g, ''));
    const caps = [...document.querySelectorAll('.tw-lists__cap--head')].map((el) => seen(el)).filter(Boolean);
    return { chips, struck, score, caps };
  }, PAINTED);

  /**
   * ── GROUND/FIT ───────────────────────────────────────────────────────────
   * A tier-1 Gallery with a FULL strip is a state that has never existed. The
   * ground floor shipped a median of zero studies, so the deck below a 5×5
   * board has never carried a kept pile, a caption, a tally and a struck pile
   * at once — and the deck is STICKY over the board. Round 34 measured exactly
   * this on tier 3 (and found 65px of scroll and six dead tiles); the glass
   * gate cannot see it at all, because it walks in on an empty board. So the
   * strip is filled with real traces here, on the room she plays most, before
   * anything is asked about it.
   */
  const more = (board.extraWords ?? [])
    .filter((w) => w !== target.w)
    .map((w) => ({ w, path: tracePath(board.grid.map((g) => g.toUpperCase()),
      board.size ?? Math.round(Math.sqrt(board.grid.length)), w, !!board.rules.centerRequired) }))
    .filter((x) => x.path)
    .sort((a, b) => b.w.length - a.w.length)
    .slice(0, 7);
  for (const m of more) await claim(page, m.path);
  await page.waitForTimeout(1500);
  const fit = await page.evaluate(() => {
    const clips = (v) => v === 'auto' || v === 'scroll' || v === 'hidden' || v === 'clip';
    const rows = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (!clips(cs.overflowY) && !clips(cs.overflowX)) continue;
      if (el.clientHeight <= 2) continue;
      const dy = el.scrollHeight - el.clientHeight;
      if (dy > 1) rows.push({ sel: el.className || el.tagName, dy, clientH: el.clientHeight, scrollH: el.scrollHeight });
    }
    const de = document.documentElement;
    if (de.scrollHeight - de.clientHeight > 1) rows.push({ sel: 'documentElement', dy: de.scrollHeight - de.clientHeight });
    let lost = 0; let firstLost = null;
    for (const tile of document.querySelectorAll('.tw-grid .tw-cell')) {
      const r = tile.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!hit || !(hit === tile || tile.contains(hit) || hit.contains(tile))) {
        lost++;
        if (!firstLost) firstLost = `${(tile.textContent || '?').trim()} → ${hit ? hit.className || hit.tagName : 'nothing'}`;
      }
    }
    const br = document.querySelector('.tw-grid')?.getBoundingClientRect();
    return {
      rows, lost, firstLost,
      studies: document.querySelectorAll('.anch-chip--study').length,
      strip: Math.round(document.querySelector('.tw-lists')?.getBoundingClientRect().height ?? 0),
      whole: br ? br.top >= -1 && br.bottom <= window.innerHeight + 1 : false,
    };
  });
  out.push({
    check: 'GROUND/FIT',
    ok: fit.rows.length === 0 && fit.lost === 0 && fit.whole,
    message: fit.rows.length
      ? `with the ground floor's strip full, ${fit.rows.map((r) => `${r.sel} scrolls ${r.dy}px`).join('; ')}`
      : fit.lost
        ? `with the strip full, ${fit.lost} board tile(s) no longer answer a tap at their own centre (first: ${fit.firstLost})`
        : !fit.whole
          ? 'with the strip full, the board is no longer wholly on the glass'
          : `a full ground-floor strip is ${fit.strip}px, nothing scrolls, and every tile still owns its own centre`,
  });

  const chip = kept.chips.find((c) => c.text.toUpperCase().startsWith(target.w));
  const hasMark = !!chip && chip.mark.some((m) => /^\+\s*\d/.test(m));
  const rose = kept.score > before;
  const notStruck = !kept.struck.some((s) => s.text.toUpperCase().startsWith(target.w));
  out.push({
    check: 'GROUND/KEPT',
    ok: !!chip && hasMark && rose && notStruck,
    message: !chip
      ? `the ground floor refused ${target.w} (${target.why}) — a word she can see, on a legal path,`
        + ' and no chip on the wall says otherwise'
      : !hasMark
        ? `${target.w} hangs with no mark of being kept — a stranger reads the strip as one rejected pile`
        : !rose
          ? `${target.w} hangs but the score did not move (${before} → ${kept.score}) — kept and worth nothing`
          : `${target.w} (${target.why}) hangs as “${chip.text}”, the score went ${before} → ${kept.score},`
            + ` under “${kept.caps[0]?.text ?? '—'}”`,
  });
  return out;
}

/* ─────────────────────────────── THE WALK ──────────────────────────────── */

async function walk(browser, base, vp, inject) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  const board = JSON.parse(readFileSync(resolve(ROOT, 'content/generated/twistle.json'), 'utf8'))
    .find((p) => p.id === GALLERY.pin);
  const ranks = new Map(
    JSON.parse(readFileSync(resolve(ROOT, 'content/data/dictionary.json'), 'utf8')).filter(([, r]) => r > 0),
  );
  try {
    if (!(await ensureExploring(page, base))) {
      return [{ check: 'BOOT', ok: false, message: 'the walk never reached exploring — the house would not open' }];
    }
    await enterRoom(page, GALLERY);
    if (inject) await page.addStyleTag({ content: inject.css }).catch(() => {});
    return await checkGroundFloor(page, board, ranks);
  } finally {
    await ctx.close();
  }
}

async function run({ viewports, inject, quiet }) {
  const port = await freePort();
  const { server, base } = await startPreview(port);
  let browser;
  const all = [];
  try {
    const ch = channel();
    browser = await chromium.launch(ch === 'chromium' ? { headless: true } : { channel: ch, headless: true });
    for (const vp of viewports) {
      const res = await walk(browser, base, vp, inject);
      if (!quiet) {
        console.log('[ground] ──────────────────────────────────────────────────────────────────────');
        console.log(`[ground] ${vp.w}x${vp.h}`);
        for (const r of res) console.log(`[ground]   ${r.ok ? '✓' : '✗'} ${r.check} — ${r.message}`);
      }
      all.push(...res.map((r) => ({ ...r, vp: `${vp.w}x${vp.h}` })));
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  return all;
}

const VIEWPORTS = [{ w: 375, h: 667 }, { w: 390, h: 844 }];

const arg = process.argv.find((a) => a.startsWith('--vp='));
const viewports = arg
  ? [{ w: Number(arg.slice(5).split('x')[0]), h: Number(arg.slice(5).split('x')[1]) }]
  : VIEWPORTS;

const t0 = Date.now();
if (process.argv.includes('--prove')) {
  const base = await run({ viewports: [viewports[0]], quiet: true });
  const baseFails = base.filter((r) => !r.ok);
  console.log(`[ground] baseline (no injection): ${baseFails.length} failure(s) ${baseFails.length ? '✗' : '✓'}`);
  for (const f of baseFails) console.log(`[ground]   ✗ ${f.check} — ${f.message}`);
  let bad = baseFails.length;
  for (const p of PROOFS) {
    const res = await run({ viewports: [viewports[0]], inject: p, quiet: true });
    const red = res.find((r) => r.check === p.check && !r.ok);
    console.log('[ground] ──────────────────────────────────────────────────────────────────────');
    console.log(`[ground] inject: ${p.name}`);
    if (red) console.log(`[ground]   ✓ ${p.check} went red — ${red.message}`);
    else { console.log(`[ground]   ✗ ${p.check} STAYED GREEN. The check does not measure what it claims.`); bad++; }
  }
  console.log('[ground] ──────────────────────────────────────────────────────────────────────');
  console.log(bad ? '[ground] PROOF FAIL' : '[ground] PROOF PASS — every check goes red on the form that shipped.');
  process.exit(bad ? 1 : 0);
}

const results = await run({ viewports });
const fails = results.filter((r) => !r.ok);
console.log('──────────────────────────────────────────────────────────────────────────');
if (fails.length) {
  console.log(`[ground] FAIL — ${fails.length} finding(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(1);
}
console.log('[ground] PASS — on the room the median player meets most, a real word off the ask is');
console.log('[ground]        answered, kept, marked and scored, at both shipped sizes.');
console.log(`[ground] ${((Date.now() - t0) / 1000).toFixed(1)}s`);
