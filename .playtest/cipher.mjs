import { run } from './harness.mjs';
import { attach } from './lib.mjs';
import * as S from './solve.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const ct = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[aria-label^="Cipher letter"]')];
    return els.map((e) => e.getAttribute('aria-label').match(/Cipher letter (\w)/)[1]).join('');
  });
  console.log('cipher letters:', ct);
  const cand = S.CIPHER.filter((c) => c.ciphertext.replace(/[^A-Z]/g, '') === ct);
  console.log('match:', JSON.stringify(cand[0]));
  if (!cand[0]) return;
  const p = cand[0];
  const map = {};
  const a = p.ciphertext.replace(/[^A-Z]/g, ''), b = p.plaintext.replace(/[^A-Z]/g, '');
  for (let i = 0; i < a.length; i++) map[a[i]] = b[i];
  console.log('key:', JSON.stringify(map));
  // fill each blank slot
  const btn = async (re) => page.evaluate((r) => {
    const el = [...document.querySelectorAll('button,[role="button"]')].find((x) => new RegExp(r).test((x.getAttribute('aria-label') || x.innerText || '').replace(/\s+/g, ' ').trim()));
    if (!el) return null; const rc = el.getBoundingClientRect(); return { x: Math.round(rc.x + rc.width / 2), y: Math.round(rc.y + rc.height / 2) };
  }, re);
  for (let i = 0; i < 40; i++) {
    const slot = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label^="Cipher letter"]')].find((x) => /blank/.test(x.getAttribute('aria-label')));
      if (!el) return null; const r = el.getBoundingClientRect();
      return { l: el.getAttribute('aria-label'), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    if (!slot) break;
    const c = slot.l.match(/Cipher letter (\w)/)[1];
    await page.mouse.click(slot.x, slot.y); await page.waitForTimeout(180);
    const k = await btn('^Pencil ' + map[c] + '$');
    if (!k) { console.log('no key for', c, '->', map[c]); break; }
    await page.mouse.click(k.x, k.y); await page.waitForTimeout(180);
  }
  await h.shot('cipher-filled');
  console.log('filled:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300));
  const dev = await btn('Develop the print');
  if (dev) { await page.mouse.click(dev.x, dev.y); await page.waitForTimeout(3500); }
  console.log('after develop:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400));
  await h.shot('cipher-done');
  await page.waitForTimeout(2500);
  await h.shot('cipher-done2');
});
