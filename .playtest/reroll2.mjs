import { run } from './harness.mjs';
import { attach } from './lib.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const btns = async () => page.evaluate(() => [...document.querySelectorAll('button,[role="button"]')].filter(b => b.getBoundingClientRect().width > 2).map(b => { const r = b.getBoundingClientRect(); return { l: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), dis: !!b.disabled, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }));
  const gems = async () => page.evaluate(() => { const s = localStorage.getItem('lexicon-loop-save-v2'); return s ? JSON.parse(s).currencies : null; });
  const body = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const step = async (re) => { const b = (await btns()).find(x => new RegExp(re).test(x.l)); if (!b) { console.log('miss', re); return false; } await page.mouse.click(b.x, b.y); await page.waitForTimeout(1700); return true; };

  if (/To tomorrow/.test(await body())) await step('To tomorrow');
  if (/Begin the day/.test(await body())) await step('Begin the day');
  for (let i = 0; i < 4; i++) { if (!(await step('^(Skip|Farewell)$'))) break; }
  console.log('currencies before:', JSON.stringify(await gems()));
  await step('^Draft a room');
  const before = (await btns()).filter(b => /tiers/.test(b.l)).map(c => c.l.slice(0, 40));
  const rr = (await btns()).find(b => /Reroll/.test(b.l));
  console.log('BEFORE:', JSON.stringify(before), '| reroll btn:', JSON.stringify(rr));
  if (rr && !rr.dis) { await page.mouse.click(rr.x, rr.y); await page.waitForTimeout(2200); }
  const after = (await btns()).filter(b => /tiers/.test(b.l)).map(c => c.l.slice(0, 40));
  const rr2 = (await btns()).find(b => /Reroll/.test(b.l));
  console.log('AFTER :', JSON.stringify(after), '| btn now:', JSON.stringify(rr2));
  console.log('currencies after:', JSON.stringify(await gems()));
  await h.shot('reroll2');
});
