import { run } from './harness.mjs';
import { attach } from './lib.mjs';
import * as S from './solve.mjs';

const TURNS = +(process.env.TURNS || 40);
const PREFER = process.env.PREFER || 'Library|Gallery|Study|Reading|Darkroom|Cabinet|Vault';

await run(async (page, h0) => {
  const h = attach(page, h0);
  await h.goto();
  const body = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const btns = async () => page.evaluate(() => [...document.querySelectorAll('button,[role="button"],input')].filter(b => b.getBoundingClientRect().width > 2).map(b => { const r = b.getBoundingClientRect(); return { l: (b.getAttribute('aria-label') || b.innerText || b.value || '').replace(/\s+/g, ' ').trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width) }; }));
  const clk = async (c, w = 1200) => { await page.mouse.click(c.x, c.y); await page.waitForTimeout(w); };

  for (let t = 0; t < TURNS; t++) {
    const b = await body();
    const bs = await btns();
    const find = (re) => bs.find(x => new RegExp(re).test(x.l));
    const steps = b.match(/(\d+) steps/)?.[1];
    console.log(`\n== turn ${t} | steps ${steps} | ${b.slice(0, 90)}`);

    if (find('Begin the (first )?day')) { await clk(find('Begin the (first )?day'), 2200); continue; }
    if (find('To tomorrow')) { console.log('NIGHT:', b.slice(0, 700)); await h.shot('night-t' + t); await clk(find('To tomorrow'), 2500); continue; }
    if (find('And so, to bed')) { await clk(find('And so, to bed'), 2500); continue; }
    if (find('^Skip$')) {
      const p = await page.evaluate(() => { const e = document.querySelector('[aria-label^="Conversation"] p'); return e ? e.innerText : ''; });
      console.log('  dlg:', p.replace(/\s+/g, ' '));
      const ch = bs.filter(x => x.w > 200 && !/^(Skip|Farewell|Offer a bookmark|Cabinet|Journal|Chronicles)/.test(x.l));
      if (ch.length) { console.log('  CHOICES:', JSON.stringify(ch.map(c => c.l))); await clk(ch[0], 1500); continue; }
      await page.mouse.click(195, 690); await page.waitForTimeout(1400); continue;
    }
    if (find('^Farewell$')) {
      const p = await page.evaluate(() => { const e = document.querySelector('[aria-label^="Conversation"] p'); return e ? e.innerText : ''; });
      console.log('  dlg-end:', p.replace(/\s+/g, ' '));
      await clk(find('^Farewell$'), 1400); continue;
    }
    if (find('Leave him to it')) { console.log('  dewey:', b.slice(b.indexOf('Dewey'), b.indexOf('Dewey') + 200)); await clk(find('Leave him to it'), 1400); continue; }

    // word web
    if (/Weave the sixteen/.test(b) && find('^Weave$')) {
      const tiles = bs.filter(x => /^[A-Z]{2,}$/.test(x.l));
      const board = S.webByWords(tiles.map(x => x.l));
      if (!board) { console.log('  !! unknown board, leaving'); await clk(find('Leave it for tomorrow'), 1800); continue; }
      console.log('  [WEB]', board.id, board.groups.map(g => g.tier + ':' + g.theme).join(' | '));
      for (const g of board.groups) {
        for (const w of g.words) { const c = (await btns()).find(x => x.l === w); if (c) { await page.mouse.click(c.x, c.y); await page.waitForTimeout(200); } }
        const wv = (await btns()).find(x => x.l === 'Weave'); if (wv) await clk(wv, 1700);
        const nb = await btns(); const nm = nb.find(x => x.l === g.theme); if (nm) await clk(nm, 2200);
      }
      await page.waitForTimeout(3500);
      continue;
    }
    if (find('Step back out')) { console.log('  ROOM DONE:', b.slice(0, 220)); await h.shot('done-t' + t); await clk(find('Step back out'), 2000); continue; }
    if (find('Develop the print')) {
      const ct = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Cipher letter"]')].map(e => e.getAttribute('aria-label').match(/Cipher letter (\w)/)[1]).join(''));
      const p = S.CIPHER.find(c => c.ciphertext.replace(/[^A-Z]/g, '') === ct);
      if (!p) { await clk(find('Leave it for tomorrow'), 1800); continue; }
      console.log('  [CIPHER]', JSON.stringify(p.plaintext));
      const map = {}; const A = p.ciphertext.replace(/[^A-Z]/g, ''), B = p.plaintext.replace(/[^A-Z]/g, '');
      for (let i = 0; i < A.length; i++) map[A[i]] = B[i];
      for (let i = 0; i < 40; i++) {
        const slot = await page.evaluate(() => { const el = [...document.querySelectorAll('[aria-label^="Cipher letter"]')].find(x => /blank/.test(x.getAttribute('aria-label'))); if (!el) return null; const r = el.getBoundingClientRect(); return { l: el.getAttribute('aria-label'), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
        if (!slot) break;
        const c = slot.l.match(/Cipher letter (\w)/)[1];
        await page.mouse.click(slot.x, slot.y); await page.waitForTimeout(150);
        const k = (await btns()).find(x => x.l === 'Pencil ' + map[c]);
        if (!k) break;
        await page.mouse.click(k.x, k.y); await page.waitForTimeout(150);
      }
      const d = (await btns()).find(x => /Develop the print/.test(x.l));
      if (d) await clk(d, 3500);
      continue;
    }
    if (find('Smooth a crease')) {
      const clues = bs.filter(x => /^\d+[AD] /.test(x.l)).map(x => x.l.replace(/^\d+[AD]\s*/, ''));
      const pz = S.CROSSWORD.find(c => c.entries.length === clues.length && c.entries.every(e => clues.includes(e.clue)));
      if (!pz) { console.log('  !! crossword unknown', JSON.stringify(clues)); await clk(find('Leave it for tomorrow'), 1800); continue; }
      console.log('  [CROSSWORD]', pz.id, pz.entries.map(e => e.clue + '=' + e.answer).join(' | '));
      for (const e of pz.entries) {
        const cl = (await btns()).find(x => x.l.includes(e.clue));
        if (cl) { await page.mouse.click(cl.x, cl.y); await page.waitForTimeout(500); }
        for (const ch of e.answer) { const k = (await btns()).find(x => x.l === ch); if (k) { await page.mouse.click(k.x, k.y); await page.waitForTimeout(140); } }
        await page.waitForTimeout(600);
      }
      await page.waitForTimeout(3000);
      const st = await body();
      console.log('  after fill:', st.slice(0, 200));
      continue;
    }
    if (find('Approach the Sanctum')) { console.log('  SANCTUM!'); await h.shot('sanctum-t' + t); await clk(find('Approach the Sanctum'), 3000); continue; }
    if (find('sealed page|Read the page|Unseal|Take the page')) { const c = find('sealed page|Read the page|Unseal|Take the page'); console.log('  FRAGMENT UI:', c.l); await clk(c, 2500); continue; }
    if (find('^Claim$')) {
      const cells = bs.filter(x => /^[A-Z]$/.test(x.l)).sort((a, b2) => a.y - b2.y || a.x - b2.x);
      if (cells.length !== 25) { await clk(find('Leave it for tomorrow'), 1800); continue; }
      const grid = cells.map(c => c.l);
      const pz = S.TWISTLE.find(t => t.grid.join('') === grid.join(''));
      if (!pz) { console.log('  !! twistle unknown'); await clk(find('Leave it for tomorrow'), 1800); continue; }
      console.log('  [TWISTLE]', pz.id, 'need', pz.targetCount, 'of', pz.targetWords.length);
      const idx = (r, c) => r * 5 + c;
      const path = (word) => {
        const res = [];
        const dfs = (r, c, i, used) => {
          if (grid[idx(r, c)] !== word[i]) return false;
          used.push(idx(r, c));
          if (i === word.length - 1) { res.push(...used); return true; }
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr > 4 || nc < 0 || nc > 4) continue;
            if (used.includes(idx(nr, nc))) continue;
            if (dfs(nr, nc, i + 1, used)) return true;
          }
          used.pop(); return false;
        };
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { if (dfs(r, c, 0, [])) return res; }
        return null;
      };
      let got = 0;
      for (const w of pz.targetWords.slice().sort((a, b2) => a.length - b2.length)) {
        if (got >= pz.targetCount) break;
        const p = path(w);
        if (!p) continue;
        for (const i of p) { await page.mouse.click(cells[i].x, cells[i].y); await page.waitForTimeout(120); }
        const cl = (await btns()).find(x => x.l === 'Claim');
        if (cl) { await page.mouse.click(cl.x, cl.y); await page.waitForTimeout(900); got++; console.log('    +', w); }
      }
      await page.waitForTimeout(3000);
      continue;
    }
    if (/hive/.test(b) || find('Shuffle petals')) { console.log('  [HIVE] leaving'); await clk(find('Leave it for tomorrow'), 1800); continue; }

    // draft
    const draft = bs.filter(x => /^Draft a room/.test(x.l)).sort((a, b2) => a.y - b2.y)[0];
    if (draft) {
      await clk(draft, 1800);
      const cards = (await btns()).filter(x => /tiers/.test(x.l));
      console.log('  CARDS:', JSON.stringify(cards.map(c => c.l)));
      const pick = cards.find(c => new RegExp(PREFER).test(c.l)) || cards[0];
      if (pick) { console.log('  -> ' + pick.l.split('\n')[0].slice(0, 40)); await clk(pick, 3200); }
      continue;
    }
    const walk = bs.find(x => /^Walk to/.test(x.l));
    const enter = bs.find(x => /Enter this room|^Enter$/.test(x.l));
    if (enter) { await clk(enter, 2500); continue; }
    if (walk) { await clk(walk, 1500); continue; }
    console.log('  STOP. controls:', JSON.stringify(bs.map(x => x.l)));
    await h.shot('auto-stop-' + t);
    break;
  }
});
