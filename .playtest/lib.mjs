export function attach(page, h) {
  const info = async (label, quiet = false) => {
    const d = await page.evaluate(() => {
      const inter = [];
      document.querySelectorAll('button, [role="button"], input, [aria-label], [data-testid]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none') return;
        inter.push({
          t: el.tagName.toLowerCase(),
          x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
          w: Math.round(r.width), h: Math.round(r.height),
          l: (el.getAttribute('aria-label') || el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 130),
        });
      });
      return { body: document.body.innerText, inter };
    });
    if (!quiet) {
      console.log('\n########## ' + label + ' ##########');
      console.log(d.body);
      console.log('--- controls ---');
      d.inter.forEach((c, i) => console.log(`${i}: (${c.x},${c.y}) ${c.w}x${c.h} ${c.t} :: ${c.l}`));
    }
    return d;
  };
  const clickAt = async (x, y, wait = 800) => { await page.mouse.click(x, y); await page.waitForTimeout(wait); };
  const find = async (re) => page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const hits = [];
    document.querySelectorAll('button, [role="button"], [aria-label], [data-testid]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') return;
      const l = (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim();
      if (rx.test(l)) hits.push({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), l });
    });
    return hits;
  }, re.source || re);
  const clickLabel = async (re, wait = 900, nth = 0) => {
    const hits = await find(re);
    if (!hits[nth]) { console.log('!! no match', re, '(' + hits.length + ' hits)'); return false; }
    console.log('[click]', JSON.stringify(hits[nth].l).slice(0, 90));
    await clickAt(hits[nth].x, hits[nth].y, wait);
    return true;
  };
  const dismissDialogue = async (max = 8) => {
    for (let i = 0; i < max; i++) {
      const has = (await find(/^(Skip|Farewell|Goodbye|Continue)$/)).length;
      if (!has) return;
      await clickLabel(/^(Skip|Farewell|Goodbye|Continue)$/, 900);
    }
  };
  return { info, clickAt, clickLabel, find, dismissDialogue, shot: h.shot, goto: h.goto, page };
}
