import { run } from './harness.mjs';
import { attach } from './lib.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const btns = async () => page.evaluate(() => [...document.querySelectorAll('button,[role="button"]')].filter(b => b.getBoundingClientRect().width > 2).map(b => { const r = b.getBoundingClientRect(); return { l: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }));
  const body = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const step = async (re) => { const b = (await btns()).find(x => new RegExp(re).test(x.l)); if (!b) { console.log('miss', re); return false; } await page.mouse.click(b.x, b.y); await page.waitForTimeout(1600); return true; };

  // get through morning
  if (/To tomorrow/.test(await body())) await step('To tomorrow');
  if (/Begin the day/.test(await body())) await step('Begin the day');
  for (let i = 0; i < 4; i++) { if (!(await step('^(Skip|Farewell)$'))) break; }
  console.log('gems/keys:', (await body()).match(/(\d+) gems?/)?.[0], (await body()).match(/(\d+) keys?/)?.[0]);
  await step('^Draft a room');
  for (let i = 0; i < 4; i++) {
    const cards = (await btns()).filter(b => /tiers/.test(b.l)).map(c => c.l.split(' ').slice(0, 3).join(' '));
    const gems = (await body()).match(/(\d+) gems?\b/)?.[1];
    console.log('offer ' + i + ' (gems=' + gems + '):', JSON.stringify(cards));
    const ok = await step('Reroll');
    if (!ok) break;
  }
  await h.shot('reroll-test');
});
