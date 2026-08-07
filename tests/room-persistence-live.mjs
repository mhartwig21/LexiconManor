/**
 * tests/room-persistence-live.mjs — THE LIVE EVIDENCE for REVIEW_AA §5.3 and
 * §5.4, driven in a real browser at 390x844@2x.
 *
 * §0.1.7's rule applies with full force here: the unit suite proves the pure
 * functions restore a board, but the defect the editor reported was a REAL
 * RELOAD of a REAL TAB — `RoomHost`'s effect, the store's persist-on-mutation
 * subscription, localStorage, `migrate()`, and the per-kind view all in the
 * same line. A green unit test with a broken wire is exactly the failure this
 * file exists to catch.
 *
 * WHAT IT DRIVES, per room kind: open the room, play it with real taps and real
 * keystrokes until it has CHARGED her, reload the tab, and demand that the
 * board, the work and the steps all come back the same. Then, in the Library,
 * solve outright and prove the room cannot be paid for twice.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser instance,
 * closed in a finally. 390x844 @2x.
 *
 * Run: `node tests/room-persistence-live.mjs`   (spawns its own vite dev server)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pool = (name) =>
  JSON.parse(readFileSync(resolve(ROOT, `content/generated/${name}.json`), 'utf8'));

const WORD_WEB = pool('word-web');
const HIVE = pool('hive');
const SUDOKU = pool('sudoku');

async function freePort(from = 5361, to = 5420) {
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

const log = (...a) => console.log('[room]', ...a);
const ok = (m) => console.log('[room]   ✓', m);
let failures = 0;
const fail = (m) => { console.error('[room]   ✗ FAIL:', m); failures++; };
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- dev server ----------------------------------------------------------- */

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

const CELL_KEY = '2,1';        // row 1 ⇒ tier 1
const DAY_SEED = 4242;
const BUDGET = 20;             // the editor's Library board started on 20 steps

let browser;
try {
  await serverUp;
  log('dev server up on', BASE);

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 60000 });

  /**
   * Stand her in a one-room manor of the kind under test, mid-day, on a lean
   * budget. `puzzleId` is deliberately left UNPINNED so the room opens by
   * `select()` — i.e. the restore under test is genuinely the saved session and
   * not the placement pin quietly doing the work.
   */
  const enter = async (kind) => {
    await page.evaluate(([key, kindArg, seed, budget]) => {
      const store = window.__manorStore;
      const [col, row] = key.split(',').map(Number);
      store.setState({
        day: { day: 1, phase: 'exploring', daySeed: seed, activeRoom: null },
        ledger: { budget, entries: [] },
        manor: {
          rooms: {
            [key]: {
              cardId: `live-${kindArg}`, cell: { col, row }, doors: ['S'],
              solved: false, kind: kindArg,
            },
          },
          playerCell: { col, row },
          daySeed: seed,
        },
      });
      store.getState().enterRoom(key);
      location.hash = '#/room';
    }, [CELL_KEY, kind, DAY_SEED, BUDGET]);
    await page.waitForSelector('.room-host__stage', { timeout: 20000 });
    await sleep(400);
  };

  /** Everything worth comparing across a reload. */
  const snapshot = async () => {
    await sleep(2400);                       // let the room's toasts expire
    return page.evaluate((key) => {
      const s = window.__manorStore.getState();
      const placed = s.manor?.rooms[key];
      const stage = document.querySelector('.room-host__stage');
      return {
        steps: s.stepsRemaining(),
        keys: s.currencies.keys,
        solvedFlag: !!placed?.solved,
        puzzleId: placed?.session?.puzzleId ?? null,
        state: JSON.stringify(placed?.session?.state ?? null),
        done: placed?.session?.done ?? null,
        solvedOnce: placed?.session?.solvedOnce ?? null,
        text: (stage?.innerText || '').replace(/\s+/g, ' ').trim(),
        footer: (document.querySelector('.room-host__footer button')?.textContent || '').trim(),
      };
    }, CELL_KEY);
  };

  /** Kill the tab. Come back to the same room. */
  const reloadIntoRoom = async () => {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 60000 });
    await page.waitForSelector('.room-host__stage', { timeout: 20000 });
    await sleep(400);
  };

  const compare = (room, before, after, { expectSameSteps = true } = {}) => {
    check(after.puzzleId === before.puzzleId,
      `${room}: the same board came back (${after.puzzleId})`,
      `${room}: came back a DIFFERENT board — ${before.puzzleId} → ${after.puzzleId}`);
    check(after.state === before.state,
      `${room}: adapter state identical across the reload`,
      `${room}: progress lost.\n      before ${before.state}\n      after  ${after.state}`);
    check(after.text === before.text,
      `${room}: the rendered board is character-for-character what she left`,
      `${room}: the room redrew differently.\n      before ${before.text.slice(0, 220)}\n      after  ${after.text.slice(0, 220)}`);
    if (expectSameSteps) {
      check(after.steps === before.steps,
        `${room}: ${after.steps} steps — charged once, not twice, not refunded`,
        `${room}: step count moved across a reload — ${before.steps} → ${after.steps}`);
    }
  };

  /* ======================================================================
     1. THE LIBRARY (word-web) — the editor's exact scenario
     "solve a group, pay −4 in wrong-group penalties (20 → 16 steps), reload,
     and you get back sixteen unsolved tiles AND 16 steps."
     ====================================================================== */
  log('');
  log('— 1. The Library (word-web) —');
  await enter('word-web');

  const libraryId = (await snapshot()).puzzleId;
  const libraryBoard = WORD_WEB.find((p) => p.id === libraryId);
  if (!libraryBoard) throw new Error(`word-web board ${libraryId} not in the shipped pool`);

  const tapTiles = async (words) => {
    for (const w of words) {
      await page.click(`.ww-tile:text-is("${w}")`, { timeout: 8000 });
      await sleep(90);
    }
    await page.click('.anch-btn--primary');
    await sleep(1400);                        // the merge/shake animation
  };

  // Two wrong claims (−2 each at tier 1) and one true thread woven — the
  // editor's −4, with a solved group on the board.
  await tapTiles(libraryBoard.groups.map((g) => g.words[0]));
  await tapTiles(libraryBoard.groups.map((g) => g.words[1]));
  await tapTiles(libraryBoard.groups[0].words);

  const libBefore = await snapshot();
  check(libBefore.steps === BUDGET - 4,
    `Library: the board charged her — ${BUDGET} → ${libBefore.steps} steps`,
    `Library: expected ${BUDGET - 4} steps after two wrong groups, saw ${libBefore.steps}`);
  const solvedBanners = await page.locator('.ww-banner__words').count();
  check(solvedBanners === 1,
    'Library: one thread woven before the reload',
    `Library: expected 1 solved banner before the reload, saw ${solvedBanners}`);

  await reloadIntoRoom();
  const libAfter = await snapshot();
  compare('Library', libBefore, libAfter);

  const bannersAfter = await page.locator('.ww-banner__words').count();
  const tilesAfter = await page.locator('.ww-tile').count();
  check(bannersAfter === 1 && tilesAfter === 12,
    `Library: back to a woven thread and twelve tiles (not sixteen) — the §5.3 defect, gone`,
    `Library: reload returned ${bannersAfter} banner(s) and ${tilesAfter} tiles`);

  /* ======================================================================
     2. THE CONSERVATORY (hive) — found words and the rank ladder
     ====================================================================== */
  log('');
  log('— 2. The Conservatory (hive) —');
  await enter('hive');
  const hiveId = (await snapshot()).puzzleId;
  const hiveBoard = HIVE.find((p) => p.id === hiveId);
  if (!hiveBoard) throw new Error(`hive board ${hiveId} not in the shipped pool`);

  for (const word of hiveBoard.validWords.slice(0, 4)) {
    await page.keyboard.type(word, { delay: 25 });
    await page.keyboard.press('Enter');
    await sleep(500);
  }
  // …and one structural slip, which is the one thing the hive charges for.
  await page.keyboard.type('ZZZZ', { delay: 25 });
  await page.keyboard.press('Enter');
  await sleep(600);

  const hiveBefore = await snapshot();
  const foundCount = JSON.parse(hiveBefore.state).hive.foundWords.length;
  check(foundCount === 4,
    `Conservatory: four words gathered, rank "${(hiveBefore.text.match(/Seed|Sprout|Bud|Shoot|Leaf|Blossom|Bower|Garden|Full Bloom/) || ['?'])[0]}"`,
    `Conservatory: expected 4 found words before the reload, saw ${foundCount}`);

  await reloadIntoRoom();
  compare('Conservatory', hiveBefore, await snapshot());

  /* ======================================================================
     3. THE COUNTING HOUSE (sudoku) — pencil marks AND inked figures
     The room the review calls the largest single time investment in the game:
     20–40 minutes of an expert board, previously thrown away by any eviction.
     ====================================================================== */
  log('');
  log('— 3. The Counting House (sudoku) —');
  await enter('sudoku');
  const sudokuId = (await snapshot()).puzzleId;
  const sudokuBoard = SUDOKU.find((p) => p.id === sudokuId);
  if (!sudokuBoard) throw new Error(`sudoku board ${sudokuId} not in the shipped pool`);

  const blanks = [];
  for (let i = 0; i < 81 && blanks.length < 3; i++) if (sudokuBoard.givens[i] === '.') blanks.push(i);

  const tapCell = async (i) => { await page.locator('.ch-cell').nth(i).click(); await sleep(120); };
  const tapFigure = async (d) => {
    await page.locator(`.ch-key--fig`).nth(d - 1).click();
    await sleep(200);
  };
  const pencilToggle = () => page.click('.ch-tool[aria-pressed]');

  // Two pencil marks in one cell (the eraser's trail — `pencilOrder`),
  await pencilToggle();
  await tapCell(blanks[0]);
  await tapFigure(Number(sudokuBoard.solution[blanks[0]]));
  await tapFigure((Number(sudokuBoard.solution[blanks[0]]) % 9) + 1);
  await pencilToggle();
  // an inked figure,
  await tapCell(blanks[1]);
  await tapFigure(Number(sudokuBoard.solution[blanks[1]]));
  // and the one priced claim in the room.
  await page.click('.ch-tool:has-text("Balance")');
  await sleep(600);

  const sudokuBefore = await snapshot();
  const eng = JSON.parse(sudokuBefore.state).engine;
  check(eng.pencil[blanks[0]] !== 0 && eng.values[blanks[1]] !== 0,
    'Counting House: a marked cell and an inked figure on the leaf',
    `Counting House: the drill did not land — pencil ${eng.pencil[blanks[0]]}, ink ${eng.values[blanks[1]]}`);
  check(sudokuBefore.steps < BUDGET,
    `Counting House: the balance was charged — ${BUDGET} → ${sudokuBefore.steps} steps`,
    `Counting House: nothing was charged (${sudokuBefore.steps}), so the reload proves less than it should`);

  await reloadIntoRoom();
  compare('Counting House', sudokuBefore, await snapshot());

  /* ======================================================================
     4. §5.4 — THE RE-SOLVE EXPLOIT
     Solve the Library outright, note the payout, and run the editor's loop.
     ====================================================================== */
  log('');
  log('— 4. §5.4: a room is paid for once —');
  await enter('word-web');
  const exploitId = (await snapshot()).puzzleId;
  const exploitBoard = WORD_WEB.find((p) => p.id === exploitId);

  for (const g of exploitBoard.groups) await tapTiles(g.words);
  // AAA 2.11: the last thread must be NAMED before the room solves.
  const nameCard = await page.locator('.ww-name__options .anch-btn').count();
  if (nameCard > 0) {
    const trueTheme = exploitBoard.groups.find(
      (g) => !exploitBoard.groups.some((o) => o !== g && false),
    );
    // Tap the option that matches the last group's own theme, quote-folded.
    const fold = (s) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
    const labels = await page.locator('.ww-name__options .anch-btn').allInnerTexts();
    const lastWords = JSON.parse((await snapshot()).state).pendingNaming?.words ?? [];
    const lastGroup = exploitBoard.groups.find(
      (g) => lastWords.length === 0 || g.words.every((w) => lastWords.includes(w)),
    ) ?? trueTheme;
    const idx = labels.findIndex((l) => fold(l) === fold(lastGroup.theme));
    await page.locator('.ww-name__options .anch-btn').nth(idx >= 0 ? idx : 0).click();
    await sleep(1200);
  }

  const paid = await snapshot();
  check(paid.solvedFlag,
    `§5.4: the Library is solved and paid — ${paid.steps} steps, ${paid.keys} key(s)`,
    '§5.4: the board did not reach a solved state, so the exploit cannot be exercised');

  // Lap the exploit: reload, walk back in, try to solve again. Three times.
  let lapFailed = false;
  for (let lap = 1; lap <= 3; lap++) {
    await reloadIntoRoom();
    const lapState = await snapshot();
    if (lapState.steps !== paid.steps || lapState.keys !== paid.keys) {
      fail(`§5.4: lap ${lap} PRINTED currency — steps ${paid.steps} → ${lapState.steps}, keys ${paid.keys} → ${lapState.keys}`);
      lapFailed = true;
      break;
    }
    if (lapState.puzzleId !== exploitId) {
      fail(`§5.4: lap ${lap} restocked the cell with ${lapState.puzzleId} — the seen-filter re-roll is back`);
      lapFailed = true;
      break;
    }
  }
  if (!lapFailed) ok('§5.4: three reload laps, no steps and no keys printed, the cell never restocked');

  // And the guard itself, on its own: hand the solved room a brand-new solved
  // event and demand it pays nothing.
  const guard = await page.evaluate(() => {
    const s = () => window.__manorStore.getState();
    const before = { steps: s().stepsRemaining(), keys: s().currencies.keys };
    s().applyRoomEvents([{ type: 'solved', perfect: true }], { status: 'solved', perfect: true });
    return { before, after: { steps: s().stepsRemaining(), keys: s().currencies.keys } };
  });
  check(guard.after.steps === guard.before.steps && guard.after.keys === guard.before.keys,
    '§5.4: a fresh `solved` event on an already-solved cell emits nothing',
    `§5.4: the guard leaked — steps ${guard.before.steps} → ${guard.after.steps}, keys ${guard.before.keys} → ${guard.after.keys}`);

  /* --- page errors -------------------------------------------------------- */
  log('');
  const real = errors.filter((e) => !/favicon|manifest|sw\.js|Failed to load resource/i.test(e));
  check(real.length === 0,
    'no page errors across the whole walk',
    `page errors:\n      ${real.join('\n      ')}`);

  log('');
  log(failures === 0 ? 'ALL LIVE CHECKS PASSED' : `${failures} LIVE CHECK(S) FAILED`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

process.exit(failures === 0 ? 0 : 1);
