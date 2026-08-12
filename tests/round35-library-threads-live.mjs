/**
 * ROUND 35 live evidence — WHAT THE NEW SENTENCE DOES TO THE BOARD UNDER IT.
 *
 * The round put two new relations in the Library's mouth (`semantic`, which
 * now NAMES the category, and `compound`, which names the frame). The
 * named-category line is by a long way the longest copy this room has ever
 * printed — 90 characters against a shelf maximum of 55 before it — and it
 * lands in `.anch-toastslot`, a RESERVED slot that exists precisely so the
 * board never jumps when a reply appears (AAA 1.5). Nothing in 1,390 unit
 * tests looks at a screen, so this drives a real wrong guess onto the new
 * thread and measures the geometry it leaves behind.
 *
 * IT MEASURES THE OLD COPY THE SAME WAY, ON THE SAME BOARD AND THE SAME
 * VIEWPORT (standing rule 1: an instrument that can tell a new defect from a
 * standing one). If the old relations move the board too, this round did not
 * cause it; if only the new one does, this round did.
 *
 * The guess is built so the room takes the `wrong` branch and not `one-away`:
 * two of the trap's owning group + the interloper + one outsider, which is
 * three tiles inside one trap (`matchHerring`) and only two inside any group.
 *
 * System Edge, one browser, closed in a finally. 375x667 first, then 390x844.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POOL = JSON.parse(readFileSync(resolve(ROOT, 'content/generated/word-web.json'), 'utf8'));
const byId = new Map(POOL.map((p) => [p.id, p]));
const NEW_RELATIONS = new Set(['semantic', 'compound']);
/** `--prove`: pad the worst sentence past the budget and watch the check fail. */
const PROVE = process.argv.includes('--prove');

/** `herring-line.ts`, in the harness's own words, over HER tiles in HER order. */
function lineOf(h, matched) {
  const subj = matched.length >= 4 ? 'All four of these' : matched.join(', ');
  switch (h.relation) {
    case 'rhyme': return `${subj} do rhyme. But no.`;
    case 'shared-affix': return h.detail ? `${subj} carry “${h.detail}”. But no.` : null;
    case 'hidden-string': return h.detail ? `${subj} hide “${h.detail}”. But no.` : null;
    case 'doubled-letter': return h.detail ? null : null;
    case 'compound': return h.detail ? `${subj} do go with “${h.detail}”. But no.` : null;
    case 'semantic': return h.detail ? `${subj} do belong under “${h.detail}”. But no.` : null;
    default: return null;
  }
}

/**
 * The longest thread of the requested kind on a board, and a guess that lands
 * on it: two of its owning group, the interloper, one outsider.
 */
function planFor(board, wantNew) {
  let best = null;
  for (const h of board.herrings ?? []) {
    if (NEW_RELATIONS.has(h.relation) !== wantNew) continue;
    const owner = board.groups.find((g) => g.words.every((w) => h.words.includes(w)));
    if (!owner || owner.words.length !== 4 || h.words.length !== 5) continue;
    const intruder = h.words.find((w) => !owner.words.includes(w));
    const outsider = board.groups.flatMap((g) => g.words)
      .find((w) => !h.words.includes(w) && !owner.words.includes(w));
    if (!intruder || !outsider) continue;
    const pick = [owner.words[0], owner.words[1], intruder, outsider];
    const text = lineOf(h, pick.filter((w) => h.words.includes(w)));
    if (!text) continue;
    if (!best || text.length > best.text.length) best = { h, text, pick };
  }
  return best;
}

/** Boards that can show BOTH kinds — the only ones where the comparison holds. */
const COMPARABLE = POOL.filter((p) => planFor(p, true) && planFor(p, false));
const RANKED = [...COMPARABLE].sort(
  (a, b) => planFor(b, true).text.length - planFor(a, true).text.length,
).map((p) => p.id);
const TARGET = new Set(RANKED.slice(0, 30));
const LONGEST = Math.max(...POOL.map((p) => planFor(p, true)?.text.length ?? 0));
const LONGEST_OLD = Math.max(...POOL.map((p) => planFor(p, false)?.text.length ?? 0));
console.log(`[r35] ${COMPARABLE.length} of ${POOL.length} boards can show both an old thread and a new one`);
console.log(`[r35] longest line: new relations ${LONGEST} chars, old relations ${LONGEST_OLD} chars`);

async function freePort(from = 5561, to = 5620) {
  for (let p = from; p <= to; p += 1) {
    // eslint-disable-next-line no-await-in-loop
    const taken = await new Promise((res) => {
      const s = createServer();
      s.once('error', () => res(true));
      s.once('listening', () => s.close(() => res(false)));
      s.listen(p, '127.0.0.1');
    });
    if (!taken) return p;
  }
  throw new Error('no free port');
}
const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--config', resolve(ROOT, 'scripts/gate-vite.config.ts'),
    '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
const up = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 90000);
  server.stdout.on('data', (b) => {
    if (String(b).includes('ready in') || String(b).includes('Local:')) { clearTimeout(t); res(); }
  });
  server.on('exit', (c) => { clearTimeout(t); rej(new Error(`vite exited ${c}`)); });
});

const GEOMETRY = () => {
  const slot = document.querySelector('.anch-toastslot');
  const bit = document.querySelector('.anch-toast__bit');
  const tile = document.querySelector('.ww-tile');
  const deck = document.querySelector('.room-deck');
  let ancestorClip = 0;
  if (bit) {
    const r = bit.getBoundingClientRect();
    for (let p = bit.parentElement; p; p = p.parentElement) {
      const pr = p.getBoundingClientRect();
      const cs = getComputedStyle(p);
      if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
        ancestorClip = Math.max(
          ancestorClip, Math.ceil(r.bottom - pr.bottom), Math.ceil(pr.top - r.top),
        );
      }
    }
  }
  return {
    slot: slot ? Math.round(slot.getBoundingClientRect().height) : -1,
    bitText: bit ? bit.textContent.trim() : null,
    bitHeight: bit ? Math.round(bit.getBoundingClientRect().height) : 0,
    bitClip: bit ? Math.max(bit.scrollHeight - bit.clientHeight, bit.scrollWidth - bit.clientWidth) : 0,
    ancestorClip,
    bitBottom: bit ? Math.round(bit.getBoundingClientRect().bottom) : 0,
    tileTop: tile ? Math.round(tile.getBoundingClientRect().top) : -1,
    deckTop: deck ? Math.round(deck.getBoundingClientRect().top) : -1,
    docX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyX: document.body.scrollWidth - document.body.clientWidth,
    docY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    vh: window.innerHeight,
    // Who actually moved: every block between the stage top and the grid.
    chain: ['.room-host__stage', '.anch', '.anch__flavour', '.anch-toastslot', '.ww-board', '.ww-tile']
      .map((s) => {
        const el = document.querySelector(s);
        const r = el?.getBoundingClientRect();
        return `${s}=${r ? `${Math.round(r.top)}/${Math.round(r.height)}` : 'none'}`;
      }).join(' '),
  };
};

let browser;
let failures = 0;
try {
  await up;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const [w, h] of [[375, 667], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 60000 });

    const seat = async (sd, row) => {
      await page.evaluate(([seed, rw]) => {
        const store = window.__manorStore;
        store.setState({
          day: { day: 1, phase: 'exploring', daySeed: seed, activeRoom: null },
          ledger: { budget: 30, entries: [] },
          manor: {
            rooms: { '2,5': { cardId: 'live-word-web', cell: { col: 2, row: rw }, doors: ['S'], solved: false, kind: 'word-web' } },
            playerCell: { col: 2, row: rw },
            daySeed: seed,
          },
        });
        store.getState().enterRoom('2,5');
        location.hash = '#/room';
      }, [sd, row]);
      await sleep(250);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 60000 });
      await page.waitForSelector('.room-host__stage', { timeout: 20000 });
      await sleep(500);
      return page.evaluate(() => window.__manorStore.getState().manor.rooms['2,5']?.session?.puzzleId ?? null);
    };

    let landed = null;
    let used = null;
    outer: for (const row of [3, 5, 7]) {
      for (const sd of [424242, 7, 11, 23, 41, 59, 83, 97, 131, 157, 181, 199, 233, 271, 313, 347, 389, 421]) {
        // eslint-disable-next-line no-await-in-loop
        const got = await seat(sd, row);
        if (TARGET.has(got)) { landed = got; used = [sd, row]; break outer; }
      }
    }
    if (!landed) {
      console.log(`[r35] ${w}x${h} NO COMPARABLE BOARD REACHED`);
      failures += 1;
      await ctx.close();
      continue;
    }
    console.log(`[r35] ${w}x${h} seed ${used[0]}@row${used[1]} -> ${landed}`);

    /** Seat the board fresh, make the planned guess, and read the geometry. */
    const probe = async (plan, label) => {
      await seat(used[0], used[1]);
      const before = await page.evaluate(GEOMETRY);
      for (const word of plan.pick) {
        const loc = page.locator('.ww-tile', { hasText: new RegExp(`^${word}$`, 'i') }).first();
        // eslint-disable-next-line no-await-in-loop
        const box = await loc.boundingBox();
        if (!box) continue;
        // The game commits on pointerdown/pointerup — element.click() drives
        // nothing. Real mouse input only.
        // eslint-disable-next-line no-await-in-loop
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        // eslint-disable-next-line no-await-in-loop
        await page.mouse.down(); await sleep(40); await page.mouse.up(); await sleep(140);
      }
      const weave = await page.locator('button', { hasText: /^Weave$/ }).first().boundingBox();
      await page.mouse.move(weave.x + weave.width / 2, weave.y + weave.height / 2);
      await page.mouse.down(); await sleep(40); await page.mouse.up();
      // `submit` holds for the hop stagger before it dispatches.
      await sleep(2600);
      const after = await page.evaluate(GEOMETRY);
      const grew = after.slot - before.slot;
      const shiftTile = Math.abs(after.tileTop - before.tileTop);
      const shiftDeck = Math.abs(after.deckTop - before.deckTop);
      console.log(`[r35]   ${label} (${plan.h.relation}, ${plan.text.length} chars) ${JSON.stringify(after.bitText)}`);
      console.log(`[r35]     chain before: ${before.chain}`);
      console.log(`[r35]     chain after : ${after.chain}`);
      console.log(`[r35]     slot ${before.slot} -> ${after.slot} (+${grew}), bit ${after.bitHeight}px, clip ${after.bitClip}/${after.ancestorClip}, board shift ${shiftTile}px, deck shift ${shiftDeck}px, overflow x=${after.docX}/${after.bodyX} y=${after.docY}`);
      await page.screenshot({ path: resolve(ROOT, `.critic/r35-library-${label}-${w}x${h}.png`) });
      return { before, after, grew, shiftTile, shiftDeck };
    };

    const board = byId.get(landed);
    const newPlan = planFor(board, true);
    const oldPlan = planFor(board, false);
    const nu = await probe(newPlan, 'new');
    const old = await probe(oldPlan, 'old');

    /**
     * THE WORST SENTENCE THE SHELF CAN PRINT, in the real cascade at the real
     * width. Seeds cannot be steered onto a chosen board, so the longest line
     * on the whole shelf is measured by cloning the LIVE `.anch-toast__bit`
     * that the guess above just produced and swapping only its text: same
     * element, same computed font, same container, same viewport.
     */
    const worst = POOL.flatMap((p) => (p.herrings ?? [])
      .filter((x) => NEW_RELATIONS.has(x.relation))
      .map((x) => lineOf(x, x.words.slice(0, 3))))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0];
    const worstOld = POOL.flatMap((p) => (p.herrings ?? [])
      .filter((x) => !NEW_RELATIONS.has(x.relation))
      .map((x) => lineOf(x, x.words.slice(0, 3))))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0];
    /**
     * PROVE IT GOES RED (standing rule 1). `--prove` pads the worst NEW
     * sentence by one line's worth of characters and nothing else; the check
     * below must then fail, which is how we know it is capable of failing on
     * the thing it forbids.
     */
    const padded = PROVE ? `${worst} ${'the same again '.repeat(4)}` : worst;
    const wrap = await page.evaluate(([longest, longestOld]) => {
      const bit = document.querySelector('.anch-toast__bit');
      if (!bit) return null;
      const was = bit.textContent;
      const measure = (t) => { bit.textContent = t; return Math.round(bit.getBoundingClientRect().height); };
      const one = measure('x');
      const out = { one, worst: measure(longest), worstOld: measure(longestOld) };
      bit.textContent = was;
      return out;
    }, [padded, worstOld]);
    console.log(`[r35]   worst-case wrap: one line ${wrap.one}px; longest NEW ${padded.length} chars -> ${wrap.worst}px (${Math.round(wrap.worst / wrap.one)} lines); longest OLD ${worstOld.length} chars -> ${wrap.worstOld}px (${Math.round(wrap.worstOld / wrap.one)} lines)`);
    if (Math.round(wrap.worst / wrap.one) > Math.round(wrap.worstOld / wrap.one)) {
      console.log('[r35]   THE NEW COPY TAKES MORE LINES THAN ANY THE ROOM ALREADY PRINTS');
      failures += 1;
    }

    /**
     * WHAT THIS ROUND IS ANSWERABLE FOR. The board jump below is measured on
     * BOTH kinds of thread and is the same size on both, on a build whose diff
     * touches no CSS, no layout and no view — so it is a standing defect, not
     * this round's, and it is REPORTED rather than pinned here (a gate that
     * fails on something the round cannot cause teaches nothing). What the
     * round must not do is print copy that costs MORE LINES than the copy the
     * room already prints, and that is asserted on the worst sentence the
     * whole shelf can produce, measured above in the live cascade.
     */
    if (nu.after.bitText !== newPlan.text) { console.log(`[r35]   NEW BIT IS NOT THE PLANNED SENTENCE (wanted ${JSON.stringify(newPlan.text)})`); failures += 1; }
    if (old.after.bitText !== oldPlan.text) { console.log(`[r35]   OLD BIT IS NOT THE PLANNED SENTENCE (wanted ${JSON.stringify(oldPlan.text)})`); failures += 1; }
    for (const [label, m] of [['new', nu], ['old', old]]) {
      if (m.after.bitClip > 0 || m.after.ancestorClip > 0) { console.log(`[r35]   ${label.toUpperCase()}: THE SENTENCE IS CLIPPED`); failures += 1; }
      if (m.after.bitBottom > m.after.vh) { console.log(`[r35]   ${label.toUpperCase()}: THE SENTENCE IS BELOW THE FOLD`); failures += 1; }
      if (m.after.docX > 0 || m.after.bodyX > 0 || m.after.docY > 0) { console.log(`[r35]   ${label.toUpperCase()}: SCROLLS`); failures += 1; }
    }
    if (nu.shiftTile > old.shiftTile + 2) {
      console.log(`[r35]   THE NEW THREAD MOVES THE BOARD FURTHER THAN THE OLD ONES (${nu.shiftTile}px vs ${old.shiftTile}px)`);
      failures += 1;
    }
    console.log(`[r35]   STANDING FINDING (not this round's — the diff touches no CSS or view): a wrong guess that names a thread grows the reserved slot by ${nu.grew}px on the new relations and ${old.grew}px on the old ones, and the board moves ${nu.shiftTile}px / ${old.shiftTile}px under her either way.`);
    if (errors.length) { console.log('[r35]   ERRORS', errors.slice(0, 3)); failures += 1; }
    await ctx.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(failures === 0 ? '[r35] LIVE PASS CLEAN' : `[r35] ${failures} LIVE FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
