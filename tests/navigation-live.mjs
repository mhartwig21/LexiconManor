/**
 * tests/navigation-live.mjs — OWNER: A2 (chrome). THE LIVE EVIDENCE for the
 * round-10 navigation pass: AAA 11.7 (the destructive control's label),
 * 11.1 (the ceremony's way out), 11.8/11.23/11.26 (a fresh save can reach the
 * trunk), and the boot gate's failure face (11.1 again — a surface with no
 * controls is a dead end, and the installed PWA has no reload button).
 *
 * §0.1.7 is explicit: a screenshot is not evidence for §11 and neither is a
 * source grep. A label that is present can still be clipped off a 320px bar; a
 * button that renders can still be un-tappable; a boot screen that "has a retry
 * control" in the source can still never reach the branch that renders it. So
 * this drives the real app in a real browser and hit-tests every claim.
 *
 * Sibling file: tests/modal-hit-test.mjs, which owns the ORTHOGONAL question
 * (can the chrome be tapped THROUGH an overlay). Together they are the §0.4
 * walk for the chrome's territory. Kept separate so a failure names its own
 * defect, and so neither run needs two browsers.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser
 * instance, closed in a finally. 390x844 @2x by default.
 *
 * Run: `node tests/navigation-live.mjs`   (spawns its own vite dev server)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ANSWER = JSON.parse(
  readFileSync(resolve(ROOT, 'content/authored/volumes/volume-1.json'), 'utf8'),
).answer;

/** Every Portrait node on the after-guess slot. Marking them seen is what
 *  forces the ceremony's FALLBACK monologue (CLOSING_BEATS) — the variant the
 *  round-10 audit named, and the one with no DialogueScene to lend it exits. */
const AFTER_GUESS_IDS = (() => {
  const file = JSON.parse(
    readFileSync(resolve(ROOT, 'content/authored/dialogue/portrait.json'), 'utf8'),
  );
  return (file.nodes ?? [])
    .filter((n) => n.trigger === 'sanctum-after-guess')
    .map((n) => n.id);
})();

async function freePort(from = 5261, to = 5320) {
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

const log = (...a) => console.log('[nav]', ...a);
const ok = (m) => console.log('[nav]   ✓', m);
let failures = 0;
const fail = (m) => { console.error('[nav]   ✗ FAIL:', m); failures++; };
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };

/** The §0.4.5 artifact: one row per surface. */
const table = [];
const row = (surface, exit, hit, dest, notes) =>
  table.push({ surface, exit, hit, dest, notes });

/* --- dev server ----------------------------------------------------------- */

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--config', resolve(ROOT, 'scripts/gate-vite.config.ts'), '--port', String(PORT), '--strictPort'],
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
    const s = window.__manorStore?.getState?.();
    if (!s) return { noStore: true };
    return {
      day: s.day?.day ?? null,
      phase: s.day?.phase ?? null,
      steps: s.day ? s.stepsRemaining() : null,
      records: s.chronicles.dayRecords.length,
    };
  });

  /** Bounding box of the first element matching `sel`, or null. */
  const boxOf = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, sel);

  /** Find a visible button whose trimmed text starts with `text`. */
  const buttonBox = (text, scope = 'body') => page.evaluate(([t, sc]) => {
    const root = document.querySelector(sc);
    if (!root) return null;
    for (const b of root.querySelectorAll('button')) {
      const label = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label.toLowerCase().startsWith(t.toLowerCase())) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      return { x: r.x, y: r.y, w: r.width, h: r.height, label };
    }
    return null;
  }, [text, scope]);

  /**
   * Centre + the four inset corners (AAA 11.2 asks for all five).
   *
   * The inset scales with the box instead of being a flat 5px, because several
   * of these controls are PILLS (`border-radius: 999px`): 5px in from the
   * corner of a 44px-tall pill is outside the painted shape, so a flat inset
   * reports a phantom miss on a control no finger could actually miss there.
   * A quarter of the short side (capped at 14px) is inside every radius the
   * house uses while still probing the true corner region.
   */
  const probePoints = (box, inset = Math.max(5, Math.min(14, Math.min(box.w, box.h) / 4))) => ([
    ['centre', box.x + box.w / 2, box.y + box.h / 2],
    ['top-left', box.x + inset, box.y + inset],
    ['top-right', box.x + box.w - inset, box.y + inset],
    ['bottom-left', box.x + inset, box.y + box.h - inset],
    ['bottom-right', box.x + box.w - inset, box.y + box.h - inset],
  ]);

  /**
   * Tag the first visible button whose text starts with `text` so it can be
   * hit-tested by a stable selector. Used where the control belongs to another
   * agent's file and may not grow a test hook of its own.
   */
  const tagButton = (text, scope = 'body') => page.evaluate(([t, sc]) => {
    document.querySelectorAll('[data-navtest]').forEach((e) => e.removeAttribute('data-navtest'));
    const root = document.querySelector(sc);
    if (!root) return null;
    for (const b of root.querySelectorAll('button')) {
      const label = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label.toLowerCase().startsWith(t.toLowerCase())) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      b.setAttribute('data-navtest', '1');
      return { x: r.x, y: r.y, w: r.width, h: r.height, label };
    }
    return null;
  }, [text, scope]);

  /**
   * AAA 11.2 + 11.3 in one call: the control answers at its own centre AND at
   * all four inset corners, is at least 44x44, and sits inside the visual
   * viewport. Returns true on a clean pass.
   */
  async function assertTappable(name, sel, box) {
    const b = box ?? await boxOf(sel);
    if (!b) { fail(`${name}: no element matches ${sel} — nothing to hit-test`); return false; }
    let clean = true;
    for (const [where, x, y] of probePoints(b)) {
      // eslint-disable-next-line no-await-in-loop
      const hit = await page.evaluate(([px, py, s]) => {
        const el = document.elementFromPoint(px, py);
        if (!el) return null;
        const target = document.querySelector(s);
        const own = Boolean(target && (el === target || target.contains(el)));
        const cls = typeof el.className === 'string' ? el.className : (el.className?.baseVal ?? '');
        return { own, tag: el.tagName.toLowerCase(), cls };
      }, [x, y, sel]);
      if (!hit) { fail(`${name}: nothing at all at ${where}`); clean = false; continue; }
      if (!hit.own) {
        fail(`${name}: elementFromPoint at ${where} returned ${hit.tag}.${hit.cls}, not ${sel} or its descendant (AAA 11.2)`);
        clean = false;
      }
    }
    const vp = page.viewportSize();
    if (b.w < 44 || b.h < 44) {
      fail(`${name}: ${Math.round(b.w)}x${Math.round(b.h)} is under the 44pt floor (AAA 6.19)`);
      clean = false;
    }
    if (b.x < 0 || b.y < 0 || b.x + b.w > vp.width + 0.5 || b.y + b.h > vp.height + 0.5) {
      fail(`${name}: box ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)} is outside the ${vp.width}x${vp.height} viewport (AAA 11.3)`);
      clean = false;
    }
    if (clean) ok(`${name}: answers at its centre and four corners, ${Math.round(b.w)}x${Math.round(b.h)}, inside the viewport`);
    return clean;
  }

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

  /**
   * Tap through the morning card + Bramble to a live `exploring` blueprint.
   * Idempotent about where it starts (round 15): section 1b presses "Begin the
   * first day" itself, and the front step cannot be returned to afterwards —
   * the save is dual-written to an IndexedDB mirror (`app/platform/
   * persistence.ts`), so clearing localStorage and reloading restores the day
   * from the mirror and the fresh-save branch never renders again.
   */
  async function reachExploring() {
    const phase = await page.evaluate(() => window.__manorStore?.getState().day?.phase ?? null);
    if (phase === 'exploring') { await page.waitForSelector('.chr-retire', { timeout: 8000 }); return; }
    if (!phase) {
      await page.waitForSelector('.bp-btn--seal', { timeout: 20000 });
      await page.click('.bp-btn--seal');
    }
    await page.waitForSelector('.chr-scene', { timeout: 8000 });
    await page.click('.chr-scene__btn');
    await page.waitForSelector('.dlg', { timeout: 8000 });
    await playScene();
    await page.waitForFunction(
      () => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 },
    );
    await page.waitForSelector('.chr-retire', { timeout: 8000 });
  }

  // `domcontentloaded`, not `networkidle`: vite's first cold transform of this
  // tree keeps the socket busy well past 20s on this box, and the walk only
  // needs the app mounted — every step below waits on its own selector.
  const freshLoad = async () => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  };

  /* ======================================================================
     1. THE FRESH-SAVE FRONT STEP (AAA 11.8 / 11.23 / 11.26)
     Before any day exists: GameChrome renders null, so the ONLY navigation
     on the glass is what ManorPage's no-day branch puts there. A returning
     player restoring a save code must reach the trunk without starting a day.
     ====================================================================== */
  log('');
  log('— 1. fresh save, no day started —');
  await freshLoad();
  await page.waitForSelector('.bp-scene__title', { timeout: 20000 });

  {
    const before = await state();
    check(before.day === null,
      'front step: no day exists yet (the branch under test is the real one)',
      `front step: a day already exists (${before.day}) — the fresh-save branch was not reached`);

    const chron = await tagButton('Chronicles', '.bp-scene__row');
    if (!chron) {
      fail('front step: no "Chronicles" control on the glass — settings and the save trunk cost infinity taps (AAA 11.8/11.26)');
    } else {
      await assertTappable('front step "Chronicles"', '[data-navtest]', chron);
    }

    // TAP 1 of 2: the surface that hosts settings and the trunk.
    await page.click('.bp-scene__row button:has-text("Chronicles")').catch(async () => {
      const btns = await page.$$('.bp-scene__row button');
      for (const b of btns) if ((await b.innerText()).trim().startsWith('Chronicles')) { await b.click(); break; }
    });
    await page.waitForSelector('.chron__title', { timeout: 8000 });

    const after = await state();
    check(after.day === null && after.records === 0,
      'front step → Chronicles: no day started, no step spent, no scene consumed (AAA 11.26)',
      `front step → Chronicles: reaching the trunk COST state (day ${after.day}, ${after.records} records) — the recovery path charged admission`);

    // TAP 2 of 2: the controls themselves, at scroll 0.
    const reach = await page.evaluate(() => {
      const scroller = document.querySelector('.chron__ledger');
      const vis = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        return {
          onGlass: r.top >= sr.top - 1 && r.top < sr.bottom && r.height > 0,
          top: Math.round(r.top - sr.top),
        };
      };
      const settings = [...document.querySelectorAll('.chron__setting')][0];
      const trunk = document.querySelector('.chron__trunk button, .chron__trunk textarea');
      return {
        scrollTop: scroller ? scroller.scrollTop : -1,
        settings: vis(settings),
        trunk: vis(trunk),
      };
    });
    check(reach.settings?.onGlass && reach.trunk?.onGlass,
      `Chronicles: settings (+${reach.settings?.top}px) and the trunk (+${reach.trunk?.top}px) are both on the glass at scroll ${reach.scrollTop} — 2 taps total (AAA 11.23)`,
      `Chronicles: settings=${JSON.stringify(reach.settings)} trunk=${JSON.stringify(reach.trunk)} at scroll ${reach.scrollTop} — not reachable in the second tap`);

    // …and back out again, to the route the label names (AAA 11.6).
    await assertTappable('Chronicles back-link', '.backlink');
    await page.click('.backlink');
    await page.waitForTimeout(300);
    const dest = await page.evaluate(() => location.hash);
    check(dest === '#/' || dest === '' || dest === '#',
      `Chronicles back-link lands on the manor (${dest || '#/'})`,
      `Chronicles back-link landed on ${dest}, not the manor (AAA 11.6)`);
    const back = await state();
    check(back.day === null,
      'the whole round trip left the fresh save untouched',
      `the round trip started a day (${back.day})`);
    row('front step (no day)', 'Chronicles', 'itself', '/chronicles', 'no state mutated');
    row('/chronicles (no day)', 'BackLink "The manor"', 'itself', '/', 'settings+trunk at scroll 0');
  }

  // The same claim at the short-screen frame the token retunes for.
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(250);
  {
    const chron = await buttonBox('Chronicles', '.bp-scene__row');
    check(Boolean(chron) && chron.y + chron.h <= 667,
      'front step at 375x667: "Chronicles" is still on the glass',
      'front step at 375x667: "Chronicles" is missing or below the fold (AAA 11.3)');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);

  /* ======================================================================
     1b. THE BOOT SMOKE (AAA 11.1 / §0.4.1) — PRESS THE ONE BUTTON.

     ROUND 15, and it is the reason this row exists: the app was DEAD ON
     ARRIVAL. `engine/manor/grid.ts` called `randInt` in `deweyCell` and
     imported only `createRng`, so tapping "Begin the first day" threw
     `ReferenceError: randInt is not defined` out of BlueprintSheet, React
     unmounted the whole tree, and the screen went blank —
     `document.querySelectorAll('button')` returned ZERO controls on a surface
     with no address bar and no reload, with the store already advanced to
     `phase: 'morning'` so the save was stranded mid-day.

     The walk below reaches `exploring` and would have timed out waiting for
     `.chr-scene`, which is a failure that reads as "the harness is slow". This
     row asks the question directly and answers it in one line: press the
     button a first-time player presses, then count the controls and read the
     page errors. A blank screen photographs exactly like a working one
     (§0.1.7) and it also *times out* exactly like a busy dev server; neither
     is an acceptable way to learn the game does not start.
     ====================================================================== */
  log('');
  log('— 1b. the first tap of the game —');
  {
    const errorsBefore = errors.length;
    await page.waitForSelector('.bp-btn--seal', { timeout: 20000 });
    await page.click('.bp-btn--seal');
    // No selector to wait on: waiting on one is how a crash becomes a timeout.
    await page.waitForTimeout(1200);
    const alive = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('button')]
        .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24)),
      rootChildren: (document.getElementById('root') ?? document.getElementById('app') ?? document.body)
        .childElementCount,
      phase: window.__manorStore?.getState().day?.phase ?? null,
    }));
    const thrown = errors.slice(errorsBefore);
    check(alive.buttons.length > 0,
      `"Begin the first day": the game boots to ${alive.buttons.length} live controls [${alive.buttons.slice(0, 4).join(', ')}] at phase ${alive.phase}`,
      `"Begin the first day": ZERO controls on the glass at phase ${alive.phase} — the tree is gone and the installed PWA has no reload (AAA 11.1). ${thrown[0] ?? 'no page error captured'}`);
    check(alive.rootChildren > 0,
      'the React tree is still mounted after the first tap',
      'the app root is EMPTY after the first tap — React unmounted the tree');
    check(thrown.length === 0,
      'the first tap threw nothing',
      `the first tap threw: ${thrown.slice(0, 2).join(' | ')}`);
    row('front step → first day', '"Begin the first day"', `${alive.buttons.length} controls`, `phase ${alive.phase}`, thrown.length ? 'THREW' : 'clean');
  }
  // No return to the front step: the save is mirrored into IndexedDB, so
  // clearing localStorage and reloading restores this day rather than the
  // fresh-save branch. Section 2 picks the walk up from `morning`.

  /* ======================================================================
     2. THE RETIRE CONTROL (AAA 11.7 / 11.2 / 11.3 / 6.19)
     The one action that cannot be undone. It must READ as itself before it is
     touched — the round-6 defect was a bare `☾` in a row of currency chips,
     with the word appearing only after the first tap had armed it.
     ====================================================================== */
  log('');
  log('— 2. the retire control —');
  await reachExploring();

  {
    const face = await page.evaluate(() => {
      const b = document.querySelector('.chr-retire');
      if (!b) return null;
      const word = b.querySelector('.chr-retire__word');
      const cs = getComputedStyle(b);
      const chip = document.querySelector('.chr-chip');
      const chipCs = chip ? getComputedStyle(chip) : null;
      return {
        // What the EYE gets, not the accessible name: visible text only.
        visibleText: (word?.textContent || '').trim(),
        allText: (b.textContent || '').replace(/\s+/g, ' ').trim(),
        ariaLabel: b.getAttribute('aria-label'),
        fontSizePx: parseFloat(cs.fontSize),
        // Distinct from a currency chip, not a fourth one (AAA 11.7).
        bg: cs.backgroundColor,
        chipBg: chipCs?.backgroundColor ?? null,
        borderWidth: parseFloat(cs.borderTopWidth),
        chipBorderWidth: chipCs ? parseFloat(chipCs.borderTopWidth) : null,
      };
    });
    if (!face) fail('no .chr-retire while exploring — the control under test is missing');
    else {
      check(/retire/i.test(face.visibleText),
        `retire: the visible label is "${face.visibleText}" — a plain verb, before any tap (AAA 11.7)`,
        `retire: the visible label is "${face.visibleText}" — the recognisable word does not lead (AAA 11.7)`);
      check(!/^[^\w]*$/.test(face.allText),
        'retire: the control is not glyph-only',
        `retire: the control renders only "${face.allText}" — a bare glyph is what read as a theme toggle`);
      check(face.bg !== face.chipBg && face.borderWidth > 0 && face.chipBorderWidth === 0,
        `retire: styled as its own thing (outlined ${face.borderWidth}px on ${face.bg}) and not as a fourth currency chip (filled ${face.chipBg}, ${face.chipBorderWidth}px)`,
        `retire: shares the currency chips' treatment (bg ${face.bg} vs ${face.chipBg}, border ${face.borderWidth} vs ${face.chipBorderWidth}) — still reads as a display control`);
      check(/day|evening/i.test(face.ariaLabel || ''),
        `retire: the accessible name states the consequence — "${face.ariaLabel}"`,
        `retire: the accessible name is "${face.ariaLabel}" and does not name the consequence`);
    }

    const restBox = await boxOf('.chr-retire');
    await assertTappable('retire (unarmed)', '.chr-retire', restBox);

    // TAP 1: arms. The day must NOT end, the word must escalate to the
    // consequence, and the point the finger just used must still be inside the
    // control it has to tap again.
    const [, tapX, tapY] = probePoints(restBox)[0];
    const before = await state();
    await page.mouse.click(tapX, tapY);
    await page.waitForTimeout(200);
    const armed = await page.evaluate(([px, py]) => {
      const b = document.querySelector('.chr-retire');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(px, py);
      return {
        text: (b.textContent || '').replace(/\s+/g, ' ').trim(),
        isArmed: b.classList.contains('chr-retire--armed'),
        stillUnderFinger: Boolean(el && (el === b || b.contains(el))),
        box: { x: r.x, y: r.y, w: r.width, h: r.height },
        rightEdge: Math.round(r.right),
        vw: window.innerWidth,
        chipsVisible: [...document.querySelectorAll('.chr-chip')]
          .filter((c) => c.getBoundingClientRect().width > 0).length,
      };
    }, [tapX, tapY]);
    const mid = await state();
    check(mid.phase === before.phase && mid.records === before.records,
      'retire: one tap arms and does not end the day (the two-tap safety is intact)',
      `retire: ONE tap changed the day (${before.phase}→${mid.phase}, records ${before.records}→${mid.records})`);
    check(armed?.isArmed && /end the day/i.test(armed.text),
      `retire (armed): escalates to the consequence in words — "${armed?.text}"`,
      `retire (armed): reads "${armed?.text}" — the armed state does not state what the second tap does`);
    check(armed?.stillUnderFinger,
      'retire (armed): the point that armed it is still inside the control',
      'retire (armed): the control moved out from under the finger that armed it — the confirm tap would miss');
    check(armed && armed.rightEdge <= armed.vw + 0.5 && armed.box.x >= 0,
      `retire (armed): the plate fits the ${armed?.vw}px bar (right edge ${armed?.rightEdge})`,
      `retire (armed): right edge ${armed?.rightEdge} past the ${armed?.vw}px viewport — the confirm is clipped (AAA 11.3)`);
    check(armed && armed.box.w >= 44 && armed.box.h >= 44,
      `retire (armed): ${Math.round(armed.box.w)}x${Math.round(armed.box.h)} holds the 44pt floor`,
      `retire (armed): ${Math.round(armed?.box.w)}x${Math.round(armed?.box.h)} is under the 44pt floor (AAA 6.19)`);

    /* ROUND 26 (COMPREHENSION.md fix 9) — THE ARM HOLDS UNTIL SHE TAPS
       ELSEWHERE, and this block used to assert the opposite. The armed state
       disarmed itself after 2600ms; three of three blind testers never saw the
       confirm and all three concluded the control was broken (one pressed it
       four times over several minutes). A timeout is the wrong instrument for
       "are you sure?" — so the two gates are now: it is STILL ARMED well past
       the old timer, and a tap on anything else puts it away.
       Both can fail: a re-introduced timeout fails the first, and a listener
       that never fires (or that swallows the tap) fails the second. */
    await page.waitForTimeout(2900);
    const stillArmed = await page.evaluate(() => {
      const b = document.querySelector('.chr-retire');
      return {
        armed: b?.classList.contains('chr-retire--armed') ?? null,
        text: (b?.textContent || '').replace(/\s+/g, ' ').trim(),
      };
    });
    check(stillArmed.armed === true,
      `retire: the confirm still stands 2.9s after arming ("${stillArmed.text}") — it waits for her, not for a clock`,
      `retire: disarmed itself after 2.9s (text "${stillArmed.text}") — the timeout is back`);

    // …and her next touch anywhere else stands it down. The day numeral is the
    // safest "elsewhere" on the glass: it is in the same bar, it is not a
    // control, and tapping it cannot open a modal that would confuse the
    // assertions below.
    const dayBox = await boxOf('.chr-day');
    await page.mouse.click(dayBox.x + dayBox.w / 2, dayBox.y + dayBox.h / 2);
    await page.waitForTimeout(250);
    const disarmed = await page.evaluate(() => {
      const b = document.querySelector('.chr-retire');
      return {
        armed: b?.classList.contains('chr-retire--armed') ?? null,
        text: (b?.textContent || '').replace(/\s+/g, ' ').trim(),
        chips: [...document.querySelectorAll('.chr-chip')]
          .filter((c) => c.getBoundingClientRect().width > 0).length,
        phase: window.__manorStore?.getState?.().day?.phase ?? null,
      };
    });
    check(disarmed.armed === false && /retire/i.test(disarmed.text),
      `retire: a tap elsewhere stands it down to "${disarmed.text}"`,
      `retire: still armed after a tap elsewhere (text "${disarmed.text}")`);
    check(disarmed.phase === 'exploring',
      'retire: standing down did not end the day',
      `retire: the day ended on a tap that was not the confirm (phase ${disarmed.phase})`);
    check(disarmed.chips === 3,
      'retire: the three currency chips are back on the bar after disarm (AAA 11.16)',
      `retire: ${disarmed.chips} currency chips visible after disarm — the bar did not recover`);
    row('blueprint chrome', '.chr-retire', 'itself', 'arms, then ends the day', `label "${disarmed.text}"`);

    // The narrow frame the round-6 pass measured the overflow on.
    await page.setViewportSize({ width: 320, height: 844 });
    await page.waitForTimeout(300);
    const narrow = await boxOf('.chr-retire');
    check(narrow && narrow.x >= 0 && narrow.x + narrow.w <= 320.5,
      `retire at 320px: the labelled plate still fits (${Math.round(narrow?.x)}..${Math.round(narrow?.x + narrow?.w)})`,
      `retire at 320px: box ${Math.round(narrow?.x)}..${Math.round(narrow?.x + narrow?.w)} runs off a 320px bar (AAA 11.3)`);
    const narrowWord = await page.evaluate(() =>
      (document.querySelector('.chr-retire__word')?.textContent || '').trim());
    check(/retire/i.test(narrowWord),
      `retire at 320px: the word survives the breakpoint ("${narrowWord}")`,
      `retire at 320px: the label was dropped ("${narrowWord}") — back to a bare glyph`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);

    // §0.4 pass 2: prefers-reduced-motion on. A player who turned motion off is
    // the LAST person who should have to guess what the moon means, and the
    // arming state must still be legible without the press animation.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(200);
    const reduced = await boxOf('.chr-retire');
    await assertTappable('retire (reduced motion)', '.chr-retire', reduced);
    const reducedWord = await page.evaluate(() =>
      (document.querySelector('.chr-retire__word')?.textContent || '').trim());
    check(/retire/i.test(reducedWord),
      `retire (reduced motion): the label still reads "${reducedWord}" (AAA U.3 / 11.22)`,
      `retire (reduced motion): the label read "${reducedWord}"`);
  }

  /* ======================================================================
     3. THE VICTORY CEREMONY'S WAY OUT (AAA 11.1)
     `won-reveal` and the CLOSING_BEATS variant of `won-portrait` advanced
     forward only, with no auto-advance — the campaign's single unrepeatable
     scene was the one surface in the app with no exit.
     ====================================================================== */
  log('');
  log('— 3. the victory ceremony (run under prefers-reduced-motion) —');
  {
    // Left on from the pass above, deliberately: the ceremony is the most
    // animated surface in the game, so it is the one whose exit most needs to
    // be proven present and tappable with the motion stripped (AAA U.3/11.22).
    // Force the FALLBACK monologue: with every after-guess node already seen,
    // selection comes back empty and CLOSING_BEATS plays. That is the variant
    // with no DialogueScene to borrow exits from.
    await page.evaluate((ids) => {
      const store = window.__manorStore;
      const s = store.getState();
      store.setState({ seenNodeIds: [...new Set([...s.seenNodeIds, ...ids])] });
      const cell = { col: 2, row: 5 };
      store.setState({
        manor: {
          ...s.manor,
          playerCell: cell,
          rooms: {
            ...s.manor.rooms,
            '2,5': { cardId: 'reading-nook', cell, doors: ['N', 'S'], solved: false, kind: 'parlor' },
          },
        },
      });
    }, AFTER_GUESS_IDS);
    await page.evaluate(() => { location.hash = '#/sanctum'; });
    await page.waitForSelector('.snc-input', { timeout: 8000 });
    await page.fill('.snc-input', ANSWER);
    await page.click('.snc-speak');
    await page.waitForSelector('.snc-won', { timeout: 8000 });

    const revealExit = await tagButton('Let the house sleep', '.snc-page');
    if (!revealExit) {
      fail('won-reveal: no control returns toward the blueprint — the ceremony is a one-way surface (AAA 11.1)');
    } else {
      await assertTappable('won-reveal "Let the house sleep"', '[data-navtest]', revealExit);
      row('sanctum won-reveal', 'Let the house sleep', 'itself', '/ (volume closed)', 'plus forward "Look up at the Portrait"');
    }

    // Forward into the CLOSING_BEATS monologue and assert the same there.
    await page.click('.snc-page button:has-text("Look up at the Portrait")');
    await page.waitForTimeout(350);
    const variant = await page.evaluate(() => ({
      dlg: Boolean(document.querySelector('.dlg')),
      beats: Boolean(document.querySelector('.snc-line')),
    }));
    check(!variant.dlg,
      'won-portrait: the fallback CLOSING_BEATS variant is on the glass (the one the audit named)',
      'won-portrait: an authored DialogueScene played instead — the CLOSING_BEATS branch was not exercised; the seen-node seeding needs repair, not skipping');
    const beatExit = await buttonBox('Let the house sleep', '.snc-page');
    check(Boolean(beatExit) && beatExit.y >= 0 && beatExit.y + beatExit.h <= 844,
      `won-portrait (beat 1): "Let the house sleep" is on the glass, ${Math.round(beatExit?.h)}px tall`,
      'won-portrait (beat 1): no control returns toward the blueprint (AAA 11.1)');

    // Tap to the LAST beat and assert it too — 11.1 is a per-surface promise
    // and each beat repaints the surface.
    for (let i = 0; i < 4; i++) {
      const last = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.snc-page button')]
          .find((x) => (x.textContent || '').trim() === 'Let him rest');
        return Boolean(b);
      });
      if (last) break;
      await page.click('.snc-page button:has-text("…")').catch(() => {});
      await page.waitForTimeout(250);
    }
    const lastExit = await buttonBox('Let the house sleep', '.snc-page');
    check(Boolean(lastExit),
      'won-portrait (last beat): the exit is still offered',
      'won-portrait (last beat): the exit disappeared on the final beat (AAA 11.1)');

    // And it actually does what it says: closes the volume and goes home.
    if (lastExit) {
      await page.mouse.click(lastExit.x + lastExit.w / 2, lastExit.y + lastExit.h / 2);
      await page.waitForTimeout(500);
      const landed = await page.evaluate(() => ({
        hash: location.hash,
        onManor: Boolean(document.querySelector('.bp-page, .chr-scene')),
      }));
      check((landed.hash === '#/' || landed.hash === '' || landed.hash === '#') && landed.onManor,
        `won-portrait: the exit lands on the manor (${landed.hash || '#/'}) — it goes where it says (AAA 11.6)`,
        `won-portrait: the exit landed on ${landed.hash}, onManor=${landed.onManor}`);
      row('sanctum won-portrait (CLOSING_BEATS)', 'Let the house sleep', 'itself', '/ (volume closed, day ended)', 'offered on every beat');
    }
  }

  /* ======================================================================
     4. THE BOOT GATE (AAA 11.1 / 11.26)
     With the content chunk unreachable the old gate was a permanent dead end:
     one italic line, no controls, retrying forever, in a window with no
     reload. It must say so, offer a retry, and keep the trunk reachable.
     ====================================================================== */
  log('');
  log('— 4. the boot gate under a stalled content fetch —');
  {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    let blocking = true;
    // content/* is reached ONLY through app/pools.ts's dynamic import() (there
    // is no static content import left in src/), so aborting these URLs
    // reproduces exactly the shipping failure: the shell paints, the lazy
    // content chunk never arrives.
    // NB the pattern: `**/content/**` also matches `src/app/content/volumes.ts`,
    // a source module the shell needs to boot at all — blocking that produced
    // an empty <div id="root"> and a false pass on "the gate has no controls".
    // Only the two authored/generated JSON trees are the content chunk.
    const POOL_URLS = ['**/content/generated/**', '**/content/authored/**'];
    for (const pattern of POOL_URLS) {
      // eslint-disable-next-line no-await-in-loop
      await page.route(pattern, (route) => {
        if (blocking) route.abort('failed'); else route.continue();
      });
    }
    // A cache-busting query, because `goto(BASE)` from `BASE#/` differs only by
    // fragment and Chromium treats that as a same-document navigation — the
    // module graph would never be re-evaluated and the pools would still be
    // loaded from the previous section.
    await page.goto(`${BASE}?boot=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    // Back to a fresh save so the recovery assertion below has one known
    // landing (the front step) rather than whatever the ceremony left behind.
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });

    // Quiet first: the waking face has no controls, and should not.
    const waking = await page.waitForSelector('.boot__waking', { timeout: 10000 })
      .then(() => true, () => false);
    check(waking,
      'boot gate: the quiet waking face renders first (a slow fetch is not accused of being a stall)',
      'boot gate: the waking face never rendered');
    if (!waking) {
      const dump = await page.evaluate(() => document.body.innerHTML.slice(0, 400));
      log('   (body was:', dump.replace(/\s+/g, ' '), ')');
    }

    // …then the door. 4 attempts x 800ms plus the aborted round trips.
    const stalled = await page.waitForSelector('.boot__title', { timeout: 20000 })
      .then(() => true, () => false);
    check(stalled,
      'boot gate: after the retry budget it stops being silent and shows a surface with controls (AAA 11.1)',
      'boot gate: still showing an italic line with nothing to tap after 20s — the permanent dead end is intact');

    if (stalled) {
      await assertTappable('boot gate retry', '.boot__btn');
      await assertTappable('boot gate → Chronicles', '.boot__aside');

      // The trunk, from a house that will not open (AAA 11.26).
      await page.click('.boot__aside');
      await page.waitForSelector('.chron__title', { timeout: 8000 });
      const trunkHere = await page.evaluate(() => {
        const t = document.querySelector('.chron__trunk textarea, .chron__trunk button');
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { onGlass: r.height > 0 && r.top < window.innerHeight };
      });
      check(trunkHere?.onGlass,
        'boot gate → Chronicles: the travelling trunk is on the glass even with no content pools (AAA 11.26)',
        'boot gate → Chronicles: the trunk is not reachable from the stalled gate');
      row('boot gate (stalled)', 'Chronicles', 'itself', '/chronicles', 'trunk usable with no pools');

      // Back to the gate rather than to a blank route.
      await assertTappable('Chronicles back-link (no pools)', '.backlink');
      await page.click('.backlink');
      await page.waitForTimeout(300);
      const home = await page.evaluate(() => Boolean(document.querySelector('.boot__title, .boot__waking')));
      check(home,
        'Chronicles → back lands on the boot gate, not on a blank route (AAA 11.6)',
        'Chronicles → back landed on nothing — the gate does not own the fallback route');
      row('boot gate (stalled)', 'Knock again', 'itself', 're-arms the loader', '');

      // And the retry actually recovers once the network does.
      blocking = false;
      const btnThere = await page.waitForSelector('.boot__btn', { timeout: 8000 })
        .then(() => true, () => false);
      if (!btnThere) fail('boot gate: "Knock again" was not on the glass after the Chronicles round trip');
      await Promise.all([
        page.waitForLoadState('domcontentloaded'),
        page.click('.boot__btn'),
      ]).catch((e) => log('   (retry click:', e.message, ')'));
      // Any manor surface will do — which one depends on what the save that
      // survived the flush-on-pagehide happens to hold. What is being asserted
      // is that the GATE is gone and the game is mounted.
      const woke = await page.waitForFunction(
        () => !document.querySelector('.boot') &&
          Boolean(document.querySelector('.bp-page, .bp-scene, .chr-scene')),
        null, { timeout: 30000 },
      ).then(() => true, () => false);
      check(woke,
        'boot gate: "Knock again" wakes the manor once the fetch can land',
        'boot gate: "Knock again" did not recover the app');
      if (!woke) {
        const dump = await page.evaluate(() => ({
          url: location.href,
          body: document.body.innerHTML.replace(/\s+/g, ' ').slice(0, 300),
        }));
        log('   (after retry:', dump.url, '|', dump.body, ')');
      }
    }
    for (const pattern of POOL_URLS) await page.unroute(pattern);
  }

  if (errors.length) {
    // The aborted content fetches log as console errors by design; only
    // anything else is a real problem.
    const real = errors.filter((e) => !/Failed to fetch|net::ERR_FAILED|dynamically imported module/i.test(e));
    if (real.length) fail('console/page errors: ' + real.slice(0, 4).join(' | '));
    else ok(`only the deliberately aborted content fetches logged (${errors.length} suppressed)`);
  }

  /* --- the artifact ------------------------------------------------------- */
  log('');
  log('| surface | exit control | hit test | destination | notes |');
  log('|---|---|---|---|---|');
  for (const r of table) log(`| ${r.surface} | ${r.exit} | ${r.hit} | ${r.dest} | ${r.notes} |`);
} catch (e) {
  fail(`threw: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

log(failures ? `DONE WITH ${failures} FAILURE(S)` : 'DONE — every surface in the walk has a labelled, tappable way out');
process.exit(failures ? 1 : 0);
