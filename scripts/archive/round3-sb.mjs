/** Spelling Bee only: accept consent → reload → Play → shoot the honeycomb. */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round3');
const log = (...a) => console.log('[sb]', ...a);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const sleep = (ms) => page.waitForTimeout(ms);

const jsClick = async (texts) => {
  const hit = await page.evaluate((texts) => {
    const els = [...document.querySelectorAll('button, [role="button"]')];
    for (const t of texts) {
      const el = els.find((e) => e.textContent.trim().toLowerCase() === t.toLowerCase());
      if (el) { el.click(); return t; }
    }
    return null;
  }, texts).catch(() => null);
  if (hit) log('clicked:', hit);
  return Boolean(hit);
};

await page.goto('https://www.nytimes.com/puzzles/spelling-bee', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(3500);
await jsClick(['Accept all']);
await sleep(2500);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(3500);
await jsClick(['Accept all']); // in case it survived the reload
await sleep(1500);
await jsClick(['Play']);
await sleep(3500);
await jsClick(['×', '✕']);
await page.evaluate(() => {
  document.querySelector('button[aria-label="Close"]')?.click();
}).catch(() => {});
await sleep(1200);
// Ad interstitial between Play and the puzzle.
for (let i = 0; i < 10; i++) {
  const cont = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, [role="button"], a')];
    const el = els.find((e) => /continue to spelling bee/i.test(e.textContent));
    if (el) { el.click(); return true; }
    return false;
  }).catch(() => false);
  if (cont) { log('clicked interstitial continue'); await sleep(2500); break; }
  await sleep(1000);
}
await sleep(1500);
const scrolled = await page.evaluate(() => {
  const el = document.querySelector('[class*="hive"], .sb-hive, svg[class*="hive"]');
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  return true;
});
log('scrolled to hive:', scrolled);
await sleep(1000);
await page.screenshot({ path: resolve(SHOTS, '60-benchmark-nyt-spelling-bee.png') });
log('shot taken');
await browser.close();
