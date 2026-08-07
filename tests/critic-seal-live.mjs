/**
 * Critic pass — the seal as shipped (manor-economy + dialogue-mystery).
 * ONE browser instance, system Edge, closed in a finally.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const SHOTS = resolve(root, 'docs/shots/critic-seal');
mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:4173/LexiconManor/';
const log = (...a) => console.log('[cs]', ...a);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(15000);
const sleep = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: resolve(SHOTS, n + '.png'), fullPage: false });

const drain = async (limit = 10) => {
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

async function playScene() {
  await page.waitForSelector('.dlg', { timeout: 8000 }).catch(() => {});
  for (let i = 0; i < 60 && (await page.$('.dlg')); i++) {
    const p = await page.$('.dlg-choice--primary');
    if (p) { await p.click(); await sleep(150); continue; }
    const c = await page.$('.dlg-choices .dlg-choice:not(.dlg-choice--gift)');
    if (c) { await c.click(); await sleep(150); continue; }
    await page.dispatchEvent('.dlg__sheet', 'pointerdown').catch(() => {});
    await sleep(150);
  }
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('lexicon-manor'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=Begin the first day', { timeout: 20000 });
  await page.click('text=Begin the first day');
  await page.waitForSelector('.chr-scene');
  await page.click('.chr-scene__btn');
  await playScene();
  await page.waitForSelector('.bp-sheet');
  await drain();

  // --- Plant a realistic mid-campaign seal backlog: file 5 fragments sealed.
  // Uses the REAL slice action the violet room calls (collectFragmentForRoom).
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    for (let i = 0; i < 5; i++) window.__manorStore.getState().collectFragmentForRoom('mystery');
    // and one legible one, via the letter channel, so the tabs are mixed
    window.__manorStore.getState().fileFragment('v1-t1');
  });
  await sleep(400);
  await drain(14);

  const state = await page.evaluate(() => {
    const s = window.__manorStore.getState();
    const pre = `vol.${s.volume.volumeId}.`;
    const ids = (p) => s.flags.filter((f) => f.startsWith(pre + p)).map((f) => f.slice((pre + p).length));
    const leg = new Set(ids('legible-'));
    return {
      found: s.volume.foundFragmentIds,
      sealed: ids('sealed-').filter((i) => !leg.has(i)),
    };
  });
  log('planted:', JSON.stringify(state));

  // === 1. BLUEPRINT ENTRANCE — is the seal chain unbroken at the main screen?
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.bp-sheet');
  await sleep(500); await drain();
  const entrance = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.bp-btn--quiet')].find((b) => /^\s*Journal/.test(b.textContent ?? ''));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return {
      text: btn.textContent.trim(),
      wax: btn.querySelectorAll('.unread').length,
      waxN: btn.querySelector('.unread__n')?.textContent ?? null,
      seal: btn.querySelectorAll('.sealed').length,
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    };
  });
  log('BLUEPRINT Journal entrance:', JSON.stringify(entrance));
  await shot('01-blueprint-entrance-390');

  // === 2. THE JOURNAL, WORD TAB — how many times is she told to solve a room?
  await page.goto(BASE + '#/journal', { waitUntil: 'networkidle' });
  await page.waitForSelector('.jrn-tabs');
  await sleep(700); await drain();
  const wordTab = await page.evaluate(() => {
    const body = document.querySelector('.jrn')?.innerText ?? '';
    const count = (re) => (body.match(re) ?? []).length;
    return {
      innerText: body,
      solveVerbs: {
        'Solve a room': count(/Solve a room/g),
        'Finish a room': count(/Finish a room/gi),
        'finishing a room': count(/finishing a room/gi),
        'Solve something': count(/Solve something/gi),
        'solve a room to make it out': count(/solve a room to make it out/gi),
      },
      sealedLines: document.querySelectorAll('.jrn-poem__line--sealed').length,
      sealedLabels: document.querySelectorAll('.jrn-sealed__label').length,
      rail: document.querySelector('.jrn-rail__backlog')?.innerText ?? null,
      nudge: document.querySelector('.jrn-nudge__text')?.innerText ?? null,
      scrollH: document.querySelector('.jrn-sheet')?.scrollHeight,
      clientH: document.querySelector('.jrn-sheet')?.clientHeight,
    };
  });
  log('WORD TAB verbs:', JSON.stringify(wordTab.solveVerbs));
  log('sealed lines', wordTab.sealedLines, 'labels', wordTab.sealedLabels);
  log('rail:', JSON.stringify(wordTab.rail));
  log('nudge:', JSON.stringify(wordTab.nudge));
  log('sheet scroll', wordTab.scrollH, '/', wordTab.clientH);
  log('--- WORD TAB TEXT ---\n' + wordTab.innerText);
  await shot('02-journal-word-sealed-390');

  // Engravings tab
  const tabs = await page.$$('.jrn-tab');
  for (const t of tabs) {
    const label = (await t.textContent()) ?? '';
    if (label.trim().startsWith('Engravings')) { await t.click(); break; }
  }
  await sleep(400);
  const engTab = await page.evaluate(() => ({
    text: document.querySelector('.jrn-sheet')?.innerText ?? '',
    sealedCards: document.querySelectorAll('.jrn-card--sealed').length,
  }));
  log('ENGRAVINGS sealed cards:', engTab.sealedCards);
  log('--- ENGRAVINGS TEXT ---\n' + engTab.text);
  await shot('03-journal-engravings-sealed-390');

  // === 3. 375x667
  await page.setViewportSize({ width: 375, height: 667 });
  await sleep(400);
  const small = await page.evaluate(() => {
    const rail = document.querySelector('.jrn-rail');
    const sheet = document.querySelector('.jrn-sheet');
    const r = rail?.getBoundingClientRect();
    const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
    return {
      railBox: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
      railInViewport: r ? (r.bottom <= window.innerHeight + 1 && r.top >= 0) : null,
      hitAtRailCentre: hit ? (hit.className || hit.tagName) : null,
      sheetScroll: sheet ? [sheet.scrollHeight, sheet.clientHeight] : null,
      docScroll: [document.documentElement.scrollHeight, window.innerHeight],
    };
  });
  log('375x667:', JSON.stringify(small));
  await shot('04-journal-engravings-375');
  await page.$$eval('.jrn-tab', (ts) => { const w = ts.find((t) => t.textContent.trim().startsWith('The Word')); w?.click(); });
  await sleep(400);
  await shot('05-journal-word-375');
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(300);

  // === 4. THE SANCTUM, read from downstairs, with a sealed backlog
  await page.goto(BASE + '#/sanctum', { waitUntil: 'networkidle' });
  await page.waitForSelector('.snc');
  await sleep(600); await drain();
  const snc = await page.evaluate(() => ({
    text: document.querySelector('.snc')?.innerText ?? '',
    title: document.querySelector('.snc__title')?.textContent,
    hasInput: !!document.querySelector('.snc-input'),
    link: document.querySelector('.snc-journal-link')?.textContent,
  }));
  log('--- SANCTUM (from downstairs) ---\n' + snc.text);
  await shot('06-sanctum-downstairs-390');

  // === 5. AT THE DOOR — plant her on the landing with a north door
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    const cell = { col: 2, row: 5 };
    window.__manorStore.setState({
      manor: {
        ...s.manor,
        playerCell: cell,
        rooms: {
          ...s.manor.rooms,
          '2,5': { cardId: 'reading-nook', cell, doors: ['N', 'S'], solved: true, kind: 'parlor' },
        },
      },
    });
  });
  await sleep(400);
  await page.goto(BASE + '#/sanctum', { waitUntil: 'networkidle' });
  await page.waitForSelector('.snc');
  await sleep(700); await drain();
  const atDoor = await page.evaluate(() => ({
    text: document.querySelector('.snc')?.innerText ?? '',
    hasInput: !!document.querySelector('.snc-input'),
    link: document.querySelector('.snc-journal-link')?.textContent,
    gate: document.querySelector('.snc-line--nudge')?.textContent ?? null,
  }));
  log('--- SANCTUM (at the door, 5 sealed + 1 legible) ---\n' + atDoor.text);
  log('journal link copy:', JSON.stringify(atDoor.link));
  log('gate nudge:', JSON.stringify(atDoor.gate));
  await shot('07-sanctum-at-door-390');

  // === 6. DAY-ONE WINNABILITY (AAA 4.18): type the word at the door.
  const win = await page.evaluate(() => {
    const s = window.__manorStore.getState();
    return { day: s.day?.day, status: s.volume.status };
  });
  log('before guess:', JSON.stringify(win));
  await page.fill('.snc-input', 'LACUNA');
  await page.click('.snc-speak');
  await sleep(2500);
  const afterGuess = await page.evaluate(() => ({
    status: window.__manorStore.getState().volume.status,
    phase: document.querySelector('.snc-won') ? 'won-reveal' : (document.querySelector('.snc-epilogue') ? 'epilogue' : 'other'),
    body: document.querySelector('.snc')?.innerText?.slice(0, 400),
  }));
  log('after speaking LACUNA:', JSON.stringify(afterGuess));
  await shot('08-sanctum-won-390');
} catch (e) {
  console.error('[cs] ERROR', e.message);
  await shot('99-failure').catch(() => {});
} finally {
  await browser.close();
}
