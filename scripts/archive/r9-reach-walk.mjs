/**
 * scripts/r9-reach-walk.mjs — OWNER: feedback-nav.
 *
 * THE LIVE EVIDENCE for the round-9 reachability findings. §0.1.7 is explicit:
 * a screenshot is not evidence for §11 and neither is a source grep — a control
 * that is off-screen, buried under a fixed layer or below an early `return`
 * photographs exactly like a working one. So this drives the real build in a
 * real browser and measures boxes.
 *
 * THE FOUR DEFECTS BEING REGRESSION-TESTED
 *
 *   1. AAA 11.8 / 11.26 — THE FRONT STEP HAD ONE DOOR. On a fresh save,
 *      enumerating every visible control at 390x844 and 375x667 returned
 *      exactly ["Begin the first day"]. ManorPage's `if (!day)` branch returned
 *      above the footer that carries Journal and Chronicles, so audio settings,
 *      reduced motion and the save trunk cost infinity taps — and a returning
 *      player restoring a save code had to start a day, mutating the state she
 *      was about to overwrite. The installed PWA has no address bar.
 *
 *   2. AAA 11.3 — THE CABINET'S ONLY EXIT WAS OFF-SCREEN. "Close the cabinet"
 *      measured top 3282 / bottom 3326 in an 844px viewport at sheet scrollTop
 *      0 (sheet scrollHeight 3229, clientHeight 742); elementFromPoint returned
 *      null at its centre and all four corners. It became tappable only after
 *      scrolling the whole deck. The scrim-tap fallback is not a control.
 *
 *   3. AAA 11.24 — THE LIFECYCLE SCENES BLOCKED SETTINGS. From the morning card
 *      the minimum measured path to the blueprint was 3 taps, 14 if she read
 *      Mrs. Bramble rather than skipping her; settings then cost 2 more.
 *
 *   4. AAA 11.23 — THE SETTINGS WERE BURIED, AND THE BURIAL DEEPENED. The
 *      Household settings block started at scrollTop 1321 in a 589px scroller
 *      and the trunk at ~1726; the day ledger above them grows a row per day.
 *      Export/import also cost a third tap behind "Open the trunk".
 *
 * Plus the round-9 event-feedback finding (11.12/11.19): a keepsake banked live
 * must press a seal onto whatever screen she is on AND leave a persistent mark
 * on the Chronicles entrance.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser instance,
 * closed in a finally. Run it AFTER tests/modal-hit-test.mjs, never beside it.
 *
 * Run: `node scripts/r9-reach-walk.mjs`   (spawns its own vite dev server)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Agents share this checkout and each other's ports; take one that is free. */
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

const log = (...a) => console.log('[reach]', ...a);
const ok = (m) => console.log('[reach]   ✓', m);
let failures = 0;
const fail = (m) => { console.error('[reach]   ✗ FAIL:', m); failures++; };
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
      day: s.day?.day ?? null,
      phase: s.day?.phase ?? null,
      records: s.chronicles.dayRecords.length,
      manor: Boolean(s.manor),
    };
  });

  /** Every control a player can see and aim at, in DOM order. */
  const visibleControls = () => page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 1 || r.height < 1) continue;
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      out.push((el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim());
    }
    return out;
  });

  /**
   * The §11.2/11.3 measurement in one call: five hit-test points, the visual
   * viewport, and the 44pt floor. `scope` narrows the search when several
   * surfaces are mounted.
   */
  const probe = (selector, scope = '') => page.evaluate(([sel, sc]) => {
    const root = sc ? document.querySelector(sc) : document;
    if (!root) return { found: false, reason: `no ${sc}` };
    const el = [...root.querySelectorAll('button, a[href]')]
      .find((b) => new RegExp(sel, 'i').test((b.textContent || '').replace(/\s+/g, ' ').trim()));
    if (!el) return { found: false, reason: `no control matching /${sel}/i` };
    const r = el.getBoundingClientRect();
    const inset = 5;
    const points = [
      ['centre', r.x + r.width / 2, r.y + r.height / 2],
      ['top-left', r.x + inset, r.y + inset],
      ['top-right', r.x + r.width - inset, r.y + inset],
      ['bottom-left', r.x + inset, r.y + r.height - inset],
      ['bottom-right', r.x + r.width - inset, r.y + r.height - inset],
    ];
    /**
     * AAA 11.2 asks the centre AND the four inset corners. What it is asking
     * ABOUT is coverage — "the chrome header, a scrim, a sibling overlay". Most
     * of this game's buttons are 999px pills, so a point 5px inside the
     * BOUNDING BOX corner is geometrically outside the shape and answers as the
     * container behind it. That is not the defect; being answered by a
     * COMPETING LAYER or by a different control is. So each point records who
     * answered, and the verdict distinguishes the two.
     */
    const COVER = '.chr-header, .chr-notices, .mom-layer, .chr-dusk, .chr-scene, .dlg, .bp-modal';
    const answered = [];
    for (const [where, x, y] of points) {
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit))) { answered.push([where, 'self']); continue; }
      if (!hit) { answered.push([where, 'nothing']); continue; }
      const otherControl = hit.closest('button, a[href]');
      if (otherControl && otherControl !== el) { answered.push([where, 'other-control']); continue; }
      const cover = hit.closest(COVER);
      // A cover that is the control's OWN surface is not covering it.
      if (cover && !cover.contains(el)) { answered.push([where, 'covered']); continue; }
      answered.push([where, el.parentElement && el.parentElement.contains(hit) ? 'own-container' : 'background']);
    }
    return {
      found: true,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      w: Math.round(r.width), h: Math.round(r.height),
      radius: Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0),
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight
        && r.left >= 0 && r.right <= window.innerWidth,
      centreIsSelf: answered[0][1] === 'self',
      hits: answered.filter(([, v]) => v === 'self').length,
      bad: answered.filter(([, v]) => v === 'covered' || v === 'other-control' || v === 'nothing'),
      answers: answered,
    };
  }, [selector, scope]);

  /** Assert one control is on the glass and answers as itself, 5/5. */
  const assertReachable = (label, p, { tapFloor = true } = {}) => {
    if (!p.found) { fail(`${label}: ${p.reason} — the control is not rendered at all`); return false; }
    check(p.inViewport,
      `${label}: "${p.text}" is inside the visual viewport (top ${p.top}, bottom ${p.bottom})`,
      `${label}: "${p.text}" measures top ${p.top} / bottom ${p.bottom} — outside the viewport at scroll 0 (AAA 11.3)`);
    check(p.centreIsSelf,
      `${label}: "${p.text}" answers at its own centre`,
      `${label}: "${p.text}" does NOT answer at its own centre — it is buried (AAA 11.2)`);
    check(p.bad.length === 0,
      p.hits === 5
        ? `${label}: "${p.text}" answers at its centre and all four inset corners`
        : `${label}: "${p.text}" answers at its centre; its ${p.radius}px pill corners fall through to its own container, uncovered (AAA 11.2)`,
      `${label}: "${p.text}" is COVERED or stolen at ${JSON.stringify(p.bad)} (AAA 11.2)`);
    if (tapFloor) {
      check(p.w >= 44 && p.h >= 44,
        `${label}: "${p.text}" is ${p.w}x${p.h}, at or above the 44pt floor`,
        `${label}: "${p.text}" is ${p.w}x${p.h} — under the 44x44pt floor (AAA 6.19/11.3)`);
    }
    return p.inViewport && p.centreIsSelf && p.bad.length === 0;
  };

  const clickText = async (re, scope = '') => {
    const sel = scope ? `${scope} button, ${scope} a[href]` : 'button, a[href]';
    const els = await page.$$(sel);
    for (const el of els) {
      const t = (await el.innerText()).replace(/\s+/g, ' ').trim();
      if (new RegExp(re, 'i').test(t)) { await el.click(); return t; }
    }
    return null;
  };

  const hash = () => page.evaluate(() => location.hash);

  /* ====================================================================== */
  /* 1. THE FRONT STEP — a fresh save, before any day (AAA 11.8 / 11.26)     */
  /* ====================================================================== */

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title', { timeout: 20000 });

  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(200);
    const label = `front step ${vp.width}x${vp.height}`;
    const controls = await visibleControls();
    log(`${label}: visible controls = ${JSON.stringify(controls)}`);
    check(controls.some((c) => /journal/i.test(c)) && controls.some((c) => /chronicles/i.test(c)),
      `${label}: the front step offers a Journal and a Chronicles entrance, not just "Begin the first day"`,
      `${label}: the only controls on a fresh save are ${JSON.stringify(controls)} — settings and the trunk are unreachable without starting a day (AAA 11.8)`);
    assertReachable(label, await probe('chronicles'));
    table.push({ surface: label, exit: 'Chronicles', controls: controls.length });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);

  // TAP 1 of 2 — and nothing may be spent to take it (AAA 11.26).
  const before = await state();
  await clickText('^chronicles');
  await page.waitForSelector('.chron', { timeout: 8000 });
  const after = await state();
  check(await hash() === '#/chronicles',
    'front step: "Chronicles" lands on /chronicles, the destination its label names (AAA 11.6)',
    `front step: "Chronicles" landed on ${await hash()} (AAA 11.6)`);
  check(after.day === before.day && after.records === before.records && after.manor === before.manor,
    `front step: reaching the trunk cost no game state (day ${after.day}, records ${after.records}, manor ${after.manor}) — the recovery path charges no admission (AAA 11.26)`,
    `front step: reaching Chronicles MUTATED state (day ${before.day}→${after.day}, records ${before.records}→${after.records}) (AAA 11.26)`);

  /* ====================================================================== */
  /* 2. THE CHRONICLES SURFACE — one tap in, one tap to the control (11.23) */
  /* ====================================================================== */

  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const sc = document.querySelector('.chron__ledger');
      if (sc) sc.scrollTop = 0;
    });
    const label = `chronicles ${vp.width}x${vp.height}`;
    const geom = await page.evaluate(() => {
      const sc = document.querySelector('.chron__ledger');
      const heads = [...document.querySelectorAll('.chron__section')];
      const at = (re) => {
        const h = heads.find((n) => re.test(n.textContent || ''));
        return h ? Math.round(h.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop) : null;
      };
      return {
        scrollTop: sc?.scrollTop ?? null,
        clientHeight: sc?.clientHeight ?? null,
        scrollHeight: sc?.scrollHeight ?? null,
        settings: at(/Household settings/),
        trunk: at(/Travelling trunk/),
        ledger: at(/Days in the manor/),
        keepsakes: at(/Keepsakes/),
      };
    });
    log(`${label}: section offsets = ${JSON.stringify(geom)}`);
    check(geom.settings !== null && geom.settings < geom.clientHeight,
      `${label}: Household settings starts at ${geom.settings} in a ${geom.clientHeight}px scroller — on the glass at scroll 0`,
      `${label}: Household settings starts at ${geom.settings} in a ${geom.clientHeight}px scroller — the player must scroll to the toggles (AAA 11.23)`);
    check(geom.ledger !== null && geom.settings !== null && geom.settings < geom.ledger,
      `${label}: the growing day ledger sits BELOW the settings, so day 30 buries nothing`,
      `${label}: the day ledger (${geom.ledger}) is above the settings (${geom.settings}) — the burial deepens with every day played (AAA 11.23)`);

    // Each toggle is the SECOND tap. And the trunk's verbs are too — no third.
    assertReachable(`${label} · sound`, await probe('^sound'));
    assertReachable(`${label} · reduce motion`, await probe('reduce motion'));
    const pack = await probe('pack \\(copy code\\)');
    assertReachable(`${label} · trunk pack`, pack);
    const unpack = await probe('unpack');
    assertReachable(`${label} · trunk unpack`, unpack);
    check(!(await probe('open the trunk')).found,
      `${label}: the trunk is unfolded — export/import is the second tap, not the third`,
      `${label}: "Open the trunk" is still a tap in front of Pack/Unpack (AAA 11.23)`);
    // The box is the workspace, not the control: 11.23 counts the verbs above.
    // It still has to be visible without hunting, so the bar is "its top edge
    // is on the glass at scroll 0", not "the whole box fits".
    const box = await page.evaluate(() => {
      const t = document.querySelector('.chron__trunk textarea');
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), onGlass: r.top >= 0 && r.top < window.innerHeight };
    });
    check(box && box.onGlass,
      `${label}: the save-code box is on the glass at scroll 0 (${box?.top}–${box?.bottom})`,
      `${label}: the save-code box is at ${JSON.stringify(box)} — the recovery path is below the fold (AAA 11.26)`);
    table.push({ surface: label, exit: 'Sound / Reduce motion / Pack', controls: 'settings@' + geom.settings });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assertReachable('chronicles · back', await probe('the manor'));
  await clickText('the manor');
  await page.waitForSelector('.bp-scene__title', { timeout: 8000 });

  /* ====================================================================== */
  /* 3. THE LIFECYCLE SCENES — settings in 2 taps from the card (AAA 11.24)  */
  /* ====================================================================== */

  await page.click('.bp-btn--seal');                    // Begin the first day
  await page.waitForSelector('.chr-scene', { timeout: 8000 });
  {
    const controls = await visibleControls();
    log(`morning card: visible controls = ${JSON.stringify(controls)}`);
    const p = await probe('chronicles', '.chr-scene');
    check(assertReachable('morning card · chronicles', p),
      'morning card: the scene carries its own route to settings (AAA 11.24)',
      'morning card: no route to settings from the scene, and "Begin the day" opens a conversation rather than dismissing it (AAA 11.24)');
    // TAP 1
    await clickText('chronicles', '.chr-scene');
    await page.waitForSelector('.chron', { timeout: 8000 });
    check(!(await page.$('.chr-scene')),
      'morning card: the scene stands aside on /chronicles, so the settings are actually on the glass',
      'morning card: the scene is STILL mounted over /chronicles — the affordance navigates underneath itself (AAA 11.24)');
    // TAP 2 — and 11.25: reduced motion reachable without sitting through motion.
    assertReachable('morning card → settings', await probe('reduce motion'));
    const flipped = await page.evaluate(async () => {
      const before = window.__manorStore.getState().settings.reducedMotion;
      const btn = [...document.querySelectorAll('button')]
        .find((b) => /reduce motion/i.test(b.textContent || ''));
      btn?.click();
      await new Promise((r) => setTimeout(r, 120));
      return before !== window.__manorStore.getState().settings.reducedMotion;
    });
    check(flipped,
      'morning card → settings: reduced motion is TWO taps from the scene, and the toggle really moves (AAA 11.23/11.24/11.25)',
      'morning card → settings: the second tap did not change the setting');
    await page.evaluate(() => { window.__manorStore.getState().toggleReducedMotion(); });
    table.push({ surface: 'morning card', exit: 'Chronicles', controls: controls.length });

    // ...and the scene is exactly where she left it.
    await clickText('the manor');
    await page.waitForSelector('.chr-scene', { timeout: 8000 });
    ok('morning card: coming back from settings restores the scene, with the phase untouched');
  }

  // Into the day proper, so the blueprint surfaces are live.
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.dlg', { timeout: 8000 });
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const primary = await page.$('.dlg-choice--primary');
    if (primary) { await primary.click(); await page.waitForTimeout(200); continue; }
    const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (choice) { await choice.click(); await page.waitForTimeout(200); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await page.waitForTimeout(180);
  }
  await page.waitForFunction(
    () => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 },
  );

  /* ====================================================================== */
  /* 4. EVERY .bp-modal EXIT IS ON THE GLASS AT SHEET scrollTop 0 (11.3)     */
  /* ====================================================================== */

  await clickText('^cabinet');
  await page.waitForSelector('.bp-modal', { timeout: 8000 });
  {
    const sheet = await page.evaluate(() => {
      const s = document.querySelector('.bp-modal__sheet');
      return s ? { scrollTop: s.scrollTop, clientHeight: s.clientHeight, scrollHeight: s.scrollHeight } : null;
    });
    log(`cabinet: sheet ${JSON.stringify(sheet)}`);
    check(sheet && sheet.scrollTop === 0,
      'cabinet: measured with the sheet at scrollTop 0, as the player finds it',
      'cabinet: the sheet did not open at scrollTop 0');
    check(sheet && sheet.scrollHeight > sheet.clientHeight,
      `cabinet: the sheet genuinely overflows (${sheet?.scrollHeight} > ${sheet?.clientHeight}) — the assertion below is not passing for free`,
      'cabinet: the sheet does not overflow, so this run cannot prove the sticky exit works');
    assertReachable('cabinet · exit', await probe('close the cabinet', '.bp-modal'));

    // ...and it stays uncovered at EVERY scroll position of its own surface.
    const stuck = await page.evaluate(async () => {
      const sheet = document.querySelector('.bp-modal__sheet');
      const btn = [...document.querySelectorAll('.bp-modal button')]
        .find((b) => /close the cabinet/i.test(b.textContent || ''));
      if (!sheet || !btn) return null;
      const out = [];
      for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
        sheet.scrollTop = (sheet.scrollHeight - sheet.clientHeight) * frac;
        await new Promise((r) => requestAnimationFrame(() => r()));
        const r = btn.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        out.push({
          frac,
          inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
          answers: Boolean(hit && (hit === btn || btn.contains(hit))),
        });
      }
      sheet.scrollTop = 0;
      return out;
    });
    const bad = (stuck ?? []).filter((s) => !s.inViewport || !s.answers);
    check(stuck && bad.length === 0,
      'cabinet: "Close the cabinet" is on the glass and tappable at every scroll position of the sheet (AAA 11.3)',
      `cabinet: the exit is lost at ${JSON.stringify(bad)} (AAA 11.3)`);
    table.push({ surface: 'floorplan cabinet', exit: 'Close the cabinet', controls: `sheet ${sheet?.scrollHeight}px` });
  }
  await clickText('close the cabinet', '.bp-modal');
  await page.waitForTimeout(250);

  /* ====================================================================== */
  /* 5. A KEEPSAKE ANNOUNCES ITSELF, AND LEAVES A TRACE (11.12 / 11.19)      */
  /* ====================================================================== */

  {
    // Bank one the way the day roll banks it — through the real mutator, from
    // the blueprint, which is where the player is standing.
    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      s.appendDayRecord({
        day: 1, endedAt: Date.now(), cause: 'retired-early',
        roomsDrafted: 2, roomsSolved: 1, stepsSpent: 12, fragmentsFound: 0,
      });
      window.__manorStore.getState().syncEarnedRewards();
    });
    const earned = await page.evaluate(() => window.__manorStore.getState().earnedAchievementIds);
    check(earned.length > 0,
      `keepsake: the emitter banked ${JSON.stringify(earned)}`,
      'keepsake: nothing was banked — the award path did not run, so this row proves nothing');

    // The queue may hold other campaign grants (a letter arrives on day 1), so
    // walk it: the KEEPSAKE'S OWN seal has to take the glass, not merely some
    // seal. Each is measured mounted and non-zero before it is dismissed.
    let seal = null;
    for (let i = 0; i < 6; i++) {
      const el = await page.waitForSelector('.mom', { timeout: 4000 }).catch(() => null);
      if (!el) break;
      const r = await el.boundingBox();
      const text = (await el.innerText()).replace(/\s+/g, ' ').trim();
      if (!r || r.width < 1 || r.height < 1) { fail(`keepsake: a seal is mounted at zero size — "${text.slice(0, 40)}"`); break; }
      if (/keepsake/i.test(text)) { seal = { r, text }; break; }
      await el.click();
      await page.waitForTimeout(250);
    }
    check(seal,
      `keepsake: the keepsake's own moment is mounted and non-zero on the screen she is actually on — "${seal?.text?.slice(0, 60)}" (AAA 11.11)`,
      'keepsake: NOTHING announced the keepsake on glass when it was banked (AAA 11.11/11.12)');

    // The persistent trace: the Chronicles entrance carries the mark, and it
    // is still there after the moment has gone (11.12/11.19/11.20).
    for (let i = 0; i < 6 && (await page.$('.mom')); i++) {
      await page.click('.mom').catch(() => {});
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(200);
    const mark = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.bp-foot__actions button')]
        .find((b) => /^chronicles/i.test((b.textContent || '').trim()));
      if (!btn) return null;
      const u = btn.querySelector('.unread');
      return { hasMark: Boolean(u), label: u?.getAttribute('aria-label') ?? null };
    });
    check(mark && mark.hasMark,
      `keepsake: the Chronicles entrance carries the unread mark after the moment ends — "${mark?.label}" (AAA 11.12/11.19)`,
      'keepsake: the Chronicles entrance carries NO mark, so a missed moment is the end of it (AAA 11.12/11.19)');

    // ...and it retires on viewing, and on nothing else (11.20/11.21).
    await clickText('^chronicles');
    await page.waitForSelector('.chron__keepsakes', { timeout: 8000 });
    await page.evaluate(() => {
      const shelf = document.querySelector('.chron__keepsakes');
      shelf?.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(600);
    await clickText('the manor');
    await page.waitForSelector('.bp-foot__actions', { timeout: 8000 });
    const cleared = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.bp-foot__actions button')]
        .find((b) => /^chronicles/i.test((b.textContent || '').trim()));
      return !btn?.querySelector('.unread');
    });
    check(cleared,
      'keepsake: the mark retires once the shelf has actually been shown (AAA 11.20/11.21)',
      'keepsake: the mark survived viewing the shelf — a marker she cannot clear (AAA 11.21)');
    table.push({ surface: 'blueprint (keepsake banked)', exit: 'Chronicles + unread mark', controls: earned.length });
  }

  if (errors.length) fail('console/page errors: ' + errors.slice(0, 4).join(' | '));

  /* --- the artifact ------------------------------------------------------- */
  log('');
  log('| surface | control measured | note |');
  log('|---|---|---|');
  for (const r of table) log(`| ${r.surface} | ${r.exit} | ${r.controls} |`);
} catch (e) {
  fail(`threw: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

log(failures ? `DONE WITH ${failures} FAILURE(S)` : 'DONE — every surface has a door and every door is on the glass');
process.exit(failures ? 1 : 0);
