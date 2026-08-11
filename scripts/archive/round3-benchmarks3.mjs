/** Benchmarks final polish: consent once, then scroll each play surface into view. */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round3');
const log = (...a) => console.log('[bench3]', ...a);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(20000);
const shot = (name) => page.screenshot({ path: resolve(SHOTS, name + '.png') });
const sleep = (ms) => page.waitForTimeout(ms);

async function jsClick(texts) {
  for (const frame of page.frames()) {
    const hit = await frame.evaluate((texts) => {
      const els = [...document.querySelectorAll('button, [role="button"]')];
      for (const t of texts) {
        const el = els.find((e) => e.textContent.trim().toLowerCase() === t.toLowerCase());
        if (el) { el.click(); return t; }
      }
      return null;
    }, texts).catch(() => null);
    if (hit) { log('clicked:', hit); return true; }
  }
  return false;
}

async function jsClickAria(labels) {
  const hit = await page.evaluate((labels) => {
    for (const l of labels) {
      const el = document.querySelector(`button[aria-label="${l}"], [role="button"][aria-label="${l}"]`);
      if (el) { el.click(); return l; }
    }
    return null;
  }, labels).catch(() => null);
  if (hit) log('clicked aria:', hit);
  return Boolean(hit);
}

async function scrollTo(selector) {
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -8);
    return true;
  }, selector).catch(() => false);
  log('scrolled to', selector, ok);
  return ok;
}

// 1. Spelling Bee — accept consent here; it persists for the session.
await page.goto('https://www.nytimes.com/puzzles/spelling-bee', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(3500);
if (await jsClick(['Accept all'])) await sleep(3000);
await jsClick(['Play']);
await sleep(3000);
await jsClickAria(['Close']);
await sleep(1000);
await scrollTo('[class*="hive"], .sb-hive, [data-testid="hive"]');
await sleep(800);
await shot('60-benchmark-nyt-spelling-bee');
log('spelling bee done');

// 2. Connections.
await page.goto('https://www.nytimes.com/games/connections', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(3000);
await jsClick(['Accept all']);
await jsClick(['Play']);
await sleep(3000);
await jsClickAria(['Close']);
await jsClick(['×', '✕']);
await sleep(1000);
await scrollTo('[data-testid="grid"], fieldset, [class*="Board"]');
await sleep(800);
await shot('61-benchmark-nyt-connections');
log('connections done');

// 3. Wordle.
await page.goto('https://www.nytimes.com/games/wordle/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(3000);
await jsClick(['Accept all']);
await jsClick(['Play', 'Continue']);
await sleep(3000);
await jsClickAria(['Close']);
await sleep(1000);
await scrollTo('[class*="Board-module"], [aria-label="Wordle game grid"], [class*="board"]');
await sleep(800);
await shot('62-benchmark-nyt-wordle');
log('wordle done');

await browser.close();
log('done');
