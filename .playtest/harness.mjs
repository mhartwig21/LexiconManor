import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const USER_DIR = 'C:/Users/hartw/lexicon-loop-v2/.playtest/userdata';
const SHOTS = 'C:/Users/hartw/lexicon-loop-v2/.playtest/shots';
fs.mkdirSync(SHOTS, { recursive: true });

export async function run(fn) {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(USER_DIR, {
      channel: 'msedge',
      headless: true,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = ctx.pages()[0] || (await ctx.newPage());
    page.on('pageerror', (e) => console.log('!!PAGEERROR', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('!!CONSOLE', m.text().slice(0, 300)); });
    const helpers = makeHelpers(page);
    await fn(page, helpers);
  } catch (e) {
    console.log('HARNESS ERROR:', e.message);
  } finally {
    if (ctx) await ctx.close();
  }
}

function makeHelpers(page) {
  const shot = async (name) => {
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
    console.log('[shot]', name);
  };
  const goto = async () => {
    await page.goto('http://localhost:4173/LexiconManor/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
  };
  // Dump a readable text tree of the visible UI
  const dump = async (label = '') => {
    const txt = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      function visible(el) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none') return false;
        return true;
      }
      function walk(el, depth) {
        if (depth > 26) return;
        if (!(el instanceof HTMLElement)) return;
        if (!visible(el)) return;
        const tag = el.tagName.toLowerCase();
        const isInteractive = tag === 'button' || tag === 'input' || tag === 'a' || el.getAttribute('role') === 'button' || el.hasAttribute('data-testid');
        const kids = Array.from(el.children);
        const ownText = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
        if (isInteractive || ownText) {
          const label = el.getAttribute('aria-label') || '';
          const tid = el.getAttribute('data-testid') || '';
          const dis = el.disabled ? ' DISABLED' : '';
          const val = tag === 'input' ? ` value="${el.value}"` : '';
          const cls = (el.className && typeof el.className === 'string') ? el.className.split(' ').slice(0,2).join('.') : '';
          const full = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200);
          const text = ownText || full;
          const key = depth + '|' + tag + '|' + text + '|' + tid;
          if (!seen.has(key)) {
            seen.add(key);
            out.push('  '.repeat(depth) + (isInteractive ? '<' + tag + '> ' : '') + (tid ? '{' + tid + '} ' : '') + (label ? '[' + label + '] ' : '') + (cls ? '(' + cls + ') ' : '') + text + val + dis);
          }
        }
        kids.forEach(k => walk(k, depth + 1));
      }
      walk(document.body, 0);
      return out.join('\n');
    });
    const alt = await page.evaluate(() => {
      const t = document.body.innerText;
      const inter = [];
      document.querySelectorAll('button, input, [role="button"], [data-testid], a, [aria-label], [tabindex]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none') return;
        inter.push(
          `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? '{' + el.getAttribute('data-testid') + '}' : ''}` +
          `${el.disabled ? '[DIS]' : ''} @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} :: ` +
          ((el.getAttribute('aria-label') || el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 110))
        );
      });
      return { t, inter };
    });
    console.log('===== TEXT ' + label + ' =====');
    console.log(alt.t);
    console.log('----- INTERACTIVE -----');
    console.log(alt.inter.join('\n'));
    console.log('===== /DUMP =====');
  };
  const state = async () => {
    const s = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const out = {};
      for (const k of keys) { const v = localStorage.getItem(k); out[k] = v.length > 400 ? v.slice(0, 400) + '…(' + v.length + ')' : v; }
      return out;
    });
    console.log('===== LOCALSTORAGE =====');
    console.log(JSON.stringify(s, null, 1).slice(0, 4000));
  };
  const click = async (sel, opts = {}) => {
    const l = page.locator(sel).first();
    await l.click({ timeout: 5000, ...opts });
    await page.waitForTimeout(opts.wait ?? 500);
    console.log('[click]', sel);
  };
  const clickText = async (text, wait = 500) => {
    await page.getByText(text, { exact: false }).first().click({ timeout: 5000 });
    await page.waitForTimeout(wait);
    console.log('[clickText]', text);
  };
  return { shot, goto, dump, click, clickText, state, page };
}
