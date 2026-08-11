/**
 * tests/round32-key-and-letter-live.mjs — THE LIVE EVIDENCE for round 32's
 * fixes 1 and 3, driven in a real browser at 375x667 FIRST and 390x844 second.
 *
 * Both fixes are LAYOUT defects on copy that already shipped correct, and both
 * were invisible to 1,366 unit tests, because a unit test cannot see a string
 * printed on top of another string or a card clipped by a flex shrink. So:
 *
 * (1) THE CURRENCY KEY. `.chr-key` is the ONLY on-screen statement of what
 *     gems, keys and bookmarks are, and the only statement of the carry-over
 *     rule. It was `position:absolute; top:calc(100%+4px); right:0` with NO
 *     BACKGROUND, so on the blueprint it printed straight onto "LEXICON MANOR
 *     — GROUNDS". Measured on HEAD before the fix, at 375x667: the note row at
 *     x 174–363 / y 69–86, the sheet title at x 52–323 / y 72–88. A blind
 *     tester called it "illegible mush"; the other never saw it at all. Rounds
 *     26 and 28 both spent effort on this caption.
 *     ASSERTED HERE: it has an opaque ground; it is inside the glass; and it
 *     is still INERT — an opaque slip that ate a tap meant for the blueprint
 *     would be the round-15 defect wearing a fix's clothes.
 *
 * (2) POSY'S WELCOME LETTER. `.jrn-sheet` is a flex column and its children
 *     defaulted to `flex-shrink: 1`, while `.jrn-letter` carries
 *     `overflow: hidden`. Measured on HEAD before the fix, at 375x667: a
 *     `.jrn-letter__body` 496px tall inside a `.jrn-letter` box of 328px, with
 *     `.jrn-sheet.scrollHeight === clientHeight === 484` — i.e. the last 250px
 *     of the game's tutorial document were not below the fold, they were
 *     UNREACHABLE BY ANY GESTURE. The tester whose copy stopped at "…spoken
 *     once a day, and" — one clause before the sentence naming the speaking
 *     tube — was not failing to scroll. And Posy's own seal-break aside, a
 *     full-screen `.dlg`, mounted on top of the letter in the same tick.
 *     ASSERTED HERE: the whole letter is on the glass, the tube sentence
 *     included; nothing covers it; the card clips nothing; and Posy still gets
 *     her line, after the letter is put away.
 *
 * NEGATIVE CONTROL (standing rule 1). `--prove` restores each defect on the
 * live page — strips the key's background, re-imposes the flex shrink, mounts
 * an overlay over the letter — and the run FAILS unless the checks go red.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'`; exactly ONE browser, closed in a finally.
 *
 * Run: `node tests/round32-key-and-letter-live.mjs`
 *      `node tests/round32-key-and-letter-live.mjs --prove`
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROVE = process.argv.includes('--prove');

/** The letter, as authored — so this file cannot go stale against the copy. */
const VOLUME = JSON.parse(
  readFileSync(resolve(ROOT, 'content/authored/volumes/volume-1.json'), 'utf8'),
);
const LETTER = VOLUME.letters.find((l) => l.id === 'first-post');
/** The sentence the whole fix exists for. */
const TUBE = 'speaking tube';
const SIGNOFF = LETTER.body.trim().split('\n').pop().trim();

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
];

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
const log = (...a) => console.log('[r32]', ...a);
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

/** A real press — the game commits on pointerdown/pointerup, never on click(). */
async function press(page, x, y) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
  await sleep(500);
}

/** Clear any moment seal sitting over the sheet (it owns the glass at z 100). */
async function clearMoments(page) {
  for (let i = 0; i < 4; i++) {
    // eslint-disable-next-line no-await-in-loop
    const mom = await page.evaluate(() => {
      const m = document.querySelector('.mom');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!mom) return;
    // eslint-disable-next-line no-await-in-loop
    await press(page, mom.x, mom.y);
    // eslint-disable-next-line no-await-in-loop
    await sleep(400);
  }
}

/* ── (1) THE CURRENCY KEY ────────────────────────────────────────────────── */

const readKey = (page) => page.evaluate(() => {
  const key = document.querySelector('.chr-key');
  if (!key) return null;
  const r = key.getBoundingClientRect();
  const cs = getComputedStyle(key);
  // The paint the caption is written ON. Parsed rather than string-matched so
  // any transparent form ("transparent", rgba(...,0)) reads as alpha 0.
  const bg = cs.backgroundColor;
  const m = /rgba?\(([^)]+)\)/.exec(bg);
  const parts = m ? m[1].split(',').map((n) => parseFloat(n)) : [];
  const alpha = bg === 'transparent' ? 0 : (parts.length === 4 ? parts[3] : (parts.length === 3 ? 1 : 0));
  return {
    text: key.textContent.trim(),
    box: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
    alpha,
    // Inert: a hit test at the caption's own centre must fall THROUGH to the
    // page beneath (round-15: a layer that eats a tap aimed at something else
    // is the defect, not the fix).
    swallows: (() => {
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!(el && key.contains(el));
    })(),
    glass: { w: window.innerWidth, h: window.innerHeight },
  };
});

function checkKey(key, viewport, fail, ok) {
  if (!key) { fail('the currency key is not on the glass at all'); return; }
  if (key.alpha === 1) ok(`the caption has an opaque ground (background alpha ${key.alpha})`);
  else fail(`the caption's background alpha is ${key.alpha} — it prints straight onto the page beneath`);

  const inside = key.box.left >= 0 && key.box.right <= viewport.width + 1
    && key.box.top >= 0 && key.box.bottom <= viewport.height + 1;
  if (inside) ok('the slip is inside the glass on every edge');
  else fail(`the slip is off the glass: ${JSON.stringify(key.box)}`);

  if (!key.swallows) ok('it is still inert — a tap at its centre falls through to the blueprint');
  else fail('the slip is swallowing taps meant for the page under it (round-15 defect)');

  if (/gems/.test(key.text) && /keys/.test(key.text) && /bookmarks/.test(key.text)) {
    ok('all three nouns are named');
  } else fail(`the three nouns are not all there: ${JSON.stringify(key.text)}`);
  if (/only the bookmarks keep overnight/.test(key.text)) ok('the carry-over rule is stated');
  else fail(`the carry-over rule is missing: ${JSON.stringify(key.text)}`);
}

/* ── (2) POSY'S LETTER ───────────────────────────────────────────────────── */

const readLetter = (page) => page.evaluate(() => {
  const sheet = document.querySelector('.jrn-sheet');
  const card = document.querySelector('.jrn-letter[data-letter-open="true"]');
  const body = card?.querySelector('.jrn-letter__body');
  if (!sheet || !card || !body) return null;
  const sr = sheet.getBoundingClientRect();
  const paras = [...body.querySelectorAll('p')].map((p) => {
    const r = p.getBoundingClientRect();
    return {
      txt: p.textContent,
      onGlass: r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1,
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
    };
  });
  const br = body.getBoundingClientRect();
  /* What is painted OVER the letter's own text? `elementsFromPoint` returns
   * topmost first, so everything before the body (or one of its own children)
   * is something else standing in front of it. The letter's own <p> is the
   * first hit on a healthy page — it must not be counted as a coverer, which
   * is the difference between this check and a naive `[0]`. */
  const stack = document.elementsFromPoint(
    br.x + br.width / 2, Math.min(br.y + 20, window.innerHeight - 4),
  );
  const coveredBy = [];
  for (const el of stack) {
    if (el === body || body.contains(el)) break;
    coveredBy.push(typeof el.className === 'string' && el.className ? el.className : el.tagName);
  }
  return {
    paras,
    // THE ROOT CAUSE, as a number: the card must not be clipping its own
    // contents. `overflow: hidden` + a flex shrink is what ate 250px of this
    // letter with nothing to scroll to.
    cardClips: card.scrollHeight > card.clientHeight + 1,
    card: { h: Math.round(card.getBoundingClientRect().height), sh: card.scrollHeight },
    bodyH: Math.round(br.height),
    coveredBy,
    dlgUp: !!document.querySelector('.dlg'),
  };
});

function checkLetter(letter, fail, ok) {
  if (!letter) { fail('the opened letter is not on the glass'); return; }

  const off = letter.paras.filter((p) => !p.onGlass);
  if (off.length === 0) {
    ok(`the whole letter is on the glass — ${letter.paras.length} paragraphs, ${letter.bodyH}px`);
  } else {
    fail(`${off.length} paragraph(s) are off the sheet, starting "${off[0].txt.slice(0, 46)}…"`);
  }

  const tube = letter.paras.find((p) => p.txt.includes(TUBE));
  if (!tube) fail(`no paragraph names the ${TUBE} — the copy has drifted from the gate`);
  else if (tube.onGlass) ok(`the sentence naming the ${TUBE} is fully on the glass`);
  else fail(`the ${TUBE} sentence is off the glass (${JSON.stringify(tube.rect)})`);

  const sign = letter.paras.find((p) => p.txt.trim() === SIGNOFF);
  if (sign && sign.onGlass) ok(`it is readable to the last line ("${SIGNOFF}")`);
  else fail(`the letter does not reach its sign-off on the glass`);

  if (!letter.cardClips) ok(`the card clips nothing (${letter.card.h}px box, ${letter.card.sh}px of content)`);
  else fail(`the card is clipping its own body: ${letter.card.sh}px of content in a ${letter.card.h}px box`);

  if (!letter.dlgUp && letter.coveredBy.length === 0) {
    ok('nothing is painted over the letter — Posy is not standing in front of it');
  } else {
    fail(`the letter is covered by: ${letter.dlgUp ? '.dlg' : letter.coveredBy.join(', ')}`);
  }
}

let browser;
let failures = 0;
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
    const ok = (m) => console.log(`[r32] ${label}   ✓`, m);
    const fail = (m) => { console.error(`[r32] ${label}   ✗ FAIL:`, m); failures++; };

    log('');
    log(`— ${label} · the currency key —`);

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 60000 });
    await page.evaluate(() => {
      const s = () => window.__manorStore.getState();
      s().startDay();
      s().advanceDayPhase();
      location.hash = '#/';
    });
    // The key waits out the dawn's step floats (KEY_IN_MS = 1400) before it
    // fades in, and retires on her first touch — so nothing may be tapped
    // between here and the read below.
    await sleep(2400);

    if (PROVE) {
      log(`${label}   [prove] stripping the caption's ground…`);
      await page.evaluate(() => {
        const key = document.querySelector('.chr-key');
        if (key) { key.style.background = 'transparent'; key.style.border = 'none'; }
      });
    }
    const key = await readKey(page);
    if (key) log(`${label}   key: ${JSON.stringify(key.text)} @ ${JSON.stringify(key.box)}`);
    const keyRed = [];
    checkKey(key, viewport, PROVE ? (m) => keyRed.push(m) : fail, PROVE ? () => {} : ok);
    if (PROVE) {
      if (keyRed.length >= 1) {
        ok(`[prove] the un-grounded caption fails ${keyRed.length} check(s) — this gate can go red`);
        keyRed.forEach((m) => console.log(`[r32] ${label}     · would fail: ${m}`));
      } else {
        fail('[prove] stripping the caption\'s background failed NOTHING — this gate passes by construction');
      }
    }

    /* --- Posy's letter ---------------------------------------------------- */
    log('');
    log(`— ${label} · Posy's welcome letter —`);
    await page.evaluate(() => { location.hash = '#/journal'; });
    await sleep(900);
    await clearMoments(page);
    await page.evaluate(() => { if (!location.hash.includes('journal')) location.hash = '#/journal'; });
    await sleep(600);
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('.jrn-tab')].find((e) => /Letters/.test(e.textContent));
      t?.click();
    });
    await sleep(500);
    await clearMoments(page);

    const head = await page.evaluate(() => {
      const h = document.querySelector('.jrn-letter__head');
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!head) {
      fail('there is no sealed letter in the tray on day 1');
    } else {
      await press(page, head.x, head.y);
      await sleep(600);

      if (PROVE) {
        log(`${label}   [prove] restoring the flex shrink and covering the letter…`);
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('.jrn-sheet > *')) el.style.flex = '1 1 auto';
          const dlg = document.createElement('div');
          dlg.className = 'dlg';
          dlg.style.cssText = 'position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.2)';
          document.body.appendChild(dlg);
        });
        await sleep(300);
      }

      const letter = await readLetter(page);
      const letterRed = [];
      checkLetter(letter, PROVE ? (m) => letterRed.push(m) : fail, PROVE ? () => {} : ok);
      if (PROVE) {
        letterRed.forEach((m) => console.log(`[r32] ${label}     · would fail: ${m}`));
        /* The overlay must be caught at BOTH sizes; the flex shrink only bites
         * where the glass is short, which is the whole reason this campaign
         * measures 375 first. Requiring the clip failure at 390 would be
         * requiring a defect that does not exist there. */
        const caughtCover = letterRed.some((m) => /covered by/.test(m));
        const caughtClip = letterRed.some((m) => /clipping/.test(m));
        if (!caughtCover) {
          fail('[prove] an overlay laid over the letter was NOT caught — this gate passes by construction');
        } else if (viewport.height <= 667 && !caughtClip) {
          fail('[prove] the flex shrink that ate 250px of this letter was NOT caught at 375x667');
        } else {
          ok(`[prove] the re-broken letter fails ${letterRed.length} check(s) — this gate can go red`);
        }
      } else {
        /* And Posy is not CUT, only held: putting the letter away gives her
         * her line. A beat deleted in the name of a layout fix would be a
         * regression wearing a fix's clothes. */
        await press(page, head.x, head.y);
        await sleep(700);
        const asideNow = await page.evaluate(() => !!document.querySelector('.dlg'));
        if (asideNow) ok('Posy gets her aside once the letter is put away — held, not cut');
        else fail('Posy never speaks: the seal-break aside was lost, not deferred');
      }
    }

    if (!PROVE) {
      if (errors.length) fail(`console/page errors: ${errors.slice(0, 3).join(' | ')}`);
      else ok('no page errors');
    }
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}

log('');
if (failures) {
  console.error(`[r32] ${failures} FAILURE(S)`);
  process.exit(1);
}
log('all green');
