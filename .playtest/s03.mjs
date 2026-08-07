import { run } from './harness.mjs';

await run(async (page, h) => {
  await h.goto();
  await h.clickText('Begin the first day', 1200);
  await h.shot('03a');
  await h.dump('after-begin');
  // advance a few beats if there's a continue-style control
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(700);
    await h.shot('03-beat' + i);
    await h.dump('beat' + i);
    const btns = await page.locator('button:visible').allInnerTexts();
    console.log('BUTTONS:', JSON.stringify(btns));
    // click the most "advance"-looking button
    const adv = btns.findIndex(t => /continue|next|go on|onward|›|→|begin|yes|thank/i.test(t));
    if (adv >= 0) {
      await page.locator('button:visible').nth(adv).click();
    } else break;
  }
});
