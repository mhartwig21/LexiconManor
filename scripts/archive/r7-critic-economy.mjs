/**
 * Round-7 critic drive — manor-economy + dialogue-mystery.
 * ONE browser instance (system Edge, channel msedge), closed in a finally.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5233/LexiconManor/';
const out = [];
const log = (...a) => { console.log('[r7]', ...a); out.push(a.map(String).join(' ')); };

const st = (page) => page.evaluate(() => {
  const s = window.__manorStore.getState();
  return {
    day: s.day && { day: s.day.day, phase: s.day.phase, activeRoom: s.day.activeRoom },
    steps: s.stepsRemaining(),
    cur: s.currencies,
    aff: s.affinities,
    maxRow: s.manor ? Math.max(...Object.values(s.manor.rooms).filter(r => !(r.cell.col===2&&r.cell.row===6)).map(r => r.cell.row)) : null,
    stood: s.manor ? s.manor.playerCell.row : null,
    player: s.manor ? s.manor.playerCell : null,
    rooms: s.manor ? Object.keys(s.manor.rooms).length : 0,
    frags: s.volume.foundFragmentIds.length,
    entries: s.ledger.entries.map(e => [e.reason, e.delta, e.roomKey || '']),
  };
});

async function startDay(page) {
  for (let i = 0; i < 20; i++) {
    const s = await st(page);
    if (s.day && s.day.phase === 'exploring') return;
    if (await page.$('.dlg__sheet')) { await tapThroughDialogue(page, 60); await page.waitForTimeout(200); continue; }
    const scene = await page.$('.chr-scene__btn');
    if (scene) { await scene.click().catch(() => {}); await page.waitForTimeout(300); continue; }
    const btns = await page.$$('button');
    for (const b of btns) {
      const t = (await b.innerText().catch(() => '')).trim();
      if (/begin|start|enter|open the door|good morning/i.test(t)) { await b.click().catch(() => {}); break; }
    }
    await page.waitForTimeout(350);
  }
}

async function tapThroughDialogue(page, max = 80) {
  for (let k = 0; k < max; k++) {
    if (!(await page.$('.dlg__sheet'))) return;
    const choice = await page.$('.dlg-choice');
    if (choice) { await choice.click().catch(() => {}); await page.waitForTimeout(120); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await page.waitForTimeout(70);
  }
}

async function clearMoments(page) {
  for (let i = 0; i < 6; i++) {
    const m = await page.$('.mom');
    if (!m) return;
    await m.click().catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** Greedy climb: always take the highest available ghost door. */
async function climbOnce(page) {
  await clearMoments(page);
  const ghosts = await page.$$('.bp-ghost');
  if (!ghosts.length) return 'no-ghosts';
  // pick topmost on screen (lowest y = highest row)
  let best = null, bestY = 1e9, bestLabel = '';
  for (const g of ghosts) {
    const box = await g.boundingBox();
    if (!box) continue;
    const label = await g.getAttribute('aria-label');
    if (box.y < bestY) { bestY = box.y; best = g; bestLabel = label || ''; }
  }
  if (!best) return 'no-box';
  const before = await st(page);
  await best.click();
  await page.waitForTimeout(400);
  const modal = await page.$('.bp-modal');
  if (!modal) {
    const after = await st(page);
    const charged = before.steps - after.steps;
    const refusal = await page.$('.bp-refusal__line');
    const refusalText = refusal ? await refusal.innerText() : null;
    return `refused label="${bestLabel}" charged=${charged} refusalLine=${JSON.stringify(refusalText)}`;
  }
  // take the first affordable card
  const cards = await page.$$('.bp-card');
  for (const c of cards) {
    const dis = await c.evaluate((n) => n.getAttribute('disabled') !== null || n.className.includes('locked') || n.className.includes('unaffordable'));
    if (dis) continue;
    await c.click().catch(() => {});
    await page.waitForTimeout(500);
    break;
  }
  if (await page.$('.bp-modal')) {
    // could not take: cancel
    await page.click('.bp-modal__foot .bp-btn--quiet').catch(() => {});
    await page.waitForTimeout(200);
    return `no-affordable-card label="${bestLabel}"`;
  }
  // if a room opened, leave it (abandon) so the climb continues
  await page.waitForTimeout(400);
  if (await page.$('.room-host')) {
    await page.evaluate(() => window.__manorStore.getState().leaveRoom());
    await page.waitForTimeout(300);
  }
  await tapThroughDialogue(page, 40);
  return `drafted label="${bestLabel}"`;
}

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') log('CONSOLE-ERR', m.text().slice(0, 200)); });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
  await page.waitForTimeout(500);

  // ---- PHASE 1: honest day 1, greedy climb -------------------------------
  await startDay(page);
  let s = await st(page);
  log('DAY1 start steps=', s.steps, 'cur=', JSON.stringify(s.cur), 'aff=', JSON.stringify(s.aff));
  for (let i = 0; i < 25; i++) {
    const r = await climbOnce(page);
    const now = await st(page);
    log(`  climb#${i} ${r} | steps=${now.steps} maxRow=${now.maxRow} player=${JSON.stringify(now.player)} keys=${now.cur.keys}`);
    if (!now.day || now.day.phase !== 'exploring') { log('  day ended:', now.day && now.day.phase); break; }
    if (r === 'no-ghosts' || r.startsWith('no-box')) break;
  }
  s = await st(page);
  log('DAY1 END maxRow=', s.maxRow, 'rooms=', s.rooms, 'steps=', s.steps, 'phase=', s.day && s.day.phase);
  log('DAY1 ledger=', JSON.stringify(s.entries));

  await page.screenshot({ path: 'docs/shots/round7/r7-day1-end.png' }).catch(() => {});
} finally {
  await browser.close();
}
console.log('---SUMMARY---');
console.log(out.join('\n'));
