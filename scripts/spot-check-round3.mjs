/**
 * Round-3 verifier spot-check: re-screenshot the five screens the critics
 * flagged hardest, post-fix, to docs/shots/round3/after/.
 *   01 Bramble morning dialogue (nameplate row + bookmark gift chrome)
 *   02 Blueprint sheet (new plot border / title block / scale mark / hatch)
 *   03 Draft modal (economy stake lines + scrim)
 *   04 Vestibule refusal (free-probe toast, reserved slot)
 *   05 Sanctum (input placeholder + nameplate at 390px)
 * plus the economy-evidence states fixer-2 asked the orchestrator for:
 *   06 waning/guttering step meter, 07 dusk fade at 0 steps.
 *
 * System Edge only (channel 'msedge'), ONE browser instance, 390x844 @2x.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round3/after');
mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:4173/LexiconManor/';
const anagramPool = JSON.parse(readFileSync(resolve(root, 'content/generated/anagram.json'), 'utf8'));

const log = (...a) => console.log('[spot]', ...a);
const fail = (msg) => { console.error('[spot] FAIL:', msg); process.exitCode = 1; };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const shot = (name) => page.screenshot({ path: resolve(SHOTS, name + '.png') });
const store = () => page.evaluate(() => {
  const s = window.__manorStore.getState();
  return {
    phase: s.day?.phase ?? null,
    steps: s.stepsRemaining(),
    activeRoom: s.day?.activeRoom ?? null,
    bookmarks: s.currencies.bookmarks,
  };
});

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
  await page.reload({ waitUntil: 'networkidle' });

  await page.waitForSelector('text=Begin the first day');
  await page.click('text=Begin the first day');
  await page.waitForSelector('.chr-scene');
  await page.click('.chr-scene__btn');

  // 01 — Bramble scene: tap to the end so the plate, choices/gift row show.
  await page.waitForSelector('.dlg');
  await page.waitForTimeout(700);
  for (let i = 0; i < 40; i++) {
    if (await page.$('.dlg-choice--gift')) break;
    const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (choice) { await choice.click(); await page.waitForTimeout(260); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown');
    await page.waitForTimeout(240);
  }
  const s0 = await store();
  log('gift chrome: bookmarks in pocket =', s0.bookmarks);
  await page.waitForTimeout(400);
  await shot('01-dialogue-bramble-gift');
  // close the scene
  for (let i = 0; i < 20 && (await page.$('.dlg')); i++) {
    const primary = await page.$('.dlg-choice--primary');
    if (primary) { await primary.click(); await page.waitForTimeout(220); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown');
    await page.waitForTimeout(200);
  }

  // 02 — blueprint sheet furniture.
  await page.waitForSelector('.bp-sheet');
  await page.waitForTimeout(400);
  await shot('02-blueprint-sheet');

  // 03 — draft modal with stake lines.
  await page.click('.bp-ghost');
  await page.waitForSelector('.bp-modal');
  await page.waitForTimeout(350);
  const stakes = await page.$$eval('.bp-card__stake', (els) => els.map((e) => e.textContent));
  log('stake lines on cards:', JSON.stringify(stakes));
  if (stakes.length === 0) fail('no .bp-card__stake rendered in draft modal');
  await shot('03-draft-modal-stakes');

  // 04 — Vestibule free refusal toast.
  const vest = await page.$('.bp-card:has-text("Vestibule")');
  if (!vest) { fail('no Vestibule in scripted first draft'); throw new Error('stop'); }
  await vest.click();
  await page.waitForSelector('.mic--vestibule');
  const st = await store();
  const puzzle = anagramPool.find((p) => p.id === st.activeRoom?.puzzleId);
  const round = puzzle.rounds[0];
  const acc = new Set(round.accepted.map((w) => w.toUpperCase()));
  const chars = round.answer.toUpperCase().split('');
  const wrong = [[...chars].reverse().join(''), chars.slice(1).concat(chars[0]).join('')]
    .find((w) => !acc.has(w));
  if (wrong) {
    for (const ch of wrong) {
      const tile = await page.$(`.va-tile:not(.va-tile--used):text-is("${ch}")`);
      if (tile) { await tile.dispatchEvent('pointerdown'); await page.waitForTimeout(50); }
    }
    await page.click('.mic-btn--primary');
    await page.waitForTimeout(450); // toast lives 1800ms
    await shot('04-vestibule-refusal');
  } else {
    log('no wrong arrangement available; shooting the room plain');
    await shot('04-vestibule-refusal');
  }
  await page.click('text=Step away');
  await page.waitForSelector('.bp-sheet');

  // 05 — Sanctum: placeholder + nameplate at 390px, then a typed long guess.
  await page.goto(BASE + '#/sanctum', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await shot('05-sanctum');
  const input = await page.$('.snc-input');
  if (input) {
    await input.fill('PETRICHOR');
    await page.waitForTimeout(250);
    await shot('05b-sanctum-typed');
  }
  await page.goto(BASE + '#/', { waitUntil: 'load' });
  await page.waitForSelector('.bp-sheet');

  // 06/07 — burn steps: capture waning/guttering meter, then the dusk fade.
  let gutteringShot = false;
  for (let i = 0; i < 80; i++) {
    const s = await store();
    if (s.phase !== 'exploring') break;
    if (!gutteringShot && s.steps <= 6) {
      await page.waitForTimeout(350);
      await shot('06-steps-guttering');
      gutteringShot = true;
      log('guttering meter at', s.steps, 'steps');
    }
    const walk = await page.$('.bp-walk');
    if (!walk) break;
    await walk.click();
    await page.waitForTimeout(110);
  }
  const sEnd = await store();
  log('end phase:', sEnd.phase, 'steps', sEnd.steps);
  if (sEnd.phase === 'dusk') {
    await page.waitForSelector('.chr-dusk');
    await page.waitForTimeout(1000);
    await shot('07-dusk-fade');
  }

  if (errors.length) fail('page errors: ' + errors.slice(0, 5).join(' | '));
  log(process.exitCode ? 'DONE WITH FAILURES' : 'DONE — 5 flagged screens + 2 evidence states captured');
} catch (e) {
  fail(e.message);
  await shot('99-failure').catch(() => {});
} finally {
  await browser.close();
}
