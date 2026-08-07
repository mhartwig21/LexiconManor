import { run } from './harness.mjs';
import { attach } from './lib.mjs';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const day = async (tag) => {
    const d = await page.evaluate(() => { const s = localStorage.getItem('lexicon-loop-save-v2'); const j = s ? JSON.parse(s) : null; return j ? { day: j.day, steps: j.ledger, cur: j.currencies } : null; });
    console.log(tag, JSON.stringify(d));
  };
  await day('before');
  await h.clickLabel(/Begin the day/, 2500);
  await day('immediately after Begin');
  await page.waitForTimeout(8000);
  await day('8s after Begin');
  await h.clickLabel(/^Farewell$/, 1500);
  await page.waitForTimeout(8000);
  await day('after farewell +8s');
  // now open a draft
  await h.clickLabel(/Draft a room/, 2000);
  const cards = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 200).map(b => { const r = b.getBoundingClientRect(); return { l: b.innerText.replace(/\s+/g, ' ').trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }));
  console.log('CARDS', JSON.stringify(cards.map(c => c.l)));
  const pick = cards.find(c => /Library|Gallery|Darkroom|Linen|Study/.test(c.l)) || cards[0];
  await page.mouse.click(pick.x, pick.y); await page.waitForTimeout(3500);
  console.log('IN ROOM:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 260));
  await day('in room');
  await h.shot('p4-room');
});
