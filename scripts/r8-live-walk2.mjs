/**
 * r8-live-walk2.mjs — round 8 live pass, part 2: notice visibility, unread
 * chain, modality, victory ceremony, tap counts. ONE Edge instance, finally.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = process.env.WALK_VIEW === 'short'
  ? { width: 375, height: 667 } : { width: 390, height: 844 };
const REDUCED = process.env.WALK_REDUCED === '1';

async function freePort(from = 5361, to = 5399) {
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
const out = [];
const say = (s) => { out.push(s); console.log('[w2] ' + s); };

const server = spawn(process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const up = (async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview did not answer');
})();

let browser;
try {
  await up;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: 2,
    reducedMotion: REDUCED ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  const hash = () => page.evaluate(() => location.hash);

  /** geometry + who paints on top (pointer-events temporarily forced) */
  const paintProbe = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const prev = el.style.pointerEvents;
    el.style.pointerEvents = 'auto';
    const r = el.getBoundingClientRect();
    const pts = [['centre', r.x + r.width / 2, r.y + r.height / 2],
      ['tl', r.x + 5, r.y + 5], ['tr', r.right - 5, r.y + 5],
      ['bl', r.x + 5, r.bottom - 5], ['br', r.right - 5, r.bottom - 5]];
    const res = pts.map(([w, x, y]) => {
      const h = document.elementFromPoint(x, y);
      const cls = h ? (typeof h.className === 'string' ? h.className : '') : '';
      const anc = Boolean(h && h.contains && h.contains(el)); // hit is our own ancestor => radius artifact
      return { w, own: Boolean(h && (h === el || el.contains(h))), ancestor: anc,
        hit: h ? `${h.tagName.toLowerCase()}.${cls}` : 'null' };
    });
    el.style.pointerEvents = prev;
    return { found: true, res, size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight,
      inFold: r.top >= 0 && r.bottom <= window.innerHeight,
      radius: cs.borderRadius, opacity: cs.opacity, z: cs.zIndex,
      text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) };
  }, sel);

  async function playScene() {
    for (let i = 0; i < 70 && (await page.$('.dlg')); i++) {
      const p = await page.$('.dlg-choice--primary');
      if (p) { await p.click(); await page.waitForTimeout(180); continue; }
      const c = await page.$('.dlg-choice');
      if (c) { await c.click(); await page.waitForTimeout(180); continue; }
      await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
      await page.waitForTimeout(150);
    }
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-scene__title');
  say(`viewport ${VIEW.width}x${VIEW.height}, reducedMotion=${REDUCED}`);

  // 1. front-step control geometry (radius vs bury)
  say(`FRONT STEP seal: ${JSON.stringify(await paintProbe('.bp-btn--seal'))}`);

  // to exploring
  await page.click('.bp-btn--seal');
  await page.waitForSelector('.chr-scene');

  // 2. MODALITY of the page beneath the morning card (11.5 spirit)
  const beneath = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.bp-foot button')];
    return btns.map((b) => {
      const r = b.getBoundingClientRect();
      const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { label: b.innerText.replace(/\s+/g, ' ').trim(),
        reachable: Boolean(h && (h === b || b.contains(h))),
        hit: h ? h.tagName.toLowerCase() + '.' + (typeof h.className === 'string' ? h.className : '') : 'null' };
    });
  });
  say(`UNDER MORNING CARD, blueprint footer buttons: ${JSON.stringify(beneath)}`);

  // 3. moment on the morning card (letter arrival) — paint order
  say(`MOMENT on morning card: ${JSON.stringify(await paintProbe('.mom'))}`);

  await page.click('.chr-scene__btn');
  await page.waitForSelector('.dlg');
  // 4. notice rail paint order behind the dialogue overlay
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    s.recordEvent({ type: 'affinity-rank-up', character: 'bramble', rank: 2 });
    s.recordEvent({ type: 'room-drafted', cellKey: '0,0', cardId: 'gem-vault', category: 'utility' });
  });
  await page.waitForTimeout(500);
  say(`NOTICE RAIL behind .dlg (paint order): ${JSON.stringify(await paintProbe('.chr-notice'))}`);
  await page.screenshot({ path: 'r8-notice-behind-dlg.png' });
  await playScene();
  await page.waitForFunction(() => window.__manorStore.getState().day?.phase === 'exploring');
  await page.waitForTimeout(300);

  // 5. currency deltas (11.15) — gems/keys changing while exploring
  const floats = await page.evaluate(async () => {
    const store = window.__manorStore;
    store.setState((s) => ({ currencies: { ...s.currencies, gems: s.currencies.gems + 2, keys: s.currencies.keys + 1 } }));
    await new Promise((r) => setTimeout(r, 250));
    const f = [...document.querySelectorAll('.chr-float')].map((e) => ({
      cls: e.className, txt: e.innerText.trim(),
      parent: e.parentElement?.className,
      size: `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`,
    }));
    const step = [...document.querySelectorAll('.chr-header')].map((e) => e.innerText.replace(/\s+/g, ' ').trim());
    return { f, step };
  });
  say(`CURRENCY FLOATS on gem+2 / key+1: ${JSON.stringify(floats)}`);

  // 6. unread chain detail on the blueprint entrance
  const entrance = await page.evaluate(() => {
    const host = [...document.querySelectorAll('.bp-foot button')].find((b) => /^Journal/.test(b.innerText));
    const mark = host?.querySelector('[class*="unread"]');
    const s = window.__manorStore.getState();
    return { label: host?.innerText.replace(/\s+/g, ' ').trim(),
      mark: mark ? { cls: mark.className, txt: mark.innerText.trim(),
        size: `${Math.round(mark.getBoundingClientRect().width)}x${Math.round(mark.getBoundingClientRect().height)}` } : null,
      fragments: s.volume.foundFragmentIds.length };
  });
  say(`ENTRANCE unread: ${JSON.stringify(entrance)}`);

  // 7. journal: tabs + cards, chain truthfulness (11.19/11.21), letter open grant
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForTimeout(800);
  const chain = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[class*="tab"]')].map((t) => ({
      txt: t.innerText.replace(/\s+/g, ' ').trim().slice(0, 30),
      mark: Boolean(t.querySelector('[class*="unread"]')),
      markTxt: t.querySelector('[class*="unread"]')?.innerText?.trim() ?? null,
    }));
    const marks = [...document.querySelectorAll('[class*="unread"]')].map((m) => ({
      cls: m.className, txt: m.innerText.trim(),
      size: `${Math.round(m.getBoundingClientRect().width)}x${Math.round(m.getBoundingClientRect().height)}`,
    }));
    return { tabs, marks };
  });
  say(`JOURNAL chain: ${JSON.stringify(chain)}`);

  // open the letters tab and open a letter FROM the journal screen
  const openedLetter = await page.evaluate(async () => {
    const tab = [...document.querySelectorAll('button')].find((b) => /^Letters/.test(b.innerText));
    if (tab) tab.click();
    await new Promise((r) => setTimeout(r, 400));
    const head = document.querySelector('.jrn-letter__head');
    const before = window.__manorStore.getState().volume.foundFragmentIds.length;
    if (head) head.click();
    await new Promise((r) => setTimeout(r, 700));
    return { clicked: Boolean(head), before, after: window.__manorStore.getState().volume.foundFragmentIds.length };
  });
  say(`LETTER opened from /journal: ${JSON.stringify(openedLetter)}`);
  say(`MOMENT on /journal after letter: ${JSON.stringify(await paintProbe('.mom'))}`);
  await page.screenshot({ path: 'r8-moment-journal.png' });

  // 8. fragment via a dialogue node — provoke from behind the dialogue overlay
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const store = window.__manorStore; const s = store.getState();
    const c = s.manor.playerCell; const key = `${c.col},${c.row}`;
    store.setState({ manor: { ...s.manor, rooms: { ...s.manor.rooms,
      [key]: { ...s.manor.rooms[key], cardId: 'reading-nook', kind: 'parlor', solved: false } } } });
  });
  await page.waitForTimeout(250);
  const btns = await page.$$('.bp-btn');
  for (const b of btns) if (/^Call on/.test((await b.innerText()).trim())) { await b.click(); break; }
  await page.waitForSelector('.dlg').catch(() => {});
  if (await page.$('.dlg')) {
    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      const id = s.volume.foundFragmentIds;
      // the dialogue-testimony channel: A7's collect for a character scene
      s.collectFragmentForRoom('mystery');
      return id.length;
    });
    await page.waitForTimeout(600);
    say(`MOMENT behind .dlg (testimony channel): ${JSON.stringify(await paintProbe('.mom'))}`);
    await page.screenshot({ path: 'r8-moment-dlg.png' });
    // dismiss the moment and check the dialogue is still usable
    await page.click('.mom').catch(() => {});
    await page.waitForTimeout(300);
    await playScene();
  }

  // 9. Sanctum: victory ceremony (the biggest campaign moment) and its exits
  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForTimeout(600);
  const sancBefore = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => b.getBoundingClientRect().width > 0)
    .map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  say(`SANCTUM controls: ${JSON.stringify(sancBefore)}`);
  const guessed = await page.evaluate(async () => {
    const s = window.__manorStore.getState();
    s.guessAtSanctum('LACUNA');
    await new Promise((r) => setTimeout(r, 900));
    return { solved: window.__manorStore.getState().volume.solved ?? null,
      html: [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0)
        .map((b) => b.innerText.replace(/\s+/g, ' ').trim()) };
  });
  say(`SANCTUM after correct guess: ${JSON.stringify(guessed)}`);
  await page.waitForTimeout(600);
  const ceremonyExit = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0);
    return btns.map((b) => {
      const r = b.getBoundingClientRect();
      const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { label: b.innerText.replace(/\s+/g, ' ').trim().slice(0, 40),
        own: Boolean(h && (h === b || b.contains(h))),
        inFold: r.top >= 0 && r.bottom <= window.innerHeight,
        size: `${Math.round(r.width)}x${Math.round(r.height)}` };
    });
  });
  say(`CEREMONY controls + hit test: ${JSON.stringify(ceremonyExit)}`);
  await page.screenshot({ path: 'r8-ceremony.png' });

  // 10. taps to the trunk, real clicks, mid-day
  await page.evaluate(() => { location.hash = '#/chronicles'; });
  await page.waitForTimeout(600);
  let taps = 1; // tap 1 was the Chronicles entrance (measured on the blueprint earlier)
  const trunkBtn = await page.$('text=Open the trunk');
  if (trunkBtn) { await trunkBtn.scrollIntoViewIfNeeded(); await trunkBtn.click(); taps++; }
  await page.waitForTimeout(400);
  const packVisible = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Pack \(copy code\)/.test(x.innerText));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { size: `${Math.round(r.width)}x${Math.round(r.height)}`, inFold: r.top >= 0 && r.bottom <= window.innerHeight };
  });
  say(`TRUNK: taps to reveal export/import = ${taps} (then 1 more to pack). pack control: ${JSON.stringify(packVisible)}`);
  const scrollNeed = await page.evaluate(() => {
    const l = document.querySelector('.chron__ledger');
    const set = [...document.querySelectorAll('.chron__setting')][0];
    return { scrollTopNeededForSettings: set ? Math.round(set.getBoundingClientRect().top + l.scrollTop - 100) : null,
      ledger: l ? { scrollHeight: l.scrollHeight, clientHeight: l.clientHeight, scrollTop: Math.round(l.scrollTop) } : null };
  });
  say(`CHRONICLES scroll geometry: ${JSON.stringify(scrollNeed)}`);

  // 11. reduced-motion legibility of the unread mark (11.22)
  const markStyle = await page.evaluate(() => {
    const el = document.querySelector('[class*="unread"]');
    if (!el) return 'no mark on this screen';
    const cs = getComputedStyle(el);
    return { cls: el.className, bg: cs.backgroundColor, color: cs.color, content: el.innerText.trim(),
      borderRadius: cs.borderRadius, animation: cs.animation };
  });
  say(`UNREAD MARK style: ${JSON.stringify(markStyle)}`);
} catch (e) {
  say(`THREW: ${e.message}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
