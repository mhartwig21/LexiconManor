/** Benchmarks take 2: JS-dispatched clicks for consent/play/help. One Edge instance. */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round3');
const log = (...a) => console.log('[bench2]', ...a);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(20000);
const shot = (name) => page.screenshot({ path: resolve(SHOTS, name + '.png') });
const sleep = (ms) => page.waitForTimeout(ms);

/** JS-click the first button whose visible text matches, in any frame. */
async function jsClick(texts) {
  for (const frame of page.frames()) {
    const hit = await frame.evaluate((texts) => {
      const els = [...document.querySelectorAll('button, [role="button"], a')];
      for (const t of texts) {
        const el = els.find((e) => e.textContent.trim().toLowerCase() === t.toLowerCase());
        if (el) { el.click(); return t; }
      }
      return null;
    }, texts).catch(() => null);
    if (hit) { log('js-clicked:', hit); return true; }
  }
  return false;
}

async function jsClickAria(labels) {
  for (const frame of page.frames()) {
    const hit = await frame.evaluate((labels) => {
      for (const l of labels) {
        const el = document.querySelector(`button[aria-label="${l}"], [role="button"][aria-label="${l}"]`);
        if (el) { el.click(); return l; }
      }
      return null;
    }, labels).catch(() => null);
    if (hit) { log('js-clicked aria:', hit); return true; }
  }
  return false;
}

async function bench(name, url, shotName) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3500);
  if (await jsClick(['Accept all'])) await sleep(1500);
  // The Games landing "moment" screen.
  for (let i = 0; i < 2; i++) {
    if (await jsClick(['Play', 'Continue playing', 'Continue'])) await sleep(2500);
  }
  // How-to-play modal.
  if ((await jsClickAria(['Close', 'Close dialog', 'Exit'])) || (await jsClick(['✕', '×']))) await sleep(1000);
  await sleep(1200);
  await shot(shotName);
  log(name, 'shot taken:', page.url().slice(0, 80));
}

try { await bench('spelling-bee', 'https://www.nytimes.com/puzzles/spelling-bee', '60-benchmark-nyt-spelling-bee'); } catch (e) { log('sb fail', e.message?.slice(0, 150)); }
try { await bench('connections', 'https://www.nytimes.com/games/connections', '61-benchmark-nyt-connections'); } catch (e) { log('cn fail', e.message?.slice(0, 150)); }
try { await bench('wordle', 'https://www.nytimes.com/games/wordle/index.html', '62-benchmark-nyt-wordle'); } catch (e) { log('wd fail', e.message?.slice(0, 150)); }

await browser.close();
log('done');
