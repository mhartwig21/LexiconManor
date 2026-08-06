/**
 * ROUND 6 HEADLINE VERIFICATION — the four claims this round is actually
 * being judged on, driven through the real UI at 390x844 @2x.
 *
 * The round's whole thesis is that a reward must be announced ON THE SCREEN
 * THE PLAYER IS ON, and must leave a trace she can return to. Three of the
 * four fragment channels used to fire behind an overlay, inside a room, or on
 * an unmounted page — so a static "does the class exist" check proves nothing
 * here. Every assertion below is therefore a LIVE one: elementFromPoint, a
 * real reload, a real day roll.
 *
 *   A. A fragment granted from an authored DIALOGUE node produces a visible
 *      moment ON the dialogue screen (the channel that used to fire behind
 *      the .dlg overlay and be seen by nobody).
 *   B. The Journal entrance carries an unread marker afterwards.
 *   C. That marker survives a DAY ROLL and a RELOAD, and clears only on
 *      viewing — not on focus, not at dusk.
 *   D. The retire control is NOT hit-testable through an open overlay
 *      (two taps there used to end the day from inside a "modal").
 *
 * Plus a keepsake/unlock capture, since permanent unlocks are the other
 * campaign-class reward that used to announce nothing at all.
 *
 * Uses system Edge (channel 'msedge') — NEVER downloads playwright browsers.
 * Exactly ONE browser instance, closed in a finally.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round6');
mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.MANOR_URL ?? 'http://localhost:4173/LexiconManor/';

/**
 * The parlor conversations that OUTRANK the testimony node.
 *
 * `ellery.arc.testimony` (priority 500) is the authored node that grants the
 * fragment, but Ellery has a dozen `once` reactions above it — the moment we
 * file the three fragments its condition needs, `ellery.react.fragment-*` at
 * 720 becomes the top pick instead. Marking those seen is not a cheat: it is
 * exactly the state a player is in after a fortnight of evenings, and it is
 * read straight out of the shipped JSON rather than hand-listed, so a new
 * high-priority node cannot silently make this pass measure nothing.
 */
const ellery = JSON.parse(
  readFileSync(resolve(root, 'content/authored/dialogue/ellery.json'), 'utf8'),
);
const OUTRANKING = ellery.nodes
  .filter((n) => n.trigger === 'parlor' && (n.priority ?? 0) > 500)
  .map((n) => n.id);

const log = (...a) => console.log('[r6]', ...a);
const fail = (m) => { console.error('[r6] FAIL:', m); process.exitCode = 1; };
const ok = (m) => console.log('[r6]   ✓', m);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const shot = (n) => page.screenshot({ path: resolve(SHOTS, n + '.png') });

/**
 * THE ONLY ADMISSIBLE PROOF that something is on the glass (AAA 11.2): ask the
 * document who answers a tap at the control's own centre. A DOM query proves
 * the node exists; it does not prove a finger can reach it.
 */
const hitTest = (selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return { found: true, zeroBox: true };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const inViewport = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight;
  const at = document.elementFromPoint(cx, cy);
  return {
    found: true,
    zeroBox: false,
    inViewport,
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    self: !!(at && (at === el || el.contains(at) || at.contains(el))),
    answeredBy: at ? `${at.tagName}.${String(at.className).split(' ')[0]}` : null,
  };
}, selector);

const state = () => page.evaluate(() => {
  const s = window.__manorStore.getState();
  return {
    day: s.day?.day ?? null,
    phase: s.day?.phase ?? null,
    fragments: s.volume.foundFragmentIds.slice(),
    keepsakes: s.earnedAchievementIds.slice(),
    unlocked: s.cabinet.unlockedCardIds.slice(),
  };
});

/** Walk a DialogueScene to its end, avoiding the gift verb. */
async function playScene() {
  await page.waitForSelector('.dlg', { timeout: 8000 });
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const primary = await page.$('.dlg-choice--primary');
    if (primary) { await primary.click(); await page.waitForTimeout(200); continue; }
    const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (choice) { await choice.click(); await page.waitForTimeout(200); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown');
    await page.waitForTimeout(200);
  }
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
  await page.reload({ waitUntil: 'networkidle' });

  // Get into a live day through the real front step + morning card.
  await page.waitForSelector('text=Begin the first day');
  await page.click('text=Begin the first day');
  await page.waitForSelector('.chr-scene');
  await page.click('.chr-scene__btn');
  await playScene();                       // Bramble's morning
  await page.waitForSelector('.bp-sheet');
  log('in a live day:', JSON.stringify(await state()));

  // ══ A. A FRAGMENT FROM AN AUTHORED DIALOGUE NODE, ON THE DIALOGUE SCREEN ══
  //
  // `ellery.arc.testimony` grants v1-t1 and is gated on met.ellery + three
  // fragments filed. We set up its PRECONDITIONS through the store (that is
  // just "some evenings have already happened"), then reach the grant itself
  // entirely through the real UI: a real parlor room, the real "Call on
  // Ellery" verb, the real DialogueScene, the real authored node. Nothing
  // about the announcement is simulated — if the moment appears, the watcher's
  // subscription to the event spine is the only thing that could have put it
  // there, and it did so while a full-screen overlay was up.
  await page.evaluate((outranking) => {
    const st = window.__manorStore.getState();
    const cell = st.manor.playerCell;
    const key = `${cell.col},${cell.row}`;
    st.setFlag('met.ellery');
    for (const id of ['v1-d1', 'v1-e1', 'v1-d2']) st.fileFragment(id);
    window.__manorStore.setState({
      seenNodeIds: [...window.__manorStore.getState().seenNodeIds, ...outranking],
    });
    window.__manorStore.setState({
      manor: {
        ...window.__manorStore.getState().manor,
        rooms: {
          ...window.__manorStore.getState().manor.rooms,
          [key]: {
            cardId: 'reading-nook', cell, doors: ['N', 'S', 'E', 'W'],
            solved: true, kind: 'parlor', puzzleId: undefined,
          },
        },
      },
    });
  }, OUTRANKING);
  await page.waitForTimeout(400);
  // Clear the three setup moments off the glass so what we measure is the one
  // grant made inside the conversation, not a queue left over from staging.
  for (let i = 0; i < 8 && (await page.$('.mom')); i++) {
    await page.click('.mom'); await page.waitForTimeout(250);
  }

  // EXACTLY ONE LAYER. The layer moved into App.tsx this round (it used to
  // bootstrap itself into its own body root from ManorPage's mount effect, so
  // a cold deep-link left the watcher uninstalled). Both paths existing at once
  // would render every campaign seal twice, and a hit test would still pass —
  // so the count is asserted, not inferred.
  const layers = await page.evaluate(() => ({
    layers: document.querySelectorAll('.mom-layer').length,
    bootstrapRoot: !!document.getElementById('lm-moment-root'),
  }));
  log('layer mount: ' + JSON.stringify(layers));
  // NB: `.mom-layer` renders nothing while the queue is empty, so a zero here
  // is not evidence either way — the real count is taken below, on the frame
  // the seal is actually up. What IS conclusive now is the bootstrap root.
  if (layers.bootstrapRoot) {
    fail('the self-bootstrapped moment root is still in the body — two layers will render every seal twice');
  } else ok('the bootstrap root retired in favour of the App-tree layer');

  const before = (await state()).fragments.length;
  const call = await page.waitForSelector('.bp-foot__actions .bp-btn:has-text("Call on")', { timeout: 6000 });
  await call.click();
  await page.waitForSelector('.dlg');

  // Walk the scene, watching for the seal WHILE THE OVERLAY IS STILL UP.
  let onDialogue = null;
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    if (!onDialogue && (await page.$('.mom'))) {
      onDialogue = await hitTest('.mom');
      onDialogue.dlgMounted = !!(await page.$('.dlg'));
      onDialogue.layers = await page.evaluate(() => document.querySelectorAll('.mom-layer').length);
      onDialogue.seals = await page.evaluate(() => document.querySelectorAll('.mom').length);
      onDialogue.title = await page.textContent('.mom__title').catch(() => null);
      onDialogue.quote = await page.textContent('.mom__quote').catch(() => null);
      await shot('01-moment-on-dialogue');
      break; // freeze the frame: do not dismiss it, it must be measured in place
    }
    const primary = await page.$('.dlg-choice--primary');
    if (primary) { await primary.click(); await page.waitForTimeout(200); continue; }
    const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (choice) { await choice.click(); await page.waitForTimeout(200); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown');
    await page.waitForTimeout(200);
  }
  const after = (await state()).fragments.length;

  if (after <= before) {
    fail(`the authored node granted no fragment (${before} -> ${after}) — test setup is stale`);
  } else if (!onDialogue) {
    fail('a fragment was granted inside a conversation and NO moment appeared on the dialogue screen');
  } else {
    log(`A: fragment ${before} -> ${after}; seal ${JSON.stringify(onDialogue.box)} `
      + `"${onDialogue.title}" / "${onDialogue.quote}"`);
    if (!onDialogue.dlgMounted) fail('the seal appeared only after the overlay closed — that is the old bug');
    else ok('the seal is on glass WHILE the dialogue overlay is up');
    if (!onDialogue.inViewport || onDialogue.zeroBox) fail('the seal is not in the viewport');
    else ok(`the seal is in the viewport at ${JSON.stringify(onDialogue.box)}`);
    if (!onDialogue.self) fail(`the seal is covered — elementFromPoint returned ${onDialogue.answeredBy}`);
    else ok('elementFromPoint at the seal centre returns the seal itself (AAA 11.2)');
    if (onDialogue.layers !== 1 || onDialogue.seals !== 1) {
      fail(`the seal rendered ${onDialogue.seals} time(s) in ${onDialogue.layers} layer(s) — `
        + 'the App-tree mount and the bootstrap root are both live');
    } else ok('exactly one layer, exactly one seal — the two mount paths cannot both run');
  }

  // ══ D. THE RETIRE CONTROL IS NOT TAPPABLE THROUGH THE OVERLAY ══
  //
  // Measured with the dialogue overlay STILL UP — the frame that matters. The
  // failure this guards is destructive and silent: `.chr-header` and `.dlg`
  // were both z-index 40, and the header mounts after the route Switch, so at
  // equal z-index DOM order put the day bar (and the retire moon inside it) on
  // top of every scene the player believed was modal. Two taps up there and
  // her evening was over, from inside a conversation.
  //
  // The probe asserts the SITUATION first. A pass recorded while nothing was
  // open would be a test that cannot fail, which is worse than no test.
  const retireProbe = await page.evaluate(() => {
    const bar = document.querySelector('.chr-header');
    const retire = document.querySelector('.chr-retire');
    const r = bar?.getBoundingClientRect();
    // Probe where the moon lives (right end of the bar) whether or not it is
    // mounted — "not rendered" and "not reachable" are both passes, and we
    // want the report to say which one carried it.
    const x = r ? r.right - 24 : innerWidth - 24;
    const y = r ? r.top + r.height / 2 : 26;
    const at = document.elementFromPoint(x, y);
    return {
      dlgMounted: !!document.querySelector('.dlg'),
      overlayOpen: document.documentElement.hasAttribute('data-overlay-open'),
      retireMounted: !!retire,
      barPointerEvents: bar ? getComputedStyle(bar).pointerEvents : null,
      answeredBy: at ? `${at.tagName}.${String(at.className).split(' ')[0]}` : null,
      answeredByRetire: !!(at && at.closest && at.closest('.chr-retire')),
      probe: { x: Math.round(x), y: Math.round(y) },
    };
  });
  log('D: retire probe ' + JSON.stringify(retireProbe));
  if (!retireProbe.dlgMounted) {
    fail('D measured nothing: no overlay was open at the probe frame');
  } else {
    ok('the probe ran with the dialogue overlay genuinely mounted');
    if (!retireProbe.overlayOpen) {
      fail('the overlay is up but <html data-overlay-open> was never stamped — the React lock is dead');
    } else ok('<html data-overlay-open> is stamped while the scene is up');

    const dayBefore = await state();
    // And actually TAP there, twice — the arming pattern that ends the day.
    await page.mouse.click(retireProbe.probe.x, retireProbe.probe.y);
    await page.waitForTimeout(250);
    await page.mouse.click(retireProbe.probe.x, retireProbe.probe.y);
    await page.waitForTimeout(500);
    const dayAfter = await state();

    if (retireProbe.answeredByRetire) fail('the retire moon answers a tap through an open overlay');
    else ok(`the retire moon is unreachable through the overlay (${retireProbe.answeredBy} answers; `
      + `mounted: ${retireProbe.retireMounted}, bar pointer-events: ${retireProbe.barPointerEvents})`);

    if (dayAfter.phase === 'dusk' || dayAfter.phase === 'night' || dayAfter.day !== dayBefore.day) {
      fail(`two taps at the retire moon through an overlay ENDED THE DAY `
        + `(${dayBefore.day}/${dayBefore.phase} -> ${dayAfter.day}/${dayAfter.phase})`);
    } else ok(`two taps there did not end the day (still ${dayAfter.day}/${dayAfter.phase})`);
    await shot('06-retire-through-overlay');
  }

  // Close the scene out (the seal first, then the rest of the conversation).
  await page.click('.mom').catch(() => {});
  await page.waitForTimeout(300);
  if (await page.$('.dlg')) await playScene();
  await page.waitForSelector('.bp-sheet');

  // ══ B. THE JOURNAL ENTRANCE CARRIES AN UNREAD MARKER ══
  const entrance = () => page.evaluate(() => {
    const btn = [...document.querySelectorAll('.bp-btn--quiet')]
      .find((b) => b.textContent.trim().startsWith('Journal'));
    if (!btn) return null;
    const mark = btn.querySelector('.unread');
    const r = btn.getBoundingClientRect();
    return {
      hasMark: !!mark,
      count: mark?.querySelector('.unread__n')?.textContent ?? null,
      label: mark?.getAttribute('aria-label') ?? null,
      animation: mark ? getComputedStyle(mark).animationName : null,
      box: { y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      aboveFold: r.bottom <= innerHeight,
    };
  });
  const markNow = await entrance();
  log('B: journal entrance ' + JSON.stringify(markNow));
  await shot('02-unread-entrance');
  if (!markNow?.hasMark) fail('the Journal entrance carries no unread marker after four fragments filed');
  else ok(`the Journal entrance is marked, count "${markNow.count}" (${markNow.label})`);
  if (markNow && !markNow.aboveFold) fail('the marked entrance is below the fold (AAA 11.3)');
  else ok('the marked entrance is above the fold');
  if (markNow?.animation && markNow.animation !== 'none') {
    fail(`the marker animates (${markNow.animation}) — reduced motion has something to strip`);
  } else ok('the marker does not animate in any state');

  // ══ C. IT SURVIVES A DAY ROLL, THEN A RELOAD, AND CLEARS ONLY ON VIEWING ══
  //
  // The round-5 bug this replaces read `day.recentEvents`, which the dusk
  // prune EMPTIES — so an unviewed fragment silently lost its marker overnight
  // while a fragment read on arrival kept one until dusk. Both directions are
  // checked, and the day roll is a real one.
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    s.endDay();
  });
  await page.waitForTimeout(600);
  // Through the real dusk veil / night digest if they are up.
  if (await page.$('.chr-dusk__skip')) { await page.click('.chr-dusk__skip'); await page.waitForTimeout(500); }
  if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(700); }
  if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(500); }
  if (await page.$('.dlg')) await playScene();
  await page.waitForSelector('.bp-sheet');
  const rolled = await state();
  const afterRoll = await entrance();
  log(`C1: after the day roll (now day ${rolled.day}) ` + JSON.stringify(afterRoll));
  if (rolled.day === 1) fail('the day did not actually roll — the survival check proves nothing');
  else if (!afterRoll?.hasMark) fail('the unread marker DIED at dusk — it is recency, not state (AAA 11.20)');
  else ok(`the marker survived the roll into day ${rolled.day}, count "${afterRoll.count}"`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(600); }
  if (await page.$('.dlg')) await playScene();
  await page.waitForSelector('.bp-sheet');
  const afterReload = await entrance();
  log('C2: after a full reload ' + JSON.stringify(afterReload));
  if (!afterReload?.hasMark) fail('the unread marker did not survive a reload — it is not persisted');
  else ok(`the marker survived a reload, count "${afterReload.count}"`);

  // Now VIEW it — the only thing that may retire a marker.
  await page.click('.bp-btn--quiet:has-text("Journal")');
  await page.waitForSelector('.jrn-page', { timeout: 8000 });
  await page.waitForTimeout(800);
  await shot('03-journal-viewed');
  const backLink = await page.$('.backlink');
  if (backLink) await backLink.click(); else await page.goto(BASE + '#/');
  await page.waitForSelector('.bp-sheet');
  await page.waitForTimeout(400);
  const afterViewing = await entrance();
  log('C3: after viewing the journal ' + JSON.stringify(afterViewing));
  const beforeN = Number(afterReload?.count ?? 0);
  const afterN = Number(afterViewing?.count ?? 0);
  if (afterViewing?.hasMark && afterN >= beforeN) {
    fail(`viewing the journal did not retire anything (${beforeN} -> ${afterN})`);
  } else ok(`viewing retired the marks it displayed (${beforeN} -> ${afterViewing?.hasMark ? afterN : 0})`);

  // ══ E. A KEEPSAKE / UNLOCK STATE, CAPTURED ══
  //
  // The other campaign-class reward. Both channels were silent until this
  // round: the shelf had no writer at all, and the cabinet plates were gated
  // on quest ids nothing in the game could ever produce.
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    s.recordEvent({ type: 'room-solved', cellKey: '2,1', kind: 'hive', perfect: true, tier: 2 });
    s.setFlag('posy.quest1.done');
  });
  await page.waitForTimeout(900);
  const unlocked = await state();
  const sealNow = (await page.$('.mom')) ? await hitTest('.mom') : null;
  const sealTitle = await page.textContent('.mom__title').catch(() => null);
  log(`E: keepsakes ${JSON.stringify(unlocked.keepsakes)} unlocked ${JSON.stringify(unlocked.unlocked)} `
    + `seal "${sealTitle}"`);
  await shot('04-keepsake-moment');
  if (!unlocked.keepsakes.length) fail('solving a room banked no keepsake — the shelf still has no writer');
  else ok(`the shelf gained ${JSON.stringify(unlocked.keepsakes)}`);
  if (!unlocked.unlocked.length) fail('a completed quest flag unlocked no cabinet plate');
  else ok(`the cabinet gained ${JSON.stringify(unlocked.unlocked)}`);
  if (!sealNow) fail('a permanent unlock announced nothing on the screen the player is on (AAA 11.12)');
  else if (!sealNow.self) fail(`the unlock seal is covered — ${sealNow.answeredBy} answers`);
  else ok(`the unlock announced itself on glass: "${sealTitle}"`);

  // Its persistent trace: the marked Chronicles entrance.
  await page.click('.mom').catch(() => {});
  await page.waitForTimeout(400);
  const chronMark = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.bp-btn--quiet')]
      .find((b) => b.textContent.trim().startsWith('Chronicles'));
    const mark = btn?.querySelector('.unread');
    return { hasMark: !!mark, label: mark?.getAttribute('aria-label') ?? null };
  });
  log('E2: chronicles entrance ' + JSON.stringify(chronMark));
  await shot('05-keepsake-entrance');
  if (!chronMark.hasMark) fail('the keepsake has no persistent trace on the blueprint (AAA 11.12)');
  else ok(`the keepsake left a trace: ${chronMark.label}`);

  if (errors.length) fail('console/page errors: ' + errors.slice(0, 5).join(' | '));
  log(process.exitCode ? 'DONE WITH FAILURES' : 'DONE — all round-6 headline claims verified on glass');
} catch (e) {
  fail(e.message + '\n' + e.stack);
  await shot('99-failure').catch(() => {});
} finally {
  await browser.close();
}
