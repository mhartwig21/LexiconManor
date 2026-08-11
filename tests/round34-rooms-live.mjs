/**
 * tests/round34-rooms-live.mjs — FOUR ROOMS THAT KNEW SOMETHING AND NEVER SAID.
 * OWNER: round 34 (COMPREHENSION, cold read 11 Aug — grader items 9, 10, 11, 14).
 *
 * Run:  node tests/round34-rooms-live.mjs           (npm run test:rooms-say-it)
 *       node tests/round34-rooms-live.mjs --prove
 *       node tests/round34-rooms-live.mjs --vp=375x667
 *
 * ═══ WHY THIS FILE EXISTS ══════════════════════════════════════════════════
 *
 * Two strangers played the live build blind and finished four rooms still not
 * knowing four things those rooms already knew:
 *
 *   ( 9) THE GALLERY   that a real word which is not one of the five asked-for
 *                      works is ACCEPTED, KEPT AND SCORED (round 28's whole
 *                      round), and what a "corner" is — the word its own ask
 *                      line uses.
 *   (10) THE DARKROOM  where one word ends and the next begins. A tester read
 *                      A SCONE as AS?ONE and spent three hints on it.
 *   (11) THE CLOSET    which square the next letter lands in, which way the
 *                      typing runs, and what the Hem is before it is solved.
 *   (14) THE LIBRARY   that the thread it asks her to NAME is graded.
 *
 * Three of the four already had authored copy or authored CSS about exactly
 * these things. That is the point, and it is this repo's signature failure:
 * `.mic__sub` display:none on every shipped phone; the Gallery's studies line
 * behind `@media (max-height: 700px)`; the Darkroom's word slip shipped at a
 * contrast ratio of 1.03:1. The lesson the campaign keeps re-learning is that
 * AUTHORING A SENTENCE IS NOT SHOWING IT, and the only instrument that can tell
 * the difference is one that looks at the painted glass.
 *
 * ═══ WHAT IT MEASURES, AND WHY EACH ONE CANNOT PASS BY CONSTRUCTION ════════
 *
 * Every claim below is either (a) painted PIXELS read back out of a real
 * screenshot, or (b) the consequence of a real `page.mouse` gesture. None of
 * them reads a class name and calls it a verdict, because "the class is on the
 * element" is what the round-24 slip and the round-29 outline both had.
 *
 *   DARKROOM/SHAPE   Screenshot the print. Along the top edge of a word's slip,
 *                    sample the luminance at every inter-LETTER gutter and at
 *                    every inter-WORD gutter on the same rank. The word gutters
 *                    must be MEASURABLY lighter — that is what "you can see
 *                    where the word ends" means in pixels. On the round-24 slip
 *                    (a fill at 1.03:1 against the sheet and no edge at all)
 *                    the two differ by 0.083 of relative luminance; with the
 *                    hairline drawn they differ by 0.31. This goes red on the
 *                    first.
 *   CLOSET/CURSOR    Screenshot one square while it is the cursor and again
 *                    when it is not, and require its BODY (inset past the
 *                    outline) to change. A 2px ring at the rim of a square,
 *                    under a thumb, is not a cursor; the body is where she
 *                    looks. Measured on a square that is NOT a hem square, so
 *                    the hem's own shading cannot be what passes it.
 *   CLOSET/DIRECTION Find the caret in the painted pixels — which EDGE of the
 *                    cursor square carries accent ink — then press a real key
 *                    and watch where the cursor actually goes. The caret must
 *                    exist AND agree. A caret pointing the wrong way fails just
 *                    as hard as no caret, which is the property that makes this
 *                    a measurement rather than a mirror.
 *   CLOSET/HEM       A CLAUSE about the hem, on the glass, before the solve —
 *                    not the three-letter row label that was already there and
 *                    that a cold reader took for a bug.
 *   GALLERY/CORNER   The word "corner" somewhere OTHER than the ask clause that
 *                    uses it, visible and unoccluded.
 *   GALLERY/VERDICTS Trace a real study and a real refusal with real taps, then
 *                    measure the two chips the room actually printed: the kept
 *                    one must carry a positive mark the struck one does not,
 *                    and the two must not share a row.
 *
 * `--prove` re-introduces each shipped form INTO THE RUNNING APP, one at a
 * time, and fails unless the check goes red on it. A gate whose judgement has
 * never been watched fail is a gate nobody knows works.
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
const RULE = '─'.repeat(74);

/** 375 FIRST. Nearly every defect in this campaign has lived only there. */
const VIEWPORTS = [
  { w: 375, h: 667, tag: '375x667' },
  { w: 390, h: 844, tag: '390x844' },
];

/** Pinned boards, so the walk is the same walk every time. */
const DARKROOM = { card: 'darkroom', kind: 'cipher', root: '.mic--darkroom', pin: 'cipher-t3-40' };
const LINEN = { card: 'linen-closet', kind: 'crossword', root: '.m2--linen', pin: 'crossword-t3-19' };
const GALLERY = { card: 'gallery', kind: 'twistle', root: '.anch--gallery', pin: 'twistle-t3-1' };

/* ───────────────────────────── THRESHOLDS ────────────────────────────────
   Each is a number with a reason, not a number that made today pass.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Relative-luminance gap required between an inter-WORD gutter and an
 * inter-LETTER gutter, at the slip's own top edge. Both ends of the range are
 * MEASURED on `cipher-t3-40` in Edge, not reasoned about:
 *
 *     round-24 slip (fill only)   0.083   ← what shipped, and what the tester
 *                                           who read A SCONE as AS?ONE saw
 *     with the hairline drawn     0.307 (375x667) · 0.320 (390x844)
 *
 * 0.18 sits between them with room on both sides: 2.2x what the shipped form
 * can produce, and 1.7x under what an honest edge produces. A threshold that
 * only just clears today's number is a threshold that will fail on the next
 * machine, which is a mistake this repo has already made and written down.
 */
const WORD_EDGE_LUM_GAP = 0.18;

/**
 * How much of the cursor square's BODY must change when it becomes the cursor.
 * Mean luminance over the square inset past its own 2px outline. Measured:
 *
 *     round-29 cursor (a 2px rim)   0.003   ← the rim is outside the body, so
 *                                             the body does not change at all
 *     with a fill of its own        0.415
 *
 * 0.03 is ten times the first and a fourteenth of the second: a genuinely pale
 * cursor tint would still pass, and a mark that lives only at the rim — where a
 * thumb is — cannot.
 */
const CURSOR_BODY_LUM_DELTA = 0.03;

/* ───────────────────────────── THE PROOFS ────────────────────────────────
   Six shipped forms, re-introduced as CSS over the running app. Each names
   the check it must turn red. If a proof stops going red, the check has
   stopped measuring the thing it was written for.
   ──────────────────────────────────────────────────────────────────────── */
const PROOFS = [
  {
    name: 'the round-24 word slip (fill only, no edge) — 1.03:1',
    check: 'DARKROOM/SHAPE',
    css: '.dk-word::before { border: 0 !important; }',
  },
  {
    name: 'the round-29 cursor (a 2px rim, no fill of its own)',
    check: 'CLOSET/CURSOR',
    css: '.lc-cell--active { background: color-mix(in srgb, var(--room-accent) 12%, var(--paper-raised)) !important; }',
  },
  {
    name: 'no direction cue anywhere in the room',
    check: 'CLOSET/DIRECTION',
    css: '.lc-cell--active::before { display: none !important; }',
  },
  {
    name: 'the hem introduced only by its three-letter row label',
    check: 'CLOSET/HEM',
    css: '.m2-toast--hem { display: none !important; }',
  },
  {
    name: 'the corner clause authored and hidden (the house speciality)',
    check: 'GALLERY/CORNER',
    css: '.tw-word__hint { display: none !important; }',
  },
  {
    name: 'a kept word with no mark of being kept',
    check: 'GALLERY/VERDICTS',
    css: '.anch-chip__pts { display: none !important; }',
  },
  {
    name: 'a kept word printed shoulder-to-shoulder with a struck one',
    check: 'GALLERY/VERDICTS',
    css: '.tw-lists__break { display: none !important; }',
  },
  {
    // The board sized against a CONSTANT guess at the deck, which is what every
    // round before this one did. Right for an empty deck and for nothing else.
    name: 'the board sized against a guessed deck instead of the measured one',
    check: 'GALLERY/FIT',
    css: '.anch--gallery .tw-grid { max-width: min(100%, calc(var(--stage-h, 100vh) - var(--tw-reserve, 17.5rem))) !important; }',
  },
];

/* ─────────────────────────────── HARNESS ────────────────────────────────── */

async function freePort(from = 5931, to = 5999) {
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
  // The boot sequence navigates under us (hash routes, the day gate) and its
  // scenes detach mid-gesture. Nothing in here is a VERDICT — it is the walk to
  // the front door — so every probe and every click is best-effort and the loop
  // simply comes round again. A throw here would be a flake, not a finding.
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

/** SETUP ONLY — place a room under her feet and walk in. */
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

async function leaveRoom(page) {
  await page.evaluate(() => window.__manorStore.getState().leaveRoom());
  await page.waitForSelector('.bp-page', { timeout: 10000 }).catch(() => {});
  await clearMoments(page);
}

/** A real tap: the game commits on pointerdown/pointerup. */
async function tap(page, x, y, settle = 170) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(settle);
}

/* ───────────────────── PIXELS: screenshot → luminance ────────────────────
   Node has no PNG decoder, and importing one for this would be a dependency
   for six numbers. The page has a decoder built into it, so the screenshot
   goes back the way it came and is read with a canvas. These are the pixels
   Edge actually painted — grain overlay, blending, antialiasing and all.
   ──────────────────────────────────────────────────────────────────────── */

async function grabPixels(page, clip) {
  const png = await page.screenshot({ clip });
  const b64 = png.toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = rej;
      img.src = 'data:image/png;base64,' + data;
    });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lum = new Float64Array(c.width * c.height);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      lum[p] = 0.2126 * lin(d[i] / 255) + 0.7152 * lin(d[i + 1] / 255) + 0.0722 * lin(d[i + 2] / 255);
    }
    return { w: c.width, h: c.height, lum: Array.from(lum) };
  }, b64);
}

/**
 * DARKEST luminance in a rect. Used where the question is "is there ink here",
 * because a mean over a strip dilutes a one-pixel hairline with the parchment
 * either side of it and answers "a bit" for both a drawn edge and no edge.
 */
function minLum(img, x0, y0, x1, y1) {
  let lo = Infinity;
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(img.h, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(img.w, Math.round(x1)); x++) {
      const v = img.lum[y * img.w + x];
      if (v < lo) lo = v;
    }
  }
  return Number.isFinite(lo) ? lo : NaN;
}

/** Mean luminance of a rect given in the grabbed image's own pixel space. */
function meanLum(img, x0, y0, x1, y1) {
  let sum = 0; let n = 0;
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(img.h, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(img.w, Math.round(x1)); x++) {
      sum += img.lum[y * img.w + x]; n++;
    }
  }
  return n ? sum / n : NaN;
}

/* ═══════════════════════════════ CHECKS ═════════════════════════════════ */

/**
 * (10) THE DARKROOM — you can SEE where a word ends.
 *
 * The slip is an absolutely positioned underlay drawn 3px above and below the
 * word's cells, so a horizontal scan a pixel or two inside its TOP edge crosses
 * the slip's own edge over every letter gutter of a word and crosses nothing
 * at all in the gutter between two words. That is the whole claim, and it is
 * the reader's claim: the gaps inside a word must look different from the gaps
 * between words.
 */
async function checkDarkroomWordShape(page) {
  const geom = await page.evaluate(() => {
    const words = [...document.querySelectorAll('.dk-word')];
    if (words.length < 2) return null;
    const before = getComputedStyle(words[0], '::before');
    const slipTopOffset = Math.abs(parseFloat(before.top) || 0);
    // Group the words into ranks by their shared top, then take the first rank
    // that carries at least two words and at least one word of 3+ letters.
    const ranks = new Map();
    for (const w of words) {
      const r = w.getBoundingClientRect();
      const k = Math.round(r.top);
      if (!ranks.has(k)) ranks.set(k, []);
      ranks.get(k).push(w);
    }
    for (const [, list] of [...ranks.entries()].sort((a, b) => a[0] - b[0])) {
      list.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      if (list.length < 2) continue;
      const long = list.find((w) => w.querySelectorAll('.dk-cell').length >= 3);
      if (!long) continue;
      const cells = [...long.querySelectorAll('.dk-cell')].map((c) => c.getBoundingClientRect());
      const letterGutters = [];
      for (let i = 1; i < cells.length; i++) {
        letterGutters.push((cells[i - 1].right + cells[i].left) / 2);
      }
      const wordGutters = [];
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1].getBoundingClientRect();
        const b = list[i].getBoundingClientRect();
        wordGutters.push((a.right + b.left) / 2);
      }
      const rect = long.getBoundingClientRect();
      return {
        // The scan line: just inside the slip's top edge, where the edge (if
        // there is one) is painted and the letters certainly are not.
        y: rect.top - slipTopOffset + 1,
        clip: { x: 0, y: rect.top - slipTopOffset - 4, width: window.innerWidth, height: 12 },
        letterGutters,
        wordGutters,
        rankWords: list.map((w) => w.textContent.replace(/\s+/g, '')),
      };
    }
    return null;
  });
  if (!geom) return [{ check: 'DARKROOM/SHAPE', ok: false, message: 'no rank of the print carried two words — the walk never saw the room' }];

  const img = await grabPixels(page, geom.clip);
  const dpr = img.w / geom.clip.width;
  /**
   * The DARKEST pixel in a narrow vertical strip across the slip's top edge,
   * at this gutter's x. Darkest rather than mean because the claim is "is an
   * edge drawn here": a 1px hairline averaged with the parchment above and
   * below it reports something in between, and something in between is exactly
   * what the round-24 fill also reports. Taking the minimum separates a drawn
   * edge (the hairline's own core) from a tint (its lightest pixel IS the
   * tint), which widens the two answers from 1.7x apart to 2.5x apart.
   */
  const at = (cssX) => {
    const px = (cssX - geom.clip.x) * dpr;
    const py = (geom.y - geom.clip.y) * dpr;
    return minLum(img, px - 1, py - 3, px + 2, py + 4);
  };
  const letter = geom.letterGutters.map(at);
  const word = geom.wordGutters.map(at);
  // The DARKEST word gutter against the LIGHTEST letter gutter: the worst pair
  // on the rank, so one well-drawn edge cannot carry a rank of bad ones.
  const worstWord = Math.min(...word);
  const bestLetter = Math.max(...letter);
  const gap = worstWord - bestLetter;
  return [{
    check: 'DARKROOM/SHAPE',
    ok: gap >= WORD_EDGE_LUM_GAP,
    message: `the gap between two words reads ${gap.toFixed(3)} of relative luminance against the gaps`
      + ` between letters (needs ${WORD_EDGE_LUM_GAP}); rank "${geom.rankWords.join(' ')}",`
      + ` word gutters ${word.map((v) => v.toFixed(3)).join('/')},`
      + ` letter gutters ${letter.map((v) => v.toFixed(3)).join('/')}`,
  }];
}

/**
 * (11) THE LINEN CLOSET — the cursor, the direction it runs, and the hem.
 */
async function checkLinenCloset(page) {
  const out = [];

  /**
   * The square this walks the cursor onto is chosen so that BECOMING THE
   * CURSOR is the only thing that changes about it:
   *   · it is already inside the active answer, so the answer's own tint is
   *     the same in both frames. (The first version of this check took a
   *     square from outside the answer, so what it measured was the answer
   *     tint arriving — and it passed with the cursor's fill injected away.
   *     A check that passes with the fix removed is not a check.)
   *   · it is not a hem square, so the hem's shading and fold cannot be what
   *     passes it.
   *   · it is not the LAST square of the answer, so the cursor's next hop is
   *     the ordinary one-square advance the direction check is about, rather
   *     than the wrap to the next unfinished answer. (It was the last square
   *     on the first run: a real key press moved the cursor -18 squares, which
   *     is correct behaviour and a useless measurement.)
   */
  const target = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.lc-cell')];
    const answer = [...document.querySelectorAll('.lc-cell--word')];
    const last = answer[answer.length - 1];
    const inWord = answer.filter((c) => (
      c !== last
      && !c.classList.contains('lc-cell--mark')
      && !c.classList.contains('lc-cell--active')
    ));
    const pick = inWord[inWord.length - 1];
    if (!pick) return null;
    const r = pick.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, idx: all.indexOf(pick), rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
  });
  if (!target) {
    return [{ check: 'CLOSET/CURSOR', ok: false, message: 'the active answer painted no un-marked square to move the cursor onto' }];
  }

  const clip = { x: target.rect.x - 2, y: target.rect.y - 2, width: target.rect.width + 4, height: target.rect.height + 4 };
  const before = await grabPixels(page, clip);
  await tap(page, target.x, target.y);
  const onIt = await page.evaluate((i) => {
    const all = [...document.querySelectorAll('.lc-cell')];
    return all[i]?.classList.contains('lc-cell--active') ?? false;
  }, target.idx);
  const after = await grabPixels(page, clip);

  // ── CURSOR: the BODY of the square, inset past its own outline.
  const dpr = before.w / clip.width;
  const inset = 6 * dpr; // 2px outline + 2px offset + 2px of slack, in device px
  const body = (img) => meanLum(img, inset + 2 * dpr, inset + 2 * dpr, img.w - inset - 2 * dpr, img.h - inset - 2 * dpr);
  const delta = Math.abs(body(after) - body(before));
  out.push({
    check: 'CLOSET/CURSOR',
    ok: onIt && delta >= CURSOR_BODY_LUM_DELTA,
    message: onIt
      ? `becoming the cursor changed the square's body by ${delta.toFixed(3)} of relative luminance`
        + ` (needs ${CURSOR_BODY_LUM_DELTA}) — a mark only at the rim is a mark a thumb covers`
      : 'a real tap on an open square did not make it the active square at all',
  });

  /**
   * ── DIRECTION: find the caret in the painted pixels, then drive a key and
   * see where the cursor really goes. The cue must exist and must agree.
   *
   * The baseline is the square's OWN current fill, not the parchment it used
   * to be: the cursor tints the whole square, so measuring the caret against
   * bare paper would score the tint as a caret and report a direction for a
   * square that has none. (It did, on the first run of this check — right edge
   * 0.433, bottom edge 0.481, and the only thing separating them was the
   * caret.) Ink is therefore how much DARKER an edge is than the middle of the
   * same square in the same frame, which nothing but a mark drawn there can
   * produce. The strips start 4px in, clear of the 2px outline.
   */
  const fill = body(after);
  const edgeStrip = (img, side) => {
    const t = 4 * dpr; const w = 8 * dpr;
    return side === 'right'
      ? meanLum(img, img.w - t - w, img.h / 2 - w / 2, img.w - t, img.h / 2 + w / 2)
      : meanLum(img, img.w / 2 - w / 2, img.h - t - w, img.w / 2 + w / 2, img.h - t);
  };
  const rightInk = fill - edgeStrip(after, 'right');
  const bottomInk = fill - edgeStrip(after, 'bottom');
  // The caret is accent ink: a real darkening of one edge and not the other.
  const CUE = 0.04;
  const cue = rightInk >= CUE && rightInk > bottomInk * 1.5 ? 'across'
    : bottomInk >= CUE && bottomInk > rightInk * 1.5 ? 'down'
      : null;

  const gridSize = await page.evaluate(() => Math.round(Math.sqrt(document.querySelectorAll('.lc-cell').length)));
  const key = await page.evaluate(() => {
    const k = [...document.querySelectorAll('.lc-key')].find((e) => e.textContent.trim() === 'S');
    const r = k.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await tap(page, key.x, key.y, 260);
  const moved = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.lc-cell')];
    return all.indexOf(document.querySelector('.lc-cell--active'));
  });
  const step = moved - target.idx;
  const ran = step === 1 ? 'across' : step === gridSize ? 'down' : `${step} squares`;
  out.push({
    check: 'CLOSET/DIRECTION',
    ok: cue !== null && cue === ran,
    message: cue === null
      ? `nothing on the cursor square points anywhere (right edge ${rightInk.toFixed(3)},`
        + ` bottom edge ${bottomInk.toFixed(3)} of ink, needs ${CUE}) — and a real key press ran ${ran}`
      : `the cursor points ${cue} and a real key press ran ${ran}`,
  });

  // ── HEM: a clause, on the glass, before the solve. Not a row label.
  const hem = await page.evaluate(() => {
    const room = document.querySelector('.m2--linen');
    const found = [];
    for (const el of room.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || '').trim();
      if (!/\bhem\b/i.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const seen = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      found.push({ text: t, words: t.split(/\s+/).length, seen, inClueRow: !!el.closest('.lc-clue') });
    }
    return found;
  });
  const clause = hem.find((h) => h.seen && h.words >= 4);
  out.push({
    check: 'CLOSET/HEM',
    ok: !!clause,
    message: clause
      ? `the room says what the hem is before it is solved: “${clause.text}”`
      : 'the room never explains the hem — the only "hem" on the glass is'
        + ` ${hem.length ? hem.map((h) => `“${h.text}”`).join(', ') : 'nothing at all'},`
        + ' which is a label, not a rule of play',
  });

  return out;
}

/**
 * ( 9) THE GALLERY — the corner clause, and the two verdicts.
 *
 * The verdict half is DRIVEN: a real study and a real refusal are traced tile
 * by tile with `page.mouse`, so what is measured is the chips the room really
 * printed for words it really judged.
 */

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

/** Some traceable string this board's curator has never heard of. */
function findRefusal(grid, size, len, centreRequired, known) {
  const centre = Math.floor((size - 1) / 2) * size + Math.floor((size - 1) / 2);
  const neighbours = (i) => {
    const r = Math.floor(i / size); const c = i % size; const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr; const nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < size && nc < size) out.push(nr * size + nc);
      }
    }
    return out;
  };
  const seen = new Set(known.map((w) => w.toUpperCase()));
  const stack = grid.map((_, i) => [i]);
  while (stack.length) {
    const path = stack.pop();
    if (path.length === len) {
      const w = path.map((i) => grid[i]).join('');
      if (!seen.has(w) && (!centreRequired || path.includes(centre))) return { word: w, path };
      continue;
    }
    for (const n of neighbours(path[path.length - 1])) {
      if (!path.includes(n)) stack.push([...path, n]);
    }
  }
  return null;
}

async function checkGallery(page, board) {
  const out = [];

  // ── The corner clause: somewhere other than the ask that uses the word.
  const corner = await page.evaluate(() => {
    const room = document.querySelector('.anch--gallery');
    const rule = room.querySelector('.anch__rule');
    const hits = [];
    for (const el of room.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || '').trim();
      if (!/corner/i.test(t)) continue;
      if (rule && (el === rule || rule.contains(el))) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;
      hits.push(t);
    }
    return { hits, ask: rule?.textContent?.trim() ?? null };
  });
  out.push({
    check: 'GALLERY/CORNER',
    ok: corner.hits.length > 0,
    message: corner.hits.length
      ? `the room says what a corner is: “${corner.hits[0]}”`
      : `“corner” appears only in the ask (“${corner.ask}”) and nowhere else on the glass —`
        + ' the room prices a shape it never defines',
  });

  // ── The two verdicts, driven.
  const size = board.size ?? Math.round(Math.sqrt(board.grid.length));
  const grid = board.grid.map((g) => g.toUpperCase());
  const study = (board.extraWords ?? [])
    .map((w) => ({ w: w.toUpperCase(), p: tracePath(grid, size, w.toUpperCase(), !!board.rules.centerRequired) }))
    .find((x) => x.p);
  const refusal = findRefusal(
    grid, size, board.rules.minLength, !!board.rules.centerRequired,
    [...board.targetWords, ...(board.extraWords ?? [])],
  );
  if (!study || !refusal) {
    out.push({ check: 'GALLERY/VERDICTS', ok: false, message: `board ${board.id} could not supply both a study and a refusal to trace` });
    return out;
  }

  const claim = async (path) => {
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
    await tap(page, btn.x, btn.y, 320);
    return true;
  };

  if (!(await claim(study.p)) || !(await claim(refusal.path))) {
    out.push({ check: 'GALLERY/VERDICTS', ok: false, message: 'the traced words never reached the board' });
    return out;
  }
  // The toasts share the standing's slot; let them clear so nothing is hidden.
  await page.waitForTimeout(1600);

  const chips = await page.evaluate(() => {
    const shot = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        text: el.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom),
        left: Math.round(r.left), right: Math.round(r.right),
        strike: cs.textDecorationLine, colour: cs.color,
        /**
         * A positive mark is a mark that is not the word: a child element with
         * its own text saying a number in the plus direction — AND PAINTED.
         * The `.width > 0` is the whole point of the test: the first version
         * read `textContent` and was perfectly happy with a mark that was
         * `display: none`, which is the exact defect class (authored, shipped,
         * invisible) this file exists to catch.
         */
        mark: [...el.children]
          .filter((c) => { const q = c.getBoundingClientRect(); return q.width > 0 && q.height > 0; })
          .map((c) => c.textContent.trim())
          .filter(Boolean),
      };
    };
    // Only the PILE HEADINGS. The "+N more" tally is a caption too and it is
    // deliberately inline — it belongs to the chips beside it.
    const caps = [...document.querySelectorAll('.tw-lists .tw-lists__cap--head')].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left) };
    });
    return {
      study: [...document.querySelectorAll('.anch-chip--study')].map(shot),
      struck: [...document.querySelectorAll('.anch-chip--muted')].map(shot),
      caps,
    };
  });

  if (!chips.study.length || !chips.struck.length) {
    out.push({
      check: 'GALLERY/VERDICTS', ok: false,
      message: `the room printed ${chips.study.length} kept chip(s) and ${chips.struck.length} struck chip(s)`
        + ' — the walk never produced one of each to compare',
    });
    return out;
  }

  const kept = chips.study[0];
  const struck = chips.struck[0];
  const hasMark = kept.mark.some((m) => /^\+\s*\d/.test(m));
  const overlaps = (a, b) => a.top < b.bottom && b.top < a.bottom;
  const keptBesideStruck = chips.study.some((s) => chips.struck.some((t) => overlaps(s, t)));
  /**
   * A caption must HEAD its pile: it may share its row with the chips it
   * announces (that is the whole point of the zero-height break — the
   * separation is free), but nothing may come BEFORE it on that row. With the
   * captions running inline, as they shipped, the strip reads
   *   "also hung, 1 point each: ARDENT  not on the curator's list: ITIST"
   * with each caption buried mid-row between two piles, and which caption owns
   * which chip is a guess — which is how two cold readers took the whole strip
   * for one rejected pile. "Nothing to its left" is the structural claim, and
   * it is exactly the one the break makes and the inline form breaks.
   */
  const capInline = chips.caps.find((c) => [...chips.study, ...chips.struck].some((k) => overlaps(c, k) && k.left < c.left));
  const ok = hasMark && !keptBesideStruck && !capInline;
  out.push({
    check: 'GALLERY/VERDICTS',
    ok,
    message: !hasMark
      ? `the kept word “${kept.text}” carries no painted mark of being kept`
        + `${struck.strike === 'line-through' ? ', while the struck one carries a strike' : ''}`
        + ' — a stranger reads the strip as one rejected pile, which is what both cold readers did'
      : keptBesideStruck
        ? `a kept word and a struck word are printed on the same row (“${kept.text}” beside “${struck.text}”)`
        : capInline
          ? `the caption “${capInline.text}” has chips before it on its own row, so it heads nothing —`
            + ' a reader cannot tell which verdict it is announcing'
          : `kept “${kept.text}” carries ${kept.mark.join('')}; struck “${struck.text}” carries a`
            + ` ${struck.strike}; each caption has its own row and the two piles do not touch`,
  });

  /**
   * ── GALLERY/FIT ──────────────────────────────────────────────────────────
   * The two captions above now BREAK THE LINE, which is the point of them and
   * which costs rows. The Gallery is the room with the least slack in the
   * house — at 375x667 it holds an 82px header, a 330px board and a 137px deck
   * in 551px of stage, and the deck is sticky over the board — so the rows have
   * to be paid for and the payment has to be measured on a FULL strip, not on
   * the empty one the walk-in state shows.
   *
   * So the walk keeps claiming until the strip carries everything it can: six
   * study chips (the cap), the "+N more" tally past it, and more than one
   * struck word. The glass gate never sees this state — it walks a fresh
   * board — and a fresh board is precisely the state a height regression here
   * would hide in.
   */
  const extras = (board.extraWords ?? [])
    .map((w) => ({ w: w.toUpperCase(), p: tracePath(grid, size, w.toUpperCase(), !!board.rules.centerRequired) }))
    .filter((x) => x.p && x.w !== study.w)
    .slice(0, 7);
  const refused = [];
  for (const e of extras) {
    const before = await page.evaluate(() => document.querySelectorAll('.anch-chip--study').length);
    await claim(e.p);
    const after = await page.evaluate(() => document.querySelectorAll('.anch-chip--study').length);
    // `+N more` caps the strip at six chips, so a claim past the cap correctly
    // adds no chip. Anything refused BEFORE the cap is a tap that did not land.
    if (after === before && before < 6) refused.push(e.w);
  }
  await page.waitForTimeout(1600);

  const fit = await page.evaluate(() => {
    const clips = (v) => v === 'auto' || v === 'scroll' || v === 'hidden' || v === 'clip';
    const rows = [];
    // EVERY clipping box, the way scripts/smoke-gate.mjs does it. The first
    // version of this listed the selectors it expected to matter and left out
    // `.room-host__stage` — the actual scroller — so it could report "nothing
    // scrolls" about a room that was scrolling. A probe that chooses where to
    // look has chosen its answer.
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (!clips(cs.overflowY) && !clips(cs.overflowX)) continue;
      if (el.clientHeight <= 2) continue;
      const dy = el.scrollHeight - el.clientHeight;
      if (dy > 1) rows.push({ sel: el.className || el.tagName, dy, clientH: el.clientHeight, scrollH: el.scrollHeight });
    }
    const de = document.documentElement;
    if (de.scrollHeight - de.clientHeight > 1) {
      rows.push({ sel: 'documentElement', dy: de.scrollHeight - de.clientHeight, clientH: de.clientHeight, scrollH: de.scrollHeight });
    }
    const strip = document.querySelector('.tw-lists');
    const board = document.querySelector('.tw-grid');
    const br = board?.getBoundingClientRect();
    // The deck is STICKY over the board. A strip that grows pushes the deck up,
    // and a deck that covers a tile is a tile she cannot trace — which no
    // scroll measurement would ever notice, because nothing scrolls.
    let lost = 0; let firstLost = null;
    for (const tile of document.querySelectorAll('.tw-grid .tw-cell')) {
      const r = tile.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!hit || !(hit === tile || tile.contains(hit) || hit.contains(tile))) {
        lost++;
        if (!firstLost) firstLost = (tile.textContent || '?').trim() + ' → ' + (hit ? hit.className || hit.tagName : 'nothing');
      }
    }
    return {
      rows,
      tilesOwnThemselves: lost,
      firstLost,
      chips: document.querySelectorAll('.anch-chip').length,
      studies: document.querySelectorAll('.anch-chip--study').length,
      struck: document.querySelectorAll('.anch-chip--muted').length,
      tally: [...document.querySelectorAll('.tw-lists__cap')].map((e) => e.textContent.trim()),
      stripH: strip ? Math.round(strip.getBoundingClientRect().height) : null,
      boardOnGlass: br ? br.top >= -1 && br.bottom <= window.innerHeight + 1 : false,
    };
  });
  out.push({
    check: 'GALLERY/FIT',
    ok: fit.rows.length === 0 && fit.boardOnGlass && fit.tilesOwnThemselves === 0 && refused.length === 0,
    message: fit.rows.length
      ? `with ${fit.studies} kept and ${fit.struck} struck on the strip, `
        + fit.rows.map((r) => `${r.sel} scrolls ${r.dy}px (${r.clientH} of glass holding ${r.scrollH})`).join('; ')
      : !fit.boardOnGlass
        ? `with ${fit.studies} kept and ${fit.struck} struck on the strip, the board is no longer wholly on the glass`
        : fit.tilesOwnThemselves > 0
          ? `with a full strip, ${fit.tilesOwnThemselves} board tile(s) no longer answer to a tap at their own`
            + ` centre — the deck has grown over the board (first: ${fit.firstLost})`
          : refused.length
            ? `${refused.length} traced word(s) never reached the board once the strip filled: ${refused.join(', ')}`
            : `${fit.studies} kept + ${fit.struck} struck + ${fit.tally.length} caption(s) makes a ${fit.stripH}px strip`
              + ' and nothing scrolls; the board is whole and every tile still owns its own centre',
  });
  return out;
}

/* ─────────────────────────────── THE WALK ──────────────────────────────── */

async function walk(browser, base, vp, inject) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  const results = [];
  const board = JSON.parse(readFileSync(resolve(ROOT, 'content/generated/twistle.json'), 'utf8'))
    .find((p) => p.id === GALLERY.pin);
  try {
    if (!(await ensureExploring(page, base))) {
      return [{ check: 'BOOT', ok: false, message: 'the walk never reached exploring — the house would not open' }];
    }
    const dress = async () => { if (inject) await page.addStyleTag({ content: inject.css }).catch(() => {}); };

    await enterRoom(page, DARKROOM); await dress();
    results.push(...await checkDarkroomWordShape(page));
    await leaveRoom(page);

    await enterRoom(page, LINEN); await dress();
    results.push(...await checkLinenCloset(page));
    await leaveRoom(page);

    await enterRoom(page, GALLERY); await dress();
    results.push(...await checkGallery(page, board));
    await leaveRoom(page);
  } finally {
    await ctx.close();
  }
  return results;
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
      if (!quiet) console.log(`${RULE}\n[rooms] ${vp.tag}`);
      const res = await walk(browser, base, vp, inject);
      for (const r of res) {
        all.push({ ...r, vp: vp.tag });
        if (!quiet) console.log(`[rooms] ${r.ok ? 'ok  ' : 'FAIL'} ${vp.tag}  ${r.check.padEnd(18)} ${r.message}`);
      }
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  return all;
}

/* ────────────────────────────────── CLI ────────────────────────────────── */

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--vp='))?.slice(5);
const viewports = only ? VIEWPORTS.filter((v) => v.tag === only) : VIEWPORTS;

if (args.includes('--prove')) {
  console.log(`[rooms] PROVING — ${PROOFS.length} shipped forms, re-introduced one at a time.`);
  const clean = await run({ viewports: [VIEWPORTS[0]], inject: null, quiet: true });
  const dirty = clean.filter((r) => !r.ok);
  console.log(`[rooms] baseline (no injection): ${dirty.length} failure(s)` + (dirty.length ? ' — expected 0' : ' ✓'));
  for (const d of dirty) console.error(`[rooms]   ${d.check}: ${d.message}`);
  let bad = dirty.length ? 1 : 0;
  for (const proof of PROOFS) {
    const got = await run({ viewports: [VIEWPORTS[0]], inject: proof, quiet: true });
    const hit = got.filter((r) => !r.ok && r.check === proof.check);
    console.log(`${RULE}`);
    console.log(`[rooms] inject: ${proof.name}`);
    if (hit.length) {
      console.log(`[rooms]   ✓ ${proof.check} went red — ${hit[0].message}`);
    } else {
      bad++;
      console.error(`[rooms]   ✗ ${proof.check} STAYED GREEN. The check does not measure what it claims.`);
    }
  }
  console.log(RULE);
  if (bad) { console.error('[rooms] PROOF FAIL'); process.exit(1); }
  console.log('[rooms] PROOF PASS — every check goes red on the form that shipped.');
  process.exit(0);
}

const results = await run({ viewports, inject: null });
const failed = results.filter((r) => !r.ok);
console.log(RULE);
if (!failed.length) {
  console.log('[rooms] PASS — the Darkroom shows its word boundaries, the Closet shows its cursor,');
  console.log('[rooms]        its direction and its hem, and the Gallery defines its corners and');
  console.log('[rooms]        marks a kept word as kept.');
  process.exit(0);
}
for (const f of failed) console.error(`[rooms] FAIL ${f.vp} ${f.check} — ${f.message}`);
console.error(`[rooms] FAIL — ${failed.length} finding(s).`);
process.exit(1);
