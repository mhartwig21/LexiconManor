/**
 * tests/round12-meeting-live.mjs — THE FIRST MEETING, DRIVEN.
 *
 * The owner's ask is about DELIVERY: *"there needs to be a moment in how the
 * panel is delivered so its clear you've met someone new."* That is a
 * screenshot-shaped claim, so this run plays real meetings through the shipped
 * UI and photographs them beside a routine visit of the SAME character on the
 * SAME trigger — if the two frames are hard to tell apart, the round failed.
 *
 * What it drives, all through the live app:
 *   1. Day 1's morning: Mrs. Bramble, met for the first time (the deterministic
 *      trigger). Card, then the panel it hands off to.
 *   2. A parlor first meeting: draft until the deck offers a parlor, walk in,
 *      call on whoever keeps it. This is the RANDOM trigger, unchanged.
 *   3. Dewey, if his cell turns up — a cat who does not speak gets the same
 *      ceremony written in the narration register.
 *   4. Day 2's morning: Mrs. Bramble again, routine. The control frame.
 *   5. Day 4's morning card: the whereabouts aside, in situ.
 *   6. The card at 375x667 and in the candlelit theme, and with motion off.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a playwright browser (it fails silently
 * here). Exactly ONE browser instance, closed in a finally. 390x844 @2x.
 * Runs against the BUILT app under `vite preview`.
 *
 * Run: `npm run build && node tests/round12-meeting-live.mjs`
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(ROOT, 'docs/shots/round12/meeting');
mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log('[r12-meet]', ...a);
const ok = (m) => console.log('[r12-meet]   OK', m);
let failures = 0;
const fail = (m) => { console.error('[r12-meet]   FAIL:', m); failures++; };
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };

async function freePort(from = 5561, to = 5620) {
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
try {
  await serverUp;
  log('preview up on', BASE);

  browser = await chromium.launch({ channel: 'msedge', headless: true });

  /** A fresh save on a fresh page, at the given size/theme. */
  const openApp = async (opts = {}) => {
    const context = await browser.newContext({
      viewport: opts.viewport ?? { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: opts.colorScheme ?? 'light',
      reducedMotion: opts.reducedMotion ?? 'no-preference',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
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
    await page.waitForSelector('.bp-page, .bp-scene__title, .chr-scene', { timeout: 30000 });
    return { context, page, errors };
  };

  const shot = (page, name) => page.screenshot({ path: resolve(SHOTS, name) });

  // =========================================================================
  // 1. DAY 1 — MRS. BRAMBLE, MET
  // =========================================================================
  const { context, page, errors } = await openApp();

  const beginTheDay = async () => {
    await page.waitForSelector('.chr-scene__btn', { timeout: 25000 });
    await page.click('.chr-scene__btn');
  };

  // The front step: "Begin the first day" is the cover, not the morning card.
  await page.waitForSelector('.bp-scene__title', { timeout: 25000 });
  await page.click('.bp-btn--seal');
  await beginTheDay();
  await page.waitForSelector('.mtg', { timeout: 10000 });
  ok('day 1: the introduction card is delivered before Mrs. Bramble speaks');

  // Mid-assembly (the portrait arriving into its frame), then settled.
  await wait(420);
  await shot(page, '01-bramble-card-assembling.png');
  await wait(1350);
  await shot(page, '02-bramble-card-settled.png');

  const cardText = await page.textContent('.mtg');
  check(
    /Someone new in the manor/.test(cardText) && /Mrs\. Bramble/.test(cardText)
      && /Housekeeper/.test(cardText),
    'the card names the person, their standing and the occasion',
    `card copy was: ${JSON.stringify(cardText)}`,
  );
  const typedBehind = await page.$('.dlg__text');
  check(!typedBehind, 'nothing is typing behind the ceremony — it lands BEFORE the first line',
    'the conversation panel was already up under the card');

  /* THE COLLISION THIS ROUND MEASURED. Day 1 opens with a letter from Posy in
     the tray, so the campaign seal is announced in the same tick as the
     introduction — and the first shot of the round had two deckle-edged wax
     cards stacked up the glass. The seal steps aside (ui/moment/ceremony.ts)
     and, because its dwell clock stops with it, presses in AFTERWARDS rather
     than expiring behind the card. Both halves are checked. */
  const sealDuring = await page.$('.mom');
  check(!sealDuring, 'the campaign seal steps aside while the ceremony has the glass',
    'a wax notice was stacked on top of the introduction card');

  // Hands off on its own clock; the panel arrives with the first line.
  await page.waitForSelector('.dlg__box', { timeout: 10000 });
  await page.waitForSelector('.mom', { timeout: 10000 });
  ok('…and the grant it was holding presses in once the card hands off — nothing was lost');
  await wait(600);
  await shot(page, '03-bramble-first-meeting-panel.png');
  ok('the card hands off to the ordinary panel');

  /** Play a conversation out to the end and close it. */
  const finishScene = async () => {
    if (await page.$('.dlg__skip')) await page.click('.dlg__skip');
    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      const choice = await page.$('.dlg-choice:not(.dlg-choice--gift)');
      // eslint-disable-next-line no-await-in-loop
      if (choice) { await choice.click(); await wait(250); }
      // eslint-disable-next-line no-await-in-loop
      if (await page.$('.dlg__skip')) { await page.click('.dlg__skip'); await wait(250); }
      // eslint-disable-next-line no-await-in-loop
      if (!(await page.$('.dlg'))) return;
    }
  };
  await finishScene();
  await page.waitForFunction(
    () => window.__manorStore.getState().day?.phase === 'exploring',
    null, { timeout: 20000 },
  );
  await page.waitForSelector('.bp-sheet', { timeout: 20000 });
  ok('day 1: out of the morning and onto the blueprint');

  // =========================================================================
  // 2. A PARLOR FIRST MEETING — the RANDOM trigger, unchanged
  // =========================================================================

  /** Harness top-up only: this run is photographing a meeting, not measuring
   *  an economy, and the draft loop below must not run the evening out. */
  const topUp = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    window.__manorStore.setState({ currencies: { ...s.currencies, gems: 99, keys: 9 } });
    if (s.stepsRemaining() < 30) {
      s.applyStepEntry({ reason: 'tea', delta: 40, at: Date.now() });
    }
  });

  const PARLORS = ['greenhouse', 'reading-nook', 'post-room', 'drawing-room'];

  /** Every door in the whole house that still opens onto an empty cell — not
   *  just the ones at her feet, so a dead-end room cannot stall the search. */
  const openDoors = () => page.evaluate(() => {
    const D = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
    const m = window.__manorStore.getState().manor;
    if (!m) return [];
    const out = [];
    for (const room of Object.values(m.rooms)) {
      for (const dir of room.doors) {
        const col = room.cell.col + D[dir][0];
        const row = room.cell.row + D[dir][1];
        if (col < 0 || col > 4 || row < 0 || row > 6) continue;
        if (m.rooms[`${col},${row}`]) continue;
        out.push({ from: room.cell, dir, col, row });
      }
    }
    return out;
  });

  let parlorHost = null;
  for (let attempt = 0; attempt < 24 && !parlorHost; attempt++) {
    await topUp();
    const doors = await openDoors();
    if (doors.length === 0) { log('no open doors at attempt', attempt); break; }
    const door = doors[attempt % doors.length];
    // eslint-disable-next-line no-await-in-loop
    const placed = await page.evaluate(async ({ from, dir, col, row, wanted }) => {
      const S = () => window.__manorStore.getState();
      S().moveTo({ col: from.col, row: from.row });
      await new Promise((r) => setTimeout(r, 40));
      S().openDraft(dir);
      const pick = () => (S().draftOffer?.cards ?? []).find((c) => wanted.includes(c.id));
      let card = pick();
      if (!card) { S().rerollDraft(); card = pick(); }
      // No parlor on either sheet: take the first plan anyway. The board has to
      // GROW or the same doors keep dealing from the same stream — and a bigger
      // house is what a player exploring for company would build too.
      if (!card) card = S().draftOffer?.cards?.[0];
      if (!card) { S().cancelDraft(); return null; }
      S().chooseDraftCard(card.id);
      await new Promise((r) => setTimeout(r, 60));
      S().moveTo({ col, row });
      return card.id;
    }, { ...door, wanted: PARLORS });
    if (!placed) {
      // eslint-disable-next-line no-await-in-loop
      const phase = await page.evaluate(() => window.__manorStore.getState().day?.phase);
      log(`attempt ${attempt}: no plan placed at ${door.col},${door.row} (phase ${phase})`);
      continue;
    }
    log(`drafted ${placed} at ${door.col},${door.row}`);
    // eslint-disable-next-line no-await-in-loop
    await wait(60);
    // eslint-disable-next-line no-await-in-loop
    const callBtn = await page.$('.bp-btn:has-text("Call on")');
    if (callBtn) parlorHost = placed;
  }

  if (parlorHost) {
    const label = await page.textContent('.bp-btn:has-text("Call on")');
    log(`parlor drafted: ${parlorHost} → "${label.trim()}"`);
    await page.click('.bp-btn:has-text("Call on")');
    await page.waitForSelector('.mtg', { timeout: 10000 });
    await wait(1750);
    await shot(page, `04-parlor-card-${parlorHost}.png`);
    const parlorCard = await page.textContent('.mtg');
    check(/Someone new in the manor/.test(parlorCard),
      `the ${parlorHost} meeting is delivered with the same ceremony as the morning one`,
      `parlor card copy was: ${JSON.stringify(parlorCard)}`);
    await page.waitForSelector('.dlg__box', { timeout: 10000 });
    await wait(600);
    await shot(page, `05-parlor-first-meeting-panel-${parlorHost}.png`);

    // …and calling again is an ORDINARY visit, with no card at all.
    await finishScene();
    await wait(300);
    if (await page.$('.bp-btn:has-text("Call on")')) {
      await page.click('.bp-btn:has-text("Call on")');
      await page.waitForSelector('.dlg', { timeout: 10000 });
      await wait(700);
      const second = await page.$('.mtg');
      check(!second, 'a second call on the same host gets no card — the ceremony is once, forever',
        'the introduction card fired twice for the same character');
      await shot(page, `06-parlor-routine-visit-${parlorHost}.png`);
      await finishScene();
    }
  } else {
    fail('the draft loop never turned up a parlor room — no parlor meeting photographed');
  }

  // =========================================================================
  // 3. DEWEY — the cat who does not speak
  // =========================================================================
  /**
   * He naps in one seeded cell a day and becomes visible when it is drafted
   * (`.bp-dewey` on the sheet), so finding him means building toward him and
   * standing in the room — the same random discovery the player makes. The
   * sheet draws no cell coordinate, so the harness walks the rooms it has and
   * looks for the shipped pet control rather than computing his den.
   */
  const walkTheRooms = () => page.evaluate(async () => {
    const S = () => window.__manorStore.getState();
    const m = S().manor;
    if (!m) return false;
    for (const room of Object.values(m.rooms)) {
      S().moveTo({ col: room.cell.col, row: room.cell.row });
      await new Promise((r) => setTimeout(r, 40));
      const here = S().manor.playerCell;
      if (here.col === room.cell.col && here.row === room.cell.row
        && document.querySelector('.bp-foot__actions')?.textContent?.includes('Pet Dewey')) {
        return true;
      }
    }
    return false;
  });

  /** Build outward, then walk what has been built, looking for his den. */
  const huntDewey = async (budget) => {
    for (let attempt = 0; attempt < budget; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      await topUp();
      // eslint-disable-next-line no-await-in-loop
      if (await walkTheRooms()) return true;
      // eslint-disable-next-line no-await-in-loop
      const doors = await openDoors();
      if (doors.length === 0) return false;
      const door = doors[attempt % doors.length];
      // eslint-disable-next-line no-await-in-loop
      await page.evaluate(async ({ dir, col, row }) => {
        const S = () => window.__manorStore.getState();
        S().openDraft(dir);
        const card = S().draftOffer?.cards?.[0];
        if (!card) { S().cancelDraft(); return; }
        S().chooseDraftCard(card.id);
        await new Promise((r) => setTimeout(r, 60));
        S().moveTo({ col, row });
      }, door);
      // eslint-disable-next-line no-await-in-loop
      await wait(80);
    }
    return false;
  };

  /** Photograph his ceremony. He naps in a different cell every day, so this
   *  is attempted on more than one evening before it is given up on. */
  let deweyMet = false;
  const photographDewey = async () => {
    if (deweyMet) return;
    if (!(await huntDewey(9))) return;
    await page.click('.bp-btn:has-text("Pet Dewey")');
    await page.waitForSelector('.mtg', { timeout: 8000 });
    await wait(1750);
    await shot(page, '07-dewey-card.png');
    const dewCard = await page.textContent('.mtg');
    check(/does not give his name/.test(dewCard),
      'Dewey gets the ceremony written ABOUT him, in the narration register',
      `Dewey card copy was: ${JSON.stringify(dewCard)}`);
    await page.waitForSelector('.dlg__box', { timeout: 8000 });
    await wait(500);
    await shot(page, '08-dewey-first-meeting-panel.png');
    await finishScene();
    deweyMet = true;
  };

  await photographDewey();

  // =========================================================================
  // 4. THE CONTROL FRAME — the same character, the same trigger, routine
  // =========================================================================
  /** Roll to the next morning through the real day machine. */
  const nextMorning = async () => {
    for (let i = 0; i < 30; i++) {
      // eslint-disable-next-line no-await-in-loop
      const phase = await page.evaluate(() => {
        const S = () => window.__manorStore.getState();
        const d = S().day;
        if (!d) { S().startDay(); return 'started'; }
        if (d.activeRoom) S().leaveRoom?.();
        if (d.phase === 'exploring') S().endDay('retired-early');
        else if (d.phase === 'dusk') S().advanceDayPhase();
        else if (d.phase === 'night') S().startDay();
        return S().day?.phase ?? 'none';
      });
      if (phase === 'morning') break;
      // eslint-disable-next-line no-await-in-loop
      await wait(200);
    }
    await page.waitForFunction(
      () => window.__manorStore.getState().day?.phase === 'morning',
      null, { timeout: 20000 },
    );
    await page.waitForSelector('.chr-scene__btn', { timeout: 20000 });
  };

  await nextMorning();
  const day2 = await page.evaluate(() => window.__manorStore.getState().day.day);
  await beginTheDay();
  await page.waitForSelector('.dlg', { timeout: 15000 });
  await wait(700);
  const routineCard = await page.$('.mtg');
  check(!routineCard,
    `day ${day2}: the same character on the same trigger arrives with NO ceremony — the control`,
    'the introduction card fired on a routine morning');
  await shot(page, '09-bramble-routine-visit-panel.png');
  await finishScene();
  // He sleeps somewhere new every day, so the second evening gets its own try.
  await page.waitForFunction(
    () => window.__manorStore.getState().day?.phase === 'exploring',
    null, { timeout: 20000 },
  );
  await photographDewey();

  // =========================================================================
  // 5. THE WHEREABOUTS CLUE, IN SITU
  // =========================================================================
  let sawAside = false;
  for (let i = 0; i < 6 && !sawAside; i++) {
    // eslint-disable-next-line no-await-in-loop
    await nextMorning();
    // eslint-disable-next-line no-await-in-loop
    const day = await page.evaluate(() => window.__manorStore.getState().day.day);
    // eslint-disable-next-line no-await-in-loop
    const aside = await page.$('.dlg-passing');
    if (aside) {
      sawAside = true;
      // eslint-disable-next-line no-await-in-loop
      const said = (await page.textContent('.dlg-passing')).replace(/\s+/g, ' ').trim();
      log(`day ${day} morning card carries: ${said}`);
      // eslint-disable-next-line no-await-in-loop
      await shot(page, `10-whereabouts-morning-card-day${day}.png`);
      // eslint-disable-next-line no-await-in-loop
      await aside.screenshot({ path: resolve(SHOTS, `11-whereabouts-aside-day${day}.png`) });
      check(/Mrs\. Bramble, on her way past/.test(said),
        'the clue is attributed, in her voice, and is not a system notice',
        `aside was: ${said}`);
      check(!/Greenhouse|Post Room|Reading Nook/i.test(said),
        'it teaches the room without naming it — no directory',
        `aside named a room outright: ${said}`);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await beginTheDay();
      // eslint-disable-next-line no-await-in-loop
      await page.waitForSelector('.dlg', { timeout: 15000 });
      // eslint-disable-next-line no-await-in-loop
      await finishScene();
    }
  }
  check(sawAside, 'a whereabouts clue turned up on a morning card inside the first week',
    'no whereabouts aside appeared in six mornings');

  check(errors.length === 0, 'no page errors on the main run', `page errors: ${errors.join(' | ')}`);
  await context.close();

  // =========================================================================
  // 6. THE CARD IN THE OTHER THEME, THE OTHER SIZE, AND WITH MOTION OFF
  // =========================================================================
  const variants = [
    { name: '12-bramble-card-dark-390x844.png', colorScheme: 'dark',
      viewport: { width: 390, height: 844 } },
    { name: '13-bramble-card-light-375x667.png', colorScheme: 'light',
      viewport: { width: 375, height: 667 } },
    { name: '14-bramble-card-dark-375x667.png', colorScheme: 'dark',
      viewport: { width: 375, height: 667 } },
    { name: '15-bramble-card-reduced-motion.png', colorScheme: 'light',
      viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' },
  ];
  for (const v of variants) {
    // eslint-disable-next-line no-await-in-loop
    const app = await openApp(v);
    // eslint-disable-next-line no-await-in-loop
    await app.page.waitForSelector('.bp-scene__title', { timeout: 25000 });
    // eslint-disable-next-line no-await-in-loop
    await app.page.click('.bp-btn--seal');
    // eslint-disable-next-line no-await-in-loop
    await app.page.waitForSelector('.chr-scene__btn', { timeout: 25000 });
    // eslint-disable-next-line no-await-in-loop
    await app.page.click('.chr-scene__btn');
    // eslint-disable-next-line no-await-in-loop
    await app.page.waitForSelector('.mtg', { timeout: 10000 });
    // eslint-disable-next-line no-await-in-loop
    await wait(v.reducedMotion === 'reduce' ? 350 : 1750);

    // No page scroll, in either size (house rule / AAA 7.7), and the card fits.
    // eslint-disable-next-line no-await-in-loop
    const fit = await app.page.evaluate(() => {
      const card = document.querySelector('.mtg__card');
      const r = card.getBoundingClientRect();
      const seal = getComputedStyle(document.querySelector('.mtg__wax'));
      const name = document.querySelector('.mtg__name');
      return {
        overflow: document.documentElement.scrollHeight > window.innerHeight,
        top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight,
        sealAnim: getComputedStyle(document.querySelector('.mtg__wax')).animationName,
        nameAnim: getComputedStyle(name, '::after').animationName,
        sealBg: seal.backgroundColor,
        nameVisible: name.getBoundingClientRect().width > 0,
      };
    });
    check(!fit.overflow && fit.top >= 0 && fit.bottom <= fit.h,
      `${v.name}: the card fits the glass with no page scroll (${fit.top}–${fit.bottom} of ${fit.h})`,
      `${v.name}: card ran off the glass (${fit.top}–${fit.bottom} of ${fit.h}, overflow ${fit.overflow})`);
    if (v.reducedMotion === 'reduce') {
      check(fit.sealAnim === 'none' && fit.nameAnim === 'none' && fit.nameVisible,
        'reduced motion: the stamp and the writing stroke are off, and the card is whole',
        `reduced motion left animations on (seal ${fit.sealAnim}, nib ${fit.nameAnim})`);
    }
    // eslint-disable-next-line no-await-in-loop
    await shot(app.page, v.name);
    // eslint-disable-next-line no-await-in-loop
    await app.context.close();
  }

  log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  log('shots →', SHOTS);
} finally {
  await browser?.close();
  server.kill();
}

process.exit(failures === 0 ? 0 : 1);
