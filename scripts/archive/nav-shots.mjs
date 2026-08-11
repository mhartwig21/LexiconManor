/**
 * Scratch visual check for the back-navigation pass (round 5).
 * System Edge only — never downloads a Playwright browser.
 *   node scripts/nav-shots.mjs before|after
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const tag = process.argv[2] ?? 'after';
const OUT = 'docs/shots/round5/nav';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:4173/LexiconManor/';

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const log = [];
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Front step → first day → morning card
  const begin = page.getByRole('button', { name: 'Begin the first day' });
  if (await begin.count()) await begin.click();
  const morning = page.getByRole('button', { name: /Begin the day/i });
  await morning.waitFor({ timeout: 8000 }).catch(() => {});
  if (await morning.count()) await morning.click();
  await page.waitForTimeout(600);

  // The morning beat mounts a DialogueScene over the blueprint — tap through
  // it (skip → choices → farewell) until the overlay is gone.
  for (let i = 0; i < 30 && (await page.locator('.dlg').count()); i++) {
    const farewell = page.locator('.dlg-choice--primary');
    if (await farewell.count()) { await farewell.first().click(); }
    else if (await page.locator('.dlg-choice').count()) {
      await page.locator('.dlg-choice').first().click();
    } else {
      await page.locator('.dlg__text-area').click({ force: true });
    }
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(400);

  // --- Journal ---
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/journal-390-${tag}.png` });

  // Is a back control visible in the top strip without scrolling?
  const probe = await page.evaluate(() => {
    const el = document.querySelector('.backlink') || document.querySelector('.jrn__back');
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    // what actually paints at the control's centre?
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      found: true,
      cls: el.className,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
      hitTestHitsControl: !!top && (top === el || el.contains(top)),
      topElement: top ? top.className || top.tagName : null,
      text: el.textContent,
    };
  });
  log.push(`journal back control: ${JSON.stringify(probe)}`);

  // Tap it → should land on the blueprint
  if (probe.found && probe.hitTestHitsControl) {
    await page.locator('.backlink, .jrn__back').first().click();
    await page.waitForTimeout(600);
    log.push(`after tap: hash=${new URL(page.url()).hash} blueprint=${await page.locator('.bp-page').count()}`);
    await page.screenshot({ path: `${OUT}/journal-return-390-${tag}.png` });
  } else {
    log.push('journal back control NOT tappable — skipped return test');
    await page.goto(`${BASE}#/`, { waitUntil: 'networkidle' });
  }

  // --- Chronicles ---
  await page.goto(`${BASE}#/chronicles`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/chronicles-390-${tag}.png` });
  const probe2 = await page.evaluate(() => {
    const el = document.querySelector('.backlink') || document.querySelector('.chron__back');
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      found: true, cls: el.className,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
      hitTestHitsControl: !!top && (top === el || el.contains(top)),
      topElement: top ? top.className || top.tagName : null,
      text: el.textContent,
    };
  });
  log.push(`chronicles back control: ${JSON.stringify(probe2)}`);
  if (probe2.found && probe2.hitTestHitsControl) {
    await page.locator('.backlink, .chron__back').first().click();
    await page.waitForTimeout(600);
    log.push(`after tap: hash=${new URL(page.url()).hash} blueprint=${await page.locator('.bp-page').count()}`);
  }

  // --- Sanctum ---
  await page.goto(`${BASE}#/sanctum`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/sanctum-390-${tag}.png` });
  const probe3 = await page.evaluate(() => {
    const el = document.querySelector('.backlink') || document.querySelector('.snc__back');
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      found: true, cls: el.className,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
      hitTestHitsControl: !!top && (top === el || el.contains(top)),
      topElement: top ? top.className || top.tagName : null,
    };
  });
  log.push(`sanctum back control: ${JSON.stringify(probe3)}`);

  // Dark theme sanity on the journal
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${BASE}#/journal`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/journal-dark-390-${tag}.png` });

  console.log(log.join('\n'));
} finally {
  await browser.close();
}
