/**
 * r8-live-walk.mjs — the §0.4 live interaction pass (round 8 critic).
 * ONE browser (system Edge, channel msedge), closed in a finally. 390x844 @2x.
 * Drives the PREVIEW build (dist/) — not the dev server.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = process.env.WALK_VIEW === 'short'
  ? { width: 375, height: 667 } : { width: 390, height: 844 };

async function freePort(from = 5301, to = 5360) {
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
const PORT = await freePort();
const BASE = `http://localhost:${PORT}/LexiconManor/`;
const log = (...a) => console.log('[walk]', ...a);
const rows = [];
const notes = [];

const server = spawn(process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (b) => process.stdout.write(`[preview] ${b}`));
server.stderr.on('data', (b) => process.stderr.write(`[preview:err] ${b}`));
const up = (async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview did not answer');
})();

let browser;
try {
  await up;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  /* ---------- helpers ---------- */
  const hash = () => page.evaluate(() => location.hash || '(none)');
  const st = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    return {
      phase: s.day?.phase ?? null, day: s.day?.day ?? null,
      frags: s.volume.foundFragmentIds.length,
      events: s.recentEvents.length,
      retire: Boolean(document.querySelector('.chr-retire')),
    };
  });

  /** hit test: centre + 4 inset corners; also geometry + fold. */
  const probe = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const i = 5;
    const pts = [
      ['centre', r.x + r.width / 2, r.y + r.height / 2],
      ['tl', r.x + i, r.y + i], ['tr', r.right - i, r.y + i],
      ['bl', r.x + i, r.bottom - i], ['br', r.right - i, r.bottom - i],
    ];
    const res = pts.map(([where, x, y]) => {
      const h = document.elementFromPoint(x, y);
      const cls = h ? (typeof h.className === 'string' ? h.className : (h.className?.baseVal ?? '')) : '';
      return {
        where,
        ok: Boolean(h && (h === el || el.contains(h))),
        hit: h ? `${h.tagName.toLowerCase()}.${cls}` : 'null',
        chrome: Boolean(h && h.closest && h.closest('.chr-header')),
      };
    });
    return {
      found: true,
      res,
      w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      fold: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
      text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 48),
    };
  }, sel);

  const summarise = (p) => {
    if (!p.found) return 'NOT PRESENT';
    const bad = p.res.filter((r) => !r.ok);
    return bad.length === 0
      ? `5/5 own (${p.w}x${p.h}${p.fold ? ', above fold' : ', BELOW FOLD'})`
      : `FAIL ${bad.map((b) => `${b.where}→${b.hit}`).join(', ')}`;
  };

  /** scroll every scrollable ancestor to bottom, re-probe. */
  const probeScrolled = async (sel) => {
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      document.querySelectorAll('*').forEach((n) => {
        if (n.scrollHeight > n.clientHeight + 4) n.scrollTop = n.scrollHeight;
      });
      window.scrollTo(0, document.body.scrollHeight);
      return Boolean(el);
    }, sel);
    await page.waitForTimeout(150);
    return probe(sel);
  };

  /** retire reachability with an overlay up (11.5) */
  const retireProbe = async (label) => {
    const r = await page.evaluate(() => {
      const bar = document.querySelector('.chr-header');
      if (!bar) return { bar: false };
      const b = bar.getBoundingClientRect();
      const pts = [
        ['centre', b.right - 32, b.y + b.height / 2],
        ['tl', b.right - 52, b.y + 4], ['tr', b.right - 6, b.y + 4],
        ['bl', b.right - 52, b.bottom - 4], ['br', b.right - 6, b.bottom - 4],
      ];
      const res = pts.map(([where, x, y]) => {
        const h = document.elementFromPoint(x, y);
        const cls = h ? (typeof h.className === 'string' ? h.className : '') : '';
        return {
          where, hit: h ? `${h.tagName.toLowerCase()}.${cls}` : 'null',
          isRetire: Boolean(h && h.closest && h.closest('.chr-retire')),
          inChrome: Boolean(h && h.closest && h.closest('.chr-header')),
        };
      });
      return { bar: true, res, mounted: Boolean(document.querySelector('.chr-retire')) };
    });
    if (!r.bar) return 'no chrome';
    const live = r.res.filter((x) => x.isRetire || x.inChrome);
    return `${r.mounted ? 'MOUNTED' : 'unmounted'}; ${live.length ? 'CHROME ANSWERS: ' + live.map((l) => l.where + '→' + l.hit).join(',') : 'inert at all 5 points'}`;
  };

  const record = (surface, exitSel, exitLabel, hitSummary, dest, extra = '') =>
    rows.push({ surface, exit: `${exitLabel} (${exitSel})`, hit: hitSummary, dest, extra });

  async function playScene() {
    for (let i = 0; i < 70 && (await page.$('.dlg')); i++) {
      const primary = await page.$('.dlg-choice--primary');
      if (primary) { await primary.click(); await page.waitForTimeout(200); continue; }
      const choice = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift), .dlg-choice');
      if (choice) { await choice.click(); await page.waitForTimeout(200); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      await page.waitForTimeout(160);
    }
  }

  /* ---------- 1. fresh save / front step ---------- */
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title');

  const freshControls = await page.evaluate(() =>
    [...document.querySelectorAll('button, a, [role=button]')]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => (b.innerText || b.getAttribute('aria-label') || '?').replace(/\s+/g, ' ').trim()));
  notes.push(`FRESH SAVE controls on screen: ${JSON.stringify(freshControls)}`);
  record('/ front step (no day yet)', '.bp-btn--seal', 'Begin the first day',
    summarise(await probe('.bp-btn--seal')), 'starts a day (mutates state)',
    `only control(s): ${freshControls.join(' | ')}`);

  // 11.8/11.23/11.26 — can she reach settings + trunk without starting a day?
  const freshNav = await page.evaluate(() => ({
    journal: Boolean([...document.querySelectorAll('button')].find((b) => /journal/i.test(b.innerText))),
    chron: Boolean([...document.querySelectorAll('button')].find((b) => /chronicle/i.test(b.innerText))),
  }));
  notes.push(`FRESH SAVE: journal entrance=${freshNav.journal} chronicles entrance=${freshNav.chron}`);

  // typing the URL is not an affordance, but check the page still works if reached
  await page.evaluate(() => { location.hash = '#/chronicles'; });
  await page.waitForTimeout(400);
  const chronFresh = await page.$('.chron__title');
  notes.push(`FRESH SAVE via typed URL: /chronicles renders=${Boolean(chronFresh)}; back-link hit=${summarise(await probe('.backlink'))}`);
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(300);

  /* ---------- 2. morning card ---------- */
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene');
  const mc = await probe('.chr-scene__btn');
  record('morning card overlay (.chr-scene)', '.chr-scene__btn', 'Begin the day', summarise(mc),
    'advances to Bramble scene', `retire: ${await retireProbe('morning')}`);
  const mcNav = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => b.getBoundingClientRect().width > 0)
    .map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  notes.push(`MORNING CARD controls: ${JSON.stringify(mcNav)}`);

  /* ---------- 3. morning dialogue overlay ---------- */
  await page.click('.chr-scene__btn');
  await page.waitForSelector('.dlg');
  const skip = await probe('.dlg__skip');
  record('morning conversation (.dlg)', '.dlg__skip', 'Skip', summarise(skip),
    'ends lines → Farewell', `retire: ${await retireProbe('dlg-morning')}`);
  await playScene();
  await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring');
  await page.waitForSelector('.chr-retire');

  /* ---------- 4. blueprint exploring ---------- */
  const bpControls = await page.evaluate(() => [...document.querySelectorAll('.bp-foot button, .bp-btn')]
    .map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  notes.push(`BLUEPRINT footer controls: ${JSON.stringify(bpControls)}`);
  record('/ blueprint (exploring)', '.chr-retire', 'retire moon (baseline)',
    summarise(await probe('.chr-retire')), 'n/a (home)', `footer: ${bpControls.join(' | ')}`);

  /* ---------- 5. /journal ---------- */
  const jbtn = await page.$$('.bp-foot button');
  for (const b of jbtn) if (/^Journal/.test((await b.innerText()).trim())) { await b.click(); break; }
  await page.waitForTimeout(400);
  await page.waitForSelector('.backlink');
  const jp = await probe('.backlink');
  const jpScroll = await probeScrolled('.backlink');
  await page.click('.backlink');
  await page.waitForTimeout(400);
  const jdest = await hash();
  record('/journal', '.backlink', 'The manor / Put it down', summarise(jp),
    `${jdest} ${jdest === '#/' ? '(= the manor ✓)' : '(MISMATCH)'}`,
    `scrolled-to-bottom: ${summarise(jpScroll)}`);

  /* ---------- 6. /chronicles ---------- */
  const cbtn = await page.$$('.bp-foot button');
  for (const b of cbtn) if (/^Chronicles/.test((await b.innerText()).trim())) { await b.click(); break; }
  await page.waitForTimeout(400);
  await page.waitForSelector('.chron__title');
  const cp = await probe('.backlink');
  const cpScroll = await probeScrolled('.backlink');
  await page.click('.backlink');
  await page.waitForTimeout(400);
  const cdest = await hash();
  record('/chronicles', '.backlink', 'The manor', summarise(cp),
    `${cdest} ${cdest === '#/' ? '(= the manor ✓)' : '(MISMATCH)'}`,
    `scrolled-to-bottom: ${summarise(cpScroll)}`);

  /* ---------- 7. /sanctum ---------- */
  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForTimeout(500);
  const sp = await probe('.backlink');
  const spScroll = await probeScrolled('.backlink');
  const sancControls = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => b.getBoundingClientRect().width > 0)
    .map((b) => b.innerText.replace(/\s+/g, ' ').trim()).slice(0, 12));
  await page.click('.backlink');
  await page.waitForTimeout(400);
  const sdest = await hash();
  record('/sanctum', '.backlink', 'The manor / Back down the stairs', summarise(sp),
    `${sdest} ${sdest === '#/' ? '(= the manor ✓)' : '(MISMATCH)'}`,
    `scrolled: ${summarise(spScroll)}; controls: ${sancControls.join(' | ')}`);

  /* ---------- 8. not-found ---------- */
  await page.evaluate(() => { location.hash = '#/no-such-corridor'; });
  await page.waitForTimeout(400);
  const nf = await probe('.btn--primary');
  await page.click('.btn--primary');
  await page.waitForTimeout(400);
  const nfdest = await hash();
  record('not-found fallback', '.btn--primary', 'Back to the Entrance Hall', summarise(nf),
    `${nfdest} ${nfdest === '#/' ? '(= entrance ✓)' : '(MISMATCH)'}`, '');

  /* ---------- 9. cabinet overlay ---------- */
  const cab = await page.$$('.bp-btn--quiet');
  for (const b of cab) if ((await b.innerText()).trim() === 'Cabinet') { await b.click(); break; }
  await page.waitForSelector('.bp-modal');
  const cabExit = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.bp-modal button')]
      .find((x) => /close|done|back|shut/i.test(x.innerText));
    if (b) b.setAttribute('data-walk', '1');
    return b ? b.innerText.trim() : null;
  });
  const cabProbe = cabExit ? await probe('.bp-modal [data-walk="1"]') : { found: false };
  const cabRetire = await retireProbe('cabinet');
  record('floorplan cabinet overlay (.bp-modal)', '[data-walk]', cabExit ?? '(none found)',
    summarise(cabProbe), 'closes to blueprint', `retire: ${cabRetire}`);
  if (cabExit) { await page.click('.bp-modal [data-walk="1"]'); await page.waitForTimeout(300); }
  if (await page.$('.bp-modal')) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }

  /* ---------- 10. draft overlay ---------- */
  await page.waitForSelector('.bp-ghost');
  await page.click('.bp-ghost');
  await page.waitForSelector('.bp-modal');
  const draftExit = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.bp-modal button')]
      .find((x) => /back|cancel|not now|leave/i.test(x.innerText));
    if (b) b.setAttribute('data-walk', '2');
    return b ? b.innerText.replace(/\s+/g, ' ').trim() : null;
  });
  const draftProbe = draftExit ? await probe('.bp-modal [data-walk="2"]') : { found: false };
  record('draft offer overlay (.bp-modal)', '[data-walk=2]', draftExit ?? '(none found)',
    summarise(draftProbe), 'back to blueprint', `retire: ${await retireProbe('draft')}`);
  await page.evaluate(() => window.__manorStore.getState().cancelDraft());
  await page.waitForTimeout(300);

  /* ---------- 11. a real room ---------- */
  await page.evaluate(() => {
    const store = window.__manorStore; const s = store.getState();
    const cell = s.manor.playerCell; const key = `${cell.col},${cell.row}`;
    const room = s.manor.rooms[key];
    store.setState({ manor: { ...s.manor, rooms: { ...s.manor.rooms,
      [key]: { ...room, cardId: 'conservatory', kind: 'hive', solved: false, puzzleId: undefined } } } });
  });
  await page.waitForTimeout(250);
  const entered = await page.evaluate(() => {
    const s = window.__manorStore.getState();
    const c = s.manor.playerCell; s.enterRoom(`${c.col},${c.row}`); return true;
  });
  await page.waitForTimeout(600);
  const roomHash = await hash();
  const roomExit = await probe('.room-host__footer .btn');
  const roomScroll = await probeScrolled('.room-host__footer .btn');
  record(`/room (${roomHash}, hive)`, '.room-host__footer .btn', 'Leave it for tomorrow',
    summarise(roomExit), 'pending click', `scrolled: ${summarise(roomScroll)}; retire: ${await retireProbe('room')}`);

  // grant a campaign fragment while INSIDE the room (11.11)
  const beforeRoomGrant = await st();
  await page.evaluate(() => window.__manorStore.getState().collectFragmentForRoom('mystery'));
  await page.waitForTimeout(700);
  const momentInRoom = await page.evaluate(() => {
    const m = document.querySelector('.mom');
    if (!m) return { mounted: false };
    const r = m.getBoundingClientRect();
    const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      mounted: true, w: Math.round(r.width), h: Math.round(r.height),
      inFold: r.top >= 0 && r.bottom <= window.innerHeight,
      owns: Boolean(h && (h === m || m.contains(h))),
      hit: h ? h.tagName.toLowerCase() + '.' + (typeof h.className === 'string' ? h.className : '') : 'null',
      text: m.innerText.replace(/\s+/g, ' ').trim().slice(0, 90),
      opacity: getComputedStyle(m).opacity,
    };
  });
  notes.push(`GRANT in-room (fragment via mystery drip): frags ${beforeRoomGrant.frags}→${(await st()).frags}; moment=${JSON.stringify(momentInRoom)}`);

  // leave the room via its own control
  const leaveTxt = await page.evaluate(() => document.querySelector('.room-host__footer .btn')?.innerText.trim());
  await page.click('.room-host__footer .btn');
  await page.waitForTimeout(600);
  notes.push(`ROOM exit "${leaveTxt}" → ${await hash()}`);

  // persistent trace after leaving the screen (11.12)
  const trace = await page.evaluate(() => {
    const host = [...document.querySelectorAll('.bp-foot button')].find((b) => /^Journal/.test(b.innerText));
    const mark = host?.querySelector('.unread, .unread-mark, [class*="unread"]');
    const r = mark?.getBoundingClientRect();
    return {
      journalButton: Boolean(host),
      markPresent: Boolean(mark),
      markClass: mark?.className ?? null,
      markText: mark?.innerText?.trim() ?? null,
      markSize: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null,
      buttonText: host?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    };
  });
  notes.push(`TRACE after leaving room: ${JSON.stringify(trace)}`);

  /* ---------- 12. grant while behind the dialogue overlay ---------- */
  await page.evaluate(() => {
    const store = window.__manorStore; const s = store.getState();
    const cell = s.manor.playerCell; const key = `${cell.col},${cell.row}`;
    const room = s.manor.rooms[key];
    store.setState({ manor: { ...s.manor, rooms: { ...s.manor.rooms,
      [key]: { ...room, cardId: 'reading-nook', kind: 'parlor', solved: false } } } });
  });
  await page.waitForTimeout(250);
  const callBtns = await page.$$('.bp-btn');
  for (const b of callBtns) if (/^Call on/.test((await b.innerText()).trim())) { await b.click(); break; }
  await page.waitForSelector('.dlg', { timeout: 8000 }).catch(() => {});
  if (await page.$('.dlg')) {
    await page.evaluate(() => window.__manorStore.getState().collectFragmentForRoom('mystery'));
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => {
      const el = document.querySelector('.mom');
      if (!el) return { mounted: false };
      const r = el.getBoundingClientRect();
      const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { mounted: true, size: `${Math.round(r.width)}x${Math.round(r.height)}`,
        owns: Boolean(h && (h === el || el.contains(h))),
        hit: h ? h.tagName.toLowerCase() + '.' + (typeof h.className === 'string' ? h.className : '') : 'null',
        text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 80) };
    });
    notes.push(`GRANT behind .dlg overlay: ${JSON.stringify(m)}`);
    // affinity rank-up + payout notice, from behind the same overlay
    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      s.recordEvent({ type: 'affinity-rank-up', character: 'bramble', rank: 2 });
      s.recordEvent({ type: 'room-drafted', cellKey: '0,0', cardId: 'gem-vault', category: 'utility' });
    });
    await page.waitForTimeout(500);
    const rail = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.chr-notice')];
      return els.map((el) => {
        const r = el.getBoundingClientRect();
        const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { size: `${Math.round(r.width)}x${Math.round(r.height)}`,
          text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 70),
          top: Math.round(r.top),
          covered: !(h && (h === el || el.contains(h))),
          hit: h ? h.tagName.toLowerCase() + '.' + (typeof h.className === 'string' ? h.className : '') : 'null' };
      });
    });
    notes.push(`NOTICE RAIL behind .dlg: ${JSON.stringify(rail)}`);
    await playScene();
  } else {
    notes.push('GRANT behind .dlg: could not open a parlor scene');
  }

  /* ---------- 13. currency deltas (11.15) ---------- */
  const deltas = await page.evaluate(async () => {
    const s = window.__manorStore.getState();
    const before = { ...s.currencies };
    s.grantGems?.(2); s.grantKeys?.(1);
    await new Promise((r) => setTimeout(r, 400));
    const floats = [...document.querySelectorAll('[class*="float"], .chr-float, .chip__float')]
      .map((e) => ({ cls: e.className, txt: e.innerText?.trim() }));
    return { before, after: { ...window.__manorStore.getState().currencies }, floats };
  });
  notes.push(`CURRENCY deltas: ${JSON.stringify(deltas)}`);

  /* ---------- 14. tap counts (11.23) mid-day ---------- */
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(400);
  const tapCount = await page.evaluate(() => {
    // count real taps: Chronicles (1) → the control (2)
    const chron = [...document.querySelectorAll('.bp-foot button')].find((b) => /^Chronicles/.test(b.innerText));
    return { chroniclesOnBlueprint: Boolean(chron) };
  });
  const cbtn2 = await page.$$('.bp-foot button');
  for (const b of cbtn2) if (/^Chronicles/.test((await b.innerText()).trim())) { await b.click(); break; }
  await page.waitForTimeout(400);
  const settingsGeom = await page.evaluate(() => {
    const out = {};
    const labels = ['Sound', 'Music', 'Reduce motion', 'Play through the ring switch'];
    for (const l of labels) {
      const b = [...document.querySelectorAll('.chron__setting')].find((x) => x.innerText.startsWith(l));
      if (!b) { out[l] = 'MISSING'; continue; }
      const r = b.getBoundingClientRect();
      out[l] = { top: Math.round(r.top), inFold: r.top >= 0 && r.bottom <= window.innerHeight,
        needsScroll: r.bottom > window.innerHeight || r.top < 0 };
    }
    const trunk = [...document.querySelectorAll('button')].find((x) => /Open the trunk/.test(x.innerText));
    const tr = trunk?.getBoundingClientRect();
    out.trunk = trunk ? { top: Math.round(tr.top), inFold: tr.top >= 0 && tr.bottom <= window.innerHeight } : 'MISSING';
    out.scrollerHasOverflow = (() => {
      const s = document.querySelector('.chron__ledger');
      return s ? { scrollHeight: s.scrollHeight, clientHeight: s.clientHeight } : null;
    })();
    return out;
  });
  notes.push(`SETTINGS reachability mid-day (after 1 tap to Chronicles): ${JSON.stringify({ ...tapCount, ...settingsGeom })}`);

  // toggle reduced motion = tap 2, then export = taps
  const toggled = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.chron__setting')].find((x) => x.innerText.startsWith('Reduce motion'));
    if (!b) return 'MISSING';
    b.scrollIntoView({ block: 'center' });
    b.click();
    return window.__manorStore.getState().settings.reducedMotion;
  });
  notes.push(`REDUCED MOTION after tap 2: ${toggled}`);
  const trunkTaps = await page.evaluate(() => {
    const open = [...document.querySelectorAll('button')].find((x) => /Open the trunk/.test(x.innerText));
    if (!open) return 'MISSING';
    open.scrollIntoView({ block: 'center' }); open.click();
    const pack = [...document.querySelectorAll('button')].find((x) => /Pack \(copy code\)/.test(x.innerText));
    return { openTrunkTapIndex: 2, packPresentAfter: Boolean(pack), packTapIndex: 3 };
  });
  notes.push(`TRUNK tap path: ${JSON.stringify(trunkTaps)}`);
  // undo reduced motion so later passes are unaffected
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.chron__setting')].find((x) => x.innerText.startsWith('Reduce motion'));
    if (b && window.__manorStore.getState().settings.reducedMotion) b.click();
  });

  /* ---------- 15. unread: day roll + reload + clears on viewing ---------- */
  await page.click('.backlink');
  await page.waitForTimeout(400);
  const unreadBefore = await page.evaluate(() => {
    const host = [...document.querySelectorAll('.bp-foot button')].find((b) => /^Journal/.test(b.innerText));
    return host ? host.innerText.replace(/\s+/g, ' ').trim() : 'NO JOURNAL BUTTON';
  });
  // roll the day
  await page.evaluate(() => window.__manorStore.getState().endDay('retired-early'));
  await page.waitForTimeout(800);
  const nightExit = await probe('.chr-scene__btn');
  record('night digest overlay (.chr-scene)', '.chr-scene__btn', 'To tomorrow', summarise(nightExit),
    'next morning', `retire: ${await retireProbe('night')}`);
  const nightText = await page.evaluate(() => document.querySelector('.chr-scene')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 240));
  notes.push(`NIGHT DIGEST text: ${nightText}`);
  await page.click('.chr-scene__btn');
  await page.waitForTimeout(700);
  await page.click('.chr-scene__btn').catch(() => {});
  await page.waitForTimeout(500);
  await playScene();
  await page.waitForTimeout(400);
  const unreadAfterRoll = await page.evaluate(() => {
    const host = [...document.querySelectorAll('.bp-foot button')].find((b) => /^Journal/.test(b.innerText));
    return host ? host.innerText.replace(/\s+/g, ' ').trim() : 'NO JOURNAL BUTTON';
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const unreadAfterReload = await page.evaluate(() => {
    const host = [...document.querySelectorAll('.bp-foot button')].find((b) => /^Journal/.test(b.innerText));
    return host ? host.innerText.replace(/\s+/g, ' ').trim() : '(not on blueprint)';
  });
  notes.push(`UNREAD before roll: "${unreadBefore}" | after day roll: "${unreadAfterRoll}" | after reload: "${unreadAfterReload}"`);

  // clears only on viewing
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForTimeout(900);
  const journalTabs = await page.evaluate(() => [...document.querySelectorAll('.jrn-tab, [class*="tab"]')]
    .map((t) => t.innerText.replace(/\s+/g, ' ').trim()).slice(0, 10));
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(600);
  const unreadAfterView = await page.evaluate(() => {
    const host = [...document.querySelectorAll('.bp-foot button')].find((b) => /^Journal/.test(b.innerText));
    return host ? host.innerText.replace(/\s+/g, ' ').trim() : '(none)';
  });
  notes.push(`JOURNAL tabs: ${JSON.stringify(journalTabs)} | unread after viewing journal: "${unreadAfterView}"`);

  /* ---------- 16. dusk veil ---------- */
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    // drain steps to force dusk through the real ledger
    s.applyStepEntry({ reason: 'move', delta: -999, at: Date.now() });
  });
  await page.waitForTimeout(900);
  const duskUp = await page.$('.chr-dusk');
  if (duskUp) {
    const d = await probe('.chr-dusk__skip');
    record('dusk veil (.chr-dusk)', '.chr-dusk__skip', 'And so, to bed', summarise(d),
      'night digest', `retire: ${await retireProbe('dusk')}`);
  } else {
    notes.push(`DUSK: not reached by draining steps; phase=${(await st()).phase}`);
  }

  if (errors.length) notes.push(`CONSOLE ERRORS: ${errors.slice(0, 5).join(' | ')}`);

  /* ---------- artifact ---------- */
  console.log('\n=== PER-ROUTE ARTIFACT TABLE (' + VIEW.width + 'x' + VIEW.height + ') ===');
  console.log('| surface | exit control | hit test (centre+4 corners) | destination | notes |');
  console.log('|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.surface} | ${r.exit} | ${r.hit} | ${r.dest} | ${r.extra} |`);
  console.log('\n=== NOTES ===');
  for (const n of notes) console.log('- ' + n);
} catch (e) {
  console.error('[walk] THREW:', e.message, e.stack?.split('\n')[1]);
  console.log('\n=== PARTIAL TABLE ===');
  for (const r of rows) console.log(`| ${r.surface} | ${r.exit} | ${r.hit} | ${r.dest} | ${r.extra} |`);
  console.log('=== PARTIAL NOTES ===');
  for (const n of notes) console.log('- ' + n);
} finally {
  if (browser) await browser.close();
  server.kill();
}
