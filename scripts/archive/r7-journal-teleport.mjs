/**
 * Round-7 critic: does the Journal's "Take it to the Sanctum" bypass the climb?
 * Day 1, player standing in the Entrance Hall (row 0), four fragments filed.
 * Navigation is by REAL TAPS from here on. ONE browser, closed in a finally.
 */
import { chromium } from 'playwright';
const BASE = 'http://localhost:5233/LexiconManor/';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const state = await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    s().startDay();
    for (let i = 0; i < 6 && s().day?.phase !== 'exploring'; i++) { s().advanceDayPhase(); await sleep(20); }
    for (let i = 0; i < 4; i++) { s().collectFragmentForRoom('mystery'); await sleep(20); }
    return {
      day: s().day.day, phase: s().day.phase, steps: s().stepsRemaining(),
      player: s().manor?.playerCell, frags: s().volume.foundFragmentIds.length,
    };
  });
  console.log('[r7] seeded:', JSON.stringify(state));
  await page.waitForTimeout(400);
  // dismiss any moment cards
  for (let i = 0; i < 6; i++) { const m = await page.$('.mom'); if (!m) break; await m.click().catch(() => {}); await page.waitForTimeout(200); }
  // tap the Journal entrance on the blueprint
  const journalBtn = await page.$$('button');
  for (const b of journalBtn) {
    const t = (await b.innerText().catch(() => '')).trim();
    if (/^Journal/i.test(t)) { await b.click(); break; }
  }
  await page.waitForTimeout(600);
  console.log('[r7] route after Journal tap:', await page.evaluate(() => location.hash));
  await page.screenshot({ path: 'docs/shots/round7/r7-journal-day1.png' });
  const link = await page.$('.jrn-nudge__link');
  console.log('[r7] "Take it to the Sanctum" present on day 1, ground floor:', !!link);
  if (link) {
    const box = await link.boundingBox();
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.className + '|' + el.tagName : null;
    }, [box.x + box.width / 2, box.y + box.height / 2]);
    console.log('[r7] hit test at its centre:', hit);
    await link.click();
    await page.waitForTimeout(700);
    console.log('[r7] route after tap:', await page.evaluate(() => location.hash));
    const st2 = await page.evaluate(() => {
      const s = window.__manorStore.getState();
      return { player: s.manor?.playerCell, steps: s.stepsRemaining(), day: s.day?.day, phase: s.day?.phase };
    });
    console.log('[r7] state at the Sanctum screen:', JSON.stringify(st2));
    await page.screenshot({ path: 'docs/shots/round7/r7-sanctum-from-journal.png' });
    // speak the word
    const input = await page.$('.snc-input');
    if (input) {
      await input.fill('LACUNA');
      await page.click('.snc-speak');
      await page.waitForTimeout(2500);
      const won = await page.evaluate(() => window.__manorStore.getState().volume.status);
      console.log('[r7] volume status after speaking LACUNA on day 1 from the ground floor:', won);
      await page.screenshot({ path: 'docs/shots/round7/r7-day1-win.png' });
    }
  }
} finally { await browser.close(); }
