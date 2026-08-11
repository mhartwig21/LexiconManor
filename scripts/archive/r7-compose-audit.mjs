/**
 * scripts/r7-compose-audit.mjs — ROUND 7 MOBILE COMPOSITION PASS.
 *
 * Both halves of the owner directive in one harness:
 *   CORRECTNESS — per surface, per state, per viewport, per theme: page-level
 *     horizontal scroll, elements past the viewport, text clipped by an
 *     overflow-hidden ancestor, tap targets under the 44pt floor, interactive
 *     controls inside the 34px home-indicator band or buried under fixed
 *     chrome, and body-text contrast in both themes.
 *   COMPOSITION — the numbers a critic's eye is actually reacting to: the
 *     distinct type sizes on screen (ramp coherence), the biggest featureless
 *     vertical band, and the gutter rhythm between sibling blocks.
 *
 * Harness rules (AAA §0.4, this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser
 * instance, closed in a finally. Sequential routes.
 *
 * Usage:
 *   node scripts/r7-compose-audit.mjs [--tag before|after] [--rm] [--out <dir>]
 *     --rm   runs the whole walk with prefers-reduced-motion: reduce
 *     --out  output directory, relative to the repo root
 *            (default docs/shots/round7/compose)
 *
 * ROUND 8 — THE EXEMPTION SPLIT. Round 7 reported one `smallTap` number per
 * surface and the reader had to take on trust which of it AAA 6.19 forgives.
 * That is not a number a critic can pass or fail, and it hid two genuine
 * failures inside a bucket everyone had learned to wave through. The bucket is
 * now four, and the classifier applies the WRITTEN ruling rather than a
 * selector's say-so:
 *
 *   costedTap   — the control's own label prices it (−N steps / −N keys / a
 *                 guess). AAA 6.19 forgives NOTHING here, on any surface.
 *   ledgerTap   — 6.19(a): the Counting House's 9x9 leaf. Exempt from the
 *                 number, never from the measurement.
 *   keyboardTap — 6.19(b): a full-width alpha keyboard key, and exempt ONLY
 *                 while it is inside the ruled floor (>=32 wide x >=48 tall,
 *                 no inter-key dead zone). A key under 48 tall is outside its
 *                 own exemption and falls through to `smallTap` — which is how
 *                 the Linen Closet's 45.6px QWERTY was passing: it was never
 *                 in the exempt selector list at all, so it was counted, but
 *                 nothing said whether it should have been.
 *   smallTap    — everything else. Real.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const TAG = (args[args.indexOf('--tag') + 1] && !args[args.indexOf('--tag') + 1].startsWith('--'))
  ? args[args.indexOf('--tag') + 1] : 'before';
const REDUCED = args.includes('--rm');
const OUT_ARG = (args[args.indexOf('--out') + 1] && !args[args.indexOf('--out') + 1].startsWith('--'))
  ? args[args.indexOf('--out') + 1] : 'docs/shots/round7/compose';
const OUT = resolve(ROOT, OUT_ARG);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '375x667', width: 375, height: 667 },
];
const THEMES = ['light', 'dark'];

const log = (...a) => console.log('[compose]', ...a);

/* ---------------------------------------------------------------- dev server */

async function freePort(from = 5361, to = 5420) {
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

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
const serverUp = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start within 60s')), 60000);
  server.stdout.on('data', (b) => {
    if (String(b).includes('ready in') || String(b).includes('Local:')) { clearTimeout(t); res(); }
  });
  server.stderr.on('data', (b) => process.stderr.write(`[vite] ${b}`));
  server.on('exit', (c) => { clearTimeout(t); rej(new Error(`vite exited early (${c})`)); });
});

/* --------------------------------------------------- the safe-area shim ---- */
/*
 * The home-indicator rule ("nothing interactive in the bottom 34px band") is
 * only measurable if the page actually gets iPhone insets. Desktop Chromium
 * resolves every `env(safe-area-inset-*)` to 0, and this Edge build has no
 * `Emulation.setSafeAreaInsets` (verified: "wasn't found"), so a naive run
 * accuses every footer that DOES pad itself by `env()` of sitting on the
 * indicator. Rather than guess, this walks the live CSSOM and rewrites the
 * declarations that mention the insets, in place — same rule, same
 * specificity, same cascade order — substituting the real iPhone 12 numbers.
 * After this, a control still inside the band is genuinely inside it.
 */
const SAFE_AREA_SHIM = /* js */ `(() => {
  const INSET = { top: '47px', bottom: '34px', left: '0px', right: '0px' };
  const sub = (v) => v.replace(
    /env\\(\\s*safe-area-inset-(top|bottom|left|right)\\s*(?:,[^()]*)?\\)/g,
    (_, side) => INSET[side],
  );

  /* ROUND 8 — THE SHIM STOPPED EATING THE PAGE.
   *
   * Round 7's version assigned the whole declaration block back:
   *   rule.style.cssText = sub(rule.style.cssText)
   * because a per-longhand rewrite silently no-ops on a shorthand carrying an
   * env() (Chrome stores it as a pending-substitution value and
   * getPropertyValue('padding-bottom') answers ""). True — and the fix took
   * every OTHER var()-carrying shorthand in the same block down with it.
   * MEASURED: '.jrn-sheet' declares both
   *     padding: … calc(0.9rem + env(safe-area-inset-bottom))
   *   and
   *     background: <two gradients>, var(--paper-raised)
   * and after one cssText round-trip the rule's background-image is the empty
   * string and the computed value is 'none'. So the journal's ruled page —
   * added in round 7 precisely BECAUSE the sheet measured as featureless
   * parchment — was being erased by the instrument that photographed it, in
   * every still round 7 and round 8 produced. The stills said "still blank",
   * the CSS said "ruled", and both were telling the truth about different
   * documents.
   *
   * The rewrite is additive now. Each inset-bearing declaration is lifted OUT
   * of the rule's own text (rule.cssText keeps the authored env(), verified),
   * substituted, and re-declared !important in one appended stylesheet, in
   * source order, under the rule's own selector and inside the same media
   * condition. Nothing is ever assigned back into an existing block, so no
   * declaration the shim did not come for can be lost. */
  let n = 0;
  const decls = [];
  const conditionsOf = (rule) => {
    const out = [];
    let r = rule.parentRule;
    while (r) {
      if (r.conditionText) out.unshift(r.conditionText);
      else if (r.media && r.media.mediaText) out.unshift(r.media.mediaText);
      r = r.parentRule;
    }
    return out;
  };
  const walk = (rules) => {
    for (const rule of rules) {
      /* NOT "if (rule.cssRules) recurse; else inspect" — since CSS Nesting
         landed, a plain CSSStyleRule ALSO exposes an (empty) cssRules list, so
         that shape recursed past every declaration in the app and reported
         "0 rules rewritten" while claiming the phone had no home indicator.
         Inspect first, then descend. */
      if (rule.style && rule.selectorText && /safe-area-inset/.test(rule.cssText)) {
        const body = rule.cssText.slice(rule.cssText.indexOf('{') + 1, rule.cssText.lastIndexOf('}'));
        /* Split on top-level semicolons only: values carry commas and nested
           parens (calc/max/env/color-mix), never an unbracketed ';'. */
        let depth = 0, cur = '';
        const parts = [];
        for (const chpt of body) {
          if (chpt === '(') depth++;
          else if (chpt === ')') depth--;
          if (chpt === ';' && depth === 0) { parts.push(cur); cur = ''; } else cur += chpt;
        }
        if (cur.trim()) parts.push(cur);
        for (const part of parts) {
          if (!/safe-area-inset/.test(part)) continue;
          const i = part.indexOf(':');
          if (i < 0) continue;
          const prop = part.slice(0, i).trim();
          const value = sub(part.slice(i + 1).replace(/!important/g, '').trim());
          if (!prop || !value) continue;
          decls.push({ sel: rule.selectorText, conds: conditionsOf(rule), prop, value });
          n++;
        }
      }
      if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { /* cross-origin: none of ours */ }
  }
  if (decls.length) {
    let css = '';
    for (const d of decls) {
      let block = d.sel + '{' + d.prop + ':' + d.value + ' !important}';
      for (let i = d.conds.length - 1; i >= 0; i--) block = '@media ' + d.conds[i] + '{' + block + '}';
      css += block + '\\n';
    }
    const tag = document.createElement('style');
    tag.dataset.saShim = '1';
    tag.textContent = css;
    document.head.appendChild(tag);
  }
  /* Inline styles too (React sometimes writes them). */
  for (const el of document.querySelectorAll('[style*="safe-area-inset"]')) {
    for (const prop of [...el.style]) {
      const v = el.style.getPropertyValue(prop);
      if (/safe-area-inset/.test(v)) { el.style.setProperty(prop, sub(v)); n++; }
    }
  }
  /* Idempotent: the override sheet stays, and a second call finds the same
     authored rules and re-emits the same overrides. Distinguish "nothing left
     to do" from "the shim never worked", which must be loud. */
  if (n) document.documentElement.dataset.saShim = '1';
  return n || (document.documentElement.dataset.saShim ? -1 : 0);
})()`;

/* ------------------------------------------------------- the measurement fn */
/* Runs in the page. Everything below is a number, not an impression. */

const MEASURE = /* js */ `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const HOME_BAND = 34;            // iPhone home-indicator band, in CSS px
  const TAP = 44;                  // AAA 6.19
  const INTERACTIVE = 'button, a[href], [role="button"], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  /* AAA 6.19(b) — full-width alpha keyboards, at benchmark parity (iOS system
     keys are ~32px wide). Membership of this list is NOT the exemption: the
     RULED FLOOR below is, and a key outside it is reported as a real failure.
     .lc-key (the Linen Closet's QWERTY) was missing here through round 7. */
  const KEYBOARD = '.mic-key, .ch-key, .hv-key, .lc-key, .dk-key, .kbd, [data-keyboard-key]';
  const KEY_FLOOR = { w: 32, h: 48 };
  /* AAA 6.19(a) — the 9x9 ledger grid, and nothing else. */
  const LEDGER = '.ch-cell';
  /* A COSTED control prices itself in its own label (the room copy convention:
     "· −2", "−2 steps", "−1 key"). 6.19 forgives none of these, ever. */
  const COSTED = /[−–—-]\s*\d+(\s*(steps?|keys?|gems?|guess))?/i;

  /* Screen-reader-only text is CLIPPED ON PURPOSE (1px box + clip-path). It is
     not a legibility defect — it is never painted — so it is excluded from the
     clipping and contrast buckets rather than allowed to mask real hits. */
  const srOnly = (el, cs) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 2 && r.height <= 2) return true;
    if (cs.clipPath && cs.clipPath.includes('inset(50%')) return true;
    if (cs.clip && cs.clip !== 'auto') return true;
    return false;
  };

  const path = (el) => {
    const bits = [];
    let n = el;
    for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.classList.length) s += '.' + [...n.classList].slice(0, 2).join('.');
      bits.unshift(s);
    }
    return bits.join(' > ');
  };
  const txt = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 44);
  const vis = (el, cs, r) => r.width >= 1 && r.height >= 1
    && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.02;
  const onGlass = (r) => r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;

  /* --- contrast ---------------------------------------------------------- */
  const parse = (c) => {
    const m = String(c).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const bgOf = (el) => {
    let n = el, acc = null;
    while (n && n.nodeType === 1) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { acc = acc ? over(acc, c) : c; if (acc.a >= 0.999) return acc; }
      n = n.parentElement;
    }
    const body = parse(getComputedStyle(document.body).backgroundColor);
    return acc && body ? over(acc, body) : (acc || body || { r: 255, g: 255, b: 255, a: 1 });
  };

  const out = {
    vw, vh,
    pageScrollX: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
    pageScrollY: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight,
    past: [], clipped: [], smallTap: [], keyboardTap: [], ledgerTap: [], costedTap: [],
    homeBand: [], buried: [], offPanel: [],
    contrast: [], tinyType: [], typeRamp: {}, gaps: [],
  };

  const els = [...document.querySelectorAll('body *')];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!vis(el, cs, r)) continue;
    if (!onGlass(r)) continue;
    if (srOnly(el, cs)) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'svg' || el.ownerSVGElement) {
      // SVG internals are laid out by viewBox; only the <svg> box itself matters.
      if (tag !== 'svg') continue;
    }

    /* 1 — anything sticking past the viewport with no scroller to hold it */
    if (r.right > vw + 0.5 || r.left < -0.5) {
      let sc = el.parentElement, held = false;
      while (sc && sc !== document.body) {
        const s = getComputedStyle(sc);
        if (/(auto|scroll)/.test(s.overflowX)) { held = true; break; }
        if (s.overflowX === 'hidden' || s.overflowX === 'clip') { held = true; break; }
        sc = sc.parentElement;
      }
      if (!held) out.past.push({ sel: path(el), text: txt(el), left: +r.left.toFixed(1), right: +r.right.toFixed(1) });
    }

    /* 2 — text cut off by its own overflow-hidden box */
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (hasOwnText) {
      const clipX = (cs.overflowX === 'hidden' || cs.overflowX === 'clip')
        && el.scrollWidth > el.clientWidth + 1;
      const clipY = (cs.overflowY === 'hidden' || cs.overflowY === 'clip')
        && el.scrollHeight > el.clientHeight + 1;
      if (clipX || clipY) {
        out.clipped.push({
          sel: path(el), text: txt(el), axis: clipX ? 'x' : 'y',
          over: clipX ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight,
          ellipsis: cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none',
        });
      }
    }

    /* 5 — contrast of real text runs */
    if (hasOwnText && cs.color) {
      const fg = parse(cs.color);
      if (fg) {
        const bg = bgOf(el);
        const eff = fg.a < 1 ? over(fg, bg) : fg;
        const size = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        const got = ratio(eff, bg);
        const key = size + 'px/' + cs.fontFamily.split(',')[0].replace(/["']/g, '');
        out.typeRamp[key] = (out.typeRamp[key] || 0) + 1;
        if (got < need) {
          out.contrast.push({ sel: path(el), text: txt(el), size, weight, ratio: +got.toFixed(2), need });
        }
        /* AAA 6.6 — the type floors. IM Fell English never below 22px; the
           body serif never below 16px; 15px is the caption floor and is for
           captions only. Anything under 15 is below every published floor. */
        const fell = /Fell/i.test(cs.fontFamily);
        if ((fell && size < 21.5) || size < 14.5) {
          out.tinyType.push({ sel: path(el), text: txt(el), size, family: fell ? 'display' : 'body' });
        }
      }
    }
  }

  /* 3/4 — interactive geometry.
     A control sitting behind a modal scene is MODALITY, not burial (AAA 11.5
     wants exactly that), so the burial test only runs against the topmost
     mounted layer — or the whole page when nothing is over it. */
  const OVERLAY = '.chr-scene, .dlg, .bp-modal, .mom, .chr-dusk';
  const overlays = [...document.querySelectorAll(OVERLAY)];
  const top = overlays.length ? overlays[overlays.length - 1] : null;

  /* ROUND 8 — CLIPPED IS NOT BURIED, AND IT IS NOT IN THE HOME BAND EITHER.
     A control inside an internally-scrolling panel keeps its LAYOUT rect
     wherever the scroll has left it, so a list row two rows past the end of a
     scroller reports a bounding box sitting over whatever is painted below the
     panel — and both the burial test and the home-indicator test believed it.
     Neither is true: the panel clips it, so it is neither painted there nor
     tappable there. It is simply scrolled out of view, which is what a
     scroller is for. Anything whose rect does not intersect every clipping
     ancestor's rect is recorded as offPanel and excluded from the other two
     buckets — the finding is kept, it just stops wearing a failure's name.
     (This is the same class of error as measuring env() on a desktop browser:
     the number was real, it was describing a different thing.) */
  const clipRectOf = (el) => {
    let n = el.parentElement, box = null;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowY) || /(auto|scroll|hidden|clip)/.test(s.overflowX)) {
        const r = n.getBoundingClientRect();
        box = box
          ? { top: Math.max(box.top, r.top), bottom: Math.min(box.bottom, r.bottom),
              left: Math.max(box.left, r.left), right: Math.min(box.right, r.right) }
          : { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      }
      n = n.parentElement;
    }
    return box;
  };
  /* "Off panel" means the element's CENTRE — the point both tests probe — is
     outside what its clipping ancestors actually show. A row half-scrolled is
     still on glass and still answerable for both criteria. */
  const offPanel = (el, r) => {
    const c = clipRectOf(el);
    if (!c) return false;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    return cy < c.top - 0.5 || cy > c.bottom + 0.5 || cx < c.left - 0.5 || cx > c.right + 0.5;
  };
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!vis(el, cs, r) || !onGlass(r)) continue;
    if (cs.pointerEvents === 'none') continue;
    const rec = { sel: path(el), text: txt(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1) };
    const hidden = offPanel(el, r);
    if (hidden) out.offPanel.push(rec);
    /* ---- AAA 6.19, applied as written (round 8) -------------------------- */
    if (r.width < TAP - 0.5 || r.height < TAP - 0.5) {
      const costed = COSTED.test(rec.text);
      const isKey = el.matches(KEYBOARD);
      const inKeyFloor = isKey
        && r.width >= KEY_FLOOR.w - 0.5 && r.height >= KEY_FLOOR.h - 0.5;
      const isLedger = el.matches(LEDGER);
      if (costed) {
        /* A costed control is never exempt, whatever else it matches. */
        out.costedTap.push(rec);
        out.smallTap.push(rec);
      } else if (isLedger) {
        out.ledgerTap.push(rec);          // 6.19(a): exempt, still measured
      } else if (inKeyFloor) {
        out.keyboardTap.push(rec);        // 6.19(b): exempt, still measured
      } else {
        /* Includes a KEYBOARD-class key that has fallen OUT of its ruled
           floor — outside the exemption is the same as never having had one. */
        out.smallTap.push(rec);
      }
    }
    if (!hidden && r.bottom > vh - HOME_BAND && r.top < vh) out.homeBand.push(rec);
    if (hidden) continue;                            // clipped by its own scroller
    if (top && !top.contains(el)) continue;          // legitimately behind a modal
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!(hit && (hit === el || el.contains(hit) || hit.contains(el)))) {
      const other = hit && hit.closest(INTERACTIVE);
      if (!other || other !== el) out.buried.push({ ...rec, hitBy: hit ? path(hit) : 'nothing' });
    }
  }

  /* 6 — composition: the biggest featureless band, and the gutter rhythm.
     Ink rows = 4px horizontal slices that any text/SVG/border box overlaps. */
  const rows = new Array(Math.ceil(vh / 4)).fill(false);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!vis(el, cs, r) || !onGlass(r)) continue;
    const inked = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      || el.tagName.toLowerCase() === 'svg' || el.tagName.toLowerCase() === 'img'
      || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
    if (!inked) continue;
    const a = Math.max(0, Math.floor(r.top / 4)), b = Math.min(rows.length - 1, Math.ceil(r.bottom / 4));
    for (let i = a; i <= b; i++) rows[i] = true;
  }
  let run = 0, best = 0, bestAt = 0;
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]) { run++; if (run > best) { best = run; bestAt = i - run + 1; } } else run = 0;
  }
  out.deadBand = { px: best * 4, atY: bestAt * 4, pctOfViewport: +((best * 4 / vh) * 100).toFixed(1) };
  out.inkCoverage = +((rows.filter(Boolean).length / rows.length) * 100).toFixed(1);
  return out;
})()`;

/* --------------------------------------------------------------- the walk */

let browser;
const report = {};      // surface -> combo -> measurement
const failures = [];

try {
  await serverUp;
  log('dev server up on', BASE, '| tag =', TAG, '| reduced-motion =', REDUCED);

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: REDUCED ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const sleep = (ms) => page.waitForTimeout(ms);

  /**
   * Measure ONE surface across the 2x2 grid of viewport x theme, and shoot
   * the two diagonal corners (390 light, 375 dark) as the evidence.
   */
  async function survey(name, { shots = true, settle = 260 } = {}) {
    report[name] = report[name] || {};
    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: REDUCED ? 'reduce' : 'no-preference' });
        const shimmed = await page.evaluate(SAFE_AREA_SHIM);
        if (!shimmed) throw new Error('safe-area shim rewrote 0 rules — the inset emulation is dead, every home-band row would be a lie');
        await sleep(settle);
        const m = await page.evaluate(MEASURE);
        report[name][`${vp.name}/${theme}`] = m;
        const badge = [];
        if (m.pageScrollX > 0.5) badge.push(`H-SCROLL ${m.pageScrollX}px`);
        if (m.past.length) badge.push(`past:${m.past.length}`);
        if (m.clipped.length) badge.push(`clipped:${m.clipped.length}`);
        if (m.smallTap.length) badge.push(`tap:${m.smallTap.length}`);
        if (m.costedTap.length) badge.push(`COSTED-tap:${m.costedTap.length}`);
        if (m.homeBand.length) badge.push(`home:${m.homeBand.length}`);
        if (m.buried.length) badge.push(`buried:${m.buried.length}`);
        if (m.offPanel.length) badge.push(`off-panel:${m.offPanel.length}`);
        if (m.contrast.length) badge.push(`contrast:${m.contrast.length}`);
        if (m.tinyType.length) badge.push(`tiny:${m.tinyType.length}`);
        log(`  ${name} @ ${vp.name}/${theme}: ${badge.length ? badge.join(' ') : 'clean'} · dead band ${m.deadBand.px}px (${m.deadBand.pctOfViewport}%) · ink ${m.inkCoverage}%`);
        if (badge.length) failures.push({ surface: name, combo: `${vp.name}/${theme}`, badge });
        if (shots && ((vp.name === '390x844' && theme === 'light') || (vp.name === '375x667' && theme === 'dark'))) {
          const f = `${TAG}${REDUCED ? '-rm' : ''}--${name}--${vp.name}-${theme}.png`;
          await page.screenshot({ path: join(OUT, f) });
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: REDUCED ? 'reduce' : 'no-preference' });
    await sleep(150);
  }

  const clickText = async (re, scope = '') => {
    const sel = scope ? `${scope} button, ${scope} a[href]` : 'button, a[href]';
    for (const el of await page.$$(sel)) {
      const t = (await el.innerText()).replace(/\s+/g, ' ').trim();
      if (new RegExp(re, 'i').test(t)) { await el.click(); return t; }
    }
    return null;
  };
  const clearMoments = async () => {
    for (let i = 0; i < 8; i++) {
      const gone = await page.evaluate(() => {
        const m = document.querySelector('.mom');
        if (!m) return true;
        m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        m.click?.();
        return false;
      });
      if (gone) return;
      await sleep(400);
    }
  };
  async function ensureExploring() {
    for (let i = 0; i < 90; i++) {
      const st = await page.evaluate(() => {
        const s = window.__manorStore?.getState();
        return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor };
      });
      if (st.phase === 'exploring' && st.hasManor) return true;
      if (await page.$('.dlg')) {
        const p = await page.$('.dlg-choice--primary');
        if (p) await p.click();
        else {
          const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
          if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
        }
        await sleep(200); continue;
      }
      const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(500); continue; }
      const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(500); continue; }
      const seal = await page.$('.bp-btn--seal'); if (seal && st.phase === null) { await seal.click(); await sleep(400); continue; }
      await sleep(250);
    }
    return false;
  }
  const KIND = {
    gallery: 'twistle', conservatory: 'hive', 'counting-house': 'sudoku',
    darkroom: 'cipher', library: 'word-web', study: 'forgotten-word',
    'linen-closet': 'crossword',
  };
  const ROOTSEL = {
    twistle: '.anch--gallery', hive: '.anch--conservatory', sudoku: '.ch',
    cipher: '.mic--darkroom', 'word-web': '.anch--library',
    'forgotten-word': '.anch--study', crossword: '.m2--linen',
  };
  async function openRoom(cardId, cell) {
    if (!(await ensureExploring())) throw new Error('never reached exploring');
    const kind = KIND[cardId];
    await page.evaluate(({ cardId, cell, kind }) => {
      const st = window.__manorStore.getState();
      const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell,
        rooms: { ...st.manor.rooms, [key]: { cardId, cell, doors: ['N','S','E','W'], solved: false, kind } } } });
      window.__manorStore.getState().enterRoom(key);
    }, { cardId, cell, kind });
    await page.waitForSelector(ROOTSEL[kind], { timeout: 12000 });
    await sleep(500);
    await clearMoments();
  }
  const leave = async () => {
    await page.evaluate(() => window.__manorStore.getState().leaveRoom());
    await sleep(500);
  };

  /* === 1. front step (fresh save, no day) ================================ */
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title', { timeout: 25000 });
  await survey('01-front-step');

  /* === 2. chronicles (the settings + trunk surface) ====================== */
  await clickText('^chronicles');
  await page.waitForSelector('.chron', { timeout: 10000 });
  await survey('02-chronicles');
  await clickText('the manor');
  await page.waitForSelector('.bp-scene__title', { timeout: 10000 });

  /* === 3. morning card =================================================== */
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene', { timeout: 10000 });
  await survey('03-morning-card');

  /* === 4. dialogue overlay =============================================== */
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.dlg', { timeout: 10000 });
  await sleep(900);                       // let the typewriter fill the box
  await survey('04-dialogue');

  /* === 5. blueprint, exploring ========================================== */
  if (!(await ensureExploring())) throw new Error('never reached exploring');
  await clearMoments();
  await survey('05-blueprint');

  /* === 6. draft modal — tapped the way the player taps it, on a ghost door */
  {
    const ghost = await page.$('.bp-ghost:not(.bp-ghost--shut)');
    if (ghost) await ghost.click();
    const modal = await page.waitForSelector('.bp-modal', { timeout: 6000 }).catch(() => null);
    if (modal) {
      await sleep(350);
      await survey('06-draft-modal');
      await page.evaluate(() => window.__manorStore.getState().cancelDraft());
      await sleep(300);
    } else log('  (no draftable door from this cell — draft modal skipped)');
  }

  /* === 7. floorplan cabinet ============================================= */
  await clickText('^cabinet');
  await page.waitForSelector('.bp-modal', { timeout: 8000 });
  await sleep(300);
  await survey('07-cabinet');
  await clickText('close the cabinet', '.bp-modal');
  await sleep(300);

  /* === 8-13. every room kind, in play state ============================= */
  const ROOMS = [
    ['08-conservatory', 'conservatory', { col: 4, row: 2 }],
    ['09-library', 'library', { col: 2, row: 5 }],
    ['10-gallery', 'gallery', { col: 3, row: 2 }],
    ['11-study', 'study', { col: 1, row: 2 }],
    ['12-darkroom', 'darkroom', { col: 6, row: 2 }],
    ['13-counting-house', 'counting-house', { col: 5, row: 2 }],
    ['14-linen-closet', 'linen-closet', { col: 0, row: 3 }],
  ];
  for (const [label, card, cell] of ROOMS) {
    try {
      await openRoom(card, cell);
      await survey(label);
      /* mistake state: one deliberately wrong submission where cheap to do */
      if (card === 'conservatory') {
        await page.keyboard.type('ZZZZ');
        await page.keyboard.press('Enter');
        await sleep(420);
        await survey(`${label}-mistake`, { shots: false });
      }
      await leave();
    } catch (e) {
      log(`  !! ${label} failed to open: ${e.message}`);
      failures.push({ surface: label, combo: '-', badge: [`could not open: ${e.message}`] });
      await page.evaluate(() => window.__manorStore.getState().leaveRoom?.()).catch(() => {});
      await sleep(300);
    }
  }

  /* === 14b. the SOLVED state, played for real (Gallery) ================= */
  try {
    await openRoom('gallery', { col: 3, row: 2 });
    const letters = await page.$$eval('.tw-cell', (els) => els.map((e) => e.childNodes[0].textContent.trim()));
    const twistles = JSON.parse(readFileSync(resolve(ROOT, 'content/generated/twistle.json'), 'utf8'));
    const tw = twistles.find((p) => p.grid.length === letters.length && p.grid.every((l, i) => l === letters[i]));
    if (tw) {
      /* the engine's own king-move rule, so the probe traces real words */
      const n = Math.round(Math.sqrt(tw.grid.length));
      const centre = Math.floor((n - 1) / 2) * n + Math.floor((n - 1) / 2);
      const neigh = (i) => {
        const r = Math.floor(i / n), c = i % n, out = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push(nr * n + nc);
        }
        return out;
      };
      const find = (word) => {
        const t = word.toUpperCase();
        const walk = (p, d) => {
          if (d === t.length) return (tw.rules.centerRequired && !p.includes(centre)) ? null : p;
          for (const k of neigh(p[p.length - 1])) {
            if (p.includes(k) || tw.grid[k] !== t[d]) continue;
            const f = walk([...p, k], d + 1);
            if (f) return f;
          }
          return null;
        };
        for (let i = 0; i < tw.grid.length; i++) if (tw.grid[i] === t[0]) { const f = walk([i], 1); if (f) return f; }
        return null;
      };
      for (const w of tw.targetWords.slice(0, tw.targetCount)) {
        const p = find(w);
        if (!p) continue;
        for (const idx of p) {
          await page.evaluate((i) => {
            const el = document.querySelector(`[data-idx="${i}"]`);
            const g = el.closest('.tw-grid');
            const r = el.getBoundingClientRect();
            const o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1 };
            g.dispatchEvent(new PointerEvent('pointerdown', o));
            g.dispatchEvent(new PointerEvent('pointerup', o));
          }, idx);
          await sleep(40);
        }
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('.anch-btn')].find((x) => x.textContent.trim() === 'Claim');
          b?.click();
        });
        await sleep(240);
      }
      await sleep(1200);
      await clearMoments();
      await survey('14b-gallery-solved');
    }
    await leave();
  } catch (e) { log('  !! solved-state survey failed:', e.message); }

  /* === 14c. the empty / error branches of the room host ================= */
  try {
    await ensureExploring();
    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      const m = s.manor, cell = { col: 1, row: 1 }, key = '1,1';
      window.__manorStore.setState({ manor: { ...m, playerCell: cell,
        rooms: { ...m.rooms, [key]: { cardId: 'library', cell, doors: ['N','S','E','W'], solved: false, kind: 'ladder' } } } });
      window.__manorStore.getState().enterRoom(key);
    });
    await sleep(700);
    await survey('14c-room-unregistered-kind');
    await leave();
  } catch (e) { log('  !! unregistered-kind survey failed:', e.message); }
  try {
    await page.evaluate(() => { window.__manorStore.getState().leaveRoom(); window.location.hash = '#/room'; });
    await sleep(600);
    await survey('14d-room-no-active');
    await page.evaluate(() => { window.location.hash = '#/manor'; });
    await sleep(400);
  } catch (e) { log('  !! no-active-room survey failed:', e.message); }

  /* === 15. journal, every tab =========================================== */
  await ensureExploring();
  await clickText('^journal');
  await page.waitForSelector('.jrn-page, .jrn', { timeout: 10000 });
  await sleep(350);
  await survey('15-journal');
  {
    const tabs = await page.$$('.jrn-tab, .jrn-tabs button');
    for (let i = 1; i < tabs.length; i++) {
      const t = (await tabs[i].innerText()).replace(/\s+/g, ' ').trim().slice(0, 16).replace(/\W+/g, '-');
      await tabs[i].click();
      await sleep(320);
      await survey(`15-journal-tab-${i}-${t}`, { shots: i === 1 });
    }
  }
  await clickText('the manor');
  await sleep(400);

  /* === 16. sanctum ====================================================== */
  await ensureExploring();
  await page.evaluate(() => { window.location.hash = '#/sanctum'; });
  await page.waitForSelector('.snc', { timeout: 10000 }).catch(() => {});
  await sleep(500);
  await clearMoments();
  await survey('16-sanctum');
  await page.evaluate(() => { window.location.hash = '#/manor'; });
  await sleep(400);

  /* === 17. dusk veil + night digest ===================================== */
  await ensureExploring();
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    s.endDay?.('spent') ?? s.retireForTheEvening?.();
  }).catch(() => {});
  await sleep(700);
  /* The dusk veil fades in over 3.6s and then advances on its own (AAA 4.12
     caps it at 4s), so it can be measured neither immediately — mid-fade its
     own copy reads 1.11:1 against the paper it is fading onto, an artefact of
     the animation — nor after 4s, when the surface no longer exists. Both
     animations are jumped to their LAST frame instead, which is the resting
     appearance the criterion is actually about. */
  if (await page.$('.chr-dusk')) {
    await page.addStyleTag({ content:
      /* Round 8: `.chr-dusk__candle` joins the list. It was added to the veil
         to fill its 372px featureless band and then measured at opacity 0,
         because it fades in over 1.4-3.0s and this survey jumps every dusk
         animation to its last frame — so the composition fix looked like it
         had done nothing. A surface whose resting appearance is what the
         criterion is about has to have EVERY one of its animations jumped. */
      '.chr-dusk, .chr-dusk__line, .chr-dusk__text, .chr-dusk__skip, .chr-dusk__candle { animation-delay: -8s !important; }' });
    await survey('17-dusk', { settle: 400 });
    await page.click('.chr-dusk__skip').catch(() => {});
    await sleep(1200);
  }
  if (await page.$('.chr-scene')) await survey('18-night-digest');

  /* === 19. not-found ==================================================== */
  await page.evaluate(() => { window.location.hash = '#/nowhere'; });
  await sleep(450);
  await survey('19-not-found');
  await page.evaluate(() => { window.location.hash = '#/manor'; });
  await sleep(350);

  if (consoleErrors.length) log('page errors:', consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  log('WALK THREW:', e.message);
  failures.push({ surface: 'walk', combo: '-', badge: [e.message] });
} finally {
  if (browser) await browser.close();
  server.kill();
}

const file = join(OUT, `metrics-${TAG}${REDUCED ? '-rm' : ''}.json`);
writeFileSync(file, JSON.stringify({ tag: TAG, reduced: REDUCED, report, failures }, null, 2));
log('wrote', file);
log(failures.length ? `${failures.length} surface/combo rows carry findings` : 'every surveyed combo clean');
