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
 *   - The Counting House (sudoku) is entered and played.
 *
 * ROUND 5: the Counting House pass follows the rewritten play model — pencil
 * marks are free, a VISIBLE clash is refused but free, a board-legal figure
 * lands free (right or wrong), "Balance the books" is the one priced claim and
 * is free to repeat on an unchanged leaf, and consulting a FIGURE is strictly
 * dearer than the claim (or guessing would be the cheap oracle again).
 *
 * Uses system Edge (channel 'msedge') — NEVER downloads playwright browsers.
 * Exactly ONE browser instance.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round6');
mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:4173/LexiconManor/';
const cipherPool = JSON.parse(readFileSync(resolve(root, 'content/generated/cipher.json'), 'utf8'));
const sudokuPool = JSON.parse(readFileSync(resolve(root, 'content/generated/sudoku.json'), 'utf8'));

/**
 * ROUND 6 CORRECTION. This read `SANCTUM_ROW = 6` and asserted day 1 never
 * touched it — but row 6 is the SEALED SANCTUM ITSELF, a cell the player never
 * stands in and the drafter never offers. The storey that actually matters is
 * the LANDING at row 5, where the door is and where a word may be spoken. The
 * old constant therefore asserted something that was true for free, which is
 * how the economy shipped a 41.5% day-1 reach against a published <8%.
 *
 * Kept in lockstep with the engine rather than re-typed: SANCTUM_DOOR_CELL is
 * the one place the door's cell is declared (engine/manor/grid.ts), so if it
 * moves, this smoke pass moves with it instead of silently checking a storey
 * nobody enters.
 */
const typesSrc = readFileSync(resolve(root, 'src/engine/types.ts'), 'utf8');
const sanctumRow = Number(
  /SANCTUM_CELL\s*:\s*Cell\s*=\s*\{[^}]*row:\s*(\d+)/.exec(typesSrc)?.[1],
);
if (!Number.isInteger(sanctumRow)) {
  console.error('[smoke] FAIL: could not read SANCTUM_CELL from engine/types.ts');
  process.exit(1);
}
// grid.ts: SANCTUM_DOOR_CELL.row === SANCTUM_CELL.row - 1. The landing.
const SANCTUM_LANDING_ROW = sanctumRow - 1;

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

/**
 * ROUND 7: drain the campaign-moment seals before a map interaction.
 *
 * `.mom-layer` is a fixed overlay and its seal genuinely intercepts pointer
 * events — that is the design (a moment is meant to be tapped away). By the
 * time this pass reaches the padlock it has solved rooms, visited a parlor and
 * banked a keepsake, so four seals are stacked and Playwright's actionability
 * check correctly refuses to click through them. This is NOT a bug being
 * papered over: the seals are dismissed the way a player dismisses them, one
 * tap each, and the pass asserts afterwards that the map control it wanted is
 * the thing that answers. Draining is only ever done when the moment is not
 * the subject of the assertion.
 */
const drainMoments = async (limit = 8) => {
  for (let i = 0; i < limit; i++) {
    const gone = await page.evaluate(() => {
      const m = document.querySelector('.mom');
      if (!m) return true;
      m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      m.click?.();
      return false;
    });
    if (gone) return i;
    await page.waitForTimeout(350);
  }
  return limit;
};
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
  // ROUND 6: the Darkroom's letter keys commit on RELEASE (`onClick`), not on
  // pointerdown — a touch-down commit could not be escaped by sliding off, and
  // the room mixed two commit idioms (its reveal button was already onClick).
  // Dispatching pointerdown here would now type nothing at all, so this line
  // is load-bearing evidence that the fix is live rather than a comment.
  await key.click();
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
      await page.click('text=Step away');
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
  log(`day-1 high-water row: ${maxRow} (Sanctum LANDING is row ${SANCTUM_LANDING_ROW})`);
  if (maxRow >= SANCTUM_LANDING_ROW) {
    fail(`day 1 reached the Sanctum landing (row ${maxRow}) — the climb is not priced`);
  } else {
    ok(`day 1 topped out at row ${maxRow}; the Sanctum landing stayed out of reach`);
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
  if (!wrong) { fail("no visible-clash figure available on this leaf"); throw new Error("stop"); }
  log(`cell ${blank}: true figure ${answer}, visible clash ${wrong}`);

  const selectCell = async (i) => {
    await page.locator('.ch-cell').nth(i).dispatchEvent('pointerdown');
    await page.waitForTimeout(80);
  };
  const pressKey = async (d) => {
    await page.locator(`.ch-key--fig`).nth(d - 1).click();
    await page.waitForTimeout(150);
  };
  const stepsNow = async () => (await store()).steps;

  // ═══ ROUND 5 CONTRACT ═══ The claim moved OFF the ink and onto a verb.
  // Checking every ink against the solution sold a correctness oracle at the
  // price of the sanctioned hint, and at a bivalue cell it resolved the cell
  // outright — so every level-2/3 technique the tier ladder is built on could
  // be bisected instead of deduced. What this smoke pass now pins:
  //   9a pencil marks are free · 9b a VISIBLE clash is refused but FREE ·
  //   9c a board-legal figure lands free, right or wrong · 9d "Balance the
  //   books" is the one priced claim · 9e consulting a FIGURE is the dear one.
  const PENCIL_TOGGLE = '.ch-tools--free .ch-tool:first-child';
  const BALANCE = '.ch-tools--priced .ch-tool:nth-child(1)';
  const CONSULT = '.ch-tools--priced .ch-tool:nth-child(3)';

  // 9a. Pencil marks are unlimited, silent and FREE.
  await selectCell(blank);
  await page.click(PENCIL_TOGGLE);                   // Pencil — on
  const prePencil = await stepsNow();
  await pressKey(answer);
  await pressKey(wrong);
  await pressKey((wrong % 9) + 1);
  const postPencil = await stepsNow();
  log(`pencilled 3 figures: steps ${prePencil} -> ${postPencil}`);
  if (postPencil !== prePencil) fail(`pencil marks must be free, saw ${prePencil} -> ${postPencil}`);
  else ok('pencil marks are free and silent — thinking costs nothing');
  await shot('14-counting-house-pencil');

  // 9b. Ink a VISIBLE clash: the leaf already showed her that figure standing
  //     in a peer, so it is a dead letter — shake + reason, nothing lands, and
  //     NOTHING is charged (AAA 3.2 / R.1).
  await page.click(PENCIL_TOGGLE);                   // Pencil — off
  await selectCell(blank);
  const preClash = await stepsNow();
  await pressKey(wrong);
  await page.waitForTimeout(400);
  const postClash = await stepsNow();
  const landed = await page.locator('.ch-cell').nth(blank).locator('.ch-cell__fig').count();
  log(`inked a visible clash (${wrong}): steps ${preClash} -> ${postClash}, figure landed: ${landed > 0}`);
  if (postClash !== preClash) fail(`a pre-warned clash must be free, saw ${preClash} -> ${postClash}`);
  else ok('a visible clash is a free dead letter — the board warned her first');
  if (landed > 0) fail('the refused figure landed on the leaf');
  else ok('the refused figure never reached the ledger');
  await shot('15-counting-house-refused');

  // 9c. Ink the true figure: it is free and it stays.
  await selectCell(blank);
  const preRight = await stepsNow();
  await pressKey(answer);
  await page.waitForTimeout(300);
  const postRight = await stepsNow();
  const inked = await page.locator('.ch-cell').nth(blank).locator('.ch-cell__fig').textContent().catch(() => null);
  log(`inked the true figure (${answer}): steps ${preRight} -> ${postRight}, cell now "${inked}"`);
  if (String(inked) !== String(answer)) fail(`true figure did not land (saw "${inked}")`);
  else ok('the true figure inks and stays');
  if (postRight !== preRight) fail(`inking must be free, saw ${preRight} -> ${postRight}`);
  else ok('inking is free — the claim is a verb, not a figure');

  // 9d. "Balance the books" is the room's ONE priced claim, and weighing the
  //     identical leaf twice is free (never charge twice for one claim).
  const preBalance = await stepsNow();
  await page.click(BALANCE);
  await page.waitForTimeout(400);
  const postBalance = await stepsNow();
  log(`balanced the books: steps ${preBalance} -> ${postBalance}`);
  if (postBalance >= preBalance) fail('balancing the books must cost a claim');
  else ok(`balancing the books costs ${preBalance - postBalance} steps`);
  await shot('16a-counting-house-balance');
  await page.click(BALANCE);
  await page.waitForTimeout(400);
  const postRebalance = await stepsNow();
  if (postRebalance !== postBalance) fail('an identical re-balance must be free');
  else ok('weighing the identical leaf twice is free');

  // 9e. Consulting a FIGURE is the dead-end button — dearer than the claim.
  const preHint = await stepsNow();
  await page.click(CONSULT);
  await page.waitForTimeout(400);
  const postHint = await stepsNow();
  log(`consulted a figure: steps ${preHint} -> ${postHint}`);
  if (postHint >= preHint) fail('consulting a figure must cost a hint');
  else if (preHint - postHint <= preBalance - postBalance) {
    fail(`consulting a figure (${preHint - postHint}) must cost MORE than a claim `
      + `(${preBalance - postBalance}) — otherwise the oracle is the cheap option`);
  } else ok(`consult costs ${preHint - postHint} steps, dearer than the claim`);
  await shot('16-counting-house-consult');

  await page.waitForTimeout(200);
  await shot('17-counting-house-played');

  // -------------------------------------------------------------------------
  // 10. THE PADLOCK (AAA 4.6 / round 5). The economy's hardest gate must
  //     refuse for FREE: no key → no offer, no ledger entry, no step. This is
  //     the rule that stops a player paying to walk up to a door she cannot
  //     read, so it is asserted at the ledger, not just at the step meter.
  //
  //     Locks only bite on rows 4–6 and only on DRAFT targets (a placed room
  //     is always walkable), so we plant a room high in the house, stand in
  //     it, and empty her pockets — then look for a padlocked door she cannot
  //     pay for. We scan candidate cells because the roll is seeded: any given
  //     cell may legitimately be unlocked.
  // -------------------------------------------------------------------------
  await page.click('.room-host__footer .btn').catch(() => {});
  await page.waitForTimeout(400);
  await page.waitForSelector('.bp-sheet');

  const planted = await page.evaluate(() => {
    const st = window.__manorStore.getState();
    // Rows 5 then 4: row 6 doors lock at 80%, row 5 at 55%.
    for (const row of [5, 4]) {
      for (let col = 0; col < 5; col++) {
        const cell = { col, row };
        const key = `${col},${row}`;
        window.__manorStore.setState({
          currencies: { ...st.currencies, keys: 0 },
          manor: {
            ...st.manor,
            playerCell: cell,
            rooms: {
              ...st.manor.rooms,
              [key]: {
                cardId: 'reading-nook', cell, doors: ['N', 'S', 'E', 'W'],
                solved: true, kind: 'parlor', puzzleId: undefined,
              },
            },
          },
        });
        return key; // one plant is enough; the DOM tells us if it locked
      }
    }
    return null;
  });
  await page.waitForTimeout(300);

  // Find a padlocked door she cannot pay for. If this plant did not roll a
  // lock, walk the other candidate cells until one does.
  let lockedGhost = await page.$('.bp-ghost--locked.bp-ghost--shut');
  if (!lockedGhost) {
    for (const [col, row] of [[1, 5], [2, 5], [3, 5], [4, 5], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4]]) {
      await page.evaluate(([c, r]) => {
        const st = window.__manorStore.getState();
        const cell = { col: c, row: r };
        window.__manorStore.setState({
          currencies: { ...st.currencies, keys: 0 },
          manor: {
            ...st.manor,
            playerCell: cell,
            rooms: {
              ...st.manor.rooms,
              [`${c},${r}`]: {
                cardId: 'reading-nook', cell, doors: ['N', 'S', 'E', 'W'],
                solved: true, kind: 'parlor', puzzleId: undefined,
              },
            },
          },
        });
      }, [col, row]);
      await page.waitForTimeout(200);
      lockedGhost = await page.$('.bp-ghost--locked.bp-ghost--shut');
      if (lockedGhost) break;
    }
  }

  if (!lockedGhost) {
    fail('no padlocked door found anywhere on rows 4–5 — the padlock is not reachable');
  } else {
    const before = await page.evaluate(() => {
      const s = window.__manorStore.getState();
      return { steps: s.stepsRemaining(), ledger: s.ledger.entries.length, keys: s.currencies.keys };
    });
    log(`padlock: standing at ${planted} with ${before.keys} keys, ${before.steps} steps, `
      + `${before.ledger} ledger entries`);

    // ROUND 6: the ghost used to carry aria-disabled="true", which lied — the
    // control genuinely answers a tap (it names the storey, the key cost and
    // "nothing was spent"), and ARIA that contradicts behaviour invites AT to
    // skip the one control the player most needs explained. The attribute is
    // gone, so this is now a real click through the a11y gate, not a dispatch.
    const ariaDisabled = await lockedGhost.getAttribute('aria-disabled');
    if (ariaDisabled) fail(`the padlock still claims aria-disabled="${ariaDisabled}" while answering taps`);
    else ok('the padlock does not lie about being disabled — it answers the tap');
    // Put the stacked campaign seals away first, then assert the PADLOCK is
    // what the tap lands on — otherwise this measures the moment layer.
    const drained = await drainMoments();
    if (drained) log(`padlock: dismissed ${drained} campaign moment(s) before the tap`);
    const hit = await lockedGhost.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el.contains(top) || top === el ? 'self' : (top?.className ?? 'null');
    });
    if (hit !== 'self') fail(`the padlocked door is covered by "${hit}" — the tap cannot reach it`);
    else ok('the padlocked door hit-tests as itself');
    await lockedGhost.click();
    await page.waitForTimeout(150);
    const shrugged = await page.$('.bp-padlock-slot--refused');
    await shot('18-padlock-refused');
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const s = window.__manorStore.getState();
      return {
        steps: s.stepsRemaining(),
        ledger: s.ledger.entries.length,
        offer: s.draftOffer ? 1 : 0,
      };
    });
    log(`padlock: after tapping — steps ${after.steps}, ledger ${after.ledger}, offer ${after.offer}`);

    if (after.steps !== before.steps) {
      fail(`a padlocked door charged ${before.steps - after.steps} steps — refusal must be free`);
    } else ok('a padlocked door refuses without charging a step');

    if (after.ledger !== before.ledger) {
      fail(`a padlocked door wrote ${after.ledger - before.ledger} ledger entries — refusal must not be ledgered`);
    } else ok('a padlocked door writes nothing to the ledger');

    if (after.offer) fail('a padlocked door opened a draft offer with no key in her pocket');
    else ok('a padlocked door opens no offer without a key');

    if (!shrugged) fail('the padlock refused silently — no shrug, no signal (AAA 3.2)');
    else ok('the padlock shrugs, so the refusal is visible');
  }

  if (errors.length) fail('console/page errors: ' + errors.slice(0, 5).join(' | '));
  log(process.exitCode
    ? 'DONE WITH FAILURES'
    : 'DONE — full day played into day 2, the Counting House played through, and the padlock refused for free');
} catch (e) {
  fail(e.message);
  await shot('99-failure').catch(() => {});
} finally {
  await browser.close();
}
