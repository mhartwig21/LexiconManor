/**
 * ROUND 5 CAPTURE — a fresh tour of the retuned game, through the real UI.
 *
 * Two passes per viewport:
 *   PASS 1 (HONEST): a fresh save, day 1 played straight — front step, morning
 *     card, Bramble, the 18-step blueprint, a real draft, steps burned to dusk,
 *     night digest, day 2. NOTHING is seeded; every number on screen is earned.
 *   PASS 2 (SEEDED FOR REACH): placements are written directly onto the manor
 *     so the tour can visit every shipped room type, a padlocked upper storey,
 *     a parlor, the journal and the Sanctum in one sitting. The STEP BUDGET IS
 *     NEVER SEEDED — the meter shows whatever the real day has left, and when
 *     a day runs out the tour sleeps and wakes into the next one.
 *
 * System Edge only (channel 'msedge'), exactly ONE browser instance.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// `R5_OUT=docs/shots/round5/after node scripts/round5-capture.mjs` to re-shoot
// into a comparison directory without clobbering the round's baseline.
const OUT = resolve(root, process.env.R5_OUT || 'docs/shots/round5');
const BASE = 'http://localhost:4173/LexiconManor/';

const pools = {
  hive: JSON.parse(readFileSync(resolve(root, 'content/generated/hive.json'), 'utf8')),
  twistle: JSON.parse(readFileSync(resolve(root, 'content/generated/twistle.json'), 'utf8')),
  web: JSON.parse(readFileSync(resolve(root, 'content/generated/word-web.json'), 'utf8')),
  cross: JSON.parse(readFileSync(resolve(root, 'content/generated/crossword.json'), 'utf8')),
  fw: JSON.parse(readFileSync(resolve(root, 'content/generated/forgotten-word.json'), 'utf8')),
  sudoku: JSON.parse(readFileSync(resolve(root, 'content/generated/sudoku.json'), 'utf8')),
  cipher: JSON.parse(readFileSync(resolve(root, 'content/generated/cipher.json'), 'utf8')),
};

const log = (...a) => console.log('[r5]', ...a);
const notes = [];
const warn = (m) => { console.warn('[r5] !!', m); notes.push(m); };

const ROOM_KIND = {
  'library': 'word-web',
  'conservatory': 'hive',
  'gallery': 'twistle',
  'study': 'forgotten-word',
  'darkroom': 'cipher',
  'linen-closet': 'crossword',
  'counting-house': 'sudoku',
};
const ROOM_ROOT = {
  'word-web': '.anch--library',
  'hive': '.anch--conservatory',
  'twistle': '.anch--gallery',
  'forgotten-word': '.anch--study',
  'cipher': '.mic--darkroom',
  'crossword': '.m2--linen',
  'sudoku': '.ch',
};

// ---------------------------------------------------------------------------
async function run(page, dir) {
  mkdirSync(dir, { recursive: true });
  const shot = (name) => page.screenshot({ path: join(dir, name + '.png') });
  const sleep = (ms) => page.waitForTimeout(ms);

  /**
   * Scroll the panel that actually scrolls, and report whether it moved.
   *
   * Every panel in this game scrolls INTERNALLY (AAA 7.12) — the page body
   * never does — so a hard-coded selector that misses silently produces a
   * screenshot identical to the one before it. Round 5 shipped two such
   * duplicates (15-journal-scrolled, 41-chronicles-settings). This finds the
   * largest genuinely-overflowing descendant and returns false if nothing
   * moved, so a dud shot is a warning instead of a lie.
   */
  const scrollPanel = async (rootSel, frac = 1) => {
    const moved = await page.evaluate(([sel, f]) => {
      const host = document.querySelector(sel) ?? document.body;
      const all = [host, ...host.querySelectorAll('*')].filter(
        (e) => e.scrollHeight - e.clientHeight > 24,
      );
      if (!all.length) return false;
      const el = all.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
      const before = el.scrollTop;
      el.scrollTop = (el.scrollHeight - el.clientHeight) * f;
      return el.scrollTop !== before;
    }, [rootSel, frac]);
    return moved;
  };
  const store = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    return {
      phase: s.day?.phase ?? null,
      day: s.day?.day ?? null,
      steps: s.stepsRemaining(),
      activeRoom: s.day?.activeRoom ?? null,
      playerCell: s.manor?.playerCell ?? null,
      offer: s.draftOffer ? s.draftOffer.cards.map((c) => ({
        id: c.id, name: c.name, category: c.category, gemCost: c.gemCost,
        rarity: c.rarity, tierRange: c.tierRange,
      })) : null,
      gems: s.currencies.gems,
      keys: s.currencies.keys,
    };
  });

  /** Tap through a DialogueScene until it closes (never the gift button). */
  async function playScene(shotName, waitForChoices = false) {
    await page.waitForSelector('.dlg', { timeout: 8000 });
    if (waitForChoices) {
      for (let i = 0; i < 40; i++) {
        const n = await page.locator('.dlg-choices .dlg-choice:not(.dlg-choice--gift):not(.dlg-choice--primary)').count();
        if (n > 0) break;
        await page.dispatchEvent('.dlg__sheet', 'pointerdown');
        await sleep(240);
        if (!(await page.$('.dlg'))) break;
      }
    }
    if (shotName) { await sleep(500); await shot(shotName); }
    for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
      const primary = await page.$('.dlg-choice--primary');
      if (primary) { await primary.click(); await sleep(220); continue; }
      const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
      if (choice) { await choice.click(); await sleep(220); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown');
      await sleep(200);
    }
  }

  /** Walk the day forward through dusk/night into the next morning. */
  /**
   * A click we are not sure is available: never pay the default timeout for it.
   *
   * Playwright waits for actionability, so `page.click(sel).catch(() => {})` on
   * a DISABLED button burns the full default timeout (15s here) and then
   * swallows the error — invisibly. The room verbs are disabled most of the
   * time by design (`.anch-btn--primary` is disabled whenever the entry is
   * shorter than the minimum word), so a solve loop over ~70 words could sit
   * for twenty minutes looking like a hang. Two seconds is generous for a
   * button that is either there or not.
   */
  const softClick = async (sel, timeout = 2000) =>
    page.click(sel, { timeout }).then(() => true).catch(() => false);

  /**
   * Wait until `manor` exists on the store.
   *
   * `ensureManor` builds it when the day reaches `exploring`, so anything that
   * writes rooms directly must wait — and must wait EVERY time, not once:
   * rolling the day can null it again mid-tour. Round 5's tour skipped this
   * and died on `st.manor.rooms` of null, losing every shot after 09.
   */
  async function waitForManor(timeout = 15000) {
    return page
      .waitForFunction(() => !!window.__manorStore?.getState().manor, { timeout })
      .then(() => true)
      .catch(() => false);
  }

  async function rollToMorning() {
    for (let i = 0; i < 30; i++) {
      const s = await store();
      if (s.phase === 'exploring') return;
      if (s.phase === 'morning') {
        const btn = await page.$('.chr-scene__btn');
        if (btn) { await btn.click(); await sleep(400); }
        if (await page.$('.dlg')) await playScene(null);
        await sleep(300);
        continue;
      }
      if (s.phase === 'dusk') {
        const skip = await page.$('.chr-dusk__skip');
        if (skip) await skip.click(); else await sleep(500);
        await sleep(500);
        continue;
      }
      if (s.phase === 'night') {
        const btn = await page.$('.chr-scene__btn');
        if (btn) await btn.click();
        await sleep(600);
        continue;
      }
      await sleep(300);
    }
  }

  /** Force the day to end and wake into the next one (used between rooms). */
  async function newDay() {
    await page.evaluate(() => {
      const st = window.__manorStore.getState();
      if (st.day && (st.day.phase === 'morning' || st.day.phase === 'exploring')) st.endDay('retired-early');
    });
    await sleep(500);
    await rollToMorning();
  }

  /** Seed a room under the player's feet and enter it. Steps untouched. */
  async function openRoom(cardId, cell) {
    // Never seed into a dead day: wake first, so the meter stays real.
    let s = await store();
    if (s.phase !== 'exploring') { await rollToMorning(); s = await store(); }
    if (s.phase !== 'exploring') { warn(`could not reach an exploring phase for ${cardId}`); return false; }
    if (!(await waitForManor())) { warn(`no manor to open ${cardId} into`); return false; }
    const kind = ROOM_KIND[cardId];
    const seeded = await page.evaluate(({ cardId, cell, kind }) => {
      const st = window.__manorStore.getState();
      if (!st.manor) return false;
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({
        manor: {
          ...st.manor,
          playerCell: cell,
          rooms: {
            ...st.manor.rooms,
            [key]: { cardId, cell, doors: ['N', 'S', 'E', 'W'], solved: false, kind, puzzleId: undefined },
          },
        },
      });
      window.__manorStore.getState().enterRoom(key);
      return true;
    }, { cardId, cell, kind });
    if (!seeded) { warn(`manor vanished while opening ${cardId}`); return false; }
    const root = ROOM_ROOT[kind];
    const ok = await page.waitForSelector(root, { timeout: 10000 }).catch(() => null);
    if (!ok) { warn(`${cardId}: view ${root} never mounted`); return false; }
    await sleep(400);
    return true;
  }

  async function leaveRoom() {
    const back = await page.$('.room-host__footer .btn');
    if (back) { await back.click(); await sleep(500); }
    await page.evaluate(() => window.__manorStore.getState().leaveRoom());
    await sleep(300);
  }

  /**
   * ROUND 5 FIT ASSERTION — "the board is wholly visible at rest".
   *
   * Round-5 shots 32/33 (Darkroom) and 375x667/38 (Counting House) both showed
   * the bottom of the play surface sliced by the sticky, opaque `.room-deck`.
   * A cryptogram is attacked across the WHOLE phrase and a sudoku is scanned
   * across the WHOLE grid, so an occluded last rank removes the room's primary
   * verb (AAA 3.3 / 7.7 / §0.1). This measures the real bounding boxes, so a
   * future chrome or content edit fails the tour rather than the owner's
   * evening.
   */
  async function assertClearsDeck(label, boardSel) {
    const box = await page.locator(boardSel).first().boundingBox().catch(() => null);
    const deck = await page.locator('.room-deck').first().boundingBox().catch(() => null);
    const vh = page.viewportSize().height;
    if (!box) { warn(`${label}: ${boardSel} has no bounding box to measure`); return; }
    const floor = deck ? Math.min(deck.y, vh) : vh;
    const overrun = Math.round(box.y + box.height - floor);
    if (overrun > 0) {
      warn(`${label}: ${boardSel} runs ${overrun}px under the deck `
        + `(board bottom ${Math.round(box.y + box.height)}, deck top ${Math.round(floor)})`);
    } else {
      log(`${label}: ${boardSel} clears the deck by ${-overrun}px`);
    }
    if (box.y < 0) warn(`${label}: ${boardSel} starts ${Math.round(-box.y)}px above the glass`);
  }

  // =========================================================================
  // PASS 1 — HONEST DAY 1
  // =========================================================================
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
  await page.reload({ waitUntil: 'networkidle' });

  await page.waitForSelector('text=Begin the first day');
  await sleep(400);
  await shot('01-front-step');
  await page.click('text=Begin the first day');

  await page.waitForSelector('.chr-scene');
  await sleep(500);
  await shot('02-morning-card');
  await page.click('.chr-scene__btn');
  await playScene('03-bramble-morning');

  await page.waitForSelector('.bp-sheet');
  await sleep(500);
  let s = await store();
  log('day 1 budget (unseeded):', s.steps);
  await shot('04-blueprint-day1');

  // The real day-1 draft.
  const ghost = await page.$('.bp-ghost');
  if (ghost) {
    await ghost.click();
    await page.waitForSelector('.bp-modal', { timeout: 5000 }).catch(() => null);
    await sleep(500);
    s = await store();
    log('day-1 offer:', JSON.stringify(s.offer));
    await shot('05-draft-modal-day1');
    // Take a free card so the day has a room in it, then carry on.
    const free = (s.offer ?? []).find((c) => c.gemCost === 0);
    if (free) {
      await page.click(`.bp-card:has-text("${free.name}")`);
      await sleep(700);
      if (await page.$('.room-host')) {
        await sleep(500);
        await shot('06-first-room-entered');
        await page.click('text=Leave it for tomorrow').catch(() => {});
        await sleep(500);
      }
    } else {
      await page.click('.bp-modal__foot .bp-btn--quiet');
      await sleep(400);
    }
  } else {
    warn('no draftable door on the day-1 blueprint');
  }

  // Burn the honest budget: pace the manor until dusk falls on its own.
  for (let i = 0; i < 90; i++) {
    s = await store();
    if (s.phase !== 'exploring') break;
    const walk = await page.$('.bp-walk');
    if (!walk) {
      const g = await page.$('.bp-ghost');
      if (!g) break;
      await g.click();
      await sleep(350);
      const cancel = await page.$('.bp-modal__foot .bp-btn--quiet');
      if (cancel) { await cancel.click(); await sleep(250); }
      continue;
    }
    await walk.click();
    await sleep(140);
  }
  s = await store();
  log('day 1 ended at phase', s.phase, 'steps', s.steps);

  if (s.phase === 'dusk') {
    await page.waitForSelector('.chr-dusk', { timeout: 5000 }).catch(() => null);
    await sleep(1200);
    await shot('07-dusk-veil');
    const skip = await page.$('.chr-dusk__skip');
    if (skip) await skip.click();
  }
  await page.waitForSelector('.chr-scene', { timeout: 8000 }).catch(() => null);
  await sleep(600);
  await shot('08-night-digest');

  await page.click('.chr-scene__btn').catch(() => {});
  await page.waitForSelector('.chr-scene__title', { timeout: 8000 }).catch(() => null);
  await sleep(600);
  s = await store();
  log('woke into day', s.day, s.phase);
  await shot('09-day2-morning');

  // Into day 2 proper.
  await rollToMorning();
  await page.waitForSelector('.bp-sheet', { timeout: 8000 }).catch(() => null);
  await sleep(400);

  if (!(await waitForManor())) {
    const s2 = await store();
    warn(`manor never built (phase ${s2.phase}, day ${s2.day}) — seeded pass skipped`);
    return;
  }

  // =========================================================================
  // PASS 2 — SEEDED FOR REACH (step budget still real)
  // =========================================================================

  // ---- Padlocked upper storey -------------------------------------------
  // Rooms are written onto rows 3–5 so the upper landings become legible and
  // their padlocks are drawn. No steps are added or removed by this.
  const seedUpper = async (keys) => {
    // The null-check lives INSIDE the evaluate. A wait-then-evaluate pair is
    // two round trips, and the day machine can null the manor between them —
    // which is exactly the race that kept killing this tour.
    for (let attempt = 0; attempt < 12; attempt++) {
      const done = await page.evaluate(({ keys }) => {
      const st = window.__manorStore.getState();
      if (!st.manor) return false;
      const mk = (cardId, kind, col, row) => [`${col},${row}`, {
        cardId, kind, cell: { col, row }, doors: ['N', 'S', 'E', 'W'], solved: false, puzzleId: undefined,
      }];
      const rooms = { ...st.manor.rooms };
      for (const [k, v] of [
        mk('kitchen', 'utility', 2, 1), mk('gallery', 'twistle', 2, 2),
        mk('library', 'word-web', 2, 3), mk('conservatory', 'hive', 2, 4),
        mk('reading-nook', 'parlor', 1, 4),
      ]) rooms[k] = v;
      window.__manorStore.setState({
        manor: { ...st.manor, rooms, playerCell: { col: 2, row: 4 } },
        currencies: { ...st.currencies, keys, gems: 6 },
      });
      return true;
      }, { keys });
      if (done) { await sleep(500); return; }
      // Cheap waits first — the manor is usually a frame away. Only pay for a
      // full day-roll if it is genuinely absent rather than mid-build.
      if (attempt < 8) { await sleep(300); continue; }
      await rollToMorning();
      await sleep(400);
    }
    warn('seedUpper: manor never stayed built long enough to seed');
  };

  await seedUpper(0);
  await shot('10-padlocks-no-key');
  await seedUpper(2);
  await shot('11-padlocks-key-in-pocket');

  // ---- A draft on a padlocked upper-row door ----------------------------
  // Isolated: this is the most state-dependent block in the tour (it hunts for
  // a specific kind of offer behind a specific kind of door) and it sits
  // upstream of every room shot. It must never be able to take them with it.
  try {
    let best = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const st = await store();
      if (st.phase !== 'exploring') { await rollToMorning(); await seedUpper(3); }
      // Prefer a door that is actually padlocked (the modal then states the
      // key price) — otherwise any door on this storey.
      let opened = null;
      const lockedGhost = await page.$('.bp-ghost--locked:not(.bp-ghost--shut)');
      if (lockedGhost) { await lockedGhost.click(); opened = 'locked-ghost'; }
      if (!opened) opened = await page.evaluate(() => {
        const s = window.__manorStore.getState();
        if (!s.manor) return null;
        const cell = s.manor.playerCell;
        const dirs = ['N', 'E', 'W', 'S'];
        for (const d of dirs) {
          const dc = d === 'E' ? 1 : d === 'W' ? -1 : 0;
          const dr = d === 'N' ? 1 : d === 'S' ? -1 : 0;
          const t = { col: cell.col + dc, row: cell.row + dr };
          if (t.col < 0 || t.col > 4 || t.row < 0 || t.row > 6) continue;
          if (s.manor.rooms[`${t.col},${t.row}`]) continue;
          s.openDraft(d);
          return d;
        }
        return null;
      });
      if (!opened) { await sleep(200); continue; }
      await page.waitForSelector('.bp-modal', { timeout: 4000 }).catch(() => null);
      await sleep(350);
      const st2 = await store();
      const cards = st2.offer ?? [];
      if (cards.length) {
        const premium = cards.some((c) => c.gemCost > 0);
        const upper = cards.some((c) => c.tierRange[0] === 3);
        const common = cards.some((c) => c.gemCost === 0);
        const padlocked = (await page.locator('.bp-modal__lock').count()) > 0;
        const score = (premium ? 2 : 0) + (upper ? 2 : 0) + (common ? 1 : 0) + (padlocked ? 3 : 0);
        if (!best || score > best.score) best = { score, cards, premium, upper, common, padlocked };
        if (premium && upper && common && padlocked) {
          await shot('12-draft-upper-row');
          log('upper-row offer:', JSON.stringify(cards));
          best = { ...best, shot: true };
          await page.click('.bp-modal__foot .bp-btn--quiet').catch(() => {});
          await sleep(250);
          break;
        }
      }
      await page.click('.bp-modal__foot .bp-btn--quiet').catch(() => {});
      await sleep(250);
      // Nudge the player to a different upper cell so the next offer differs.
      await page.evaluate((i) => {
        const s = window.__manorStore.getState();
        if (!s.manor) return;
        const cols = [1, 3, 0, 4, 2];
        const col = cols[i % cols.length];
        const row = 4 + (i % 2);
        const key = `${col},${row}`;
        window.__manorStore.setState({
          manor: {
            ...s.manor,
            playerCell: { col, row },
            rooms: {
              ...s.manor.rooms,
              [key]: { cardId: 'boot-room', kind: 'utility', cell: { col, row }, doors: ['N', 'S', 'E', 'W'], solved: false },
            },
          },
        });
      }, attempt);
      await sleep(250);
    }
    if (!best?.shot) {
      if (best) {
        await shot('12-draft-upper-row');
        warn(`12-draft-upper-row: best offer had premium=${best.premium} tier3-only=${best.upper} common=${best.common} padlocked-door=${best.padlocked} — cards ${best.cards.map((c) => c.name).join(', ')}`);
      } else {
        warn('12-draft-upper-row: no upper-row draft could be opened');
      }
    }
  } catch (e) {
    warn(`12-draft-upper-row threw: ${e.message}`);
  }

  // ---- Parlor dialogue with choices --------------------------------------
  try {
    await rollToMorning();
    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      if (!s.manor) return;
      const cell = { col: 2, row: 1 };
      window.__manorStore.setState({
        manor: {
          ...s.manor,
          playerCell: cell,
          rooms: {
            ...s.manor.rooms,
            '2,1': { cardId: 'reading-nook', kind: 'parlor', cell, doors: ['N', 'S', 'E', 'W'], solved: false },
          },
        },
      });
    });
    await sleep(400);
    const call = await page.$('.bp-foot__actions .bp-btn:has-text("Call on")');
    if (call) {
      await call.click();
      await playScene('13-parlor-dialogue', true);
    } else {
      warn('13-parlor-dialogue: no "Call on" button appeared in the parlor');
    }
    await sleep(300);
  } catch (e) {
    warn(`13-parlor-dialogue threw: ${e.message}`);
  }

  // ---- Journal with fragments -------------------------------------------
  {
    await page.evaluate(() => {
      const st = window.__manorStore.getState();
      for (const id of ['v1-d1', 'v1-e1', 'v1-t2', 'v1-d2', 'v1-e2', 'v1-t4', 'v1-d3']) {
        st.fileFragment(id);
      }
    });
    await page.evaluate(() => { location.hash = '#/journal'; });
    await sleep(900);
    await shot('14-journal-fragments');
    // A second look further down the journal — the cross-reference chips and
    // Ellery's interpretation offer live below the fold.
    if (!(await scrollPanel('.jrn', 1))) {
      warn('15-journal-scrolled: nothing scrolled — shot duplicates 14');
    }
    await sleep(500);
    await shot('15-journal-scrolled');
  }

  // ---- Sanctum: before and after a wrong guess ---------------------------
  {
    await page.evaluate(() => { location.hash = '#/sanctum'; });
    await page.waitForSelector('.snc', { timeout: 8000 }).catch(() => null);
    await sleep(700);
    await shot('16-sanctum-before-guess');
    const input = await page.$('.snc-input');
    if (input) {
      await input.fill('CLOISTER');
      await sleep(200);
      await page.click('.snc-speak');
      await sleep(2600);
      await shot('17-sanctum-after-wrong-guess');
      // tap through any authored sigh scene
      for (let i = 0; i < 20 && (await page.$('.dlg')); i++) {
        const primary = await page.$('.dlg-choice--primary');
        if (primary) await primary.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown');
        await sleep(220);
      }
      await sleep(400);
      await shot('18-sanctum-guess-struck');
    } else {
      warn('sanctum: no guess input (door may already be spent for the day)');
    }
    await page.evaluate(() => { location.hash = '#/'; });
    await sleep(600);
  }

  // =========================================================================
  // ROOM GALLERY — every shipped room type in play / mistake / solved
  // =========================================================================
  await rollToMorning();

  // Each room is isolated: one room throwing must not cost the evidence for
  // the other six. Before this, a single bad selector anywhere in the tour
  // took every shot after it with it — which is how a round can end up
  // "passing" on screens nobody ever saw.
  for (const [name, fn] of [
    ['library', theLibrary], ['conservatory', theConservatory], ['gallery', theGallery],
    ['study', theStudy], ['darkroom', theDarkroom], ['linen-closet', theLinenCloset],
    ['counting-house', theCountingHouse],
  ]) {
    try {
      await fn();
    } catch (e) {
      warn(`${name} threw: ${e.message}`);
      await leaveRoom().catch(() => {});
    }
  }

  // ---- Chronicles --------------------------------------------------------
  await page.evaluate(() => { location.hash = '#/chronicles'; });
  await page.waitForSelector('.chron', { timeout: 8000 }).catch(() => null);
  await sleep(700);
  await shot('40-chronicles');
  if (!(await scrollPanel('.chron', 0.55))) {
    warn('41-chronicles-settings: nothing scrolled — shot duplicates 40');
  }
  await sleep(400);
  await shot('41-chronicles-settings');
  await page.evaluate(() => { location.hash = '#/'; });
  await sleep(400);

  // =======================================================================
  // Room drivers
  // =======================================================================

  async function theLibrary() {
    if (!await openRoom('library', { col: 2, row: 1 })) return;
    const tiles = await page.$$eval('.ww-tile', (els) => els.map((e) => e.textContent.trim()));
    const puz = pools.web.find((p) => {
      const words = p.groups.flatMap((g) => g.words);
      return words.length === tiles.length && words.every((w) => tiles.includes(w));
    });
    if (!puz) { warn('library: rendered board not found in the shipped pool'); await leaveRoom(); return; }
    log('library board', puz.id, 'tier', puz.tier);

    const clickWords = async (words) => {
      for (const w of words) {
        const t = page.locator('.ww-tile', { hasText: new RegExp(`^${w}$`) }).first();
        await t.dispatchEvent('pointerdown').catch(() => {});
        await sleep(90);
      }
    };
    // 20 — in play: one thread already woven, a selection on the board.
    await clickWords(puz.groups[0].words);
    await page.click('.anch-btn--primary');
    await sleep(1700);
    await clickWords([puz.groups[1].words[0], puz.groups[2].words[0]]);
    await sleep(200);
    await shot('20-library-play');

    // 21 — mistake: four words that do not belong together.
    await softClick('.anch-btn:has-text("Clear")');
    await sleep(200);
    await clickWords([
      puz.groups[1].words[0], puz.groups[2].words[0],
      puz.groups[3].words[0], puz.groups[1].words[1],
    ]);
    await page.click('.anch-btn--primary');
    await sleep(320);
    await shot('21-library-mistake');
    await sleep(900);

    // 22 — solved.
    for (let g = 1; g < puz.groups.length; g++) {
      await softClick('.anch-btn:has-text("Clear")');
      await sleep(150);
      await clickWords(puz.groups[g].words);
      const weave = await page.$('.anch-btn--primary');
      if (weave) await weave.click();
      await sleep(1800);
      const naming = await page.$('.ww-name');
      if (naming) {
        const theme = puz.groups[g].theme;
        const btn = page.locator('.ww-name__options .anch-btn', { hasText: theme }).first();
        if (await btn.count()) await btn.click();
        else await page.locator('.ww-name__options .anch-btn').first().click();
        await sleep(1200);
      }
    }
    await page.waitForSelector('.anch-done', { timeout: 6000 }).catch(() => warn('library never reached its done screen'));
    await sleep(700);
    await shot('22-library-solved');
    await leaveRoom();
  }

  async function theConservatory() {
    if (!await openRoom('conservatory', { col: 2, row: 1 })) return;
    const center = await page.$eval('.hv-cell--center .hv-cell__g', (e) => e.textContent.trim());
    const petals = await page.$$eval('.hv-board .hv-cell:not(.hv-cell--center) .hv-cell__g', (els) => els.map((e) => e.textContent.trim()));
    const puz = pools.hive.find((p) => p.center === center && p.outer.length === petals.length && p.outer.every((c) => petals.includes(c)));
    if (!puz) { warn('conservatory: rendered hive not found in the shipped pool'); await leaveRoom(); return; }
    log('hive', puz.id, 'tier', puz.tier);

    const solvedNow = () => page.evaluate(() => {
      const s = window.__manorStore.getState();
      const k = s.day?.activeRoom?.cellKey;
      return !!(k && s.manor?.rooms[k]?.solved);
    });
    // Tap the hive rather than type: the hex buttons are the real interaction
    // and every letter lands as its own pointerdown (no keyboard races).
    const tapWord = async (w) => {
      for (const ch of w) {
        await page.locator(`.hv-board .hv-cell:has(.hv-cell__g:text-is("${ch}"))`).first()
          .dispatchEvent('pointerdown').catch(() => {});
        await sleep(28);
      }
      await sleep(60);
    };
    // Submit only when the verb is actually live. A blind `page.click` here
    // costs the FULL default timeout every time the button is disabled — and
    // it is disabled whenever `typed.length < 4`, which includes the whole
    // time the Full Bloom vignette has replaced the hive. At ~70 words per
    // board that turned the solve into a twenty-minute stall.
    const type = async (w) => {
      await tapWord(w);
      const btn = page.locator('.anch-btn--primary');
      if (await btn.isEnabled({ timeout: 1000 }).catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => {});
        await sleep(240);
      }
    };
    const byLen = [...puz.validWords].sort((a, b) => b.length - a.length);
    for (const w of byLen.slice(0, 3)) await type(w);
    await sleep(500);
    await shot('23-conservatory-play');

    // Mistake: letters are legal, the word is not in the lexicon.
    const letters = [center, ...puz.outer];
    let bogus = null;
    for (const a of puz.outer) for (const b of puz.outer) for (const c of puz.outer) {
      const w = center + a + b + c;
      if (!puz.validWords.includes(w) && !bogus) bogus = w;
    }
    if (bogus) {
      await tapWord(bogus);
      await softClick('.anch-btn--primary');
      await sleep(300);
      await shot('24-conservatory-mistake');
      await sleep(1000);
    } else {
      warn('conservatory: could not construct a legal-letters non-word');
    }

    // FULL BLOOM (70%) — a LANDING, not an ejection (round-5 F2). The room
    // stays on the table: the ladder reads "Full Bloom", a note invites her to
    // gather on or step out, and the FOOTER flips to the primary "Step back
    // out" because the room has already paid. The verdict panel deliberately
    // does NOT render here — it waits for Every Petal — so testing for
    // `.anch-done` at this point (as this script used to) reported a phantom
    // failure on correct behaviour.
    for (const w of byLen) {
      if (await solvedNow()) break;
      await type(w);
    }
    await sleep(2400);
    if (!(await solvedNow())) warn(`conservatory never reached Full Bloom`);
    else if (await page.$('.anch-done')) {
      warn('Full Bloom rendered the verdict panel — it should wait for Every Petal');
    }
    await shot('25-conservatory-fullbloom');

    // EVERY PETAL (100%) — now the verdict panel is the correct expectation.
    // Wait out the bloom vignette first: while it is up it REPLACES the hive,
    // so there are no cells to tap and nothing would be gathered.
    await page.waitForSelector('.hv-bloom', { state: 'detached', timeout: 8000 }).catch(() => {});
    for (const w of byLen) {
      if (await page.$('.anch-done')) break;
      await type(w);
    }
    await sleep(2000);
    if (!(await page.$('.anch-done'))) warn('conservatory never reached Every Petal (no verdict panel)');
    await shot('25-conservatory-solved');
    await leaveRoom();
  }

  async function theGallery() {
    if (!await openRoom('gallery', { col: 2, row: 1 })) return;
    const grid = await page.$$eval('.tw-cell', (els) => els.map((e) => e.firstChild?.textContent?.trim() ?? e.textContent.trim()[0]));
    const puz = pools.twistle.find((p) => p.grid.length === grid.length && p.grid.every((c, i) => c === grid[i]));
    if (!puz) { warn(`gallery: rendered grid not found in the shipped pool (${grid.join('')})`); await leaveRoom(); return; }
    const n = puz.size ?? Math.round(Math.sqrt(puz.grid.length));
    const centre = Math.floor((n - 1) / 2) * n + Math.floor((n - 1) / 2);
    log('twistle', puz.id, 'tier', puz.tier, 'size', n, 'need', puz.targetCount);

    const neighbours = (i) => {
      const r = Math.floor(i / n), c = i % n, out = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
      }
      return out;
    };
    const findPath = (word) => {
      const walk = (path, d) => {
        if (d === word.length) return (!puz.rules.centerRequired || path.includes(centre)) ? path : null;
        for (const x of neighbours(path[path.length - 1])) {
          if (path.includes(x) || puz.grid[x] !== word[d]) continue;
          const got = walk([...path, x], d + 1);
          if (got) return got;
        }
        return null;
      };
      for (let i = 0; i < puz.grid.length; i++) {
        if (puz.grid[i] !== word[0]) continue;
        const got = walk([i], 1);
        if (got) return got;
      }
      return null;
    };
    const tapPath = async (path) => {
      for (const idx of path) {
        const box = await page.locator('.tw-cell').nth(idx).boundingBox();
        if (!box) return false;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.up();
        await sleep(70);
      }
      return true;
    };

    const traceable = puz.targetWords.map((w) => ({ w, p: findPath(w) })).filter((x) => x.p);
    if (traceable.length < puz.targetCount) warn(`gallery: only ${traceable.length} traceable target words`);

    // In play: two works hung, a third being traced.
    for (const { w, p } of traceable.slice(0, 2)) {
      await tapPath(p);
      await softClick('.anch-btn--primary');
      await sleep(700);
      log('  traced', w);
    }
    if (traceable[2]) await tapPath(traceable[2].p.slice(0, Math.max(2, traceable[2].p.length - 1)));
    await sleep(300);
    await shot('26-gallery-play');

    // Mistake: a legal trace that is not a word.
    await softClick('.anch-btn:has-text("Clear")');
    await sleep(200);
    const minLen = puz.rules.minLength ?? 4;
    let bogusPath = null;
    outer:
    for (let i = 0; i < puz.grid.length; i++) {
      const build = (path) => {
        if (path.length >= minLen) {
          const w = path.map((x) => puz.grid[x]).join('');
          if (!puz.targetWords.includes(w) && (!puz.rules.centerRequired || path.includes(centre))) return path;
        }
        if (path.length >= minLen + 2) return null;
        for (const x of neighbours(path[path.length - 1])) {
          if (path.includes(x)) continue;
          const got = build([...path, x]);
          if (got) return got;
        }
        return null;
      };
      const got = build([i]);
      if (got) { bogusPath = got; break outer; }
    }
    if (bogusPath) {
      await tapPath(bogusPath);
      await softClick('.anch-btn--primary');
      await sleep(320);
      await shot('27-gallery-mistake');
      await sleep(1200);
    } else {
      warn('gallery: could not build a legal non-word trace');
    }

    // Solve.
    for (const { p } of traceable) {
      if (await page.$('.anch-done')) break;
      await softClick('.anch-btn:has-text("Clear")');
      await sleep(120);
      await tapPath(p);
      // `$` finds the button even when it is disabled, so a bare .click() here
      // still waited the full default timeout on every un-claimable trace.
      await softClick('.anch-btn--primary');
      await sleep(700);
    }
    await page.waitForSelector('.anch-done', { timeout: 6000 }).catch(() => warn('gallery never hung'));
    await sleep(700);
    await shot('28-gallery-solved');
    await leaveRoom();
  }

  async function theStudy() {
    // The Study is tier-3 only: it lives on rows 5–6, so the tour stands there.
    if (!await openRoom('study', { col: 2, row: 5 })) return;
    const defText = await page.$eval('.fw-def__text', (e) => e.textContent.replace(/[“”"]/g, '').trim());
    const puz = pools.fw.find((p) => Object.values(p.definitions).some((d) => d.trim() === defText));
    if (!puz) { warn('study: rendered definition not found in the shipped pool'); await leaveRoom(); return; }
    log('forgotten word', puz.id, puz.word);

    await sleep(300);
    await shot('29-study-play');

    // Mistake: a whisper of the right length that is not the word.
    const wrong = (pools.fw.find((p) => p.word.length === puz.word.length && p.word !== puz.word) ?? {}).word
      ?? puz.word.split('').reverse().join('');
    await page.fill('.fw-input', wrong);
    await page.click('.anch-btn--primary');
    await sleep(400);
    await shot('30-study-mistake');
    await sleep(1400);

    await page.fill('.fw-input', puz.word);
    await page.click('.anch-btn--primary');
    await page.waitForSelector('.anch-done', { timeout: 6000 }).catch(() => warn('study never resolved'));
    await sleep(1400);
    await shot('31-study-solved');
    await leaveRoom();
  }

  async function theDarkroom() {
    if (!await openRoom('darkroom', { col: 2, row: 1 })) return;
    const words = await page.$$eval('.dk-word', (els) =>
      els.map((w) => [...w.querySelectorAll('.dk-cell__cipher')].map((c) => c.textContent).join('')));
    const cipherText = words.join(' ');
    const puz = pools.cipher.find((p) => p.ciphertext === cipherText);
    if (!puz) { warn('darkroom: rendered ciphertext not found in the shipped pool'); await leaveRoom(); return; }
    log('cipher', puz.id, 'tier', puz.tier);

    const truth = {};
    for (let i = 0; i < puz.ciphertext.length; i++) {
      const c = puz.ciphertext[i];
      if (/[A-Z]/.test(c)) truth[c] = puz.plaintext[i];
    }
    const letters = [...new Set([...puz.ciphertext].filter((c) => /[A-Z]/.test(c)))]
      .filter((c) => !puz.reveals.includes(c));

    const pencil = async (cipherCh, plainCh) => {
      const cell = await page.$(`.dk-cell:not(.dk-cell--locked):has(.dk-cell__cipher:text-is("${cipherCh}"))`);
      if (!cell) return false;
      await cell.dispatchEvent('pointerdown');
      await sleep(45);
      const key = await page.$(`.mic-key:text-is("${plainCh}")`);
      if (!key) return false;
      await key.dispatchEvent('pointerdown');
      await sleep(45);
      return true;
    };

    // In play: part of the truth table penciled in.
    for (const c of letters.slice(0, Math.ceil(letters.length / 2))) await pencil(c, truth[c]);
    await sleep(300);
    await shot('32-darkroom-play');
    // The whole print must clear the sticky deck — see assertClearsDeck. The
    // pool's worst case is checked deterministically in tests/puzzles/micro.
    await assertClearsDeck(`darkroom ${puz.id} (${puz.plaintext.replace(/[^A-Z]/g, '').length} letters)`, '.dk-sheet');

    // Mistake: a full print developed with one letter wrong — "still murky".
    const rest = letters.slice(Math.ceil(letters.length / 2));
    for (const c of rest) await pencil(c, truth[c]);
    const swapMe = letters[letters.length - 1];
    const badLetter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((ch) => ch !== truth[swapMe] && !Object.values(truth).includes(ch)) ?? 'Q';
    await pencil(swapMe, badLetter);
    await page.click('.mic-btn--primary');
    await sleep(450);
    await shot('33-darkroom-mistake');
    await sleep(1600);

    await pencil(swapMe, truth[swapMe]);
    await page.click('.mic-btn--primary');
    await page.waitForSelector('.mic-done', { timeout: 6000 }).catch(() => warn('darkroom never developed'));
    await sleep(2200);
    await shot('34-darkroom-solved');
    await leaveRoom();
  }

  async function theLinenCloset() {
    if (!await openRoom('linen-closet', { col: 2, row: 1 })) return;
    const clues = await page.$$eval('.lc-clue__text', (els) => els.map((e) => e.textContent.trim()));
    const puz = pools.cross.find((p) => p.entries.length === clues.length && p.entries.every((e) => clues.includes(e.clue)));
    if (!puz) { warn('linen closet: rendered clues not found in the shipped pool'); await leaveRoom(); return; }
    log('crossword', puz.id, 'tier', puz.tier, 'size', puz.size);

    const cellsOf = (e) => {
      const start = e.row * puz.size + e.col;
      return [...e.answer].map((_, i) => start + (e.dir === 'across' ? i : i * puz.size));
    };
    const solution = new Map();
    for (const e of puz.entries) cellsOf(e).forEach((c, i) => solution.set(c, e.answer[i]));

    const typeInto = async (cellIdx, letter) => {
      await page.locator('.lc-cell').nth(cellIdx).dispatchEvent('pointerdown').catch(() => {});
      await sleep(60);
      await page.locator('.lc-key', { hasText: new RegExp(`^${letter}$`) }).first().dispatchEvent('pointerdown').catch(() => {});
      await sleep(60);
    };

    const all = [...solution.keys()].sort((a, b) => a - b);
    // In play: the first entry folded away.
    for (const c of cellsOf(puz.entries[0])) await typeInto(c, solution.get(c));
    await sleep(400);
    await shot('35-linen-closet-play');

    // Mistake: complete the grid with one square wrong — the auto-check refuses.
    const spoil = all[all.length - 1];
    for (const c of all) {
      if (await page.locator('.lc-cell').nth(c).locator('.lc-cell__ch').textContent().then((t) => (t ?? '').trim()).catch(() => '')) continue;
      await typeInto(c, c === spoil ? (solution.get(c) === 'A' ? 'B' : 'A') : solution.get(c));
    }
    await sleep(450);
    await shot('36-linen-closet-mistake');
    await sleep(1500);

    await typeInto(spoil, solution.get(spoil));
    await page.waitForSelector('.m2-done', { timeout: 6000 }).catch(() => warn('linen closet never folded'));
    await sleep(1200);
    await shot('37-linen-closet-solved');
    await leaveRoom();
  }

  async function theCountingHouse() {
    if (!await openRoom('counting-house', { col: 2, row: 1 })) return;
    const givens = await page.$$eval('.ch-cell', (els) =>
      els.map((e) => e.querySelector('.ch-cell__fig')?.textContent ?? '.').join(''));
    const board = pools.sudoku.find((p) => p.givens === givens);
    if (!board) { warn('counting house: rendered leaf not found in the shipped pool'); await leaveRoom(); return; }
    log('sudoku', board.id, 'tier', board.tier);

    const selectCell = async (i) => {
      await page.locator('.ch-cell').nth(i).dispatchEvent('pointerdown');
      await sleep(60);
    };
    const pressFig = async (d) => {
      await page.locator('.ch-key--fig').nth(d - 1).click();
      await sleep(120);
    };

    const blanks = [];
    for (let i = 0; i < 81; i++) if (board.givens[i] === '.') blanks.push(i);

    // In play: a few figures inked and a cell pencilled.
    for (const i of blanks.slice(0, 6)) {
      await selectCell(i);
      await pressFig(Number(board.solution[i]));
    }
    await selectCell(blanks[6]);
    const pencilToggle = '.ch-tools--free .ch-tool:first-child';
    await page.click(pencilToggle);
    await pressFig(Number(board.solution[blanks[6]]));
    await pressFig(((Number(board.solution[blanks[6]])) % 9) + 1);
    await page.click(pencilToggle);
    await sleep(350);
    await shot('38-counting-house-play');
    await assertClearsDeck(`counting house ${board.id}`, '.ch-leaf');

    // Round 5: a figure already standing in a peer is a MALFORMED ink — the
    // leaf showed her the clash before she pressed, so it shakes, says why,
    // and costs nothing. (A board-legal but solution-wrong figure now LANDS
    // and costs nothing either; the priced claim is "Balance the books".)
    const target = blanks[7];
    const br = Math.floor(target / 9), bc = target % 9;
    const answer = Number(board.solution[target]);
    let wrong = null;
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9), c = i % 9;
      const sameBox = Math.floor(r / 3) === Math.floor(br / 3) && Math.floor(c / 3) === Math.floor(bc / 3);
      if (i !== target && (r === br || c === bc || sameBox)) {
        const g = board.givens[i];
        if (g !== '.' && Number(g) !== answer) { wrong = Number(g); break; }
      }
    }
    if (wrong) {
      await selectCell(target);
      await pressFig(wrong);
      await sleep(400);
      await shot('39-counting-house-mistake');
      await sleep(2000);
      await selectCell(target);
      await pressFig(answer);
      await sleep(300);
    } else {
      warn('counting house: no visible clash available on this leaf');
    }

    // The room's ONE priced claim: how many of her own figures are astray,
    // never which. Ink a board-legal but solution-wrong figure first so the
    // report has something to say, then lift it again.
    const astrayAt = blanks[8];
    const seen = new Set();
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9), c = i % 9;
      const ar = Math.floor(astrayAt / 9), ac = astrayAt % 9;
      const sameBox = Math.floor(r / 3) === Math.floor(ar / 3) && Math.floor(c / 3) === Math.floor(ac / 3);
      if (i !== astrayAt && (r === ar || c === ac || sameBox) && board.givens[i] !== '.') seen.add(Number(board.givens[i]));
    }
    const legalWrong = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .find((d) => d !== Number(board.solution[astrayAt]) && !seen.has(d));
    if (legalWrong) {
      await selectCell(astrayAt);
      await pressFig(legalWrong);
      await sleep(200);
      await page.click('.ch-tools--priced .ch-tool:nth-child(1)');   // Balance the books
      await sleep(500);
      await shot('39a-counting-house-balance');
      await sleep(1900);
      await selectCell(astrayAt);
      // Erase disables itself when the selected cell holds nothing to lift —
      // a legitimate state, not a failure, so never block the tour on it.
      const erase = await page.$('.ch-key--wide:not([disabled])');
      if (erase) await erase.click();
      else log('counting house: Erase is disabled (nothing to lift) — skipped');
      await sleep(250);
    } else {
      warn('counting house: no board-legal wrong figure available on this leaf');
    }

    // The clerk's technique nudge — priced help that teaches, and the reason
    // an expert has a usable way out of a stall (AAA 3.2 / 3.8).
    await page.click('.ch-tools--priced .ch-tool:nth-child(2)');
    await sleep(500);
    await shot('39c-counting-house-nudge');
    await sleep(2600);

    // Solved — the ledger balances. (Filling 60+ cells takes a moment.)
    for (const i of blanks) {
      const filled = await page.locator('.ch-cell').nth(i).locator('.ch-cell__fig').count();
      if (filled) continue;
      await selectCell(i);
      await pressFig(Number(board.solution[i]));
      if (await page.$('.ch-done')) break;
    }
    await page.waitForSelector('.ch-done', { timeout: 8000 }).catch(() => warn('counting house never balanced'));
    await sleep(900);
    await shot('39b-counting-house-solved');
    await leaveRoom();
  }
}

// ---------------------------------------------------------------------------
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const vp of [
    { w: 390, h: 844, dir: OUT },
    { w: 375, h: 667, dir: join(OUT, '375x667') },
  ]) {
    log(`=== viewport ${vp.w}x${vp.h} ===`);
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 });
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => warn(`pageerror @${vp.w}: ${String(e).slice(0, 160)}`));
    try {
      await run(page, vp.dir);
    } catch (e) {
      warn(`tour @${vp.w}x${vp.h} threw: ${e.message}`);
      await page.screenshot({ path: join(vp.dir, '99-failure.png') }).catch(() => {});
    }
    await page.close();
  }
} finally {
  await browser.close();
}
log('NOTES:');
for (const n of notes) console.log('  -', n);
