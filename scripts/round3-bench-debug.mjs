import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('https://www.nytimes.com/puzzles/spelling-bee', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);
for (const f of page.frames()) {
  const info = await f.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean);
    return { title: document.title.slice(0, 40), btns: btns.slice(0, 12) };
  }).catch((e) => ({ err: e.message.slice(0, 80) }));
  console.log('FRAME', f.url().slice(0, 90), JSON.stringify(info).slice(0, 300));
}
await browser.close();
