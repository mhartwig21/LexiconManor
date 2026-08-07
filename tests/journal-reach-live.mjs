/**
 * tests/journal-reach-live.mjs — OWNER: visual-nav. THE LIVE EVIDENCE for
 * AAA 4.15 / 11.12 ("any filed document re-readable in ≤2 taps from anywhere")
 * measured from the two screens the player cannot avoid.
 *
 * THE DEFECT BEING REGRESSION-TESTED (round-11 major)
 * The morning card and the night digest are full-screen lifecycle scenes she
 * stands on every single day, and their only controls were the primary advance
 * and the Chronicles aside — measured live: ['Begin the day', 'Chronicles /
 * sound, motion, the trunk']. There was no Journal route. The real cost from
 * the morning card to the journal entrance was NINE taps: dismiss the card,
 * then play Mrs. Bramble's whole conversation to reach `exploring`, then tap
 * Journal on the blueprint footer. The night digest was worse in kind, because
 * it PRINTS the waiting-post and mantel prose — it tells her a letter has
 * arrived on a surface from which she cannot open it, and the next morning's
 * card then stands between her and it.
 *
 * §0.1.7 and §0.4 are explicit that this is measured by DRIVING the app: the
 * count below is real taps on real controls at real coordinates, each one hit-
 * tested at its centre first, never a count of `navigate()` call sites in the
 * source. A control that renders and cannot be pressed costs infinity taps and
 * photographs exactly like a working one.
 *
 * ALSO ASSERTED HERE
 *   · the aside is a stand-aside, not a mutation: the phase is untouched by the
 *     round trip, so reaching the journal costs no game state (11.26's shape)
 *   · the scene comes back exactly as it was on the way home
 *   · the unread chain reaches this new entrance (11.19/11.21): the mark and
 *     its count appear when something is unread and are absent when nothing is
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser
 * instance, closed in a finally. 390x844 @2x.
 *
 * Run: `node tests/journal-reach-live.mjs`   (spawns its own vite dev server)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VOLUME = JSON.parse(
  readFileSync(resolve(ROOT, 'content/authored/volumes/volume-1.json'), 'utf8'),
);

/** Agents share this checkout and each other's ports; take one that is free. */
async function freePort(from = 5281, to = 5340) {
  for (let p = from; p <= to; p++) {
    let taken = false;
    for (const host of ['127.0.0.1', '::1', undefined]) {
      // eslint-disable-next-line no-await-in-loop
      taken = taken || await new Promise((res) => {
        const s = createServer();
        s.once('error', () => res(true));
        s.once('listening', () => s.close(() => res(false)));
        if (host) s.listen(p, host); else s.listen(p);
      });
    }
    if (!taken) return p;
  }
  throw new Error(`no free port in ${from}-${to}`);
}

const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;

const log = (...a) => console.log('[journal-reach]', ...a);
const ok = (m) => console.log('[journal-reach]   ok', m);
let failures = 0;
const fail = (m) => { console.error('[journal-reach]   FAIL:', m); failures++; };
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };

/** The §0.4.5 artifact: one row per lifecycle scene. */
const table = [];

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
const serverUp = new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error('vite did not start within 60s')), 60000);
  server.stdout.on('data', (b) => {
    if (String(b).includes('ready in') || String(b).includes('Local:')) { clearTimeout(timer); res(); }
  });
  server.stderr.on('data', (b) => process.stderr.write(`[vite] ${b}`));
  server.on('exit', (c) => { clearTimeout(timer); rej(new Error(`vite exited early (${c})`)); });
});

let browser;
try {
  await serverUp;
  log('dev server up on', BASE);

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const S = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    return {
      phase: s.day?.phase ?? null,
      day: s.day?.day ?? null,
      steps: s.stepsRemaining(),
      records: s.chronicles.dayRecords.length,
      hash: location.hash,
    };
  });

  /** Every control the scene puts on the glass, in DOM order, as labels. */
  const sceneControls = () => page.evaluate(() => {
    const scene = document.querySelector('.chr-scene');
    if (!scene) return null;
    return [...scene.querySelectorAll('button')]
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim());
  });

  /**
   * ONE TAP, taken honestly: find the control by its VISIBLE LABEL (never by a
   * test-only hook), hit-test its centre first, then click at that coordinate.
   * Returns the label so the caller can print what it pressed.
   */
  async function tapByLabel(scope, label, name) {
    const found = await page.evaluate(([sel, want]) => {
      const root = document.querySelector(sel);
      if (!root) return { none: `no ${sel} on the glass` };
      for (const btn of root.querySelectorAll('button')) {
        const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text.toLowerCase().startsWith(want.toLowerCase())) continue;
        const r = btn.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return { none: `"${text}" has no box` };
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const who = el ? el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '') : 'nothing';
        return {
          text,
          x: r.x + r.width / 2, y: r.y + r.height / 2,
          w: Math.round(r.width), h: Math.round(r.height),
          itself: Boolean(el && (el === btn || btn.contains(el))),
          who,
          inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
        };
      }
      return { none: `no control in ${sel} whose label starts with "${want}"` };
    }, [scope, label]);

    if (found.none) { fail(`${name}: ${found.none} (AAA 11.1/11.7)`); return null; }
    check(found.itself && found.inViewport,
      `${name}: "${found.text}" is ${found.w}x${found.h}, above the fold, and answers at its own centre`,
      `${name}: "${found.text}" inViewport=${found.inViewport} answersItself=${found.itself} (answered by ${found.who}) — AAA 11.2/11.3`);
    check(found.w >= 44 && found.h >= 44,
      `${name}: "${found.text}" meets the 44x44pt floor`,
      `${name}: "${found.text}" is ${found.w}x${found.h} — under AAA 6.19's 44x44pt floor`);
    await page.mouse.click(found.x, found.y);
    return found.text;
  }

  /** The mark and its count at this entrance, read off the DOM (11.19/11.21). */
  const asideMark = () => page.evaluate(() => {
    const scene = document.querySelector('.chr-scene');
    if (!scene) return null;
    for (const btn of scene.querySelectorAll('.chr-scene__aside')) {
      const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^Journal/.test(text)) continue;
      const mark = btn.querySelector('.unread');
      return {
        present: Boolean(mark),
        n: mark ? Number((mark.textContent || '').trim()) : 0,
        aria: mark?.getAttribute('aria-label') ?? null,
      };
    }
    return null;
  });

  const storeUnread = () => page.evaluate(() => {
    // The same derivation the blueprint footer reads — if the two ever
    // disagreed the chain would be lying at one of its levels (AAA 11.19).
    const s = window.__manorStore.getState();
    return s.volume.foundFragmentIds.length;
  });

  /* --- the walk ----------------------------------------------------------- */

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title', { timeout: 20000 });

  /* ========== 1. THE MORNING CARD ========================================= */
  log('');
  log('— the morning card —');
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene', { timeout: 8000 });

  const morningControls = await sceneControls();
  log(`  controls on the glass: ${JSON.stringify(morningControls)}`);
  check(morningControls?.some((c) => /^Journal/.test(c)),
    'morning card offers a Journal route',
    `morning card has no Journal route — the only controls are ${JSON.stringify(morningControls)} (AAA 4.15/11.12)`);

  // The mark this new entrance carries, recorded BEFORE the tap so it can be
  // held against what the journal itself shows one level down (AAA 11.19: the
  // chain is unbroken end to end, and no level may disagree with another).
  const markAtEntrance = await asideMark();
  log(`  the aside's mark: ${markAtEntrance?.present ? `${markAtEntrance.n} (${markAtEntrance.aria})` : 'none'}`);

  const beforeMorning = await S();
  let taps = 0;
  const pressed = await tapByLabel('.chr-scene', 'Journal', 'morning card Journal aside');
  if (pressed) taps += 1;
  await page.waitForSelector('.jrn-tabs', { timeout: 8000 }).catch(() => {});
  const atJournal = await S();

  check(atJournal.hash === '#/journal',
    `morning card → Journal in ${taps} tap${taps === 1 ? '' : 's'} (hash ${atJournal.hash}) — AAA 4.15's ≤2 satisfied`,
    `morning card: "${pressed}" landed on ${atJournal.hash}, not #/journal (AAA 11.6)`);
  check(taps > 0 && taps <= 2,
    `morning card → a filed document costs ${taps} tap${taps === 1 ? '' : 's'} (was 9)`,
    `morning card → the journal costs ${taps} taps — AAA 4.15/11.12 cap it at 2`);
  check(Boolean(await page.$('.jrn-sheet')),
    'morning card → the journal sheet is actually rendered, not just the route',
    'morning card → the route changed but no .jrn-sheet is on the glass');

  // 11.19/11.21 across two levels of the chain: the entrance the scene now
  // carries, and the ribbon tabs one tap down. A count at the entrance with no
  // marked tab behind it (or the reverse) is the marker lying at one end.
  {
    const marked = await page.evaluate(() => [...document.querySelectorAll('.jrn-tabs button')]
      .filter((t) => t.querySelector('.unread'))
      .map((t) => (t.textContent || '').replace(/\s+/g, ' ').trim()));
    const n = markAtEntrance?.present ? markAtEntrance.n : 0;
    // The Letters tab is the honest exception the journal already documents:
    // an arrived-but-unopened letter is unread at the entrance AND on its tab,
    // so the two levels still have to agree about *whether* anything is unread.
    check(n > 0 ? marked.length > 0 : marked.length === 0,
      `unread chain: the scene aside says ${n} and the ribbon marks ${marked.length} tab(s) [${marked.join(', ')}] — the two levels agree`,
      `unread chain: the scene aside says ${n} but ${marked.length} tab(s) are marked [${marked.join(', ')}] — the marker is lying at one end (AAA 11.19/11.21)`);
  }

  // 11.26's shape, applied to the journal: reaching it costs no game state.
  check(atJournal.phase === beforeMorning.phase && atJournal.day === beforeMorning.day
    && atJournal.steps === beforeMorning.steps && atJournal.records === beforeMorning.records,
    `morning card → Journal spends nothing: phase ${beforeMorning.phase}, day ${beforeMorning.day}, ${beforeMorning.steps} steps, ${beforeMorning.records} records, all unchanged`,
    `morning card → Journal mutated the day: ${JSON.stringify(beforeMorning)} → ${JSON.stringify(atJournal)}`);

  // And the scene is exactly where she left it on the way home.
  await page.click('.jrn-page .backlink');
  await page.waitForSelector('.chr-scene', { timeout: 8000 }).catch(() => {});
  const home = await S();
  check(Boolean(await page.$('.chr-scene')) && home.phase === beforeMorning.phase,
    'morning card is exactly where she left it after the journal round trip',
    `morning card did not come back (phase ${home.phase}, .chr-scene ${Boolean(await page.$('.chr-scene'))})`);
  table.push({ scene: 'morning card', route: '#/journal', taps, spent: 'nothing', returns: 'yes' });

  /* ========== 2. THE UNREAD CHAIN AT THE NEW ENTRANCE ===================== */
  log('');
  log('— the unread chain reaches the scene aside (AAA 11.19/11.21) —');
  await page.evaluate((ids) => {
    for (const id of ids) window.__manorStore.getState().fileFragment(id);
  }, VOLUME.fragments.slice(0, 3).map((f) => f.id));
  await page.waitForTimeout(400);
  {
    const mark = await asideMark();
    const filed = await storeUnread();
    check(Boolean(mark?.present) && mark.n > 0,
      `morning card: the Journal aside carries the unread mark (${mark?.aria}) with ${filed} fragments filed`,
      `morning card: nothing filed shows at the entrance after ${filed} grants — the chain breaks at the scene (AAA 11.19)`);
  }

  /* ========== 3. THE NIGHT DIGEST ======================================== */
  log('');
  log('— the night digest —');
  // Through the real morning beat into exploring, then close the day the way
  // the retire control does, and let the veil advance itself.
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.dlg', { timeout: 8000 });
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const primary = await page.$('.dlg-choice--primary')
      ?? await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (primary) { await primary.click().catch(() => {}); await page.waitForTimeout(200); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await page.waitForTimeout(190);
  }
  await page.waitForFunction(
    () => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 },
  );
  // Dismiss anything the morning left on glass so the tap count is honest.
  for (let i = 0; i < 20; i++) {
    const b = await page.evaluate(() => {
      const m = document.querySelector('.mom');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!b) break;
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.__manorStore.getState().endDay('retired-early'));
  await page.waitForFunction(
    () => window.__manorStore.getState().day?.phase === 'night', null, { timeout: 14000 },
  ).catch(() => {});
  await page.waitForSelector('.chr-scene', { timeout: 8000 }).catch(() => {});

  const nightState = await S();
  if (nightState.phase !== 'night') {
    fail(`night digest: the day never reached night (phase ${nightState.phase}) — the digest row cannot run and must be repaired, not skipped`);
  } else {
    const nightControls = await sceneControls();
    log(`  controls on the glass: ${JSON.stringify(nightControls)}`);
    check(nightControls?.some((c) => /^Journal/.test(c)),
      'night digest offers a Journal route',
      `night digest has no Journal route — the only controls are ${JSON.stringify(nightControls)}. This is the surface that PRINTS "A letter waits unopened in the post tray" (AAA 4.15/11.12)`);

    const beforeNight = await S();
    let nightTaps = 0;
    const nightPressed = await tapByLabel('.chr-scene', 'Journal', 'night digest Journal aside');
    if (nightPressed) nightTaps += 1;
    await page.waitForSelector('.jrn-tabs', { timeout: 8000 }).catch(() => {});
    const afterNight = await S();

    check(afterNight.hash === '#/journal' && nightTaps > 0 && nightTaps <= 2,
      `night digest → the post tray costs ${nightTaps} tap${nightTaps === 1 ? '' : 's'} (hash ${afterNight.hash})`,
      `night digest → journal: ${nightTaps} taps, landed on ${afterNight.hash} (AAA 4.15/11.6/11.12)`);
    check(afterNight.phase === beforeNight.phase && afterNight.records === beforeNight.records,
      `night digest → Journal spends nothing: phase ${beforeNight.phase} and ${beforeNight.records} records unchanged`,
      `night digest → Journal mutated the day: ${JSON.stringify(beforeNight)} → ${JSON.stringify(afterNight)}`);

    // The Letters tab is what the digest was pointing at — it must be usable
    // the moment she lands, seal or no seal (this is the round-11 collision).
    const letters = await page.evaluate(() => {
      for (const tab of document.querySelectorAll('.jrn-tabs button')) {
        const text = (tab.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/^Letters/.test(text)) continue;
        const r = tab.getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return {
          text,
          itself: Boolean(el && (el === tab || tab.contains(el))),
          who: el ? el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '') : 'nothing',
        };
      }
      return null;
    });
    check(Boolean(letters?.itself),
      'night digest → Journal: the Letters tab answers as itself on arrival',
      `night digest → Journal: the Letters tab is answered by ${letters?.who} (AAA 11.2)`);

    await page.click('.jrn-page .backlink');
    await page.waitForSelector('.chr-scene', { timeout: 8000 }).catch(() => {});
    check(Boolean(await page.$('.chr-scene')),
      'night digest is exactly where she left it after the journal round trip',
      'night digest did not come back after the journal round trip');
    table.push({ scene: 'night digest', route: '#/journal', taps: nightTaps, spent: 'nothing', returns: 'yes' });
  }

  /* ========== 4. THE SHORT SCREEN ======================================== */
  log('');
  log('— 375x667 (the short-screen token) —');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(350);
  if (await page.$('.chr-scene')) {
    const shortControls = await sceneControls();
    check(shortControls?.some((c) => /^Journal/.test(c)),
      '375x667: the Journal aside is still on the glass',
      `375x667: the Journal aside fell off the scene — ${JSON.stringify(shortControls)}`);
    // Not a tap this time: only that it is still reachable without scrolling.
    const fits = await page.evaluate(() => {
      const scene = document.querySelector('.chr-scene');
      if (!scene) return null;
      for (const b of scene.querySelectorAll('button')) {
        if (!/^Journal/.test((b.textContent || '').replace(/\s+/g, ' ').trim())) continue;
        const r = b.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight };
      }
      return null;
    });
    check(fits && fits.top >= 0 && fits.bottom <= fits.h,
      `375x667: the Journal aside is inside the viewport (${fits?.top}..${fits?.bottom} of ${fits?.h})`,
      `375x667: the Journal aside is off-screen (${JSON.stringify(fits)}) — AAA 11.3`);
  }

  if (errors.length) fail('console/page errors: ' + errors.slice(0, 4).join(' | '));

  /* --- the artifact ------------------------------------------------------- */
  log('');
  log('| lifecycle scene | destination | taps | state spent | scene returns |');
  log('|---|---|---|---|---|');
  for (const r of table) {
    log(`| ${r.scene} | ${r.route} | ${r.taps} | ${r.spent} | ${r.returns} |`);
  }
} catch (e) {
  fail(`threw: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

log(failures
  ? `DONE WITH ${failures} FAILURE(S)`
  : 'DONE — a filed document is one tap from every lifecycle scene');
process.exit(failures ? 1 : 0);
