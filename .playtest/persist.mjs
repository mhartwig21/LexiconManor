import { run } from './harness.mjs';
import { attach } from './lib.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 160);
  console.log('A start:', await txt());
  await h.clickLabel(/To tomorrow/, 2500);
  console.log('B after To tomorrow:', await txt());
  await page.waitForTimeout(4000);
  const save1 = await page.evaluate(() => { const s = localStorage.getItem('lexicon-loop-save-v2'); return s ? JSON.parse(s).day : null; });
  console.log('save.day after rollover:', JSON.stringify(save1));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('C after in-run reload:', await txt());
  const save2 = await page.evaluate(() => { const s = localStorage.getItem('lexicon-loop-save-v2'); return s ? JSON.parse(s).day : null; });
  console.log('save.day after reload:', JSON.stringify(save2));
});
