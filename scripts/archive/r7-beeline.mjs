/**
 * Round-7 critic: BEELINE to the Sanctum door on day 1, through the real store
 * (real drafting, real locks, real ledger). Puzzles are never solved — the
 * weakest possible play — so anything reached here is reached on the budget
 * alone. ONE browser instance, system Edge, closed in a finally.
 */
import { chromium } from 'playwright';
const BASE = 'http://localhost:5233/LexiconManor/';
const RUNS = Number(process.env.RUNS || 24);

const beeline = async (page) => page.evaluate(async () => {
  const store = window.__manorStore;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const s = () => store.getState();
  // force the day into exploring without touching the economy
  if (!s().day) s().startDay();
  for (let i = 0; i < 6 && s().day?.phase !== 'exploring'; i++) { s().advanceDayPhase(); await sleep(30); }
  const log = [];
  let reachedDoor = false, maxRow = 0, refusedAt = [];
  for (let i = 0; i < 40; i++) {
    const st = s();
    if (st.day?.phase !== 'exploring') break;
    const manor = st.manor; if (!manor) break;
    const p = manor.playerCell;
    maxRow = Math.max(maxRow, p.row);
    const here = manor.rooms[`${p.col},${p.row}`];
    // at the Sanctum landing with a north door?
    if (p.col === 2 && p.row === 5 && here && here.doors.includes('N')) { reachedDoor = true; break; }
    const before = st.stepsRemaining();
    // 1) prefer drafting north
    const north = manor.rooms[`${p.col},${p.row + 1}`];
    if (here && here.doors.includes('N') && !north && p.row < 6) {
      s().openDraft('N');
      await sleep(20);
      const offer = s().draftOffer;
      if (!offer) { refusedAt.push([`${p.col},${p.row + 1}`, before - s().stepsRemaining()]); }
      else {
        const card = offer.cards.find(c => c.gemCost <= s().currencies.gems) || offer.cards[0];
        s().chooseDraftCard(card.id);
        await sleep(30);
        if (s().day?.activeRoom) { s().leaveRoom(); await sleep(20); }
        log.push(`draft N -> ${card.id}`);
        continue;
      }
    }
    // 2) else walk toward column 2 / upward through existing rooms
    const cands = [];
    for (const key of Object.keys(manor.rooms)) {
      const r = manor.rooms[key];
      if (r.cell.row === 6) continue;
      const dc = Math.abs(r.cell.col - p.col) + Math.abs(r.cell.row - p.row);
      if (dc !== 1) continue;
      cands.push(r.cell);
    }
    // prefer a neighbour that has an unbuilt north cell
    cands.sort((a, b) => (b.row - a.row) || (Math.abs(a.col - 2) - Math.abs(b.col - 2)));
    let moved = false;
    for (const c of cands) {
      const roomHere = manor.rooms[`${c.col},${c.row}`];
      const above = manor.rooms[`${c.col},${c.row + 1}`];
      if (!roomHere || !roomHere.doors.includes('N') || above) continue;
      s().moveTo(c); await sleep(20);
      if (s().manor.playerCell.col === c.col && s().manor.playerCell.row === c.row) { moved = true; log.push(`walk ${c.col},${c.row}`); break; }
    }
    if (!moved) {
      // any lateral draft that exists
      let opened = false;
      for (const dir of ['E', 'W', 'N', 'S']) {
        s().openDraft(dir); await sleep(20);
        if (s().draftOffer) {
          const offer = s().draftOffer;
          const card = offer.cards.find(c => c.gemCost <= s().currencies.gems) || offer.cards[0];
          s().chooseDraftCard(card.id); await sleep(30);
          if (s().day?.activeRoom) { s().leaveRoom(); await sleep(20); }
          opened = true; log.push(`draft ${dir}`);
          break;
        }
      }
      if (!opened) break;
    }
  }
  const end = s();
  return {
    reachedDoor, maxRow: Math.max(maxRow, end.manor?.playerCell.row ?? 0),
    stepsLeft: end.stepsRemaining(), phase: end.day?.phase, keys: end.currencies.keys,
    refusedAt, log,
  };
});

const browser = await chromium.launch({ channel: 'msedge' });
const res = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (let i = 0; i < RUNS; i++) {
    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
    await page.waitForTimeout(250);
    const r = await beeline(page);
    res.push(r);
    console.log(`[r7] run${i}: door=${r.reachedDoor} maxRow=${r.maxRow} stepsLeft=${r.stepsLeft} phase=${r.phase} refused=${JSON.stringify(r.refusedAt)}`);
  }
} finally { await browser.close(); }
const hits = res.filter(r => r.reachedDoor).length;
console.log(`--- DAY-1 SANCTUM DOOR (no puzzle solved, budget alone): ${hits}/${res.length}`);
console.log('maxRow distribution:', JSON.stringify(res.reduce((m, r) => (m[r.maxRow] = (m[r.maxRow] || 0) + 1, m), {})));
