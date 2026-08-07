import { run } from './harness.mjs';
import { attach } from './lib.mjs';

const OPEN = process.env.OPEN || '';
await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  if (OPEN) await h.clickLabel(new RegExp(OPEN), 2000);
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(1800);
    const d = await page.evaluate(() => {
      const box = document.querySelector('[aria-label^="Conversation"]');
      if (!box) return null;
      const btns = [...box.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { l: (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      const p = box.querySelector('p');
      return { text: p ? p.innerText : box.innerText, btns };
    });
    if (!d) { console.log('[no dialogue]'); break; }
    console.log('LINE ' + i + ': ' + d.text.replace(/\s+/g, ' '));
    console.log('   btns: ' + JSON.stringify(d.btns.map((b) => b.l)));
    const choice = d.btns.find((b) => !/^(Skip|Farewell|Offer a bookmark)/.test(b.l));
    if (choice) { console.log('   >> choosing: ' + choice.l); await page.mouse.click(choice.x, choice.y); continue; }
    // advance by tapping the text
    await page.mouse.click(195, 690);
  }
  await h.shot('talk-end');
});
