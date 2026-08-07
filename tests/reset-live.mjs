/**
 * tests/reset-live.mjs — OWNER: A8 (Platform).
 *
 * LIVE EVIDENCE for the fresh-start mechanism (owner request round 14: "there's
 * no mechanism to restart the game fresh"). §0.1.7 is explicit that a
 * screenshot is not evidence and neither is a source grep — a reset that reads
 * correct in the source can still be undone by the `pagehide` flush its own
 * reload fires, or resurrected from the IndexedDB mirror at the next boot. So
 * this drives the real built app in a real browser, plays far enough to make
 * every marker non-zero, then runs BOTH scopes and reads the state back.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE instance, closed
 * in a finally. 390x844. Built app served by `vite preview` under the real
 * `/LexiconManor/` base, because the reset's `location.hash` + reload path is
 * base-path sensitive and the dev server would not prove it.
 *
 * Run: `node tests/reset-live.mjs`
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(ROOT, 'docs/shots/round9/reset');
mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log('[reset]', ...a);
const ok = (m) => console.log('[reset]   ✓', m);
let failures = 0;
const fail = (m) => { console.error('[reset]   ✗ FAIL:', m); failures++; };
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };
const eq = (actual, expected, what) =>
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${what} = ${JSON.stringify(actual)}`,
    `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );

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

/* --- build --------------------------------------------------------------- */

log('building…');
await new Promise((res, rej) => {
  const b = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'build'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let tail = '';
  b.stdout.on('data', (d) => { tail += d; });
  b.stderr.on('data', (d) => { tail += d; });
  b.on('exit', (c) => (c === 0 ? res() : rej(new Error(`vite build failed (${c})\n${tail.slice(-3000)}`))));
});
log('built.');

const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
server.stdout.on('data', (b) => process.stdout.write(`[preview] ${b}`));
server.stderr.on('data', (b) => process.stderr.write(`[preview] ${b}`));
server.on('exit', (c) => { if (c !== null && c !== 0) console.error(`[preview] exited (${c})`); });
// Poll the socket rather than parse stdout: `vite preview` banners vary by
// version and colour mode, and a missed banner reads as a 60s hang.
const serverUp = (async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(BASE, { method: 'GET' });
      if (r.ok || r.status === 404) return;
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
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  /* --- the full persistence surface, read off the live app --------------- */

  const snapshot = () => page.evaluate(async () => {
    const s = window.__manorStore.getState();
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    const vp = `vol.${s.volume.volumeId}.`;
    // The IndexedDB mirror — the key that resurrects a save at the next boot.
    const mirror = await new Promise((res) => {
      try {
        const req = indexedDB.open('lexicon-manor', 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
        };
        req.onsuccess = () => {
          const db = req.result;
          try {
            const g = db.transaction('kv', 'readonly').objectStore('kv').get('save-mirror');
            g.onsuccess = () => { db.close(); res(typeof g.result === 'string'); };
            g.onerror = () => { db.close(); res(false); };
          } catch { db.close(); res(false); }
        };
        req.onerror = () => res(false);
        req.onblocked = () => res(false);
      } catch { res(false); }
    });
    return {
      hash: location.hash,
      // run state
      day: s.day?.day ?? null,
      phase: s.day?.phase ?? null,
      steps: s.day ? s.stepsRemaining() : null,
      manorRooms: s.manor ? Object.keys(s.manor.rooms).length : null,
      ledgerEntries: s.ledger.entries.length,
      gems: s.currencies.gems,
      keys: s.currencies.keys,
      bookmarks: s.currencies.bookmarks,
      // volume / journal
      volumeId: s.volume.volumeId,
      volumeDay: s.volume.day,
      volumeStatus: s.volume.status,
      fragments: s.volume.foundFragmentIds.length,
      interpreted: s.volume.interpretedFragmentIds.length,
      guesses: s.volume.guesses.length,
      // flags — the ghost-marker surface
      flags: s.flags.length,
      volFlagsCurrent: s.flags.filter((f) => f.startsWith(vp)).length,
      sealedMarks: s.flags.filter((f) => f.includes('.sealed-')).length,
      viewedMarks: s.flags.filter((f) => f.includes('.viewed-')).length,
      openedMarks: s.flags.filter((f) => f.includes('.opened-')).length,
      // dialogue / affinity
      seenNodes: s.seenNodeIds.length,
      affinityTotal: sum(s.affinities),
      affinities: { ...s.affinities },
      talkedToday: s.talkedToday.length,
      giftedToday: s.giftedToday.length,
      // spine
      recentEvents: s.recentEvents.length,
      counterTotal: sum(s.counters),
      // meta / permanent
      profileName: s.profileName,
      cards: s.cabinet.unlockedCardIds.length,
      dayRecords: s.chronicles.dayRecords.length,
      runHistoryV1: (s.chronicles.runHistoryV1 ?? []).length,
      keepsakes: s.earnedAchievementIds.length,
      seenPuzzles: sum(
        Object.fromEntries(Object.entries(s.seenPuzzleIds).map(([k, v]) => [k, v.length])),
      ),
      settings: { ...s.settings },
      // storage
      localKeys: Object.keys(localStorage).filter((k) => k.startsWith('lexicon-loop')).sort(),
      sessionKeys: Object.keys(sessionStorage).sort(),
      mirror,
      // live layers
      momentOnGlass: Boolean(document.querySelector('.mom')),
    };
  });

  /**
   * Force the IndexedDB mirror to exist, so the erase has a real one to
   * delete. `visibilitychange` cannot be faked from script (the handler reads
   * `document.visibilityState`), so this goes through the ordinary path: one
   * harmless mutation, then the 2s debounced mirror write in
   * app/platform/persistence.ts.
   */
  async function flushMirror() {
    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      s.setProfileName(s.profileName); // notifies without changing anything
    });
    for (let i = 0; i < 12; i++) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(500);
      // eslint-disable-next-line no-await-in-loop
      const { mirror } = await snapshot();
      if (mirror) return true;
    }
    return false;
  }

  async function playScene() {
    for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
      const primary = await page.$('.dlg-choice--primary');
      if (primary) { await primary.click(); await page.waitForTimeout(200); continue; }
      const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
      if (choice) { await choice.click(); await page.waitForTimeout(200); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      await page.waitForTimeout(200);
    }
  }

  /** Morning card + Bramble → a live `exploring` blueprint. */
  async function reachExploring() {
    await page.waitForSelector('.bp-btn--seal', { timeout: 25000 });
    await page.click('.bp-btn--seal');
    await page.waitForSelector('.chr-scene', { timeout: 10000 });
    await page.click('.chr-scene__btn');
    await page.waitForSelector('.dlg', { timeout: 10000 }).catch(() => {});
    await playScene();
    await page.waitForFunction(
      () => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 20000 },
    );
  }

  const freshLoad = async () => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();
      await new Promise((res) => {
        const r = indexedDB.deleteDatabase('lexicon-manor');
        r.onsuccess = r.onerror = r.onblocked = () => res();
      });
    });
    /* ROUND 16 — a reload issued in the same tick as an IndexedDB teardown can
     * be ABORTED by the service worker's own update navigation (dist/sw.js is
     * built by `build:pages`, so the previewed build has one). `ERR_ABORTED`
     * here says "someone else navigated first", not "the page is broken" — so
     * retry once, and fall back to an explicit goto, which cannot be raced by
     * a navigation that has already happened. */
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    } catch (err) {
      if (!/ERR_ABORTED|frame was detached/.test(String(err))) throw err;
      await page.waitForTimeout(500);
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    }
  };

  /** Reach /chronicles through the UI (AAA 11.23 — two taps from the sheet). */
  async function toChronicles() {
    if (!(await page.$('.bp-sheet, .bp-btn'))) {
      await page.evaluate(() => { window.location.hash = '#/'; });
      await page.waitForTimeout(400);
    }
    const tapped = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => (x.textContent || '').trim().startsWith('Chronicles'));
      if (!b) return false;
      b.click();
      return true;
    });
    if (!tapped) {
      await page.evaluate(() => { window.location.hash = '#/chronicles'; });
    }
    await page.waitForSelector('.chron', { timeout: 15000 });
    return tapped;
  }

  /* ======================================================================
     0. A GENUINELY FRESH INSTALL — the baseline every reset is measured against
     ====================================================================== */
  log('');
  log('— 0. baseline: a genuinely fresh install —');
  await freshLoad();
  const virgin = await snapshot();
  await reachExploring();
  const freshDay1 = await snapshot();
  log(`   day-1 budget on a fresh install: ${freshDay1.steps} steps`);
  check(freshDay1.day === 1, 'a fresh install starts at day 1', `fresh install started at day ${freshDay1.day}`);

  /* ======================================================================
     1. PLAY FAR ENOUGH THAT EVERY MARKER IS NON-ZERO
     ====================================================================== */
  log('');
  log('— 1. making real state —');

  // A real draft through a real door on the blueprint.
  const drafted = await page.evaluate(async () => {
    const store = window.__manorStore;
    for (const d of ['N', 'E', 'W', 'S']) {
      store.getState().openDraft(d);
      const offer = store.getState().draftOffer;
      if (!offer) continue;
      // Prefer a puzzle room so the solve channel and seenPuzzleIds both move.
      const card = offer.cards.find((c) => c.puzzleKind) ?? offer.cards[0];
      store.getState().chooseDraftCard(card.id);
      return { cardId: card.id, puzzleKind: card.puzzleKind ?? null };
    }
    return null;
  });
  check(Boolean(drafted), `drafted a room through a real door: ${JSON.stringify(drafted)}`, 'could not draft a room');
  await page.waitForTimeout(500);

  // Solve it on the one seam every room kind routes through.
  const solved = await page.evaluate(() => {
    const store = window.__manorStore;
    let active = store.getState().day?.activeRoom;
    if (!active) {
      // Not a puzzle card: place one deterministically and step in.
      const m = store.getState().manor;
      const cell = { col: m.playerCell.col, row: m.playerCell.row };
      const key = `${cell.col},${cell.row}`;
      store.setState({
        manor: {
          ...m,
          rooms: {
            ...m.rooms,
            [key]: {
              cardId: 'conservatory', cell, doors: ['N', 'S'], solved: false,
              kind: 'hive', puzzleId: 'hive-test-1',
            },
          },
        },
      });
      store.getState().enterRoom(key);
      active = store.getState().day?.activeRoom;
    }
    if (!active) return false;
    if (!active.puzzleId) {
      store.setState({
        day: { ...store.getState().day, activeRoom: { ...active, puzzleId: `${active.kind}-test-1` } },
      });
    }
    store.getState().applyRoomEvents([{ type: 'solved', perfect: true }], { status: 'solved' });
    store.getState().leaveRoom();
    return true;
  });
  check(solved, 'solved a room (room-solved on the spine → the solve channel paid)', 'could not solve a room');
  await page.waitForTimeout(700);

  // Warm the household, unlock a plate, open the journal so a viewed marker
  // exists, and bank a day so the Chronicles has a row.
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    s.adjustAffinity('bramble', 3);
    s.adjustAffinity('ellery', 4);
    s.adjustAffinity('fern', 2);
    s.unlockCard('gallery');
    s.markFragmentsViewed(window.__manorStore.getState().volume.foundFragmentIds);
    s.markPuzzleSeen('twistle', 'tw-live-1');
  });
  // A v1 blob, so the factory reset has the legacy key to prove it clears.
  await page.evaluate(() => {
    localStorage.setItem('lexicon-loop-save-v1-backup', JSON.stringify({ version: 1, profileName: 'old' }));
  });
  await page.evaluate(() => window.__manorStore.getState().endDay('retired-early'));
  await page.waitForTimeout(900);
  // The IndexedDB mirror must be live, or the resurrection path goes untested.
  await flushMirror();

  const played = await snapshot();
  log('   state after play:', JSON.stringify({
    day: played.day, fragments: played.fragments, flags: played.flags,
    volFlagsCurrent: played.volFlagsCurrent, seenNodes: played.seenNodes,
    affinityTotal: played.affinityTotal, keepsakes: played.keepsakes,
    cards: played.cards, dayRecords: played.dayRecords, seenPuzzles: played.seenPuzzles,
    counterTotal: played.counterTotal, localKeys: played.localKeys, mirror: played.mirror,
  }));

  const nonZero = {
    fragments: played.fragments, volFlagsCurrent: played.volFlagsCurrent,
    seenNodes: played.seenNodes, affinityTotal: played.affinityTotal,
    cards: played.cards, dayRecords: played.dayRecords, seenPuzzles: played.seenPuzzles,
    counterTotal: played.counterTotal, keepsakes: played.keepsakes,
  };
  for (const [k, v] of Object.entries(nonZero)) {
    check(v > 0, `${k} is non-zero before the reset (${v})`, `${k} is still 0 — the reset would prove nothing`);
  }
  check(played.localKeys.includes('lexicon-loop-save-v1-backup'), 'the v1 backup blob is present', 'no v1 backup blob to clear');
  check(played.mirror, 'the IndexedDB mirror holds a save', 'no IndexedDB mirror written — the resurrection path is untested');

  /* ======================================================================
     2. THE CONTROL: reachable, legible, and impossible to fire by accident
     ====================================================================== */
  log('');
  log('— 2. the control —');
  const viaUi = await toChronicles();
  check(viaUi, 'reached /chronicles by tapping "Chronicles" on the blueprint (AAA 11.23: 1 tap)', 'the Chronicles button was not tappable — fell back to the hash');

  const controls = await page.evaluate(() => {
    const out = {};
    for (const id of ['restart-new-volume', 'restart-erase']) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) { out[id] = null; continue; }
      const r = el.getBoundingClientRect();
      const verb = el.querySelector('.chron__restart-verb')?.textContent?.trim() ?? '';
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out[id] = {
        verb, w: Math.round(r.width), h: Math.round(r.height),
        onGlass: Boolean(top && (top === el || el.contains(top))),
        disabled: el.disabled,
      };
    }
    return out;
  });
  // The section is below the fold on a 390x844 sheet; scroll it into view first.
  await page.evaluate(() => {
    document.querySelector('[data-testid="restart-new-volume"]')?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(300);
  const controlsInView = await page.evaluate(() => {
    const out = {};
    for (const id of ['restart-new-volume', 'restart-erase']) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out[id] = {
        verb: el.querySelector('.chron__restart-verb')?.textContent?.trim() ?? '',
        w: Math.round(r.width), h: Math.round(r.height),
        onGlass: Boolean(top && (top === el || el.contains(top))),
      };
    }
    return out;
  });
  check(
    controlsInView['restart-new-volume'].verb === 'Start a new volume',
    'the recognisable words lead: "Start a new volume" (AAA 11.7)',
    `new-volume label reads "${controlsInView['restart-new-volume'].verb}"`,
  );
  check(
    controlsInView['restart-erase'].verb === 'Erase everything',
    'the recognisable words lead: "Erase everything" (AAA 11.7)',
    `erase label reads "${controlsInView['restart-erase'].verb}"`,
  );
  for (const [id, c] of Object.entries(controlsInView)) {
    check(c.onGlass && c.h >= 44, `${id} is on the glass at ${c.w}x${c.h}`, `${id}: onGlass=${c.onGlass} ${c.w}x${c.h}`);
  }
  check(controls['restart-new-volume'] !== null && controls['restart-erase'] !== null, 'both scopes render', 'a scope is missing');

  // Opening a scope must not destroy anything.
  await page.click('[data-testid="restart-erase"]');
  await page.waitForSelector('[data-testid="restart-confirm"]');
  const afterOpen = await snapshot();
  check(
    afterOpen.fragments === played.fragments && afterOpen.dayRecords === played.dayRecords,
    'opening the confirm panel changes no state at all',
    'opening the panel already mutated the save',
  );
  await page.evaluate(() => document.querySelector('[data-testid="restart-confirm"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(SHOTS, 'confirm-erase.png') });

  // One tap on the commit ARMS it; it must not fire.
  await page.click('[data-testid="restart-commit"]');
  await page.waitForTimeout(200);
  const armed = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="restart-commit"]');
    return { armed: b.dataset.armed, label: b.textContent.trim() };
  });
  check(armed.armed === 'yes', `one tap only ARMS the commit ("${armed.label}") — nothing is destroyed`, 'the commit did not arm');
  const afterArm = await snapshot();
  check(
    afterArm.fragments === played.fragments && afterArm.localKeys.length === played.localKeys.length,
    'an armed confirm has still destroyed nothing (a single tap cannot reach the erase)',
    'arming already mutated storage',
  );
  await page.evaluate(() => document.querySelector('[data-testid="restart-confirm"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(SHOTS, 'confirm-erase-armed.png') });

  // Back out, so the erase is not what runs first.
  await page.click('[data-testid="restart-cancel"]');
  await page.waitForTimeout(200);
  check(
    !(await page.$('[data-testid="restart-confirm"]')),
    '"Never mind" closes the panel and leaves the save alone',
    'cancel did not close the panel',
  );

  /* ======================================================================
     3. SCOPE 1 — START A NEW VOLUME
     ====================================================================== */
  log('');
  log('— 3. scope 1: start a new volume —');
  await page.click('[data-testid="restart-new-volume"]');
  await page.waitForSelector('[data-testid="restart-confirm"]');
  const nvPanel = await page.evaluate(() => ({
    title: document.querySelector('.chron__confirm-title').textContent.trim(),
    lost: document.querySelector('[data-testid="restart-lost"]').textContent.trim(),
    kept: document.querySelector('[data-testid="restart-kept"]').textContent.trim(),
    caveat: document.querySelector('[data-testid="restart-rereading"]')?.textContent.trim() ?? null,
    commit: document.querySelector('[data-testid="restart-commit"]').textContent.trim(),
  }));
  log('   panel:', JSON.stringify(nvPanel, null, 1));
  check(/journal/i.test(nvPanel.lost), 'the panel names what is LOST', 'the panel does not name the loss');
  check(/keepsake|Chronicles|friendship/i.test(nvPanel.kept), 'the panel names what SURVIVES', 'the panel does not name what survives');

  // The export, offered inline before the door closes.
  await page.click('[data-testid="restart-export"]');
  await page.waitForTimeout(300);
  const packed = await page.evaluate(() => (document.querySelector('.chron__trunk textarea')?.value ?? '').length);
  check(packed > 200, `the inline export packed a ${packed}-char save code into the trunk`, 'the inline export produced no save code');
  await page.evaluate(() => document.querySelector('[data-testid="restart-confirm"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(SHOTS, 'confirm-new-volume.png') });

  await page.click('[data-testid="restart-commit"]');   // arm
  await page.waitForTimeout(150);
  await page.click('[data-testid="restart-commit"]');   // confirm
  await page.waitForFunction(() => location.hash === '#/' || location.hash === '', null, { timeout: 20000 });
  await page.waitForSelector('.bp-btn--seal', { timeout: 25000 });
  await page.waitForTimeout(500);
  const afterVolume = await snapshot();
  log('   after new volume:', JSON.stringify(afterVolume, null, 1));

  ok('the front step is reached after "Start a new volume"');
  eq(afterVolume.fragments, 0, 'new volume · fragments');
  eq(afterVolume.interpreted, 0, 'new volume · interpreted fragments');
  eq(afterVolume.guesses, 0, 'new volume · guesses');
  eq(afterVolume.volFlagsCurrent, 0, 'new volume · vol.* markers for the live volume');
  eq(afterVolume.sealedMarks, 0, 'new volume · sealed markers');
  eq(afterVolume.viewedMarks, 0, 'new volume · unread/viewed markers');
  eq(afterVolume.openedMarks, 0, 'new volume · opened letter seals');
  eq(afterVolume.volumeStatus, 'active', 'new volume · status');
  eq(afterVolume.day, null, 'new volume · day (the run is cleared)');
  eq(afterVolume.manorRooms, null, 'new volume · manor');
  eq(afterVolume.ledgerEntries, 0, 'new volume · ledger entries');
  eq(afterVolume.gems, 0, 'new volume · gems');
  eq(afterVolume.keys, 0, 'new volume · keys');
  eq(afterVolume.recentEvents, 0, 'new volume · day-stamped events');
  eq(afterVolume.talkedToday, 0, 'new volume · talked-today valve');
  eq(afterVolume.giftedToday, 0, 'new volume · gifted-today valve');
  eq(afterVolume.momentOnGlass, false, 'new volume · moment queue drained');

  // …and what MUST have survived (MANOR_DESIGN §9).
  eq(afterVolume.affinities, played.affinities, 'new volume · affinity SURVIVED');
  eq(afterVolume.seenNodes, played.seenNodes, 'new volume · dialogue-seen SURVIVED');
  eq(afterVolume.keepsakes, played.keepsakes, 'new volume · keepsakes SURVIVED');
  eq(afterVolume.cards, played.cards, 'new volume · unlocked floorplan cards SURVIVED');
  eq(afterVolume.dayRecords, played.dayRecords, 'new volume · chronicles history SURVIVED');
  eq(afterVolume.seenPuzzles, played.seenPuzzles, 'new volume · seenPuzzleIds SURVIVED');
  eq(afterVolume.counterTotal, played.counterTotal, 'new volume · lifetime counters SURVIVED');
  eq(afterVolume.settings, played.settings, 'new volume · settings SURVIVED');
  eq(afterVolume.bookmarks, played.bookmarks, 'new volume · bookmarks SURVIVED');

  await page.screenshot({ path: resolve(SHOTS, 'after-new-volume-front-step.png') });

  // A new day starts at day 1. The BUDGET is the fresh-install budget PLUS the
  // tea the friendship has already earned — `startDay` floors Bramble's warmth
  // at `teaArcFloor(day)` and pours the pot from it, and affinity is exactly
  // what MANOR_DESIGN §9 says survives a volume roll. A stranger's 21 here
  // would mean the household had forgotten her, which is the other bug.
  await reachExploring();
  const nvDay = await snapshot();
  check(nvDay.day === 1, 'a new volume starts a new day 1', `new volume started at day ${nvDay.day}`);
  check(
    nvDay.steps >= freshDay1.steps,
    `day-1 budget after a new volume is ${nvDay.steps} — the fresh-install ${freshDay1.steps} plus ${nvDay.steps - freshDay1.steps} from the tea the household remembers`,
    `day-1 budget after a new volume is ${nvDay.steps}, BELOW the fresh-install ${freshDay1.steps}`,
  );

  /* ======================================================================
     4. SCOPE 2 — ERASE EVERYTHING
     ====================================================================== */
  log('');
  log('— 4. scope 2: erase everything —');
  const beforeErase = await snapshot();
  check(
    beforeErase.affinityTotal > 0 && beforeErase.keepsakes > 0 && beforeErase.dayRecords > 0,
    'there is real permanent progress standing in front of the erase',
    'nothing permanent survives to be erased — the test would prove nothing',
  );
  // The mirror was deleted by the new-volume reset; put a live one back so the
  // erase has the resurrection path to close.
  const mirrored = await flushMirror();
  await page.evaluate(() => {
    localStorage.setItem('lexicon-loop-save-v1-backup', JSON.stringify({ version: 1, profileName: 'old' }));
  });
  const primed = await snapshot();
  check(mirrored && primed.mirror, 'the IndexedDB mirror is live going into the erase', 'no mirror before the erase');
  check(primed.localKeys.includes('lexicon-loop-save-v1-backup'), 'a v1 backup blob stands in front of the erase', 'no v1 blob before the erase');

  await toChronicles();
  await page.evaluate(() => {
    document.querySelector('[data-testid="restart-erase"]')?.scrollIntoView({ block: 'center' });
  });
  await page.click('[data-testid="restart-erase"]');
  await page.waitForSelector('[data-testid="restart-confirm"]');
  const erasePanel = await page.evaluate(() => ({
    title: document.querySelector('.chron__confirm-title').textContent.trim(),
    lost: document.querySelector('[data-testid="restart-lost"]').textContent.trim(),
    kept: document.querySelector('[data-testid="restart-kept"]').textContent.trim(),
  }));
  log('   panel:', JSON.stringify(erasePanel, null, 1));
  check(/Nothing/i.test(erasePanel.kept), 'the erase panel is honest that NOTHING survives', 'the erase panel does not say nothing survives');

  await page.click('[data-testid="restart-commit"]');   // arm
  await page.waitForTimeout(150);
  await page.click('[data-testid="restart-commit"]');   // confirm
  await page.waitForFunction(() => location.hash === '#/' || location.hash === '', null, { timeout: 20000 });
  await page.waitForSelector('.bp-btn--seal', { timeout: 25000 });
  await page.waitForTimeout(700);

  const erased = await snapshot();
  log('   after erase:', JSON.stringify(erased, null, 1));

  ok('the front step is reached after "Erase everything"');
  eq(erased.hash, '#/', 'erase · route');
  eq(erased.localKeys, [], 'erase · lexicon-loop localStorage keys (incl. the v1 backup blob)');
  eq(erased.sessionKeys, [], 'erase · sessionStorage keys');
  eq(erased.mirror, false, 'erase · IndexedDB mirror');
  eq(erased.day, null, 'erase · day');
  eq(erased.manorRooms, null, 'erase · manor');
  eq(erased.ledgerEntries, 0, 'erase · ledger entries');
  eq(erased.gems, 0, 'erase · gems');
  eq(erased.keys, 0, 'erase · keys');
  eq(erased.bookmarks, virgin.bookmarks, 'erase · bookmarks (the starter in the coat pocket)');
  eq(erased.volumeId, virgin.volumeId, 'erase · volume');
  eq(erased.volumeDay, 0, 'erase · volume day');
  eq(erased.volumeStatus, 'active', 'erase · volume status');
  eq(erased.fragments, 0, 'erase · fragments');
  eq(erased.interpreted, 0, 'erase · interpreted');
  eq(erased.guesses, 0, 'erase · guesses');
  eq(erased.flags, virgin.flags, 'erase · flags');
  eq(erased.volFlagsCurrent, 0, 'erase · vol.* markers');
  eq(erased.sealedMarks, 0, 'erase · sealed markers');
  eq(erased.viewedMarks, 0, 'erase · unread/viewed markers');
  eq(erased.openedMarks, 0, 'erase · opened letter seals');
  eq(erased.seenNodes, 0, 'erase · dialogue-seen');
  eq(erased.affinityTotal, 0, 'erase · affinity');
  eq(erased.talkedToday, 0, 'erase · talked-today');
  eq(erased.giftedToday, 0, 'erase · gifted-today');
  eq(erased.recentEvents, 0, 'erase · event stream');
  eq(erased.counterTotal, 0, 'erase · lifetime counters');
  eq(erased.profileName, virgin.profileName, 'erase · profile name');
  eq(erased.cards, 0, 'erase · unlocked floorplan cards');
  eq(erased.dayRecords, 0, 'erase · chronicles day records');
  eq(erased.runHistoryV1, 0, 'erase · v1 run archive');
  eq(erased.keepsakes, 0, 'erase · keepsakes');
  eq(erased.seenPuzzles, 0, 'erase · seenPuzzleIds');
  eq(erased.settings, virgin.settings, 'erase · settings back to factory');
  eq(erased.momentOnGlass, false, 'erase · moment queue drained');

  // The whole model state must equal a genuinely fresh install, field for
  // field. `hash`, `localKeys`, `sessionKeys` and `mirror` are asserted
  // individually above and are deliberately excluded here: the baseline was
  // snapshotted after a boot that had already written its first save, while an
  // erased app has not mutated anything yet, and the routes differ because the
  // reset navigates home rather than starting there.
  const drop = (o) => {
    const c = { ...o };
    for (const k of ['mirror', 'sessionKeys', 'localKeys', 'hash']) delete c[k];
    return c;
  };
  check(
    JSON.stringify(drop(erased)) === JSON.stringify(drop(virgin)),
    'the erased app is field-for-field identical to a genuinely fresh install',
    `erased state differs from a fresh install:\n     fresh:  ${JSON.stringify(drop(virgin))}\n     erased: ${JSON.stringify(drop(erased))}`,
  );

  await page.screenshot({ path: resolve(SHOTS, 'after-erase-front-step.png') });

  /* ======================================================================
     5. THE RELOAD HAZARD — nothing writes the erased save back
     ====================================================================== */
  log('');
  log('— 5. no resurrection —');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('.bp-btn--seal', { timeout: 25000 });
  await page.waitForTimeout(600);
  const afterReload = await snapshot();
  check(
    afterReload.fragments === 0 && afterReload.affinityTotal === 0 &&
    afterReload.dayRecords === 0 && afterReload.keepsakes === 0 &&
    afterReload.seenPuzzles === 0 && afterReload.cards === 0,
    'a further reload does not resurrect the erased save from the mirror',
    `the erased save came back: ${JSON.stringify(afterReload)}`,
  );

  /* ======================================================================
     6. A FIRST-TIME PLAYER'S DAY 1
     ====================================================================== */
  log('');
  log('— 6. day 1, as a stranger —');
  await reachExploring();
  const eraseDay = await snapshot();
  check(eraseDay.day === 1, 'the erased manor starts at day 1', `erased manor started at day ${eraseDay.day}`);
  check(
    eraseDay.steps === freshDay1.steps,
    `day-1 budget after the erase is exactly the fresh-install budget (${eraseDay.steps} steps)`,
    `day-1 budget after the erase is ${eraseDay.steps}, a fresh install gets ${freshDay1.steps}`,
  );

  const noisy = errors.filter((e) => !/favicon|manifest|Failed to load resource/i.test(e));
  check(noisy.length === 0, 'no page errors during the walk', `page errors: ${noisy.slice(0, 4).join(' | ')}`);

  log('');
  log(`screenshots → ${SHOTS}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

log('');
if (failures > 0) {
  console.error(`[reset] ${failures} FAILURE(S)`);
  process.exit(1);
}
log('all checks passed.');
