/**
 * tests/round54-leads-live.mjs — OWNER: A6 (Dialogue) × A7 (Mystery).
 * THE LIVE EVIDENCE that somebody tells her where to look, and that going
 * there pays.
 *
 * ═══ WHY THIS GATE EXISTS ══════════════════════════════════════════════════
 *
 * THE OWNER'S RULING, 13 Aug (docs/LEADS.md):
 *
 *   *"I am okay with a hint saying... draft the library, the old codger left an
 *    important document on the shelves there, worth a read... and the player
 *    then saying oh shit, I need to go to the library and solve it. But then
 *    also getting the reward and seeing the connection."*
 *
 * Two halves, and this file is the only place both are checked ON THE GLASS:
 *
 *   1. THE LEAD IS PAINTED. *"Authored copy has shipped INVISIBLE here more
 *      than once"* — round 44 lost three rounds of craft to
 *      `@media (max-height: 700px) { .anch__flavour { display: none } }`, which
 *      deleted the only sentence stating what a study was for, at 375×667, on
 *      the phone the game is judged on. A lead that is not painted is not a
 *      lead. So: computed style, a real rect, INSIDE the viewport, at both
 *      sizes, driven by real pointer input through a real morning.
 *   2. THE LEAD IS HONEST, END TO END. Mrs. Bramble names the linen closet;
 *      the harness then solves a DIFFERENT word room first — spending the day's
 *      channel — walks into a Linen Closet, solves it, and requires a page.
 *      That is the exact sequence the promise exists for, and the exact
 *      sequence in which the previous build would have made her wrong.
 *
 * ═══ --prove: THE RED IS THE BUILD WITHOUT THE MECHANIC ════════════════════
 * `--prove` drives the same day with the lead SUPPRESSED — the scene is opened
 * on day 1, where no lead is eligible, and the second solve is credited without
 * anything having been said. Both `lead` checks must go RED: no lead line is
 * painted, and the second word room of the evening pays nothing. If either
 * survives, this file is reading something other than what it claims.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser instance,
 * closed in a finally. 375x667 FIRST, then 390x844.
 *
 * Run: `node tests/round54-leads-live.mjs [--prove]`
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROVE = process.argv.includes('--prove');

/**
 * WHAT THE LEAD SAYS, READ OFF THE AUTHORED JSON rather than typed here — the
 * same rule the attribution gate follows for room names. If the line is
 * rewritten this file follows it; if the lead is deleted this file fails to
 * build its own expectation rather than passing on a stale literal.
 */
function firstLeadOf(character) {
  const file = JSON.parse(
    readFileSync(resolve(ROOT, `content/authored/dialogue/${character}.json`), 'utf8'),
  );
  const node = file.nodes.find((n) => n.id.split('.')[1] === 'lead');
  if (!node) throw new Error(`${character} has no lead authored`);
  const words = (t) => t.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  // Every word this character says ANYWHERE ELSE — so the needle below is a
  // word only the lead can have painted. "something" is in her mouth eleven
  // times; "pressed" is in it once, and that is the difference between reading
  // the lead and reading the conversation it rode in on.
  const elsewhere = new Set(
    file.nodes.filter((n) => n.id !== node.id)
      .flatMap((n) => n.lines).flatMap((l) => words(l.text)),
  );
  const needle = node.lines.flatMap((l) => words(l.text))
    .filter((w) => w.length > 4 && !elsewhere.has(w))
    .sort((a, b) => b.length - a.length)[0];
  if (!needle) throw new Error(`${node.id} shares every word with the rest of ${character}.json`);
  return { id: node.id, cardId: node.id.split('.')[2], needle, lines: node.lines.map((l) => l.text) };
}
/** The deck's own words for a card — never a literal in this file. */
function deckNames() {
  const src = readFileSync(resolve(ROOT, 'src/engine/manor/deck.ts'), 'utf8');
  const out = new Map();
  for (const m of src.matchAll(/\{\s*id:\s*'([a-z0-9-]+)',\s*name:\s*'([^']+)'/g)) out.set(m[1], m[2]);
  if (out.size < 20) throw new Error(`deck parse found only ${out.size} cards`);
  return out;
}
const NAMES = deckNames();
const LEAD = firstLeadOf('bramble');
/** A word only the lead can have painted (derived above, never typed). */
const NEEDLE = LEAD.needle;

async function freePort(from = 5461, to = 5519) {
  for (let p = from; p <= to; p++) {
    let taken = false;
    for (const host of ['127.0.0.1', '::1', undefined]) {
      // eslint-disable-next-line no-await-in-loop
      taken = taken || await new Promise((res) => {
        const s = createServer();
        s.once('error', () => res(true));
        s.once('listening', () => s.close(() => res(false)));
        if (host) s.listen(p, host); else s.listen(p);
      });
    }
    if (!taken) return p;
  }
  throw new Error(`no free port in ${from}-${to}`);
}

const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;

const tag = PROVE ? '[leads:prove]' : '[leads]';
const log = (...a) => console.log(tag, ...a);
const ok = (m) => console.log(tag, '  ✓', m);
let failures = 0;
let reds = 0;
const fail = (m) => { console.error(tag, '  ✗ FAIL:', m); failures++; };
/**
 * TWO KINDS OF VERDICT (the round-49 lesson, kept):
 * `lead`      — a claim ABOUT THE MECHANIC. Green normally; RED under --prove,
 *               where no lead is spoken and nothing waives the valve.
 * `invariant` — a property the mechanic rides beside and must not break (the
 *               line fits the box; the scene still closes; no rule is printed).
 *               Asserted identically in both runs.
 */
const lead = (cond, good, bad) => {
  if (PROVE) {
    if (cond) fail(`stayed GREEN with no lead spoken: ${good}`);
    else { reds++; console.log(tag, '  ✓ RED as required:', bad); }
    return;
  }
  if (cond) ok(good); else fail(bad);
};
const invariant = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
const serverUp = new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error('vite did not start within 60s')), 60000);
  server.stdout.on('data', (b) => {
    if (String(b).includes('ready in') || String(b).includes('Local:')) { clearTimeout(timer); res(); }
  });
  server.stderr.on('data', (b) => process.stderr.write(`[vite] ${b}`));
  server.on('exit', (c) => { clearTimeout(timer); rej(new Error(`vite exited early (${c})`)); });
});

const SIZES = [{ w: 375, h: 667 }, { w: 390, h: 844 }];

/** The dialogue line as the player sees it — and whether it is really painted. */
const spoken = (page) => page.evaluate(() => {
  const box = document.querySelector('.dlg__text');
  if (!box) return null;
  const r = box.getBoundingClientRect();
  const cs = getComputedStyle(box);
  const sheet = document.querySelector('.dlg__sheet');
  return {
    text: (box.textContent || '').replace(/\s+/g, ' ').trim(),
    who: (document.querySelector('.dlg__nameplate')?.textContent || '').trim(),
    painted: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05
      && r.width > 0 && r.height > 0
      && r.top >= 0 && r.bottom <= window.innerHeight
      && r.left >= 0 && r.right <= window.innerWidth,
    // THE OWNER HATES SCROLLBARS: a line that fits only because its own box
    // scrolls has not been painted, it has been filed.
    scrolls: !!sheet && sheet.scrollHeight > sheet.clientHeight + 1,
  };
});

/** Tap the sheet until the typewriter has settled on the line it is on. */
async function settle(page) {
  for (let i = 0; i < 30; i++) {
    // eslint-disable-next-line no-await-in-loop
    const before = await spoken(page);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(120);
    // eslint-disable-next-line no-await-in-loop
    const after = await spoken(page);
    if (before && after && before.text === after.text && after.text.length > 0) return after;
  }
  return spoken(page);
}

/** Every line this conversation paints, in order, until it closes. */
async function readConversation(page, maxLines = 24) {
  const seen = [];
  for (let i = 0; i < maxLines; i++) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await page.$('.dlg'))) break;
    // eslint-disable-next-line no-await-in-loop
    const line = await settle(page);
    if (line && line.text && !seen.some((s) => s.text === line.text)) seen.push(line);
    // eslint-disable-next-line no-await-in-loop
    const primary = await page.$('.dlg-choice--primary');
    if (primary) break;               // the closing panel: the scene is done
    // eslint-disable-next-line no-await-in-loop
    const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    // eslint-disable-next-line no-await-in-loop
    if (choice) { await choice.click(); await page.waitForTimeout(200); continue; }
    // The game commits on pointerdown — element.click() drives nothing here.
    // eslint-disable-next-line no-await-in-loop
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(200);
  }
  return seen;
}

async function closeScene(page) {
  for (let i = 0; i < 40 && (await page.$('.dlg')); i++) {
    const primary = await page.$('.dlg-choice--primary');
    if (primary) { await primary.click(); await page.waitForTimeout(180); continue; }
    const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (choice) { await choice.click(); await page.waitForTimeout(180); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await page.waitForTimeout(160);
  }
}

/** Stand her in a real room of this card and walk in. */
const placeAndEnter = (page, cardId, kind, row) => page.evaluate(({ card, k, r }) => {
  const store = window.__manorStore;
  const s0 = store.getState();
  if (s0.day?.activeRoom) s0.leaveRoom();
  const s = store.getState();
  const cell = { col: s.manor.playerCell.col, row: r };
  const key = `${cell.col},${cell.row}`;
  store.setState({
    manor: {
      ...s.manor,
      playerCell: { ...cell },
      rooms: {
        ...s.manor.rooms,
        [key]: { cardId: card, cell, doors: ['N', 'S', 'E', 'W'], solved: false, kind: k },
      },
    },
  });
  const s2 = store.getState();
  s2.applyStepEntry({ reason: 'snack', delta: 200, at: Date.now() });
  s2.enterRoom(key);
  return key;
}, { card: cardId, k: kind, r: row });

/** Solve the room she is standing in, through the one seam every adapter uses. */
const solveHere = (page) => page.evaluate(() => {
  const s = window.__manorStore.getState();
  const before = s.volume.foundFragmentIds.length;
  s.applyRoomEvents([{ type: 'solved', perfect: false }], { status: 'solved', perfect: false });
  return { before, after: window.__manorStore.getState().volume.foundFragmentIds.length };
});

let browser;
try {
  await serverUp;
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const size of SIZES) {
    const label = `${size.w}x${size.h}`;
    log('─'.repeat(64));
    log(label, PROVE ? '(no lead spoken: the pre-round-54 evening)' : `needle “${NEEDLE}”`);
    const context = await browser.newContext({
      viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.bp-scene__title', { timeout: 20000 });
    await page.click('.bp-btn--seal');
    await page.waitForSelector('.chr-scene', { timeout: 8000 });

    /* ══ 1. THE MORNING, ON THE DAY A LEAD IS DUE ═══════════════════════════
       The lead is gated `day >= 2` and rides as a TAIL on whatever Mrs.
       Bramble was going to say anyway (ui/dialogue/DialogueScene.tsx), so the
       whole drive is: put the clock on day 2 and open her morning the way the
       card opens it. Under --prove the clock stays on day 1, where no lead is
       eligible — the same screen, the same taps, the same scene, minus the
       mechanic. */
    await page.evaluate((prove) => {
      const s = window.__manorStore.getState();
      if (!prove) {
        window.__manorStore.setState({
          day: { ...s.day, day: 2 },
          volume: { ...s.volume, day: 2 },
        });
      }
    }, PROVE);
    await page.click('.chr-scene__btn');
    await page.waitForSelector('.dlg', { timeout: 8000 });

    const lines = await readConversation(page);
    const leadLine = lines.find((l) => l.text.toLowerCase().includes(NEEDLE));
    lead(!!leadLine,
      `${label}: somebody mentions a place, unprompted, in her own voice — “${(leadLine?.text ?? '').slice(0, 64)}…”`,
      `${label}: no lead was spoken in the morning conversation (lines: ${JSON.stringify(lines.map((l) => l.text.slice(0, 28)))})`);

    if (leadLine) {
      invariant(leadLine.painted,
        `${label}: …and it is PAINTED, inside the viewport, whole`,
        `${label}: the lead is in the DOM and not on the glass (${JSON.stringify(leadLine)})`);
      invariant(!leadLine.scrolls,
        `${label}: …and its box does not scroll to fit it`,
        `${label}: the lead only fits because the sheet scrolls — the owner's one hard no`);
      invariant(/Bramble/i.test(leadLine.who),
        `${label}: …and it is a PERSON saying it (“${leadLine.who}”)`,
        `${label}: the lead was painted with no speaker — that is the interface talking`);
      // A lead names a place; it never states what the place is worth. The
      // build-time half of this is `leadProblems`; this is the painted half.
      invariant(!/\d/.test(leadLine.text)
        && !/\b(page|pages|step|steps|gem|gems)\b/i.test(leadLine.text),
        `${label}: …and it states no figure and no payout`,
        `${label}: the lead printed a rule: “${leadLine.text}”`);
      invariant(new RegExp(NAMES.get(LEAD.cardId).replace(/^The /, ''), 'i')
        .test(lines.map((l) => l.text).join(' ')),
        `${label}: …and it names the room she is being sent to`,
        `${label}: the lead named no room the deck has`);
    }

    await closeScene(page);
    await page.waitForFunction(
      () => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 },
    );

    /* ══ 2. THE HOUSE KEEPS ITS PROMISE ═════════════════════════════════════
       The hard case, and the only one worth driving: she does NOT go straight
       there. A Gallery is solved first, which spends the day's lintel channel,
       and only then does she walk into the room she was told about. Before
       round 54 that second solve paid nothing and Mrs. Bramble was wrong. */
    await placeAndEnter(page, 'gallery', 'twistle', 1);
    const first = await solveHere(page);
    invariant(first.after > first.before,
      `${label}: the evening's first word room files its page as it always did`,
      `${label}: the control solve paid nothing — the harness is not driving the channel`);

    const valve = await page.evaluate(() => {
      const s = window.__manorStore.getState();
      const day = s.day?.day ?? s.volume.day;
      return s.recentEvents.some(
        (r) => r.day === day && r.event.type === 'fragment-found' && r.event.via === 'lintel',
      );
    });
    invariant(valve,
      `${label}: …and the day's channel is now spent`,
      `${label}: the first solve did not spend the lintel channel — the case under test cannot occur`);

    await placeAndEnter(page, LEAD.cardId, 'crossword', 1);
    const second = await solveHere(page);
    lead(second.after > second.before,
      `${label}: the room she was SENT to pays her anyway — the promise is kept`,
      `${label}: the room she was sent to paid nothing after the channel was spent — the character was wrong`);

    /* ══ 3. …AND THE PAGE SAYS WHICH ROOM, which is what closes the loop ════
       Round 49's attribution is what turns "I got a page" into "the Linen
       Closet gave me a page". A lead with no attribution behind it teaches
       nothing, so the two are checked together or not at all. */
    if (second.after > second.before) {
      const attributed = await page.evaluate(() => {
        const s = window.__manorStore.getState();
        const id = s.volume.foundFragmentIds[s.volume.foundFragmentIds.length - 1];
        return s.flags.some((f) => f.startsWith(`vol.${s.volume.volumeId}.from-${id}-`));
      });
      invariant(attributed,
        `${label}: …and the page it filed remembers the room that produced it`,
        `${label}: the led room's page arrived anonymous — the loop cannot close`);
    }

    if (errors.length) fail(`${label}: console/page errors: ${errors.slice(0, 3).join(' | ')}`);
    await context.close();
  }
} catch (e) {
  fail(`threw: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

if (PROVE) {
  log(failures
    ? `DONE WITH ${failures} FAILURE(S) — the gate did not go red where it must`
    : `DONE — with nothing said, nothing is painted and nothing is paid (${reds} reds)`);
} else {
  log(failures
    ? `DONE WITH ${failures} FAILURE(S)`
    : 'DONE — the lead is painted at both sizes, and going where she is sent pays');
}
process.exit(failures ? 1 : 0);
