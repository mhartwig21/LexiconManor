/**
 * tests/round33-purse-and-map-live.mjs — THE LIVE EVIDENCE for round 33, driven
 * in a real browser at 375x667 FIRST and 390x844 second, with real mouse input.
 *
 * WHY IT HAS TO BE LIVE, and why this round in particular.
 * The cold read of 11 Aug graded a blind tester WRONG for believing "the Kitchen
 * card listed no step reward at all — I couldn't price it against its rivals".
 * He was not wrong. `blueprint.css @media (max-height: 700px)` carried
 * `.bp-card__preview { display: none }`, and a utility card's preview line is
 * the only place its numbers are ever printed (`draftCardStake` returns null for
 * utility, by design). Measured on HEAD before this round, in a live offer: at
 * 375x667 every `.bp-card__preview` box was 0x0; at 390x844 all three rendered.
 * Nothing in 1,371 unit tests could see that, and a human graded against ground
 * truth was marked down for reporting it. So the four things this round moved on
 * the glass are measured ON the glass:
 *
 *   A. THE OFFER SHEET — the utility card's price is drawn, unoccluded, and says
 *      what `CARD_PREVIEWS` says; the jargon row (`.bp-card__meta`) is gone from
 *      every card; the gem note is drawn while the purse is empty; and none of it
 *      costs a pixel of scroll on the 667px phone.
 *   B. THE MAP — the bottom margin's key is two sentences that fit inside the
 *      sheet's own box (an SVG root clips, which is how round 28's first cut lost
 *      the last glyph of "A MOVE"), the first of them says north is up, the
 *      footer plate names the storey she is standing on, and the drawing still
 *      hands every control its centre and its four edge midpoints after the
 *      viewBox grew by 18 user units.
 *   C. THE INDEX — Cabinet / Journal / Chronicles do not move when a contextual
 *      deed appears. Driven: a real draft, a real card taken, a real walk into
 *      it, then the same three boxes measured again.
 *   D. THE PADLOCK — a real tap on a keyless brass door draws a line that names
 *      where a key comes from, not only that one is wanted.
 *
 * NEGATIVE CONTROL (standing rule 1: no gate that passes by construction).
 * `--prove` re-introduces each shipped defect into the running page — the
 * preview rule, the missing gem note, the pre-round-33 viewBox, the deed back
 * inside the index row, a refusal line that names no source — and runs the SAME
 * assertion functions. The run fails unless each one goes red.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser instance,
 * closed in a finally.
 *
 * Run: `node tests/round33-purse-and-map-live.mjs`
 *      `node tests/round33-purse-and-map-live.mjs --prove`
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROVE = process.argv.includes('--prove');

/** 375 FIRST — nearly every defect in this campaign has lived only there. */
const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
];

/** The viewBox height the sheet had before MB went 22 → 40. `--prove` restores
 *  it under the round-33 legend, which is exactly the shape of the defect the
 *  bottom-margin key has had twice: text laid past the SVG root, which clips. */
const PRE_ROUND33_VIEW_H = 516;

async function freePort(from = 5431, to = 5490) {
  for (let p = from; p <= to; p++) {
    let taken = false;
    for (const host of ['127.0.0.1', '::1', undefined]) {
      // eslint-disable-next-line no-await-in-loop
      taken = taken || await new Promise((res) => {
        const s = createServer();
        s.once('error', () => res(true));
        s.once('listening', () => s.close(() => res(false)));
        if (host) s.listen(p, host); else s.listen(p);
      });
    }
    if (!taken) return p;
  }
  throw new Error(`no free port in ${from}-${to}`);
}

const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const log = (...a) => console.log('[r33]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--config', resolve(ROOT, 'scripts/gate-vite.config.ts'),
    '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
const serverUp = new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error('vite did not start within 60s')), 60000);
  server.stdout.on('data', (b) => {
    if (String(b).includes('ready in') || String(b).includes('Local:')) { clearTimeout(timer); res(); }
  });
  server.stderr.on('data', (b) => process.stderr.write(`[vite] ${b}`));
  server.on('exit', (c) => { clearTimeout(timer); rej(new Error(`vite exited early (${c})`)); });
});

/* ─────────────────────────── THE MEASUREMENTS ─────────────────────────────
   Read off the real DOM. Kept separate from the verdicts so `--prove` can feed
   the verdicts the numbers a re-broken page really produces.
   ────────────────────────────────────────────────────────────────────────── */

/** Everything the offer sheet is showing, with each card's lines measured. */
const readOffer = (page) => page.evaluate(() => {
  const sheet = document.querySelector('.bp-modal__sheet');
  if (!sheet) return null;
  const sb = sheet.getBoundingClientRect();
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
  };
  /** Is this element's own centre the topmost thing at that point? */
  const unoccluded = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el)));
  };
  const cards = [...sheet.querySelectorAll('.bp-card')].map((c) => {
    const preview = c.querySelector('.bp-card__preview');
    const lines = [...c.querySelectorAll('span')]
      .filter((s) => s.children.length === 0 && s.textContent.trim())
      .map((s) => ({ cls: String(s.className), text: s.textContent.trim(), ...box(s) }));
    return {
      name: c.querySelector('.bp-card__name')?.textContent?.trim() ?? '',
      utility: c.classList.contains('bp-card--utility'),
      hasMetaRow: Boolean(c.querySelector('.bp-card__meta')),
      preview: preview
        ? { text: preview.textContent.trim(), stakeRegister: preview.classList.contains('bp-card__preview--stake'), ...box(preview), seen: unoccluded(preview) }
        : null,
      lines,
      ...box(c),
    };
  });
  const gems = sheet.querySelector('.bp-modal__gems');
  const list = sheet.querySelector('.bp-modal__cards');
  return {
    sheetBox: box(sheet),
    sheetScroll: { sh: sheet.scrollHeight, ch: sheet.clientHeight },
    listScroll: list ? { sh: list.scrollHeight, ch: list.clientHeight } : null,
    cards,
    gemNote: gems ? { text: gems.textContent.trim(), ...box(gems), seen: unoccluded(gems) } : null,
    purse: window.__manorStore.getState().currencies.gems,
  };
});

/** The blueprint's margin, its legend, and every hit target's five points. */
const readMap = (page) => page.evaluate(() => {
  const svg = document.querySelector('.bp-sheet');
  if (!svg) return null;
  const sb = svg.getBoundingClientRect();
  // THE REFERENCE FRAME FOR CLIPPING IS THE viewBox, IN USER UNITS — never a
  // client rect. `preserveAspectRatio="xMidYMid meet"` letterboxes the drawing,
  // and `getBoundingClientRect` on an SVG child reports its TRANSFORMED
  // GEOMETRY, not what survived the root's clip: a legend laid past the viewBox
  // is invisible on the phone and still measures as comfortably inside the
  // element. That is precisely how round 28's first cut of this key lost the
  // last glyph of "A MOVE" on both phones while every box looked fine. So the
  // verdict is taken in the coordinate system the clip actually happens in.
  const vb = svg.viewBox.baseVal;
  const lines = [...document.querySelectorAll('.bp-key__line')].map((t) => {
    const r = t.getBoundingClientRect();
    // Probed across the line, not only at its centre: an SVG <text> hit-tests on
    // its GLYPH FILLS, so a single centre probe lands in the gap between two
    // letters and reports the <svg> root. What is being asked is whether
    // anything from OUTSIDE the drawing is on top of the legend, so the verdict
    // is "every probe still belongs to this sheet".
    const probesOn = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => document.elementFromPoint(
      r.x + r.width * f, r.y + r.height / 2,
    ));
    const bb = t.getBBox();
    return {
      text: t.textContent.replace(/\s+/g, ' ').trim(),
      x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
      bbox: { x: bb.x, y: bb.y, right: bb.x + bb.width, bottom: bb.y + bb.height },
      viewBox: { w: vb.width, h: vb.height },
      // An SVG root CLIPS at the viewBox: anything outside it is simply gone.
      inside: bb.x >= vb.x - 0.5 && bb.x + bb.width <= vb.x + vb.width + 0.5
        && bb.y >= vb.y - 0.5 && bb.y + bb.height <= vb.y + vb.height + 0.5,
      seen: probesOn.every((el) => Boolean(el && el.closest('svg.bp-sheet'))),
      coveredBy: (probesOn.find((el) => el && !el.closest('svg.bp-sheet'))
        || {}).className || null,
    };
  });
  // Every control on the drawing, probed at its centre and four edge midpoints.
  // Inset scales with the target so a rounded or clipped shape is not a false
  // miss (house rule); these are rectangles, so 6px is generous.
  const misses = [];
  let probes = 0;
  for (const g of document.querySelectorAll('.bp-hit')) {
    const r = g.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const inset = Math.min(6, r.width / 4, r.height / 4);
    const pts = [
      [r.x + r.width / 2, r.y + r.height / 2],
      [r.x + inset, r.y + r.height / 2],
      [r.right - inset, r.y + r.height / 2],
      [r.x + r.width / 2, r.y + inset],
      [r.x + r.width / 2, r.bottom - inset],
    ];
    for (const [x, y] of pts) {
      probes++;
      const el = document.elementFromPoint(x, y);
      if (!el || !el.closest('.bp-hit')) {
        misses.push({ label: g.getAttribute('aria-label'), x: Math.round(x), y: Math.round(y) });
      }
    }
  }
  const where = document.querySelector('.bp-foot__where');
  const storey = document.querySelector('.bp-foot__tier');
  return {
    svgBox: { x: sb.x, y: sb.y, w: sb.width, h: sb.height },
    cell: (() => {
      const z = document.querySelector('.bp-hit .bp-hit__zone');
      if (!z) return null;
      const r = z.getBoundingClientRect();
      return { w: r.width, h: r.height };
    })(),
    lines,
    probes,
    misses,
    storey: storey ? storey.textContent.trim() : null,
    whereOverflows: where ? where.scrollWidth > where.clientWidth + 1 : false,
    rowNames: window.__manorStore.getState().manor
      ? window.__manorStore.getState().manor.playerCell.row : null,
  };
});

/** Where the three index tabs are, to the pixel. */
const readIndex = (page) => page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.bp-foot__actions button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { label: b.textContent.trim().replace(/\d+$/, ''), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
  }),
  deeds: [...document.querySelectorAll('.bp-foot__deeds button')].map((b) => b.textContent.trim()),
  // A deed that has leaked back into the index row is the defect itself.
  deedsInIndex: [...document.querySelectorAll('.bp-foot__actions button')]
    .filter((b) => !b.classList.contains('bp-btn--quiet')).map((b) => b.textContent.trim()),
}));

/* ───────────────────────────── THE VERDICTS ──────────────────────────────── */

const ROW_NAMES = [
  'the ground floor', 'the half landing', 'the first landing', 'the second landing',
  'the third landing', 'the Sanctum landing', 'the Sanctum',
];

function judgeOffer(offer, viewport, ok, fail) {
  if (!offer) { fail('the draft offer never opened'); return; }

  /* A1 — THE ROUND'S HEADLINE. A utility card's preview line IS its price. */
  const utility = offer.cards.filter((c) => c.utility);
  if (utility.length === 0) {
    fail('no utility card in this offer — the run cannot measure the line it exists for');
  }
  for (const c of utility) {
    if (!c.preview || c.preview.w < 1 || c.preview.h < 1) {
      fail(`${c.name} is a utility card and its price line has a ${c.preview ? `${Math.round(c.preview.w)}x${Math.round(c.preview.h)}` : 'missing'} box — this is the defect a blind tester was marked wrong for reporting`);
    } else if (!c.preview.seen) {
      fail(`${c.name}'s price line is drawn but something is on top of it`);
    } else if (!/[+\-−]\d/.test(c.preview.text)) {
      fail(`${c.name}'s preview line carries no number: ${JSON.stringify(c.preview.text)}`);
    } else if (!c.preview.stakeRegister) {
      fail(`${c.name}'s price is set in the flavour register beside rivals set in the stake register`);
    } else {
      ok(`${c.name}: its price is on the glass and priced against its rivals — ${JSON.stringify(c.preview.text)}`);
    }
  }

  /* A2 — the jargon row both testers named is off every card. */
  const withMeta = offer.cards.filter((c) => c.hasMetaRow).map((c) => c.name);
  if (withMeta.length === 0) ok('no card wears the rarity/tier-range row (round 33, fix 5)');
  else fail(`the jargon row is still on: ${withMeta.join(', ')}`);

  /* A3 — and none of it costs a pixel of scroll on the phone that matters. */
  if (offer.sheetScroll.sh <= offer.sheetScroll.ch + 1) {
    ok(`the offer sheet does not scroll (${offer.sheetScroll.sh}px in ${offer.sheetScroll.ch}px)`);
  } else {
    fail(`the offer sheet scrolls ${offer.sheetScroll.sh - offer.sheetScroll.ch}px`);
  }
  const cut = [];
  for (const c of offer.cards) {
    for (const l of c.lines) {
      if (l.h < 1) continue;
      if (l.bottom > offer.sheetBox.bottom + 0.5 || l.y < offer.sheetBox.y - 0.5) {
        cut.push(`${c.name}: ${JSON.stringify(l.text)}`);
      }
    }
  }
  if (cut.length === 0) ok(`every printed line on all ${offer.cards.length} cards is inside the sheet`);
  else fail(`lines cut by the sheet's own box: ${cut.join(' · ')}`);

  /* A4 — the gem's source, said at the moment a gem would have saved the run. */
  if (offer.purse > 0) {
    ok('she holds a gem, so the note is correctly absent (it is said only when it bites)');
  } else if (!offer.gemNote || offer.gemNote.h < 1) {
    fail('the purse is empty, the reroll is greyed, and nothing says where a gem comes from');
  } else if (!offer.gemNote.seen) {
    fail('the gem note is drawn but something is on top of it');
  } else if (!/seals itself/.test(offer.gemNote.text)) {
    fail(`the gem note names no source: ${JSON.stringify(offer.gemNote.text)}`);
  } else if (offer.gemNote.bottom > viewport.height + 0.5) {
    fail(`the gem note is off the glass at ${Math.round(offer.gemNote.bottom)} in ${viewport.height}`);
  } else {
    ok(`the empty purse says where a gem comes from — ${JSON.stringify(offer.gemNote.text)}`);
  }
}

function judgeMap(map, ok, fail) {
  if (!map) { fail('the blueprint is not on the glass'); return; }

  /* B1 — the key is two sentences and an SVG root clips whatever runs past it. */
  if (map.lines.length !== 2) {
    fail(`the margin's key should be two lines; there are ${map.lines.length}`);
  } else {
    for (const l of map.lines) {
      if (!l.inside) {
        fail(`the key runs past the sheet's own box and an SVG root clips: ${JSON.stringify(l.text)} occupies user units x ${Math.round(l.bbox.x)}–${Math.round(l.bbox.right)} / y ${Math.round(l.bbox.y)}–${Math.round(l.bbox.bottom)} in a ${Math.round(l.viewBox.w)}x${Math.round(l.viewBox.h)} viewBox`);
      } else if (!l.seen) {
        fail(`the key line is drawn but covered by ${l.coveredBy}: ${JSON.stringify(l.text)}`);
      } else {
        ok(`key line on the glass, inside the plot: ${JSON.stringify(l.text)}`);
      }
    }
    /* B2 — and it says the two things nothing in the game had ever said. */
    const all = map.lines.map((l) => l.text).join(' ');
    if (/north is up/i.test(all)) ok('the key says which way is up — the half of the climb the cards could not carry');
    else fail(`the key never says north is up: ${JSON.stringify(all)}`);
    if (/diamond/i.test(all) && /move costs/i.test(all)) ok('the key names both marginal columns in words');
    else fail(`the key does not define the margin's two mark columns: ${JSON.stringify(all)}`);
  }

  /* B3 — the viewBox grew, so re-prove every control owns its own surface. */
  if (map.misses.length === 0) {
    ok(`all ${map.probes} probes land on their own control (cell ${Math.round(map.cell?.w ?? 0)}px)`);
  } else {
    fail(`${map.misses.length}/${map.probes} probes miss: ${JSON.stringify(map.misses.slice(0, 4))}`);
  }
  if ((map.cell?.w ?? 0) >= 44) ok(`a room is still ${Math.round(map.cell.w)}px, clear of the 44pt floor`);
  else fail(`the widened margin shrank a room to ${Math.round(map.cell?.w ?? 0)}px`);

  /* B4 — the plate names the storey she is standing on, in one vocabulary. */
  if (map.storey && ROW_NAMES.includes(map.storey)) {
    ok(`the footer plate names the storey: ${JSON.stringify(map.storey)}`);
  } else {
    fail(`the footer plate should name the storey (rowName); it reads ${JSON.stringify(map.storey)}`);
  }
  if (!map.whereOverflows) ok('the plate holds the room name and the storey without overflowing');
  else fail('the plate overflows with the storey name on it');
}

function judgeIndex(before, after, ok, fail) {
  if (after.deeds.length === 0 && after.deedsInIndex.length === 0) {
    fail('no contextual deed ever appeared — the run cannot measure what it does to the index');
    return;
  }
  if (after.deedsInIndex.length > 0) {
    fail(`a deed is in the index row: ${after.deedsInIndex.join(', ')}`);
  }
  const moved = [];
  for (let i = 0; i < before.tabs.length; i++) {
    const b = before.tabs[i];
    const a = after.tabs[i];
    if (!a || a.label !== b.label || a.x !== b.x || a.y !== b.y) {
      moved.push(`${b.label}: ${b.x},${b.y} → ${a ? `${a.x},${a.y}` : 'gone'}`);
    }
  }
  if (moved.length === 0) {
    ok(`the index held still while [${after.deeds.join(', ')}] appeared — ${before.tabs.map((t) => `${t.label}@${t.x}`).join(' ')}`);
  } else {
    fail(`the index moved under the player's thumb: ${moved.join(' · ')}`);
  }
}

function judgeRefusal(line, ok, fail) {
  if (!line) { fail('a keyless padlock was tapped and the sheet said nothing'); return; }
  if (!/key/i.test(line)) fail(`the refusal names no remedy: ${JSON.stringify(line)}`);
  else if (!/solve[sd]?\b/i.test(line)) {
    fail(`the refusal names the remedy but not where it comes from: ${JSON.stringify(line)}`);
  } else {
    ok(`a real tap on the brass answers with the source: ${JSON.stringify(line)}`);
  }
}

/* ───────────────────────────── THE DRIVING ───────────────────────────────── */

/** Real pointerdown/pointerup — element.click() drives nothing in this game. */
async function tap(page, x, y) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

async function tapSelector(page, sel) {
  const at = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
  if (!at) return false;
  await tap(page, at.x, at.y);
  return true;
}

async function reachExploring(page) {
  await page.evaluate(() => {
    const s = () => window.__manorStore.getState();
    if (!s().day) s().startDay();
    if (s().day?.phase === 'morning') s().advanceDayPhase();
  });
  await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring');
  await page.waitForSelector('.bp-sheet');
  // Dismiss whatever the morning put up, so the drawing is the top surface.
  for (let i = 0; i < 10; i++) {
    const clear = await page.evaluate(
      () => !document.querySelector('.dlg, .mom-seal, [data-overlay]'),
    );
    if (clear) break;
    await page.keyboard.press('Escape');
    await sleep(220);
  }
  await sleep(300);
}

/* ────────────────────────────── THE RUN ──────────────────────────────────── */

let browser;
let failures = 0;
let proveRed = 0;
try {
  await serverUp;
  log('dev server up on', BASE);
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    const label = `${viewport.width}x${viewport.height}`;
    const ok = (m) => console.log(`[r33] ${label}   ✓`, m);
    const fail = (m) => { console.error(`[r33] ${label}   ✗ FAIL:`, m); failures++; };
    /* In --prove the SAME functions run against a re-broken page; a fail is
     * the expected result and is counted rather than reported as a failure. */
    const reds = [];
    const proveFail = (m) => { reds.push(m); };
    const proveOk = () => {};

    log('');
    log(`— ${label} —`);

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      for (const r of regs) await r.unregister();
      localStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 60000 });
    await reachExploring(page);

    /* ── B. THE MAP, before anything is opened over it ───────────────────── */
    const map = await readMap(page);
    if (PROVE) {
      log(`${label}   [prove] restoring the pre-round-33 viewBox under the new legend…`);
      await page.evaluate((h) => {
        const svg = document.querySelector('.bp-sheet');
        const [x, y, w] = svg.getAttribute('viewBox').split(' ');
        svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
      }, PRE_ROUND33_VIEW_H);
      await sleep(200);
      judgeMap(await readMap(page), proveOk, proveFail);
    } else {
      judgeMap(map, ok, fail);
    }

    /* ── C(i). THE INDEX, with no deed on the plate ──────────────────────── */
    const indexBefore = await readIndex(page);

    /* ── A. THE OFFER SHEET — opened by a real tap on a ghost room ───────── */
    const ghost = await page.evaluate(() => {
      const g = document.querySelector('.bp-ghost:not(.bp-ghost--shut)');
      if (!g) return null;
      const r = g.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!ghost) fail('no draftable door on the first morning');
    else {
      await tap(page, ghost.x, ghost.y);
      await page.waitForSelector('.bp-modal .bp-card', { timeout: 8000 }).catch(() => {});
    }
    if (PROVE) {
      log(`${label}   [prove] re-hiding the preview line and the gem note…`);
      await page.addStyleTag({
        content: '.bp-card__preview { display: none !important }'
          + ' .bp-modal__gems { display: none !important }',
      });
      await sleep(200);
      judgeOffer(await readOffer(page), viewport, proveOk, proveFail);
    } else {
      judgeOffer(await readOffer(page), viewport, ok, fail);
    }

    /* ── C(ii). Take a card, step back out, re-measure the index ─────────── */
    // A puzzle card: taking it lays the room, walks her into it AND opens it, so
    // stepping back out leaves her standing on an unsolved puzzle — which is
    // exactly the state that puts "Enter" on the plate. All real taps.
    const puzzleAt = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.bp-modal .bp-card')]
        .find((el) => el.classList.contains('bp-card--puzzle') && !el.disabled);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (puzzleAt) {
      await tap(page, puzzleAt.x, puzzleAt.y);
      await page.waitForSelector('.bp-modal', { state: 'detached', timeout: 8000 }).catch(() => {});
      await sleep(600);
      // "Step away" — the room's own leave control (RoomHost), tapped for real.
      const away = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')]
          .find((el) => /Step away|Step back out/.test(el.textContent || ''));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (away) { await tap(page, away.x, away.y); }
      await page.waitForSelector('.bp-sheet', { timeout: 8000 }).catch(() => {});
      await sleep(600);
      for (let i = 0; i < 6; i++) {
        // eslint-disable-next-line no-await-in-loop
        const clear = await page.evaluate(() => !document.querySelector('.dlg, [data-overlay]'));
        if (clear) break;
        // eslint-disable-next-line no-await-in-loop
        await page.keyboard.press('Escape');
        // eslint-disable-next-line no-await-in-loop
        await sleep(220);
      }
    }
    if (PROVE) {
      log(`${label}   [prove] moving the deed back into the index row…`);
      await page.evaluate(() => {
        const row = document.querySelector('.bp-foot__actions');
        for (const b of document.querySelectorAll('.bp-foot__deeds button')) {
          row.insertBefore(b, row.firstChild);
        }
      });
      await sleep(200);
      judgeIndex(indexBefore, await readIndex(page), proveOk, proveFail);
    } else {
      judgeIndex(indexBefore, await readIndex(page), ok, fail);
      /* The deed row is the SHORTEST the drawing ever is — the plate takes a
       * whole extra row and the sheet's `meet` scale drops with it. That is the
       * geometry the round-33 viewBox has to survive, so the probes are run
       * again here rather than only on the empty plate. */
      const squeezed = await readMap(page);
      if (squeezed && squeezed.misses.length === 0 && (squeezed.cell?.w ?? 0) >= 44) {
        ok(`with the deed row up the drawing is at its shortest and still hands over all ${squeezed.probes} probes (cell ${Math.round(squeezed.cell.w)}px)`);
      } else {
        fail(`the deed row squeezes the drawing to ${Math.round(squeezed?.cell?.w ?? 0)}px with ${squeezed?.misses.length ?? '?'} missed probes`);
      }
      const outside = (squeezed?.lines ?? []).filter((l) => !l.inside);
      if (squeezed && squeezed.lines.length === 2 && outside.length === 0) {
        ok('and the margin key is still whole inside the viewBox at that height');
      } else {
        fail(`the key is clipped once the plate takes its second row: ${JSON.stringify(outside.map((l) => l.text))}`);
      }
    }

    /* ── D. THE PADLOCK — seeded position, REAL tap, drawn answer ────────── */
    // Setup only: the manor is seeded so a keyless brass door is at her feet.
    // Everything asserted is driven by a real pointer and read off the drawing.
    let refusalLine = null;
    {
      // Sweep the frontier cells until the SHEET ITSELF draws a locked ghost.
      // The lock roll is the app's (engine/manor/locks.ts) and is never
      // re-implemented here: the run stands her on a candidate storey and asks
      // the drawing which of its doors it has put brass on.
      for (let row = 3; row <= 5 && !refusalLine; row++) {
        for (let col = 0; col < 5 && !refusalLine; col++) {
          // eslint-disable-next-line no-await-in-loop
          await page.evaluate(({ c, r }) => {
            const s = window.__manorStore.getState();
            const manor = s.manor;
            const rooms = { ...manor.rooms };
            rooms[`${c},${r}`] = {
              cardId: 'library', cell: { col: c, row: r }, doors: ['N', 'S'], kind: 'word-web', solved: true,
            };
            window.__manorStore.setState({
              manor: { ...manor, rooms, playerCell: { col: c, row: r } },
              currencies: { ...s.currencies, keys: 0 },
            });
          }, { c: col, r: row });
          // eslint-disable-next-line no-await-in-loop
          await sleep(160);
          // eslint-disable-next-line no-await-in-loop
          const locked = await page.evaluate(() => {
            const g = document.querySelector('.bp-ghost--locked.bp-ghost--shut')
              || document.querySelector('.bp-ghost--locked');
            if (!g) return null;
            const r = g.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          });
          if (!locked) continue;
          // eslint-disable-next-line no-await-in-loop
          await tap(page, locked.x, locked.y);
          // eslint-disable-next-line no-await-in-loop
          await sleep(350);
          // eslint-disable-next-line no-await-in-loop
          refusalLine = await page.evaluate(
            () => document.querySelector('.bp-refusal__line')?.textContent?.trim() ?? null,
          );
        }
      }
    }
    if (PROVE) {
      log(`${label}   [prove] rewriting the refusal to name only the remedy…`);
      judgeRefusal('Shut fast. It wants a key.', proveOk, proveFail);
    } else if (refusalLine === null) {
      fail('no padlocked door could be reached on any candidate storey — the refusal went unmeasured');
    } else {
      judgeRefusal(refusalLine, ok, fail);
    }

    if (PROVE) {
      /* Each defect this run re-introduces has to produce its OWN red. A count
       * would pass if one sabotage fired twice and another not at all, which is
       * exactly the shape standing rule 1 exists to forbid. */
      const REQUIRED = [
        [/runs past the sheet's own box/, 'the margin key, clipped by the root'],
        [/utility card and its price line has a 0x0 box/, "the utility card's price, hidden"],
        [/nothing says where a gem comes from/, "the gem's source, removed"],
        [/a deed is in the index row/, 'a deed back inside the index'],
        [/names the remedy but not where it comes from/, "the key's source, removed"],
      ];
      const unfired = REQUIRED.filter(([re]) => !reds.some((r) => re.test(r)));
      if (unfired.length === 0) {
        console.log(`[r33] ${label}   ✓ [prove] all ${REQUIRED.length} re-introduced defects go red (${reds.length} checks failed)`);
        for (const r of reds) console.log(`[r33] ${label}     · would fail: ${r}`);
        proveRed++;
      } else {
        console.error(`[r33] ${label}   ✗ FAIL: [prove] ${unfired.length} re-introduced defect(s) did NOT go red: ${unfired.map(([, w]) => w).join(' · ')}`);
        for (const r of reds) console.error(`[r33] ${label}     · did fail: ${r}`);
        failures++;
      }
    } else if (errors.length === 0) {
      ok('no page errors');
    } else {
      fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    }

    await context.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}

log('');
if (failures > 0) {
  console.error(`[r33] ${failures} FAILURE(S)`);
  process.exit(1);
}
if (PROVE && proveRed < VIEWPORTS.length) {
  console.error('[r33] --prove did not go red on every glass');
  process.exit(1);
}
log('all green');
