/**
 * Round 14 live critic — stage 7: the sealed→legible transition and the
 * unread/sealed marker vocabulary across entrance, tab and card; plus tap
 * counts to settings from every phase; plus victory ceremony exits.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = await (async () => {
  for (let p = 6410; p < 6470; p++) {
    const taken = await new Promise((res) => { const s = createServer(); s.once('error', () => res(true)); s.once('listening', () => s.close(() => res(false))); s.listen(p, '127.0.0.1'); });
    if (!taken) return p;
  }
  throw new Error('no free port');
})();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch { } await new Promise((r) => setTimeout(r, 500)); }
const L = (...a) => console.log(...a);

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const drain = async () => { for (let i = 0; i < 30; i++) { const b = await page.$('.mom'); if (!b) return; const r = await b.boundingBox(); if (!r) return; await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(140); } };
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bp-btn--seal');
  await page.click('.bp-btn--seal'); await page.waitForTimeout(900);
  if (await page.$('.chr-scene__btn')) { await page.click('.chr-scene__btn'); await page.waitForTimeout(700); }
  for (let i = 0; i < 80 && (await page.$('.dlg')); i++) {
    const p = await page.$('.dlg-choice--primary'); if (p) { await p.click(); await page.waitForTimeout(150); continue; }
    const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)'); if (c) { await c.click(); await page.waitForTimeout(150); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => { }); await page.waitForTimeout(140);
  }
  await page.waitForTimeout(400); await drain();

  const marks = async (where) => {
    const m = await page.evaluate(() => {
      const nav = [...document.querySelectorAll('.bp-btn--quiet, .chr-scene__aside')].map((b) => ({
        t: b.innerText.replace(/\s+/g, ' '),
        wax: [...b.querySelectorAll('.unread')].map((u) => u.getAttribute('aria-label') || u.innerText),
        smudge: [...b.querySelectorAll('.sealed')].map((u) => u.getAttribute('aria-label') || u.innerText),
      }));
      const tabs = [...document.querySelectorAll('.jrn-tab')].map((t) => ({
        t: t.innerText.replace(/\s+/g, ' '),
        wax: [...t.querySelectorAll('.unread')].map((u) => u.getAttribute('aria-label')),
        smudge: [...t.querySelectorAll('.sealed')].map((u) => u.getAttribute('aria-label')),
      }));
      const cards = [...document.querySelectorAll('.jrn-card, .jrn-poem__line')].map((c) => ({
        pip: [...c.querySelectorAll('.unread, .sealed')].map((u) => u.className + '|' + (u.getAttribute('aria-label') || '')),
        txt: c.innerText.replace(/\s+/g, ' ').slice(0, 44),
      })).filter((c) => c.pip.length);
      return { nav, tabs, cards };
    });
    L(`[${where}]`, JSON.stringify(m));
  };

  /* --- file three sealed fragments from the room the player would be in --- */
  const filed = await page.evaluate(() => {
    const s = window.__manorStore.getState();
    const content = window.__volumeContent || null;
    const v = s.volume;
    // Use the engine's own reserved list via the store: file the first three
    // engraving/testimony fragments as SEALED.
    const ids = (s.volume.foundFragmentIds || []);
    return { before: ids.length, day: v.day, volumeId: v.volumeId };
  });
  L('volume before:', JSON.stringify(filed));
  await page.evaluate(() => {
    const st = window.__manorStore;
    const s = st.getState();
    // fileSealedFragment lives behind the room channel; call fileFragment with sealed
    const content = s.volume;
    for (const fid of ['v1-d1', 'v1-e1', 'v1-t2']) {
      try { s.fileFragment(fid, { sealed: true }); } catch (e) { }
    }
  });
  await page.waitForTimeout(700);
  await drain();
  L('found ids:', JSON.stringify(await page.evaluate(() => window.__manorStore.getState().volume.foundFragmentIds)));
  await page.evaluate(() => { location.hash = '/manor'; }); await page.waitForTimeout(500);
  await marks('blueprint after sealed filing');
  await page.evaluate(() => { location.hash = '/journal'; }); await page.waitForTimeout(700);
  await marks('journal, Word tab');
  for (const tab of ['Engravings', 'Testimony']) {
    await page.click(`.jrn-tab:has-text("${tab}")`); await page.waitForTimeout(500);
    await marks(`journal, ${tab} tab`);
  }
  await page.evaluate(() => { location.hash = '/manor'; }); await page.waitForTimeout(500);
  await marks('blueprint after viewing all tabs (wax should be gone, smudge should stand)');

  /* --- now make them out (sealed → legible) and re-check --- */
  const made = await page.evaluate(() => window.__manorStore.getState().decipherFragments(3));
  await page.waitForTimeout(800); await drain();
  L('made out:', JSON.stringify(made));
  await page.evaluate(() => { location.hash = '/manor'; }); await page.waitForTimeout(500);
  await marks('blueprint after decipher (wax should RETURN, smudge should clear)');
  await page.evaluate(() => { location.hash = '/journal'; }); await page.waitForTimeout(700);
  await marks('journal after decipher');
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
  await page.evaluate(() => { location.hash = '/manor'; }); await page.waitForTimeout(600);
  await marks('blueprint after reload');
  L('errs:', JSON.stringify(errs.slice(0, 5)));
} finally {
  if (browser) await browser.close();
  server.kill();
}
