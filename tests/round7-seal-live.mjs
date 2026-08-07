/**
 * ROUND 7 live pass — THE SEAL, on glass (AAA §0.4, 4.10g).
 *
 * The four claims round 7 has to be able to prove by pressing, not by reading
 * the store:
 *
 *   1. ENTERING a mystery room files an UNDECIPHERED fragment. Hers from that
 *      instant, permanent, and silent.
 *   2. SOLVING a room makes it LEGIBLE — the same leaf, now speaking.
 *   3. A PERFECT solve grants the interpretation (Ellery's reading, free).
 *   4. KEYS ACCRUE FROM SOLVED ROOMS (`KEY_SUPPLY.solveKeysByTier`), so the
 *      storey below a padlock is the storey that pays for it.
 *
 * Everything here goes through REAL store actions on a REAL build — the violet
 * room is drafted with `chooseDraftCard` off a genuine `openDraft` offer (so
 * the `card.category === 'mystery'` branch is the thing under test, not a
 * hand-called helper), and the Darkroom is solved by typing its truth table
 * into the keypad. The only setState is planting the player on a cell, which
 * is the same device `scripts/smoke-day.mjs` uses for the padlock.
 *
 * Tier matters for claim 4: `solveKeysByTier` is [0, 1, 1], so a GROUND-FLOOR
 * solve pays no key at all. The room is therefore drafted on row 3
 * (`rowTier` → 2), and the pass asserts the tier-1 zero as well — otherwise
 * "keys accrue from solves" would be provable by a test that never saw a key.
 *
 * Uses system Edge (channel 'msedge') — NEVER downloads playwright browsers.
 * Exactly ONE browser instance, closed in a finally.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round7');
mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:4173/LexiconManor/';
const cipherPool = JSON.parse(readFileSync(resolve(root, 'content/generated/cipher.json'), 'utf8'));

/**
 * Read the key rate out of the ENGINE rather than re-typing it, so a retune
 * moves this pass instead of silently invalidating it (the round-6 lesson).
 */
const stepsSrc = readFileSync(resolve(root, 'src/engine/economy/steps.ts'), 'utf8');
const solveKeysByTier = JSON.parse(
  /solveKeysByTier:\s*(\[[^\]]*\])/.exec(stepsSrc)?.[1]?.replace(/\s+/g, '') ?? 'null',
);
if (!Array.isArray(solveKeysByTier)) {
  console.error('[r7] FAIL: could not read KEY_SUPPLY.solveKeysByTier from steps.ts');
  process.exit(1);
}
// engine/manor/grid.ts rowTier: row <= 2 -> 1, row <= 4 -> 2, else 3.
const rowTier = (row) => (row <= 2 ? 1 : row <= 4 ? 2 : 3);

const log = (...a) => console.log('[r7]', ...a);
const fail = (msg) => { console.error('[r7] FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('[r7]   ✓', msg);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const shot = (name) => page.screenshot({ path: resolve(SHOTS, name + '.png') });
const sleep = (ms) => page.waitForTimeout(ms);

/** The seal state, derived exactly as engine/volume.ts derives it. */
const sealState = () => page.evaluate(() => {
  const s = window.__manorStore.getState();
  const vid = s.volume.volumeId;
  const flags = [...s.flags];
  const pre = `vol.${vid}.`;
  const sealedFlag = flags.filter((f) => f.startsWith(pre + 'sealed-'))
    .map((f) => f.slice((pre + 'sealed-').length));
  const legibleFlag = flags.filter((f) => f.startsWith(pre + 'legible-'))
    .map((f) => f.slice((pre + 'legible-').length));
  const legibleSet = new Set(legibleFlag);
  return {
    found: [...s.volume.foundFragmentIds],
    interpreted: [...s.volume.interpretedFragmentIds],
    sealedFlagIds: sealedFlag,
    legibleFlagIds: legibleFlag,
    // sealed === sealed AND NOT legible (the derivation, not a stored field)
    stillSealed: sealedFlag.filter((id) => !legibleSet.has(id)),
    keys: s.currencies.keys,
    madeOutEvents: s.recentEvents
      .filter((r) => r.event.type === 'fragment-made-out')
      .map((r) => r.event.fragmentIds),
    solvedEvents: s.recentEvents
      .filter((r) => r.event.type === 'room-solved')
      .map((r) => ({ kind: r.event.kind, tier: r.event.tier, perfect: r.event.perfect })),
  };
});

/**
 * Count the SEALED markers actually painted, across every journal tab.
 *
 * A sealed leaf renders one of two ways depending on where it lives: a
 * definition line becomes `.jrn-poem__line--sealed` on the Word tab, while an
 * engraving/testimony/rubbing becomes a `SealedCard` (`.jrn-card--sealed` plus
 * a `.jrn-smudge` block). Both carry `.jrn-sealed__label`, which is the one
 * universal "this is not made out" marker — counting only `.jrn-card--sealed`
 * silently missed the definition case and reported a clean journal for a
 * smudged one, which is the bug this comment exists to stop recurring.
 */
const countSealedOnGlass = async () => {
  const tabs = await page.$$('.jrn-tabs button, .jrn-tab');
  const seen = { label: 0, card: 0, poem: 0, smudge: 0 };
  const sweep = async () => {
    const c = await page.evaluate(() => ({
      label: document.querySelectorAll('.jrn-sealed__label').length,
      card: document.querySelectorAll('.jrn-card--sealed').length,
      poem: document.querySelectorAll('.jrn-poem__line--sealed').length,
      smudge: document.querySelectorAll('.jrn-smudge').length,
    }));
    for (const k of Object.keys(seen)) seen[k] = Math.max(seen[k], c[k]);
    return c.label + c.card + c.poem;
  };
  let best = -1;
  let bestScore = await sweep();
  for (let i = 0; i < tabs.length; i++) {
    await tabs[i].click().catch(() => {});
    await sleep(250);
    const score = await sweep();
    if (score > bestScore) { bestScore = score; best = i; }
  }
  // Leave the journal on the tab that actually holds the smudged leaf, so the
  // screenshot is evidence of the SEAL rather than of whichever tab the sweep
  // happened to end on. (The first cut of this pass photographed Letters.)
  if (best >= 0) { await tabs[best].click().catch(() => {}); await sleep(350); }
  else if (tabs[0]) { await tabs[0].click().catch(() => {}); await sleep(350); }
  return { ...seen, total: Math.max(seen.label, seen.card + seen.poem) };
};

/** Dismiss stacked campaign seals so a map control can be reached. */
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
    await sleep(300);
  }
  return limit;
};

/** Plant the player on a solved parlor cell with room to manoeuvre. */
const plant = async (col, row, steps = 400) => {
  await page.evaluate(({ col, row, steps }) => {
    const s = window.__manorStore.getState();
    const cell = { col, row };
    const key = `${col},${row}`;
    window.__manorStore.setState({
      // Gems fund the rerolls the sampler uses; keys keep a padlocked upper
      // door from ending the sample early. Neither is under test here.
      currencies: { ...s.currencies, gems: 400, keys: 40 },
      manor: {
        ...s.manor,
        playerCell: cell,
        rooms: {
          ...s.manor.rooms,
          [key]: {
            cardId: 'reading-nook', cell, doors: ['N', 'S', 'E', 'W'],
            solved: true, kind: 'parlor', puzzleId: undefined,
          },
        },
      },
    });
    // Top the ledger back up so drafting is never blocked by an empty purse;
    // this pass measures the SEAL, not the step economy (smoke-day owns that).
    const cur = window.__manorStore.getState();
    if (cur.stepsRemaining() < steps) {
      cur.applyStepEntry({ reason: 'tea', delta: steps - cur.stepsRemaining(), at: Date.now() });
    }
  }, { col, row, steps });
  await sleep(150);
};

/**
 * Walk cells until a genuine draft offer contains the card we want, then take
 * it. Each cell has its own seeded offer, so this samples the REAL drafter
 * rather than injecting a card the deck never dealt.
 */
const draftReal = async (want, targetRows) => {
  for (const targetRow of targetRows) {
    // Draft INTO targetRow: stand one storey below and open the north door
    // (delta N = row+1). The room's tier comes from the row it lands on, not
    // the row she stands on, so getting this backwards silently tests tier 1.
    const row = targetRow === 0 ? 1 : targetRow - 1;
    const dir = targetRow === 0 ? 'S' : 'N';
    for (let col = 0; col < 5; col++) {
      await plant(col, row);
      const read = () => page.evaluate(() => {
        const o = window.__manorStore.getState().draftOffer;
        return o ? o.cards.map((c) => ({ id: c.id, category: c.category, kind: c.puzzleKind })) : null;
      });
      let offer = await page.evaluate((d) => {
        window.__manorStore.getState().openDraft(d);
        const o = window.__manorStore.getState().draftOffer;
        return o ? o.cards.map((c) => ({ id: c.id, category: c.category, kind: c.puzzleKind })) : null;
      }, dir);
      if (!offer) continue;
      let hit = offer.find(want);
      // A cell's first offer is seeded, so re-opening the same door repeats it.
      // Reroll (a real, gem-priced action) to draw again from the same deck —
      // violet is ~2% of a ground-floor draw, so one sample per cell is not
      // enough to conclude the deck never deals it.
      for (let r = 0; r < 12 && !hit; r++) {
        const rerolled = await page.evaluate(() => {
          const s = window.__manorStore.getState();
          if (!s.draftOffer) return false;
          s.rerollDraft();
          return !!window.__manorStore.getState().draftOffer;
        });
        if (!rerolled) break;
        await sleep(80);
        offer = await read();
        if (!offer) break;
        hit = offer.find(want);
      }
      if (!hit) {
        await page.evaluate(() => window.__manorStore.getState().cancelDraft());
        continue;
      }
      const target = await page.evaluate(({ id, d }) => {
        const s = window.__manorStore.getState();
        const from = s.draftOffer.from;
        const delta = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] }[d];
        const cell = { col: from.col + delta[0], row: from.row + delta[1] };
        s.chooseDraftCard(id);
        return cell;
      }, { id: hit.id, d: dir });
      await sleep(600);
      return { card: hit, cell: target };
    }
  }
  return null;
};

// --- Darkroom helpers (same idiom as scripts/smoke-day.mjs) -----------------
function truthOf(puzzle) {
  const map = {};
  for (let i = 0; i < puzzle.ciphertext.length; i++) {
    const c = puzzle.ciphertext[i];
    if (/[A-Z]/.test(c)) map[c] = puzzle.plaintext[i];
  }
  return map;
}
const cipherLetters = (p) => [...new Set([...p.ciphertext].filter((c) => /[A-Z]/.test(c)))];

async function pencilLetter(cipherCh, plainCh) {
  const cell = await page.$(`.dk-cell:not(.dk-cell--locked):has(.dk-cell__cipher:text-is("${cipherCh}"))`);
  if (!cell) { fail(`no selectable cell for cipher letter ${cipherCh}`); return; }
  await cell.dispatchEvent('pointerdown');
  await sleep(40);
  const key = await page.$(`.mic-key:text-is("${plainCh}")`);
  if (!key) { fail(`no key for plain letter ${plainCh}`); return; }
  await key.click();
  await sleep(40);
}

/** Click through a dialogue scene the way a player does. */
async function playScene() {
  await page.waitForSelector('.dlg', { timeout: 8000 }).catch(() => {});
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const primary = await page.$('.dlg-choice--primary');
    if (primary) { await primary.click(); await sleep(180); continue; }
    const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (choice) { await choice.click(); await sleep(180); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await sleep(180);
  }
}

/** A real dusk -> night -> next morning roll, through the real scenes. */
async function rollDay() {
  await page.evaluate(() => window.__manorStore.getState().endDay());
  await sleep(600);
  if (await page.$('.chr-dusk__skip')) { await page.click('.chr-dusk__skip'); await sleep(500); }
  for (let i = 0; i < 3; i++) {
    if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await sleep(600); }
  }
  if (await page.$('.dlg')) await playScene();
  await page.waitForSelector('.bp-sheet', { timeout: 20000 });
}

// ---------------------------------------------------------------------------
try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Fresh save for a deterministic run.
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
  await page.reload({ waitUntil: 'networkidle' });

  // Into a live day through the real front step + morning card.
  await page.waitForSelector('text=Begin the first day', { timeout: 20000 });
  await page.click('text=Begin the first day');
  await page.waitForSelector('.chr-scene');
  await page.click('.chr-scene__btn');
  await playScene();                       // Bramble's morning
  await page.waitForSelector('.bp-sheet');

  /**
   * Roll off day 1 before sampling the drafter. Day 1's hand is SCRIPTED
   * (the tutorial deals the Darkroom), so a violet card cannot appear in it
   * and "no mystery card was offered" would be an artefact of the tutorial
   * rather than a fact about the deck.
   */
  await rollDay();
  log('in a live day:', JSON.stringify(await page.evaluate(() => {
    const s = window.__manorStore.getState();
    return { day: s.day?.day, phase: s.day?.phase };
  })));
  await drainMoments();

  // =========================================================================
  // 1. ENTERING A MYSTERY ROOM FILES AN UNDECIPHERED FRAGMENT.
  // =========================================================================
  const before1 = await sealState();
  const violet = await draftReal((c) => c.category === 'mystery', [1, 2, 3, 0]);
  if (!violet) {
    fail('no mystery card was offered anywhere on rows 0–3 — cannot test the seal');
  } else {
    log(`drafted violet room "${violet.card.id}" at ${JSON.stringify(violet.cell)}`);
    const after1 = await sealState();
    const gained = after1.found.filter((id) => !before1.found.includes(id));

    if (gained.length !== 1) {
      fail(`entering a violet room filed ${gained.length} fragments, expected exactly 1`);
    } else ok(`entering filed exactly one fragment (${gained[0]}) — it is hers immediately`);

    const id = gained[0];
    if (!after1.sealedFlagIds.includes(id)) {
      fail(`the filed fragment ${id} carries no sealed- flag — it arrived already legible`);
    } else ok(`the fragment arrived SEALED (vol.*.sealed-${id})`);

    if (after1.legibleFlagIds.includes(id)) {
      fail(`the fragment ${id} was made legible on ENTRY — solving would mean nothing`);
    } else ok('entering did NOT make it legible — the solve still has a job');

    if (!after1.stillSealed.includes(id)) fail(`${id} is not in the derived sealed set`);
    else ok(`the derived sealed set contains it (${after1.stillSealed.length} smudged in total)`);

    // The journal must SAY so, not just store it.
    await page.evaluate(() => window.__manorStore.getState().leaveRoom?.());
    await sleep(300);
    await page.goto(BASE + '#/journal', { waitUntil: 'networkidle' });
    await sleep(700);
    await drainMoments();
    const sealedCards = await countSealedOnGlass();
    log('journal (sealed):', JSON.stringify(sealedCards));
    if (sealedCards.total < 1) fail('the journal renders no sealed marker for a sealed fragment');
    else ok(`the journal shows the leaf as SEALED and undeciphered (${sealedCards.total} marker(s))`);
    await shot('seal-01-journal-undeciphered');

    // AAA 4.18: a sealed page is never REQUIRED for anything.
    const readiness = await page.evaluate(() => {
      const s = window.__manorStore.getState();
      return { filed: s.volume.foundFragmentIds.length };
    });
    log('journal filed count:', readiness.filed);

    // =======================================================================
    // 2/3/4. SOLVE: legible + interpretation + keys.
    // =======================================================================
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await sleep(600);
    await drainMoments();

    // Row 3 -> rowTier 2 -> solveKeysByTier[1] === 1 key.
    const dark = await draftReal((c) => c.kind === 'cipher', [3]);
    if (!dark) {
      fail('no Darkroom card offered on row 3 — cannot test the solve channel');
    } else {
      const tier = rowTier(dark.cell.row);
      const expectKeys = solveKeysByTier[Math.min(solveKeysByTier.length - 1, tier - 1)];
      log(`drafted Darkroom at ${JSON.stringify(dark.cell)} (row ${dark.cell.row} -> tier ${tier}); `
        + `expecting ${expectKeys} key(s) on solve`);

      await page.waitForSelector('.dk-cell', { timeout: 15000 });
      const puzzleId = await page.evaluate(() => window.__manorStore.getState().day?.activeRoom?.puzzleId);
      const puzzle = cipherPool.find((p) => p.id === puzzleId);
      if (!puzzle) {
        fail(`the Darkroom rendered ${puzzleId}, which is not in the shipped pool`);
      } else {
        const before2 = await sealState();
        log(`solving ${puzzleId}; sealed before: [${before2.stillSealed.join(', ')}], `
          + `keys ${before2.keys}, interpreted ${before2.interpreted.length}`);

        const truth = truthOf(puzzle);
        for (const c of cipherLetters(puzzle)) {
          if (puzzle.reveals.includes(c)) continue;
          await pencilLetter(c, truth[c]);
        }
        await page.click('.mic-btn--primary');
        await sleep(1200);
        if (!(await page.$('.mic-done'))) fail('the Darkroom did not resolve after a true develop');
        else ok('the Darkroom resolved on a true develop');

        const after2 = await sealState();
        const solved = after2.solvedEvents[after2.solvedEvents.length - 1];
        log('room-solved event:', JSON.stringify(solved));

        // --- 2. the sealed page is now LEGIBLE --------------------------
        const nowLegible = after2.legibleFlagIds.filter((x) => !before2.legibleFlagIds.includes(x));
        if (nowLegible.length < 1) {
          fail('solving made NOTHING out — the sealed backlog is untouched');
        } else ok(`solving made ${nowLegible.length} page(s) out: ${nowLegible.join(', ')}`);

        if (!nowLegible.includes(id)) {
          fail(`the page filed by the violet room (${id}) is still smudged after a solve`);
        } else ok(`the very page entering filed (${id}) is now LEGIBLE`);

        if (after2.stillSealed.includes(id)) fail(`${id} is still in the derived sealed set`);
        else ok('it has left the derived sealed set — sealed ∧ ¬legible is false for it');

        // The spine carries the beat (round-7 `fragment-made-out`).
        if (after2.madeOutEvents.length <= before2.madeOutEvents.length) {
          fail('no fragment-made-out event reached the event spine');
        } else {
          ok(`the spine recorded fragment-made-out ${JSON.stringify(after2.madeOutEvents.at(-1))}`);
        }

        // --- 4. keys accrue from solved rooms ---------------------------
        const dKeys = after2.keys - before2.keys;
        log(`keys: ${before2.keys} -> ${after2.keys} (+${dKeys}), expected +${expectKeys}`);
        if (dKeys !== expectKeys) {
          fail(`a tier-${tier} solve paid ${dKeys} keys, expected ${expectKeys}`);
        } else ok(`a tier-${tier} solve paid ${expectKeys} key — solving powers the climb`);
        if (expectKeys < 1) fail('the tier under test pays no key; the claim was not exercised');
        if (solveKeysByTier[0] !== 0) {
          fail('a ground-floor solve now pays a key — the storey-below-the-padlock design is gone');
        } else ok('a tier-1 solve still pays 0 — the key is bought by climbing, not by grinding');

        // --- 3. a PERFECT solve grants the interpretation ---------------
        if (!solved || solved.perfect !== true) {
          log('NOTE: this solve was not perfect; driving the perfect grant explicitly');
        }
        const gainedNotes = after2.interpreted.filter((x) => !before2.interpreted.includes(x));
        if (solved && solved.perfect) {
          if (gainedNotes.length < 1) {
            fail('a PERFECT solve granted no interpretation (AAA 5.7 service tier, free)');
          } else ok(`the perfect solve granted the reading of ${gainedNotes.join(', ')} — free`);
        } else {
          // Prove the rule itself rather than skipping it: the grant is
          // `creditSolve(kind, tier, perfect)`'s third argument.
          const probe = await page.evaluate(() => {
            const s = window.__manorStore.getState();
            const b = [...s.volume.interpretedFragmentIds];
            s.creditSolve('cipher', 2, false);
            const mid = [...window.__manorStore.getState().volume.interpretedFragmentIds];
            window.__manorStore.getState().creditSolve('cipher', 2, true);
            const end = [...window.__manorStore.getState().volume.interpretedFragmentIds];
            return { before: b.length, imperfect: mid.length, perfect: end.length };
          });
          log('perfect-grant probe:', JSON.stringify(probe));
          if (probe.imperfect !== probe.before) {
            fail('an IMPERFECT solve granted an interpretation — perfection buys nothing');
          } else ok('an imperfect solve grants no reading');
          if (probe.perfect <= probe.imperfect) {
            fail('a PERFECT solve granted no interpretation (AAA 5.7 service tier, free)');
          } else ok('a perfect solve grants the reading Ellery charges affinity for — free');
        }

        // --- the journal now reads it -----------------------------------
        await page.evaluate(() => window.__manorStore.getState().leaveRoom?.());
        await sleep(400);
        await page.goto(BASE + '#/journal', { waitUntil: 'networkidle' });
        await sleep(700);
        await drainMoments();
        const sealedAfter = await countSealedOnGlass();
        log('journal after the solve (sealed):', JSON.stringify(sealedAfter));
        if (sealedAfter.total >= sealedCards.total) {
          fail(`the journal still shows ${sealedAfter.total} sealed markers `
            + `(was ${sealedCards.total}) — the solve changed nothing on glass`);
        } else {
          ok(`the journal shows fewer sealed markers (${sealedCards.total} -> ${sealedAfter.total})`);
        }
        await shot('seal-02-journal-legible');
      }
    }
  }

  if (errors.length) fail('console/page errors: ' + errors.slice(0, 5).join(' | '));
  log(process.exitCode
    ? 'DONE WITH FAILURES'
    : 'DONE — entering files a sealed page, solving makes it out, perfection buys the reading, and the climb is paid for by solving');
} catch (e) {
  fail(e.message);
  await shot('seal-99-failure').catch(() => {});
} finally {
  await browser.close();
}
