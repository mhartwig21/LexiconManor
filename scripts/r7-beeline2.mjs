/**
 * Round-7 critic, take 2: a real greedy climber on day 1, through the live
 * store — BFS over placed rooms to the best frontier door, draft, repeat.
 * Two modes: SOLVE=0 (never solve a puzzle) and SOLVE=1 (auto-credit solves
 * through the store's own solve path is not attempted; instead we simply take
 * every utility refund the deck offers, i.e. still no puzzle skill required).
 * ONE browser instance, system Edge, closed in a finally.
 */
import { chromium } from 'playwright';
const BASE = 'http://localhost:5233/LexiconManor/';
const RUNS = Number(process.env.RUNS || 20);
const DAYS = Number(process.env.DAYS || 1);

const play = async (page, days) => page.evaluate(async (days) => {
  const store = window.__manorStore;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const s = () => store.getState();
  const key = (c) => `${c.col},${c.row}`;
  const DIRS = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
  const out = [];

  for (let day = 1; day <= days; day++) {
    if (!s().day || s().day.phase === 'night') s().startDay();
    for (let i = 0; i < 8 && s().day?.phase !== 'exploring'; i++) { s().advanceDayPhase(); await sleep(20); }
    let reachedDoor = false, maxRow = 0, refusals = 0, drafts = 0;
    for (let iter = 0; iter < 120; iter++) {
      const st = s();
      if (st.day?.phase !== 'exploring') break;
      const manor = st.manor; if (!manor) break;
      const p = manor.playerCell;
      maxRow = Math.max(maxRow, p.row);
      const here = manor.rooms[key(p)];
      if (p.col === 2 && p.row === 5 && here?.doors.includes('N')) { reachedDoor = true; break; }
      // BFS over placed rooms through connecting doors
      const start = key(p);
      const prev = { [start]: null };
      const q = [p];
      const frontier = [];   // {from, dir, target}
      while (q.length) {
        const c = q.shift();
        const room = manor.rooms[key(c)];
        if (!room) continue;
        for (const d of room.doors) {
          const [dx, dy] = DIRS[d];
          const n = { col: c.col + dx, row: c.row + dy };
          if (n.col < 0 || n.col > 4 || n.row < 0 || n.row > 6) continue;
          const nk = key(n);
          const nroom = manor.rooms[nk];
          if (!nroom) { frontier.push({ from: c, dir: d, target: n }); continue; }
          // must connect both ways
          const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[d];
          if (!nroom.doors.includes(back)) continue;
          if (nk in prev) continue;
          prev[nk] = key(c);
          q.push(n);
        }
      }
      if (!frontier.length) break;
      frontier.sort((a, b) => (b.target.row - a.target.row) ||
        (Math.abs(a.target.col - 2) - Math.abs(b.target.col - 2)));
      const pick = frontier[0];
      // walk to pick.from
      const path = [];
      let cur = key(pick.from);
      while (cur && cur !== start) { path.unshift(cur); cur = prev[cur]; }
      for (const step of path) {
        const [col, row] = step.split(',').map(Number);
        s().moveTo({ col, row }); await sleep(15);
        if (s().day?.phase !== 'exploring') break;
      }
      if (s().day?.phase !== 'exploring') break;
      const before = s().stepsRemaining();
      s().openDraft(pick.dir); await sleep(20);
      const offer = s().draftOffer;
      if (!offer) {
        const charged = before - s().stepsRemaining();
        refusals++;
        if (charged !== 0) out.push(`!! refusal charged ${charged}`);
        // mark this frontier as impassable by walking away; if we cannot make
        // progress twice in a row, stop.
        if (refusals > 8) break;
        // try the next-best frontier next iteration by drafting elsewhere:
        const alt = frontier.find(f => f !== pick && !(f.target.row >= 4));
        if (!alt) break;
        for (const dir of [alt.dir]) {
          const p2 = [];
          let c2 = key(alt.from);
          while (c2 && c2 !== key(s().manor.playerCell)) { p2.unshift(c2); c2 = prev[c2]; }
          for (const step of p2) { const [col, row] = step.split(',').map(Number); s().moveTo({ col, row }); await sleep(15); }
          s().openDraft(dir); await sleep(20);
        }
        if (!s().draftOffer) continue;
      }
      const off = s().draftOffer;
      if (!off) continue;
      const card = off.cards.find(c => c.gemCost <= s().currencies.gems) || off.cards[0];
      s().chooseDraftCard(card.id); await sleep(25);
      drafts++;
      if (s().day?.activeRoom) { s().leaveRoom(); await sleep(20); }
    }
    const end = s();
    out.push({
      day, reachedDoor, maxRow: Math.max(maxRow, end.manor?.playerCell.row ?? 0),
      stepsLeft: end.stepsRemaining(), keys: end.currencies.keys, refusals, drafts,
      phase: end.day?.phase,
    });
    // roll to the next day
    if (s().day && s().day.phase !== 'night') s().endDay('retired-early');
    await sleep(30);
    for (let i = 0; i < 4 && s().day?.phase !== 'night'; i++) { s().advanceDayPhase(); await sleep(20); }
  }
  return out;
}, days);

const browser = await chromium.launch({ channel: 'msedge' });
const all = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (let i = 0; i < RUNS; i++) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
    await page.waitForTimeout(250);
    const r = await play(page, DAYS);
    for (const rec of r) {
      if (typeof rec === 'string') { console.log('[r7]', rec); continue; }
      all.push(rec);
      console.log(`[r7] run${i} day${rec.day}: door=${rec.reachedDoor} maxRow=${rec.maxRow} left=${rec.stepsLeft} drafts=${rec.drafts} refusals=${rec.refusals} keys=${rec.keys}`);
    }
  }
} finally { await browser.close(); }
const byDay = {};
for (const r of all) { (byDay[r.day] ||= []).push(r); }
for (const d of Object.keys(byDay)) {
  const rs = byDay[d];
  console.log(`--- day ${d}: door reached ${rs.filter(r => r.reachedDoor).length}/${rs.length}; maxRow dist ${JSON.stringify(rs.reduce((m, r) => (m[r.maxRow] = (m[r.maxRow] || 0) + 1, m), {}))}`);
}
