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
  await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    s().startDay();
    for (let i = 0; i < 6 && s().day?.phase !== 'exploring'; i++) { s().advanceDayPhase(); await sleep(20); }
    s().adjustAffinity('bramble', 3);
    s().adjustAffinity('fern', 3);
  });
  // In-app navigation only (the installed PWA has no address bar, AAA §11).
  await page.getByRole('button', { name: /Chronicles/i }).first().click();
  await page.waitForTimeout(600);
  const panel = await page.evaluate(() => {
    const el = document.querySelector('.chr-house');
    if (!el) return { missing: true, body: document.body.innerText.slice(0, 400) };
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { text: el.innerText, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
  });
  console.log('[a2] house panel:', JSON.stringify(panel, null, 1));
  await page.screenshot({ path: 'docs/shots/a2-house-so-far.png', fullPage: false });
} finally { await browser.close(); }
