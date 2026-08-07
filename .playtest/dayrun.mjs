import { run } from './harness.mjs';
import { attach } from './lib.mjs';
import { findWeb, POOLS } from './bot.mjs';

const MISTAKES = process.env.MISTAKES === '1';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const state = async () => page.evaluate(() => {
    const inter = [];
    document.querySelectorAll('button, [role="button"], input, [aria-label], [data-testid]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') return;
      inter.push({ t: el.tagName.toLowerCase(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), l: (el.getAttribute('aria-label') || el.innerText || el.value || '').replace(/\s+/g, ' ').trim() });
    });
    return { body: document.body.innerText, inter };
  });
  const show = (s, tag) => {
    console.log('\n##### ' + tag + ' #####');
    console.log(s.body);
    console.log('-- controls --');
    s.inter.forEach((c, i) => console.log(`${i}: (${c.x},${c.y}) ${c.w}x${c.h} :: ${c.l.slice(0, 120)}`));
  };
  h.state = state; h.show = show;

  // ---- begin day / dismiss any modal
  let s = await state();
  if (/Begin the (first )?day/.test(s.body)) { await h.clickLabel(/Begin the (first )?day/, 1800); await h.dismissDialogue(); }
  s = await state(); show(s, 'start');

  // ---- if in a word-web room, solve it
  if (/Weave the sixteen words/.test(s.body)) {
    const words = s.inter.filter((c) => /^[A-Z]{2,}$/.test(c.l)).map((c) => c.l);
    console.log('WORDS', words.join(','));
    const b = findWeb(words);
    if (!b) console.log('!! board not found in pool');
    else {
      console.log('BOARD', b.id, 'tier', b.tier);
      b.groups.forEach((g) => console.log('  [' + g.tier + '/' + g.type + '] ' + g.theme + ' :: ' + g.words.join(', ')));
      for (const g of b.groups) {
        for (const w of g.words) await h.clickLabel(new RegExp('^' + w + '$'), 260);
        await h.clickLabel(/^Weave$/, 1700);
      }
      await page.waitForTimeout(3000);
      s = await state(); show(s, 'web-complete');
      await h.shot('r-webdone');
    }
  }
  s = await state(); show(s, 'end');
  await h.shot('r-end');
});
