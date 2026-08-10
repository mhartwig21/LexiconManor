/**
 * tests/round20-drafting-live.mjs — REVIEW_AA §5.7 VERIFIER: THE MANOR SHE ENDS UP WITH.
 *
 * THE REVIEW'S EVIDENCE, which is a SCREENSHOT-SHAPED claim and therefore has to
 * be answered with a screenshot of a manor somebody actually played into
 * existence: *"A's day-3 board was a one-cell-wide chimney five rooms tall with
 * 28 of 33 cells untouched; A's day 1 was a T with three dead ends out of five
 * rooms; B's was a vertical column… after four drafts both reviewers had a
 * vertical column."*
 *
 * So this run plays SIX REAL EVENINGS through the shipped UI — it taps ghost
 * cells on the blueprint, reads the three cards on the offer sheet, chooses one,
 * and leaves every puzzle for tomorrow — on the real day budget, with no step
 * top-ups and no seeded houses. What it proves, per evening and at the end:
 *
 *   1. THE OFFER IS A DECISION. Every offer is logged with how many of its three
 *      plans keep the path alive. The review's complaint is "one live option and
 *      two duds"; the run reports the distribution it actually met.
 *   2. THE HOUSE HAS A SHAPE. The final floorplan's column spread is measured.
 *      A one-column chimney fails the run outright — that is the criterion the
 *      task set, and it is checked here rather than left to the eye.
 *   3. THE THREE DOORS DIFFER. Out of the Entrance Hall the labels are read off
 *      the live DOM and asserted distinct (REVIEW_AA §4).
 *   4. SOMETHING SURVIVES THE NIGHT. The wing plate is read off the blueprint
 *      after the manor has been wiped and rebuilt, and the run fails if six
 *      evenings of deliberate building leave the papers remembering nothing.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a playwright browser (it fails silently
 * here). Exactly ONE browser instance, closed in a finally. 390x844 @2x.
 * Runs against the BUILT app under `vite preview`.
 *
 * Run: `npm run build && node tests/round20-drafting-live.mjs`
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(ROOT, 'docs/shots/round11/drafting');
mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log('[r20-draft]', ...a);
const ok = (m) => console.log('[r20-draft]   OK', m);
let failures = 0;
const fail = (m) => { console.error('[r20-draft]   FAIL:', m); failures++; };
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };

const DAYS = 6;

async function freePort(from = 5461, to = 5520) {
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

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    for (const r of regs) await r.unregister();
    localStorage.clear();
  });
  await page.goto(`${BASE}?fresh=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-page, .bp-scene__title', { timeout: 30000 });

  const S = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    return {
      day: s.day?.day ?? null,
      phase: s.day?.phase ?? null,
      steps: s.stepsRemaining ? s.stepsRemaining() : null,
      gems: s.currencies.gems,
      rooms: s.manor ? Object.values(s.manor.rooms).map((r) => ({
        id: r.cardId, col: r.cell.col, row: r.cell.row, kind: r.kind, doors: r.doors,
      })) : [],
      wings: s.chronicles.dayRecords.map((d) => d.wings ?? {}),
    };
  });

  /** Get to `exploring`, through the day machine the chrome drives. */
  const reachExploring = async () => {
    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      if (!s.day) s.startDay();
      const d = window.__manorStore.getState().day;
      if (d?.phase === 'morning') window.__manorStore.getState().advanceDayPhase();
    });
    await page.waitForFunction(
      () => window.__manorStore.getState().day?.phase === 'exploring',
      null, { timeout: 15000 },
    );
    await page.waitForSelector('.bp-sheet', { timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.__manorStore.getState().manor),
      null, { timeout: 15000 });
  };

  /**
   * THE PLAYER THIS RUN MODELS. She is deliberate, which is the whole point of
   * the item: she keeps the reading rooms in the WEST WING so his papers will
   * remember it, she reads the door diagram and prefers a plan that keeps the
   * path alive, and she climbs when the west has nothing left to say. She never
   * plays a puzzle — every anchor is left for tomorrow — so the manor below is
   * what an ordinary 18-step evening really builds, not what a fat budget does.
   */
  const DELTA = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };

  /**
   * The ghost cells at her feet, each with the cell it opens into. The DOM order
   * is `draftTargets`' order (the room's own door list, compass order), so the
   * mapping is recomputed here from the live store rather than assumed.
   */
  const ghosts = () => page.evaluate((delta) => {
    const s = window.__manorStore.getState();
    const manor = s.manor;
    if (!manor) return [];
    const here = manor.rooms[`${manor.playerCell.col},${manor.playerCell.row}`];
    if (!here) return [];
    const targets = [];
    for (const dir of ['N', 'E', 'S', 'W']) {
      if (!here.doors.includes(dir)) continue;
      const col = manor.playerCell.col + delta[dir][0];
      const row = manor.playerCell.row + delta[dir][1];
      if (col < 0 || col > 4 || row < 0 || row > 6) continue;
      if (manor.rooms[`${col},${row}`]) continue;
      targets.push({ dir, col, row });
    }
    return [...document.querySelectorAll('.bp-ghost')].map((g, i) => ({
      i,
      label: g.getAttribute('aria-label') || '',
      shut: g.classList.contains('bp-ghost--shut'),
      ...(targets[i] ?? {}),
    }));
  }, DELTA);

  /** Cells she can walk into right now, so a sealed room is not the end of a day. */
  const walkables = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    const manor = s.manor;
    if (!manor) return [];
    const D = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
    const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
    const here = manor.rooms[`${manor.playerCell.col},${manor.playerCell.row}`];
    if (!here) return [];
    const out = [];
    let i = 0;
    for (const dir of ['N', 'E', 'S', 'W']) {
      if (!here.doors.includes(dir)) continue;
      const col = manor.playerCell.col + D[dir][0];
      const row = manor.playerCell.row + D[dir][1];
      const there = manor.rooms[`${col},${row}`];
      if (!there || !there.doors.includes(OPP[dir])) continue;
      if (col === 2 && row === 6) continue;   // the sealed Sanctum is not a walk
      // Does that room still have a frontier door of its own?
      let frontier = false;
      for (const d2 of there.doors) {
        const c2 = col + D[d2][0];
        const r2 = row + D[d2][1];
        if (c2 < 0 || c2 > 4 || r2 < 0 || r2 > 6) continue;
        if (!manor.rooms[`${c2},${r2}`]) frontier = true;
      }
      out.push({ i: i++, col, row, frontier });
    }
    return out;
  });

  const offerCards = () => page.evaluate(() => {
    const TICKS = { 'M12 1v5': 'N', 'M23 12h-5': 'E', 'M12 23v-5': 'S', 'M1 12h5': 'W' };
    return [...document.querySelectorAll('.bp-modal .bp-card')].map((el) => {
      const svg = el.querySelector('.bp-doorsdiag');
      const doors = [];
      let entry = null;
      for (const p of svg.querySelectorAll('path')) {
        const dir = TICKS[p.getAttribute('d')];
        if (!dir) continue;
        doors.push(dir);
        if (p.classList.contains('bp-doorsdiag__door--entry')) entry = dir;
      }
      return {
        name: el.querySelector('.bp-card__name').textContent.trim(),
        category: [...el.classList].find((c) => c.startsWith('bp-card--')) || '',
        seals: Boolean(el.querySelector('.bp-card__seals')),
        disabled: el.disabled,
        doors, entry,
      };
    });
  });

  const liveHist = [0, 0, 0, 0];
  let offersSeen = 0;
  let sealsTaken = 0;
  let headings = null;

  let lastGood = null;
  for (let day = 1; day <= DAYS; day++) {
    await reachExploring();
    lastGood = null;
    let stepBacks = 0;
    if (day === 1) {
      // (3) THE THREE DOORS DIFFER — read them where the review read them.
      headings = (await ghosts()).map((g) => g.label);
    }

    for (let draft = 0; draft < 12; draft++) {
      const state = await S();
      if (state.phase !== 'exploring' || state.steps <= 0) break;
      let open = (await ghosts()).filter((g) => !g.shut && g.col !== undefined);
      if (open.length === 0) {
        // Sealed in. A real player walks back down the house to a door she can
        // still open — and pays for the walk. If there is nowhere to go, the
        // evening is genuinely over.
        const back = (await walkables()).filter((w) => w.frontier);
        const step = back[0] ?? (await walkables())[0];
        if (!step) break;
        await page.locator('.bp-walk').nth(step.i).click();
        await page.waitForTimeout(120);
        open = (await ghosts()).filter((g) => !g.shut && g.col !== undefined);
        if (open.length === 0) continue;
      }
      // She keeps the reading rooms in the West Wing for the first three
      // evenings — that is the argument she is making — and after that she
      // spends the house on the climb.
      const wings = open.filter((g) => g.col !== 2);
      const up = [...open].sort((a, b) => b.row - a.row);
      const pick = (day <= 4 && wings.length > 0 && state.rooms.length < 9)
        ? wings[draft % wings.length] : up[0];
      await page.locator('.bp-ghost').nth(pick.i).click();
      const opened = await page.waitForSelector('.bp-modal .bp-card', { timeout: 6000 })
        .then(() => true).catch(() => false);
      if (!opened) break;

      const cards = await offerCards();
      const live = cards.filter((c) => !c.seals && !c.disabled);
      offersSeen += 1;
      liveHist[Math.min(3, live.length)] += 1;

      // She reads the diagram: a plan that keeps the path alive, and among those
      // the category she means that half of the house to BE. This is the whole
      // decision the item exists to create — the west is where she reads, the
      // east is where the household sits, and the papers will keep both.
      const want = pick.col >= 3 ? 'parlor' : 'puzzle';
      const usable = cards.filter((c) => !c.disabled);
      const alive = usable.filter((c) => !c.seals);
      const wanted = alive.filter((c) => c.category.includes(`--${want}`));
      // …and if this door has nothing that belongs in that half of the house,
      // she STEPS BACK for the one step she already spent (AAA 4.6) and tries a
      // different door. That is the decision the wings create, taken live.
      if (wanted.length === 0 && stepBacks < 3 && open.length > 1) {
        stepBacks += 1;
        await page.getByRole('button', { name: /Step back/ }).first().click();
        await page.waitForSelector('.bp-modal', { state: 'detached', timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(80);
        continue;
      }
      const chosen = (wanted[0] ?? alive[0] ?? usable[0] ?? cards[0]);
      if (chosen.seals) sealsTaken += 1;
      await page.getByRole('button', { name: new RegExp(chosen.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
        .first().click();
      await page.waitForSelector('.bp-modal', { state: 'detached', timeout: 8000 }).catch(() => {});
      // Anchors open on entry — leave every one of them for tomorrow (AAA 4.13).
      const leave = page.getByRole('button', { name: /Step away|Step back out/ });
      if (await leave.first().isVisible().catch(() => false)) {
        await leave.first().click();
        await page.waitForSelector('.bp-sheet', { timeout: 8000 }).catch(() => {});
      }
      await page.waitForTimeout(80);
      // Dusk WIPES the manor the moment the last step is spent (endDay sets
      // `manor: null`), so the evening's portrait has to be taken while the
      // house still exists. Overwritten on every draft from the point the
      // budget gets thin; the last one written is the finished floorplan.
      const now = await S();
      if (now.rooms.length > 0) {
        lastGood = now;
        if (now.steps <= 4) {
          await page.screenshot({ path: resolve(SHOTS, `day-${day}-manor.png`) });
        }
      }
    }

    const live = await S();
    const end = live.rooms.length > 0 ? live : (lastGood ?? live);
    const cols = new Set(end.rooms.filter((r) => r.id !== 'sanctum').map((r) => r.col));
    log(`day ${day}: ${end.rooms.length - 2} rooms drafted · ${cols.size} columns · ` +
      `${end.steps} steps left · ${end.gems} gems`);
    if (live.rooms.length > 0) {
      await page.screenshot({ path: resolve(SHOTS, `day-${day}-manor.png`) });
    }
    if (day === DAYS) break;

    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      if (s.day && s.day.phase !== 'night') s.endDay('retired-early');
      const d = window.__manorStore.getState().day;
      if (d?.phase === 'dusk') window.__manorStore.getState().advanceDayPhase();
      window.__manorStore.getState().startDay();
    });
    await page.waitForTimeout(200);
  }

  const finalState = (await S()).rooms.length > 0 ? await S() : (lastGood ?? await S());
  const cols = new Set(finalState.rooms.filter((r) => r.id !== 'sanctum').map((r) => r.col));
  const rows = new Set(finalState.rooms.filter((r) => r.id !== 'sanctum').map((r) => r.row));

  log('');
  log('— the offer she actually met —');
  for (let n = 0; n <= 3; n++) {
    log(`   ${n} live plan${n === 1 ? ' ' : 's'}: ${liveHist[n]} of ${offersSeen}`);
  }
  log(`   sealing plans taken: ${sealsTaken}`);

  /* (1) THE OFFER IS A DECISION. */
  const realChoice = (liveHist[2] + liveHist[3]) / Math.max(1, offersSeen);
  check(offersSeen >= 12, `${offersSeen} real offers opened across ${DAYS} evenings`,
    `only ${offersSeen} offers opened — the run did not play enough to say anything`);
  check(realChoice >= 0.6,
    `${(realChoice * 100).toFixed(0)}% of offers held two or more live plans`,
    `only ${(realChoice * 100).toFixed(0)}% of offers held a real choice`);

  /* (2) THE HOUSE HAS A SHAPE — the criterion the task set, in one line. */
  check(cols.size >= 3,
    `the manor she ends on spans ${cols.size} columns and ${rows.size} rows — not a chimney`,
    `the manor is ${cols.size} column(s) wide: still a vertical column`);

  /* (3) THE THREE DOORS DIFFER (REVIEW_AA §4). */
  check(headings && headings.length >= 3 && new Set(headings).size === headings.length,
    `the ${headings?.length} doors out of the Entrance Hall carry ${new Set(headings ?? []).size} distinct labels`,
    `the doors out of the hall read: ${JSON.stringify(headings)}`);
  check((headings ?? []).some((h) => h.includes('West Wing')) &&
    (headings ?? []).some((h) => h.includes('East Wing')),
    'and they name the wing each one opens into',
    'the labels do not name a wing');

  /* (4) SOMETHING SURVIVES THE NIGHT. */
  // Make sure the blueprint is the thing on screen: an evening can end with her
  // standing inside an anchor she never played, and the wing plate lives on the
  // sheet. (Without this the check is a coin flip on where the last draft left
  // her — which is exactly the kind of harness flake §0.1 warns about.)
  {
    for (let i = 0; i < 3; i++) {
      if (await page.locator('.bp-sheet').isVisible().catch(() => false)) break;
      const out = page.getByRole('button', { name: /Step away|Step back out|Back to the manor/ });
      if (await out.first().isVisible().catch(() => false)) await out.first().click();
      else await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);
    }
    await page.waitForSelector('.bp-sheet', { timeout: 10000 }).catch(() => {});
    await page.waitForSelector('.bp-wing__tag--kept', { timeout: 6000 }).catch(() => {});
  }
  const plate = await page.evaluate(() => ({
    sheet: Boolean(document.querySelector('.bp-sheet')),
    names: [...document.querySelectorAll('.bp-wing__name')].map((n) => n.textContent.trim()),
    tags: [...document.querySelectorAll('.bp-wing__tag')]
      .map((n) => `${n.textContent.trim()}${n.classList.contains('bp-wing__tag--kept') ? '*' : ''}`),
    records: window.__manorStore.getState().chronicles.dayRecords.length,
  }));
  log(`   the plate, as drawn: ${JSON.stringify(plate)}`);
  const remembered = await page.evaluate(() => {
    const g = document.querySelector('.bp-wing__tag--kept');
    return g ? g.textContent.trim() : null;
  });
  const argued = finalState.wings.filter((w) => Object.keys(w).length > 0).length;
  log(`   the evenings, as the papers filed them: ${JSON.stringify(finalState.wings)}`);
  check(argued >= 2,
    `${argued} of the ${finalState.wings.length} recorded evenings argued a wing into a character`,
    `only ${argued} evening(s) argued a wing into anything`);
  check(remembered !== null,
    `the blueprint prints a remembered wing after the manor was wiped: "${remembered}"`,
    'no wing plate is drawn in gilt — nothing survived the night');

  // Let the notice rail clear (NOTICE_MS 3400) and dismiss any campaign seal on
  // the moment layer, so the portrait of the manor is the manor and not two
  // payout cards over the wing plates.
  await page.waitForTimeout(3800);
  for (let i = 0; i < 4; i++) {
    const seal = page.locator('.mom, [class^="mom"]').first();
    if (!(await seal.isVisible().catch(() => false))) break;
    await seal.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(SHOTS, 'final-manor.png') });
  // …and the offer sheet itself, so the card face's new stamps are on record.
  const openGhost = (await ghosts()).filter((g) => !g.shut)[0];
  if (openGhost) {
    await page.locator('.bp-ghost').nth(openGhost.i).click();
    if (await page.waitForSelector('.bp-modal', { timeout: 6000 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(150);
      await page.screenshot({ path: resolve(SHOTS, 'offer-sheet.png') });
    }
  }

  check(errors.length === 0, 'no page errors during six evenings',
    `page errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

log('');
log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
