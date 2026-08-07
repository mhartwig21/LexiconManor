import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:4173/LexiconManor/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  console.log('body text:', (await page.textContent('body')).slice(0, 300));
  const btn = await page.$('text=Begin the first day');
  console.log('btn?', !!btn);
  if (btn) { await btn.click(); await page.waitForTimeout(2000); }
  console.log('after click body:', (await page.textContent('body')).slice(0, 300));
  console.log('chr-scene?', !!(await page.$('.chr-scene')), 'dlg?', !!(await page.$('.dlg')), 'bp?', !!(await page.$('.bp-sheet')));
  console.log('errors:', errs.slice(0, 10));
} finally { await browser.close(); }
