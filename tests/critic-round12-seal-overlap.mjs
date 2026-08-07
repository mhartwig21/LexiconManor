/**
 * tests/critic-round12-seal-overlap.mjs — THE NOTICE-OVER-A-PLAYFIELD GATE
 * (AAA 11.27, and 11.27(d) in particular: "every surface, every round").
 *
 * A. THE SEAL LANDS ON THE BOARD. `.mom-layer`'s clearance is
 *    chrome-h + tap-target + 12 (plus `--page-nav-floor` where a surface
 *    publishes one). That describes every SHEET screen, which all put a back
 *    row under the bar. A ROOM has no back row — its board starts at y≈91–113 —
 *    so the seal parks on the playfield of five room kinds, and a tap aimed at
 *    a covered control dismisses the seal instead of doing what it says
 *    (AAA 11.2, and the §0.5 escape #4 shape, in a surface nobody re-probed).
 *
 * A2. ROUND 15 — AND THE SAME THING ON THE BLUEPRINT, WHICH THIS FILE DID NOT
 *    WALK. The round-12 table was parameterised by ROOM KIND and nothing else:
 *    seven rooms, one 375x667 hive check, no `/manor` row at any player row. So
 *    when the blueprint's own controls moved into the seal's band — which they
 *    do the moment she leaves the ground floor, because the sheet draws row 6
 *    at the TOP of the glass — the gate had nothing to say. Measured live at
 *    390x844 standing on the Sanctum landing with a plate grant up:
 *    "Approach the Sanctum" [177,157,64,64] answered `button.mom` at its
 *    centre, and a DRIVEN click there left `location.hash` unchanged and put
 *    the notice away; at 375x667 both padlocked-door controls were covered at
 *    their centres too, and those are COSTED (2 keys + the row's move price),
 *    which 6.19 exempts nothing from.
 *
 *    Round 11 recorded "/manor was clean under the same probe" and it WAS —
 *    on the ground floor. That is the whole lesson of §0.5 escape 4 and the
 *    reason the walk below is parameterised by PLAYER POSITION as well as by
 *    surface. A surface the gate does not name is a surface the round cannot
 *    fail.
 *
 * B. THE CABINET PLATE MARKER CLEARS ON OPENING, NOT ON VIEWING. The sheet's
 *    scroller is ~3200px tall in a 742px window; opening it writes
 *    `sys.plate.<id>` for EVERY unseen plate, including the ones two thousand
 *    pixels down (AAA 11.20). Its sibling channel — the Chronicles keepsake
 *    shelf — uses an IntersectionObserver for exactly this reason.
 *
 * Harness rules: system Edge (`channel: 'msedge'`), ONE browser, closed in a
 * finally, 390x844 @2x and 375x667. Round 15 moved it off `vite preview` onto
 * the dev server its two sibling gates already use (tests/modal-hit-test.mjs,
 * tests/navigation-live.mjs), so a green run is a statement about the tree and
 * not about whatever `dist/` happened to be lying around — agents share this
 * checkout, and a gate that silently tested a stale build is a gate that reads
 * green for the wrong reason.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = await (async () => {
  for (let p = 6310; p < 6360; p++) {
    const taken = await new Promise((res) => { const s = createServer(); s.once('error', () => res(true)); s.once('listening', () => s.close(() => res(false))); s.listen(p, '127.0.0.1'); });
    if (!taken) return p;
  }
  throw new Error('no free port');
})();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const server = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--config', resolve(ROOT, 'scripts/gate-vite.config.ts'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
/* Wait on vite SAYING it is up, then on the port answering. Agents share this
   box and a cold transform of this tree can run well past a minute under load;
   a fixed 60s poll turned into `net::ERR_CONNECTION_REFUSED` and a failure that
   said nothing about the game. */
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start within 180s')), 180000);
  server.stdout.on('data', (b) => { if (/ready in|Local:/.test(String(b))) { clearTimeout(t); res(); } });
  server.stderr.on('data', (b) => process.stderr.write(`[vite] ${b}`));
  server.on('exit', (c) => { clearTimeout(t); rej(new Error(`vite exited early (${c})`)); });
});
for (let i = 0; i < 120; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch { /* not up */ } await new Promise((r) => setTimeout(r, 500)); }

const log = (...a) => console.log('[seal]', ...a);
let failures = 0;
const fail = (m) => { console.error('[seal]   ** FAIL:', m); failures++; };
const ok = (m) => console.log('[seal]   PASS', m);

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  /**
   * Put every queued seal away.
   *
   * ROUND 15: over a PLAYFIELD the card is `pointer-events: none` by design —
   * that IS the fix — so clicking at its centre falls straight through onto the
   * board and walks the player somewhere. The drain waits out the dwell there
   * (5.6s alone, 4.0s behind a queue) instead of tapping, which is exactly what
   * the player who does not know she can tap experiences.
   */
  const drain = async () => {
    for (let i = 0; i < 60; i++) {
      const b = await page.$('.mom');
      if (!b) return;
      const inert = await page.evaluate(
        () => getComputedStyle(document.querySelector('.mom')).pointerEvents === 'none',
      ).catch(() => true);
      if (inert) { await page.waitForTimeout(300); continue; }
      const r = await b.boundingBox();
      if (!r) return;
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      await page.waitForTimeout(150);
    }
    fail('a moment seal never retired — the walk cannot continue from a dirty glass');
  };

  await page.goto(`${BASE}?seal=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bp-btn--seal', { timeout: 30000 });
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene', { timeout: 8000 });
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.dlg', { timeout: 8000 });
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const p = await page.$('.dlg-choice--primary');
    if (p) { await p.click(); await page.waitForTimeout(170); continue; }
    const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (c) { await c.click(); await page.waitForTimeout(170); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 });
  await drain();

  /* ---------- A. the seal on the board, room kind by room kind ---------- */
  const ROOMS = [
    ['hive', 'conservatory', 'gallery'],
    ['wordweb', 'library', 'study'],
    ['twistle', 'gallery', 'darkroom'],
    ['forgotten-word', 'study', 'linen-closet'],
    ['cipher', 'darkroom', 'counting-house'],
    ['crossword', 'chart-room', 'still-room'],
    ['sudoku', 'counting-house', 'boot-room'],
  ];
  for (const [kind, cardId, grant] of ROOMS) {
    const entered = await page.evaluate(([k, c]) => {
      const store = window.__manorStore;
      const s = store.getState();
      const m = s.manor;
      const cell = { col: m.playerCell.col, row: m.playerCell.row };
      const key = `${cell.col},${cell.row}`;
      store.setState({ manor: { ...m, rooms: { ...m.rooms, [key]: { cardId: c, cell, doors: ['N', 'S'], solved: false, kind: k } } } });
      store.getState().enterRoom(key);
      return Boolean(store.getState().day?.activeRoom);
    }, [kind, cardId]);
    await page.waitForTimeout(700);
    if (!entered || !(await page.$('.room-host'))) { log(`${kind}: not enterable, skipped`); continue; }
    // A DISTINCT grant per room: re-filling a plate announces nothing, which is
    // how a first pass can measure six rooms with no seal on the glass at all.
    await page.evaluate((g) => window.__manorStore.getState().unlockCard(g), grant);
    await page.waitForTimeout(600);
    const report = await page.evaluate(() => {
      const mom = document.querySelector('.mom')?.getBoundingClientRect();
      const covered = [];
      for (const b of document.querySelectorAll('.room-host button, .room-host [role="button"]')) {
        const r = b.getBoundingClientRect();
        if (r.width < 1) continue;
        // Anything scrolled out of its own scroller is the player's scrollbar,
        // not a covered control.
        let clipped = false;
        for (let p = b.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) {
            const pr = p.getBoundingClientRect();
            const cy = r.top + r.height / 2;
            if (cy < pr.top || cy > pr.bottom) { clipped = true; break; }
          }
        }
        if (clipped) continue;
        const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (t && !(b === t || b.contains(t))) {
          covered.push({ cls: (typeof b.className === 'string' ? b.className : '').trim().slice(0, 22), aria: b.getAttribute('aria-label'), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
        }
      }
      return { mom: mom ? [Math.round(mom.top), Math.round(mom.bottom)] : null, covered, total: document.querySelectorAll('.room-host button').length };
    });
    if (!report.mom) { log(`${kind}: no seal mounted, nothing to measure`); }
    else if (report.covered.length === 0) ok(`${kind}: seal band ${JSON.stringify(report.mom)} covers none of the ${report.total} controls`);
    else fail(`${kind}: seal band ${JSON.stringify(report.mom)} covers ${report.covered.length}/${report.total} controls — first: ${JSON.stringify(report.covered[0])} (AAA 11.2)`);

    /* THE CONSEQUENCE, driven, once, in the Counting House.
       The elementFromPoint sweep above is necessary and not sufficient: a card
       that stops taking taps passes it by construction, and the thing that
       actually has to be true is that a tap aimed at a cell UNDER the card
       lands on that cell. So aim at a cell whose centre is inside the seal's
       own band and assert the cursor moves there. (Before the fix this printed
       the defect: the seal went away and the cursor did not move.) */
    if (kind === 'sudoku' && report.mom) {
      const target = await page.evaluate(([top, bottom]) => {
        // Never the cell the cursor is already on: "it did not move" and "it
        // was already there" must not be the same measurement.
        const held = document.querySelector('.ch-cell--sel');
        for (const c of document.querySelectorAll('.ch-cell')) {
          if (c === held) continue;
          const r = c.getBoundingClientRect();
          const cy = r.top + r.height / 2;
          if (cy > top && cy < bottom) {
            return { aria: c.getAttribute('aria-label'), x: r.x + r.width / 2, y: cy };
          }
        }
        return null;
      }, report.mom);
      if (!target) log('sudoku: no cell sits inside the seal band — nothing to drive');
      else {
        const before = await page.evaluate(() => document.querySelector('.ch-cell--sel')?.getAttribute('aria-label') ?? null);
        await page.mouse.click(target.x, target.y);
        await page.waitForTimeout(250);
        const after = await page.evaluate(() => ({ sel: document.querySelector('.ch-cell--sel')?.getAttribute('aria-label') ?? null, seal: Boolean(document.querySelector('.mom')) }));
        if (after.sel === target.aria && after.seal) {
          ok(`sudoku: a tap aimed at "${target.aria}" UNDER the seal reached the board (cursor "${before}" → "${after.sel}") and the seal was not what she hit — it is still up`);
        } else if (after.sel === target.aria) {
          fail(`sudoku: the tap reached the board but the seal went away with it — the notice is still consuming the gesture (AAA 11.27(b))`);
        } else {
          fail(`sudoku: a tap aimed at "${target.aria}" under the seal left the cursor on "${after.sel}" (seal still up: ${after.seal}) — the tap was eaten (AAA 11.2 / 11.27 / §0.5 escape 4)`);
        }
      }
    }
    await drain();
    await page.evaluate(() => window.__manorStore.getState().leaveRoom());
    await page.waitForTimeout(400);
  }

  /* the short glass, on the one room whose control is a labelled affordance */
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const store = window.__manorStore;
    const s = store.getState();
    const m = s.manor;
    const cell = { col: m.playerCell.col, row: m.playerCell.row };
    const key = `${cell.col},${cell.row}`;
    store.setState({ manor: { ...m, rooms: { ...m.rooms, [key]: { cardId: 'conservatory', cell, doors: ['N', 'S'], solved: false, kind: 'hive' } } } });
    store.getState().enterRoom(key);
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__manorStore.getState().unlockCard('post-room'));
  await page.waitForTimeout(600);
  const short = await page.evaluate(() => {
    const mom = document.querySelector('.mom')?.getBoundingClientRect();
    const t = document.querySelector('.hv-found__toggle');
    if (!t || !mom) return null;
    const r = t.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { mom: [Math.round(mom.top), Math.round(mom.bottom)], toggle: [Math.round(r.top), Math.round(r.bottom)], covered: !(top && (t === top || t.contains(top))) };
  });
  if (!short) log('375x667: no seal or no found-toggle to measure');
  else if (short.covered) fail(`375x667 hive: the found-list toggle ${JSON.stringify(short.toggle)} sits under the seal ${JSON.stringify(short.mom)} (AAA 11.2 / 3.3)`);
  else ok('375x667 hive: the found-list toggle is clear of the seal');
  await page.setViewportSize({ width: 390, height: 844 });
  await drain();
  await page.evaluate(() => window.__manorStore.getState().leaveRoom());
  await page.waitForTimeout(400);

  /* ---------- A2. THE BLUEPRINT, BY PLAYER ROW (round-15 blocker) --------
     Parameterised by WHERE SHE IS STANDING, not by which screen it is. The
     blueprint's controls are the same controls at every row; what changes is
     which of them the seal's fixed band is sitting on, and that is a function
     of the storey. Rows 0 / 3 / 5 at both viewports: the ground floor (where
     round 11 looked, and where the band is empty parchment), a middle storey,
     and the Sanctum landing — the campaign's milestone screen (4.10d), which is
     precisely when a plate, a keepsake or a fragment lands.
     ---------------------------------------------------------------------- */
  {
    /** Stand at `row` with a walked column of rooms beneath her. */
    const standAt = (r) => page.evaluate((row) => {
      const store = window.__manorStore;
      const s = store.getState();
      const rooms = { ...s.manor.rooms };
      for (let i = 1; i <= row; i++) {
        rooms[`2,${i}`] = {
          cardId: 'reading-nook', cell: { col: 2, row: i },
          doors: ['N', 'S'], solved: false, kind: 'parlor',
        };
      }
      store.setState({ manor: { ...s.manor, rooms, playerCell: { col: 2, row } } });
    }, r);

    /* A DISTINCT grant per probe, for the round-12 reason: re-filling an
       already-unlocked plate announces nothing, and a row with no seal on the
       glass measures nothing while printing a pass.
       Chosen at RUNTIME from what is still locked rather than written down as a
       fixed list — the room walk above already spends eight plates, so a fixed
       list silently collides with it (measured: four of six /manor rows raised
       no seal at all on the first run of this section) and every collision is a
       row that proves nothing. */
    const GRANT_POOL = [
      'orangery', 'long-gallery', 'strong-room', 'gem-vault', 'key-cabinet',
      'dumbwaiter', 'greenhouse', 'morning-room', 'drawing-room', 'archive',
      'observatory', 'bureau', 'boxroom', 'winter-garden', 'map-room',
    ];
    const grantSomethingNew = () => page.evaluate((pool) => {
      const s = window.__manorStore.getState();
      const id = pool.find((c) => !s.cabinet.unlockedCardIds.includes(c));
      if (id) s.unlockCard(id);
      return id ?? null;
    }, GRANT_POOL);

    for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(350);
      for (const row of [0, 3, 5]) {
        await drain();
        await standAt(row);
        await page.waitForTimeout(350);
        const grant = await grantSomethingNew();
        if (!grant) {
          fail('/manor walk: every plate in the grant pool is already unlocked — this section can no longer raise a seal and must be repaired, not skipped');
          break;
        }
        await page.waitForTimeout(550);

        const label = `/manor ${vp.width}x${vp.height} row ${row}`;
        const probe = await page.evaluate(() => {
          const mom = document.querySelector('.mom');
          const mb = mom?.getBoundingClientRect();
          const covered = [];
          // Every cell, ghost door, padlocked door and Sanctum door on the
          // sheet, plus the footer's nav row — the blueprint's whole control
          // surface, not a sample of it.
          const all = [...document.querySelectorAll('.bp-sheet .bp-hit, .bp-foot__actions button')];
          for (const b of all) {
            const r = b.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            if (t && !(b === t || b.contains(t))) {
              const cls = typeof t.className === 'string' ? t.className : (t.className?.baseVal ?? '');
              covered.push({
                aria: b.getAttribute('aria-label') || (b.textContent || '').trim().slice(0, 24),
                box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
                by: `${t.tagName.toLowerCase()}.${String(cls).split(' ')[0]}`,
              });
            }
          }
          return {
            mom: mb ? [Math.round(mb.x), Math.round(mb.y), Math.round(mb.width), Math.round(mb.height)] : null,
            covered, total: all.length,
          };
        });

        if (!probe.mom) {
          fail(`${label}: no seal mounted after granting "${grant}" — this row cannot prove anything and must be repaired, not skipped`);
          continue;
        }
        log(`  ${label}: seal ${JSON.stringify(probe.mom)} over ${probe.total} controls`);
        if (probe.covered.length === 0) {
          ok(`${label}: the seal covers none of the ${probe.total} blueprint controls`);
        } else {
          fail(`${label}: ${probe.covered.length}/${probe.total} controls covered — first ${JSON.stringify(probe.covered[0])} (AAA 11.2 / 11.27)`);
        }

        /* THE CONSEQUENCE, DRIVEN, at the door the whole campaign points at.
           The sweep above is necessary and not sufficient: a card that stops
           taking taps passes it by construction. What has to be true is that a
           tap aimed at a control UNDER the card performs that control's
           action. Before the fix this printed the defect — the hash did not
           move and the seal went away. */
        if (row === 5) {
          const door = await page.evaluate(() => {
            const d = document.querySelector('.bp-sanctumhit');
            if (!d) return null;
            const r = d.getBoundingClientRect();
            const mom = document.querySelector('.mom')?.getBoundingClientRect();
            return {
              x: r.x + r.width / 2, y: r.y + r.height / 2,
              underSeal: Boolean(mom && r.y + r.height / 2 > mom.top && r.y + r.height / 2 < mom.bottom),
            };
          });
          if (!door) {
            fail(`${label}: no "Approach the Sanctum" control on the landing — the driven half of this row cannot run`);
          } else {
            const before = await page.evaluate(() => location.hash);
            await page.mouse.click(door.x, door.y);
            await page.waitForTimeout(500);
            const after = await page.evaluate(() => ({ hash: location.hash, seal: Boolean(document.querySelector('.mom')) }));
            if (/sanctum/.test(after.hash)) {
              ok(`${label}: a tap at the Sanctum door (under the seal: ${door.underSeal}) opened ${after.hash}`);
            } else {
              fail(`${label}: a tap at the Sanctum door left the hash at "${after.hash}" (was "${before}", seal still up: ${after.seal}) — the tap was eaten (AAA 11.2 / 11.27 / §0.5 escape 4)`);
            }
            await page.evaluate(() => { location.hash = '#/'; });
            await page.waitForSelector('.bp-sheet', { timeout: 8000 }).catch(() => {});
            await page.waitForTimeout(300);
          }
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await drain();
  }

  /* ---------- B. the cabinet marker clears on OPEN, not on VIEW ---------- */
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    for (const id of ['gallery', 'library', 'study', 'darkroom', 'linen-closet', 'counting-house', 'still-room', 'boot-room']) {
      try { s.unlockCard(id); } catch { /* already */ }
    }
  });
  await page.waitForTimeout(400);
  await drain();
  const markBefore = await page.evaluate(() => {
    const host = [...document.querySelectorAll('.bp-foot__actions .unread-host')].find((x) => (x.childNodes[0]?.textContent || '').trim() === 'Cabinet');
    return host?.querySelector('.unread')?.textContent?.trim() ?? null;
  });
  await page.evaluate(() => {
    [...document.querySelectorAll('.bp-foot__actions button')].find((x) => /cabinet/i.test(x.textContent || ''))?.click();
  });
  await page.waitForSelector('.bp-modal', { timeout: 8000 });
  await page.waitForTimeout(400);
  const sheet = await page.evaluate(() => {
    const sc = document.querySelector('.bp-modal__sheet') ?? document.querySelector('.bp-modal');
    const sr = sc.getBoundingClientRect();
    const plates = [...document.querySelectorAll('.bp-card--plate:not(.bp-card--locked)')].map((li) => {
      const r = li.getBoundingClientRect();
      return { name: (li.querySelector('.bp-card__name')?.textContent || '').trim(), onGlass: r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1, top: Math.round(r.top) };
    });
    return { scrollHeight: Math.round(sc.scrollHeight), clientHeight: Math.round(sc.clientHeight), plates };
  });
  const flags = await page.evaluate(() => window.__manorStore.getState().flags.filter((f) => f.startsWith('sys.plate.')));
  const offGlass = sheet.plates.filter((p) => !p.onGlass).length;
  log(`cabinet: mark was "${markBefore}"; sheet scrolls ${sheet.scrollHeight}px in ${sheet.clientHeight}px; ${offGlass}/${sheet.plates.length} plates are off the glass at scroll 0`);
  log('sys.plate flags written by OPENING alone:', JSON.stringify(flags));
  if (flags.length > sheet.plates.filter((p) => p.onGlass).length) {
    fail(`cabinet: opening the sheet wrote ${flags.length} seen-flags while only ${sheet.plates.filter((p) => p.onGlass).length} plates were on the glass — the marker retires on opening, not on viewing (AAA 11.20)`);
  } else ok('cabinet: only the plates actually displayed were marked seen');

  /* THE OTHER DIRECTION, and the assertion the one above cannot make on its
     own: an observer that never fires would satisfy it perfectly. Scroll the
     sheet to the bottom, so every plate has been on the glass, and the marker
     must go — 11.20 retires on viewing, and 11.21 forbids a marker she cannot
     clear as loudly as it forbids one that clears itself. */
  await page.evaluate(() => {
    const sc = document.querySelector('.bp-modal__sheet') ?? document.querySelector('.bp-modal');
    sc.scrollTop = sc.scrollHeight;
  });
  await page.waitForTimeout(700);
  const scrolled = await page.evaluate(() => window.__manorStore.getState().flags.filter((f) => f.startsWith('sys.plate.')).length);
  log(`sys.plate flags after scrolling the whole sheet: ${scrolled} (was ${flags.length})`);
  if (scrolled <= flags.length) {
    fail(`cabinet: scrolling every plate onto the glass wrote no further seen-flags (${flags.length} → ${scrolled}) — the marker cannot be cleared by looking (AAA 11.20/11.21)`);
  } else ok(`cabinet: looking at the rest of the sheet retired them too (${flags.length} → ${scrolled})`);

  await page.evaluate(() => {
    [...document.querySelectorAll('.bp-modal button')].find((x) => /close/i.test(x.textContent || ''))?.click();
  });
  await page.waitForTimeout(400);
  const markAfter = await page.evaluate(() => {
    const host = [...document.querySelectorAll('.bp-foot__actions .unread-host')].find((x) => (x.childNodes[0]?.textContent || '').trim() === 'Cabinet');
    return host?.querySelector('.unread')?.textContent?.trim() ?? null;
  });
  log(`cabinet mark after one open/close: ${JSON.stringify(markAfter)} (was ${JSON.stringify(markBefore)})`);
} catch (e) {
  fail(`threw: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
log(failures ? `DONE WITH ${failures} FAILURE(S)` : 'DONE clean');
/* ROUND 15: this read `process.exit(0)` unconditionally, so the gate that owns
   AAA 11.27 could count its own failures out loud and still hand the runner a
   green exit code. A gate that cannot fail is not a gate. */
process.exit(failures ? 1 : 0);
