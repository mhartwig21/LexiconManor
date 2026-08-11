/**
 * Deferred-visual-minors audit (round 5) — evidence for the Sanctum text-fit
 * pair, the draft scrim, the journal quoting/unread dot, the dialogue box fit
 * and the paper material, in BOTH themes.
 *
 * ONE msedge instance, 390x844. Measures rather than eyeballs:
 *   - sanctum placeholder: rendered advance width vs the input's content box
 *   - nameplate: <text> bbox vs the plate <rect> in SVG user units
 *   - dialogue box: text-area height vs the ink actually in it
 *   - scrim: computed background colour of .bp-modal (pure-black grep)
 *   - grain/vignette: presence + computed opacity of the body overlays
 *
 * Usage: node scripts/a9-visual-audit.mjs [port]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = process.argv[2] ?? '5333';
const BASE = `http://localhost:${port}/LexiconManor/`;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round5-visual');
mkdirSync(SHOTS, { recursive: true });

const out = {};
const browser = await chromium.launch({ channel: 'msedge', headless: true });

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const t = (out[theme] = { errors });

  // --- paper material -----------------------------------------------------
  t.material = await page.evaluate(() => {
    const b = getComputedStyle(document.body, '::before');
    const a = getComputedStyle(document.body, '::after');
    return {
      vignette: b.backgroundImage.slice(0, 90),
      vignetteZ: b.zIndex,
      grainImage: /grain\.png/.test(a.backgroundImage),
      grainOpacity: a.opacity,
      grainBlend: a.mixBlendMode,
      grainSize: a.backgroundSize,
    };
  });

  // --- sanctum ------------------------------------------------------------
  await page.goto(`${BASE}#/sanctum`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);

  t.sanctum = await page.evaluate(() => {
    const input = document.querySelector('.snc-input');
    const res = {};
    if (input) {
      const cs = getComputedStyle(input);
      const box = input.getBoundingClientRect();
      const inner =
        box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) -
        parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      // Measure the placeholder string in the ::placeholder's own type.
      const ph = getComputedStyle(input, '::placeholder');
      const span = document.createElement('span');
      span.style.cssText =
        `position:absolute;visibility:hidden;white-space:pre;font-family:${ph.fontFamily};` +
        `font-size:${ph.fontSize};font-style:${ph.fontStyle};font-weight:${ph.fontWeight};` +
        `letter-spacing:${ph.letterSpacing};text-transform:${ph.textTransform}`;
      span.textContent = input.placeholder;
      document.body.appendChild(span);
      const w = span.getBoundingClientRect().width;
      span.remove();
      res.placeholder = {
        text: input.placeholder,
        renderedWidth: +w.toFixed(1),
        contentWidth: +inner.toFixed(1),
        fits: w <= inner,
        transform: ph.textTransform,
        family: ph.fontFamily.split(',')[0],
      };
      res.speak = (() => {
        const b2 = document.querySelector('.snc-speak');
        const c = getComputedStyle(b2);
        return { background: c.backgroundColor, color: c.color, radius: c.borderTopLeftRadius };
      })();
    }
    const svg = document.querySelector('.snc-portrait');
    if (svg) {
      const text = svg.querySelector('text');
      const rect = svg.querySelector('rect');
      const tb = text.getBBox();
      const rb = rect.getBBox();
      res.nameplate = {
        textX: +tb.x.toFixed(1), textRight: +(tb.x + tb.width).toFixed(1),
        plateX: +rb.x.toFixed(1), plateRight: +(rb.x + rb.width).toFixed(1),
        overrunLeft: +(rb.x - tb.x).toFixed(1),
        overrunRight: +(tb.x + tb.width - (rb.x + rb.width)).toFixed(1),
        insidePlate: tb.x >= rb.x && tb.x + tb.width <= rb.x + rb.width,
        viewBoxRight: 240,
      };
    }
    return res;
  });
  await page.screenshot({ path: resolve(SHOTS, `sanctum-${theme}.png`) });

  // --- journal ------------------------------------------------------------
  await page.goto(`${BASE}#/journal`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  t.journal = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.jrn-tab')].map((b) => ({
      label: b.textContent.trim(),
      active: b.classList.contains('jrn-tab--active'),
      dot: !!b.querySelector('.jrn-tab__dot'),
    }));
    const seal = document.querySelector('.jrn-seal');
    return {
      tabs,
      dotOnActiveTab: tabs.some((x) => x.active && x.dot),
      sealShadow: seal ? getComputedStyle(seal).boxShadow : null,
      cardTexts: [...document.querySelectorAll('.jrn-card__text')].map((p) => p.textContent.slice(0, 40)),
    };
  });
  await page.screenshot({ path: resolve(SHOTS, `journal-${theme}.png`) });

  await page.close();
}

// --- scrim (needs no live draft: read the rule out of the CSSOM) ----------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  out.scrim = await page.evaluate(() => {
    const hits = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list) => {
        for (const r of list) {
          if (r.cssRules) { walk(r.cssRules); continue; }
          const txt = r.cssText || '';
          if (/rgba?\(\s*0\s*,\s*0\s*,\s*0\b/.test(txt) || /#000\b|#000000\b/i.test(txt)) {
            hits.push(txt.slice(0, 150));
          }
        }
      };
      walk(rules);
    }
    return { pureBlackRules: hits };
  });
  await page.close();
}

await browser.close();
writeFileSync(resolve(SHOTS, 'metrics.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
