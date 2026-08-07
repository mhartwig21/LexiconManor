import { run } from './harness.mjs';
import { attach } from './lib.mjs';
import { POOLS, findWeb } from './bot.mjs';

const MAXSTEP = +(process.env.MAXSTEP || 60);
const SCRIPT = (process.env.SCRIPT || '').split('|').filter(Boolean);

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
  const C = async (re, wait = 900, nth = 0) => h.clickLabel(new RegExp(re), wait, nth);

  // ---------- room solvers ----------
  async function solveWordWeb(s) {
    const words = s.inter.filter((c) => /^[A-Z]{2,}$/.test(c.l)).map((c) => c.l);
    const b = findWeb(words);
    if (!b) { console.log('!! web board unknown', words.join(',')); return false; }
    console.log('[WEB]', b.id, 'tier', b.tier);
    b.groups.forEach((g) => console.log('   [' + g.tier + '/' + g.type + '] ' + g.theme + ' :: ' + g.words.join(', ') + '   decoys=' + JSON.stringify(g.decoys || [])));
    for (const g of b.groups) {
      for (const w of g.words) await C('^' + w + '$', 240);
      await C('^Weave$', 1700);
      const cur = await state();
      if (/What thread binds them/.test(cur.body)) {
        show(cur, 'NAME-THE-THREAD');
        const esc = g.theme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[“”]/g, '.');
        await C('^' + esc + '$', 2200);
      }
    }
    await page.waitForTimeout(3200);
    return true;
  }

  async function solveCipher(s) {
    const ct = (s.body.match(/[A-Z][A-Z ]{10,}/g) || []).sort((a, b) => b.length - a.length)[0] || '';
    console.log('[CIPHER] visible:', JSON.stringify(ct));
    show(s, 'cipher-room');
    return false;
  }

  // ---------- main loop ----------
  for (let turn = 0; turn < MAXSTEP; turn++) {
    let s = await state();
    const b = s.body;
    const tag = 'T' + turn;

    if (/Begin the (first )?day/.test(b)) { show(s, tag + ' morning'); await h.shot(tag + '-morning'); await C('Begin the (first )?day', 1800); continue; }
    if (s.inter.some((c) => /^(Skip)$/.test(c.l))) { console.log(tag, 'dialogue:', b.slice(b.indexOf('Skip') + 4, b.indexOf('Skip') + 500)); await C('^Skip$', 1000); continue; }
    if (s.inter.some((c) => /^(Farewell|Goodbye)$/.test(c.l))) { show(s, tag + ' dialogue-end'); await C('^(Farewell|Goodbye)$', 1200); continue; }
    if (/Weave the sixteen words/.test(b) && !/THE LAST FOUR/.test(b) && s.inter.some((c) => /^Weave$/.test(c.l))) { await solveWordWeb(s); continue; }

    // scripted command for this turn
    if (SCRIPT.length) {
      const cmd = SCRIPT.shift();
      show(s, tag + ' :: ' + cmd);
      await h.shot(tag);
      if (cmd.startsWith('c:')) await C(cmd.slice(2), 1400);
      else if (cmd.startsWith('xy:')) { const [x, y] = cmd.slice(3).split(',').map(Number); await h.clickAt(x, y, 1200); }
      else if (cmd.startsWith('w:')) await page.waitForTimeout(+cmd.slice(2));
      continue;
    }
    show(s, tag + ' IDLE-STOP');
    await h.shot(tag + '-stop');
    break;
  }
});
