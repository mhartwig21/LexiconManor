/**
 * scripts/r8-chrome-height-probe.mjs — ROUND 8 verifier.
 *
 * Rounds 12 and 13 both reported `tests/modal-hit-test.mjs` failing two
 * assertions at 375x667 (`.chr-header` measures 59px against `--chrome-h: 50px`)
 * and both correctly said "not mine". Nobody measured WHERE the 9px come from.
 * This does: it walks the bar's box model child by child at both viewport
 * heights so the fix lands on the element that is actually tall, rather than on
 * whichever rule is easiest to reach.
 *
 * HARNESS RULES: system Edge via channel 'msedge', ONE instance, closed in a
 * finally. Never download a browser.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function freePort(from = 5271, to = 5330) {
  for (let p = from; p <= to; p++) {
    let taken = false;
    for (const host of ['127.0.0.1', '::1', undefined]) {
      // eslint-disable-next-line no-await-in-loop
      taken = taken || await new Promise((res) => {
        const s = createServer();
        s.once('error', () => res(true));
        s.once('listening', () => s.close(() => res(false)));
        host ? s.listen(p, host) : s.listen(p);
      });
    }
    if (!taken) return p;
  }
  throw new Error('no free port');
}

const box = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    sel: ${JSON.stringify(sel)},
    h: +r.height.toFixed(1), w: +r.width.toFixed(1), top: +r.top.toFixed(1),
    padT: cs.paddingTop, padB: cs.paddingBottom,
    border: cs.borderTopWidth + '/' + cs.borderBottomWidth,
    font: cs.fontSize, lh: cs.lineHeight, display: cs.display,
    kids: [...el.children].map((k) => ({
      cls: k.className && k.className.baseVal !== undefined ? k.className.baseVal : String(k.className),
      tag: k.tagName.toLowerCase(),
      h: +k.getBoundingClientRect().height.toFixed(1),
      font: getComputedStyle(k).fontSize, lh: getComputedStyle(k).lineHeight,
    })),
  };
})()`;

(async () => {
  const port = await freePort();
  const BASE = `http://localhost:${port}/LexiconManor/`;
  const server = spawn(
    process.execPath,
    [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const serverUp = new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('vite did not start within 60s')), 60000);
    server.stdout.on('data', (b) => {
      if (String(b).includes('ready in') || String(b).includes('Local:')) { clearTimeout(timer); res(); }
    });
    server.on('exit', (c) => { clearTimeout(timer); rej(new Error(`vite exited early (${c})`)); });
  });
  let browser;
  try {
    await serverUp;
    browser = await chromium.launch({ channel: 'msedge' });
    for (const [w, h] of [[390, 844], [375, 667]]) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: 'networkidle' });
      // Walk into the exploring phase, which is where the bar was measured tall.
      await page.evaluate(() => {
        const s = window.__manorStore?.getState?.();
        if (s?.startDay) s.startDay();
      });
      await page.waitForTimeout(400);
      // Any lingering scene: click through to the map.
      for (let i = 0; i < 6; i++) {
        const btn = await page.$('.chr-scene button, .dlg button');
        if (!btn) break;
        await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(400);
      const token = await page.evaluate(
        () => getComputedStyle(document.documentElement).getPropertyValue('--chrome-h').trim(),
      );
      const phase = await page.evaluate(() => window.__manorStore?.getState?.().phase);
      console.log(`\n===== ${w}x${h}  --chrome-h=${token}  phase=${phase} =====`);
      for (const sel of ['.chr-header', '.chr-steps', '.chr-steps__candle', '.chr-steps__count', '.chr-steps__label']) {
        // eslint-disable-next-line no-await-in-loop
        const b = await page.evaluate(box(sel));
        console.log(JSON.stringify(b, null, 1));
      }
      await ctx.close();
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})();
