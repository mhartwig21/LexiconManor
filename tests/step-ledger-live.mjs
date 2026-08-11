/**
 * tests/step-ledger-live.mjs — THE LIVE EVIDENCE for round 32's fix 2 (the
 * day's account), driven in a real browser at 375x667 FIRST and 390x844
 * second, with real mouse input.
 *
 * WHY IT HAS TO BE LIVE. The thing being fixed is a SURFACE, not a value.
 * Round 26 put the reason word on every step float; the word was correct, the
 * routing was correct, `tests/step-reasons.test.ts` was green — and the next
 * two blind testers still reported their step counter moving for reasons they
 * could not see. Nothing in 1,366 unit tests can tell you whether a player can
 * reach a price, so this file asks the four questions a unit test cannot:
 *
 *   1. IS IT REACHABLE? `elementFromPoint` at the candle's centre AND at its
 *      four edge midpoints, then a real pointerdown/pointerup — the readout is
 *      a pill, so fixed corner insets give false misses (house rule).
 *   2. IS IT TRUE? The rows on the glass are read back as text and compared
 *      with the ledger the store actually holds. A sheet that prints a number
 *      the ledger does not have is worse than no sheet.
 *   3. DOES IT ADD UP ON THE GLASS? The printed allowance plus the printed
 *      rows must equal the printed total, parsed off the DOM — not recomputed
 *      from the store, or the assertion would be the fold read back to itself.
 *   4. DOES ANYTHING SCROLL? Nothing may scroll at 375x667 (house rule), so
 *      the sheet's list is measured `scrollHeight === clientHeight`, and the
 *      sheet's own box must sit inside the glass.
 *
 * AND — AAA 11.5 — opening the account may not become a new way to end the
 * day: with the sheet up, the retire control must not be mounted at all.
 *
 * NEGATIVE CONTROL (standing rule 1: no gate that passes by construction).
 * `--prove` re-runs the same assertion functions against a deliberately
 * sabotaged page — the sheet's rows are rewritten to lie, the list is forced
 * to overflow, and the sheet is pushed under the chrome bar — and the run
 * FAILS unless each check goes red. A gate that cannot be shown to fail is not
 * evidence.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser
 * instance, closed in a finally.
 *
 * Run: `node tests/step-ledger-live.mjs`
 *      `node tests/step-ledger-live.mjs --prove`
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
const log = (...a) => console.log('[ledger]', ...a);
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

/* ── The assertions, as functions, so --prove can run the SAME ones ───────── */

/** Parse "−7" / "+18" / "12" off the glass. Unicode minus, as rendered. */
const num = (t) => {
  const s = String(t).trim().replace(/−/g, '-').replace(/[^0-9+-]/g, '');
  return Number(s);
};

/** Everything the sheet says, read back off the DOM. */
async function readSheet(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('.chr-ledger__sheet');
    if (!sheet) return null;
    const list = sheet.querySelector('.chr-ledger__list');
    const box = sheet.getBoundingClientRect();
    const rows = [...sheet.querySelectorAll('.chr-ledger__row')].map((r) => ({
      why: r.querySelector('.chr-ledger__why')?.textContent?.trim() ?? '',
      n: r.querySelector('.chr-ledger__n')?.textContent?.trim() ?? '',
    }));
    const total = sheet.querySelector('.chr-ledger__total .chr-ledger__n')?.textContent?.trim() ?? '';
    return {
      rows,
      total,
      note: sheet.querySelector('.chr-ledger__note')?.textContent?.trim() ?? '',
      list: list ? { sh: list.scrollHeight, ch: list.clientHeight } : null,
      box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
      glass: { w: window.innerWidth, h: window.innerHeight },
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
      retireMounted: !!document.querySelector('.chr-retire'),
    };
  });
}

/** The store's own ledger, for the truth comparison. */
const readLedger = (page) => page.evaluate(() => {
  const s = window.__manorStore.getState();
  return { budget: s.ledger.budget, entries: s.ledger.entries.length, steps: s.stepsRemaining() };
});

function checks(sheet, ledger, viewport, fail, ok) {
  if (!sheet) { fail('the account is not on the glass at all'); return; }

  /* 3. it adds up, PARSED OFF THE GLASS (not recomputed from the store) */
  const printed = sheet.rows.reduce((sum, r) => sum + num(r.n), 0);
  if (printed === num(sheet.total)) {
    ok(`the column adds up on the glass: ${sheet.rows.length} rows sum to ${printed} = the printed total`);
  } else {
    fail(`the printed rows sum to ${printed} but the printed total says ${num(sheet.total)}`);
  }

  /* 2. and the glass agrees with the ledger the store is holding */
  if (num(sheet.total) === ledger.steps) {
    ok(`the printed total (${num(sheet.total)}) is the ledger's own steps remaining`);
  } else {
    fail(`the sheet prints ${num(sheet.total)} steps; the store holds ${ledger.steps}`);
  }
  const allowance = sheet.rows[0];
  if (allowance && /allowance/.test(allowance.why) && num(allowance.n) === ledger.budget) {
    ok(`the base allowance is on the glass and is the ledger's budget (${ledger.budget})`);
  } else {
    fail(`the first row should be the ledger's budget (${ledger.budget}); it reads ${JSON.stringify(allowance)}`);
  }

  /* 4. nothing scrolls */
  if (sheet.list && sheet.list.sh === sheet.list.ch) {
    ok(`the account does not scroll (${sheet.list.sh}px of rows in ${sheet.list.ch}px)`);
  } else {
    fail(`the account scrolls: ${sheet.list?.sh}px of rows in ${sheet.list?.ch}px`);
  }
  if (!sheet.pageScrolls) ok('the page itself does not scroll behind it');
  else fail('the page scrolls with the account open');

  /* the sheet is inside the glass, top and bottom */
  const inside = sheet.box.top >= 0 && sheet.box.bottom <= viewport.height + 1
    && sheet.box.left >= 0 && sheet.box.right <= viewport.width + 1;
  if (inside) ok('the whole sheet is inside the glass');
  else fail(`the sheet is off the glass: ${JSON.stringify(sheet.box)} in ${viewport.width}x${viewport.height}`);

  /* AAA 11.5 — the destructive control is not mounted under an overlay */
  if (!sheet.retireMounted) ok('the retire control is not mounted while the account is open (AAA 11.5)');
  else fail('the retire control is live behind the account — two taps end the day');

  /* the closing sentence, which is doing the belief-killing */
  if (/Only what is written here was charged/.test(sheet.note)) {
    ok('the account closes on “Only what is written here was charged.”');
  } else {
    fail(`the closing sentence is missing or rewritten: ${JSON.stringify(sheet.note)}`);
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
    const ok = (m) => console.log(`[ledger] ${label}   ✓`, m);
    const fail = (m) => { console.error(`[ledger] ${label}   ✗ FAIL:`, m); failures++; };

    log('');
    log(`— ${label} —`);

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 60000 });

    /* A day with a real spread of charges on it. The ENTRIES go in through the
     * audited path (`applyStepEntry` → `priceEntry`), which is setup, not the
     * claim: everything asserted below is driven by real mouse input on the
     * real chrome and read back off the real DOM. */
    await page.evaluate(() => {
      const s = () => window.__manorStore.getState();
      s().startDay();
      s().advanceDayPhase();
      const at = Date.now();
      s().applyStepEntry({ reason: 'move', delta: -2, at, roomKey: '1,0' });
      s().applyStepEntry({ reason: 'move', delta: -2, at, roomKey: '2,0' });
      s().applyStepEntry({ reason: 'move', delta: -7, at, roomKey: '1,3>1,4' });
      s().applyStepEntry({ reason: 'solve', delta: 4, at });
      s().applyStepEntry({ reason: 'hint', delta: -2, at });
      s().applyStepEntry({ reason: 'gift', delta: -1, at });
      location.hash = '#/';
    });
    await sleep(2400);   // let the dawn float batch and the first-run key clear

    /* --- 1. the candle is reachable, centre AND edge midpoints ------------- */
    const probe = await page.evaluate(() => {
      const btn = document.querySelector('.chr-steps__open');
      if (!btn) return { found: false };
      const r = btn.getBoundingClientRect();
      const pts = {
        centre: [r.x + r.width / 2, r.y + r.height / 2],
        top: [r.x + r.width / 2, r.y + 2],
        bottom: [r.x + r.width / 2, r.bottom - 2],
        left: [r.x + 2, r.y + r.height / 2],
        right: [r.right - 2, r.y + r.height / 2],
      };
      const hits = {};
      for (const [name, [x, y]] of Object.entries(pts)) {
        const el = document.elementFromPoint(x, y);
        hits[name] = !!(el && (el === btn || btn.contains(el)));
      }
      return { found: true, hits, centre: pts.centre, box: { w: r.width, h: r.height } };
    });
    if (!probe.found) {
      fail('there is no `.chr-steps__open` — the candle is not a control');
    } else {
      const missed = Object.entries(probe.hits).filter(([, hit]) => !hit).map(([n]) => n);
      if (missed.length === 0) {
        ok(`the candle answers at its centre and all four edge midpoints (${Math.round(probe.box.w)}x${Math.round(probe.box.h)})`);
      } else {
        fail(`the candle is buried at: ${missed.join(', ')}`);
      }
      if (probe.box.h >= 44) ok(`the target clears the 44pt floor (${Math.round(probe.box.h)}px)`);
      else fail(`the target is ${Math.round(probe.box.h)}px tall, under the 44pt floor`);

      /* REAL mouse input — the game commits on pointerdown/pointerup. */
      await page.mouse.move(probe.centre[0], probe.centre[1]);
      await page.mouse.down();
      await sleep(60);
      await page.mouse.up();
      await sleep(400);
    }

    if (PROVE) {
      /* ── NEGATIVE CONTROL ────────────────────────────────────────────────
       * Sabotage each thing the checks above claim, then require them to go
       * red. This is what makes the green run mean something. */
      log(`${label}   [prove] sabotaging the sheet…`);
      await page.evaluate(() => {
        const sheet = document.querySelector('.chr-ledger__sheet');
        if (!sheet) return;
        // (a) make the column lie
        const first = sheet.querySelector('.chr-ledger__row .chr-ledger__n');
        if (first) first.textContent = '+999';
        // (b) force the list to overflow
        const list = sheet.querySelector('.chr-ledger__list');
        if (list) {
          list.style.maxHeight = '20px';
          list.style.height = '20px';
          for (let i = 0; i < 30; i++) {
            const li = document.createElement('li');
            li.className = 'chr-ledger__row';
            li.innerHTML = '<span class="chr-ledger__why">x</span><span class="chr-ledger__n">0</span>';
            list.appendChild(li);
          }
        }
        // (c) push the sheet off the glass
        sheet.style.top = '-200px';
        // (d) rewrite the closing sentence
        const note = sheet.querySelector('.chr-ledger__note');
        if (note) note.textContent = 'Prices may vary.';
      });
      const sabotaged = await readSheet(page);
      const ledgerNow = await readLedger(page);
      const red = [];
      checks(sabotaged, ledgerNow, viewport, (m) => red.push(m), () => {});
      const WANT = 4;   // adds-up, no-scroll, inside-the-glass, closing sentence
      if (red.length >= WANT) {
        ok(`[prove] the sabotaged sheet fails ${red.length} checks — the gate can go red`);
        red.forEach((m) => console.log(`[ledger] ${label}     · would fail: ${m}`));
      } else {
        fail(`[prove] the sabotaged sheet only failed ${red.length} checks (wanted >= ${WANT}) — this gate passes by construction`);
      }
      await context.close();
      continue;
    }

    const sheet = await readSheet(page);
    const ledger = await readLedger(page);
    if (sheet) log(`${label}   rows: ${sheet.rows.map((r) => `${r.why} ${r.n}`).join(' · ')} | total ${sheet.total}`);
    checks(sheet, ledger, viewport, fail, ok);

    /* --- 5. and it closes again, by real input on the scrim --------------- */
    if (sheet) {
      await page.mouse.move(viewport.width / 2, viewport.height - 12);
      await page.mouse.down();
      await sleep(60);
      await page.mouse.up();
      await sleep(300);
      const gone = await page.evaluate(() => !document.querySelector('.chr-ledger'));
      if (gone) ok('a tap outside puts the account away');
      else fail('the account will not close on a tap outside');
    }

    if (errors.length) fail(`console/page errors: ${errors.slice(0, 3).join(' | ')}`);
    else ok('no page errors');

    await context.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}

log('');
if (failures) {
  console.error(`[ledger] ${failures} FAILURE(S)`);
  process.exit(1);
}
log('all green');
