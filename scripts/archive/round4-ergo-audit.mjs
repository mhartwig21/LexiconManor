/**
 * Round-4 MOBILE ERGONOMICS audit — before/after evidence.
 * Owner directive: "some of the games have sizing issues where buttons are too low."
 *
 * ONE msedge browser instance. Two viewports: 390x844 (iPhone 14/15) and
 * 375x667 (small iPhone SE). Device safe-area insets emulated via CDP when
 * supported; the iOS keyboard emulated via a scriptable fake VisualViewport
 * installed before app boot (so app/platform/viewport.ts runs its REAL code
 * path against it).
 *
 * Usage: node scripts/round4-ergo-audit.mjs before|after
 * Shots  → docs/shots/round4/ergo/<phase>/
 * Report → docs/shots/round4/ergo/<phase>-metrics.json
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const phase = process.argv[2] === 'after' ? 'after' : 'before';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round4/ergo', phase);
mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:5217/LexiconManor/';

// iPhone-ish standalone-PWA insets (portrait, notch device).
const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
const KB = { 844: 336, 667: 260 }; // typical iOS keyboard heights

const log = (...a) => console.log('[ergo]', ...a);
const metrics = { phase, safeAreaEmulated: false, viewports: {} };

const browser = await chromium.launch({ channel: 'msedge', headless: true });

const ROOMS = [
  ['hive', 'conservatory'],
  ['twistle', 'gallery'],
  ['word-web', 'library'],
  ['forgotten-word', 'study'],
  ['cipher', 'darkroom'],
  ['crossword', 'linen-closet'],
  // Round 4's new room. Landed after this harness was first written; the
  // Counting House is the one surface with a documented sub-44pt element
  // (42px grid cells at 390 — nine across a phone cannot reach 44), so the
  // press probe deliberately targets the PAD keys, which are the only costed
  // controls and must clear the bar.
  ['sudoku', 'counting-house'],
];

for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  const vpKey = `${vp.width}x${vp.height}`;
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
  page.setDefaultTimeout(15000);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

  // Fake VisualViewport BEFORE any app code runs.
  await page.addInitScript(() => {
    const listeners = {};
    const fake = {
      height: window.innerHeight, width: window.innerWidth,
      offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
      addEventListener(t, f) { (listeners[t] ??= []).push(f); },
      removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
      dispatchEvent() { return true; },
    };
    window.__fakeVV = {
      fake,
      setKeyboard(px) {
        fake.height = window.innerHeight - px;
        (listeners.resize || []).forEach((f) => f());
      },
    };
    Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true });
  });

  // Try CDP safe-area emulation (recent Chromium; harmless if unsupported).
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: INSETS });
    metrics.safeAreaEmulated = true;
    log(vpKey, 'safe-area emulation ON', JSON.stringify(INSETS));
  } catch (e) {
    log(vpKey, 'safe-area emulation unsupported:', String(e).slice(0, 90));
  }

  const shot = (name) => page.screenshot({ path: resolve(SHOTS, `${vpKey}-${name}.png`) });
  const sleep = (ms) => page.waitForTimeout(ms);
  const vpMetrics = (metrics.viewports[vpKey] = { surfaces: {}, errors: pageErrors });

  /** Measure the ergonomics of the current surface. */
  const measure = (surface, extraSel = []) =>
    page.evaluate(({ surface, extraSel, insetBottom }) => {
      const vh = window.innerHeight;
      const out = { surface, vh, interactive: [], belowViewport: [], inHomeIndicatorBand: [], clipped: [], offStage: [], scrollers: [] };
      // Any panel that has to scroll to reveal content — an element sitting
      // past the visible box of an overflow:auto ancestor is just as
      // unreachable-at-a-glance as one past the bottom of the glass.
      for (const el of document.querySelectorAll('.room-host__stage, .snc, .lc-clues')) {
        if (el.scrollHeight > el.clientHeight + 1) {
          out.scrollers.push({ cls: el.className.slice(0, 30), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
        }
      }
      const els = [
        ...document.querySelectorAll('button, input, [role="button"], a'),
        ...extraSel.flatMap((s) => [...document.querySelectorAll(s)]),
      ];
      const seen = new Set();
      for (const el of els) {
        if (seen.has(el) || el.disabled) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const label = (el.textContent || el.getAttribute('aria-label') || el.placeholder || el.className || '').trim().slice(0, 40);
        const rec = { label, cls: String(el.className).slice(0, 40), top: Math.round(r.top), bottom: Math.round(r.bottom) };
        out.interactive.push(rec);
        if (r.bottom > vh + 1) out.belowViewport.push(rec);
        else if (r.bottom > vh - insetBottom + 1) out.inHomeIndicatorBand.push(rec);
        // Clipped by an overflow:hidden ancestor (e.g. #root) — hard failure:
        // unreachable. Or sitting past the visible box of an overflow:auto
        // ancestor — soft: reachable, but only after a scroll.
        let p = el.parentElement;
        while (p) {
          const st = getComputedStyle(p);
          const pr = p.getBoundingClientRect();
          if (/hidden|clip/.test(st.overflowY)) {
            if (r.bottom > pr.bottom + 1) { out.clipped.push({ ...rec, by: p.id || p.className.slice(0, 20), ancestorBottom: Math.round(pr.bottom) }); break; }
          } else if (/auto|scroll/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 1) {
            if (r.bottom > pr.bottom + 1) { out.offStage.push({ ...rec, by: p.className.slice(0, 24), ancestorBottom: Math.round(pr.bottom) }); break; }
          }
          p = p.parentElement;
        }
      }
      out.interactive.sort((a, b) => b.bottom - a.bottom);
      out.interactive = out.interactive.slice(0, 5);
      return out;
    }, { surface, extraSel, insetBottom: metrics.safeAreaEmulated ? INSETS.bottom : 0 });

  /**
   * U.1 contract: pointerdown (NOT :active) must put `.is-pressed` on the
   * tappable AND that class must actually change how it renders — a class
   * with no matching rule is not a pass. Probes every distinct tappable
   * shape on the current surface, comparing computed transform/filter/
   * background before and during the press.
   */
  const pressProbe = (surface, selectors) =>
    page.evaluate(({ surface, selectors }) => {
      const out = { surface, probes: [] };
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        // Disabled tappables are deliberately excluded from the contract —
        // boot.ts skips them so a dead button never squashes under a finger.
        if (!el || el.disabled) { out.probes.push({ sel, found: false }); continue; }
        const snap = () => {
          const cs = getComputedStyle(el);
          return `${cs.transform}|${cs.filter}|${cs.backgroundColor}|${cs.color}`;
        };
        const before = snap();
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
        const hasClass = el.classList.contains('is-pressed');
        const during = snap();
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
        const after = snap();
        out.probes.push({
          sel, found: true, hasClass,
          visuallyChanged: during !== before,
          released: !el.classList.contains('is-pressed') && after === before,
        });
      }
      return out;
    }, { surface, selectors });

  const enterRoom = async (kind, cardId) => {
    await page.evaluate(({ kind, cardId }) => {
      const S = window.__manorStore;
      const st = S.getState();
      const key = '2,1';
      const cell = { col: 2, row: 1 };
      S.setState({
        manor: { ...st.manor, rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N', 'E', 'S', 'W'], solved: false, kind } }, playerCell: cell },
        day: { ...st.day, activeRoom: { cellKey: key, kind, tier: 1 } },
      });
      location.hash = '#/room';
    }, { kind, cardId });
    await page.waitForSelector('.room-host');
    await sleep(400);
  };

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
    await page.reload({ waitUntil: 'networkidle' });

    // Begin day, capture the morning dialogue (Bramble) for the dialogue audit.
    await page.waitForSelector('text=Begin the first day');
    await page.click('text=Begin the first day');
    await page.waitForSelector('.chr-scene');
    await page.click('.chr-scene__btn');
    await page.waitForSelector('.dlg', { timeout: 9000 });
    // let the typewriter reach choices if any; tap once to complete the line
    await sleep(500);
    await page.dispatchEvent('.dlg__sheet', 'pointerdown', { timeout: 4000 }).catch(() => {});
    await sleep(400);
    vpMetrics.surfaces['dialogue'] = await measure('dialogue');
    await shot('dialogue');
    // Pressing a choice ADVANCES the scene — probe last, and let the close
    // loop below pick up wherever that leaves us.
    vpMetrics.surfaces['press-dialogue'] = await pressProbe('dialogue', ['.dlg__skip', '.dlg-choice']);
    // close the scene (the last tap navigates, which tears down the execution
    // context mid-poll — every probe in the loop is best-effort)
    for (let i = 0; i < 60; i++) {
      try {
        if (!(await page.$('.dlg'))) break;
        const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
        if (c) { await c.click({ timeout: 2000 }); }
        else { await page.dispatchEvent('.dlg__sheet', 'pointerdown'); }
      } catch { /* navigation raced the probe — re-check next tick */ }
      await sleep(220);
    }
    await page.waitForSelector('.bp-sheet');
    await page.evaluate(() => { const S = window.__manorStore; S.setState({ ledger: { ...S.getState().ledger, budget: 900 } }); });

    // Blueprint (context only — other agent's file, report don't touch).
    vpMetrics.surfaces['blueprint'] = await measure('blueprint');
    await shot('blueprint');

    // The six surviving rooms.
    for (const [kind, cardId] of ROOMS) {
      await enterRoom(kind, cardId);
      vpMetrics.surfaces[`room-${kind}`] = await measure(`room-${kind}`);
      vpMetrics.surfaces[`press-${kind}`] = await pressProbe(`room-${kind}`, [
        '.room-host__footer .btn',
        '.hv-cell', '.ww-tile', '.tw-cell', '.anch-btn',
        '.mic-key', '.mic-btn', '.dk-cell',
        '.lc-cell:not(.lc-cell--void)', '.lc-key', '.lc-clue', '.m2-btn',
        '.ch-key--fig', '.ch-tool',
      ]);
      await shot(`room-${kind}`);

      // Study: keyboard-avoidance exercise on the whisper input.
      if (kind === 'forgotten-word') {
        const kb = KB[vp.height];
        await page.focus('.fw-input');
        await page.evaluate((px) => window.__fakeVV.setKeyboard(px), kb);
        await sleep(500);
        const kbState = await page.evaluate((kb) => {
          const r = document.querySelector('.fw-input').getBoundingClientRect();
          const cs = getComputedStyle(document.documentElement);
          return {
            kbTopY: window.innerHeight - kb,
            inputBottom: Math.round(r.bottom),
            clearsKeyboard: r.bottom <= window.innerHeight - kb + 1,
            kbOpenClass: document.documentElement.classList.contains('kb-open'),
            vars: { vv: cs.getPropertyValue('--vv-height').trim(), inset: cs.getPropertyValue('--kb-inset').trim(), shift: cs.getPropertyValue('--kb-shift').trim() },
          };
        }, kb);
        kbState.placeholder = await page.evaluate(() => {
          const input = document.querySelector('.fw-input');
          const cs = getComputedStyle(input);
          const pcs = getComputedStyle(input, '::placeholder');
          const ctx = document.createElement('canvas').getContext('2d');
          ctx.font = `${pcs.fontStyle} ${pcs.fontWeight} ${pcs.fontSize} ${pcs.fontFamily}`;
          const text = pcs.textTransform.includes('uppercase') ? input.placeholder.toUpperCase() : input.placeholder;
          const ls = parseFloat(pcs.letterSpacing) || 0;
          const textW = ctx.measureText(text).width + ls * text.length;
          const r = input.getBoundingClientRect();
          const availW = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          return { text, textW: +textW.toFixed(1), availW: +availW.toFixed(1), clips: textW > availW };
        });
        vpMetrics.surfaces['study-keyboard'] = kbState;
        await shot('room-forgotten-word-keyboard');
        await page.evaluate(() => window.__fakeVV.setKeyboard(0));
        await page.evaluate(() => document.activeElement?.blur());
        await sleep(400);
      }
      // leaveRoom clears day.activeRoom, which makes RoomPage navigate — the
      // hash write can race the teardown of this execution context.
      await page
        .evaluate(() => { window.__manorStore.getState().leaveRoom(); location.hash = '#/manor'; })
        .catch(() => {});
      await sleep(300);
    }

    // Sanctum.
    await page.evaluate(() => { location.hash = '#/sanctum'; });
    await page.waitForSelector('.snc-input');
    await sleep(400);
    vpMetrics.surfaces['sanctum'] = await measure('sanctum');
    // Sanctum minors: placeholder clipping + nameplate overrun.
    vpMetrics.surfaces['sanctum-minors'] = await page.evaluate(() => {
      const input = document.querySelector('.snc-input');
      const ir = input.getBoundingClientRect();
      const cs = getComputedStyle(input);
      // measure placeholder text width with canvas at the *rendered* placeholder style
      const pcs = getComputedStyle(input, '::placeholder');
      const canvas = document.createElement('canvas').getContext('2d');
      canvas.font = `${pcs.fontStyle} ${pcs.fontWeight} ${pcs.fontSize} ${pcs.fontFamily}`;
      const text = pcs.textTransform.includes('uppercase') || cs.textTransform.includes('uppercase')
        ? input.placeholder.toUpperCase() : input.placeholder;
      const ls = parseFloat(pcs.letterSpacing) || parseFloat(cs.letterSpacing) || 0;
      const textW = canvas.measureText(text).width + ls * text.length;
      const availW = ir.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // Nameplate: compare like with like. getComputedTextLength() reports in
      // SVG USER units, so measure the plate in user units too (rect.width
      // .baseVal.value) rather than mixing in CSS pixels.
      const plateRectEl = document.querySelector('.snc-portrait rect:last-of-type');
      const plateText = [...document.querySelectorAll('.snc-portrait text')].pop();
      let plate = null;
      if (plateRectEl && plateText) {
        const tw = plateText.getComputedTextLength();          // user units
        const plateW = plateRectEl.width.baseVal.value;        // user units
        plate = {
          units: 'svg-user-units',
          plateW: +plateW.toFixed(1),
          textW: +tw.toFixed(1),
          overrun: +(tw - plateW).toFixed(1),
          overflows: tw > plateW,
        };
      }
      return {
        placeholder: { text, textW: +textW.toFixed(1), availW: +availW.toFixed(1), clips: textW > availW },
        nameplate: plate,
      };
    });
    vpMetrics.surfaces['press-sanctum'] = await pressProbe('sanctum', [
      '.snc-speak', '.snc-journal-link', '.snc__back',
    ]);
    await shot('sanctum');
    // Sanctum keyboard exercise.
    {
      const kb = KB[vp.height];
      await page.focus('.snc-input');
      await page.evaluate((px) => window.__fakeVV.setKeyboard(px), kb);
      await sleep(500);
      vpMetrics.surfaces['sanctum-keyboard'] = await page.evaluate((kb) => {
        const r = document.querySelector('.snc-row').getBoundingClientRect();
        const cs = getComputedStyle(document.documentElement);
        return {
          kbTopY: window.innerHeight - kb,
          rowBottom: Math.round(r.bottom),
          clearsKeyboard: r.bottom <= window.innerHeight - kb + 1,
          kbOpenClass: document.documentElement.classList.contains('kb-open'),
          vars: { vv: cs.getPropertyValue('--vv-height').trim(), inset: cs.getPropertyValue('--kb-inset').trim(), shift: cs.getPropertyValue('--kb-shift').trim() },
        };
      }, kb);
      await shot('sanctum-keyboard');
      await page.evaluate(() => window.__fakeVV.setKeyboard(0));
    }
  } catch (e) {
    log('FAIL', vpKey, e.message?.slice(0, 300));
    vpMetrics.fatal = String(e).slice(0, 300);
    await shot('zz-fail').catch(() => {});
  }
  await page.close();
}

await browser.close();
writeFileSync(resolve(root, 'docs/shots/round4/ergo', `${phase}-metrics.json`), JSON.stringify(metrics, null, 2));
log('done →', `${phase}-metrics.json`);
