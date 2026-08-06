/**
 * Round 5, defects 1 + 2: Chronicles entrance on the blueprint, and the
 * de-fainted DialogueScene skip. System Edge only — never downloads a browser.
 *   node scripts/round5-nav2.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/shots/round5/nav';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:4173/LexiconManor/';
const log = [];

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => log.push(`PAGEERROR: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  const begin = page.getByRole('button', { name: 'Begin the first day' });
  if (await begin.count()) await begin.click();
  const morning = page.getByRole('button', { name: /Begin the day/i });
  await morning.waitFor({ timeout: 8000 }).catch(() => {});
  if (await morning.count()) await morning.click();
  await page.waitForTimeout(900);

  // ---------- Defect 2: the morning DialogueScene's skip ----------
  const dlg = page.locator('.dlg');
  log.push(`morning overlay mounted: ${await dlg.count()}`);
  await page.locator('.dlg__skip').first().waitFor({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/dlg-skip-390-after.png` });
  await page.locator('.dlg__box').screenshot({ path: `${OUT}/dlg-skip-box-390-after.png` });

  const skip = await page.evaluate(() => {
    const el = document.querySelector('.dlg__skip');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const row = document.querySelector('.dlg__plate-row').getBoundingClientRect();
    const box = document.querySelector('.dlg__box').getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      found: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      color: cs.color, background: cs.backgroundColor, border: cs.borderTopWidth + ' ' + cs.borderTopColor,
      minHeight: cs.minHeight, radius: cs.borderTopLeftRadius,
      hitTestHitsControl: !!top && (top === el || el.contains(top)),
      topElement: top ? top.className || top.tagName : null,
      // does the row overflow the box's content width?
      rowOverflow: Math.round(r.right - (box.right - parseFloat(getComputedStyle(document.querySelector('.dlg__box')).paddingRight))),
      nameplateWrapped: document.querySelector('.dlg__nameplate').getClientRects().length,
      rowH: Math.round(row.height),
      text: el.textContent,
    };
  });
  log.push(`SKIP (light): ${JSON.stringify(skip)}`);

  // dark theme on the same live scene
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(300);
  if (await page.locator('.dlg__skip').count()) {
    await page.screenshot({ path: `${OUT}/dlg-skip-dark-390-after.png` });
    log.push(`SKIP (dark): ${JSON.stringify(await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.dlg__skip'));
      return { color: cs.color, background: cs.backgroundColor, border: cs.borderTopColor };
    }))}`);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  // The skip must still work as an exit.
  if (await page.locator('.dlg__skip').count()) {
    await page.locator('.dlg__skip').first().click();
    await page.waitForTimeout(400);
    log.push(`after Skip click: phase-end choices=${await page.locator('.dlg-choice').count()}`);
  }
  for (let i = 0; i < 30 && (await dlg.count()); i++) {
    const farewell = page.locator('.dlg-choice--primary');
    if (await farewell.count()) await farewell.first().click();
    else if (await page.locator('.dlg-choice').count()) await page.locator('.dlg-choice').first().click();
    else await page.locator('.dlg__text-area').click({ force: true });
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(400);
  log.push(`overlay cleared: dlg=${await dlg.count()} blueprint=${await page.locator('.bp-page').count()}`);

  // ---------- Defect 1: Chronicles entrance ----------
  await page.screenshot({ path: `${OUT}/blueprint-chronicles-390-after.png` });
  const entry = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.bp-foot__actions .bp-btn')]
      .find((b) => b.textContent.trim() === 'Chronicles');
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      found: true, cls: el.className,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
      hitTestHitsControl: !!top && (top === el || el.contains(top)),
      siblings: [...document.querySelectorAll('.bp-foot__actions .bp-btn')].map((b) => b.textContent.trim()),
    };
  });
  log.push(`CHRONICLES entry: ${JSON.stringify(entry)}`);
  await page.locator('.bp-foot__actions').screenshot({ path: `${OUT}/blueprint-foot-390-after.png` });

  if (entry.found && entry.hitTestHitsControl) {
    await page.getByRole('button', { name: 'Chronicles', exact: true }).click();
    await page.waitForTimeout(700);
    log.push(`after Chronicles tap: hash=${new URL(page.url()).hash} chronTitle=${await page.locator('.chron__title').count()}`);
    await page.screenshot({ path: `${OUT}/chronicles-arrived-390-after.png` });

    const back = await page.evaluate(() => {
      const el = document.querySelector('.backlink');
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        found: true, text: el.textContent,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
        hitTestHitsControl: !!top && (top === el || el.contains(top)),
      };
    });
    log.push(`chronicles BackLink: ${JSON.stringify(back)}`);
    if (back.found && back.hitTestHitsControl) {
      await page.locator('.backlink').first().click();
      await page.waitForTimeout(700);
      log.push(`after BackLink tap: hash=${new URL(page.url()).hash} blueprint=${await page.locator('.bp-page').count()}`);
      await page.screenshot({ path: `${OUT}/chronicles-return-390-after.png` });
    }
  }

  console.log(log.join('\n'));
} finally {
  await browser.close();
}
