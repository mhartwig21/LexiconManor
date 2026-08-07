import { run } from './harness.mjs';
import { attach } from './lib.mjs';
import * as S from './solve.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300);
  const controls = async () => page.evaluate(() => [...document.querySelectorAll('button,[role="button"]')].filter(b => b.getBoundingClientRect().width > 2).map(b => (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim()));

  // begin day 2, draft ground floor, take whatever word-web/anchor is offered
  await h.clickLabel(/Begin the day/, 2000);
  for (let i = 0; i < 4; i++) { if (!(await h.clickLabel(/^Skip$/, 900))) break; }
  console.log('map:', await txt());
  console.log('controls:', JSON.stringify(await controls()));
});
