import { run } from './harness.mjs';

await run(async (page, h) => {
  await h.goto();
  await h.clickText('Begin the day', 1500);
  // dismiss letter toast
  try { await page.locator('.mom').first().click(); await page.waitForTimeout(400); } catch {}
  // Read Bramble dialogue fully: click through until it's gone
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(1600);
    const txt = await page.evaluate(() => {
      const el = document.querySelector('[class*="dlg"], [class*="dialogue"], [class*="convo"]');
      return el ? el.innerText : null;
    });
    console.log('--- LINE', i, '---\n', txt);
    if (!txt) break;
    await h.shot('05-dlg' + i);
    // advance
    const choice = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('button')].map(b => b.innerText.trim());
      return bs;
    });
    console.log('BTNS:', JSON.stringify(choice));
    try {
      await page.locator('body').click({ position: { x: 195, y: 700 } });
    } catch {}
  }
  await h.dump('after-dialogue');
  await h.shot('05-after');
});
