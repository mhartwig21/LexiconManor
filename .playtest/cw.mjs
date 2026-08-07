import { run } from './harness.mjs';
import { attach } from './lib.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const btns = async () => page.evaluate(() => [...document.querySelectorAll('button,[role="button"]')].filter(b => b.getBoundingClientRect().width > 2).map(b => { const r = b.getBoundingClientRect(); return { l: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }));
  const type = async (s) => { for (const ch of s) { const k = (await btns()).find(b => b.l === ch); if (k) { await page.mouse.click(k.x, k.y); await page.waitForTimeout(200); } else console.log('nokey', ch); } };
  const clickClue = async (re) => { const c = (await btns()).find(b => new RegExp(re).test(b.l)); if (c) { await page.mouse.click(c.x, c.y); await page.waitForTimeout(600); console.log('clue', c.l); } };
  // clear first
  const del = (await btns()).find(b => /Delete|⌫/.test(b.l));
  for (let i = 0; i < 14 && del; i++) { await page.mouse.click(del.x, del.y); await page.waitForTimeout(120); }
  await clickClue('Parchment guide'); await type('MAP');
  await page.waitForTimeout(600);
  await clickClue('Fern'); await type('SEED');
  await page.waitForTimeout(600);
  await clickClue('Celebration'); await type('CAKE');
  await page.waitForTimeout(3000);
  console.log((await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 350));
  await h.shot('cw-done');
  await page.waitForTimeout(2500);
  await h.shot('cw-done2');
});
