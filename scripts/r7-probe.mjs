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
  await page.waitForTimeout(600);
  const dump = async (tag) => {
    const info = await page.evaluate(() => {
      const s = window.__manorStore.getState();
      const btns = [...document.querySelectorAll('button')].map(b => b.className + ' :: ' + b.innerText.trim().slice(0, 40));
      return { phase: s.day?.phase, steps: s.stepsRemaining(), btns, hasDlg: !!document.querySelector('.dlg__sheet'), roots: [...document.querySelectorAll('body *')].slice(0, 0) };
    });
    console.log(tag, JSON.stringify(info, null, 1).slice(0, 1200));
  };
  await dump('fresh');
  await page.click('.bp-btn--seal');
  await page.waitForTimeout(600);
  await dump('after-begin-first-day');
  await page.click('.chr-scene__btn');
  await page.waitForTimeout(600);
  await dump('after-begin-the-day');
  for (let i = 0; i < 40; i++) {
    if (!(await page.$('.dlg__sheet'))) break;
    await page.dispatchEvent('.dlg__sheet', 'pointerdown');
    await page.waitForTimeout(90);
  }
  await dump('after-dialogue');
} finally { await browser.close(); }
