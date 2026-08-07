/**
 * tests/round9-orientation-live.mjs — ROUND 9 VERIFIER: DOOR ORIENTATION.
 *
 * THE OWNER'S REPORT: "I'm also noticing issues with the orientation of
 * placement of rooms… I figure they should be determined by the direction I'm
 * facing when I enter the room."
 *
 * THE FIX, and therefore the two claims this run has to prove in a real
 * browser (AAA §0.1.7 — a unit test is not evidence that the SHIPPED page
 * behaves, and a screenshot alone is not evidence of anything):
 *
 *   1. ORIENTATION IS THE HEADING. The card's canonical 'N' is the door she
 *      walks in through and the whole plan turns rigidly to suit
 *      (engine/manor/grid.ts `orientLayout`). So the SAME card drafted from
 *      four different doors must land in the four expected rotations — and
 *      the corner's second door must be at the same bearing every single time.
 *
 *   2. THE CARD TELLS THE TRUTH. The door diagram on the draft card must be
 *      the room as it will actually be laid, at THIS door, post-rotation. It
 *      used to draw `doorLayouts[0]` pre-rotation, which is right at one door
 *      out of four by luck. Every claim below is read off the live DOM and the
 *      live store and compared; the screenshots are taken alongside, for the
 *      human, never as the criterion.
 *
 * Three cards are put in every offer on purpose — a dead end, a corridor and a
 * corner — so the contact sheet shows three DIFFERENT shapes all turned to the
 * same wall, which is what makes the convention legible in one look.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a playwright browser (it fails
 * silently here). Exactly ONE browser instance, closed in a finally.
 * 390x844 @2x. Runs against the BUILT app under `vite preview`.
 *
 * Run: `npx vite build && node tests/round9-orientation-live.mjs`
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(ROOT, 'docs/shots/round9/orientation');
mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log('[r9-orient]', ...a);
const ok = (m) => console.log('[r9-orient]   OK', m);
let failures = 0;
const fail = (m) => { console.error('[r9-orient]   FAIL:', m); failures++; };
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };

/**
 * THE CONVENTION, written out as a table so this file states the expectation
 * independently of the implementation. Corner is ['N','E']: 'N' is the entry.
 * Walking north, the entry wall is the room's SOUTH wall (2 turns), so the
 * corner's 'E' becomes 'W'. And so on round the compass.
 */
const EXPECTED = {
  N: { 'still-room': ['S', 'W'], 'larder': ['S'], 'boot-room': ['N', 'S'] },
  E: { 'still-room': ['N', 'W'], 'larder': ['W'], 'boot-room': ['E', 'W'] },
  S: { 'still-room': ['N', 'E'], 'larder': ['N'], 'boot-room': ['N', 'S'] },
  W: { 'still-room': ['E', 'S'], 'larder': ['E'], 'boot-room': ['E', 'W'] },
};
const HEADING_WORDS = { N: 'north', E: 'east', S: 'south', W: 'west' };
const TARGET = { N: '2,4', E: '3,3', S: '2,2', W: '1,3' };

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

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview',
    '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
server.stdout.on('data', (b) => process.stdout.write(`[preview] ${b}`));
server.stderr.on('data', (b) => process.stderr.write(`[preview] ${b}`));
/** Poll the port rather than parse banners — preview's stdout is decorated. */
const serverUp = (async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(BASE, { redirect: 'follow' });
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview did not answer within 60s');
})();

let browser;
const plates = [];
try {
  await serverUp;
  log('preview up on', BASE);

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

  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-sheet, .bp-page, .chr-scene', { timeout: 30000 });

  /**
   * Seed the house she is standing in and the offer at her feet. Written as
   * plain data through the read-only debug handle (`window.__manorStore`, AAA
   * 7.18) rather than by playing forward, so that all four headings start from
   * the byte-identical house and the ONLY variable is which way she walks.
   */
  const seed = (atDoor) => page.evaluate((dir) => {
    const store = window.__manorStore;
    const card = (id, name, doorLayouts, tierRange) => ({
      id, name, category: 'utility', doorLayouts, tierRange,
      gemCost: 0, rarity: 'common',
    });
    const here = { col: 2, row: 3 };
    store.setState({
      day: { day: 1, phase: 'exploring', daySeed: 4242, activeRoom: null },
      // A fat budget and a padlock's worth of keys: this run is about which
      // way a room turns, and it must not trip dusk or a locked door on its
      // way to the answer.
      ledger: { budget: 120, entries: [] },
      currencies: { gems: 4, keys: 5, bookmarks: 0 },
      manor: {
        daySeed: 4242,
        playerCell: { ...here },
        rooms: {
          '2,0': { cardId: 'entrance-hall', cell: { col: 2, row: 0 }, doors: ['N', 'E', 'W'], solved: true, kind: 'parlor' },
          '2,6': { cardId: 'sanctum', cell: { col: 2, row: 6 }, doors: ['S'], solved: false, kind: 'mystery' },
          // A cross room under her feet, so every one of the four doors is a
          // live draft target and the four runs differ ONLY in heading.
          '2,3': { cardId: 'long-gallery', cell: here, doors: ['N', 'E', 'S', 'W'], solved: true, kind: 'twistle' },
        },
      },
      draftOffer: {
        atDoor: dir,
        from: { ...here },
        rerolled: false,
        cards: [
          card('still-room', 'The Still Room', [['N', 'E']], [1, 2]),   // corner
          card('larder', 'The Larder', [['N']], [1, 2]),                // dead end
          card('boot-room', 'The Boot Room', [['N', 'S']], [1, 1]),     // corridor
        ],
      },
    });
  }, atDoor);

  /** What the three door diagrams on the open modal actually DRAW. */
  const diagrams = () => page.evaluate(() => {
    const TICKS = { 'M12 1v5': 'N', 'M23 12h-5': 'E', 'M12 23v-5': 'S', 'M1 12h5': 'W' };
    return [...document.querySelectorAll('.bp-modal .bp-card')].map((cardEl) => {
      const svg = cardEl.querySelector('.bp-doorsdiag');
      const doors = [];
      let entry = null;
      for (const p of svg.querySelectorAll('path')) {
        const dir = TICKS[p.getAttribute('d')];
        if (!dir) continue;
        doors.push(dir);
        if (p.classList.contains('bp-doorsdiag__door--entry')) entry = dir;
      }
      return {
        name: cardEl.querySelector('.bp-card__name').textContent.trim(),
        doors, entry,
        label: svg.getAttribute('aria-label'),
      };
    });
  });

  const CARD_ORDER = ['still-room', 'larder', 'boot-room'];

  for (const dir of ['N', 'E', 'S', 'W']) {
    log(`heading ${HEADING_WORDS[dir]} — drafting into ${TARGET[dir]}`);
    await seed(dir);
    await page.waitForSelector('.bp-modal .bp-card', { timeout: 10000 });
    await page.waitForTimeout(160);

    // (2) THE CARD TELLS THE TRUTH — read the ink before anything is placed.
    const drawn = await diagrams();
    check(drawn.length === 3, 'the offer draws three cards', `offer drew ${drawn.length} cards`);
    CARD_ORDER.forEach((id, i) => {
      const want = EXPECTED[dir][id];
      const got = drawn[i];
      check(
        JSON.stringify(got.doors) === JSON.stringify(want),
        `${dir}: ${got.name} diagram draws ${got.doors.join('')} (expected ${want.join('')})`,
        `${dir}: ${got.name} diagram draws ${got.doors.join('')}, expected ${want.join('')}`,
      );
    });
    const entryWall = { N: 'S', E: 'W', S: 'N', W: 'E' }[dir];
    check(
      drawn.every((d) => d.entry === entryWall),
      `${dir}: every diagram marks ${entryWall} as the door at her feet`,
      `${dir}: entry ticks were ${drawn.map((d) => d.entry).join('/')}, expected all ${entryWall}`,
    );
    check(
      drawn.every((d) => (d.label || '').includes(`enter from the ${HEADING_WORDS[entryWall]}`)),
      `${dir}: the diagrams say so out loud too`,
      `${dir}: aria-labels were ${drawn.map((d) => d.label).join(' | ')}`,
    );

    const cardShot = await page.screenshot({ path: resolve(SHOTS, `${dir.toLowerCase()}-1-card.png`) });

    // (1) ORIENTATION IS THE HEADING — take the corner and read the house back.
    await page.getByRole('button', { name: /The Still Room/ }).click();
    await page.waitForSelector('.bp-modal', { state: 'detached', timeout: 10000 });
    // Long enough for the token's ≤240ms glide AND for the Still Room's payout
    // toast to clear the sheet — the point of this plate is the DOORS.
    await page.waitForTimeout(5200);

    const placed = await page.evaluate((key) => {
      const s = window.__manorStore.getState();
      const r = s.manor.rooms[key];
      return r ? { doors: r.doors, cardId: r.cardId, at: s.manor.playerCell } : null;
    }, TARGET[dir]);
    check(
      placed && JSON.stringify(placed.doors) === JSON.stringify(EXPECTED[dir]['still-room']),
      `${dir}: the Still Room is LAID as ${placed?.doors?.join('')} — exactly what the card drew`,
      `${dir}: laid as ${placed?.doors?.join('') ?? 'nothing'}, expected ${EXPECTED[dir]['still-room'].join('')}`,
    );
    check(
      placed && JSON.stringify(placed.doors) === JSON.stringify(drawn[0].doors),
      `${dir}: ink === placement`,
      `${dir}: the card drew ${drawn[0].doors.join('')} and the house laid ${placed?.doors?.join('')}`,
    );

    const sheetShot = await page.screenshot({ path: resolve(SHOTS, `${dir.toLowerCase()}-2-placed.png`) });
    plates.push({
      dir,
      card: cardShot.toString('base64'),
      sheet: sheetShot.toString('base64'),
      drew: drawn[0].doors.join(''),
      laid: placed?.doors?.join('') ?? '—',
    });
  }

  // THE CONTACT SHEET: the card beside the placement it produced, four
  // headings down the page, so the claim "the card told the truth" is one
  // glance rather than four file-opens.
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#efe6d2;font:14px/1.4 Georgia,serif;color:#2b2118;padding:24px}
    h1{font-size:20px;margin:0 0 4px}
    p.sub{margin:0 0 20px;color:#55452f}
    .row{display:flex;gap:14px;align-items:flex-start;margin-bottom:22px}
    .cap{width:150px;flex:none}
    .cap b{display:block;font-size:16px}
    .cap code{background:#e2d6bd;padding:1px 5px;border-radius:3px}
    img{width:250px;border:1px solid #b7a98a;border-radius:3px;display:block}
  </style>
  <h1>Round 9 — room orientation follows the heading</h1>
  <p class="sub">The same corner card (The Still Room, layout <code>['N','E']</code>) drafted from
  four different doors of the same room. Left: the draft card's door diagram, drawn post-rotation.
  Right: the house immediately after placing it.</p>
  ${plates.map((p) => `<div class="row">
    <div class="cap"><b>walking ${HEADING_WORDS[p.dir]}</b>
      card drew <code>${p.drew}</code><br>house laid <code>${p.laid}</code></div>
    <img src="data:image/png;base64,${p.card}">
    <img src="data:image/png;base64,${p.sheet}">
  </div>`).join('')}`;
  const sheetPage = await context.newPage();
  await sheetPage.setViewportSize({ width: 900, height: 1200 });
  await sheetPage.setContent(html);
  await sheetPage.waitForTimeout(300);
  await sheetPage.screenshot({
    path: resolve(SHOTS, 'contact-sheet.png'), fullPage: true,
  });
  await sheetPage.close();

  check(errors.length === 0, 'no page errors', `page errors: ${errors.join(' | ')}`);

  writeFileSync(
    resolve(SHOTS, 'results.json'),
    JSON.stringify({ expected: EXPECTED, plates: plates.map(({ dir, drew, laid }) => ({ dir, drew, laid })) }, null, 2),
  );
} finally {
  if (browser) await browser.close();
  server.kill();
}

log(failures === 0 ? 'PASS — every heading laid its room exactly as the card drew it'
  : `FAIL — ${failures} check(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
