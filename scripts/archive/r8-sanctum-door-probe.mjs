/**
 * scripts/r8-sanctum-door-probe.mjs — ROUND 8 verifier.
 *
 * `tests/critic-round12-live.mjs` has failed one assertion for two rounds:
 * "/sanctum has no blueprint entrance while standing on the landing (AAA 11.9)".
 * Round 13's fix pass reported it as "not mine (BlueprintSheet, A1)" without
 * establishing whether the game is broken or the probe's own state setup is.
 * `.bp-sanctumhit` renders on `interactive && atSanctumDoor(manor)`, and
 * `interactive` is `exploring && !draftOffer && !visiting && !cabinetOpen` —
 * four ways for the door to be absent that have nothing to do with the door.
 *
 * This reproduces the critic's exact setup and prints every input to that
 * expression, so the failure can be attributed instead of re-guessed.
 *
 * ONE browser, system Edge, closed in a finally.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4173/LexiconManor/';
const log = (...a) => console.log('[door]', ...a);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(20000);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  await page.waitForSelector('.bp-btn--seal');
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene');
  await page.click('.chr-scene__btn');
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const p = await page.$('.dlg-choice--primary');
    if (p) { await p.click(); await page.waitForTimeout(140); continue; }
    const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (c) { await c.click(); await page.waitForTimeout(140); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await page.waitForTimeout(140);
  }
  await page.waitForSelector('.bp-sheet');
  for (let i = 0; i < 20; i++) {
    const m = await page.$('.mom');
    if (!m) break;
    const r = await m.boundingBox();
    if (r) await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2).catch(() => {});
    await page.waitForTimeout(160);
  }

  // THE CRITIC'S EXACT SETUP.
  await page.evaluate(() => {
    const store = window.__manorStore;
    const s = store.getState();
    const cell = { col: 2, row: 5 };
    const key = `${cell.col},${cell.row}`;
    store.setState({
      manor: {
        ...s.manor,
        playerCell: cell,
        rooms: { ...s.manor.rooms, [key]: { cardId: 'reading-nook', cell, doors: ['N', 'S'], solved: true, kind: 'parlor' } },
      },
    });
    location.hash = '#/manor';
  });
  await page.waitForTimeout(800);

  const state = await page.evaluate(() => {
    const s = window.__manorStore.getState();
    const m = s.manor;
    const room = (c) => m.rooms[`${c.col},${c.row}`] ?? null;
    const here = room(m.playerCell);
    const north = room({ col: m.playerCell.col, row: m.playerCell.row + 1 });
    return {
      phase: s.phase ?? s.day?.phase ?? null,
      dayPhase: s.day?.phase ?? null,
      playerCell: m.playerCell,
      hereDoors: here?.doors ?? null,
      sanctumRoom: north ? { cardId: north.cardId, doors: north.doors } : null,
      draftOffer: !!s.draftOffer,
      visiting: !!s.visiting,
      // The DOM answer.
      sanctumHit: !!document.querySelector('.bp-sanctumhit'),
      anyHit: document.querySelectorAll('.bp-hit').length,
      momentUp: !!document.querySelector('.mom'),
      overlay: document.documentElement.getAttribute('data-overlay-open'),
      route: location.hash,
    };
  });
  log(JSON.stringify(state, null, 1));

  const verdict = state.sanctumHit
    ? 'THE DOOR IS THERE — the critic assertion is stale or its own setup differs'
    : state.phase !== 'exploring'
      ? `NO DOOR because phase is "${state.phase}", not exploring — interactive is false for a reason that is not the door`
      : state.draftOffer || state.visiting
        ? 'NO DOOR because an offer/visit is open — again not the door'
        : 'NO DOOR with phase=exploring and nothing open — A REAL 11.9 DEFECT';
  log('VERDICT:', verdict);
} finally {
  await browser.close();
}
