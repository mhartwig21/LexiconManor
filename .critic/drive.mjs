/**
 * .critic/drive.mjs — reviewer's manual-play driver.
 * ONE Edge instance (channel msedge), closed in a finally. 390x844 @2x.
 * Persists localStorage to .critic/save.json between invocations so a long
 * play session can span many tool calls.
 *
 * Usage: node .critic/drive.mjs <actions.json> [--fresh]
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SAVE = resolve(HERE, 'save.json');
const SHOTS = resolve(HERE, 'shots');
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

const BASE = 'http://localhost:4173/LexiconManor/';
const actionsFile = process.argv[2];
const fresh = process.argv.includes('--fresh');
const actions = JSON.parse(readFileSync(resolve(ROOT, actionsFile), 'utf8'));

const log = [];
function say(s) { log.push(s); console.log(s); }

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') say(`  [console.error] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => say(`  [pageerror] ${String(e).slice(0, 300)}`));

  if (!fresh && existsSync(SAVE)) {
    const store = JSON.parse(readFileSync(SAVE, 'utf8'));
    await page.addInitScript((s) => {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    }, store);
  }

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  let shot = 0;
  const snap = async (name) => {
    shot += 1;
    const p = resolve(SHOTS, `${String(shot).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: p });
    say(`  [shot] ${p}`);
  };

  for (const a of actions) {
    try {
      if (a.click) {
        const loc = page.locator(a.click).filter(a.has ? { hasText: a.has } : {});
        const target = loc.nth(a.n ?? 0);
        await target.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        await target.click({ timeout: a.timeout ?? 6000 });
        say(`click ${a.click}${a.has ? ` [${a.has}]` : ''}${a.n ? ` #${a.n}` : ''} -> ok`);
      } else if (a.text) {
        const target = page.getByText(a.text, { exact: !!a.exact }).nth(a.n ?? 0);
        await target.click({ timeout: a.timeout ?? 6000 });
        say(`clickText "${a.text}" -> ok`);
      } else if (a.type) {
        await page.keyboard.type(a.type, { delay: 40 });
        say(`type "${a.type}"`);
      } else if (a.key) {
        for (let i = 0; i < (a.times ?? 1); i++) { await page.keyboard.press(a.key); await page.waitForTimeout(80); }
        say(`key ${a.key} x${a.times ?? 1}`);
      } else if (a.wait) {
        await page.waitForTimeout(a.wait);
      } else if (a.shot) {
        await snap(a.shot);
      } else if (a.dump) {
        const t = await page.evaluate(() => {
          const walk = (el, d = 0) => {
            let out = '';
            for (const c of el.children) {
              const tag = c.tagName.toLowerCase();
              const own = Array.from(c.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
              const cls = (c.getAttribute('class') || '').split(' ').slice(0, 2).join('.');
              const aria = c.getAttribute('aria-label') || '';
              const dis = c.disabled ? ' DISABLED' : '';
              if (own || tag === 'button' || tag === 'input' || aria) {
                out += `${'  '.repeat(d)}<${tag}${cls ? '.' + cls : ''}${aria ? ` aria="${aria}"` : ''}${dis}> ${own}\n`;
              }
              if (d < 14) out += walk(c, d + 1);
            }
            return out;
          };
          return walk(document.body);
        });
        say(`--- DOM DUMP ---\n${t}\n--- END ---`);
      } else if (a.dialogue) {
        // Read a whole conversation: skip the typewriter, capture each line, advance.
        const lines = [];
        for (let i = 0; i < (a.dialogue === true ? 30 : a.dialogue); i++) {
          const box = page.locator('.dlg__box');
          if (!(await box.count())) break;
          // fast-forward typewriter, then read
          await box.click({ timeout: 2500 }).catch(() => {});
          await page.waitForTimeout(180);
          const t = await page.locator('.dlg__text').first().getAttribute('aria-label').catch(() => null);
          const name = await page.locator('.dlg__nameplate').first().textContent().catch(() => '');
          const choices = await page.locator('.dlg__choice, .dlg-choice, button[class*="choice"]').allTextContents().catch(() => []);
          if (t && lines[lines.length - 1] !== `${name}: ${t}`) lines.push(`${name}: ${t}`);
          if (choices.length) { lines.push(`  CHOICES: ${choices.join(' | ')}`); break; }
          await box.click({ timeout: 2500 }).catch(() => {});
          await page.waitForTimeout(320);
        }
        say(`--- DIALOGUE ---\n${lines.join('\n')}\n--- END ---`);
      } else if (a.cipher) {
        for (const [ct, pt] of Object.entries(a.cipher)) {
          const ok = await page.evaluate((c) => {
            const cell = Array.from(document.querySelectorAll('.dk-cell'))
              .find((b) => !b.className.includes('locked')
                && b.querySelector('.dk-cell__cipher')?.textContent.trim() === c);
            if (!cell) return false; cell.click(); return true;
          }, ct);
          await page.waitForTimeout(150);
          if (!ok) { say(`  cipher: no cell for ${ct}`); continue; }
          await page.evaluate((p) => {
            const k = Array.from(document.querySelectorAll('.mic-keys button'))
              .find((b) => b.textContent.trim() === p);
            if (k) k.click();
          }, pt);
          await page.waitForTimeout(150);
        }
        say(`cipher applied: ${JSON.stringify(a.cipher)}`);
      } else if (a.goto) {
        await page.goto(BASE.replace(/\/$/, '') + a.goto, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        say(`goto ${a.goto}`);
      } else if (a.eval) {
        const r = await page.evaluate(a.eval);
        say(`eval -> ${JSON.stringify(r).slice(0, 4000)}`);
      }
      await page.waitForTimeout(a.after ?? 350);
    } catch (e) {
      say(`FAILED ${JSON.stringify(a).slice(0, 160)} :: ${String(e.message).split('\n')[0].slice(0, 200)}`);
      if (a.critical) break;
    }
  }

  const store = await page.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
    return o;
  });
  writeFileSync(SAVE, JSON.stringify(store));
  say(`[saved localStorage: ${Object.keys(store).join(', ')}]`);
} finally {
  if (browser) await browser.close();
}
