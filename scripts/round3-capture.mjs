/**
 * Round-3 comprehensive screenshot tour of Lexicon Manor.
 * System Edge only (channel 'msedge'), ONE browser instance, 390x844 @2x.
 * Shots → docs/shots/round3/. Uses window.__manorStore to seed states fast;
 * puzzle answers precomputed in plan.json (scripts/round3-plan.ts).
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round3');
const BASE = 'http://localhost:4173/LexiconManor/';
const plan = JSON.parse(readFileSync(resolve(SHOTS, 'plan.json'), 'utf8'));
const anagramPool = JSON.parse(readFileSync(resolve(root, 'content/generated/anagram.json'), 'utf8'));

const log = (...a) => console.log('[cap]', ...a);
const missed = [];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(15000);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

const shot = (name) => page.screenshot({ path: resolve(SHOTS, name + '.png') });
const sleep = (ms) => page.waitForTimeout(ms);

async function section(name, fn) {
  try {
    await fn();
    log('OK', name);
  } catch (e) {
    log('FAIL', name, e.message?.slice(0, 300));
    missed.push(`${name}: ${e.message?.slice(0, 200)}`);
    await shot('zz-fail-' + name.replace(/[^a-z0-9-]/gi, '_')).catch(() => {});
    // Best-effort recovery: close any dialogue/room and return to the sheet.
    await page.evaluate(() => {
      const S = window.__manorStore;
      const st = S.getState();
      if (st.day?.activeRoom) st.leaveRoom();
      S.setState({ draftOffer: null });
      location.hash = '#/manor';
    }).catch(() => {});
    await sleep(400);
  }
}

const store = () => page.evaluate(() => {
  const s = window.__manorStore.getState();
  return {
    phase: s.day?.phase ?? null, dayNum: s.day?.day ?? null,
    steps: s.stepsRemaining(), activeRoom: s.day?.activeRoom ?? null,
    gems: s.currencies.gems,
  };
});

/** Seed a placed room + activeRoom and enter /room. */
async function enterSeededRoom(kind, cardId, key, puzzleId) {
  await page.evaluate(({ kind, cardId, key, puzzleId }) => {
    const S = window.__manorStore;
    const st = S.getState();
    const [col, row] = key.split(',').map(Number);
    const cell = { col, row };
    S.setState({
      manor: {
        ...st.manor,
        rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N', 'E', 'S', 'W'], solved: false, kind, puzzleId } },
        playerCell: cell,
      },
      day: { ...st.day, activeRoom: { cellKey: key, kind, puzzleId, tier: 1 } },
    });
    location.hash = '#/room';
  }, { kind, cardId, key, puzzleId });
  await page.waitForSelector('.room-host');
  await sleep(350);
}

async function leaveRoomToSheet() {
  const done = await page.$('.room-host__footer .btn--primary');
  if (done) await done.click();
  else await page.evaluate(() => window.__manorStore.getState().leaveRoom());
  await page.waitForSelector('.bp-sheet');
  await sleep(250);
}

async function topUpBudget() {
  await page.evaluate(() => {
    const S = window.__manorStore;
    S.setState({ ledger: { ...S.getState().ledger, budget: 900 } });
  });
}

/** Tap through a dialogue scene until it closes. Optionally shoot states. */
async function playSceneWithShots({ midShot, doneShot, choicesShot, endShot, doGift, giftShot }) {
  await page.waitForSelector('.dlg');
  if (midShot) { await sleep(260); await shot(midShot); }
  if (doneShot) {
    await page.waitForSelector('.dlg__advance, .dlg-choices, .dlg .dlg-choice', { timeout: 9000 }).catch(() => {});
    await sleep(250);
    await shot(doneShot);
  }
  let tookChoices = false, tookEnd = false, gifted = false;
  for (let i = 0; i < 80 && (await page.$('.dlg')); i++) {
    const endPrimary = await page.$('.dlg-choice--primary');
    if (endPrimary) {
      if (endShot && !tookEnd) { await sleep(150); await shot(endShot); tookEnd = true; }
      if (doGift && !gifted) {
        const gift = await page.$('.dlg-choice--gift');
        if (gift) {
          await gift.click();
          gifted = true;
          await sleep(700);
          if (giftShot) await shot(giftShot);
          continue; // reaction node plays; keep tapping through
        }
      }
      await endPrimary.click();
      await sleep(250);
      continue;
    }
    const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (choice) {
      if (choicesShot && !tookChoices) { await sleep(150); await shot(choicesShot); tookChoices = true; }
      await choice.click();
      await sleep(300);
      continue;
    }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown');
    await sleep(230);
  }
  if (await page.$('.dlg')) throw new Error('dialogue never closed');
}

// ---------------------------------------------------------------------------
// PHASE A — fresh save, day 1 scripted flow
// ---------------------------------------------------------------------------

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
await page.reload({ waitUntil: 'networkidle' });

await section('front-step', async () => {
  await page.waitForSelector('text=Begin the first day');
  await sleep(300);
  await shot('01-front-step');
});

await section('morning-card', async () => {
  await page.click('text=Begin the first day');
  await page.waitForSelector('.chr-scene');
  await sleep(400);
  await shot('02-morning-card-day1');
});

await section('bramble-morning', async () => {
  await page.click('.chr-scene__btn');
  await playSceneWithShots({
    midShot: '03-bramble-morning-typewriter-mid',
    doneShot: '04-bramble-morning-typewriter-done',
    choicesShot: '05-bramble-morning-choices',
    endShot: '06-bramble-scene-end-gift-offer',
  });
});

await section('blueprint-early', async () => {
  await page.waitForSelector('.bp-sheet');
  // Deterministic seeds for everything that follows + a deep step budget.
  await page.evaluate((seed) => {
    const S = window.__manorStore;
    const st = S.getState();
    S.setState({
      day: { ...st.day, daySeed: seed },
      manor: { ...st.manor, daySeed: seed },
      ledger: { ...st.ledger, budget: 900 },
    });
  }, plan.daySeed);
  await sleep(300);
  await shot('07-blueprint-day1-early');
});

await section('draft-modal-common', async () => {
  await page.click('.bp-ghost');
  await page.waitForSelector('.bp-modal');
  await sleep(350);
  await shot('08-draft-modal-common');
});

await section('vestibule-anagram', async () => {
  const vest = await page.$('.bp-card:has-text("Vestibule")');
  if (!vest) throw new Error('no Vestibule in scripted first draft');
  await vest.click();
  await page.waitForSelector('.mic--vestibule');
  const s = await store();
  const puzzle = anagramPool.find((p) => p.id === s.activeRoom?.puzzleId);
  if (!puzzle) throw new Error('anagram puzzle not found: ' + s.activeRoom?.puzzleId);

  // Mid-play: two tiles placed.
  const tiles = await page.$$('.va-tile:not(.va-tile--used)');
  for (const t of tiles.slice(0, 2)) { await t.dispatchEvent('pointerdown'); await sleep(120); }
  await sleep(200);
  await shot('09-vestibule-anagram-midplay');
  // Take them back.
  for (let i = 0; i < 4; i++) {
    const slot = await page.$('.va-slot--filled');
    if (!slot) break;
    await slot.dispatchEvent('pointerdown');
    await sleep(80);
  }

  // Deliberate mistake: a wrong full arrangement of round 1.
  const acc = new Set(puzzle.rounds[0].accepted.map((w) => w.toUpperCase()));
  const chars = puzzle.rounds[0].answer.toUpperCase().split('');
  const tries = [
    [...chars].reverse().join(''),
    chars.slice(1).concat(chars[0]).join(''),
    chars.slice(-1).concat(chars.slice(0, -1)).join(''),
  ];
  const wrong = tries.find((t) => !acc.has(t));
  if (wrong) {
    for (const ch of wrong) {
      const tile = await page.$(`.va-tile:not(.va-tile--used):text-is("${ch}")`);
      if (tile) { await tile.dispatchEvent('pointerdown'); await sleep(60); }
    }
    await page.click('.mic-btn--primary');
    await page.waitForSelector('.mic-toast--bad', { timeout: 4000 }).catch(() => {});
    await shot('10-vestibule-anagram-mistake-toast');
    for (let i = 0; i < 12; i++) {
      const slot = await page.$('.va-slot--filled');
      if (!slot) break;
      await slot.dispatchEvent('pointerdown');
      await sleep(50);
    }
  }

  // Solve every round.
  for (const round of puzzle.rounds) {
    for (const ch of round.answer.toUpperCase()) {
      const tile = await page.$(`.va-tile:not(.va-tile--used):text-is("${ch}")`);
      if (tile) { await tile.dispatchEvent('pointerdown'); await sleep(50); }
    }
    await page.click('.mic-btn--primary');
    await sleep(700);
  }
  await page.waitForSelector('.mic-done');
  await sleep(400);
  await shot('11-vestibule-anagram-solved');
  await leaveRoomToSheet();
});

// ---------------------------------------------------------------------------
// PHASE B — every remaining room kind: mid-play, mistake toast, solved
// ---------------------------------------------------------------------------

await section('hive-conservatory', async () => {
  await topUpBudget();
  const p = plan.hive;
  await enterSeededRoom('hive', 'conservatory', p.cellKey, p.puzzleId);
  await page.waitForSelector('.anch--conservatory');
  // Mid-play: one found word + one being typed.
  await page.keyboard.type(p.words[p.words.length - 1], { delay: 30 });
  await page.keyboard.press('Enter');
  await sleep(500);
  await page.keyboard.type(p.words[Math.floor(p.words.length / 2)].slice(0, 4), { delay: 40 });
  await sleep(200);
  await shot('12-conservatory-hive-midplay');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
  // Costed mistake: a word with no center letter.
  await page.keyboard.type(p.outer.slice(0, 4).join(''), { delay: 30 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.anch-toast--bad', { timeout: 4000 });
  await shot('13-conservatory-hive-mistake-toast');
  await sleep(700);
  // Solve: longest-first until Full Bloom.
  for (const w of p.words) {
    if (await page.$('.anch-done')) break;
    await page.keyboard.type(w, { delay: 12 });
    await page.keyboard.press('Enter');
    await sleep(280);
  }
  await page.waitForSelector('.anch-done');
  await sleep(500);
  await shot('14-conservatory-hive-solved');
  await leaveRoomToSheet();
});

await section('twistle-gallery', async () => {
  await topUpBudget();
  const p = plan.twistle;
  await enterSeededRoom('twistle', 'gallery', p.cellKey, p.puzzleId);
  await page.waitForSelector('.anch--gallery');
  const tapPath = async (path) => {
    for (const idx of path) { await page.click(`.tw-cell[data-idx="${idx}"]`); await sleep(90); }
  };
  // Mid-play: partial trace of the first word.
  await tapPath(p.solvePaths[0].path.slice(0, 3));
  await sleep(200);
  await shot('15-gallery-twistle-midplay');
  await page.click('.anch-btn:text-is("Clear")');
  await sleep(150);
  // Mistake: a traceable non-word (free probe by design; centerRequired=false here).
  const targets = new Set(p.targetWords);
  let mistakeDone = false;
  for (const cand of [[0, 1, 2, 3], [4, 3, 2, 1], [20, 21, 22, 23], [0, 5, 10, 15]]) {
    const w = cand.map((i) => p.grid[i]).join('');
    if (targets.has(w)) continue;
    await tapPath(cand);
    await page.click('.anch-btn--primary');
    await page.waitForSelector('.anch-toast', { timeout: 3000 }).catch(() => {});
    await shot('16-gallery-twistle-mistake-toast');
    mistakeDone = true;
    break;
  }
  if (!mistakeDone) missed.push('twistle mistake toast: no non-word candidate path');
  await sleep(600);
  // Solve: claim targetCount words.
  for (const { path } of p.solvePaths) {
    if (await page.$('.anch-done')) break;
    await tapPath(path);
    await page.click('.anch-btn--primary');
    await sleep(350);
  }
  await page.waitForSelector('.anch-done');
  await sleep(500);
  await shot('17-gallery-twistle-solved');
  await leaveRoomToSheet();
});

await section('wordweb-library', async () => {
  await topUpBudget();
  const p = plan['word-web'];
  await enterSeededRoom('word-web', 'library', p.cellKey, p.puzzleId);
  await page.waitForSelector('.anch--library');
  const clickWord = async (w) => { await page.click(`.ww-tile:text-is("${w}")`); await sleep(120); };
  // Mid-play: two tiles selected.
  await clickWord(p.groups[0].words[0]);
  await clickWord(p.groups[0].words[1]);
  await shot('18-library-wordweb-midplay');
  // Mistake: one away.
  await clickWord(p.groups[0].words[2]);
  await clickWord(p.mistakeSelection[3]);
  await page.click('.anch-btn--primary');
  await page.waitForSelector('.anch-toast--bad', { timeout: 5000 });
  await shot('19-library-wordweb-mistake-toast');
  await sleep(600);
  await page.click('.anch-btn:text-is("Clear")');
  await sleep(200);
  // Solve all four groups.
  for (const g of p.groups) {
    if (await page.$('.anch-done')) break;
    for (const w of g.words) await clickWord(w);
    await page.click('.anch-btn--primary');
    await sleep(1800);
  }
  await page.waitForSelector('.anch-done');
  await sleep(600);
  await shot('20-library-wordweb-solved');
  await leaveRoomToSheet();
});

await section('forgottenword-study', async () => {
  await topUpBudget();
  const p = plan['forgotten-word'];
  await enterSeededRoom('forgotten-word', 'study', p.cellKey, p.puzzleId);
  await page.waitForSelector('.anch--study');
  // Mid-play: unseal the etymology clue.
  await page.click('.fw-clue .anch-btn');
  await sleep(500);
  await shot('21-study-forgottenword-midplay');
  // Mistake: a wrong whisper.
  await page.fill('.fw-input', p.wrongGuess);
  await page.click('.anch-btn--primary');
  await page.waitForSelector('.anch-toast--bad', { timeout: 4000 });
  await shot('22-study-forgottenword-mistake-toast');
  await sleep(500);
  // Solve.
  await page.fill('.fw-input', p.word);
  await page.click('.anch-btn--primary');
  await page.waitForSelector('.anch-done');
  await sleep(900);
  await shot('23-study-forgottenword-solved');
  await leaveRoomToSheet();
});

await section('cipher-darkroom', async () => {
  await topUpBudget();
  const p = plan.cipher;
  await enterSeededRoom('cipher', 'darkroom', p.cellKey, p.puzzleId);
  await page.waitForSelector('.mic--darkroom');
  const pencil = async (c, plain) => {
    await page.click(`.dk-cell:not(.dk-cell--locked):has(.dk-cell__cipher:text-is("${c}"))`, { strict: false });
    await sleep(90);
    await page.click(`.mic-key:text-is("${plain}")`);
    await sleep(90);
  };
  // Mid-play: first few letters penciled.
  const entries = Object.entries(p.wrongMapping);
  for (const [c, pl] of entries.slice(0, 4)) await pencil(c, pl);
  await sleep(200);
  await shot('24-darkroom-cipher-midplay');
  // Fill the rest of the (deliberately swapped) mapping, then claim.
  for (const [c, pl] of entries.slice(4)) await pencil(c, pl);
  await page.click('.mic-btn--primary');
  await page.waitForSelector('.mic-toast--bad', { timeout: 4000 });
  await shot('25-darkroom-cipher-mistake-toast');
  await sleep(700);
  // Fix the two swapped letters and develop clean.
  for (const c of p.swapped) await pencil(c, p.mapping[c]);
  await page.click('.mic-btn--primary');
  await page.waitForSelector('.mic-done');
  await sleep(1400);
  await shot('26-darkroom-cipher-solved');
  await leaveRoomToSheet();
});

await section('ladder-staircase', async () => {
  await topUpBudget();
  const p = plan.ladder;
  await enterSeededRoom('ladder', 'staircase', p.cellKey, p.puzzleId);
  await page.waitForSelector('.mic--staircase');
  await sleep(300);
  await shot('27-staircase-ladder-midplay');
  // Mistake: a non-word probe (free by design — Wordle's gentle refusal).
  await page.click('.st-edit .st-cell >> nth=0');
  await sleep(120);
  await page.click('.mic-key:text-is("Q")');
  await page.waitForSelector('.mic-toast', { timeout: 4000 });
  await shot('28-staircase-ladder-mistake-toast');
  await sleep(700);
  // Climb the solution.
  for (let r = 1; r < p.solution.length; r++) {
    const cur = p.solution[r - 1], next = p.solution[r];
    const pos = [...cur].findIndex((ch, i) => ch !== next[i]);
    await page.click(`.st-edit .st-cell >> nth=${pos}`);
    await sleep(140);
    await page.click(`.mic-key:text-is("${next[pos]}")`);
    await sleep(450);
  }
  await page.waitForSelector('.mic-done');
  await sleep(500);
  await shot('29-staircase-ladder-solved');
  await leaveRoomToSheet();
});

await section('category-pantry', async () => {
  await topUpBudget();
  const p = plan.category;
  await enterSeededRoom('category', 'pantry', p.cellKey, p.puzzleId);
  await page.waitForSelector('.m2--pantry');
  const submit = async (w) => {
    await page.fill('.m2-input', w);
    await page.click('.m2-btn--primary');
    await sleep(350);
  };
  // Mid-play: one shelved.
  await submit(p.accepted[0]);
  await sleep(300);
  await shot('30-pantry-category-midplay');
  // Mistake: the curated trap.
  if (p.trap) {
    await submit(typeof p.trap === 'string' ? p.trap : p.trap.word);
    await page.waitForSelector('.m2-toast--bad', { timeout: 4000 });
    await shot('31-pantry-category-mistake-toast');
    await sleep(600);
  }
  // Solve: shelve until full.
  for (const w of p.accepted.slice(1)) {
    if (await page.$('.m2-done')) break;
    await submit(w);
  }
  await page.waitForSelector('.m2-done');
  await sleep(500);
  await shot('32-pantry-category-solved');
  await leaveRoomToSheet();
});

await section('crossword-linen', async () => {
  await topUpBudget();
  const p = plan.crossword;
  await enterSeededRoom('crossword', 'linen-closet', p.cellKey, p.puzzleId);
  await page.waitForSelector('.m2--linen');
  const size = p.size;
  const cellsOf = (e) => Array.from({ length: e.answer.length }, (_, i) =>
    e.dir === 'across' ? e.row * size + e.col + i : (e.row + i) * size + e.col);
  const sol = new Map();
  for (const e of p.entries) cellsOf(e).forEach((c, i) => sol.set(c, e.answer[i]));
  const typeCell = async (idx, letter) => {
    await page.click(`.lc-grid > *:nth-child(${idx + 1})`);
    await sleep(80);
    await page.click(`.lc-key:text-is("${letter}")`);
    await sleep(80);
  };
  // Mid-play: first entry filled.
  const first = p.entries[0];
  for (const c of cellsOf(first)) await typeCell(c, sol.get(c));
  await sleep(200);
  await shot('33-linen-closet-crossword-midplay');
  // Fill the rest but leave ONE cell wrong → auto-check → wax marks.
  const allCells = [...sol.keys()];
  const wrongCell = allCells[allCells.length - 1];
  for (const c of allCells) {
    if (cellsOf(first).includes(c) && c !== wrongCell) continue;
    const correct = sol.get(c);
    const letter = c === wrongCell ? (correct === 'X' ? 'Z' : 'X') : correct;
    await typeCell(c, letter);
  }
  await page.waitForSelector('.m2-toast', { timeout: 4000 });
  await shot('34-linen-closet-crossword-mistake-toast');
  await sleep(600);
  // Fix the crease.
  await typeCell(wrongCell, sol.get(wrongCell));
  await page.waitForSelector('.m2-done');
  await sleep(600);
  await shot('35-linen-closet-crossword-solved');
  await leaveRoomToSheet();
});

await section('rhyme-musicroom', async () => {
  await topUpBudget();
  const p = plan.rhyme;
  await enterSeededRoom('rhyme', 'music-room', p.cellKey, p.puzzleId);
  await page.waitForSelector('.m2--music');
  const sing = async (w) => {
    await page.fill('.m2-input', w);
    await page.click('.m2-btn--primary');
    await sleep(400);
  };
  // Mid-play: one rhyme sung.
  await sing(p.rounds[0].accepted[0]);
  await sleep(300);
  await shot('36-music-room-rhyme-midplay');
  // Mistake: the eye-rhyme decoy.
  if (p.decoy) {
    await sing(p.decoy);
    await page.waitForSelector('.m2-toast--bad', { timeout: 4000 });
    await shot('37-music-room-rhyme-mistake-toast');
    await sleep(600);
  }
  // Solve every verse.
  for (const round of p.rounds) {
    for (const w of round.accepted) {
      if (await page.$('.m2-done')) break;
      await sing(w);
    }
    if (await page.$('.m2-done')) break;
  }
  await page.waitForSelector('.m2-done');
  await sleep(500);
  await shot('38-music-room-rhyme-solved');
  await leaveRoomToSheet();
});

// ---------------------------------------------------------------------------
// PHASE C — blueprint mid-day, premium draft, parlor, journal, sanctum,
//           dusk, night, day 2, chronicles
// ---------------------------------------------------------------------------

await section('blueprint-midday', async () => {
  await page.evaluate(() => { location.hash = '#/manor'; });
  await page.waitForSelector('.bp-sheet');
  await sleep(400);
  await shot('39-blueprint-midday-many-rooms');
});

await section('draft-modal-premium', async () => {
  await page.evaluate(() => {
    const S = window.__manorStore;
    const st = S.getState();
    S.setState({
      currencies: { ...st.currencies, gems: 3 },
      draftOffer: {
        atDoor: 'N',
        from: { ...st.manor.playerCell },
        rerolled: false,
        cards: [
          { id: 'study', name: 'The Study', category: 'puzzle', puzzleKind: 'forgotten-word', doorLayouts: [['S']], tierRange: [2, 3], gemCost: 2, rarity: 'rare' },
          { id: 'observatory', name: 'The Observatory', category: 'mystery', doorLayouts: [['S']], tierRange: [2, 3], gemCost: 2, rarity: 'rare' },
          { id: 'drawing-room', name: 'The Drawing Room', category: 'parlor', doorLayouts: [['N', 'S'], ['N', 'E', 'W']], tierRange: [2, 3], gemCost: 1, rarity: 'unusual' },
        ],
      },
    });
  });
  await page.waitForSelector('.bp-modal');
  await sleep(350);
  await shot('40-draft-modal-premium-gem-cards');
  await page.evaluate(() => window.__manorStore.getState().cancelDraft());
  await sleep(200);
});

await section('parlor-posy', async () => {
  await page.evaluate(() => {
    const S = window.__manorStore;
    const st = S.getState();
    const key = '2,1';
    const cell = { col: 2, row: 1 };
    S.setState({
      manor: {
        ...st.manor,
        rooms: { ...st.manor.rooms, [key]: { cardId: 'post-room', cell, doors: ['N', 'E', 'S', 'W'], solved: true, kind: 'parlor' } },
        playerCell: cell,
      },
    });
    location.hash = '#/manor';
  });
  await page.waitForSelector('.bp-foot__actions .bp-btn:has-text("Call on")');
  await page.click('.bp-foot__actions .bp-btn:has-text("Call on")');
  await playSceneWithShots({
    doneShot: '41-parlor-posy-dialogue',
    choicesShot: '42-parlor-posy-choices',
    endShot: '43-parlor-posy-gift-button',
    doGift: true,
    giftShot: '44-parlor-posy-gift-reaction',
  });
});

await section('journal-fragments', async () => {
  await page.evaluate(() => {
    const st = window.__manorStore.getState();
    for (const id of ['v1-d1', 'v1-e1', 'v1-t1', 'v1-d2', 'v1-e2', 'v1-t2']) st.fileFragment(id);
    location.hash = '#/journal';
  });
  await page.waitForSelector('.jrn');
  await sleep(400);
  await shot('45-journal-word-tab-fragments');
  await page.click('.jrn-tabs button:has-text("Engravings")');
  await sleep(400);
  await shot('46-journal-engravings-tab');
});

await section('sanctum', async () => {
  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForSelector('.snc');
  await sleep(500);
  await shot('47-sanctum-door-before-guess');
  await page.fill('.snc-input', 'MEMORY');
  await page.click('.snc-speak');
  await sleep(1600); // the listening beat, then the sigh
  await shot('48-sanctum-wrong-guess-sigh');
});

await section('dusk-night-day2', async () => {
  await page.evaluate(() => { location.hash = '#/manor'; });
  await page.waitForSelector('.bp-sheet');
  await page.evaluate(() => window.__manorStore.getState().endDay('retired-early'));
  await page.waitForSelector('.chr-dusk');
  await sleep(1300);
  await shot('49-dusk-veil');
  await page.click('.chr-dusk__skip');
  await page.waitForSelector('.chr-scene');
  await sleep(500);
  await shot('50-night-digest');
  await page.click('.chr-scene__btn'); // To tomorrow
  await page.waitForSelector('.chr-scene__title');
  await sleep(500);
  await shot('51-day2-morning-card');
});

await section('chronicles', async () => {
  await page.evaluate(() => {
    window.__manorStore.getState().advanceDayPhase(); // morning → exploring, clears the card
    location.hash = '#/chronicles';
  });
  await sleep(700);
  await shot('52-chronicles');
});

// ---------------------------------------------------------------------------
// BENCHMARKS — NYT Spelling Bee, Connections, Wordle (same browser/viewport)
// ---------------------------------------------------------------------------

async function dismissNyt() {
  const tries = [
    'button:has-text("Accept all")', 'button:has-text("Accept All")',
    'button[data-testid="Accept all-btn"]', 'button:has-text("Continue")',
    'button[aria-label="Close"]', 'button:has-text("Play")',
    'button[data-testid="Play"]', 'button[data-testid="moment-btn-play"]',
    '.pz-moment__button', 'button:has-text("I agree")',
  ];
  for (let round = 0; round < 3; round++) {
    for (const sel of tries) {
      const el = await page.$(sel).catch(() => null);
      if (el && (await el.isVisible().catch(() => false))) {
        await el.click().catch(() => {});
        await sleep(900);
      }
    }
  }
  // Close any lingering how-to-play modal.
  for (const sel of ['button[aria-label="Close"]', '[data-testid="icon-close"]', '.Modal-module_closeIcon svg']) {
    const el = await page.$(sel).catch(() => null);
    if (el && (await el.isVisible().catch(() => false))) { await el.click().catch(() => {}); await sleep(500); }
  }
}

await section('nyt-spelling-bee', async () => {
  await page.goto('https://www.nytimes.com/puzzles/spelling-bee', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(2500);
  await dismissNyt();
  await sleep(1500);
  await shot('60-benchmark-nyt-spelling-bee');
});

await section('nyt-connections', async () => {
  await page.goto('https://www.nytimes.com/games/connections', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(2500);
  await dismissNyt();
  await sleep(1500);
  await shot('61-benchmark-nyt-connections');
});

await section('nyt-wordle', async () => {
  await page.goto('https://www.nytimes.com/games/wordle/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(2500);
  await dismissNyt();
  await sleep(1500);
  await shot('62-benchmark-nyt-wordle');
});

log('missed:', JSON.stringify(missed));
log('pageErrors:', JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();
