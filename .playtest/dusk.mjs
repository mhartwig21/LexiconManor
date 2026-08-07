import { run } from './harness.mjs';
import { attach } from './lib.mjs';
await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  await page.mouse.click(345, 26); await page.waitForTimeout(400);
  await page.mouse.click(345, 26); await page.waitForTimeout(2500);
  for (let i = 0; i < 10; i++) {
    const t = await page.evaluate(() => document.body.innerText);
    const btns = await page.evaluate(() => [...document.querySelectorAll('button,[role="button"]')].filter(b => b.getBoundingClientRect().width > 2).map(b => (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim()));
    console.log('\n--- beat ' + i + ' ---'); console.log(t); console.log('BTNS:', JSON.stringify(btns));
    await h.shot('dusk' + i);
    await page.waitForTimeout(2200);
  }
});
