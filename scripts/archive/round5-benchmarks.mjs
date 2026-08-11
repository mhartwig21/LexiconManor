/**
 * ROUND 5 BENCHMARKS — the live competition at 390x844, system Edge, ONE browser.
 * NYT Spelling Bee · Connections · Wordle · Sudoku (hard).
 * Consent/onboarding is dismissed as far as free play allows; anything
 * hard-paywalled is shot AS the wall and reported.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'docs/shots/round5');
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[bench]', ...a);
const notes = [];

const TARGETS = [
  { slug: '50-nyt-spelling-bee', url: 'https://www.nytimes.com/puzzles/spelling-bee', name: 'Spelling Bee' },
  { slug: '52-nyt-connections', url: 'https://www.nytimes.com/games/connections', name: 'Connections' },
  { slug: '54-nyt-wordle', url: 'https://www.nytimes.com/games/wordle/index.html', name: 'Wordle' },
  { slug: '56-nyt-sudoku-hard', url: 'https://www.nytimes.com/puzzles/sudoku/hard', name: 'Sudoku (hard)' },
];

const DISMISS = [
  // NYT ships Ethyca "Fides": the label is a <span> inside the control, so a
  // plain text selector is what actually lands.
  '#fides-banner-button-primary', '.fides-accept-all-button',
  'text="Accept all"', 'text="Accept All"',
  'button:has-text("Accept all")', 'button:has-text("I Accept")', 'button:has-text("Agree")',
  '[data-testid="Cookie-Banner"] button', '#pz-gdpr-btn-accept-all',
];
const START = [
  // the full-page house ad NYT drops in front of every game
  'text=/^Continue to /', 'button:has-text("Continue to")', '[aria-label^="Continue to"]',
  'button:has-text("Play")', 'button:has-text("Play Today")', "button:has-text(\"Let's Play\")",
  'button:has-text("Start")', 'button:has-text("Got it")', 'button:has-text("Continue")',
  'button:has-text("Back to puzzle")', 'button[aria-label="Close"]', 'button:has-text("Skip")',
  'button:has-text("Resume")', 'button:has-text("No thanks")',
];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'en-US',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  isMobile: true,
  hasTouch: true,
});
page.setDefaultTimeout(20000);

const shot = (n) => page.screenshot({ path: join(OUT, n + '.png') });
const sleep = (ms) => page.waitForTimeout(ms);

/** Click the first matching, visible control anywhere in the page — including
 *  inside the Sourcepoint consent iframe, which is where NYT hides "Accept all". */
async function clickAny(selectors, label) {
  for (const frame of page.frames()) {
    for (const sel of selectors) {
      // NB: a selector can match a hidden duplicate first (fides ships both a
      // banner and a modal copy of "Accept all") — walk every match.
      const els = await frame.$$(sel).catch(() => []);
      for (const el of els) {
        const visible = await el.isVisible().catch(() => false);
        if (!visible) continue;
        const ok = await el.click({ timeout: 4000 }).then(() => true).catch(() => false);
        if (!ok) continue;
        log(`  ${label}: clicked ${sel}${frame === page.mainFrame() ? '' : ' (iframe)'}`);
        await sleep(1500);
        return true;
      }
    }
  }
  return false;
}

try {
  for (const t of TARGETS) {
    log(`--- ${t.name} ---`);
    await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => {
      notes.push(`${t.name}: navigation problem — ${e.message.slice(0, 120)}`);
    });
    await sleep(3500);
    await shot(`${t.slug}-a-landing`);

    for (let i = 0; i < 3; i++) if (!(await clickAny(DISMISS, 'consent'))) break;
    // Consent → house ad → onboarding modal → board; each gate re-renders the
    // page, so keep knocking until nothing is left to dismiss.
    for (let i = 0; i < 8; i++) {
      const hit = await clickAny(START, 'start');
      await sleep(1500);
      if (!hit) break;
    }
    await sleep(2500);
    await shot(`${t.slug}-b-board`);

    // A light, free interaction so the board is shown in play, not at rest.
    try {
      if (t.name === 'Wordle') {
        for (const ch of 'CRANE') {
          const k = await page.$(`[data-key="${ch.toLowerCase()}"], button[aria-label="add ${ch.toLowerCase()}"]`);
          if (k) { await k.click(); await sleep(160); }
        }
        await sleep(600);
        await shot(`${t.slug}-c-typed`);
      } else if (t.name === 'Connections') {
        // The badges tooltip sits over the top row — close it before playing.
        for (let i = 0; i < 3; i++) if (!(await clickAny(['button[aria-label="Close"]', '[data-testid="tooltip-close"]'], 'tooltip'))) break;
        const tiles = await page.$$(
          '[data-testid^="card-"], label[class*="Card"], div[class*="Card-module_card"], ' +
          'button[class*="card"], li[class*="card"] button, [class*="item-module_item"]',
        );
        // Duplicate matches and a stubborn badges tooltip over the top row:
        // keep only distinct tiles that sit clear of it.
        const seen = new Set();
        const clear = [];
        for (const tile of tiles) {
          const box = await tile.boundingBox().catch(() => null);
          if (!box || box.y < 200 || box.width < 40) continue;
          const k = `${Math.round(box.x)},${Math.round(box.y)}`;
          if (seen.has(k)) continue;
          seen.add(k);
          clear.push(tile);
        }
        log(`  connections tiles found: ${tiles.length}, clear of the tooltip: ${clear.length}`);
        for (const tile of clear.slice(0, 4)) { await tile.click({ timeout: 3000 }).catch(() => {}); await sleep(260); }
        await sleep(500);
        await shot(`${t.slug}-c-selected`);
      } else if (t.name === 'Spelling Bee') {
        const cells = await page.$$('.hive-cell');
        for (const c of cells.slice(0, 4)) { await c.click().catch(() => {}); await sleep(220); }
        await sleep(500);
        await shot(`${t.slug}-c-typed`);
      } else if (t.name.startsWith('Sudoku')) {
        const cells = await page.$$('.su-board .su-cell, [class*="cell"]');
        if (cells.length) {
          await cells[1].click().catch(() => {});
          await sleep(400);
          const key = await page.$('button:has-text("5"), .su-keyboard__number:has-text("5")');
          if (key) { await key.click().catch(() => {}); await sleep(400); }
        }
        await sleep(500);
        await shot(`${t.slug}-c-selected`);
      }
    } catch (e) {
      notes.push(`${t.name}: interaction skipped — ${e.message.slice(0, 100)}`);
    }

    // Is a wall in the way?
    const wall = await page.evaluate(() => {
      const txt = document.body.innerText.toLowerCase();
      const hit = ['subscribe to keep playing', 'you’ve reached your limit', 'unlock the archive',
        'subscribe for', 'log in', 'create a free account', 'subscriber'].filter((s) => txt.includes(s));
      return hit;
    }).catch(() => []);
    if (wall.length) notes.push(`${t.name}: page text mentions ${wall.map((w) => `"${w}"`).join(', ')}`);
    log(`  wall signals: ${JSON.stringify(wall)}`);
  }
} finally {
  await browser.close();
}
log('NOTES:');
for (const n of notes) console.log('  -', n);
