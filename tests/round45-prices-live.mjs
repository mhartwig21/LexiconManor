/**
 * tests/round45-prices-live.mjs — NO ROOM MAY PRINT A NUMBER THE LEDGER DOES
 * NOT CHARGE.  OWNER: round 45 (the cold read of the round-42 build).
 *
 * Run:  node tests/round45-prices-live.mjs            (npm run test:prices)
 *       node tests/round45-prices-live.mjs --prove
 *       node tests/round45-prices-live.mjs --vp=375x667
 *
 * ═══ WHY THIS FILE EXISTS ══════════════════════════════════════════════════
 *
 * Round 42 denominated the whole economy in MOVES and made a wrong claim cost
 * ONE, at every weight and every tier. Five room views kept a transcribed
 * `const stepCost = tier === 3 ? 3 : 2` from the ladder it deleted, so:
 *
 *   · the Library printed "Two of these share a thread. · −2 steps" in red
 *     beside a ledger entry of −1. A blind tester tested it three times
 *     deliberately and logged the contradiction;
 *   · the Counting House printed "Consult a figure · −6 steps" ON A BUTTON —
 *     `claimCost * 2` at tier 3 — against a charge of 1. Six times the price,
 *     on the control she is being asked to decide about.
 *
 * And the same cold read found the day's own account over by one: the dawn cup
 * is inside the figure on the candle at dawn AND was counted again under
 * "Steps given back", so all three players did the sum and all three got the
 * same wrong answer. Two of the three named it as their quit condition.
 *
 * ═══ WHAT IT MEASURES, AND WHY NONE OF IT CAN PASS BY CONSTRUCTION ═════════
 *
 * Every verdict here is one PAINTED STRING against another PAINTED STRING.
 * Nothing is recomputed from the store, because a check that recomputes the
 * price from the same table the view reads can never catch a view that
 * disagrees with the engine — which is exactly the shape of the bug.
 *
 *   PRICE/<ROOM>/CONTROL   Walk into the room, arm it, then for EVERY visible
 *                          enabled button in it whose painted text carries a
 *                          "−N": read N off the glass, tap the button with a
 *                          real pointer, and read how far the candle's own
 *                          numeral moved. They must be the same number. The
 *                          scan is generic — it does not know the rooms, it
 *                          reads what is painted — so a room that grows a new
 *                          priced button is gated the day it ships one.
 *   PRICE/<ROOM>/TOAST     Drive a real costed slip with real input, then read
 *                          the price out of the toast the room actually
 *                          printed and compare it with the candle's movement.
 *   PRICE/DRAFT/STEP-BACK  Open a door, read the footer, back out, and require
 *                          the counter to move by what the footer advertised.
 *                          "Step back · 1 step" charged nothing at all.
 *   LEDGER/SUM             Play a real day with a real refund and a real
 *                          charge, retire, and add the NIGHT DIGEST up the way
 *                          a player does: the starting figure the candle
 *                          printed, minus "Steps spent", plus "Steps given
 *                          back", must equal the number of steps the candle
 *                          was showing when she retired. Four painted numbers,
 *                          one identity.
 *
 * `--prove` puts the shipped forms back INTO THE RUNNING APP — the stale price
 * text in the rooms, the double-counted cup in the digest — and fails unless
 * every check above goes red on them.
 *
 * HARNESS RULES (local, and they are local rules):
 *   · System Edge — `chromium.launch({ channel: 'msedge' })`. NEVER download a
 *     playwright browser on this machine: the download silently fails.
 *   · ONE browser, closed in a `finally`. 375x667 FIRST, then 390x844.
 *   · The game commits on pointerdown/pointerup, so `element.click()` drives
 *     nothing — every gesture that is part of a VERDICT is `page.mouse` or
 *     `page.keyboard`.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RULE = '─'.repeat(74);

/** 375 FIRST. Nearly every defect in this campaign has lived only there. */
const ALL_VIEWPORTS = [
  { w: 375, h: 667, tag: '375x667' },
  { w: 390, h: 844, tag: '390x844' },
];

/**
 * Every room, pinned to one board so the walk is the same walk every time, and
 * placed on 0-based row 5 — `rowTier` tier 3, which is where the worst of the
 * stale prices lived (the Counting House's `claimCost * 2` printed −6 there).
 *
 * ROUND 52 — the Darkroom's is DERIVED, not written down: cipher ids are
 * positional, so the 41-letter board this table means by "the Darkroom" moved
 * when the phrase list was rewritten. The price line sits under the densest
 * sheet, so the worst board is the one that can push it off the glass.
 */
const WORST_CIPHER = JSON.parse(readFileSync(resolve(ROOT, 'content/generated/cipher.json'), 'utf8'))
  .map((p) => ({ id: p.id, letters: p.plaintext.replace(/[^A-Z]/g, '').length, words: p.plaintext.split(' ').length }))
  .sort((a, b) => b.letters - a.letters || b.words - a.words || a.id.localeCompare(b.id))[0].id;

const ROOMS = [
  { tag: 'LIBRARY', card: 'library', kind: 'word-web', pin: 'web-2', root: '.anch--library' },
  { tag: 'CONSERVATORY', card: 'conservatory', kind: 'hive', pin: 'hive-t3-1', root: '.anch--conservatory' },
  { tag: 'COUNTING-HOUSE', card: 'counting-house', kind: 'sudoku', pin: 'sudoku-t3-01', root: '.ch' },
  { tag: 'STUDY', card: 'study', kind: 'forgotten-word', pin: 'fw-serendipity', root: '.anch--study' },
  { tag: 'LINEN-CLOSET', card: 'linen-closet', kind: 'crossword', pin: 'crossword-t3-19', root: '.m2--linen' },
  { tag: 'DARKROOM', card: 'darkroom', kind: 'cipher', pin: WORST_CIPHER, root: '.mic--darkroom' },
  { tag: 'GALLERY', card: 'gallery', kind: 'twistle', pin: 'twistle-t3-1', root: '.anch--gallery' },
];

const ROOM_ROW = 5;

/**
 * How long the loudest toast in the house lives (the Counting House's nudge is
 * 3400ms). The control scan waits it out rather than racing it.
 */
const TOAST_CLEAR_MS = 3600;

/**
 * THE PROOFS — the shipped forms, put back into the running app.
 *
 * `rooms` rewrites every "−1" the rooms paint back to "−3", which is what the
 * five stale `tier === 3 ? 3 : 2` constants printed at tier 3 before this
 * round. `digest` adds the dawn cup back into the night's "Steps given back",
 * which is what `stepsRefunded` did for sixteen rounds. If either stops turning
 * its checks red, the check has stopped measuring the thing it was written for.
 */
const PROVE = process.argv.includes('--prove');

/* ─────────────────────────────── HARNESS ────────────────────────────────── */

async function freePort(from = 5971, to = 5999) {
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

/** A real tap: the game commits on pointerdown/pointerup. */
async function tap(page, x, y, settle = 200) {
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

/**
 * SETUP ONLY — place the room on the third landing, stand her in it, walk in,
 * and hand her a refill so the counter has headroom. The refill is a 'snack':
 * a mid-day gift, which is what it is, and NOT a dawn grant, so it cannot
 * flatter the account arithmetic this file also measures.
 */
async function enterRoom(page, room, { topUp = 300 } = {}) {
  // ── LEAVE FIRST, AND LET THE BLUEPRINT PAINT. ──────────────────────────
  // The room's session lives on `manor.rooms[cellKey]`, but RoomHost holds the
  // OPEN one in React state and re-uses it while `activeRoom.cellKey` is
  // unchanged. Walking back into the same cell without stepping out therefore
  // kept the previous session alive — measured: the Study came back with one
  // clue already unsealed, and the gate read the missing row as its own bug.
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    if (s.day?.activeRoom) s.leaveRoom();
  });
  await page.waitForSelector('.bp-page', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(220);
  await page.evaluate(({ card, kind, pin, row, topUp: n }) => {
    const store = window.__manorStore;
    const s = store.getState();
    const cell = { col: s.manor.playerCell.col, row };
    const key = `${cell.col},${cell.row}`;
    store.setState({
      manor: {
        ...s.manor,
        playerCell: { ...cell },
        rooms: {
          ...s.manor.rooms,
          [key]: { cardId: card, cell, doors: ['N', 'S', 'E', 'W'], solved: false, kind, puzzleId: pin },
        },
      },
    });
    const s2 = store.getState();
    if (n > 0) s2.applyStepEntry({ reason: 'snack', delta: n, at: Date.now() });
    s2.enterRoom(key);
  }, { card: room.card, kind: room.kind, pin: room.pin, row: ROOM_ROW, topUp });
  await page.waitForSelector(room.root, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(460);
  await clearMoments(page);
  if (PROVE) await injectStalePrices(page);
}

async function leaveRoom(page) {
  await page.evaluate(() => window.__manorStore.getState().leaveRoom());
  await page.waitForSelector('.bp-page', { timeout: 10000 }).catch(() => {});
  await clearMoments(page);
}

/* ══════════════════════ THE TWO NUMBERS, BOTH PAINTED ═════════════════════ */

/**
 * THE CANDLE'S OWN NUMERAL — the ledger as the player reads it. Never
 * `stepsRemaining(ledger)`: a gate that asks the store what it charged and the
 * view what it printed would still be one instrument short, because the store
 * is where BOTH sides of a mispriced control agree. This is the numeral in
 * `.chr-steps__count`, which is the only account of the charge she ever sees.
 */
async function candle(page) {
  return page.evaluate(() => {
    const n = document.querySelector('.chr-steps__count');
    const btn = document.querySelector('.chr-steps__open');
    const label = btn?.getAttribute('aria-label') ?? '';
    const start = /left of (\d+)/.exec(label);
    return {
      left: n ? Number(n.textContent.replace(/[^0-9]/g, '')) : null,
      startTotal: start ? Number(start[1]) : null,
    };
  });
}

/**
 * The price a piece of painted text advertises, or null.
 *
 * Two forms, because the house prices things two ways and the second one is
 * how the draft footer got away with it. A stamp carries the sign — "−1 step",
 * U+2212, which is the only minus this codebase paints. A CONTROL states its
 * price as a `·` clause after the verb: "Reroll · 1 gem", "Step back · 1 step".
 * The first version of this function read the sign only, so it looked straight
 * at "Step back · 1 step" charging nothing and called it unpriced — the gate
 * agreeing with the bug it was written to find.
 */
function printedPrice(text) {
  const t = text ?? '';
  const stamp = /−\s*(\d+)/.exec(t);
  if (stamp) return Number(stamp[1]);
  const clause = /·\s*(\d+)\s*steps?\b/.exec(t);
  return clause ? Number(clause[1]) : null;
}

/**
 * Every visible, enabled, priced button the room is painting right now.
 *
 * Deliberately generic — it knows no room and no class name beyond the two
 * chrome subtrees it must not read (the candle prints "−1 walk" floats of its
 * own, and the account sheet prints the whole day). A room that grows a new
 * priced control is gated the day it ships one, without this file being edited.
 */
async function pricedControls(page) {
  return page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll('button')) {
      if (b.closest('.chr-steps') || b.closest('.chr-ledger') || b.closest('.chr-header')) continue;
      if (b.disabled) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const cs = getComputedStyle(b);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) continue;
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(hit === b || b.contains(hit) || hit.contains(b))) continue;
      const text = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/−\s*\d/.test(text)) continue;
      out.push({ text, x: cx, y: cy });
    }
    return out;
  });
}

/** The room's own toast, as painted. */
async function toastText(page) {
  return page.evaluate(() => {
    // The room's OWN toast element, by exact class token — never a wildcard.
    // A `[class*="toast"]` net catches the aria-live mirror and the empty slot,
    // and read the Counting House's page heading back as a toast.
    const sel = '.anch-toast, .mic-toast, .m2-toast, .ch-toast, .tw-toast';
    {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.1) continue;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) return t;
      }
    }
    return '';
  });
}

/**
 * `--prove`: put the pre-round-45 prices back on the glass. Every "−1" a room
 * paints becomes "−3", which is what `tier === 3 ? 3 : 2` printed at tier 3 —
 * the exact form five rooms shipped. Text nodes only, so nothing about the
 * ledger, the adapters or the store changes: the room lies and the engine does
 * not, which is the defect, stated.
 */
async function injectStalePrices(page) {
  await page.evaluate(() => {
    const stale = () => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const hits = [];
      while (walk.nextNode()) {
        const n = walk.currentNode;
        if (n.parentElement?.closest('.chr-steps, .chr-header, .chr-ledger')) continue;
        hits.push(n);
      }
      for (const n of hits) {
        const v = n.nodeValue || '';
        // A toast composes its price inside one template literal, so the sign
        // and the number share a text node.
        if (/−\s*1(?!\d)/.test(v)) { n.nodeValue = v.replace(/−\s*1(?!\d)/g, '− 3'); continue; }
        // A BUTTON does not: `−{stepWords(cost)}` renders "−" and "1 step" as
        // two separate nodes, and the first version of this proof matched
        // neither — so eight priced controls "survived" a defect that had not
        // been injected into them at all. The number is rewritten on its own,
        // and only where its own element carries the minus, so a Counting House
        // figure key reading "1" is left alone.
        if (/^\s*1(\s*steps?)?\s*$/.test(v) && (n.parentElement?.textContent || '').includes('−')) {
          n.nodeValue = v.replace(/1/, '3').replace(/step(?!s)/, 'steps');
        }
      }
    };
    stale();
    if (window.__staleObserver) window.__staleObserver.disconnect();
    window.__staleObserver = new MutationObserver(() => stale());
    window.__staleObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.waitForTimeout(120);
}

/* ═══════════════════════════ ARMING THE ROOMS ═════════════════════════════
   Each `arm` drives ONE real costed slip with real input and leaves the room
   in the state its priced controls need. Everything here is a gesture; the
   only thing read out of the store is which letters/words the board holds,
   which is the setup a player does with her eyes.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The shipped board, read out of the pool the build ships — NOT out of the
 * store. The store does not hold it (the session lives inside RoomHost), and
 * reading the CONTENT is what a player does with her eyes anyway: this is the
 * grid on the glass and the letters in the hive, nothing about prices.
 */
function pool(kind, id) {
  const raw = JSON.parse(readFileSync(resolve(ROOT, `content/generated/${kind}.json`), 'utf8'));
  const arr = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray);
  return (arr ?? []).find((p) => p.id === id) ?? null;
}

async function armLibrary(page) {
  // Four tiles from four DIFFERENT threads — a claim that is wrong on purpose.
  const picked = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.ww-tile')];
    if (tiles.length < 16) return null;
    // The grid is shuffled, so one tile from each ROW is four unrelated words
    // far more often than not; when it is not, the room says "one away" and
    // the check still measures the price on whatever it printed.
    return [0, 5, 10, 15].map((i) => {
      const r = tiles[i].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
  });
  if (!picked) return false;
  for (const p of picked) await tap(page, p.x, p.y, 90);
  const weave = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Weave');
    if (!b || b.disabled) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!weave) return false;
  // The Library holds the tiles hopping before it dispatches (`HOLD_MS`), so
  // the verdict — and the charge — land well after the tap.
  await tap(page, weave.x, weave.y, 1200);
  return true;
}

async function armConservatory(page, room) {
  const p = pool('hive', room.pin);
  if (!p) return false;
  const held = [p.center, ...(p.outer ?? [])].map((c) => String(c).toUpperCase());
  const bad = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((c) => !held.includes(c));
  if (!bad) return false;
  // Four letters the hive does not hold: a structural slip, costed and named.
  await page.keyboard.type(bad.repeat(4), { delay: 40 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(360);
  return true;
}

async function armCountingHouse(page) {
  // Ink one figure into one empty square: that is what makes the leaf worth
  // weighing, so `Balance` and `Consult` become the priced claims they say.
  const cell = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.ch-cell')]
      .find((e) => !e.className.includes('ch-cell--given') && !(e.textContent || '').trim());
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!cell) return false;
  await tap(page, cell.x, cell.y, 140);
  const key = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.ch-key--fig')].find((e) => !e.disabled);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!key) return false;
  await tap(page, key.x, key.y, 200);
  // Re-select the square so `Consult` has somewhere to put a figure.
  await tap(page, cell.x, cell.y, 160);
  return true;
}

async function armStudy(page, room) {
  const p = pool('forgotten-word', room.pin);
  if (!p) return false;
  // A wrong whisper OF THE RIGHT LENGTH: a short one is refused free upstream
  // (AAA 3.2), and a free refusal would measure nothing.
  const wrong = 'Q'.repeat(String(p.word).length);
  const field = await page.evaluate(() => {
    const i = document.querySelector('input');
    if (!i) return null;
    const r = i.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!field) return false;
  await tap(page, field.x, field.y, 140);
  await page.keyboard.type(wrong, { delay: 25 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(360);
  return true;
}

/** One letter into one square, on the room's own on-screen keyboard. */
async function typeOne(page, cellSel, keySel, letter) {
  const cell = await page.evaluate((sel) => {
    const c = [...document.querySelectorAll(sel)].find((e) => !e.disabled);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, cellSel);
  if (!cell) return false;
  await tap(page, cell.x, cell.y, 140);
  const key = await page.evaluate(({ sel, ch }) => {
    const b = [...document.querySelectorAll(sel)]
      .find((e) => (e.textContent || '').trim().toUpperCase() === ch && !e.disabled);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { sel: keySel, ch: letter });
  if (!key) return false;
  await tap(page, key.x, key.y, 180);
  return true;
}

async function armLinenCloset(page) {
  // One letter into one square. The Closet's costed claim is the check on a
  // FULL grid, which is a fifteen-square errand; what this has to do is put the
  // room into the state its priced key ("Smooth a crease") is sold in, and
  // print whatever it prints on the way.
  return typeOne(page, '.lc-cell', '.lc-key', 'Q');
}

async function armDarkroom(page) {
  await typeOne(page, '.dk-cell', '.mic-key', 'Q');
  const dev = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find((e) => /develop the print/i.test(e.textContent || '') && !e.disabled);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!dev) return false;
  await tap(page, dev.x, dev.y, 380);
  return true;
}

/**
 * An independent path solver — deliberately not the engine's.
 * `want` is 'in' (must cross the marked tile), 'out' (must miss it) or null.
 */
function tracePath(grid, size, word, want) {
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
    if (depth === word.length) {
      if (want === 'in' && !path.includes(centre)) return null;
      if (want === 'out' && path.includes(centre)) return null;
      return path;
    }
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
 * A traceable word on this board, crossing the marked tile or missing it.
 *
 * `only: 'study'` restricts it to the board's OTHER real words — the class
 * round 28 built and round 44 made pay. A target work is a WORK: it hangs in
 * the exhibition and pays nothing until the room is solved, so tracing one
 * would leave the day with no give-back to add up.
 */
function galleryWord(room, want, only) {
  const p = pool('twistle', room.pin);
  if (!p) return null;
  const size = p.size ?? Math.round(Math.sqrt(p.grid.length));
  const grid = p.grid.map((g) => String(g).toUpperCase());
  const min = p.rules?.minLength ?? 5;
  const words = (only === 'study' ? (p.extraWords ?? []) : [...(p.targetWords ?? []), ...(p.extraWords ?? [])])
    .map((w) => String(w).toUpperCase())
    .filter((w) => w.length >= min);
  for (const w of words) {
    const path = tracePath(grid, size, w, want);
    if (path) return { word: w, path };
  }
  return null;
}

async function traceAndClaim(page, path) {
  for (const idx of path) {
    const at = await page.evaluate((i) => {
      const c = document.querySelector(`.tw-grid [data-idx="${i}"]`);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, idx);
    if (!at) return false;
    await tap(page, at.x, at.y, 80);
  }
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.anch-btn--primary')].find((e) => e.textContent.trim() === 'Claim');
    if (!b || b.disabled) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!btn) return false;
  await tap(page, btn.x, btn.y, 380);
  return true;
}

/**
 * The Gallery's one costed slip: a real word that CANNOT be traced through the
 * marked tile. "A path that misses the tile" is not enough — the engine finds
 * its own path, and a word with one legal route and one illegal one is simply
 * accepted (measured: ACTING was hung as a work while this asked for a
 * refusal). So the word is chosen for having NO centre-crossing path at all.
 */
async function armGallery(page, room) {
  const p = pool('twistle', room.pin);
  if (!p) return false;
  const size = p.size ?? Math.round(Math.sqrt(p.grid.length));
  const grid = p.grid.map((g) => String(g).toUpperCase());
  const min = p.rules?.minLength ?? 5;
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
  // Any legal drag of `min` tiles that never touches the marked one, whose
  // letters have no centre-crossing route either — the room's own definition
  // of `breaks-rule` (engine/twistle.ts `submitTwistleWord`).
  const found = [];
  const walk = (path) => {
    if (found.length) return;
    if (path.length === min) {
      const word = path.map((i) => grid[i]).join('');
      if (!tracePath(grid, size, word, 'in')) found.push(path);
      return;
    }
    for (const n of neighbours(path[path.length - 1])) {
      if (n === centre || path.includes(n)) continue;
      walk([...path, n]);
      if (found.length) return;
    }
  };
  for (let i = 0; i < grid.length && !found.length; i++) {
    if (i === centre) continue;
    walk([i]);
  }
  if (!found.length) return false;
  return traceAndClaim(page, found[0]);
}

const ARM = {
  'LIBRARY': armLibrary,
  'CONSERVATORY': armConservatory,
  'COUNTING-HOUSE': armCountingHouse,
  'STUDY': armStudy,
  'LINEN-CLOSET': armLinenCloset,
  'DARKROOM': armDarkroom,
  'GALLERY': armGallery,
};

/* ═══════════════════════════════ CHECKS ═════════════════════════════════ */

/**
 * ONE ROOM: the toast it prints for a costed slip, then every priced button on
 * its glass. The room is re-entered before each control so one purchase cannot
 * change the price of the next.
 */
async function checkRoom(page, base, room) {
  const out = [];
  const arm = ARM[room.tag];

  // ── the toast ──────────────────────────────────────────────────────────
  await ensureExploring(page, base);
  await enterRoom(page, room);
  const before = (await candle(page)).left;
  const armed = await arm(page, room);
  const toast = await toastText(page);
  const after = (await candle(page)).left;
  if (!armed) {
    out.push({
      check: `PRICE/${room.tag}/TOAST`, ok: false,
      message: 'the room could not be driven to a costed slip — nothing was measured, which is a'
        + ' finding rather than a pass',
    });
  } else {
    const printed = printedPrice(toast);
    const charged = before !== null && after !== null ? before - after : null;
    if (printed === null) {
      out.push({
        check: `PRICE/${room.tag}/TOAST`,
        priced: false,
        ok: charged === 0,
        message: `no price on the toast "${toast || '(none painted)'}" and the ledger moved ${charged}`
          + ' — a silent charge is the same defect the other way round',
      });
    } else {
      out.push({
        check: `PRICE/${room.tag}/TOAST`,
        priced: true,
        ok: printed === charged,
        message: `the room printed "${toast}" (−${printed}) and the candle moved ${charged}`,
      });
    }
  }

  // ── the priced controls ────────────────────────────────────────────────
  // Toasts are transient and some of them sit over the deck, so the scan waits
  // them out: a control hidden behind a 1.8s toast is not "missing", and a gate
  // that reports it as missing is a gate that cries wolf.
  await page.waitForTimeout(TOAST_CLEAR_MS);
  const controls = await pricedControls(page);
  if (controls.length === 0) {
    out.push({
      check: `PRICE/${room.tag}/CONTROL`, priced: false, ok: true,
      message: 'this room sells nothing — no priced control on the glass',
    });
    return out;
  }
  for (let i = 0; i < controls.length; i++) {
    await ensureExploring(page, base);
    await enterRoom(page, room);
    await arm(page, room);
    await page.waitForTimeout(TOAST_CLEAR_MS);
    const list = await pricedControls(page);
    // Matched by its WORDS and by how many identical ones came before it — the
    // Study sells four clues off one sentence, so a positional index alone
    // renames them the moment one of them is gone.
    const want = controls[i];
    const ord = controls.slice(0, i).filter((c) => c.text === want.text).length;
    const c = list.filter((x) => x.text === want.text)[ord];
    if (!c) {
      out.push({
        check: `PRICE/${room.tag}/CONTROL`, ok: false,
        message: `control ${i} ("${want.text}") did not come back on the second walk in`,
      });
      continue;
    }
    const printed = printedPrice(c.text);
    const b = (await candle(page)).left;
    await tap(page, c.x, c.y, 520);
    const a = (await candle(page)).left;
    const charged = b !== null && a !== null ? b - a : null;
    out.push({
      check: `PRICE/${room.tag}/CONTROL`,
      priced: printed !== null,
      ok: printed === charged,
      message: `"${c.text}" advertises −${printed}; tapping it moved the candle ${charged}`,
    });
  }
  return out;
}

/**
 * THE DRAFT FOOTER. "Step back · 1 step" charged nothing at all: the walk to
 * the door is ledgered when the offer OPENS (AAA 4.6's two-part walk), so the
 * footer was advertising a second charge that never lands, in the one place in
 * the game where the player is being asked to weigh a price.
 */
async function checkDraftFooter(page, base) {
  await ensureExploring(page, base);
  const opened = await page.evaluate(() => {
    const s = window.__manorStore.getState();
    for (const dir of ['N', 'E', 'W', 'S']) {
      s.openDraft(dir);
      if (window.__manorStore.getState().draftOffer) return dir;
    }
    return null;
  });
  if (!opened) {
    return [{ check: 'PRICE/DRAFT/STEP-BACK', ok: false, message: 'no door would open — nothing measured' }];
  }
  await page.waitForSelector('.bp-modal__foot', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(260);
  if (PROVE) {
    // The shipped form: a price tag on a control that charges nothing.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.bp-modal__foot .bp-btn')]
        .find((e) => /step back/i.test(e.textContent || ''));
      if (b) b.textContent = 'Step back − 1 step';
    });
  }
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.bp-modal__foot .bp-btn')]
      .find((e) => /step back/i.test(e.textContent || ''));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return {
      text: (b.textContent || '').replace(/\s+/g, ' ').trim(),
      x: r.x + r.width / 2, y: r.y + r.height / 2,
    };
  });
  if (!btn) {
    return [{ check: 'PRICE/DRAFT/STEP-BACK', ok: false, message: 'the draft footer painted no Step back' }];
  }
  const printed = printedPrice(btn.text);
  const b = (await candle(page)).left;
  await tap(page, btn.x, btn.y, 420);
  const a = (await candle(page)).left;
  const charged = b !== null && a !== null ? b - a : null;
  return [{
    check: 'PRICE/DRAFT/STEP-BACK',
    priced: printed !== null,
    ok: (printed ?? 0) === charged,
    message: `the footer reads "${btn.text}" (${printed === null ? 'no price' : `−${printed}`})`
      + ` and backing out moved the candle ${charged}`,
  }];
}

/**
 * THE DAY'S SUM, DONE THE WAY A PLAYER DOES IT — four painted numbers.
 *
 *   the figure the candle started at  −  "Steps spent"  +  "Steps given back"
 *       must equal the figure the candle was showing when she retired.
 *
 * All three cold-read players did exactly this and all three got the same wrong
 * answer, because the dawn cup is inside the starting figure AND was counted
 * again as something the day gave back.
 */
async function checkLedgerSum(page, base) {
  await ensureExploring(page, base);

  // A real refund, off a real gesture: a study in the Gallery hands back the
  // move she spent walking in (round 44).
  const gallery = ROOMS.find((r) => r.tag === 'GALLERY');
  await enterRoom(page, gallery, { topUp: 0 });
  const legal = galleryWord(gallery, 'in', 'study');
  const refunded = legal ? await traceAndClaim(page, legal.path) : false;
  await leaveRoom(page);

  // A real charge, off a real gesture: a clue unsealed in the Study.
  await enterRoom(page, ROOMS.find((r) => r.tag === 'STUDY'), { topUp: 0 });
  const unseal = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.fw-clue__buy')].find((e) => !e.disabled);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (unseal) await tap(page, unseal.x, unseal.y, 420);
  await leaveRoom(page);

  const { left, startTotal } = await candle(page);
  if (startTotal === null || left === null) {
    return [{ check: 'LEDGER/SUM', ok: false, message: 'the candle painted no account to read' }];
  }

  // Retire while steps remain, so `left` is the ledger and not a floor at 0.
  for (let i = 0; i < 3; i++) {
    const r = await page.evaluate(() => {
      const b = document.querySelector('.chr-retire');
      if (!b) return null;
      const box = b.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    if (!r) break;
    await tap(page, r.x, r.y, 420);
    const phase = await page.evaluate(() => window.__manorStore.getState().day?.phase);
    if (phase !== 'exploring') break;
  }
  // Through dusk to the digest.
  for (let i = 0; i < 30; i++) {
    if (await page.$('.chr-digest')) break;
    const skip = await page.$('.chr-dusk__skip');
    if (skip) await skip.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(320);
  }
  if (PROVE) {
    // The shipped form: the dawn cup counted a second time under "given back".
    await page.evaluate(() => {
      const dl = document.querySelector('.chr-digest');
      if (!dl) return;
      const kids = [...dl.children];
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].tagName === 'DT' && /given back/i.test(kids[i].textContent || '')) {
          const dd = kids[i + 1];
          if (dd) dd.textContent = String(Number(dd.textContent.replace(/[^0-9]/g, '')) + 1);
        }
      }
    });
  }
  const rows = await page.evaluate(() => {
    const dl = document.querySelector('.chr-digest');
    if (!dl) return null;
    const out = {};
    const kids = [...dl.children];
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].tagName !== 'DT') continue;
      const label = (kids[i].textContent || '').trim();
      const dd = kids[i + 1];
      out[label] = dd ? Number((dd.textContent || '').replace(/[^0-9-]/g, '')) : 0;
    }
    return out;
  });
  if (!rows) {
    return [{ check: 'LEDGER/SUM', ok: false, message: 'the night printed no tally to add up' }];
  }
  const spent = rows['Steps spent'] ?? 0;
  const given = rows['Steps given back'] ?? 0;
  const sum = startTotal - spent + given;
  return [
    {
      check: 'LEDGER/SUM',
      ok: sum === left,
      message: `the day started at ${startTotal}, the night printed spent ${spent} and given back ${given}`
        + `, and the candle was showing ${left} — ${startTotal} − ${spent} + ${given} = ${sum}`,
    },
    {
      check: 'LEDGER/SUM/REACHED',
      ok: refunded && spent > 0,
      message: `the day had to contain both a real give-back and a real charge to be worth adding up`
        + ` (a study was claimed: ${refunded}; steps spent: ${spent})`,
    },
  ];
}

/* ═════════════════════════════════ RUN ═══════════════════════════════════ */

async function run() {
  const vpArg = process.argv.find((a) => a.startsWith('--vp='));
  const viewports = vpArg
    ? ALL_VIEWPORTS.filter((v) => v.tag === vpArg.slice(5))
    : ALL_VIEWPORTS;
  const only = process.argv.find((a) => a.startsWith('--room='));

  const port = await freePort();
  const { server, base } = await startPreview(port);
  let browser = null;
  const findings = [];
  try {
    browser = await chromium.launch({ channel: channel(), headless: true });
    for (const vp of viewports) {
      console.log(`\n${RULE}\n  ${vp.tag}\n${RULE}`);
      /**
       * A FRESH CONTEXT IS THE ONLY HONEST RESET. `localStorage.clear()` from
       * the page does not survive: the app flushes its save on `pagehide`
       * (app/platform/persistence.ts, AAA 7.17), so the very reload meant to
       * start a clean day writes the old one straight back — and there is an
       * IndexedDB mirror behind it. Measured: a "fresh" day opened holding
       * +4,500 steps of the room walk's refills. Each context below is a
       * stranger opening the game for the first time.
       */
      const say = (r) => {
        console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.check}  ${r.message}`);
        findings.push({ ...r, vp: vp.tag });
      };
      const inFreshContext = async (fn) => {
        const ctx = await browser.newContext({
          viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2,
        });
        try { return await fn(await ctx.newPage()); } finally { await ctx.close(); }
      };

      const rooms = only ? ROOMS.filter((r) => r.tag === only.slice(7)) : ROOMS;
      await inFreshContext(async (page) => {
        for (const room of rooms) for (const r of await checkRoom(page, base, room)) say(r);
      });
      if (!only) {
        await inFreshContext(async (page) => {
          for (const r of await checkDraftFooter(page, base)) say(r);
        });
        await inFreshContext(async (page) => {
          for (const r of await checkLedgerSum(page, base)) say(r);
        });
      }
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }

  const bad = findings.filter((f) => !f.ok);
  console.log(`\n${RULE}`);
  if (PROVE) {
    // The proofs put the shipped forms back. Every price check must go red on
    // them — a gate whose judgement has never been watched fail is a gate
    // nobody knows works.
    // Only the checks that actually READ A PRICE off the glass count here. A
    // room that sells nothing has nothing to lie about, and counting its row as
    // a survivor would fail the proof for the one honest reason there is.
    const priced = findings.filter((f) => f.priced);
    const survivors = priced.filter((f) => f.ok);
    const sumCheck = findings.filter((f) => f.check === 'LEDGER/SUM');
    const sumSurvivors = sumCheck.filter((f) => f.ok);
    console.log(`  --prove: ${priced.length - survivors.length}/${priced.length} printed prices went red`
      + ` on the stale prices; ${sumCheck.length - sumSurvivors.length}/${sumCheck.length} day sums went`
      + ' red on the double-counted cup.');
    for (const s of survivors) console.log(`  SURVIVED  ${s.check} [${s.vp}]  ${s.message}`);
    for (const s of sumSurvivors) console.log(`  SURVIVED  ${s.check} [${s.vp}]  ${s.message}`);
    const clean = survivors.length === 0 && sumSurvivors.length === 0
      && priced.length > 0 && sumCheck.length > 0;
    console.log(clean ? '  PROOF HELD — every check goes red on the form it was written for.'
      : '  PROOF FAILED — a check did not notice the defect it exists to catch.');
    process.exit(clean ? 0 : 1);
  }
  console.log(bad.length === 0
    ? `  0 findings — no room prints a number the ledger does not charge (${findings.length} checks).`
    : `  ${bad.length} finding(s) of ${findings.length}.`);
  process.exit(bad.length === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
