/** ROUND 10 — Counting House height/width budget. ONE msedge instance. */
import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://localhost:5741/LexiconManor/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const sleep = (ms) => page.waitForTimeout(ms);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
    await sleep(500);
    for (let i = 0; i < 80; i++) {
      const st = await page.evaluate(() => {
        const s = window.__manorStore?.getState();
        return { phase: s?.day?.phase ?? null, hasManor: !!s?.manor };
      });
      if (st.phase === 'exploring' && st.hasManor) break;
      if (await page.$('.dlg')) {
        const p = await page.$('.dlg-choice--primary');
        if (p) await p.click();
        else {
          const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
          if (c) await c.click(); else await page.dispatchEvent('.dlg__sheet', 'pointerdown');
        }
        await sleep(200); continue;
      }
      const skip = await page.$('.chr-dusk__skip'); if (skip) { await skip.click(); await sleep(400); continue; }
      const btn = await page.$('.chr-scene__btn'); if (btn) { await btn.click(); await sleep(400); continue; }
      const any = await page.$('button'); if (any && st.phase === null) { await any.click(); await sleep(400); continue; }
      await sleep(250);
    }
    await page.evaluate(() => {
      const st = window.__manorStore.getState();
      const cell = { col: 5, row: 2 }; const key = `${cell.col},${cell.row}`;
      window.__manorStore.setState({ manor: { ...st.manor, playerCell: cell,
        rooms: { ...st.manor.rooms, [key]: { cardId: 'counting-house', cell, doors: ['N','S','E','W'], solved: false, kind: 'sudoku' } } } });
      window.__manorStore.getState().enterRoom(key);
    });
    await page.waitForSelector('.ch-cell', { timeout: 10000 });
    await sleep(500);
    const m = await page.evaluate(() => {
      const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
        return { y: +r.y.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1), bottom: +r.bottom.toFixed(1) }; };
      const stage = document.querySelector('.room-host__stage');
      const cs = getComputedStyle(document.querySelector('.ch'));
      return {
        stage: { clientH: stage.clientHeight, scrollH: stage.scrollHeight, w: +stage.getBoundingClientRect().width.toFixed(1),
                 top: +stage.getBoundingClientRect().top.toFixed(1) },
        ch: b('.ch'), chPad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
        chGap: cs.rowGap,
        head: b('.ch__head'), leaf: b('.ch-leaf'), cell: b('.ch-cell'),
        toast: b('.ch-toastslot'), deck: b('.room-deck'), toolbar: b('.ch-toolbar'), pad: b('.ch-pad'),
        key: b('.ch-key'), footer: b('.room-host__footer'),
        rootFont: getComputedStyle(document.documentElement).fontSize,
      };
    });
    const slack = m.stage.clientH - (m.stage.scrollH);
    console.log(JSON.stringify({ vp, slack, ...m }, null, 1));
    await ctx.close();
  }
} finally { await browser.close(); }
