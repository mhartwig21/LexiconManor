import { run } from './harness.mjs';
import { attach } from './lib.mjs';
import * as S from './solve.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400);
  const ctrl = async () => page.evaluate(() => [...document.querySelectorAll('button,[role="button"]')].filter(b => b.getBoundingClientRect().width > 2).map(b => { const r = b.getBoundingClientRect(); return { l: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }));

  await h.clickLabel(/^Farewell$/, 1500);
  console.log('steps now:', (await txt()).match(/(\d+) steps/)?.[1]);
  console.log(JSON.stringify(await ctrl()));
  // draft a room
  await h.clickLabel(/Draft a room/, 1800);
  const cards = await ctrl();
  console.log('CARDS:', JSON.stringify(cards.map(c => c.l), null, 0));
  const lib = cards.find(c => /Library|Gallery|Study|Darkroom|Linen/.test(c.l));
  if (lib) { await page.mouse.click(lib.x, lib.y); await page.waitForTimeout(3500); }
  console.log('ROOM:', await txt());
  const rc = await ctrl();
  console.log('ROOM CONTROLS:', JSON.stringify(rc.map(c => c.l)));
  await h.shot('persist-room');
});
