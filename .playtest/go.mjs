import { run } from './harness.mjs';
import { attach } from './lib.mjs';

// node go.mjs "cmd|cmd|cmd"
// c:<regex>   click first control whose label matches
// cn:<n>:<regex> click nth match
// xy:<x>,<y>
// w:<ms> | i:<label> (info dump) | s:<name> (shot) | type:<text> | key:<K>
// q  = quiet info (no dump)
const cmds = (process.argv[2] || '').split('|').map(s => s.trim()).filter(Boolean);

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  for (const c of cmds) {
    try {
      if (c.startsWith('c:')) await h.clickLabel(new RegExp(c.slice(2)), 900);
      else if (c.startsWith('cf:')) await h.clickLabel(new RegExp(c.slice(3)), 300);
      else if (c.startsWith('cn:')) { const m = c.slice(3); const i = m.indexOf(':'); await h.clickLabel(new RegExp(m.slice(i + 1)), 900, +m.slice(0, i)); }
      else if (c.startsWith('xy:')) { const [x, y] = c.slice(3).split(',').map(Number); await h.clickAt(x, y, 900); console.log('[xy]', x, y); }
      else if (c.startsWith('w:')) await page.waitForTimeout(+c.slice(2));
      else if (c.startsWith('i:')) await h.info(c.slice(2));
      else if (c.startsWith('s:')) await h.shot(c.slice(2));
      else if (c.startsWith('type:')) { await page.keyboard.type(c.slice(5), { delay: 45 }); await page.waitForTimeout(400); }
      else if (c.startsWith('key:')) { await page.keyboard.press(c.slice(4)); await page.waitForTimeout(500); }
      else if (c === 'dlg') await h.dismissDialogue();
      else console.log('?? ' + c);
    } catch (e) { console.log('FAIL', c, '::', e.message.split('\n')[0]); }
  }
});
