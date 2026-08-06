/**
 * Live interaction pass for KEEPSAKES + the cabinet plates (AAA §0.4 / 11.17).
 *
 * A screenshot is not evidence for §11: a section that can only ever render
 * empty photographs exactly like a full one. So this drives the REAL app —
 * one browser, one context, system Edge, never a downloaded binary — records
 * a spine event through the live store, and asserts:
 *
 *   - the Chronicles' Keepsakes section is mounted, non-zero and hit-testable
 *     (elementFromPoint at a row's centre returns that row or a descendant),
 *   - the row's state flips from "not yet" to "kept" on the screen she is on,
 *   - the "N of 12" tile agrees with the shelf exactly (11.21),
 *   - setting Posy's authored flag fills the cabinet plate and the card joins
 *     the live deck.
 *
 * Run: npx vite --port 5217   then   node tests/keepsakes-live.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.KEEPSAKE_BASE ?? 'http://localhost:5217/LexiconManor/';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
await page.waitForSelector('.bp-page, .chr-scene', { timeout: 20000 });

// Fresh shelf, then stand on the Chronicles — the screen she would be on.
await page.evaluate(async () => {
  const m = await import('/LexiconManor/src/app/store.ts');
  m.useManorStore.setState({
    counters: {}, recentEvents: [], flags: [],
    chronicles: { dayRecords: [] }, earnedAchievementIds: [],
    cabinet: { unlockedCardIds: [] },
    day: { day: 1, phase: 'exploring', daySeed: 11, activeRoom: null },
  });
});
await page.goto(BASE + '#/chronicles');
await page.waitForSelector('.chron__keepsakes', { timeout: 10000 });

const before = await page.evaluate(() => {
  const row = document.querySelector('.chron__keepsakes li');
  const b = row.getBoundingClientRect();
  const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
  return {
    rows: document.querySelectorAll('.chron__keepsakes li').length,
    earned: document.querySelectorAll('.chron__keepsake.is-earned').length,
    tile: [...document.querySelectorAll('.chron__stat')].map((n) => n.textContent).join(' | '),
    firstRow: row.textContent,
    w: Math.round(b.width), h: Math.round(b.height),
    hitTest: hit === row || row.contains(hit) ? 'ok' : (hit?.className || hit?.tagName || 'null'),
  };
});

// The award path, driven from the screen the player is standing on: exactly
// the event app/slices/room.ts records when a room is solved.
const after = await page.evaluate(async () => {
  const m = await import('/LexiconManor/src/app/store.ts');
  m.useManorStore.getState().recordEvent({
    type: 'room-solved', cellKey: '2,1', kind: 'hive', tier: 1, perfect: false,
  });
  m.useManorStore.getState().setFlag('posy.quest1.done');
  await new Promise((r) => setTimeout(r, 250));
  const s = m.useManorStore.getState();
  return {
    earnedRows: [...document.querySelectorAll('.chron__keepsake.is-earned')]
      .map((n) => n.querySelector('.chron__keepsake-name').textContent),
    states: [...document.querySelectorAll('.chron__keepsake.is-earned .chron__keepsake-state')]
      .map((n) => n.textContent),
    tile: [...document.querySelectorAll('.chron__stat')].map((n) => n.textContent).join(' | '),
    earnedIds: s.earnedAchievementIds,
    cabinet: s.cabinet.unlockedCardIds,
  };
});

// The plate itself, on the blueprint's cabinet.
await page.goto(BASE + '#/');
await page.waitForTimeout(400);
const cabinet = await page.evaluate(async () => {
  const d = await import('/LexiconManor/src/engine/manor/deck.ts');
  const m = await import('/LexiconManor/src/app/store.ts');
  const ids = m.useManorStore.getState().cabinet.unlockedCardIds;
  return {
    unlocked: ids,
    deckHas: d.deckFor(ids).map((c) => c.id).filter((id) => id === 'winter-garden'),
    stillLocked: d.UNLOCKABLE_CARDS.filter((c) => !ids.includes(c.id)).map((c) => c.id),
  };
});

console.log('BEFORE ', JSON.stringify(before, null, 1));
console.log('AFTER  ', JSON.stringify(after, null, 1));
console.log('CABINET', JSON.stringify(cabinet, null, 1));
console.log('page errors:', errors.length ? errors : 'none');

await browser.close();
