/**
 * Integration smoke test: drive one full in-game day through the REAL UI.
 * front step → morning (Bramble) → blueprint → draft Darkroom → free probe
 * (blank develop, steps hold) → solve (steps refund) → parlor visit / Dewey →
 * burn steps → dusk veil → night digest → day 2.
 *
 * ROUND 4 additions:
 *   - Shots land in docs/shots/round4/.
 *   - THE NEW TENSION IS ASSERTED, not just narrated. The economy overhaul
 *     prices the climb (MOVE_COST_BY_ROW −1…−5) against an 18-step base
 *     budget, so a bare ascent costs more than the whole day. Day 1 must
 *     therefore NOT reach the Sanctum row (row 6); we track the high-water
 *     row across the entire day and fail if it touches the top.
 *   - The Counting House (sudoku) is entered and played: pencil marks are
 *     free and silent, an inked contradiction is a costed claim that never
 *     lands on the leaf, and consulting the ledger is a hint.
 *
 * Uses system Edge (channel 'msedge') — NEVER downloads playwright browsers.
 * Exactly ONE browser instance.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round4');
mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:4173/LexiconManor/';
const cipherPool = JSON.parse(readFileSync(resolve(root, 'content/generated/cipher.json'), 'utf8'));
const sudokuPool = JSON.parse(readFileSync(resolve(root, 'content/generated/sudoku.json'), 'utf8'));

/** The Sanctum sits at the top of a 5×7 manor. Day 1 must not get here. */
const SANCTUM_ROW = 6;

const log = (...a) => console.log('[smoke]', ...a);
const fail = (msg) => { console.error('[smoke] FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('[smoke]   ✓', msg);

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
    keys: s.currencies.keys,
    fragments: s.volume.foundFragmentIds.length,
    ledgerLast: s.ledger.entries.slice(-3),
    talked: s.talkedToday,
  };
});

// High-water mark for the climb, sampled every time we read the store.
let maxRow = 0;
const sample = async () => {
  const s = await store();
  if (s.playerCell) maxRow = Math.max(maxRow, s.playerCell.row);
  return s;
};

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

/** cipher letter → plain letter truth table for a shipped Darkroom puzzle. */
function truthOf(puzzle) {
  const map = {};
  for (let i = 0; i < puzzle.ciphertext.length; i++) {
    const c = puzzle.ciphertext[i];
    if (/[A-Z]/.test(c)) map[c] = puzzle.plaintext[i];
  }
  return map;
}

/** Distinct cipher letters in first-appearance order. */
function cipherLetters(puzzle) {
  return [...new Set([...puzzle.ciphertext].filter((c) => /[A-Z]/.test(c)))];
}

/** Select the cell for a cipher letter, then pencil the given plain letter. */
async function pencilLetter(cipherCh, plainCh) {
  const cell = await page.$(`.dk-cell:not(.dk-cell--locked):has(.dk-cell__cipher:text-is("${cipherCh}"))`);
  if (!cell) { fail(`no selectable cell for cipher letter ${cipherCh}`); return; }
  await cell.dispatchEvent('pointerdown');
  await page.waitForTimeout(50);
  const key = await page.$(`.mic-key:text-is("${plainCh}")`);
  if (!key) { fail(`no key for plain letter ${plainCh}`); return; }
  await key.dispatchEvent('pointerdown');
  await page.waitForTimeout(50);
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
  let s = await sample();
  const dayOneBudget = s.steps;
  log('after morning:', s.phase, 'steps', s.steps);
  await shot('04-blueprint-day1');

  // The lean-budget premise of the whole overhaul (AAA 4.10 levers).
  if (dayOneBudget > 24) fail(`day-1 budget ${dayOneBudget} looks pre-overhaul (expected ~18)`);
  else ok(`day-1 budget is lean: ${dayOneBudget} steps`);

  // 3. Draft: open the first gilt door.
  await page.click('.bp-ghost');
  await page.waitForSelector('.bp-modal');
  s = await sample();
  log('draft offer:', JSON.stringify(s.offer), 'steps', s.steps);
  await shot('05-draft-modal');

  // Scripted day-1 hand should include the Darkroom (post-cull: the Vestibule
  // it replaced was an anagram room and no longer exists).
  const dark = await page.$('.bp-card:has-text("Darkroom")');
  if (!dark) { fail('no Darkroom in the scripted first draft'); throw new Error('stop'); }
  await dark.click();

  // 4. The Darkroom (cipher). RoomPage → CipherView.
  await page.waitForSelector('.mic--darkroom');
  s = await sample();
  const puzzleId = s.activeRoom?.puzzleId;
  log('entered room:', JSON.stringify(s.activeRoom), 'steps', s.steps);
  const puzzle = cipherPool.find((p) => p.id === puzzleId);
  if (!puzzle) { fail(`puzzle ${puzzleId} not found in pool`); throw new Error('stop'); }
  await shot('06-darkroom');

  // 4a. Free probe: developing with blanks is thinking, not a claim — the
  // nudge toast appears and the step meter must not move (weight 0, AAA 3.2).
  const before = (await store()).steps;
  await page.click('.mic-btn--primary');
  await page.waitForTimeout(400);
  const after = (await store()).steps;
  log(`blank develop: steps ${before} -> ${after}`);
  if (after !== before) fail(`expected FREE blank develop (weight 0), saw ${before} -> ${after}`);
  else ok('blank develop is free — exploration costs nothing');
  await shot('07-free-probe');

  // 4b. Pencil the full truth table (reveals arrive pre-locked), then develop.
  const truth = truthOf(puzzle);
  const preSteps = (await store()).steps;
  for (const c of cipherLetters(puzzle)) {
    if (puzzle.reveals.includes(c)) continue; // pre-developed and locked
    await pencilLetter(c, truth[c]);
  }
  await page.click('.mic-btn--primary');
  await page.waitForTimeout(900);
  const done = await page.$('.mic-done');
  if (!done) fail('darkroom did not resolve after a true develop');
  const post = (await store()).steps;
  log(`solved: steps ${preSteps} -> ${post} (refund visible)`);
  if (post <= preSteps) fail('no step refund on solve');
  else ok(`solve refunds ${post - preSteps} steps`);
  await shot('08-darkroom-solved');

  // Step back out.
  await page.click('text=Step back out');
  await page.waitForSelector('.bp-sheet');
  s = await sample();
  log('back on blueprint at', JSON.stringify(s.playerCell), 'steps', s.steps);

  // 5. Hunt a parlor room across a few drafts (prefer parlor > utility >
  //    mystery; abandon puzzle rooms immediately). Stop as soon as we visit.
  let visited = false;
  for (let attempt = 0; attempt < 10 && !visited; attempt++) {
    s = await sample();
    if (s.phase !== 'exploring' || s.steps < 6) break; // keep dusk for the pacing beat
    const ghost = await page.$('.bp-ghost');
    if (!ghost) {
      const walk = await page.$('.bp-walk');
      if (!walk) break;
      await walk.click();
      await page.waitForTimeout(150);
      continue;
    }
    await ghost.click();
    const opened = await page.waitForSelector('.bp-modal', { timeout: 4000 }).catch(() => null);
    if (!opened) continue;
    s = await sample();
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
    s = await sample();
    if (s.activeRoom) {
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
      s = await sample();
      log('mystery room drafted; fragments filed:', s.fragments);
      await shot('09b-mystery-fragment');
    }
  }
  if (!visited) log('no parlor drafted (Bramble morning beat was the character visit)');

  // 6. Burn the rest of the day: pace between the current cell and a
  //    neighbor until dusk falls. Under the overhaul each step out of the
  //    ground floor costs progressively more, so this ends fast.
  for (let i = 0; i < 80; i++) {
    s = await sample();
    if (s.phase !== 'exploring') break;
    const walk = await page.$('.bp-walk');
    if (!walk) { fail('no walkable neighbor while burning steps'); break; }
    await walk.click();
    await page.waitForTimeout(120);
  }
  s = await sample();
  log('after pacing: phase', s.phase, 'steps', s.steps);
  if (s.phase !== 'dusk' && s.phase !== 'night') fail(`expected dusk/night, got ${s.phase}`);

  // 6a. THE NEW TENSION (AAA 4.10c/4.10d). Before the overhaul a day-1 player
  //     could stroll to the top. Now the climb is the expense and the Sanctum
  //     row is a campaign event, not a Tuesday.
  log(`day-1 high-water row: ${maxRow} (Sanctum row is ${SANCTUM_ROW})`);
  if (maxRow >= SANCTUM_ROW) {
    fail(`day 1 reached the Sanctum row (${maxRow}) — the climb is not priced`);
  } else {
    ok(`day 1 topped out at row ${maxRow}; the Sanctum row stayed out of reach`);
  }

  // 7. Dusk veil → night digest.
  if (s.phase === 'dusk') {
    await page.waitForSelector('.chr-dusk');
    await page.waitForTimeout(1200);
    await shot('10-dusk-veil');
    await page.click('.chr-dusk__skip');
  }
  await page.waitForSelector('.chr-scene');
  await page.waitForTimeout(400);
  s = await sample();
  log('night: phase', s.phase);
  await shot('11-night-digest');

  // 8. Turn the page: tomorrow's morning proves the loop closes.
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.chr-scene__title');
  s = await sample();
  log('next day:', s.dayNum, s.phase, 'steps', s.steps);
  if (s.dayNum !== 2 || s.phase !== 'morning') fail('day did not roll to morning 2');
  await shot('12-day2-morning');

  // -------------------------------------------------------------------------
  // 9. THE COUNTING HOUSE (sudoku) — the round-4 room.
  //    The scripted day-1 hand is library/kitchen/darkroom, so the ledger room
  //    is not reliably offered inside one seeded day. We place the card on the
  //    board directly and then play it entirely through the real UI: the view,
  //    the adapter, the economy ledger and the step meter are all live.
  //
  //    NOTE: RoomHost re-selects the puzzle from `roomSeed(daySeed, cellKey)`
  //    rather than from PlacedRoom.puzzleId (the two agree in the real game
  //    because placement uses the same seed stream). So we do NOT assume which
  //    leaf we got — we read the givens back out of the DOM and match them
  //    against the shipped pool. That doubles as proof the rendered leaf is a
  //    real shipped board and not something the view invented.
  // -------------------------------------------------------------------------
  await page.click('.chr-scene__btn').catch(() => {});
  await page.waitForTimeout(500);
  if (await page.$('.dlg')) await playScene(null);
  await page.waitForSelector('.bp-sheet');

  const placedAt = await page.evaluate(() => {
    const st = window.__manorStore.getState();
    const cell = st.manor.playerCell;
    const key = `${cell.col},${cell.row}`;
    window.__manorStore.setState({
      manor: {
        ...st.manor,
        rooms: {
          ...st.manor.rooms,
          [key]: {
            cardId: 'counting-house', cell, doors: ['N', 'S', 'E', 'W'],
            solved: false, kind: 'sudoku', puzzleId: undefined,
          },
        },
      },
    });
    window.__manorStore.getState().enterRoom(key);
    return key;
  });
  await page.waitForSelector('.ch');

  // Read the leaf back out of the DOM and identify it in the shipped pool.
  const domGivens = (await page.$$eval('.ch-cell', (els) =>
    els.map((e) => e.querySelector('.ch-cell__fig')?.textContent ?? '.').join('')));
  if (domGivens.length !== 81) fail(`expected an 81-cell leaf, saw ${domGivens.length}`);
  const board = sudokuPool.find((p) => p.givens === domGivens);
  if (!board) { fail('the rendered leaf is not a board in the shipped pool'); throw new Error('stop'); }
  ok(`the rendered leaf is shipped board ${board.id} (tier ${board.tier})`);
  log(`Counting House opened at ${placedAt} with ${board.id} (tier ${board.tier})`);
  await shot('13-counting-house');

  // Pick the first blank cell, its true figure, and a figure that is a
  // GUARANTEED contradiction (one already standing in the same row/column/box).
  const blank = board.givens.indexOf('.');
  const answer = Number(board.solution[blank]);
  const br = Math.floor(blank / 9), bc = blank % 9;
  const peers = [];
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9), c = i % 9;
    const sameBox = Math.floor(r / 3) === Math.floor(br / 3) && Math.floor(c / 3) === Math.floor(bc / 3);
    if (i !== blank && (r === br || c === bc || sameBox)) peers.push(i);
  }
  const wrong = Number(peers.map((i) => board.givens[i]).find((ch) => ch !== '.' && Number(ch) !== answer));
  if (!wrong) { fail('no guaranteed-contradiction figure available on this leaf'); throw new Error('stop'); }
  log(`cell ${blank}: true figure ${answer}, guaranteed contradiction ${wrong}`);

  const selectCell = async (i) => {
    await page.locator('.ch-cell').nth(i).dispatchEvent('pointerdown');
    await page.waitForTimeout(80);
  };
  const pressKey = async (d) => {
    await page.locator(`.ch-key--fig`).nth(d - 1).click();
    await page.waitForTimeout(150);
  };
  const stepsNow = async () => (await store()).steps;

  // 9a. Pencil marks are unlimited, silent and FREE (owner directive: all
  //     exploration is free; only a claim costs).
  await selectCell(blank);
  await page.click('.ch-tool');                      // Pencil — on
  const prePencil = await stepsNow();
  await pressKey(answer);
  await pressKey(wrong);
  await pressKey((wrong % 9) + 1);
  const postPencil = await stepsNow();
  log(`pencilled 3 figures: steps ${prePencil} -> ${postPencil}`);
  if (postPencil !== prePencil) fail(`pencil marks must be free, saw ${prePencil} -> ${postPencil}`);
  else ok('pencil marks are free and silent — thinking costs nothing');
  await shot('14-counting-house-pencil');

  // 9b. Ink a contradiction: a deliberate claim. It costs, and the false
  //     figure never lands on the leaf (AAA R.3 — costs read as spending).
  await page.click('.ch-tool');                      // Pencil — off
  await selectCell(blank);
  const preWrong = await stepsNow();
  await pressKey(wrong);
  await page.waitForTimeout(400);
  const postWrong = await stepsNow();
  const landed = await page.locator('.ch-cell').nth(blank).locator('.ch-cell__fig').count();
  log(`inked a contradiction (${wrong}): steps ${preWrong} -> ${postWrong}, figure landed: ${landed > 0}`);
  if (postWrong >= preWrong) fail('an inked contradiction must cost steps');
  else ok(`contradiction costs ${preWrong - postWrong} steps`);
  if (landed > 0) fail('the refused figure landed on the leaf');
  else ok('the refused figure never reached the ledger');
  await shot('15-counting-house-refused');

  // 9c. Ink the true figure: a correct claim is free and stays.
  await selectCell(blank);
  const preRight = await stepsNow();
  await pressKey(answer);
  await page.waitForTimeout(300);
  const postRight = await stepsNow();
  const inked = await page.locator('.ch-cell').nth(blank).locator('.ch-cell__fig').textContent().catch(() => null);
  log(`inked the true figure (${answer}): steps ${preRight} -> ${postRight}, cell now "${inked}"`);
  if (String(inked) !== String(answer)) fail(`true figure did not land (saw "${inked}")`);
  else ok('the true figure inks and stays');
  if (postRight !== preRight) fail(`a correct claim must be free, saw ${preRight} -> ${postRight}`);
  else ok('a correct claim is free');

  // 9d. Consulting the ledger is a hint — costed, and it fills a cell.
  const preHint = await stepsNow();
  await page.click('.ch-tools .ch-tool:nth-child(2)');
  await page.waitForTimeout(400);
  const postHint = await stepsNow();
  log(`consulted the ledger: steps ${preHint} -> ${postHint}`);
  if (postHint >= preHint) fail('consulting the ledger must cost a hint');
  else ok(`consult costs ${preHint - postHint} steps`);
  await shot('16-counting-house-consult');

  await page.waitForTimeout(200);
  await shot('17-counting-house-played');

  if (errors.length) fail('console/page errors: ' + errors.slice(0, 5).join(' | '));
  log(process.exitCode ? 'DONE WITH FAILURES' : 'DONE — full day played into day 2, and the Counting House played through');
} catch (e) {
  fail(e.message);
  await shot('99-failure').catch(() => {});
} finally {
  await browser.close();
}
