/**
 * Round-7 critic: can a DAY-1 player stand at the Sanctum door?
 * Greedy vertical climb, puzzles ABANDONED (no refunds at all — the weakest
 * possible play). ONE browser instance, system Edge, closed in a finally.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5233/LexiconManor/';
const RUNS = Number(process.env.RUNS || 8);
const log = (...a) => console.log('[r7]', ...a);

const st = (page) => page.evaluate(() => {
  const s = window.__manorStore.getState();
  return {
    phase: s.day?.phase, day: s.day?.day, steps: s.stepsRemaining(),
    keys: s.currencies.keys, gems: s.currencies.gems,
    player: s.manor?.playerCell ?? null,
    drafted: s.manor ? Object.values(s.manor.rooms).filter(r => !(r.cell.col === 2 && r.cell.row === 6)).map(r => `${r.cell.col},${r.cell.row}`) : [],
    frags: s.volume.foundFragmentIds.length,
  };
});

async function tapDialogue(page, max = 80) {
  for (let k = 0; k < max; k++) {
    if (!(await page.$('.dlg__sheet'))) return;
    const c = await page.$('.dlg-choice');
    if (c) { await c.click().catch(() => {}); await page.waitForTimeout(120); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await page.waitForTimeout(70);
  }
}
async function clearMoments(page) {
  for (let i = 0; i < 6; i++) {
    const m = await page.$('.mom');
    if (!m) return;
    await m.click().catch(() => {});
    await page.waitForTimeout(180);
  }
}
async function startDay(page) {
  const seal = await page.$('.bp-btn--seal');
  if (seal) { await seal.click(); await page.waitForTimeout(400); }
  for (let i = 0; i < 25; i++) {
    const s = await st(page);
    if (s.phase === 'exploring') return true;
    if (await page.$('.dlg__sheet')) { await tapDialogue(page); await page.waitForTimeout(200); continue; }
    await clearMoments(page);
    const b = await page.$('.chr-scene__btn');
    if (b) { await b.click().catch(() => {}); await page.waitForTimeout(350); continue; }
    await page.waitForTimeout(250);
  }
  return false;
}

/** rows are read off aria-labels via the store instead: pick by cell row. */
async function targets(page) {
  return page.evaluate(() => {
    const out = [];
    for (const g of document.querySelectorAll('.bp-ghost, .bp-walk, .bp-sanctumhit')) {
      const r = g.getBoundingClientRect();
      out.push({
        kind: g.classList.contains('bp-ghost') ? 'ghost' : g.classList.contains('bp-walk') ? 'walk' : 'sanctum',
        label: g.getAttribute('aria-label') || '',
        y: r.y + r.height / 2, x: r.x + r.width / 2,
      });
    }
    return out;
  });
}

const browser = await chromium.launch({ channel: 'msedge' });
const results = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (let run = 0; run < RUNS; run++) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    if (!(await startDay(page))) { log(`run${run}: could not start day`); continue; }
    let reachedDoor = false, maxRow = 0, refusals = 0, refusalCharged = null;
    for (let step = 0; step < 40; step++) {
      await clearMoments(page);
      const s0 = await st(page);
      if (s0.phase !== 'exploring') break;
      maxRow = Math.max(maxRow, s0.player.row);
      const ts = await targets(page);
      if (ts.some(t => t.kind === 'sanctum')) { reachedDoor = true; break; }
      // highest thing on screen (lowest y), ghosts preferred at equal height
      ts.sort((a, b) => a.y - b.y || (a.kind === 'ghost' ? -1 : 1));
      const t = ts[0];
      if (!t) break;
      await page.mouse.click(t.x, t.y);
      await page.waitForTimeout(350);
      if (await page.$('.bp-modal')) {
        const cards = await page.$$('.bp-card');
        let took = false;
        for (const c of cards) {
          const bad = await c.evaluate(n => n.hasAttribute('disabled') || /locked|unafford|is-disabled/.test(n.className));
          if (bad) continue;
          await c.click().catch(() => {});
          await page.waitForTimeout(450);
          took = true;
          break;
        }
        if (!took) { await page.click('.bp-modal__foot .bp-btn--quiet').catch(() => {}); await page.waitForTimeout(200); }
        if (await page.$('.room-host')) {
          await page.evaluate(() => window.__manorStore.getState().leaveRoom());
          await page.waitForTimeout(300);
        }
        await tapDialogue(page, 40);
      } else {
        const s1 = await st(page);
        const refusal = await page.$('.bp-refusal__line');
        if (refusal) { refusals++; refusalCharged = s0.steps - s1.steps; }
      }
    }
    const end = await st(page);
    results.push({ run, reachedDoor, maxRow: Math.max(maxRow, end.player?.row ?? 0), stepsLeft: end.steps, phase: end.phase, refusals, refusalCharged, drafted: end.drafted.length });
    log(`run${run}: sanctumDoor=${reachedDoor} maxRow=${Math.max(maxRow, end.player?.row ?? 0)} stepsLeft=${end.steps} phase=${end.phase} refusals=${refusals} chargedOnRefusal=${refusalCharged} rooms=${end.drafted.length}`);
  }
} finally {
  await browser.close();
}
const reached = results.filter(r => r.reachedDoor).length;
console.log(`---DAY1 SANCTUM DOOR REACHED (no puzzle refunds at all): ${reached}/${results.length}`);
console.log(JSON.stringify(results));
