/**
 * tests/modal-hit-test.mjs — OWNER: A2 (chrome). THE LIVE EVIDENCE for
 * AAA 11.5 (chrome does not reach through an overlay) and 11.4 (nothing
 * load-bearing under a fixed layer).
 *
 * §0.1.7 is explicit: a screenshot is not evidence for §11, and neither is a
 * source grep. A control buried under a fixed bar photographs exactly like a
 * working one, and a CSS rule that is present can still be out-specified. So
 * this drives the real app in a real browser and asks the only question that
 * matters — `document.elementFromPoint` at the destructive control, with each
 * overlay open — and then goes further: it TAPS there twice and asserts the
 * day did not end.
 *
 * THE DEFECT BEING REGRESSION-TESTED
 * `.chr-header` and `.dlg` and `.bp-modal` all carried `z-index: 40`, and
 * <GameChrome /> mounts after the router, so the day bar painted and
 * hit-tested ON TOP of every "modal" scene. `.chr-retire` sits in that band:
 * two taps and the evening is over. During a draft and during a parlor
 * conversation, that control was live over a scene the player believed was
 * modal.
 *
 * ALSO MEASURED HERE: the bar's real height against `--chrome-h`, at both
 * viewport heights the token is declared for, and the blueprint's clearance
 * against the bar. The lint (scripts/lint-chrome-clearance.mjs) proves no
 * literal is written down; only a browser can prove the arithmetic lands.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser
 * instance, closed in a finally. 390x844 @2x.
 *
 * Run: `node tests/modal-hit-test.mjs`   (spawns its own vite dev server)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The word the door wants, read from the authored volume rather than typed
 *  here — a re-authored answer must not silently skip the ceremony row. */
const VOLUME = JSON.parse(
  readFileSync(resolve(ROOT, 'content/authored/volumes/volume-1.json'), 'utf8'),
);
const ANSWER = VOLUME.answer;
/** Real fragment ids, so the journal row raises a REAL campaign seal. */
const FRAGMENT_IDS = VOLUME.fragments.map((f) => f.id);

/** Agents share this checkout and each other's ports; take one that is free. */
async function freePort(from = 5199, to = 5260) {
  for (let p = from; p <= to; p++) {
    // Both loopback families: sibling dev servers on this box bind ::1, and a
    // 127.0.0.1-only probe cheerfully reports those ports free.
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

const log = (...a) => console.log('[hit-test]', ...a);
const ok = (m) => console.log('[hit-test]   ✓', m);
let failures = 0;
const fail = (m) => { console.error('[hit-test]   ✗ FAIL:', m); failures++; };
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };

/** The §0.4.5 artifact: one row per surface. */
const table = [];

/* --- dev server ----------------------------------------------------------- */

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
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  /* --- helpers ------------------------------------------------------------ */

  const state = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    return {
      phase: s.day?.phase ?? null,
      day: s.day?.day ?? null,
      steps: s.stepsRemaining(),
      records: s.chronicles.dayRecords.length,
      retireInDom: Boolean(document.querySelector('.chr-retire')),
    };
  });

  /** What actually takes a tap at this point, and whose it is. */
  const hitAt = (x, y) => page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return null;
    const cls = typeof el.className === 'string' ? el.className : (el.className?.baseVal ?? '');
    return {
      tag: el.tagName.toLowerCase(),
      cls,
      isRetire: Boolean(el.closest('.chr-retire')),
      inChrome: Boolean(el.closest('.chr-header')),
      // `[data-overlay]` is the published opt-in (ui/chrome/layers.ts). It is
      // in this list because the Sanctum's victory ceremony uses it — the
      // round-9 blocker was that the ceremony was NOT any of the three class
      // names, so both locks were bypassed on the one unrepeatable scene.
      inOverlay: Boolean(el.closest('.dlg, .bp-modal, .chr-scene, [data-overlay]')),
    };
  }, [x, y]);

  const boxOf = async (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, sel);

  /** Tap a dialogue scene to its end: choices first, then advance taps. */
  async function playScene() {
    for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
      const primary = await page.$('.dlg-choice--primary');
      if (primary) { await primary.click(); await page.waitForTimeout(220); continue; }
      const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
      if (choice) { await choice.click(); await page.waitForTimeout(220); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      await page.waitForTimeout(200);
    }
    if (await page.$('.dlg')) fail('a dialogue scene never closed — the walk cannot continue');
  }

  /** Centre + the four inset corners (AAA 11.2 asks for all five). */
  const probePoints = (box, inset = 5) => ([
    ['centre', box.x + box.w / 2, box.y + box.h / 2],
    ['top-left', box.x + inset, box.y + inset],
    ['top-right', box.x + box.w - inset, box.y + inset],
    ['bottom-left', box.x + inset, box.y + box.h - inset],
    ['bottom-right', box.x + box.w - inset, box.y + box.h - inset],
  ]);

  /**
   * The whole point, in one function: with `overlaySel` open, nothing in the
   * chrome may answer at the retire moon's coordinates, the control must not
   * be in the DOM at all, and two taps there must not end the day.
   */
  async function assertModal(name, overlaySel, retireBox) {
    await page.waitForSelector(overlaySel, { timeout: 8000 });
    const before = await state();
    let worst = 'overlay';
    const probes = probePoints(retireBox).length;
    const failedBefore = failures;

    for (const [where, x, y] of probePoints(retireBox)) {
      const hit = await hitAt(x, y);
      if (!hit) { fail(`${name}: nothing at all at the retire ${where}`); worst = 'nothing'; continue; }
      if (hit.isRetire) {
        fail(`${name}: elementFromPoint at the retire ${where} returned .chr-retire THROUGH the overlay — the day-ending control is live over a modal scene (AAA 11.5)`);
        worst = '.chr-retire';
      } else if (hit.inChrome) {
        fail(`${name}: the chrome (${hit.tag}.${hit.cls}) answers at the retire ${where} through the overlay — the bar must be pointer-inert while a scene is up`);
        worst = '.chr-header';
      } else if (!hit.inOverlay) {
        fail(`${name}: the retire ${where} is answered by ${hit.tag}.${hit.cls}, which is neither the chrome nor the overlay — unexpected layer`);
        worst = hit.cls || hit.tag;
      }
    }
    if (failures === failedBefore) {
      ok(`${name}: all ${probes} hit-test points in the retire moon's band are answered by the overlay, not the chrome`);
    }

    // Lock 2, the React one. The CSS lock above is instantaneous (it was
    // asserted on the very frame the overlay appeared); this one is paced by
    // an observer callback and a render, so it gets a beat — but only a beat,
    // and it must land or the guarantee rests on `:has()` alone.
    const unmounted = await page.waitForFunction(
      () => !document.querySelector('.chr-retire'), null, { timeout: 1500 },
    ).then(() => true, () => false);
    check(unmounted,
      `${name}: the retire control is not rendered while the scene is up`,
      `${name}: .chr-retire is still mounted behind the overlay after 1.5s — DayHeader's overlay guard did not fire`);

    // The destructive proof: two taps where the moon was.
    const [, cx, cy] = probePoints(retireBox)[0];
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(120);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(250);
    const after = await state();
    check(after.phase === 'exploring' || after.phase === before.phase,
      `${name}: two taps at the retire moon did not end the day (phase ${before.phase} → ${after.phase})`,
      `${name}: two taps at the retire moon ENDED THE DAY (phase ${before.phase} → ${after.phase})`);
    check(after.records === before.records,
      `${name}: no day was banked by tapping through the scene`,
      `${name}: a day record was written — the evening was retired through a modal`);

    table.push({ surface: name, overlay: overlaySel, hit: worst, retireMounted: !unmounted, dayEnded: after.records !== before.records });
  }

  /* --- the walk ----------------------------------------------------------- */

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title', { timeout: 20000 });

  // The bar's own geometry, measured against the token (AAA 11.4).
  async function assertBarHeight(label) {
    const m = await page.evaluate(() => {
      const bar = document.querySelector('.chr-header');
      if (!bar) return null;
      const token = getComputedStyle(document.documentElement).getPropertyValue('--chrome-h').trim();
      const page1 = document.querySelector('.bp-page');
      return {
        measured: Math.round(bar.getBoundingClientRect().height),
        token: parseFloat(token),
        pagePadTop: page1 ? Math.round(parseFloat(getComputedStyle(page1).paddingTop)) : null,
      };
    });
    if (!m) { fail(`${label}: no .chr-header on the page`); return; }
    // Desktop Edge reports env(safe-area-inset-top) as 0, so the bar should
    // measure the token exactly. On device the same expression adds the band.
    check(m.measured === m.token,
      `${label}: the bar measures ${m.measured}px and --chrome-h is ${m.token}px — one number, both ends`,
      `${label}: the bar measures ${m.measured}px but --chrome-h is ${m.token}px — clearance and chrome have drifted (AAA 11.4)`);
    if (m.pagePadTop !== null) {
      check(m.pagePadTop >= m.measured,
        `${label}: the blueprint clears the bar (${m.pagePadTop}px >= ${m.measured}px)`,
        `${label}: the blueprint reserves ${m.pagePadTop}px for a ${m.measured}px bar — its top band is buried`);
    }
  }

  // 1. Fresh save → the front step → the morning card (.chr-scene).
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene', { timeout: 8000 });
  await assertBarHeight('morning card');
  {
    // No retire moon in `morning` by phase, so probe the band it lives in:
    // the right-hand cluster of the bar. Nothing there may answer.
    const bar = await boxOf('.chr-header');
    const slot = { x: bar.x + bar.w - 56, y: bar.y + 4, w: 48, h: Math.max(24, bar.h - 8) };
    await assertModal('morning card (.chr-scene)', '.chr-scene', slot);
  }

  // 2. Into Mrs. Bramble's morning scene (.dlg).
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.dlg', { timeout: 8000 });
  {
    const bar = await boxOf('.chr-header');
    const slot = { x: bar.x + bar.w - 56, y: bar.y + 4, w: 48, h: Math.max(24, bar.h - 8) };
    await assertModal('morning conversation (.dlg)', '.dlg', slot);
  }

  // Tap through the scene until the blueprint is live (same shape as the
  // smoke test's playScene: choices first, then advance taps).
  await playScene();
  await page.waitForFunction(
    () => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 },
  );
  await page.waitForSelector('.chr-retire', { timeout: 8000 });
  await assertBarHeight('blueprint, exploring');

  // 3. BASELINE — with no overlay the moon must be hit-testable itself, or
  //    everything below is passing for the wrong reason.
  const retireBox = await boxOf('.chr-retire');
  if (!retireBox) throw new Error('no .chr-retire while exploring — the baseline cannot be taken');
  {
    let clean = true;
    for (const [where, x, y] of probePoints(retireBox)) {
      const hit = await hitAt(x, y);
      if (!hit?.isRetire) { fail(`baseline: the retire moon's ${where} is answered by ${hit?.tag}.${hit?.cls} — the control is buried even with no overlay (AAA 11.2)`); clean = false; }
    }
    if (clean) ok('baseline: with no overlay the retire moon answers at its centre and all four inset corners');
    table.push({ surface: 'blueprint, no overlay', overlay: '—', hit: '.chr-retire', retireMounted: true, dayEnded: false });
  }

  // 4. The Floorplan Cabinet (.bp-modal).
  await page.click('.bp-btn--quiet:text("Cabinet")').catch(async () => {
    const buttons = await page.$$('.bp-btn--quiet');
    for (const b of buttons) if ((await b.innerText()).trim() === 'Cabinet') { await b.click(); break; }
  });
  await assertModal('floorplan cabinet (.bp-modal)', '.bp-modal', retireBox);
  await page.evaluate(() => {
    document.querySelectorAll('.bp-modal__foot button, .bp-modal__foot--center button')
      .forEach((b) => { if (/close|done|back/i.test(b.textContent || '')) b.click(); });
  });
  await page.waitForTimeout(300);
  if (await page.$('.bp-modal')) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  if (await page.$('.bp-modal')) { await page.mouse.click(195, 700); await page.waitForTimeout(200); }

  // 5. A draft (.bp-modal, the audited case — a step is spent to open it).
  await page.waitForSelector('.bp-ghost', { timeout: 8000 });
  await page.click('.bp-ghost');
  await assertModal('draft offer (.bp-modal)', '.bp-modal', retireBox);
  await page.evaluate(() => window.__manorStore.getState().cancelDraft());
  await page.waitForTimeout(250);

  // 6. A parlor conversation during exploring (.dlg) — the shape the audit
  //    named. The room under her feet is turned into a parlor through the
  //    store so the scene is reachable deterministically; everything after
  //    that is the real UI (the "Call on …" verb, A6's real scene).
  await page.evaluate(() => {
    const store = window.__manorStore;
    const s = store.getState();
    const cell = s.manor.playerCell;
    const key = `${cell.col},${cell.row}`;
    const room = s.manor.rooms[key];
    store.setState({
      manor: {
        ...s.manor,
        rooms: { ...s.manor.rooms, [key]: { ...room, cardId: 'reading-nook', kind: 'parlor', solved: false } },
      },
    });
  });
  await page.waitForTimeout(200);
  const callOn = await page.$$('.bp-btn');
  for (const b of callOn) {
    if (/^Call on/.test((await b.innerText()).trim())) { await b.click(); break; }
  }
  await assertModal('parlor conversation (.dlg)', '.dlg', retireBox);
  await playScene();

  // 6b. THE JOURNAL, WITH A CAMPAIGN SEAL UP (round-11 major, AAA 11.2/11.4).
  //
  //     The moment layer is fixed and clears the shell by tokens: --chrome-h
  //     (the bar) + --tap-target (the back row). That is the shape of
  //     /chronicles, /sanctum and the rooms. The JOURNAL has a SECOND
  //     navigation band — the four ribbon tabs — below the back row, and
  //     nothing accounted for it: measured, the seal's box was 12,108,366x143,
  //     the tabs' tops were at y~139, and `elementFromPoint` at every tab's
  //     centre returned a node inside `.mom`. The seal is itself tappable, so
  //     reaching for "Testimony" put the notice away instead — on the screen
  //     the seal's own trace line ("Filed in the Journal · Testimony") had just
  //     named, for 5.6s per queued grant, and grants QUEUE.
  //
  //     This row exists because the second band was forgettable ONCE. It fails
  //     loudly if no seal mounts, so it can never pass by having nothing on the
  //     glass to collide with.
  {
    const drainMoments = async () => {
      for (let i = 0; i < 25; i++) {
        const b = await boxOf('.mom');
        if (!b) return;
        await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
        await page.waitForTimeout(160);
      }
    };
    await drainMoments();
    await page.evaluate(() => { location.hash = '#/journal'; });
    await page.waitForSelector('.jrn-tabs', { timeout: 8000 });
    // File on the journal, which is exactly where the player stands when a
    // room's grant lands and she has followed the trace line (AAA 11.11).
    await page.evaluate((ids) => {
      const store = window.__manorStore;
      const s = store.getState();
      // Re-file even if the walk already found them: the seal fires on the
      // transition, not on the count.
      store.setState({ volume: { ...s.volume, foundFragmentIds: s.volume.foundFragmentIds.filter((f) => !ids.includes(f)) } });
      for (const id of ids) store.getState().fileFragment(id);
    }, FRAGMENT_IDS.slice(0, 3));
    await page.waitForTimeout(500);

    const sealBox = await boxOf('.mom');
    check(Boolean(sealBox && sealBox.h > 0),
      'journal: a campaign seal is on the glass — the collision this row tests is real',
      'journal: no .mom mounted after filing three fragments — this row cannot prove anything and must be repaired, not skipped');

    if (sealBox) {
      const probe = await page.evaluate(() => {
        const seal = document.querySelector('.mom');
        const out = { seal: null, tabs: [] };
        if (seal) {
          const r = seal.getBoundingClientRect();
          out.seal = { top: Math.round(r.top), bottom: Math.round(r.bottom) };
        }
        for (const tab of document.querySelectorAll('.jrn-tabs button')) {
          const r = tab.getBoundingClientRect();
          const label = (tab.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20);
          if (r.width < 1 || r.height < 1) { out.tabs.push({ label, box: false }); continue; }
          // Centre AND the four inset corners — AAA 11.2 asks for all five.
          const points = [
            ['centre', r.x + r.width / 2, r.y + r.height / 2],
            ['top-left', r.x + 5, r.y + 5],
            ['top-right', r.x + r.width - 5, r.y + 5],
            ['bottom-left', r.x + 5, r.y + r.height - 5],
            ['bottom-right', r.x + r.width - 5, r.y + r.height - 5],
          ];
          const bad = [];
          for (const [where, x, y] of points) {
            const el = document.elementFromPoint(x, y);
            if (!el || !(el === tab || tab.contains(el))) {
              const cls = el && typeof el.className === 'string' ? el.className : '';
              bad.push(`${where}→${el ? el.tagName.toLowerCase() : 'nothing'}${cls ? '.' + cls.split(' ')[0] : ''}`);
            }
          }
          out.tabs.push({
            label, box: true, bad,
            inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
            top: Math.round(r.top),
          });
        }
        return out;
      });
      log(`  journal: seal ${probe.seal?.top}..${probe.seal?.bottom}; tabs at ${probe.tabs.map((t) => t.top).join(', ')}`);
      check(probe.tabs.length === 4,
        `journal: all four ribbon tabs are rendered (${probe.tabs.map((t) => t.label).join(', ')})`,
        `journal: expected 4 ribbon tabs, found ${probe.tabs.length} — the row is probing the wrong band`);
      for (const t of probe.tabs) {
        check(t.box && t.bad.length === 0 && t.inViewport,
          `journal tab "${t.label}": answers as itself at its centre and all four inset corners with a seal up`,
          `journal tab "${t.label}": ${t.bad?.length ? t.bad.join(', ') : 'no box'} — the moment seal covers the journal's own navigation (AAA 11.2/11.4)`);
      }
      // The back row must survive the new clearance too: pushing the seal down
      // past the tabs must not have pushed it onto anything else.
      const back = await page.evaluate(() => {
        const btn = document.querySelector('.jrn-page .backlink');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return {
          itself: Boolean(el && (el === btn || btn.contains(el))),
          who: el ? el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '') : 'nothing',
        };
      });
      if (back) {
        check(back.itself,
          'journal back-link: still answers as itself with the seal up',
          `journal back-link: answered by ${back.who} (AAA 11.2)`);
      }
      table.push({
        surface: 'journal, campaign seal up',
        overlay: '.mom',
        hit: probe.tabs.every((t) => t.box && t.bad.length === 0) ? '.jrn-tab (itself)' : '.mom',
        retireMounted: false,
        dayEnded: false,
      });
      await drainMoments();
    }
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForTimeout(250);
  }

  // 7. THE VICTORY CEREMONY (.snc-page[data-overlay]) — the round-9 blocker.
  //
  //    The ceremony renders `.snc-page`, a ROUTE surface, not `.dlg`/`.bp-modal`
  //    /`.chr-scene`. So OVERLAY_SELECTOR did not match it, `<html>` carried no
  //    `data-overlay-open`, the `:has()` rule never fired and DayHeader never
  //    unmounted the moon: `.chr-retire` was live at 334,4,44x44 over the
  //    won-reveal card, and two taps there ENDED THE DAY mid-ceremony (phase
  //    exploring → dusk, dayRecords 0 → 1, the veil falling over "Look up at
  //    the Portrait"). This is the one scene in the game that cannot be
  //    replayed, so it gets its own row forever.
  //
  //    The word is typed into the real input and spoken with the real button —
  //    only the route is jumped, exactly as a player who climbed there arrives.
  //
  //    Round 8 made the door a PLACE (engine/manor/grid.atSanctumDoor): the
  //    guess box mounts only on the landing (2,5) with a matched north door
  //    overhead. That gate is the mystery owner's and stays exactly as it is —
  //    this row stands her on the landing through the store, then types and
  //    speaks with the real controls.
  await page.evaluate(() => {
    const store = window.__manorStore;
    const s = store.getState();
    const cell = { col: 2, row: 5 };
    store.setState({
      manor: {
        ...s.manor,
        playerCell: cell,
        rooms: {
          ...s.manor.rooms,
          '2,5': {
            cardId: 'reading-nook', cell, doors: ['N', 'S'],
            solved: false, kind: 'parlor',
          },
        },
      },
    });
  });
  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForSelector('.snc-input', { timeout: 8000 }).catch(() => {
    fail('victory ceremony: the guess box never mounted — the landing setup no longer satisfies atSanctumDoor(); the ceremony row cannot run and must be repaired, not skipped');
  });
  await page.fill('.snc-input', ANSWER);
  await page.click('.snc-speak');
  await page.waitForSelector('.snc-won', { timeout: 8000 });
  await assertModal('victory ceremony (.snc-page[data-overlay])', '.snc-won', retireBox);
  {
    // 11.1: the ceremony is leavable. Whatever beat the two probe taps left it
    // on, a labelled control must be on the glass and hit-test as itself.
    const exit = await page.evaluate(() => {
      // Whatever beat the probe taps left it on — the reveal card, the
      // Portrait's authored monologue, the epilogue — SOMETHING labelled must
      // be on the glass and answer as itself. The moment seal (z 100) does not
      // count: it clears the chrome band by geometry and is not an exit.
      const scope = document.querySelector('.snc-page[data-overlay]');
      if (!scope) return { none: 'the ceremony surface is gone' };
      for (const btn of scope.querySelectorAll('button')) {
        const r = btn.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const answersItself = Boolean(el && (el === btn || btn.contains(el)));
        if (!answersItself) continue;
        return {
          text: (btn.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
          inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
          answersItself: true,
        };
      }
      return { none: `${scope.querySelectorAll('button').length} buttons, none answering at its own centre` };
    });
    if (exit && exit.none) { fail(`victory ceremony: no usable control — ${exit.none} (AAA 11.1/11.2)`); }
    if (!exit || exit.none) { /* already reported above */ }
    else {
      check(exit.answersItself && exit.inViewport,
        `victory ceremony: "${exit.text}" is above the fold and answers at its own centre`,
        `victory ceremony: "${exit.text}" inViewport=${exit.inViewport} answersItself=${exit.answersItself} (AAA 11.2/11.3)`);
    }
  }
  // Back to a place the rest of the walk can stand on.
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(250);

  // 8. The short-screen breakpoint: --chrome-h drops to 50px there, and the
  //    bar has to drop with it or every clearance in the app is 2px of lie.
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(300);
  await assertBarHeight('375x667 (short-screen token)');

  if (errors.length) fail('console/page errors: ' + errors.slice(0, 4).join(' | '));

  /* --- the artifact ------------------------------------------------------- */
  log('');
  log('| surface | overlay | who answers at the retire moon | retire mounted | day ended |');
  log('|---|---|---|---|---|');
  for (const r of table) {
    log(`| ${r.surface} | ${r.overlay} | ${r.hit} | ${r.retireMounted ? 'yes' : 'no'} | ${r.dayEnded ? 'YES' : 'no'} |`);
  }
} catch (e) {
  fail(`threw: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

log(failures ? `DONE WITH ${failures} FAILURE(S)` : 'DONE — the chrome cannot be tapped through any overlay');
process.exit(failures ? 1 : 0);
