/**
 * tests/critic-round12-live.mjs — the LIVE INTERACTION CRITIC's §0.4 walk,
 * round 12. Drives the PRODUCTION build via `vite preview`, one Edge instance,
 * sequential surfaces, closed in a finally.
 *
 * VERIFIES rather than assumes the rounds-6/7/10/11 repairs, and adds the two
 * things this round owns: the SECOND marker (the sealed/smudge chain) across a
 * day roll, a reload and the sealed-becomes-legible transition, and the tap
 * cost to audio / reduced motion / the trunk from a fresh save AND mid-day.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VOL = JSON.parse(readFileSync(resolve(ROOT, 'content/authored/volumes/volume-1.json'), 'utf8'));

async function freePort(from = 5510, to = 5570) {
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

const log = (...a) => console.log('[r12]', ...a);
const ok = (m) => console.log('[r12]   PASS', m);
let failures = 0;
const fails = [];
const fail = (m) => { console.error('[r12]   ** FAIL:', m); failures++; fails.push(m); };
const check = (c, good, bad) => { if (c) ok(good); else fail(bad); };

const table = [];
const row = (surface, exit, hit, dest, notes) => table.push({ surface, exit, hit, dest, notes });

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
server.stdout.on('data', () => {});
server.stderr.on('data', (b) => process.stderr.write(`[preview!] ${b}`));
const serverUp = (async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* not yet */ }
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
  let page = await context.newPage();
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

  async function hitTest(name, sel, box, { floor = 44 } = {}) {
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
      if (!hit || !hit.own) { misses.push(`${where}->${hit ? hit.tag + '.' + hit.cls : 'nothing'}`); clean = false; }
    }
    const vp = page.viewportSize();
    const sized = b.w >= floor && b.h >= floor;
    const inView = b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= vp.width + 0.5 && b.y + b.h <= vp.height + 0.5;
    if (misses.length) fail(`${name}: elementFromPoint missed at ${misses.join(', ')} (AAA 11.2)`);
    if (!sized) fail(`${name}: ${Math.round(b.w)}x${Math.round(b.h)} under the ${floor}pt floor (AAA 6.19/11.3)`);
    if (!inView) fail(`${name}: box ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)} outside ${vp.width}x${vp.height} (AAA 11.3)`);
    if (clean && sized && inView) ok(`${name}: 5/5 points, ${Math.round(b.w)}x${Math.round(b.h)}, inside the viewport`);
    return { clean: clean && sized && inView, box: b };
  }

  async function assertRetireUnreachable(surface) {
    const r = await page.evaluate(() => {
      const b = document.querySelector('.chr-retire');
      if (!b) return { rendered: false };
      const rect = b.getBoundingClientRect();
      if (rect.width < 1) return { rendered: false };
      const pts = [[rect.x + rect.width / 2, rect.y + rect.height / 2],
        [rect.x + 6, rect.y + 6], [rect.right - 6, rect.y + 6],
        [rect.x + 6, rect.bottom - 6], [rect.right - 6, rect.bottom - 6]];
      const reach = pts.map(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return Boolean(el && (el === b || b.contains(el)));
      });
      return {
        rendered: true,
        reachable: reach.some(Boolean),
        pe: getComputedStyle(b).pointerEvents,
        overlayAttr: document.documentElement.hasAttribute('data-overlay-open'),
      };
    });
    if (!r.rendered) { ok(`${surface}: retire not rendered while the overlay is up (AAA 11.5)`); return true; }
    if (r.reachable) { fail(`${surface}: .chr-retire IS hit-testable through the overlay (pointer-events:${r.pe}, data-overlay-open=${r.overlayAttr}) — AAA 11.5`); return false; }
    ok(`${surface}: retire rendered but inert at all 5 probe points (pointer-events:${r.pe}) — AAA 11.5`);
    return true;
  }

  const playScene = async () => {
    for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
      const p = await page.$('.dlg-choice--primary');
      if (p) { await p.click(); await page.waitForTimeout(180); continue; }
      const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
      if (c) { await c.click(); await page.waitForTimeout(180); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      await page.waitForTimeout(160);
    }
  };

  const hardReload = async (url) => {
    for (let i = 0; i < 4; i++) {
      try { await page.goto(url ?? page.url(), { waitUntil: 'domcontentloaded', timeout: 60000 }); return; }
      catch (e) {
        if (!/ERR_ABORTED|frame was detached/.test(e.message) || i === 3) throw e;
        await page.waitForTimeout(700);
      }
    }
  };

  const drainMoments = async () => {
    for (let i = 0; i < 30; i++) {
      const b = await boxOf('.mom');
      if (!b) return;
      await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
      await page.waitForTimeout(150);
    }
  };

  const freshLoad = async () => {
    await hardReload(BASE);
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

  /** Read both marker chains at the blueprint entrance level. */
  const entranceMarks = () => page.evaluate(() => {
    const out = {};
    for (const b of document.querySelectorAll('.bp-foot__actions .unread-host, .bp-scene__row .unread-host')) {
      const label = (b.childNodes[0]?.textContent || '').trim();
      const wax = b.querySelector('.unread');
      const seal = b.querySelector('.sealed');
      const rect = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || '').trim(), aria: el.getAttribute('aria-label') }; };
      out[label] = { wax: wax ? rect(wax) : null, sealed: seal ? rect(seal) : null };
    }
    return out;
  });

  const truth = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    const flags = s.flags;
    const vid = s.volume.volumeId;
    const pre = (p) => flags.filter((f) => f.startsWith(`vol.${vid}.${p}-`)).map((f) => f.slice(`vol.${vid}.${p}-`.length));
    const sealedF = pre('sealed'), legible = new Set(pre('legible'));
    const sealed = sealedF.filter((id) => !legible.has(id));
    const viewed = new Set(pre('viewed'));
    const glanced = new Set(pre('glanced'));
    const found = s.volume.foundFragmentIds;
    const seen = (id) => (sealed.includes(id) ? glanced.has(id) : viewed.has(id));
    return {
      found: found.length,
      sealed: sealed.length,
      unviewedFragments: found.filter((id) => !seen(id)).length,
      sealedIds: sealed,
      foundIds: found,
    };
  });

  /** The tab level of both chains, read off the live ribbon. */
  const tabCounts = () => page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll('.jrn-tabs button')) {
      const wax = b.querySelector('.unread');
      const seal = b.querySelector('.sealed');
      out.push({
        label: (b.childNodes[0]?.textContent || '').trim(),
        wax: wax ? Number((wax.getAttribute('aria-label') || '').split(' ')[0]) : 0,
        seal: seal ? Number((seal.getAttribute('aria-label') || '').split(' ')[0]) : 0,
      });
    }
    return out;
  });

  /* ======================================================================
     1. FRESH SAVE — every route, pre-day
     ====================================================================== */
  log(''); log('— 1. fresh save: every route, pre-day —');
  await freshLoad();
  {
    const pre = await S();
    check(pre.day === null, 'fresh save: no day exists (the pre-day branch is the real one)', `fresh save: day ${pre.day} already exists`);
    for (const label of ['Journal', 'Chronicles', 'Begin the first day']) {
      const b = await tagBtn(label, '.bp-scene');
      if (!b) fail(`front step: no "${label}" control on the glass (AAA 11.8)`);
      else await hitTest(`front step "${b.label}"`, '[data-critic]', b);
    }
    row('/ front step (no day)', 'Journal · Chronicles · Begin', '5/5 each', '—', 'pre-day branch');

    for (const [name, hash, waitSel, backSel] of [
      ['/journal (no day)', '#/journal', '.jrn-page', '.jrn-page .backlink'],
      ['/sanctum (no day)', '#/sanctum', '.snc-page', '.snc-page .backlink'],
    ]) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await page.waitForTimeout(500);
      const there = await page.evaluate((w) => Boolean(document.querySelector(w)), waitSel);
      const hasBack = await page.evaluate((b) => Boolean(document.querySelector(b)), backSel);
      check(there && hasBack, `${name}: renders with a back link`, `${name}: page=${there} back=${hasBack} — no way out (AAA 11.1)`);
      if (hasBack) {
        await hitTest(`${name} BackLink`, backSel);
        await page.click(backSel);
        await page.waitForTimeout(400);
        const h = await page.evaluate(() => location.hash);
        check(h === '#/' || h === '' || h === '#', `${name} back → manor (${h || '#/'})`, `${name} back → ${h} (AAA 11.6)`);
        row(name, 'BackLink', '5/5', '/', 'pre-day branch');
      }
    }

    await page.evaluate(() => { location.hash = '#/room'; });
    await page.waitForTimeout(700);
    const rm = await page.evaluate(() => ({ hash: location.hash, bp: Boolean(document.querySelector('.bp-page, .bp-scene')) }));
    check(rm.bp, `/room (no active room): lands on the blueprint (${rm.hash})`, `/room (no active room): hash ${rm.hash}, blueprint=${rm.bp} — stranded (AAA 11.1)`);
    row('/room (no active room)', 'auto-redirect', 'n/a', '/manor', 'no dead end');

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
      row('not-found', 'Back to the Entrance Hall', '5/5', '/', '');
    }
  }

  /* ======================================================================
     2. TAP COUNT — fresh save
     ====================================================================== */
  log(''); log('— 2. taps to audio / reduced motion / trunk (fresh save) —');
  {
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('.bp-scene__title', { timeout: 8000 });
    await tagBtn('Chronicles', '.bp-scene');
    await page.click('[data-critic]');                       // TAP 1
    await page.waitForSelector('.chron__title', { timeout: 8000 });
    const reach = await page.evaluate(() => {
      const sc = document.querySelector('.chron__ledger');
      const sr = sc.getBoundingClientRect();
      const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { onGlass: r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1 && r.height > 0, top: Math.round(r.top - sr.top) }; };
      const settings = [...document.querySelectorAll('.chron__setting')];
      const byLabel = (t) => settings.find((s) => (s.textContent || '').toLowerCase().includes(t));
      const tb = [...document.querySelectorAll('.chron__trunk button')];
      return {
        scrollTop: sc.scrollTop,
        sound: vis(byLabel('sound')), music: vis(byLabel('music')),
        ring: vis(byLabel('ring switch')), motion: vis(byLabel('reduce motion')),
        pack: vis(tb[0]), unpack: vis(tb[1]),
      };
    });
    const allOn = ['sound', 'music', 'ring', 'motion', 'pack', 'unpack'].every((k) => reach[k]?.onGlass);
    check(allOn,
      `fresh save: sound(+${reach.sound?.top}) music(+${reach.music?.top}) ring(+${reach.ring?.top}) motion(+${reach.motion?.top}) pack(+${reach.pack?.top}) unpack(+${reach.unpack?.top}) all on glass at scroll ${reach.scrollTop} — 2 taps (AAA 11.23)`,
      `fresh save: not every control is on glass at scroll 0 — ${JSON.stringify(reach)} (AAA 11.23)`);
    await hitTest('Chronicles first setting row', '.chron__setting');
    await hitTest('Chronicles trunk Pack', '.chron__trunk button');
    const after = await S();
    check(after.day === null && after.records === 0,
      'fresh save → settings + trunk cost no day, no step, no scene (AAA 11.26)',
      `reaching the trunk cost state: day ${after.day}, records ${after.records} (AAA 11.26)`);
    await page.click('.backlink');
    await page.waitForTimeout(400);
    row('/chronicles (no day)', 'BackLink "The manor"', '5/5', '/', '2 taps to sound/motion/trunk');
  }

  /* ======================================================================
     3. LIFECYCLE SCENES
     ====================================================================== */
  log(''); log('— 3. lifecycle overlays: morning card —');
  {
    await page.click('.bp-btn--seal');
    await page.waitForSelector('.chr-scene', { timeout: 8000 });
    await hitTest('morning card primary', '.chr-scene__btn');
    const asides = await page.evaluate(() => [...document.querySelectorAll('.chr-scene__aside')].map((a, i) => {
      const r = a.getBoundingClientRect();
      return { i, label: (a.textContent || '').replace(/\s+/g, ' ').trim(), x: r.x, y: r.y, w: r.width, h: r.height };
    }));
    log('   morning asides:', JSON.stringify(asides));
    check(asides.length >= 2, `morning card offers ${asides.length} asides (Chronicles + Journal) — AAA 11.24/11.12`, `morning card offers only ${asides.length} aside(s) — the scene with one door (AAA 11.12)`);
    for (const a of asides) {
      await page.evaluate((i) => {
        document.querySelectorAll('[data-critic]').forEach((e) => e.removeAttribute('data-critic'));
        document.querySelectorAll('.chr-scene__aside')[i].setAttribute('data-critic', '1');
      }, a.i);
      await hitTest(`morning aside "${a.label.slice(0, 24)}"`, '[data-critic]', a);
    }
    await assertRetireUnreachable('morning card');

    // TAP COUNT mid-scene: journal in ONE tap from the morning card.
    const jIdx = asides.findIndex((a) => /journal/i.test(a.label));
    if (jIdx < 0) fail('morning card: no Journal aside (AAA 11.12 — the scene names filed documents it cannot reach)');
    else {
      await page.evaluate((i) => document.querySelectorAll('.chr-scene__aside')[i].click(), jIdx);
      await page.waitForSelector('.jrn-page', { timeout: 8000 });
      ok('morning card → Journal in ONE tap (AAA 11.12/4.15)');
      await hitTest('/journal BackLink (from morning card)', '.jrn-page .backlink');
      await page.click('.jrn-page .backlink');
      await page.waitForTimeout(500);
      const backOnCard = await page.evaluate(() => Boolean(document.querySelector('.chr-scene')));
      check(backOnCard, 'morning card is exactly where she left it after the journal round trip', 'the journal back-link did not return to the morning card');
    }
    row('morning card', 'primary · Chronicles aside · Journal aside', '5/5 each', 'greeting · /chronicles · /journal', 'retire inert');

    await page.click('.chr-scene__btn');
    await page.waitForSelector('.dlg', { timeout: 8000 });
    await assertRetireUnreachable('dialogue overlay');
    row('dialogue overlay', 'choices / tap-to-advance', 'n/a', 'closes to caller', 'retire inert');
    await playScene();
    await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 });
  }

  /* ======================================================================
     4. BLUEPRINT + overlays, mid-day tap count
     ====================================================================== */
  log(''); log('— 4. exploring blueprint —');
  {
    await page.waitForSelector('.chr-retire', { timeout: 8000 });
    await hitTest('blueprint retire', '.chr-retire');
    for (const label of ['Cabinet', 'Journal', 'Chronicles']) {
      const b = await tagBtn(label, '.bp-foot__actions');
      if (!b) fail(`blueprint: no "${label}" entrance (AAA 11.9)`);
      else await hitTest(`blueprint "${b.label}"`, '[data-critic]', b);
    }
    // MID-DAY tap count to settings (TAP 1 = Chronicles, TAP 2 = the control).
    await tagBtn('Chronicles', '.bp-foot__actions');
    await page.click('[data-critic]');
    await page.waitForSelector('.chron__title', { timeout: 8000 });
    const midReach = await page.evaluate(() => {
      const sc = document.querySelector('.chron__ledger');
      const sr = sc.getBoundingClientRect();
      const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { onGlass: r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1, top: Math.round(r.top - sr.top) }; };
      const settings = [...document.querySelectorAll('.chron__setting')];
      const byLabel = (t) => settings.find((s) => (s.textContent || '').toLowerCase().includes(t));
      const tb = [...document.querySelectorAll('.chron__trunk button')];
      return { scrollTop: sc.scrollTop, sound: vis(byLabel('sound')), motion: vis(byLabel('reduce motion')), pack: vis(tb[0]), unpack: vis(tb[1]) };
    });
    check(['sound', 'motion', 'pack', 'unpack'].every((k) => midReach[k]?.onGlass),
      `mid-day: sound(+${midReach.sound?.top}) motion(+${midReach.motion?.top}) pack(+${midReach.pack?.top}) unpack(+${midReach.unpack?.top}) on glass at scroll ${midReach.scrollTop} — 2 taps (AAA 11.23/11.24)`,
      `mid-day Chronicles: ${JSON.stringify(midReach)} — a control is below the fold (AAA 11.23)`);
    const stateMid = await S();
    await page.click('.backlink');
    await page.waitForSelector('.bp-foot__actions', { timeout: 8000 });
    const stateBack = await S();
    check(stateMid.steps === stateBack.steps,
      `mid-day settings round trip spent no steps (${stateBack.steps} both ways) — AAA 11.26`,
      `mid-day settings round trip changed steps ${stateMid.steps}→${stateBack.steps}`);
    row('/manor exploring', 'retire · Cabinet · Journal · Chronicles', '5/5 each', 'arms · cabinet · /journal · /chronicles', '2 taps to settings mid-day');

    // CABINET
    await tagBtn('Cabinet', '.bp-foot__actions');
    await page.click('[data-critic]');
    await page.waitForSelector('.bp-modal', { timeout: 8000 });
    await assertRetireUnreachable('cabinet sheet');
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
      check(await page.evaluate(() => !document.querySelector('.bp-modal')), 'cabinet close returns to the blueprint', 'cabinet close did not dismiss');
      row('cabinet sheet', closeBox.label, '5/5', '/manor', 'retire inert');
    }

    // DRAFT
    const drafted = await page.evaluate(() => {
      const s = window.__manorStore.getState();
      for (const d of ['N', 'E', 'W', 'S']) { try { s.openDraft(d); } catch { /* locked */ } if (window.__manorStore.getState().draftOffer) return d; }
      return null;
    });
    await page.waitForSelector('.bp-modal', { timeout: 8000 }).catch(() => {});
    if (await page.$('.bp-modal')) {
      await assertRetireUnreachable('draft modal');
      const cancel = await page.evaluate(() => {
        document.querySelectorAll('[data-critic]').forEach((e) => e.removeAttribute('data-critic'));
        const b = [...document.querySelectorAll('.bp-modal button')].find((x) => /back|cancel|leave|not|never/i.test(x.textContent || ''));
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
        check(await page.evaluate(() => !document.querySelector('.bp-modal')), 'draft cancel returns to the blueprint', 'draft cancel did not dismiss');
        row('draft modal', cancel.label, '5/5', '/manor', `opened at door ${drafted}; retire inert`);
      }
    } else fail('draft modal: could not be opened — surface not walked');
  }

  /* ======================================================================
     5. ROOM SURFACE
     ====================================================================== */
  log(''); log('— 5. inside a room —');
  {
    const entered = await page.evaluate(() => {
      const store = window.__manorStore;
      const s = store.getState();
      const m = s.manor;
      const cell = { col: m.playerCell.col, row: m.playerCell.row };
      const key = `${cell.col},${cell.row}`;
      store.setState({ manor: { ...m, rooms: { ...m.rooms, [key]: { cardId: 'conservatory', cell, doors: ['N', 'S'], solved: false, kind: 'hive' } } } });
      store.getState().enterRoom(key);
      return Boolean(store.getState().day?.activeRoom);
    });
    check(entered, 'a puzzle room was entered (/room is live)', 'could not enter a room — /room not walked');
    await page.waitForTimeout(700);
    const host = await page.evaluate(() => Boolean(document.querySelector('.room-host')));
    check(host, '/room renders RoomHost', '/room did not render');
    if (host) {
      const exits = await page.evaluate(() => [...document.querySelectorAll('.room-host__footer button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim()));
      check(exits.length > 0, `/room offers ${exits.length} exit(s): ${exits.join(' · ')}`, '/room has no exit control (AAA 11.1)');
      for (const label of exits) {
        const b = await tagBtn(label, '.room-host__footer');
        if (b) await hitTest(`/room "${b.label}"`, '[data-critic]', b);
      }
      row('/room (active puzzle)', exits.join(' · '), '5/5 each', '/manor', '');
    }
  }

  /* ======================================================================
     6. CAMPAIGN GRANTS, per screen + persistent trace
     ====================================================================== */
  log(''); log('— 6. campaign grants where the player really is —');
  const FRAGS = VOL.fragments.map((f) => f.id);
  let fi = 0;

  async function provoke(surface, fn) {
    await page.evaluate(fn);
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const el = document.querySelector('.mom');
      if (!el) return { mounted: false };
      const r = el.getBoundingClientRect();
      const pts = [[r.x + r.width / 2, r.y + r.height / 2], [r.x + 10, r.y + 10], [r.right - 10, r.bottom - 10]];
      /* "On glass" means NOTHING IS PAINTED OVER IT, which is not the same
         question as "is it tappable" — and since round 12 the two answers
         differ on /room, where the seal is deliberately `pointer-events: none`
         so it cannot eat the taps aimed at the board under it (AAA 11.27).
         `elementFromPoint` skips pointer-events:none nodes, so asking it
         directly would report the notice missing when it is plainly there. The
         property is borrowed for the length of one synchronous hit test and
         handed straight back: no frame is painted in between, so the app never
         sees it, and the measurement stays the proven three-point one. */
      const held = el.style.pointerEvents;
      el.style.pointerEvents = 'auto';
      const onGlass = pts.every(([x, y]) => { const t = document.elementFromPoint(x, y); return Boolean(t && (t === el || el.contains(t))); });
      el.style.pointerEvents = held;
      const cs = getComputedStyle(el);
      return {
        mounted: true, w: Math.round(r.width), h: Math.round(r.height), onGlass,
        inView: r.top >= 0 && r.bottom <= window.innerHeight,
        opacity: cs.opacity,
        title: (el.querySelector('.mom__title')?.textContent || '').trim(),
        where: (el.querySelector('.mom__where')?.textContent || '').trim(),
      };
    });
    if (!m.mounted) { fail(`${surface}: the grant fired and NO moment mounted (AAA 11.11)`); return null; }
    check(m.onGlass && m.inView && Number(m.opacity) > 0.5,
      `${surface}: moment on glass ${m.w}x${m.h} — "${m.title}" / "${m.where}"`,
      `${surface}: moment mounted but not usable (onGlass=${m.onGlass} inView=${m.inView} opacity=${m.opacity}) — AAA 11.11`);
    return m;
  }

  await page.evaluate((ids) => { window.__CRITIC_FRAGS = ids.slice(); }, FRAGS);
  await provoke('/room (fragment)', () => window.__manorStore.getState().fileFragment(window.__CRITIC_FRAGS.shift()));

  await page.evaluate(() => window.__manorStore.getState().leaveRoom());
  await page.waitForTimeout(400);
  await drainMoments();
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForSelector('.jrn-page', { timeout: 8000 });
  await provoke('/journal (fragment)', () => window.__manorStore.getState().fileFragment(window.__CRITIC_FRAGS.shift()));
  await drainMoments();
  await page.evaluate(() => { location.hash = '#/chronicles'; });
  await page.waitForSelector('.chron__title', { timeout: 8000 });
  await provoke('/chronicles (fragment)', () => window.__manorStore.getState().fileFragment(window.__CRITIC_FRAGS.shift()));
  await drainMoments();
  await page.evaluate(() => { location.hash = '#/manor'; });
  await page.waitForSelector('.bp-page', { timeout: 8000 });
  await provoke('/manor (affinity rank-up)', () => { for (let i = 0; i < 12; i++) window.__manorStore.getState().adjustAffinity('ellery', 1); });
  await drainMoments();
  await provoke('/manor (floorplan plate)', () => window.__manorStore.getState().unlockCard('gallery'));
  await drainMoments();

  // A SEALED page filed — and then made out. Both are campaign class.
  await page.evaluate(() => { location.hash = '#/manor'; });
  await page.waitForTimeout(300);
  const sealedId = await page.evaluate(() => {
    const id = window.__CRITIC_FRAGS.shift();
    window.__CRITIC_SEALED = id;
    window.__manorStore.getState().fileFragment(id, { sealed: true });
    return id;
  });
  await page.waitForTimeout(600);
  {
    const m = await page.evaluate(() => {
      const el = document.querySelector('.mom');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { onGlass: Boolean(t && (t === el || el.contains(t))), title: (el.querySelector('.mom__title')?.textContent || '').trim(), where: (el.querySelector('.mom__where')?.textContent || '').trim() };
    });
    check(m?.onGlass, `/manor: a SEALED page presses its own moment — "${m?.title}" / "${m?.where}"`, '/manor: filing a sealed page produced no visible moment (AAA 11.11)');
  }
  await drainMoments();

  /* ======================================================================
     7. THE TWO CHAINS — entrance, tab, item; day roll, reload, decipher
     ====================================================================== */
  log(''); log('— 7. wax + smudge chains —');
  {
    await page.evaluate(() => { location.hash = '#/manor'; });
    await page.waitForSelector('.bp-foot__actions', { timeout: 8000 });
    const t0 = await truth();
    const m0 = await entranceMarks();
    log('   truth:', JSON.stringify(t0.foundIds.length), 'found,', t0.sealed, 'sealed,', t0.unviewedFragments, 'unviewed');
    log('   entrance:', JSON.stringify(m0));
    check(m0.Journal?.wax, `blueprint Journal entrance carries wax (${m0.Journal?.wax?.text}) — AAA 11.19 level 1`, 'blueprint Journal entrance carries NO wax after fragments were filed (AAA 11.19)');
    check(t0.sealed > 0, `${t0.sealed} page(s) are sealed — the smudge chain has something to say`, 'no sealed pages: the smudge chain cannot be tested here');
    check(Boolean(m0.Journal?.sealed),
      `blueprint Journal entrance carries the smudge marker too (${m0.Journal?.sealed?.text}) — the seal chain reaches level 1`,
      `blueprint Journal entrance carries NO smudge marker though ${t0.sealed} page(s) are sealed — the seal chain has no entrance level on the main screen (AAA 11.19 shape)`);

    // The same two entrances on the scenes (morning/night) DO carry both:
    // compare, so the finding is about the blueprint, not about the marker.
    // (Checked in section 8 on the night digest.)

    // journal: tabs + items
    await tagBtn('Journal', '.bp-foot__actions');
    await page.click('[data-critic]');
    await page.waitForSelector('.jrn-page', { timeout: 8000 });
    await hitTest('/journal BackLink (mid-day)', '.jrn-page .backlink');
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.jrn-tabs button')].map((b, i) => {
      const r = b.getBoundingClientRect();
      return {
        i, label: (b.textContent || '').replace(/\s+/g, ' ').trim(),
        x: r.x, y: r.y, w: Math.round(r.width), h: Math.round(r.height),
        wax: Boolean(b.querySelector('.unread')), seal: Boolean(b.querySelector('.sealed')),
      };
    }));
    log('   tabs:', JSON.stringify(tabs));
    // every tab hit-tested at 5 points (the round-11 escape: the seal landed on all four)
    for (const t of tabs) {
      await page.evaluate((i) => {
        document.querySelectorAll('[data-critic]').forEach((e) => e.removeAttribute('data-critic'));
        document.querySelectorAll('.jrn-tabs button')[i].setAttribute('data-critic', '1');
      }, t.i);
      await hitTest(`journal tab "${t.label}"`, '[data-critic]', { x: t.x, y: t.y, w: t.w, h: t.h }, { floor: 44 });
    }
    check(tabs.some((t) => t.seal), 'a journal tab carries the smudge marker (seal chain level 2)', 'no journal tab carries a smudge marker though pages are sealed (AAA 11.19 shape)');
    check(tabs.some((t) => t.wax), 'a journal tab carries wax (AAA 11.19 level 2)', 'no journal tab carries wax though the entrance does (chain broken)');

    // Consistency of the two chains across levels (AAA 11.19): the entrance
    // number is the sum of the tab numbers, at the same instant.
    const tc0 = await tabCounts();
    log('   tab counts on arrival:', JSON.stringify(tc0));
    const sealSum = tc0.reduce((n, t) => n + t.seal, 0);
    check(sealSum === t0.sealed,
      `the tab ring counts sum to ${sealSum}, exactly the ${t0.sealed} sealed page(s) (AAA 11.21)`,
      `the tab ring counts sum to ${sealSum} but ${t0.sealed} page(s) are sealed (AAA 11.21)`);

    // view every tab, then check the item level of both chains
    for (const t of tabs) {
      await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2);
      await page.waitForTimeout(500);
      const pips = await page.evaluate(() => ({
        wax: document.querySelectorAll('.jrn-sheet .unread--pip').length,
        seal: document.querySelectorAll('.jrn-sheet .sealed--pip').length,
      }));
      log(`   tab "${t.label}": ${pips.wax} wax pip(s), ${pips.seal} seal pip(s) on the cards`);
    }
    await page.waitForTimeout(600);
    // Break every seal in the tray so the wax has nothing left to be about:
    // 11.21 says NO marker where nothing is unread, and letters are the other
    // half of the entrance count.
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('.jrn-tabs button')].find((b) => /letters/i.test(b.textContent || ''));
      t?.click();
    });
    await page.waitForTimeout(400);
    for (let i = 0; i < 8; i++) {
      const heads = await page.$$('.jrn-letter__head');
      let broke = false;
      for (const h of heads) {
        const txt = await h.innerText();
        if (/break the seal/i.test(txt)) { await h.click(); await page.waitForTimeout(350); broke = true; break; }
      }
      if (!broke) break;
    }
    // Breaking a seal can open a character scene ON the journal — a
    // full-screen overlay reached from a page, so it gets the same probes.
    if (await page.$('.dlg')) {
      ok('a letter opened a conversation overlay on /journal — probing it as a surface');
      await assertRetireUnreachable('dialogue overlay (opened from /journal)');
      const affordances = await page.evaluate(() => document.querySelectorAll('.dlg-choice, .dlg__sheet').length);
      check(affordances > 0, 'journal dialogue overlay: advance/choice affordances present (AAA 11.1)', 'journal dialogue overlay: nothing to tap (AAA 11.1)');
      await playScene();
      await page.waitForTimeout(300);
      const backOnJournal = await page.evaluate(() => Boolean(document.querySelector('.jrn-page')));
      check(backOnJournal, 'the journal dialogue closes back to /journal (AAA 11.6)', 'the journal dialogue did not return to /journal');
    }
    await drainMoments();
    await page.waitForTimeout(400);
    const tcAfter = await tabCounts();
    log('   tab counts after viewing + opening every letter:', JSON.stringify(tcAfter));

    // A letter's grant files fresh pages, so sweep the tabs once more before
    // asking the marker to be empty.
    if (await page.$('.dlg')) await playScene();
    for (const t of tabs) { await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2); await page.waitForTimeout(400); }
    await page.waitForTimeout(500);
    await drainMoments();
    if (await page.$('.dlg')) await playScene();
    await page.evaluate(() => { location.hash = '#/journal'; });
    await page.waitForTimeout(300);

    await page.click('.jrn-page .backlink');
    await page.waitForSelector('.bp-foot__actions', { timeout: 8000 });
    const t1 = await truth();
    const m1 = await entranceMarks();
    check(!m1.Journal?.wax && t1.unviewedFragments === 0,
      'the wax retires once every page has been on the glass and every seal broken — no marker where nothing is unread (AAA 11.20/11.21)',
      `wax still reads "${m1.Journal?.wax?.text}" with ${t1.unviewedFragments} unviewed fragments and every letter opened (AAA 11.21)`);
    check(t1.sealed > 0, `the ${t1.sealed} sealed page(s) survive being looked at — a glance is not a decipher`, 'the sealed set emptied itself on viewing');

    // ---- RELOAD ----
    await hardReload();
    await page.waitForSelector('.bp-foot__actions', { timeout: 30000 });
    const t2 = await truth();
    const m2 = await entranceMarks();
    check(t2.sealed === t1.sealed, `the smudge state survives a reload (${t2.sealed} sealed) — AAA 11.20`, `sealed count changed across a reload ${t1.sealed}→${t2.sealed} (AAA 11.20)`);
    check(!m2.Journal?.wax, 'wax stays retired across a reload (AAA 11.20/11.21)', `wax came back across a reload ("${m2.Journal?.wax?.text}") — AAA 11.21`);

    // ---- DAY ROLL ----
    await page.evaluate(() => window.__manorStore.getState().endDay('retired-early'));
    await page.waitForTimeout(700);
    for (let i = 0; i < 14; i++) {
      const ph = await page.evaluate(() => window.__manorStore.getState().day?.phase ?? null);
      if (ph === 'morning') break;
      const btn = await page.$('.chr-scene__btn, .chr-dusk__skip');
      if (btn) { await btn.click(); await page.waitForTimeout(500); } else await page.waitForTimeout(500);
    }
    const nightSurface = await page.evaluate(() => ({
      scene: Boolean(document.querySelector('.chr-scene')),
      phase: window.__manorStore.getState().day?.phase,
      day: window.__manorStore.getState().day?.day,
    }));
    log('   after roll:', JSON.stringify(nightSurface));
    const t3 = await truth();
    check(t3.sealed === t2.sealed, `the smudge survives the day roll (${t3.sealed} sealed, day ${nightSurface.day}) — AAA 11.20`, `sealed count changed at the day roll ${t2.sealed}→${t3.sealed} (AAA 11.20)`);
    // on the morning card: BOTH markers at the scene's journal entrance
    const sceneMarks = await page.evaluate(() => {
      const a = [...document.querySelectorAll('.chr-scene__aside')].find((x) => /journal/i.test(x.textContent || ''));
      if (!a) return null;
      const wax = a.querySelector('.unread'); const seal = a.querySelector('.sealed');
      return { wax: wax ? (wax.textContent || '').trim() : null, seal: seal ? (seal.textContent || '').trim() : null, sealAria: seal?.getAttribute('aria-label') ?? null };
    });
    log('   morning card journal aside marks:', JSON.stringify(sceneMarks));
    check(sceneMarks && sceneMarks.seal !== null,
      `the morning card's Journal aside carries the smudge marker (${sceneMarks?.seal}, "${sceneMarks?.sealAria}")`,
      'the morning card Journal aside carries no smudge marker');

    // get to exploring again
    for (let i = 0; i < 12; i++) {
      const ph = await page.evaluate(() => window.__manorStore.getState().day?.phase);
      if (ph === 'exploring') break;
      if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(400); }
      else if (await page.$('.dlg')) await playScene();
      else await page.waitForTimeout(400);
    }
    await drainMoments();

    // ---- SEALED BECOMES LEGIBLE ----
    log('   — the sealed→legible transition —');
    await page.evaluate(() => { location.hash = '#/manor'; });
    await page.waitForSelector('.bp-foot__actions', { timeout: 8000 });
    const before = { truth: await truth(), marks: await entranceMarks() };
    const made = await page.evaluate(() => window.__manorStore.getState().decipherFragments(3));
    await page.waitForTimeout(700);
    const madeMoment = await page.evaluate(() => {
      const el = document.querySelector('.mom');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { onGlass: Boolean(t && (t === el || el.contains(t))), title: (el.querySelector('.mom__title')?.textContent || '').trim(), where: (el.querySelector('.mom__where')?.textContent || '').trim() };
    });
    check(Array.isArray(made) && made.length > 0, `decipher made out ${made?.length} page(s)`, 'decipherFragments made nothing out — the transition could not be tested');
    check(madeMoment?.onGlass, `the made-out batch presses a moment on the blueprint — "${madeMoment?.title}" / "${madeMoment?.where}" (AAA 11.11)`, 'a page became legible with NO moment on the screen the player was on (AAA 11.11)');
    await drainMoments();
    const after = { truth: await truth(), marks: await entranceMarks() };
    log('   before:', JSON.stringify(before.truth), JSON.stringify(before.marks.Journal));
    log('   after :', JSON.stringify(after.truth), JSON.stringify(after.marks.Journal));
    check(after.truth.sealed < before.truth.sealed, `the smudge count fell ${before.truth.sealed}→${after.truth.sealed} when the pages were made out`, `the smudge count did not fall (${before.truth.sealed}→${after.truth.sealed})`);
    check(after.truth.unviewedFragments > 0 && after.marks.Journal?.wax,
      `becoming legible RE-RAISES wax (${after.marks.Journal?.wax?.text} unread, ${after.truth.unviewedFragments} truly unviewed) — the round-12 table's third row`,
      `a page became legible and no wax was raised (wax=${JSON.stringify(after.marks.Journal?.wax)}, ${after.truth.unviewedFragments} unviewed) — the player is never told the words arrived (AAA 11.19/11.21)`);
    const waxDelta = Number(after.marks.Journal?.wax?.text ?? 0) - Number(before.marks.Journal?.wax?.text ?? 0);
    const truthDelta = after.truth.unviewedFragments - before.truth.unviewedFragments;
    check(waxDelta === truthDelta,
      `the entrance count moved by exactly the number of pages that came clear (+${waxDelta} = +${truthDelta}) — AAA 11.21`,
      `the entrance count moved +${waxDelta} while ${truthDelta} page(s) actually became unviewed-and-legible (AAA 11.21)`);

    // read the now-legible page and confirm the wax clears for good
    await tagBtn('Journal', '.bp-foot__actions');
    await page.click('[data-critic]');
    await page.waitForSelector('.jrn-page', { timeout: 8000 });
    const tabs2 = await page.evaluate(() => [...document.querySelectorAll('.jrn-tabs button')].map((b, i) => { const r = b.getBoundingClientRect(); return { i, x: r.x, y: r.y, w: r.width, h: r.height }; }));
    for (const t of tabs2) { await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2); await page.waitForTimeout(450); }
    await page.waitForTimeout(500);
    await page.click('.jrn-page .backlink');
    await page.waitForSelector('.bp-foot__actions', { timeout: 8000 });
    const t4 = await truth(); const m4 = await entranceMarks();
    check(t4.unviewedFragments === 0,
      'reading the now-legible pages retires their wax again — the mark tracks viewing and nothing else (AAA 11.20)',
      `after reading the legible pages ${t4.unviewedFragments} fragment(s) are still unviewed — AAA 11.20`);
    log(`   entrance wax after re-reading: ${m4.Journal?.wax?.text ?? 'none'} (any residue is the letter tray)`);
    row('journal chains', 'wax + smudge', 'entrance/tab/item', '—', `sealed ${t4.sealed}, unviewed ${t4.unviewedFragments}`);
  }

  /* ======================================================================
     7b. EVERY CONTROL IN THE TOP BAND, WITH A MOMENT ON GLASS (round-11 #4)
     ====================================================================== */
  log(''); log('— 7b. controls under a live moment —');
  {
    await drainMoments();
    await page.evaluate(() => { location.hash = '#/journal'; });
    await page.waitForSelector('.jrn-page', { timeout: 8000 });
    await page.evaluate(() => window.__manorStore.getState().fileFragment(window.__CRITIC_FRAGS?.shift?.() ?? 'frag.v1.09'));
    await page.evaluate(() => window.__manorStore.getState().adjustAffinity('bramble', 12));
    await page.waitForTimeout(600);
    if (await page.$('.mom')) {
      const geo = await page.evaluate(() => {
        const m = document.querySelector('.mom').getBoundingClientRect();
        const back = document.querySelector('.jrn-page .backlink')?.getBoundingClientRect();
        const tabs = [...document.querySelectorAll('.jrn-tabs button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; });
        return { mom: [Math.round(m.top), Math.round(m.bottom)], back: back ? [Math.round(back.top), Math.round(back.bottom)] : null, tabs };
      });
      log('   moment', JSON.stringify(geo.mom), '· back', JSON.stringify(geo.back), '· tabs', JSON.stringify(geo.tabs));
      await hitTest('/journal BackLink WITH a moment on glass', '.jrn-page .backlink');
      const tabs = await page.evaluate(() => [...document.querySelectorAll('.jrn-tabs button')].map((b, i) => { const r = b.getBoundingClientRect(); return { i, label: (b.childNodes[0]?.textContent || '').trim(), x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const t of tabs) {
        await page.evaluate((i) => {
          document.querySelectorAll('[data-critic]').forEach((e) => e.removeAttribute('data-critic'));
          document.querySelectorAll('.jrn-tabs button')[i].setAttribute('data-critic', '1');
        }, t.i);
        await hitTest(`journal tab "${t.label}" WITH a moment on glass`, '[data-critic]', t);
      }
      // and the queued case: grants QUEUE, so a second seal follows the first
      const queued = await page.evaluate(() => (document.querySelector('.mom__waiting')?.textContent || '').trim());
      log('   queue tail on the seal:', JSON.stringify(queued));
    } else fail('7b: no moment mounted on /journal — the overlap probe could not run');
    await drainMoments();
    await page.evaluate(() => { location.hash = '#/manor'; });
    await page.waitForSelector('.bp-foot__actions', { timeout: 8000 });
    await page.evaluate(() => window.__manorStore.getState().unlockCard('library'));
    await page.waitForTimeout(600);
    if (await page.$('.mom')) {
      if (await page.$('.chr-retire')) await hitTest('blueprint retire WITH a moment on glass', '.chr-retire');
      const je = await tagBtn('Journal', '.bp-foot__actions');
      if (je) await hitTest('blueprint Journal entrance WITH a moment on glass', '[data-critic]', je);
      const ce = await tagBtn('Chronicles', '.bp-foot__actions');
      if (ce) await hitTest('blueprint Chronicles entrance WITH a moment on glass', '[data-critic]', ce);
    }
    await drainMoments();
  }

  /* ======================================================================
     8. DUSK + NIGHT DIGEST
     ====================================================================== */
  log(''); log('— 8. dusk veil and night digest —');
  {
    await page.evaluate(() => window.__manorStore.getState().endDay('steps-exhausted'));
    await page.waitForTimeout(600);
    const phase = await page.evaluate(() => window.__manorStore.getState().day?.phase);
    if (phase === 'dusk') {
      await assertRetireUnreachable('dusk veil');
      const skip = await boxOf('.chr-dusk__skip');
      if (skip) await hitTest('dusk skip', '.chr-dusk__skip', skip);
      else fail('dusk veil has no skip control');
      row('dusk veil', 'skip', skip ? '5/5' : 'MISSING', 'night', 'auto-advances');
    }
    await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'night', null, { timeout: 12000 }).catch(() => {});
    if (await page.$('.chr-scene')) {
      await assertRetireUnreachable('night digest');
      await hitTest('night digest primary', '.chr-scene__btn');
      const asides = await page.evaluate(() => [...document.querySelectorAll('.chr-scene__aside')].map((a, i) => {
        const r = a.getBoundingClientRect();
        return { i, label: (a.textContent || '').replace(/\s+/g, ' ').trim(), x: r.x, y: r.y, w: r.width, h: r.height, wax: (a.querySelector('.unread')?.textContent || '').trim() || null, seal: (a.querySelector('.sealed')?.textContent || '').trim() || null };
      }));
      log('   night asides:', JSON.stringify(asides));
      check(asides.length >= 2, `night digest offers ${asides.length} asides`, `night digest offers only ${asides.length} aside(s) — AAA 11.12`);
      for (const a of asides) {
        await page.evaluate((i) => {
          document.querySelectorAll('[data-critic]').forEach((e) => e.removeAttribute('data-critic'));
          document.querySelectorAll('.chr-scene__aside')[i].setAttribute('data-critic', '1');
        }, a.i);
        await hitTest(`night aside "${a.label.slice(0, 22)}"`, '[data-critic]', a);
      }
      // the digest prints prose about the tray — can she reach it in one tap?
      const jIdx = asides.findIndex((a) => /journal/i.test(a.label));
      if (jIdx >= 0) {
        await page.evaluate((i) => document.querySelectorAll('.chr-scene__aside')[i].click(), jIdx);
        await page.waitForSelector('.jrn-page', { timeout: 8000 });
        ok('night digest → Journal in ONE tap (AAA 11.12)');
        await page.click('.jrn-page .backlink');
        await page.waitForTimeout(500);
        check(await page.evaluate(() => Boolean(document.querySelector('.chr-scene'))), 'night digest survives the journal round trip', 'the journal back-link did not return to the night digest');
      } else fail('night digest: no Journal aside (AAA 11.12)');
      row('night digest', 'primary · Chronicles · Journal', '5/5 each', 'next morning · /chronicles · /journal', 'retire inert');
    }
  }

  /* ======================================================================
     9. ERROR BRANCHES
     ====================================================================== */
  log(''); log('— 9. error branches —');
  {
    // Back to a standable surface first: a page deep-linked under a lifecycle
    // scene is not a surface the player can be on, and probing one there
    // measures the scene, not the page.
    for (let i = 0; i < 14; i++) {
      const ph = await page.evaluate(() => window.__manorStore.getState().day?.phase ?? null);
      if (ph === 'exploring') break;
      if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(450); }
      else if (await page.$('.dlg')) await playScene();
      else if (await page.$('.chr-dusk__skip')) { await page.click('.chr-dusk__skip'); await page.waitForTimeout(450); }
      else await page.waitForTimeout(450);
    }
    await drainMoments();
    const ph = await page.evaluate(() => window.__manorStore.getState().day?.phase ?? null);
    check(ph === 'exploring', `error branches probed from phase "${ph}" (no lifecycle scene in the way)`, `could not reach exploring before the error branches (phase ${ph}) — the probes below measure the scene`);

    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      window.__manorStore.setState({ volume: { ...s.volume, volumeId: 'volume-does-not-exist' } });
    });
    await page.evaluate(() => { location.hash = '#/journal'; });
    await page.waitForTimeout(700);
    const j = await page.evaluate(() => ({ page: Boolean(document.querySelector('.jrn-page')), back: Boolean(document.querySelector('.jrn-page .backlink')), text: (document.querySelector('.jrn-empty')?.textContent || '').trim() }));
    check(j.page && j.back, `/journal (unauthored volume): renders with a back link — "${j.text}"`, `/journal (unauthored volume): page=${j.page} back=${j.back} (AAA 11.1)`);
    if (j.back) await hitTest('/journal (unauthored) BackLink', '.jrn-page .backlink');
    // and no phantom markers on a volume with nothing in it
    const phantom = await page.evaluate(() => {
      const wax = document.querySelectorAll('.jrn-tabs .unread').length;
      const seal = document.querySelectorAll('.jrn-tabs .sealed').length;
      return { wax, seal };
    });
    check(phantom.wax === 0 && phantom.seal === 0, 'unauthored volume: no phantom markers (AAA 11.21)', `unauthored volume shows ${phantom.wax} wax / ${phantom.seal} smudge markers with nothing behind them (AAA 11.21)`);
    row('/journal (unauthored volume)', 'BackLink', j.back ? '5/5' : 'MISSING', '/', j.text.slice(0, 40));

    await page.evaluate(() => { location.hash = '#/sanctum'; });
    await page.waitForTimeout(600);
    const s2 = await page.evaluate(() => ({ page: Boolean(document.querySelector('.snc-page')), back: Boolean(document.querySelector('.snc-page .backlink')) }));
    check(s2.page && s2.back, '/sanctum (unauthored volume): renders with a back link', `/sanctum (unauthored volume): page=${s2.page} back=${s2.back} (AAA 11.1)`);
    if (s2.back) await hitTest('/sanctum (unauthored) BackLink', '.snc-page .backlink');
    row('/sanctum (unauthored volume)', 'BackLink', s2.back ? '5/5' : 'MISSING', '/', '');

    await page.evaluate(() => {
      const store = window.__manorStore;
      const s = store.getState();
      store.setState({ volume: { ...s.volume, volumeId: 'volume-1' } });
      const m = s.manor;
      if (!m) return;
      // A plain interior cell, NOT wherever the walk left her (the sanctum
      // landing renders the stairwell and the branch under test never runs).
      const cell = { col: 2, row: 1 };
      const key = `${cell.col},${cell.row}`;
      store.setState({
        manor: {
          ...m,
          playerCell: cell,
          rooms: { ...m.rooms, [key]: { cardId: 'conservatory', cell, doors: ['N', 'S'], solved: false, kind: 'not-a-real-kind' } },
        },
      });
      store.getState().enterRoom(key);
      location.hash = '#/room';
    });
    await page.waitForTimeout(900);
    const un = await page.evaluate(() => ({ hash: location.hash, exit: Boolean([...document.querySelectorAll('button')].find((b) => /step back out/i.test(b.textContent || ''))), body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 100) }));
    check(un.exit || un.hash.includes('manor'), `unregistered room kind: an exit exists (${un.exit ? '"Step back out"' : 'redirected ' + un.hash})`, `unregistered room kind: no exit — "${un.body}" (AAA 11.1)`);
    if (un.exit) { const b = await tagBtn('Step back out'); await hitTest('unregistered-kind "Step back out"', '[data-critic]', b); }
    row('/room (unregistered kind)', 'Step back out', un.exit ? '5/5' : 'redirect', '/manor', '');
  }

  /* ======================================================================
     9b. THE SANCTUM DOOR — /sanctum's only blueprint entrance (AAA 11.9)
     ====================================================================== */
  log(''); log('— 9b. the sanctum door —');
  {
    await page.evaluate(() => {
      const store = window.__manorStore;
      // ROUND 8 (verifier): LEAVE THE ROOM FIRST. Section 9 above ends by
      // calling `enterRoom()` to test the unregistered-kind fallback and never
      // leaves it, so this block used to set up the landing while the store
      // still held an active room. `.bp-sanctumhit` renders on
      // `interactive && atSanctumDoor(manor)`, and ManorPage computes
      // `interactive` as `exploring && !draftOffer && !visiting && !cabinetOpen`
      // — so the door was absent for a reason that had nothing to do with the
      // door, and this assertion has been reported as a live 11.9 defect for
      // two rounds. A clean reproduction of exactly this setup, with the room
      // left, renders the door (`scripts/r8-sanctum-door-probe.mjs`).
      try { store.getState().leaveRoom(); } catch { /* not in one */ }
      const s = store.getState();
      const cell = { col: 2, row: 5 };           // SANCTUM_DOOR_CELL
      const key = `${cell.col},${cell.row}`;
      store.setState({
        manor: {
          ...s.manor,
          playerCell: cell,
          rooms: { ...s.manor.rooms, [key]: { cardId: 'reading-nook', cell, doors: ['N', 'S'], solved: true, kind: 'parlor' } },
        },
      });
      location.hash = '#/manor';
    });
    await page.waitForTimeout(700);
    const door = await boxOf('.bp-sanctumhit');
    if (!door) {
      // Say WHY, so the next round attributes this instead of re-deriving it.
      const why = await page.evaluate(() => {
        const s = window.__manorStore.getState();
        const m = s.manor;
        const north = m?.rooms?.[`${m.playerCell.col},${m.playerCell.row + 1}`] ?? null;
        return {
          phase: s.phase ?? s.day?.phase ?? null,
          draftOffer: !!s.draftOffer,
          visiting: !!s.visiting,
          activeRoom: !!s.activeRoom,
          hereDoors: m?.rooms?.[`${m.playerCell.col},${m.playerCell.row}`]?.doors ?? null,
          sanctumDoors: north?.doors ?? null,
          route: location.hash,
        };
      });
      fail('/sanctum has no blueprint entrance while standing on the landing (AAA 11.9) — '
        + JSON.stringify(why));
    }
    else {
      await hitTest('sanctum door (from the landing)', '.bp-sanctumhit', door);
      await page.mouse.click(door.x + door.w / 2, door.y + door.h / 2);
      await page.waitForTimeout(600);
      const h = await page.evaluate(() => ({ hash: location.hash, page: Boolean(document.querySelector('.snc-page')) }));
      check(h.page, `sanctum door → /sanctum (${h.hash}) — AAA 11.6/11.9`, `sanctum door landed on ${h.hash}, sanctum page=${h.page}`);
      if (h.page) {
        await hitTest('/sanctum BackLink', '.snc-page .backlink');
        await page.click('.snc-page .backlink');
        await page.waitForTimeout(400);
        const back = await page.evaluate(() => location.hash);
        check(back === '#/' || back === '#/manor' || back === '', `/sanctum back → the manor (${back || '#/'})`, `/sanctum back → ${back} (AAA 11.6)`);
      }
      row('/sanctum (at the landing)', 'BackLink', '5/5', '/manor', 'entered via the blueprint door');
    }
  }

  /* ======================================================================
     10. 375x667
     ====================================================================== */
  log(''); log('— 10. 375x667 —');
  {
    // A SECOND CONTEXT, not a second browser (harness rule): the app flushes
    // its save on pagehide, so clearing storage and reloading in place hands
    // the reload the state it just wrote. A clean context is a genuine fresh
    // save at the short frame.
    await page.close();
    const ctx2 = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });
    page = await ctx2.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await hardReload(`${BASE}?short=${Date.now()}`);
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
      const asides = await page.evaluate(() => [...document.querySelectorAll('.chr-scene__aside')].map((a, i) => { const r = a.getBoundingClientRect(); return { i, label: (a.textContent || '').replace(/\s+/g, ' ').trim(), x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const a of asides) {
        await page.evaluate((i) => {
          document.querySelectorAll('[data-critic]').forEach((e) => e.removeAttribute('data-critic'));
          document.querySelectorAll('.chr-scene__aside')[i].setAttribute('data-critic', '1');
        }, a.i);
        await hitTest(`375x667 morning aside "${a.label.slice(0, 20)}"`, '[data-critic]', a);
      }
      await assertRetireUnreachable('375x667 morning card');
      await page.click('.chr-scene__btn');
      await playScene();
      await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 }).catch(() => {});
    }
    if (await page.$('.chr-retire')) await hitTest('375x667 retire', '.chr-retire');
    for (const label of ['Cabinet', 'Journal', 'Chronicles']) {
      const b = await tagBtn(label, '.bp-foot__actions');
      if (!b) fail(`375x667 blueprint: no "${label}" entrance`);
      else await hitTest(`375x667 blueprint "${b.label}"`, '[data-critic]', b);
    }
    // journal tabs at the short frame, with a moment on glass
    await page.evaluate(() => { window.__manorStore.getState().fileFragment('frag.v1.02'); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { location.hash = '#/journal'; });
    await page.waitForSelector('.jrn-page', { timeout: 8000 });
    await page.evaluate(() => { window.__manorStore.getState().fileFragment('frag.v1.03'); });
    await page.waitForTimeout(600);
    const momUp = Boolean(await page.$('.mom'));
    if (momUp) {
      const tabs = await page.evaluate(() => [...document.querySelectorAll('.jrn-tabs button')].map((b, i) => { const r = b.getBoundingClientRect(); return { i, label: (b.textContent || '').replace(/\s+/g, ' ').trim(), x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const t of tabs) {
        await page.evaluate((i) => {
          document.querySelectorAll('[data-critic]').forEach((e) => e.removeAttribute('data-critic'));
          document.querySelectorAll('.jrn-tabs button')[i].setAttribute('data-critic', '1');
        }, t.i);
        await hitTest(`375x667 journal tab "${t.label}" WITH a moment on glass`, '[data-critic]', t);
      }
      await hitTest('375x667 journal BackLink WITH a moment on glass', '.jrn-page .backlink');
    } else log('   (no moment mounted at 375x667 — overlap probe skipped)');
    await drainMoments();
    await page.evaluate(() => { location.hash = '#/chronicles'; });
    await page.waitForSelector('.chron__title', { timeout: 8000 });
    const reach = await page.evaluate(() => {
      const sc = document.querySelector('.chron__ledger');
      const sr = sc.getBoundingClientRect();
      const vis = (el) => { const r = el.getBoundingClientRect(); return { onGlass: r.bottom <= sr.bottom + 1 && r.top >= sr.top - 1, top: Math.round(r.top - sr.top) }; };
      const settings = [...document.querySelectorAll('.chron__setting')];
      const tb = [...document.querySelectorAll('.chron__trunk button')];
      return { scrollTop: sc.scrollTop, sound: vis(settings.find((s) => /sound/i.test(s.textContent))), motion: vis(settings.find((s) => /reduce motion/i.test(s.textContent))), pack: vis(tb[0]), unpack: vis(tb[1]) };
    });
    check(reach.sound.onGlass && reach.motion.onGlass && reach.pack.onGlass && reach.unpack.onGlass,
      `375x667 Chronicles: sound(+${reach.sound.top}) motion(+${reach.motion.top}) pack(+${reach.pack.top}) unpack(+${reach.unpack.top}) on glass at scroll ${reach.scrollTop} (AAA 11.23)`,
      `375x667 Chronicles: ${JSON.stringify(reach)} — a control is below the fold (AAA 11.23)`);
    await hitTest('375x667 Chronicles BackLink', '.backlink');
    await page.setViewportSize({ width: 390, height: 844 });
  }

  /* ======================================================================
     11. REDUCED MOTION
     ====================================================================== */
  log(''); log('— 11. prefers-reduced-motion —');
  {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(300);
    await page.evaluate(() => { location.hash = '#/manor'; });
    await page.waitForTimeout(600);
    if (await page.$('.chr-retire')) await hitTest('reduced-motion retire', '.chr-retire');
    await page.evaluate((ids) => {
      const s = window.__manorStore.getState();
      const next = ids.find((id) => !s.volume.foundFragmentIds.includes(id));
      if (next) s.fileFragment(next, { sealed: true });
    }, FRAGS);
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => {
      const el = document.querySelector('.mom');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { onGlass: Boolean(t && (t === el || el.contains(t))), w: Math.round(r.width), h: Math.round(r.height), opacity: getComputedStyle(el).opacity };
    });
    check(m?.onGlass && Number(m.opacity) > 0.5, `reduced motion: the moment is on glass (${m?.w}x${m?.h}, opacity ${m?.opacity}) — AAA 11.22/U.3`, `reduced motion: the moment is not readable (${JSON.stringify(m)})`);
    await drainMoments();
    const marks = await page.evaluate(() => {
      const host = [...document.querySelectorAll('.bp-foot__actions .unread-host')].find((x) => (x.childNodes[0]?.textContent || '').trim() === 'Journal');
      const wax = host?.querySelector('.unread'); const seal = host?.querySelector('.sealed');
      const geom = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || '').trim(), bg: cs.backgroundColor, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius }; };
      return { wax: geom(wax), seal: geom(seal) };
    });
    log('   reduced-motion entrance marks:', JSON.stringify(marks));
    check(marks.wax && marks.wax.w > 0, `reduced motion: wax is legible ("${marks.wax?.text}") — AAA 11.22`, 'reduced motion: no wax visible');
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
