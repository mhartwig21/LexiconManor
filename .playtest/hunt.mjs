import { run } from './harness.mjs';
import { attach } from './lib.mjs';

const WANT = new RegExp(process.env.WANT || 'Archive|Study|Reading|sealed page|clue fragment');
await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const btns = async () => page.evaluate(() => [...document.querySelectorAll('button,[role="button"]')].filter(b => b.getBoundingClientRect().width > 2).map(b => { const r = b.getBoundingClientRect(); return { l: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }));
  const body = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  for (let t = 0; t < 30; t++) {
    let bs = await btns();
    const draft = bs.filter(b => /^Draft a room/.test(b.l)).sort((a, b2) => a.y - b2.y)[0];
    const walk = bs.find(b => /^Walk to/.test(b.l));
    if (draft) {
      await page.mouse.click(draft.x, draft.y); await page.waitForTimeout(1800);
      let cards = (await btns()).filter(b => /tiers|sealed/.test(b.l));
      console.log('t' + t, 'cards:', JSON.stringify(cards.map(c => c.l.slice(0, 60))));
      let pick = cards.find(c => WANT.test(c.l));
      // reroll if gems available and no match
      if (!pick) {
        const rr = (await btns()).find(b => /Reroll/.test(b.l));
        const gems = (await body()).match(/(\d+) gem/)?.[1];
        if (rr && +gems > 0) { await page.mouse.click(rr.x, rr.y); await page.waitForTimeout(1600); cards = (await btns()).filter(b => /tiers|sealed/.test(b.l)); console.log('  rerolled:', JSON.stringify(cards.map(c => c.l.slice(0, 50)))); pick = cards.find(c => WANT.test(c.l)); }
      }
      if (pick) { console.log('  >>> TAKING', pick.l.slice(0, 60)); await page.mouse.click(pick.x, pick.y); await page.waitForTimeout(3500); console.log('  ROOM:', (await body()).slice(0, 300)); await h.shot('hunt-room-' + t); break; }
      const back = (await btns()).find(b => /Step back/.test(b.l));
      if (back) { await page.mouse.click(back.x, back.y); await page.waitForTimeout(1400); }
      if (walk) { await page.mouse.click(walk.x, walk.y); await page.waitForTimeout(1400); }
      continue;
    }
    if (walk) { await page.mouse.click(walk.x, walk.y); await page.waitForTimeout(1400); continue; }
    console.log('stuck', JSON.stringify(bs.map(b => b.l)));
    break;
  }
});
