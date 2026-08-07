/**
 * ROUND 13 — the two remaining live checks this fix owes (AAA §0.4).
 *
 *  A. 6.16 — the seal must be enticing, not lectured. With five pages sealed at
 *     390x844 the Word tab printed the same instruction FIVE times in three
 *     verbs (three per-line labels, Ellery's nudge, the footer rail) and the
 *     tier hint three times, and the sheet went into internal scroll before the
 *     alphabet plate existed. This counts the instruction on the glass.
 *
 *  B. 4.15 — the closed volume's archive must not contradict its own ceremony.
 *     Win at the door holding sealed pages: the epilogue and the Journal must
 *     agree, and the dead "go solve a room" instruction must be gone.
 *
 * ONE browser instance, system Edge, closed in a finally.
 *   node tests/round13-seal-copy-and-close.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4173/LexiconManor/';
const log = (...a) => console.log('[r13b]', ...a);
let failures = 0;
const ok = (m) => log('PASS —', m);
const fail = (m) => { failures++; log('FAIL —', m); };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(20000);
  const sleep = (ms) => page.waitForTimeout(ms);
  const drain = async (limit = 16) => {
    for (let i = 0; i < limit; i++) {
      const gone = await page.evaluate(() => {
        const m = document.querySelector('.mom');
        if (!m) return true;
        m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        m.click?.();
        return false;
      });
      if (gone) return;
      await sleep(250);
    }
  };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('text=Begin the first day');
  await page.waitForSelector('.chr-scene');
  await page.click('.chr-scene__btn');
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const p = await page.$('.dlg-choice--primary');
    if (p) { await p.click(); await sleep(120); continue; }
    const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (c) { await c.click(); await sleep(120); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await sleep(120);
  }
  await page.waitForSelector('.bp-sheet');
  await drain();
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.__manorStore.getState().collectFragmentForRoom('mystery');
  });
  await sleep(400); await drain();

  // ---- A. the Word tab, five pages sealed --------------------------------
  await page.goto(BASE + '#/journal', { waitUntil: 'networkidle' });
  await page.waitForSelector('.jrn-tabs');
  await sleep(700); await drain();
  const word = await page.evaluate(() => {
    const body = document.querySelector('.jrn')?.innerText ?? '';
    const n = (re) => (body.match(re) ?? []).length;
    const sheet = document.querySelector('.jrn-sheet');
    return {
      text: body,
      instruction: n(/solve (a |something)|finish a room|finishing a room|comes clear|come clear/gi),
      // Counted as SENTENCES that carry the hint, not regex hits: the rail's
      // one parenthetical "(more of them, the higher the room)" is a single
      // hint and must not be scored twice by its own two clauses.
      tierHint: body.split(String.fromCharCode(10))
        .filter((line) => /higher the room|harder the room|more at once/i.test(line)).length,
      sealedLines: document.querySelectorAll('.jrn-poem__line--sealed').length,
      labels: document.querySelectorAll('.jrn-sealed__label').length,
      scroll: sheet ? { h: sheet.scrollHeight, c: sheet.clientHeight } : null,
    };
  });
  log('WORD TAB —', JSON.stringify({
    instruction: word.instruction, tierHint: word.tierHint,
    sealedLines: word.sealedLines, labels: word.labels, scroll: word.scroll,
  }));
  if (word.instruction > 1) {
    fail(`the instruction to go finish a room appears ${word.instruction} times on one screen (AAA 6.16)`);
  } else ok(`the instruction appears exactly ${word.instruction} time on the Word tab`);
  if (word.tierHint > 1) {
    fail(`the tier hint appears ${word.tierHint} times on one screen (AAA 6.16)`);
  } else ok(`the tier hint appears exactly ${word.tierHint} time`);
  if (/Solve a room\./i.test(word.text)) fail('the per-line label still lectures ("Solve a room.")');
  else ok('the per-line labels are state only');

  // ---- B. win the volume holding sealed pages -----------------------------
  const beforeWin = await page.evaluate(() => {
    const s = window.__manorStore.getState();
    const pre = `vol.${s.volume.volumeId}.`;
    const leg = new Set(s.flags.filter((f) => f.startsWith(pre + 'legible-')).map((f) => f.slice((pre + 'legible-').length)));
    return s.flags.filter((f) => f.startsWith(pre + 'sealed-'))
      .map((f) => f.slice((pre + 'sealed-').length)).filter((i) => !leg.has(i)).length;
  });
  log(`walking to the door holding ${beforeWin} sealed page(s)`);
  await page.evaluate(() => {
    // Stand on the landing, in a room with a north door onto the sealed
    // Sanctum — `atSanctumDoor` checks both, on the model, so the probe has to
    // build the real thing rather than move a token (engine/manor/grid.ts).
    const st = window.__manorStore.getState();
    const manor = st.manor;
    const cell = { col: 2, row: 5 };
    const key = `${cell.col},${cell.row}`;
    window.__manorStore.setState({
      manor: {
        ...manor,
        playerCell: cell,
        rooms: {
          ...manor.rooms,
          [key]: {
            cardId: 'probe-landing', cell, doors: ['N', 'S'],
            solved: false, kind: 'utility',
          },
        },
      },
    });
    window.__manorStore.getState().guessAtSanctum('lacuna');
  });
  await sleep(500);
  const afterWin = await page.evaluate(() => {
    const s = window.__manorStore.getState();
    const pre = `vol.${s.volume.volumeId}.`;
    const leg = new Set(s.flags.filter((f) => f.startsWith(pre + 'legible-')).map((f) => f.slice((pre + 'legible-').length)));
    return {
      status: s.volume.status,
      sealed: s.flags.filter((f) => f.startsWith(pre + 'sealed-'))
        .map((f) => f.slice((pre + 'sealed-').length)).filter((i) => !leg.has(i)).length,
    };
  });
  log('AFTER THE WORD —', JSON.stringify(afterWin));
  if (afterWin.status !== 'solved') fail('the volume did not solve — probe cannot check the archive');
  else if (afterWin.sealed !== 0) {
    fail(`${afterWin.sealed} page(s) are still smudged on a CLOSED volume — the archive still `
      + 'contradicts the epilogue (AAA 4.15)');
  } else ok('the closed volume left no smudges: the archive matches the ceremony');

  await page.goto(BASE + '#/journal', { waitUntil: 'networkidle' });
  await page.waitForSelector('.jrn-tabs');
  await sleep(700); await drain();
  const closed = await page.evaluate(() => {
    const body = document.querySelector('.jrn')?.innerText ?? '';
    return {
      smudgeRuns: document.querySelectorAll('.jrn-smudge').length,
      deadInstruction: /solve a room|finish a room|not yet made out/i.test(body),
      says: body.slice(0, 200),
    };
  });
  log('JOURNAL AFTER THE WIN —', JSON.stringify(closed));
  if (closed.smudgeRuns > 0) fail(`${closed.smudgeRuns} dot-run(s) still render on a closed volume`);
  else ok('no dot-runs in the closed archive — the lines she earned read as prose');
  if (closed.deadInstruction) fail('the dead "go solve a room" instruction survives the win');
  else ok('no dead instruction on the closed volume');

  await page.goto(BASE + '#/sanctum', { waitUntil: 'networkidle' });
  await sleep(700); await drain();
  const epi = await page.evaluate(() => ({
    poem: document.querySelector('.snc-epilogue__poem')?.innerText ?? null,
    dots: (document.querySelector('.snc-epilogue__poem')?.innerText ?? '').match(/·{3,}/g)?.length ?? 0,
  }));
  log('EPILOGUE —', JSON.stringify({ dots: epi.dots, head: epi.poem?.slice(0, 90) }));
  if (epi.dots > 0) fail('the ceremony prints smudges the journal does not (or vice versa)');
  else ok('the ceremony and the archive print the same thing');

  log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
} finally {
  await browser.close();
}
process.exit(failures === 0 ? 0 : 1);
