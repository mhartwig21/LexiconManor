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
  const out = await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    s().startDay();
    for (let i = 0; i < 6 && s().day?.phase !== 'exploring'; i++) { s().advanceDayPhase(); await sleep(20); }
    s().adjustAffinity('bramble', 6);
    s().endDay('retired-early'); await sleep(60);
    for (let i = 0; i < 4 && s().day?.phase !== 'night'; i++) { s().advanceDayPhase(); await sleep(30); }
    await sleep(200);
    s().startDay();
    await sleep(200);
    const morning = document.querySelectorAll('.chr-float').length;
    const t0 = performance.now();
    s().advanceDayPhase();
    const trace = [];
    for (let i = 0; i < 40; i++) {
      const n = document.querySelector('.chr-float');
      trace.push([Math.round(performance.now() - t0), n ? Number(getComputedStyle(n).opacity).toFixed(3) : 'none']);
      await sleep(30);
    }
    return { morning, trace, phase: s().day?.phase };
  });
  console.log('floats during morning:', out.morning, 'phase after:', out.phase);
  console.log(out.trace.map(([t, o]) => `${t}:${o}`).join(' '));
} finally { await browser.close(); }
