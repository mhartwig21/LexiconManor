/**
 * scripts/probe-visual-nav.mjs — the visual-nav REPRODUCTION probe (round 15;
 * renamed off its round number in round 19 because it is still referenced by
 * `src/ui/moment/dock.ts` as the source of that file's measured numbers).
 *
 * Not a gate (the gates are tests/*.mjs). This is the measurement bench: it
 * reproduces, or refuses to reproduce, the three round-14 blockers before
 * anything is changed, and re-runs after, so every claim in the report is a
 * number off a live browser rather than a reading of the source.
 *
 *   A. boot        — fresh save → "Begin the first day" → is anything on glass?
 *   B. /manor      — the campaign seal over the blueprint's upper storeys
 *   C. dusk veil   — `.chr-dusk__skip` over the blueprint's nav row
 *
 * Harness rules (§0.4): system Edge, ONE browser, closed in a finally.
 * Run a subset with `--only=a`, `--only=b`, `--only=c` (the box is shared).
 *
 * WHERE THESE QUESTIONS LIVE NOW. All three are owned by gates as of round 15
 * and this bench is kept only for re-deriving the numbers by hand:
 *   A → tests/navigation-live.mjs §1b   (press the button, count the controls)
 *   B → tests/critic-round12-seal-overlap.mjs §A2  (/manor at rows 0/3/5)
 *   C → tests/modal-hit-test.mjs §9     (the dusk veil over the nav row)
 * Section C's day-roll recovery here is deliberately simple and can stall on
 * the night digest under load; the gate's version is the maintained one.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function freePort(from = 5410, to = 5470) {
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
  throw new Error('no free port');
}

/** `--only=a,b,c` runs a subset; the box is shared and a full pass is slow. */
const ONLY = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? 'a,b,c')
  .split(',').map((s) => s.trim());
const runs = (s) => ONLY.includes(s);

const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const log = (...a) => console.log('[r15]', ...a);
let failures = 0;
const fail = (m) => { console.error('[r15]   ** FAIL:', m); failures++; };
const ok = (m) => console.log('[r15]   PASS', m);

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--config', resolve(ROOT, 'scripts/gate-vite.config.ts'), '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
);
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 60000);
  server.stdout.on('data', (b) => {
    if (/ready in|Local:/.test(String(b))) { clearTimeout(t); res(); }
  });
  server.on('exit', (c) => { clearTimeout(t); rej(new Error(`vite exited (${c})`)); });
});

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  /**
   * Put every queued seal away. Over a PLAYFIELD (a room, and since round 15
   * the blueprint) the card is `pointer-events: none` on purpose, so clicking
   * at its centre would fall through onto the board and walk the player
   * somewhere — the drain waits out the dwell there instead of tapping.
   */
  const drain = async () => {
    for (let i = 0; i < 60; i++) {
      const el = await page.$('.mom');
      if (!el) return;
      const inert = await page.evaluate(
        () => getComputedStyle(document.querySelector('.mom')).pointerEvents === 'none',
      ).catch(() => true);
      if (inert) { await page.waitForTimeout(300); continue; }
      const r = await el.boundingBox();
      if (!r) return;
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      await page.waitForTimeout(150);
    }
  };

  /* ---------------- A. boot ---------------- */
  log('');
  log('— A. boot: fresh save → "Begin the first day" —');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('.bp-btn--seal', { timeout: 30000 });
  await page.click('.bp-btn--seal');
  await page.waitForTimeout(1200);
  const boot = await page.evaluate(() => ({
    phase: window.__manorStore?.getState().day?.phase ?? null,
    buttons: document.querySelectorAll('button').length,
    root: document.getElementById('app')?.childElementCount ?? -1,
  }));
  log(`   phase=${boot.phase} buttons=${boot.buttons} #app children=${boot.root} pageerrors=${errors.length}`);
  if (boot.buttons === 0) fail(`the first day booted to ZERO controls (phase ${boot.phase}) — ${errors[0] ?? 'no page error captured'}`);
  else ok(`the first day boots with ${boot.buttons} controls on glass (phase ${boot.phase})`);
  if (errors.length) fail(`page errors on boot: ${errors.slice(0, 3).join(' | ')}`);

  // through Bramble to exploring
  await page.waitForSelector('.chr-scene__btn', { timeout: 8000 });
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

  /* ---------------- B. the seal over the blueprint ---------------- */
  log('');
  log('— B. /manor: a campaign seal over the blueprint at rows 0 / 3 / 5 —');

  /** Stand the player at `row` with a walkable column of rooms beneath her. */
  const standAt = (row) => page.evaluate((r) => {
    const store = window.__manorStore;
    const s = store.getState();
    const rooms = { ...s.manor.rooms };
    for (let i = 1; i <= r; i++) {
      rooms[`2,${i}`] = {
        cardId: 'reading-nook', cell: { col: 2, row: i },
        doors: ['N', 'S'], solved: false, kind: 'parlor',
      };
    }
    store.setState({ manor: { ...s.manor, rooms, playerCell: { col: 2, row: r } } });
  }, row);

  const GRANTS = ['gallery', 'library', 'study', 'darkroom', 'linen-closet', 'counting-house'];
  let grantIndex = 0;

  const probeManor = async (label) => {
    await page.evaluate((g) => window.__manorStore.getState().unlockCard(g), GRANTS[grantIndex++ % GRANTS.length]);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const mom = document.querySelector('.mom');
      const mb = mom?.getBoundingClientRect();
      const covered = [];
      const all = [...document.querySelectorAll('.bp-sheet .bp-hit, .bp-foot__actions button, .bp-foot button')];
      for (const b of all) {
        const rr = b.getBoundingClientRect();
        if (rr.width < 1 || rr.height < 1) continue;
        const t = document.elementFromPoint(rr.x + rr.width / 2, rr.y + rr.height / 2);
        if (t && !(b === t || b.contains(t))) {
          const cls = typeof t.className === 'string' ? t.className : (t.className?.baseVal ?? '');
          covered.push({
            aria: b.getAttribute('aria-label') || (b.textContent || '').trim().slice(0, 24),
            box: [Math.round(rr.x), Math.round(rr.y), Math.round(rr.width), Math.round(rr.height)],
            by: `${t.tagName.toLowerCase()}.${String(cls).split(' ')[0]}`,
          });
        }
      }
      return {
        mom: mb ? [Math.round(mb.x), Math.round(mb.y), Math.round(mb.width), Math.round(mb.height)] : null,
        pointerEvents: mom ? getComputedStyle(mom).pointerEvents : null,
        covered, total: all.length,
      };
    });
    if (!r.mom) { fail(`${label}: no seal mounted — the probe cannot measure anything`); return r; }
    log(`   ${label}: seal ${JSON.stringify(r.mom)} pointer-events:${r.pointerEvents}`);
    if (r.covered.length === 0) ok(`${label}: 0 of ${r.total} blueprint controls covered`);
    else fail(`${label}: ${r.covered.length}/${r.total} covered — ${JSON.stringify(r.covered.slice(0, 3))}`);
    return r;
  };

  for (const vp of runs('b') ? [{ width: 390, height: 844 }, { width: 375, height: 667 }] : []) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(300);
    for (const row of [0, 3, 5]) {
      await drain();
      await standAt(row);
      await page.waitForTimeout(350);
      const r = await probeManor(`${vp.width}x${vp.height} row ${row}`);

      // DRIVEN, at the Sanctum door, on the landing.
      if (row === 5 && r?.mom) {
        const target = await page.evaluate(() => {
          const d = document.querySelector('.bp-sanctumhit');
          if (!d) return null;
          const rr = d.getBoundingClientRect();
          return { x: rr.x + rr.width / 2, y: rr.y + rr.height / 2 };
        });
        if (!target) log('   (no .bp-sanctumhit on glass to drive)');
        else {
          const before = await page.evaluate(() => location.hash);
          await page.mouse.click(target.x, target.y);
          await page.waitForTimeout(400);
          const after = await page.evaluate(() => ({ hash: location.hash, seal: Boolean(document.querySelector('.mom')) }));
          if (after.hash !== before) ok(`${vp.width}x${vp.height}: a tap at the Sanctum door went to ${after.hash}`);
          else fail(`${vp.width}x${vp.height}: a tap at the Sanctum door left the hash at ${before} (seal still up: ${after.seal}) — the tap was eaten`);
          await page.evaluate(() => { location.hash = '#/'; });
          await page.waitForTimeout(300);
        }
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await drain();

  /* ---------------- C. the dusk veil's skip over the nav row ------------- */
  log('');
  log('— C. the dusk veil: `.chr-dusk__skip` vs the blueprint nav row —');
  for (const vp of runs('c') ? [{ width: 390, height: 844 }, { width: 375, height: 667 }] : []) {
    for (const reduced of [false, true]) {
      await page.setViewportSize(vp);
      await page.evaluate((r) => {
        const s = window.__manorStore.getState();
        if (s.settings.reducedMotion !== r) s.toggleReducedMotion();
      }, reduced);
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await page.waitForTimeout(200);
      // Fall to dusk through the real edge.
      await page.evaluate(() => {
        const s = window.__manorStore.getState();
        if (s.day?.phase === 'exploring') s.endDay('steps-exhausted');
      });
      const veil = await page.waitForSelector('.chr-dusk', { timeout: 4000 }).catch(() => null);
      if (!veil) { fail(`dusk ${vp.width}x${vp.height} reduced=${reduced}: the veil never mounted`); continue; }
      const m = await page.evaluate(() => {
        const skip = document.querySelector('.chr-dusk__skip');
        const sr = skip?.getBoundingClientRect();
        const rows = [];
        for (const b of document.querySelectorAll('.bp-foot__actions button')) {
          const r = b.getBoundingClientRect();
          if (r.width < 1) continue;
          const pts = [
            ['centre', r.x + r.width / 2, r.y + r.height / 2],
            ['tl', r.x + 5, r.y + 5], ['tr', r.x + r.width - 5, r.y + 5],
            ['bl', r.x + 5, r.y + r.height - 5], ['br', r.x + r.width - 5, r.y + r.height - 5],
          ];
          const bad = [];
          for (const [where, x, y] of pts) {
            const el = document.elementFromPoint(x, y);
            if (!el || !(el === b || b.contains(el))) {
              const cls = el && typeof el.className === 'string' ? el.className : '';
              bad.push(`${where}->${el ? el.tagName.toLowerCase() : 'nothing'}${cls ? '.' + cls.split(' ')[0] : ''}`);
            }
          }
          rows.push({ label: (b.textContent || '').trim().slice(0, 16), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], bad });
        }
        return { skip: sr ? [Math.round(sr.x), Math.round(sr.y), Math.round(sr.width), Math.round(sr.height)] : null, rows };
      });
      log(`   ${vp.width}x${vp.height} reduced=${reduced}: skip ${JSON.stringify(m.skip)}`);
      for (const r of m.rows) {
        if (r.bad.length === 0) ok(`   dusk ${vp.width}x${vp.height} r=${reduced}: "${r.label}" ${JSON.stringify(r.box)} answers as itself`);
        else fail(`dusk ${vp.width}x${vp.height} r=${reduced}: "${r.label}" ${JSON.stringify(r.box)} — ${r.bad.join(', ')}`);
      }
      // DRIVEN: a tap at the Journal entrance's centre.
      const j = m.rows.find((r) => /Journal/i.test(r.label));
      if (j) {
        const before = await page.evaluate(() => location.hash);
        await page.mouse.click(j.box[0] + j.box[2] / 2, j.box[1] + j.box[3] / 2);
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => location.hash);
        if (/journal/.test(after)) ok(`   dusk ${vp.width}x${vp.height} r=${reduced}: a tap at Journal reached ${after}`);
        else fail(`dusk ${vp.width}x${vp.height} r=${reduced}: a tap at Journal left the hash at ${after} (was ${before})`);
        await page.evaluate(() => { location.hash = '#/'; });
        await page.waitForTimeout(250);
      }
      // Back to exploring for the next pass: a fresh day.
      await page.evaluate(() => {
        const s = window.__manorStore.getState();
        while (s.day && s.day.phase !== 'exploring') {
          const before = s.day.phase;
          window.__manorStore.getState().advanceDayPhase();
          const now = window.__manorStore.getState().day?.phase;
          if (now === before) break;
        }
      });
      await page.waitForTimeout(600);
      const ph = await page.evaluate(() => window.__manorStore.getState().day?.phase);
      if (ph === 'morning') {
        await page.click('.chr-scene__btn').catch(() => {});
        await page.waitForTimeout(400);
        for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
          const p = await page.$('.dlg-choice--primary');
          if (p) { await p.click(); await page.waitForTimeout(150); continue; }
          const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
          if (c) { await c.click(); await page.waitForTimeout(150); continue; }
          await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
          await page.waitForTimeout(150);
        }
      }
      await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring', null, { timeout: 15000 }).catch(() => {});
      await drain();
    }
  }
} catch (e) {
  fail(`threw: ${e.message}\n${e.stack}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
log(failures ? `DONE WITH ${failures} FAILURE(S)` : 'DONE clean');
process.exit(failures ? 1 : 0);
