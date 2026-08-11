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
  const probe = await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    // day 1 → warm her → night → day 2 dawn, sampling the chrome every 100ms
    s().startDay();
    for (let i = 0; i < 6 && s().day?.phase !== 'exploring'; i++) { s().advanceDayPhase(); await sleep(20); }
    s().adjustAffinity('bramble', 6);
    s().endDay('retired-early'); await sleep(60);
    for (let i = 0; i < 4 && s().day?.phase !== 'night'; i++) { s().advanceDayPhase(); await sleep(30); }
    await sleep(200);
    const samples = [];
    s().startDay();
    for (let t = 0; t < 30; t++) {
      const floats = [...document.querySelectorAll('.chr-float')].map(n => {
        const r = n.getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const cs = getComputedStyle(n);
        return { text: n.textContent, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], topEl: el ? el.className : null, opacity: cs.opacity, visibility: cs.visibility };
      });
      const meter = document.querySelector('.chr-candle, .chr-steps, .chr-meter');
      samples.push({ t: t * 100, phase: s().day?.phase, steps: s().stepsRemaining(), floats, scene: !!document.querySelector('.chr-scene') });
      await sleep(100);
    }
    return { samples, ledger: s().ledger.entries.map(e => [e.reason, e.delta]) };
  });
  const withFloats = probe.samples.filter(s => s.floats.length);
  console.log('[r7] ledger at dawn:', JSON.stringify(probe.ledger));
  console.log('[r7] samples with a visible float:', withFloats.length, 'of', probe.samples.length);
  console.log(JSON.stringify(withFloats.slice(0, 6), null, 1));
  console.log('[r7] header chips text:', await page.evaluate(() => document.querySelector('.chr-header')?.innerText?.replace(/\n/g, ' | ')));
  await page.screenshot({ path: 'docs/shots/round7/r7-dawn-float.png' });
} finally { await browser.close(); }
