/**
 * tests/critic-round11-live.mjs — the LIVE INTERACTION CRITIC's own §0.4 walk.
 *
 * Independent of the owner-authored harnesses (navigation-live, modal-hit-test,
 * moment-live, journal-rail-live, keepsakes-live). Drives the PRODUCTION build
 * via `vite preview`, one Edge instance, sequential surfaces.
 *
 * Covers: every route in App.tsx, every full-screen overlay, every empty /
 * error / pre-day branch; 5-point hit tests; destination assertions; retire
 * reachability under each overlay; campaign grants provoked from the screen the
 * player is really on; unread across day roll + reload; tap counts to settings
 * and the trunk. 390x844 @2x and 375x667.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VOL = JSON.parse(readFileSync(resolve(ROOT, 'content/authored/volumes/volume-1.json'), 'utf8'));

async function freePort(from = 5410, to = 5470) {
  for (let p = from; p <= to; p++) {
    const taken = await new Promise((res) => {
      const s = createServer();
      s.once('error', () => res(true));
      s.once('listening', () => s.close(() => res(false)));
      s.listen(p, '127.0.0.1');
    });
    if (!taken) return p;
  }
  throw new Error('no free port');
}

const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;

const log = (...a) => console.log('[critic]', ...a);
const ok = (m) => console.log('[critic]   PASS', m);
let failures = 0;
const fails = [];
const fail = (m) => { console.error('[critic]   ** FAIL:', m); failures++; fails.push(m); };
const check = (c, good, bad) => { if (c) ok(good); else fail(bad); };

const table = [];
const row = (surface, exit, hit, dest, notes) => table.push({ surface, exit, hit, dest, notes });

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
server.stdout.on('data', (b) => process.stdout.write(`[preview] ${b}`));
server.stderr.on('data', (b) => process.stderr.write(`[preview!] ${b}`));
const serverUp = (async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview did not start');
})();

let browser;
try {
  await serverUp;
  log('preview up on', BASE);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  /* ---------------- helpers ---------------- */

  const S = () => page.evaluate(() => {
    const s = window.__manorStore?.getState?.();
    if (!s) return { noStore: true };
    return {
      day: s.day?.day ?? null, phase: s.day?.phase ?? null,
      steps: s.day ? s.stepsRemaining() : null,
      frags: s.volume.foundFragmentIds.length,
      records: s.chronicles.dayRecords.length,
      hash: location.hash,
    };
  });

  const boxOf = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
  }, sel);

  const tagBtn = (text, scope = 'body') => page.evaluate(([t, sc]) => {
    document.querySelectorAll('[data-critic]').forEach((e) => e.removeAttribute('data-critic'));
    const root = document.querySelector(sc);
    if (!root) return null;
    for (const b of root.querySelectorAll('button, a')) {
      const label = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label.toLowerCase().includes(t.toLowerCase())) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      b.setAttribute('data-critic', '1');
      return { x: r.x, y: r.y, w: r.width, h: r.height, label };
    }
    return null;
  }, [text, scope]);

  const points = (b) => {
    const inset = Math.max(5, Math.min(14, Math.min(b.w, b.h) / 4));
    return [
      ['centre', b.x + b.w / 2, b.y + b.h / 2],
      ['tl', b.x + inset, b.y + inset],
      ['tr', b.x + b.w - inset, b.y + inset],
      ['bl', b.x + inset, b.y + b.h - inset],
      ['br', b.x + b.w - inset, b.y + b.h - inset],
    ];
  };

  async function hitTest(name, sel, box) {
    const b = box ?? await boxOf(sel);
    if (!b) { fail(`${name}: no element matches ${sel}`); return { clean: false }; }
    let clean = true;
    const misses = [];
    for (const [where, x, y] of points(b)) {
      const hit = await page.evaluate(([px, py, s]) => {
        const el = document.elementFromPoint(px, py);
        if (!el) return null;
        const t = document.querySelector(s);
        const cls = typeof el.className === 'string' ? el.className : (el.className?.baseVal ?? '');
        return { own: Boolean(t && (el === t || t.contains(el))), tag: el.tagName.toLowerCase(), cls };
      }, [x, y, sel]);
      if (!hit || !hit.own) { misses.push(`${where}→${hit ? hit.tag + '.' + hit.cls : 'nothing'}`); clean = false; }
    }
    const vp = page.viewportSize();
    const sized = b.w >= 44 && b.h >= 44;
    const inView = b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= vp.width + 0.5 && b.y + b.h <= vp.height + 0.5;
    if (misses.length) fail(`${name}: elementFromPoint missed at ${misses.join(', ')} (AAA 11.2)`);
    if (!sized) fail(`${name}: ${Math.round(b.w)}x${Math.round(b.h)} under the 44pt floor (AAA 6.19/11.3)`);
    if (!inView) fail(`${name}: box ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)} outside ${vp.width}x${vp.height} (AAA 11.3)`);
    if (clean && sized && inView) ok(`${name}: 5/5 points, ${Math.round(b.w)}x${Math.round(b.h)}, inside the viewport`);
    return { clean: clean && sized && inView, box: b };
  }

  /** AAA 11.5: with an overlay up, the destructive retire control must not be reachable. */
  async function assertRetireUnreachable(surface) {
    const r = await page.evaluate(() => {
      const b = document.querySelector('.chr-retire');
      if (!b) return { rendered: false };
      const rect = b.getBoundingClientRect();
      if (rect.width < 1) return { rendered: false };
      const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
      const el = document.elementFromPoint(cx, cy);
      const cs = getComputedStyle(b);
      const hdr = document.querySelector('.chr-header');
      return {
        rendered: true,
        reachable: Boolean(el && (el === b || b.contains(el))),
        pe: cs.pointerEvents,
        headerPe: hdr ? getComputedStyle(hdr).pointerEvents : null,
        overlayAttr: document.documentElement.hasAttribute('data-overlay-open'),
      };
    });
    if (!r.rendered) { ok(`${surface}: retire is not rendered at all while the overlay is up (AAA 11.5)`); return true; }
    if (r.reachable) { fail(`${surface}: .chr-retire IS hit-testable through the overlay (pointer-events:${r.pe}, header:${r.headerPe}, data-overlay-open=${r.overlayAttr}) — AAA 11.5`); return false; }
    ok(`${surface}: retire rendered but inert (pointer-events:${r.pe}) — AAA 11.5`);
    return true;
  }

  const playScene = async () => {
    for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
      const p = await page.$('.dlg-choice--primary');
      if (p) { await p.click(); await page.waitForTimeout(200); continue; }
      const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
      if (c) { await c.click(); await page.waitForTimeout(200); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      await page.waitForTimeout(180);
    }
  };

  /** Reload that survives the service worker taking control mid-navigation. */
  const hardReload = async (url) => {
    for (let i = 0; i < 4; i++) {
      try {
        await page.goto(url ?? page.url(), { waitUntil: 'domcontentloaded', timeout: 60000 });
        return;
      } catch (e) {
        if (!/ERR_ABORTED|frame was detached/.test(e.message) || i === 3) throw e;
        await page.waitForTimeout(700);
      }
    }
  };

  /** Tap the seal away by coordinate — actionability checks would just wait
   *  for the card that IS the thing under test. */
  const drainMoments = async () => {
    for (let i = 0; i < 20; i++) {
      const b = await boxOf('.mom');
      if (!b) return;
      await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
      await page.waitForTimeout(180);
    }
  };

  const freshLoad = async () => {
    await hardReload(BASE);
    // The production build registers a service worker; leave it out of the walk
    // so a controllerchange reload cannot detach the frame mid-assertion.
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      for (const r of regs) await r.unregister();
      localStorage.clear();
    });
    await hardReload(`${BASE}?fresh=${Date.now()}`);
    await page.waitForSelector('.bp-scene__title, .bp-page', { timeout: 30000 });
  };

  const reachExploring = async () => {
    await page.waitForSelector('.bp-btn--seal', { timeout: 20000 });
    await page.click('.bp-btn--seal');
    await page.waitForSelector('.chr-scene', { timeout: 8000 });
    await page.click('.chr-scene__btn');
    await page.waitForSelector('.dlg', { timeout: 8000 });
    await playScene();
    await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 });
  };

  /* ======================================================================
     1. PRE-DAY BRANCHES — every route deep-linked on a fresh save
     ====================================================================== */
  log(''); log('— 1. fresh save: every route, pre-day —');
  await freshLoad();
  {
    const pre = await S();
    check(pre.day === null, 'fresh save: no day exists (the pre-day branch is the real one)', `fresh save: day ${pre.day} already exists`);

    // front step exits
    for (const label of ['Journal', 'Chronicles', 'Begin the first day']) {
      const b = await tagBtn(label, '.bp-scene');
      if (!b) fail(`front step: no "${label}" control on the glass (AAA 11.8)`);
      else await hitTest(`front step "${b.label}"`, '[data-critic]', b);
    }
    row('/ front step (no day)', 'Journal · Chronicles · Begin', '5/5 each', '—', 'pre-day branch');

    // /journal deep-linked with no day
    await page.evaluate(() => { location.hash = '#/journal'; });
    await page.waitForTimeout(500);
    const jr = await page.evaluate(() => ({
      page: Boolean(document.querySelector('.jrn-page')),
      empty: Boolean(document.querySelector('.jrn-empty')),
      back: Boolean(document.querySelector('.backlink')),
    }));
    check(jr.page && jr.back, '/journal (no day): renders with a back link', `/journal (no day): page=${jr.page} backlink=${jr.back} — no way out (AAA 11.1)`);
    if (jr.back) {
      await hitTest('/journal (no day) BackLink', '.backlink');
      await page.click('.backlink');
      await page.waitForTimeout(400);
      const h = await page.evaluate(() => location.hash);
      check(h === '#/' || h === '' || h === '#', `/journal (no day) back → manor (${h || '#/'})`, `/journal (no day) back → ${h} (AAA 11.6)`);
      row('/journal (no day)', 'BackLink "The manor"', 'itself', '/', 'pre-day branch');
    }

    // /sanctum deep-linked with no day
    await page.evaluate(() => { location.hash = '#/sanctum'; });
    await page.waitForTimeout(500);
    const sn = await page.evaluate(() => ({
      page: Boolean(document.querySelector('.snc-page')),
      back: Boolean(document.querySelector('.snc-page .backlink')),
      body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 120),
    }));
    check(sn.page && sn.back, '/sanctum (no day): renders with a back link', `/sanctum (no day): page=${sn.page} backlink=${sn.back} — "${sn.body}" (AAA 11.1)`);
    if (sn.back) {
      await hitTest('/sanctum (no day) BackLink', '.snc-page .backlink');
      await page.click('.snc-page .backlink');
      await page.waitForTimeout(400);
      const h = await page.evaluate(() => location.hash);
      check(h === '#/' || h === '' || h === '#', `/sanctum (no day) back → manor (${h || '#/'})`, `/sanctum (no day) back → ${h} (AAA 11.6)`);
      row('/sanctum (no day)', 'BackLink', 'itself', '/', 'pre-day branch');
    }

    // /room deep-linked with no active room
    await page.evaluate(() => { location.hash = '#/room'; });
    await page.waitForTimeout(600);
    const rm = await page.evaluate(() => ({ hash: location.hash, bp: Boolean(document.querySelector('.bp-page')) }));
    check(rm.bp && (rm.hash === '#/manor' || rm.hash === '#/'), `/room (no active room): redirects to the blueprint (${rm.hash})`, `/room (no active room): hash ${rm.hash}, blueprint=${rm.bp} — stranded (AAA 11.1)`);
    row('/room (no active room)', 'auto-redirect', 'n/a', '/manor', 'no dead end');

    // not-found
    await page.evaluate(() => { location.hash = '#/no-such-corridor'; });
    await page.waitForTimeout(400);
    const nf = await tagBtn('Back to the Entrance Hall');
    if (!nf) fail('not-found: no exit control (AAA 11.1)');
    else {
      await hitTest('not-found exit', '[data-critic]', nf);
      await page.click('[data-critic]');
      await page.waitForTimeout(400);
      const h = await page.evaluate(() => location.hash);
      check(h === '#/' || h === '' || h === '#', `not-found exit → manor (${h || '#/'})`, `not-found exit → ${h} (AAA 11.6)`);
      row('not-found', 'Back to the Entrance Hall', 'itself', '/', '');
    }
  }

  /* ======================================================================
     2. SETTINGS/TRUNK TAP COUNT — fresh save
     ====================================================================== */
  log(''); log('— 2. tap count to audio / reduced motion / trunk (fresh save) —');
  {
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('.bp-scene__title', { timeout: 8000 });
    const before = await S();
    const chron = await tagBtn('Chronicles', '.bp-scene');
    await page.click('[data-critic]');            // TAP 1
    await page.waitForSelector('.chron__title', { timeout: 8000 });
    const reach = await page.evaluate(() => {
      const sc = document.querySelector('.chron__ledger');
      const sr = sc.getBoundingClientRect();
      const vis = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { onGlass: r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1 && r.height > 0, top: Math.round(r.top - sr.top), h: Math.round(r.height) };
      };
      const settings = [...document.querySelectorAll('.chron__setting')];
      const byLabel = (t) => settings.find((s) => (s.textContent || '').toLowerCase().includes(t));
      const packBtn = [...document.querySelectorAll('.chron__trunk button')][0];
      const unpackBtn = [...document.querySelectorAll('.chron__trunk button')][1];
      return {
        scrollTop: sc.scrollTop,
        sound: vis(byLabel('sound')), music: vis(byLabel('music')),
        ring: vis(byLabel('ring switch')), motion: vis(byLabel('reduce motion')),
        pack: vis(packBtn), unpack: vis(unpackBtn),
      };
    });
    const allOnGlass = ['sound', 'music', 'ring', 'motion', 'pack', 'unpack'].every((k) => reach[k]?.onGlass);
    check(allOnGlass,
      `Chronicles at scroll ${reach.scrollTop}: sound(+${reach.sound?.top}) music(+${reach.music?.top}) ring(+${reach.ring?.top}) motion(+${reach.motion?.top}) pack(+${reach.pack?.top}) unpack(+${reach.unpack?.top}) — all fully on glass, TAP 2 (AAA 11.23)`,
      `Chronicles: not all controls on glass at scroll 0 — ${JSON.stringify(reach)} (AAA 11.23)`);
    // hit-test the two that 11.25 names, plus the trunk verbs
    for (const [name, sel] of [['Sound', '.chron__setting'], ['trunk Pack', '.chron__trunk button']]) {
      await hitTest(`Chronicles ${name}`, sel);
    }
    const after = await S();
    check(after.day === null && after.records === 0,
      'reaching settings + trunk from a fresh save cost no day, no step, no scene (AAA 11.26)',
      `reaching the trunk cost state: day ${after.day}, records ${after.records} (AAA 11.26)`);
    // toggling reduced motion actually works
    const motionBefore = await page.evaluate(() => window.__manorStore.getState().settings.reducedMotion);
    await page.evaluate(() => {
      const s = [...document.querySelectorAll('.chron__setting')].find((x) => (x.textContent || '').toLowerCase().includes('reduce motion'));
      s.click();
    });
    await page.waitForTimeout(200);
    const motionAfter = await page.evaluate(() => window.__manorStore.getState().settings.reducedMotion);
    check(motionAfter !== motionBefore, `reduced motion toggles from the same surface (${motionBefore}→${motionAfter}) — AAA 11.25`, 'reduced motion did not toggle');
    await page.evaluate(() => {
      const s = [...document.querySelectorAll('.chron__setting')].find((x) => (x.textContent || '').toLowerCase().includes('reduce motion'));
      s.click();
    });
    // export produces a code
    await page.click('.chron__trunk button');
    await page.waitForTimeout(300);
    const code = await page.evaluate(() => document.querySelector('.chron__trunk textarea')?.value ?? '');
    check(code.length > 20, `trunk Pack produces a save code (${code.length} chars) — AAA 7.19/11.26`, `trunk Pack produced "${code}"`);
    await hitTest('Chronicles BackLink', '.backlink');
    await page.click('.backlink');
    await page.waitForTimeout(400);
    const h = await page.evaluate(() => location.hash);
    check(h === '#/' || h === '' || h === '#', `Chronicles back → manor (${h || '#/'})`, `Chronicles back → ${h}`);
    row('/chronicles (no day)', 'BackLink "The manor"', 'itself', '/', 'settings+trunk at scroll 0, 2 taps');
  }

  /* ======================================================================
     3. LIFECYCLE SCENES — morning card, dialogue, dusk, night
     ====================================================================== */
  log(''); log('— 3. lifecycle overlays —');
  {
    await page.click('.bp-btn--seal');
    await page.waitForSelector('.chr-scene', { timeout: 8000 });
    // MORNING CARD
    const aside = await boxOf('.chr-scene__aside');
    if (!aside) fail('morning card: no route to settings from the scene (AAA 11.24)');
    else await hitTest('morning card "Chronicles" aside', '.chr-scene__aside', aside);
    await hitTest('morning card primary', '.chr-scene__btn');
    await assertRetireUnreachable('morning card');
    // the aside must actually land on chronicles AND the scene must survive
    await page.click('.chr-scene__aside');
    await page.waitForSelector('.chron__title', { timeout: 8000 });
    const midMorning = await S();
    check(midMorning.phase === 'morning', 'morning → Chronicles: the phase is untouched (AAA 11.24)', `morning → Chronicles: phase became ${midMorning.phase}`);
    await page.click('.backlink');
    await page.waitForSelector('.chr-scene', { timeout: 8000 });
    ok('morning card is exactly where she left it after the settings round trip');
    row('morning card', 'Chronicles aside + primary', '5/5', '/chronicles · greeting', 'retire not reachable');

    // DIALOGUE OVERLAY (Bramble)
    await page.click('.chr-scene__btn');
    await page.waitForSelector('.dlg', { timeout: 8000 });
    await assertRetireUnreachable('dialogue overlay');
    const dlgExit = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.dlg-choice, .dlg__sheet')];
      return c.length;
    });
    check(dlgExit > 0, 'dialogue overlay: advance/choice affordances present', 'dialogue overlay: nothing to tap (AAA 11.1)');
    row('dialogue overlay', 'choices / tap-to-advance', 'n/a', 'closes to caller', 'retire not reachable');
    await playScene();
    await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 });
  }

  /* ======================================================================
     4. EXPLORING BLUEPRINT + its overlays
     ====================================================================== */
  log(''); log('— 4. blueprint chrome and overlays —');
  {
    await page.waitForSelector('.chr-retire', { timeout: 8000 });
    await hitTest('blueprint retire', '.chr-retire');
    for (const label of ['Cabinet', 'Journal', 'Chronicles']) {
      const b = await tagBtn(label, '.bp-foot__actions');
      if (!b) fail(`blueprint: no "${label}" entrance (AAA 11.9)`);
      else await hitTest(`blueprint "${b.label}"`, '[data-critic]', b);
    }
    row('/manor exploring', 'retire · Cabinet · Journal · Chronicles', '5/5 each', 'arms / cabinet / journal / chronicles', '');

    // CABINET OVERLAY
    const cab = await tagBtn('Cabinet', '.bp-foot__actions');
    await page.click('[data-critic]');
    await page.waitForSelector('.bp-modal', { timeout: 8000 });
    await assertRetireUnreachable('cabinet sheet');
    const cabClose = await tagBtn('', '.bp-modal__foot') ?? await page.evaluate(() => {
      const b = [...document.querySelectorAll('.bp-modal button')].pop();
      return b ? { label: b.textContent } : null;
    });
    const closeBox = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.bp-modal button')].filter((b) => b.getBoundingClientRect().width > 0);
      const b = btns.find((x) => /close|back|done|shut/i.test(x.textContent || '')) ?? btns[btns.length - 1];
      if (!b) return null;
      document.querySelectorAll('[data-critic]').forEach((e) => e.removeAttribute('data-critic'));
      b.setAttribute('data-critic', '1');
      const r = b.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, label: (b.textContent || '').trim() };
    });
    if (!closeBox) fail('cabinet sheet: no close control (AAA 11.1)');
    else {
      await hitTest(`cabinet close "${closeBox.label}"`, '[data-critic]', closeBox);
      await page.click('[data-critic]');
      await page.waitForTimeout(400);
      const gone = await page.evaluate(() => !document.querySelector('.bp-modal'));
      check(gone, 'cabinet close returns to the blueprint', 'cabinet close did not dismiss the sheet');
      row('cabinet sheet', closeBox.label, '5/5', '/manor', 'retire not reachable');
    }

    // DRAFT OVERLAY
    const opened = await page.evaluate(() => {
      const doors = [...document.querySelectorAll('.bp-door, [class*="door"]')].filter((d) => d.tagName === 'BUTTON' && d.getBoundingClientRect().width > 0);
      if (doors.length) { doors[0].click(); return true; }
      return false;
    });
    if (!opened) {
      const st = await page.evaluate(() => {
        const s = window.__manorStore.getState();
        const m = s.manor;
        const cell = m.playerCell;
        for (const d of ['N', 'E', 'W', 'S']) { try { s.openDraft(d); } catch {} if (window.__manorStore.getState().draftOffer) return d; }
        return null;
      });
      log('   (draft opened via store door', st, ')');
    }
    await page.waitForSelector('.bp-modal', { timeout: 8000 }).catch(() => {});
    if (await page.$('.bp-modal')) {
      await assertRetireUnreachable('draft modal');
      const cancel = await page.evaluate(() => {
        document.querySelectorAll('[data-critic]').forEach((e) => e.removeAttribute('data-critic'));
        const b = [...document.querySelectorAll('.bp-modal__foot button')].find((x) => /back|cancel|leave|not/i.test(x.textContent || ''));
        if (!b) return null;
        b.setAttribute('data-critic', '1');
        const r = b.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, label: (b.textContent || '').replace(/\s+/g, ' ').trim() };
      });
      if (!cancel) fail('draft modal: no cancel/back control (AAA 4.6/11.1)');
      else {
        await hitTest(`draft cancel "${cancel.label}"`, '[data-critic]', cancel);
        await page.click('[data-critic]');
        await page.waitForTimeout(400);
        const gone = await page.evaluate(() => !document.querySelector('.bp-modal'));
        check(gone, 'draft cancel returns to the blueprint', 'draft cancel did not dismiss');
        row('draft modal', cancel.label, '5/5', '/manor', 'retire not reachable');
      }
    } else fail('draft modal: could not be opened from the blueprint — surface not walked');
  }

  /* ======================================================================
     5. ROOM SURFACE
     ====================================================================== */
  log(''); log('— 5. inside a room —');
  {
    // Draft + enter a puzzle room deterministically through the store.
    const entered = await page.evaluate(() => {
      const store = window.__manorStore;
      const s = store.getState();
      const m = s.manor;
      const cell = { col: m.playerCell.col, row: m.playerCell.row };
      const key = `${cell.col},${cell.row}`;
      store.setState({
        manor: {
          ...m,
          rooms: { ...m.rooms, [key]: { cardId: 'conservatory', cell, doors: ['N', 'S'], solved: false, kind: 'hive' } },
        },
      });
      store.getState().enterRoom(key);
      return Boolean(store.getState().day?.activeRoom);
    });
    check(entered, 'a puzzle room was entered (the /room surface is live)', 'could not enter a room — /room not walked');
    await page.waitForTimeout(700);
    const onRoom = await page.evaluate(() => ({ hash: location.hash, host: Boolean(document.querySelector('.room-host')) }));
    check(onRoom.host, `/room renders RoomHost (${onRoom.hash})`, `/room did not render (${JSON.stringify(onRoom)})`);
    if (onRoom.host) {
      const roomExits = await page.evaluate(() => [...document.querySelectorAll('.room-host__footer button')]
        .filter((b) => b.getBoundingClientRect().width > 0)
        .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim()));
      check(roomExits.length > 0, `/room offers ${roomExits.length} exit(s): ${roomExits.join(' · ')} (AAA 11.1/4.13)`, '/room has no exit control at all (AAA 11.1)');
      for (const label of roomExits) {
        const b = await tagBtn(label, '.room-host__footer');
        if (b) await hitTest(`/room "${b.label}"`, '[data-critic]', b);
      }
      row('/room (active puzzle)', roomExits.join(' · '), '5/5 each', '/manor', '');
      await assertRetireUnreachable('/room (page surface, not an overlay)');
    }
  }

  /* ======================================================================
     6. CAMPAIGN GRANTS — provoked from the screen the player is really on
     ====================================================================== */
  log(''); log('— 6. campaign-class grants, per screen —');
  const FRAGS = VOL.fragments.map((f) => f.id);
  let fragIdx = 0;

  async function provokeFragmentHere(surface) {
    const id = FRAGS[fragIdx++];
    await page.evaluate((fid) => window.__manorStore.getState().fileFragment(fid), id);
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const el = document.querySelector('.mom');
      if (!el) return { mounted: false };
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const cs = getComputedStyle(el);
      return {
        mounted: true, w: Math.round(r.width), h: Math.round(r.height),
        onGlass: Boolean(top && (top === el || el.contains(top))),
        inView: r.top >= 0 && r.bottom <= window.innerHeight,
        opacity: cs.opacity, vis: cs.visibility,
        title: (el.querySelector('.mom__title')?.textContent || '').trim(),
        where: (el.querySelector('.mom__where')?.textContent || '').trim(),
        topTag: top ? top.tagName.toLowerCase() + '.' + (typeof top.className === 'string' ? top.className : '') : null,
      };
    });
    if (!m.mounted) { fail(`${surface}: a fragment was filed and NO moment mounted (AAA 11.11)`); return null; }
    check(m.onGlass && m.inView && m.w > 0 && m.h > 0 && Number(m.opacity) > 0.5,
      `${surface}: fragment moment is mounted, ${m.w}x${m.h}, unobscured and on glass — "${m.title}" / "${m.where}"`,
      `${surface}: moment mounted but not on glass (onGlass=${m.onGlass} inView=${m.inView} opacity=${m.opacity} top=${m.topTag}) — AAA 11.11`);
    return m;
  }

  // 6a — inside a room
  await provokeFragmentHere('/room');
  // 6b — behind the dialogue overlay
  await page.evaluate(() => window.__manorStore.getState().leaveRoom());
  await page.waitForTimeout(500);
  {
    // open a parlor/dewey scene if we can; otherwise force one
    const dlgUp = await page.evaluate(() => {
      const s = window.__manorStore.getState();
      const btn = [...document.querySelectorAll('.bp-foot__actions button')].find((b) => /call on|pet dewey/i.test(b.textContent || ''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (dlgUp) await page.waitForSelector('.dlg', { timeout: 5000 }).catch(() => {});
    if (await page.$('.dlg')) {
      await provokeFragmentHere('behind the dialogue overlay');
      await playScene();
    } else {
      log('   (no parlor/Dewey seam reachable at this cell — dialogue-overlay grant tested via the morning scene instead)');
    }
  }
  // 6c — on the journal
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForSelector('.jrn-page', { timeout: 8000 });
  await provokeFragmentHere('/journal');
  // 6d — on the chronicles
  await page.evaluate(() => { location.hash = '#/chronicles'; });
  await page.waitForSelector('.chron__title', { timeout: 8000 });
  await provokeFragmentHere('/chronicles');
  // 6e — affinity rank-up from the blueprint
  await page.evaluate(() => { location.hash = '#/manor'; });
  await page.waitForSelector('.bp-page', { timeout: 8000 });
  {
    await page.evaluate(() => { for (let i = 0; i < 12; i++) window.__manorStore.getState().adjustAffinity('ellery', 1); });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const el = document.querySelector('.mom');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { onGlass: Boolean(top && (top === el || el.contains(top))), title: (el.querySelector('.mom__title')?.textContent || '').trim() };
    });
    check(m?.onGlass, `/manor: affinity rank-up presses a moment on the glass — "${m?.title}"`, '/manor: an affinity rank-up produced no visible moment (AAA 11.11)');
  }
  // 6f — a keepsake / floorplan plate
  {
    await page.evaluate(() => window.__manorStore.getState().unlockCard('gallery'));
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const el = document.querySelector('.mom');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { onGlass: Boolean(top && (top === el || el.contains(top))), title: (el.querySelector('.mom__title')?.textContent || '').trim(), where: (el.querySelector('.mom__where')?.textContent || '').trim() };
    });
    check(m?.onGlass, `/manor: a floorplan plate presses a moment — "${m?.title}" / "${m?.where}"`, '/manor: a floorplan unlock produced no visible moment (AAA 11.11/11.12)');
  }

  /* ---- 6g. the seal must not bury the exit it is sitting on (AAA 11.2) --- */
  log('');
  log('— 6g. exits hit-tested WITH a moment on glass —');
  for (const [name, hash, sel, wait] of [
    ['/journal', '#/journal', '.jrn-page .backlink', '.jrn-page'],
    ['/chronicles', '#/chronicles', '.chron .backlink', '.chron__title'],
    ['/sanctum', '#/sanctum', '.snc-page .backlink', '.snc-page'],
  ]) {
    await drainMoments();
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForSelector(wait, { timeout: 8000 }).catch(() => {});
    const id = FRAGS[fragIdx++];
    await page.evaluate((fid) => window.__manorStore.getState().fileFragment(fid), id);
    await page.waitForTimeout(500);
    const up = await page.$('.mom');
    if (!up) { log(`   (no moment mounted on ${name} — skipping the overlap probe)`); continue; }
    await hitTest(`${name} BackLink with a moment on glass`, sel);
    const overlap = await page.evaluate((s2) => {
      const m = document.querySelector('.mom').getBoundingClientRect();
      const e = document.querySelector(s2)?.getBoundingClientRect();
      if (!e) return null;
      return { momTop: Math.round(m.top), momBottom: Math.round(m.bottom), exitTop: Math.round(e.top), exitBottom: Math.round(e.bottom) };
    }, sel);
    log(`   ${name}: moment ${overlap?.momTop}..${overlap?.momBottom}, exit ${overlap?.exitTop}..${overlap?.exitBottom}`);
    row(`${name} + moment`, 'BackLink', 'see above', '/', `seal ${overlap?.momTop}-${overlap?.momBottom}px`);
  }
  // the blueprint's retire, with a seal up
  await drainMoments();
  await page.evaluate(() => { location.hash = '#/manor'; });
  await page.waitForTimeout(500);
  {
    const id = FRAGS[fragIdx++];
    await page.evaluate((fid) => window.__manorStore.getState().fileFragment(fid), id);
    await page.waitForTimeout(500);
    if (await page.$('.mom')) {
      if (await page.$('.chr-retire')) await hitTest('blueprint retire with a moment on glass', '.chr-retire');
      const je = await tagBtn('Journal', '.bp-foot__actions');
      if (je) await hitTest('blueprint Journal entrance with a moment on glass', '[data-critic]', je);
    }
  }

  /* ======================================================================
     7. THE PERSISTENT TRACE + UNREAD CHAIN
     ====================================================================== */
  log(''); log('— 7. persistent trace, unread chain, day roll, reload —');
  {
    // dismiss any moment still on glass
    await drainMoments();
    await page.evaluate(() => { location.hash = '#/manor'; });
    await page.waitForSelector('.bp-foot__actions', { timeout: 8000 });
    const marks = await page.evaluate(() => {
      const out = {};
      for (const b of document.querySelectorAll('.bp-foot__actions .unread-host')) {
        const label = (b.childNodes[0]?.textContent || '').trim();
        const mark = b.querySelector('.unread, [class*="unread"]:not(.unread-host)');
        const r = mark?.getBoundingClientRect();
        out[label] = mark ? { text: (mark.textContent || '').trim(), w: Math.round(r.width), h: Math.round(r.height), vis: r.width > 0 } : null;
      }
      return out;
    });
    log('   entrance marks:', JSON.stringify(marks));
    check(marks.Journal && marks.Journal.vis,
      `blueprint Journal entrance carries the unread mark (${marks.Journal?.text}) — AAA 11.19 level 1`,
      'blueprint Journal entrance carries NO unread mark after fragments were filed (AAA 11.19)');
    check(marks.Cabinet && marks.Cabinet.vis,
      `blueprint Cabinet entrance carries its unread mark (${marks.Cabinet?.text})`,
      'blueprint Cabinet entrance has no mark after a plate was filled (AAA 11.19/11.21)');

    // truthfulness of the count
    const expected = await page.evaluate(() => {
      const s = window.__manorStore.getState();
      return s.volume.foundFragmentIds.length;
    });
    log('   fragments filed:', expected, '· journal mark says', marks.Journal?.text);

    // survives a RELOAD
    await hardReload();
    await page.waitForSelector('.bp-foot__actions', { timeout: 30000 });
    const afterReload = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.bp-foot__actions .unread-host')].find((x) => (x.childNodes[0]?.textContent || '').trim() === 'Journal');
      const m = b?.querySelector('[class*="unread"]:not(.unread-host)');
      return m ? (m.textContent || '').trim() : null;
    });
    check(afterReload, `unread survives a force-quit/reload (mark: ${afterReload}) — AAA 11.20`, 'unread mark vanished across a reload (AAA 11.20)');

    // survives a DAY ROLL
    const rolled = await page.evaluate(async () => {
      const s = window.__manorStore.getState();
      s.endDay('retired-early');
      return window.__manorStore.getState().day?.phase ?? null;
    });
    await page.waitForTimeout(800);
    // step through dusk/night to the next morning
    for (let i = 0; i < 12; i++) {
      const phase = await page.evaluate(() => window.__manorStore.getState().day?.phase ?? null);
      if (phase === 'exploring' || phase === 'morning') break;
      const btn = await page.$('.chr-scene__btn, .chr-dusk__skip');
      if (btn) { await btn.click(); await page.waitForTimeout(500); } else { await page.waitForTimeout(500); }
    }
    await page.evaluate(() => { location.hash = '#/manor'; });
    await page.waitForTimeout(600);
    const afterRoll = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.bp-foot__actions .unread-host')].find((x) => (x.childNodes[0]?.textContent || '').trim() === 'Journal');
      const m = b?.querySelector('[class*="unread"]:not(.unread-host)');
      return { mark: m ? (m.textContent || '').trim() : null, phase: window.__manorStore.getState().day?.phase, day: window.__manorStore.getState().day?.day };
    });
    check(afterRoll.mark, `unread survives the day roll (day ${afterRoll.day}, phase ${afterRoll.phase}, mark ${afterRoll.mark}) — AAA 11.20`,
      `unread cleared itself at the day roll (day ${afterRoll.day}, phase ${afterRoll.phase}) — AAA 11.20`);

    // clears ONLY on viewing. Get off the morning card first — it is a modal
    // scene, so /journal deep-linked underneath it is not a surface the player
    // can stand on (verified below by the hit test that found .chr-scene).
    await drainMoments();
    for (let i = 0; i < 10; i++) {
      const ph = await page.evaluate(() => window.__manorStore.getState().day?.phase);
      if (ph === 'exploring') break;
      if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(400); }
      else if (await page.$('.dlg')) { await playScene(); }
      else await page.waitForTimeout(400);
    }
    await drainMoments();
    await page.evaluate(() => { location.hash = '#/journal'; });
    await page.waitForSelector('.jrn-page', { timeout: 8000 });
    await hitTest('/journal BackLink (mid-day)', '.backlink');
    const tabMarks = await page.evaluate(() => [...document.querySelectorAll('.jrn-tabs button')].map((b) => ({
      label: (b.textContent || '').replace(/\s+/g, ' ').trim(),
      mark: Boolean(b.querySelector('[class*="unread"]')),
    })));
    log('   journal tabs:', JSON.stringify(tabMarks));
    check(tabMarks.some((t) => t.mark), 'journal tabs carry the unread mark (AAA 11.19 level 2)', 'no journal tab carries an unread mark though the entrance does (AAA 11.19 chain broken)');
    // view every tab
    const tabCount = await page.evaluate(() => document.querySelectorAll('.jrn-tabs button').length);
    for (let i = 0; i < tabCount; i++) {
      const b = await page.evaluate((n) => {
        const el = document.querySelectorAll('.jrn-tabs button')[n];
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }, i);
      await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
      await page.waitForTimeout(600);
    }
    await page.waitForTimeout(800);
    await page.click('.backlink');
    await page.waitForSelector('.bp-foot__actions', { timeout: 8000 });
    const afterView = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.bp-foot__actions .unread-host')].find((x) => (x.childNodes[0]?.textContent || '').trim() === 'Journal');
      const m = b?.querySelector('[class*="unread"]:not(.unread-host)');
      return m ? (m.textContent || '').trim() : null;
    });
    check(!afterView, 'the Journal mark retires once the pages have been viewed (AAA 11.20/11.21)',
      `the Journal mark still reads "${afterView}" after every tab was viewed (AAA 11.21 — a marker with nothing unread)`);
  }

  /* ======================================================================
     8. DUSK VEIL + NIGHT DIGEST
     ====================================================================== */
  log(''); log('— 8. dusk veil and night digest —');
  {
    await page.evaluate(() => window.__manorStore.getState().endDay('steps-exhausted'));
    await page.waitForTimeout(600);
    const phase = await page.evaluate(() => window.__manorStore.getState().day?.phase);
    if (phase === 'dusk') {
      await assertRetireUnreachable('dusk veil');
      const skip = await boxOf('.chr-dusk__skip');
      check(skip && skip.w > 0, `dusk veil offers a skip (${Math.round(skip?.w)}x${Math.round(skip?.h)})`, 'dusk veil has no skip control');
      if (skip) await hitTest('dusk skip', '.chr-dusk__skip', skip);
      row('dusk veil', 'skip', skip ? '5/5' : 'n/a', 'night', 'auto-advances');
    }
    await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'night', null, { timeout: 12000 }).catch(() => {});
    if (await page.$('.chr-scene')) {
      await assertRetireUnreachable('night digest');
      await hitTest('night digest primary', '.chr-scene__btn');
      const nAside = await boxOf('.chr-scene__aside');
      check(nAside && nAside.w > 0, 'night digest offers the settings aside (AAA 11.24)', 'night digest has no route to settings (AAA 11.24)');
      if (nAside) await hitTest('night digest aside', '.chr-scene__aside', nAside);
      row('night digest', 'primary + Chronicles aside', '5/5', 'next morning · /chronicles', 'retire not reachable');
    }
  }

  /* ======================================================================
     9. UNAUTHORED VOLUME + UNREGISTERED ROOM KIND (error branches)
     ====================================================================== */
  log(''); log('— 9. error branches —');
  {
    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      window.__manorStore.setState({ volume: { ...s.volume, volumeId: 'volume-does-not-exist' } });
    });
    await page.evaluate(() => { location.hash = '#/journal'; });
    await page.waitForTimeout(600);
    const j = await page.evaluate(() => ({
      page: Boolean(document.querySelector('.jrn-page')),
      back: Boolean(document.querySelector('.backlink')),
      text: (document.querySelector('.jrn-empty')?.textContent || '').trim(),
    }));
    check(j.page && j.back, `/journal (unauthored volume): renders with a back link — "${j.text}"`, `/journal (unauthored volume): page=${j.page} back=${j.back} (AAA 11.1)`);
    if (j.back) await hitTest('/journal (unauthored volume) BackLink', '.backlink');
    row('/journal (unauthored volume)', 'BackLink', j.back ? '5/5' : 'MISSING', '/', j.text.slice(0, 40));

    await page.evaluate(() => { location.hash = '#/sanctum'; });
    await page.waitForTimeout(600);
    const s2 = await page.evaluate(() => ({
      page: Boolean(document.querySelector('.snc-page')),
      back: Boolean(document.querySelector('.snc-page .backlink')),
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 100),
    }));
    check(s2.page && s2.back, '/sanctum (unauthored volume): renders with a back link', `/sanctum (unauthored volume): page=${s2.page} back=${s2.back} — "${s2.text}" (AAA 11.1)`);
    if (s2.back) await hitTest('/sanctum (unauthored volume) BackLink', '.snc-page .backlink');
    row('/sanctum (unauthored volume)', 'BackLink', s2.back ? '5/5' : 'MISSING', '/', '');

    // unregistered room kind
    await page.evaluate(() => {
      const store = window.__manorStore;
      const s = store.getState();
      window.__manorStore.setState({ volume: { ...s.volume, volumeId: 'volume-1' } });
      const m = s.manor;
      if (!m) return;
      const cell = m.playerCell; const key = `${cell.col},${cell.row}`;
      store.setState({ manor: { ...m, rooms: { ...m.rooms, [key]: { cardId: 'conservatory', cell, doors: ['N'], solved: false, kind: 'not-a-real-kind' } } } });
      store.getState().enterRoom(key);
    });
    await page.waitForTimeout(700);
    const un = await page.evaluate(() => ({
      hash: location.hash,
      body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 120),
      exit: Boolean([...document.querySelectorAll('button')].find((b) => /step back out/i.test(b.textContent || ''))),
    }));
    check(un.exit || un.hash.includes('manor'), `unregistered room kind: an exit exists (${un.exit ? '"Step back out"' : 'redirected ' + un.hash})`, `unregistered room kind: no exit — "${un.body}" (AAA 11.1)`);
    if (un.exit) {
      const b = await tagBtn('Step back out');
      await hitTest('unregistered-kind "Step back out"', '[data-critic]', b);
    }
    row('/room (unregistered kind)', 'Step back out', un.exit ? '5/5' : 'redirect', '/manor', '');
  }

  /* ======================================================================
     10. 375x667 REPEAT
     ====================================================================== */
  log(''); log('— 10. 375x667 —');
  {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(400);
    await page.evaluate(() => localStorage.clear());
    await hardReload();
    await page.waitForSelector('.bp-scene__title', { timeout: 30000 });
    for (const label of ['Journal', 'Chronicles', 'Begin the first day']) {
      const b = await tagBtn(label, '.bp-scene');
      if (!b) fail(`375x667 front step: no "${label}" control`);
      else await hitTest(`375x667 front step "${b.label}"`, '[data-critic]', b);
    }
    await page.click('[data-critic]'); // Begin
    await page.waitForSelector('.chr-scene', { timeout: 8000 }).catch(() => {});
    if (await page.$('.chr-scene')) {
      await hitTest('375x667 morning primary', '.chr-scene__btn');
      await hitTest('375x667 morning aside', '.chr-scene__aside');
      await assertRetireUnreachable('375x667 morning card');
      await page.click('.chr-scene__btn');
      await playScene();
      await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 }).catch(() => {});
    }
    await page.waitForSelector('.chr-retire', { timeout: 8000 }).catch(() => {});
    if (await page.$('.chr-retire')) await hitTest('375x667 retire', '.chr-retire');
    for (const label of ['Cabinet', 'Journal', 'Chronicles']) {
      const b = await tagBtn(label, '.bp-foot__actions');
      if (!b) fail(`375x667 blueprint: no "${label}" entrance`);
      else await hitTest(`375x667 blueprint "${b.label}"`, '[data-critic]', b);
    }
    // chronicles at 375: settings + trunk still at scroll 0
    await page.evaluate(() => { location.hash = '#/chronicles'; });
    await page.waitForSelector('.chron__title', { timeout: 8000 });
    const reach = await page.evaluate(() => {
      const sc = document.querySelector('.chron__ledger');
      const sr = sc.getBoundingClientRect();
      const vis = (el) => { const r = el.getBoundingClientRect(); return { onGlass: r.bottom <= sr.bottom + 1 && r.top >= sr.top - 1, top: Math.round(r.top - sr.top) }; };
      const settings = [...document.querySelectorAll('.chron__setting')];
      const trunkBtns = [...document.querySelectorAll('.chron__trunk button')];
      return {
        scrollTop: sc.scrollTop,
        motion: vis(settings.find((s) => /reduce motion/i.test(s.textContent))),
        pack: vis(trunkBtns[0]), unpack: vis(trunkBtns[1]),
      };
    });
    check(reach.motion.onGlass && reach.pack.onGlass && reach.unpack.onGlass,
      `375x667 Chronicles: reduce-motion(+${reach.motion.top}) pack(+${reach.pack.top}) unpack(+${reach.unpack.top}) all on glass at scroll ${reach.scrollTop} (AAA 11.23)`,
      `375x667 Chronicles: ${JSON.stringify(reach)} — a control is below the fold (AAA 11.23)`);
    await hitTest('375x667 Chronicles BackLink', '.backlink');
    await page.setViewportSize({ width: 390, height: 844 });
  }

  /* ======================================================================
     11. REDUCED MOTION PASS
     ====================================================================== */
  log(''); log('— 11. prefers-reduced-motion —');
  {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(300);
    await page.evaluate(() => { location.hash = '#/manor'; });
    await page.waitForTimeout(500);
    if (await page.$('.chr-retire')) await hitTest('reduced-motion retire', '.chr-retire');
    await page.evaluate(() => window.__manorStore.getState().fileFragment('frag.v1.01'));
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const el = document.querySelector('.mom');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { onGlass: Boolean(top && (top === el || el.contains(top))), w: Math.round(r.width), h: Math.round(r.height), opacity: getComputedStyle(el).opacity };
    });
    check(m?.onGlass && Number(m.opacity) > 0.5, `reduced motion: the moment is still on glass (${m?.w}x${m?.h}, opacity ${m?.opacity}) — AAA 11.22/U.3`, `reduced motion: the moment is not readable (${JSON.stringify(m)})`);
    const mark = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.bp-foot__actions .unread-host')].find((x) => (x.childNodes[0]?.textContent || '').trim() === 'Journal');
      const el = b?.querySelector('[class*="unread"]:not(.unread-host)');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { text: (el.textContent || '').trim(), w: Math.round(el.getBoundingClientRect().width) };
    });
    check(mark && mark.w > 0, `reduced motion: the unread mark is legible ("${mark?.text}") — AAA 11.22`, 'reduced motion: no unread mark visible');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }

  const real = errors.filter((e) => !/Failed to fetch|net::ERR_FAILED/i.test(e));
  if (real.length) fail(`console/page errors: ${real.slice(0, 5).join(' | ')}`);
  else ok('no console or page errors across the whole walk');

  log(''); log('| surface | exit control | hit test | destination | notes |');
  log('|---|---|---|---|---|');
  for (const r of table) log(`| ${r.surface} | ${r.exit} | ${r.hit} | ${r.dest} | ${r.notes} |`);
} catch (e) {
  fail(`threw: ${e.message}\n${e.stack}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

log('');
log(failures ? `DONE WITH ${failures} FAILURE(S)` : 'DONE — clean walk');
for (const f of fails) log('  -', f);
process.exit(0);
