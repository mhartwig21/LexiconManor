import { run } from './harness.mjs';
import { attach } from './lib.mjs';
import * as S from './solve.mjs';

const ERASE = process.env.ERASE === '1';
const MAX = +(process.env.MAX || 80);
const PLAN = (process.env.PLAN || '').split('|').filter(Boolean);

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
      inter.push({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), l: (el.getAttribute('aria-label') || el.innerText || el.value || '').replace(/\s+/g, ' ').trim() });
    });
    return { body: document.body.innerText, inter };
  });
  const show = (s, tag) => {
    console.log('\n##### ' + tag + ' #####');
    console.log(s.body);
    console.log('-- controls --');
    s.inter.forEach((c, i) => console.log(`${i}: (${c.x},${c.y}) ${c.w}x${c.h} :: ${c.l.slice(0, 130)}`));
  };
  const C = async (re, wait = 900, nth = 0) => h.clickLabel(new RegExp(re), wait, nth);

  if (ERASE) {
    await C('^Chronicles', 1200);
    await C('Erase everything', 1200);
    let s = await state(); show(s, 'erase-confirm');
    await C('(Erase|Yes|Confirm|forget)', 2500);
    s = await state(); show(s, 'after-erase');
  }

  async function doWeb(s) {
    const words = s.inter.filter((c) => /^[A-Z]{2,}$/.test(c.l)).map((c) => c.l);
    const b = S.webByWords(words);
    if (!b) { console.log('!! unknown web board:', words.join(',')); return; }
    console.log('[WEB]', b.id, 'tier', b.tier);
    b.groups.forEach((g) => console.log('   ' + g.tier.padEnd(7) + (g.type || '?').padEnd(9) + g.theme + ' :: ' + g.words.join(', ')));
    for (const g of b.groups) {
      for (const w of g.words) await C('^' + w + '$', 230);
      await C('^Weave$', 1600);
      const cur = await state();
      if (/What thread binds them/.test(cur.body)) {
        console.log('[NAME-THREAD options]', cur.inter.filter((c) => c.w > 200 && c.h < 60).map((c) => c.l).join(' | '));
        await C('^' + g.theme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[“”]/g, '.') + '$', 2200);
      }
    }
    await page.waitForTimeout(3500);
  }

  for (let t = 0; t < MAX; t++) {
    let s = await state();
    const b = s.body, tag = 'T' + t;
    const has = (re) => s.inter.some((c) => new RegExp(re).test(c.l));

    if (/Begin the (first )?day/.test(b)) { show(s, tag + ' MORNING'); await h.shot(tag + '-morning'); await C('Begin the (first )?day', 1900); continue; }
    if (has('^Skip$')) { const i = b.indexOf('Skip'); console.log('\n[' + tag + ' DIALOGUE]', b.slice(i + 4, i + 600).trim()); await C('^Skip$', 1100); continue; }
    if (/Weave the sixteen words/.test(b) && has('^Weave$')) { await doWeb(s); continue; }

    if (PLAN.length) {
      const cmd = PLAN.shift();
      show(s, tag + '  >>> ' + cmd);
      await h.shot(tag);
      if (cmd.startsWith('c:')) await C(cmd.slice(2), 1500);
      else if (cmd.startsWith('n:')) { const [n, re] = cmd.slice(2).split('~'); await C(re, 1500, +n); }
      else if (cmd.startsWith('xy:')) { const [x, y] = cmd.slice(3).split(',').map(Number); await h.clickAt(x, y, 1400); }
      else if (cmd.startsWith('type:')) { await page.keyboard.type(cmd.slice(5), { delay: 45 }); await page.waitForTimeout(500); }
      else if (cmd.startsWith('key:')) { await page.keyboard.press(cmd.slice(4)); await page.waitForTimeout(700); }
      else if (cmd.startsWith('w:')) await page.waitForTimeout(+cmd.slice(2));
      continue;
    }
    show(s, tag + ' STOP');
    await h.shot(tag + '-stop');
    break;
  }
});
