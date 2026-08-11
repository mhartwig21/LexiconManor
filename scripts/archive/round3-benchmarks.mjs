/** Benchmarks only: NYT Spelling Bee, Connections, Wordle. One Edge instance. */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round3');
const log = (...a) => console.log('[bench]', ...a);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(20000);
const shot = (name) => page.screenshot({ path: resolve(SHOTS, name + '.png') });
const sleep = (ms) => page.waitForTimeout(ms);

/** Click the first visible match for any selector, searching every frame. */
async function clickAnywhere(selectors, { repeat = 1 } = {}) {
  let clicked = false;
  for (let r = 0; r < repeat; r++) {
    for (const frame of page.frames()) {
      for (const sel of selectors) {
        try {
          const el = await frame.$(sel);
          if (el && (await el.isVisible())) {
            await el.click({ timeout: 3000 });
            log('clicked', sel, frame === page.mainFrame() ? '(main)' : '(iframe)');
            clicked = true;
            await sleep(900);
          }
        } catch { /* keep hunting */ }
      }
    }
    if (clicked) break;
  }
  return clicked;
}

async function dismissConsent() {
  await clickAnywhere([
    'button:has-text("Accept all")',
    'button:has-text("Reject all")',
    'button[data-testid="Accept all-btn"]',
    'button[title="Accept all"]',
  ], { repeat: 3 });
  await sleep(800);
}

async function playAndCloseHelp() {
  await clickAnywhere([
    'button[data-testid="Play"]',
    'button[data-testid="moment-btn-play"]',
    '.pz-moment__button',
    'button:has-text("Play")',
  ], { repeat: 2 });
  await sleep(1800);
  await clickAnywhere([
    'button[aria-label="Close"]',
    '[data-testid="icon-close"]',
    '[data-testid="help-close"]',
    '.pz-moment__close',
  ], { repeat: 2 });
  await sleep(800);
}

async function bench(name, url, readySel, shotName) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);
    await dismissConsent();
    await playAndCloseHelp();
    if (readySel) {
      const ok = await page.waitForSelector(readySel, { timeout: 12000 }).catch(() => null);
      log(name, 'play surface', ok ? 'FOUND' : 'NOT FOUND');
    }
    await sleep(1200);
    await shot(shotName);
    log(name, 'shot taken');
  } catch (e) {
    log(name, 'FAILED', e.message?.slice(0, 200));
    await shot(shotName).catch(() => {});
  }
}

await bench('spelling-bee', 'https://www.nytimes.com/puzzles/spelling-bee', '.sb-hive, [class*="hive"]', '60-benchmark-nyt-spelling-bee');
await bench('connections', 'https://www.nytimes.com/games/connections', '[data-testid="grid"], #board, [class*="Board"]', '61-benchmark-nyt-connections');
await bench('wordle', 'https://www.nytimes.com/games/wordle/index.html', '[class*="Board-module"], [aria-label="Wordle game grid"]', '62-benchmark-nyt-wordle');

await browser.close();
log('done');
