import { run } from './harness.mjs';

// usage: node act.mjs "cmd;cmd;cmd"
// cmds: t:<text>  click text | b:<n> nth button | tap tap dialogue | w:<ms> | dump | shot:<name>
//       xy:<x>,<y> | key:<Key> | type:<text>
const script = process.argv[2] || '';
const cmds = script.split(';').map(s => s.trim()).filter(Boolean);

await run(async (page, h) => {
  await h.goto();
  for (const c of cmds) {
    try {
      if (c.startsWith('t:')) { await h.clickText(c.slice(2), 700); }
      else if (c.startsWith('b:')) {
        const n = +c.slice(2);
        const btn = page.locator('button:visible').nth(n);
        console.log('[btn]', n, (await btn.innerText()).replace(/\s+/g, ' '));
        await btn.click({ timeout: 4000 }); await page.waitForTimeout(700);
      }
      else if (c.startsWith('sel:')) { await h.click(c.slice(4)); }
      else if (c === 'tap') { await page.mouse.click(195, 640); await page.waitForTimeout(900); }
      else if (c.startsWith('xy:')) { const [x, y] = c.slice(3).split(',').map(Number); await page.mouse.click(x, y); await page.waitForTimeout(700); console.log('[xy]', x, y); }
      else if (c.startsWith('w:')) { await page.waitForTimeout(+c.slice(2)); }
      else if (c === 'dump') { await h.dump(''); }
      else if (c.startsWith('shot:')) { await h.shot(c.slice(5)); }
      else if (c.startsWith('key:')) { await page.keyboard.press(c.slice(4)); await page.waitForTimeout(500); }
      else if (c.startsWith('type:')) { await page.keyboard.type(c.slice(5), { delay: 40 }); await page.waitForTimeout(400); }
      else if (c === 'state') { await h.state(); }
      else console.log('?? unknown cmd', c);
    } catch (e) {
      console.log('CMD FAIL', c, '::', e.message.split('\n')[0]);
    }
  }
});
