import { run } from './harness.mjs';
import { attach } from './lib.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const snap = async (tag) => {
    const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    const save = await page.evaluate(() => { const s = localStorage.getItem('lexicon-loop-save-v2'); const j = s ? JSON.parse(s) : null; return j ? { phase: j.day && j.day.phase, budget: j.ledger.budget, n: j.ledger.entries.length } : null; });
    console.log(tag, '| HUD:', t.match(/(\d+) steps/)?.[1], '| save:', JSON.stringify(save));
  };
  await snap('morning-card');
  await h.clickLabel(/Begin the day/, 3000);
  await snap('after-begin');
  await h.shot('tea-after-begin');
  await page.waitForTimeout(6000);
  await snap('after-begin+6s');
  // dismiss whatever dialogue
  for (let i = 0; i < 6; i++) {
    const ok = await h.clickLabel(/^(Skip|Farewell)$/, 1200);
    if (!ok) break;
  }
  await snap('after-dialogue');
  await page.waitForTimeout(5000);
  await snap('after-dialogue+5s');
  await h.shot('tea-map');
});
