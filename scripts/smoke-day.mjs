/**
 * Integration smoke test: drive one full in-game day through the REAL UI.
 * front step → morning (Bramble) → blueprint → draft Vestibule → mistake
 * (steps drop) → solve (steps refund) → parlor visit / Dewey → burn steps →
 * dusk veil → night digest. Screenshots to docs/shots/round2/.
 *
 * Uses system Edge (channel 'msedge') — NEVER downloads playwright browsers.
 * Exactly ONE browser instance.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round2');
const BASE = 'http://localhost:4173/LexiconManor/';
const anagramPool = JSON.parse(readFileSync(resolve(root, 'content/generated/anagram.json'), 'utf8'));

const log = (...a) => console.log('[smoke]', ...a);
const fail = (msg) => { console.error('[smoke] FAIL:', msg); process.exitCode = 1; };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const shot = (name) => page.screenshot({ path: resolve(SHOTS, name + '.png') });
const store = () => page.evaluate(() => {
  const s = window.__manorStore.getState();
  return {
    phase: s.day?.phase ?? null,
    dayNum: s.day?.day ?? null,
    steps: s.stepsRemaining(),
    activeRoom: s.day?.activeRoom ?? null,
    playerCell: s.manor?.playerCell ?? null,
    offer: s.draftOffer ? s.draftOffer.cards.map((c) => ({ id: c.id, name: c.name, category: c.category, gemCost: c.gemCost })) : null,
    gems: s.currencies.gems,
    fragments: s.volume.foundFragmentIds.length,
    ledgerLast: s.ledger.entries.slice(-3),
    talked: s.talkedToday,
  };
});

/** Tap through a DialogueScene until it closes (avoids the gift button). */
async function playScene(shotName) {
  await page.waitForSelector('.dlg', { timeout: 8000 });
  if (shotName) { await page.waitForTimeout(600); await shot(shotName); }
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const primary = await page.$('.dlg-choice--primary');
    if (primary) { await primary.click(); await page.waitForTimeout(250); continue; }
    const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (choice) { await choice.click(); await page.waitForTimeout(250); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown');
    await page.waitForTimeout(220);
  }
  if (await page.$('.dlg')) fail('dialogue scene never closed');
}

/** Place a word in the Vestibule tray then submit. */
async function placeAndSubmit(word) {
  for (const ch of word) {
    const tile = await page.$(`.va-tile:not(.va-tile--used):text-is("${ch}")`);
    if (!tile) { fail(`no free tile for letter ${ch}`); return; }
    await tile.dispatchEvent('pointerdown');
    await page.waitForTimeout(60);
  }
  await page.click('.mic-btn--primary');
  await page.waitForTimeout(500);
}

async function clearSlots() {
  for (let i = 0; i < 12; i++) {
    const slot = await page.$('.va-slot--filled');
    if (!slot) break;
    await slot.dispatchEvent('pointerdown');
    await page.waitForTimeout(50);
  }
}

/** A permutation of `answer`'s letters that is NOT in accepted. */
function wrongArrangement(round) {
  const acc = new Set(round.accepted.map((w) => w.toUpperCase()));
  const chars = round.answer.toUpperCase().split('');
  const tries = [
    [...chars].reverse().join(''),
    chars.slice(1).concat(chars[0]).join(''),
    chars.slice(-1).concat(chars.slice(0, -1)).join(''),
  ];
  for (const t of tries) if (!acc.has(t)) return t;
  return null; // pathological: every rotation is a word — skip the mistake
}

// ---------------------------------------------------------------------------
try {
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Fresh save for a deterministic run.
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
  await page.reload({ waitUntil: 'networkidle' });

  // 1. Front step.
  await page.waitForSelector('text=Begin the first day');
  await shot('01-front-step');
  await page.click('text=Begin the first day');

  // 2. Morning card → Bramble scene → blueprint.
  await page.waitForSelector('.chr-scene');
  await shot('02-morning-card');
  await page.click('.chr-scene__btn');
  await playScene('03-bramble-morning');
  await page.waitForSelector('.bp-sheet');
  let s = await store();
  log('after morning:', s.phase, 'steps', s.steps);
  await shot('04-blueprint-day1');

  // 3. Draft: open the first gilt door.
  await page.click('.bp-ghost');
  await page.waitForSelector('.bp-modal');
  s = await store();
  log('draft offer:', JSON.stringify(s.offer), 'steps', s.steps);
  await shot('05-draft-modal');

  // Scripted day-1 hand should include the Vestibule.
  const vest = await page.$('.bp-card:has-text("Vestibule")');
  if (!vest) { fail('no Vestibule in the scripted first draft'); throw new Error('stop'); }
  await vest.click();

  // 4. The Vestibule (anagram). RoomPage → AnagramView.
  await page.waitForSelector('.mic--vestibule');
  s = await store();
  const puzzleId = s.activeRoom?.puzzleId;
  log('entered room:', JSON.stringify(s.activeRoom), 'steps', s.steps);
  const puzzle = anagramPool.find((p) => p.id === puzzleId);
  if (!puzzle) { fail(`puzzle ${puzzleId} not found in pool`); throw new Error('stop'); }
  await shot('06-vestibule');

  // 4a. Refusal: a wrong full arrangement. Post-fix economy (micro finding 8):
  // the Vestibule is the front door, not a toll booth — every refusal is FREE
  // (weight 0), with Staircase-register copy.
  const before = (await store()).steps;
  const wrong = wrongArrangement(puzzle.rounds[0]);
  if (wrong) {
    await placeAndSubmit(wrong);
    const after = (await store()).steps;
    log(`refusal: steps ${before} -> ${after}`);
    if (after !== before) fail(`expected FREE refusal (weight 0), saw ${before} -> ${after}`);
    await shot('07-mistake');
    await clearSlots();
  } else {
    log('every arrangement is a word; skipping the deliberate mistake');
  }

  // 4b. Solve every round.
  for (let r = 0; r < puzzle.rounds.length; r++) {
    const preSteps = (await store()).steps;
    await placeAndSubmit(puzzle.rounds[r].answer.toUpperCase());
    await page.waitForTimeout(700);
    const done = await page.$('.mic-done');
    if (r === puzzle.rounds.length - 1) {
      if (!done) fail('vestibule did not resolve after final round');
      const post = (await store()).steps;
      log(`solved: steps ${preSteps} -> ${post} (refund visible)`);
      if (post <= preSteps) fail('no step refund on solve');
      await shot('08-solved');
    }
  }

  // Step back out.
  await page.click('text=Step back out');
  await page.waitForSelector('.bp-sheet');
  s = await store();
  log('back on blueprint at', JSON.stringify(s.playerCell), 'steps', s.steps);

  // 5. Hunt a parlor room across a few drafts (prefer parlor > utility >
  //    mystery; abandon puzzle rooms immediately). Stop as soon as we visit.
  let visited = false;
  for (let attempt = 0; attempt < 10 && !visited; attempt++) {
    s = await store();
    if (s.phase !== 'exploring' || s.steps < 6) break; // keep dusk for the pacing beat
    const ghost = await page.$('.bp-ghost');
    if (!ghost) {
      // No draftable door from here — take a step and look again.
      const walk = await page.$('.bp-walk');
      if (!walk) break;
      await walk.click();
      await page.waitForTimeout(150);
      continue;
    }
    await ghost.click();
    const opened = await page.waitForSelector('.bp-modal', { timeout: 4000 }).catch(() => null);
    if (!opened) continue;
    s = await store();
    const cards = s.offer ?? [];
    const pick =
      cards.find((c) => c.category === 'parlor') ??
      cards.find((c) => c.category === 'utility' && c.gemCost <= s.gems) ??
      cards.find((c) => c.category === 'mystery' && c.gemCost <= s.gems) ??
      cards.find((c) => c.gemCost === 0);
    if (!pick) { await page.click('.bp-modal__foot .bp-btn--quiet'); continue; }
    log(`draft ${attempt}: taking ${pick.id} (${pick.category})`);
    await page.click(`.bp-card:has-text("${pick.name}")`);
    await page.waitForTimeout(600);
    s = await store();
    if (s.activeRoom) {
      // A puzzle room — leave it for tomorrow (host-level abandon, AAA 4.13).
      await page.waitForSelector('.room-host');
      await page.click('text=Leave it for tomorrow');
      await page.waitForSelector('.bp-sheet');
    } else if (pick.category === 'parlor') {
      const visitBtn = await page.waitForSelector('.bp-foot__actions .bp-btn:has-text("Call on")', { timeout: 4000 }).catch(() => null);
      if (visitBtn) {
        await visitBtn.click();
        await playScene('09-parlor-visit');
        visited = true;
        log('visited a character in', pick.id);
      }
    } else if (pick.category === 'mystery') {
      s = await store();
      log('mystery room drafted; fragments filed:', s.fragments);
      await shot('09b-mystery-fragment');
    }
  }
  if (!visited) log('no parlor drafted in 6 tries (Bramble morning beat was the character visit)');

  // 6. Burn the rest of the day: pace between the current cell and a
  //    neighbor until dusk falls (each walk −1; dusk fires automatically).
  for (let i = 0; i < 60; i++) {
    s = await store();
    if (s.phase !== 'exploring') break;
    const walk = await page.$('.bp-walk');
    if (!walk) { fail('no walkable neighbor while burning steps'); break; }
    await walk.click();
    await page.waitForTimeout(120);
  }
  s = await store();
  log('after pacing: phase', s.phase, 'steps', s.steps);
  if (s.phase !== 'dusk' && s.phase !== 'night') fail(`expected dusk/night, got ${s.phase}`);

  // 7. Dusk veil → night digest.
  if (s.phase === 'dusk') {
    await page.waitForSelector('.chr-dusk');
    await page.waitForTimeout(1200);
    await shot('10-dusk-veil');
    await page.click('.chr-dusk__skip');
  }
  await page.waitForSelector('.chr-scene');
  await page.waitForTimeout(400);
  s = await store();
  log('night: phase', s.phase);
  await shot('11-night-digest');

  // 8. Turn the page: tomorrow's morning proves the loop closes.
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.chr-scene__title');
  s = await store();
  log('next day:', s.dayNum, s.phase, 'steps', s.steps);
  if (s.dayNum !== 2 || s.phase !== 'morning') fail('day did not roll to morning 2');
  await shot('12-day2-morning');

  if (errors.length) fail('console/page errors: ' + errors.slice(0, 5).join(' | '));
  log(process.exitCode ? 'DONE WITH FAILURES' : 'DONE — full day played start to dusk and into day 2');
} catch (e) {
  fail(e.message);
  await shot('99-failure').catch(() => {});
} finally {
  await browser.close();
}
