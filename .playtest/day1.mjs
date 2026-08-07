import { run } from './harness.mjs';

const T = (s) => s.replace(/\s+/g, ' ').trim();

await run(async (page, h) => {
  const info = async (label) => {
    const d = await page.evaluate(() => {
      const hud = document.querySelector('[class*="chrome"], header')?.innerText || '';
      const inter = [];
      document.querySelectorAll('button, [role="button"], input, [aria-label]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none') return;
        inter.push({
          t: el.tagName.toLowerCase(),
          x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
          w: Math.round(r.width), h: Math.round(r.height),
          l: (el.getAttribute('aria-label') || el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        });
      });
      return { body: document.body.innerText, inter };
    });
    console.log('\n########## ' + label + ' ##########');
    console.log(d.body);
    console.log('--- controls ---');
    d.inter.forEach((c, i) => console.log(`${i}: (${c.x},${c.y}) ${c.w}x${c.h} ${c.t} :: ${c.l}`));
    return d;
  };

  const clickAt = async (x, y, wait = 800) => { await page.mouse.click(x, y); await page.waitForTimeout(wait); };
  const clickLabel = async (re, wait = 900) => {
    const d = await page.evaluate((src) => {
      const rx = new RegExp(src, 'i');
      const els = [...document.querySelectorAll('button, [role="button"], [aria-label]')];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 2) continue;
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none') continue;
        const l = (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim();
        if (rx.test(l)) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), l };
      }
      return null;
    }, re.source || re);
    if (!d) { console.log('!! no match for', re); return false; }
    console.log('[clickLabel]', d.l, '@', d.x, d.y);
    await clickAt(d.x, d.y, wait);
    return true;
  };
  h.clickLabel = clickLabel; h.info = info; h.clickAt = clickAt;

  await h.goto();
  await info('front');
  await clickLabel(/Begin the (first )?day/);
  await page.waitForTimeout(1500);
  await info('after-begin');
  // Skip / dismiss any dialogue
  for (let i = 0; i < 4; i++) {
    const has = await page.locator('button:has-text("Skip")').count();
    if (!has) break;
    await clickLabel(/^Skip$/);
    await page.waitForTimeout(1000);
  }
  await info('map-day1');
  await h.shot('d1-map');

  // Persistence probe: reload and see if we're still mid-day
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await info('after-reload');
  await h.shot('d1-reload');
});
