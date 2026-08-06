import { chromium } from 'playwright';
const BASE = 'http://localhost:5233/LexiconManor/';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
  await page.waitForTimeout(300);

  // --- A. warm Bramble to her ceiling, roll a fresh day, watch the pot ------
  await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    s().startDay();
    for (let i = 0; i < 6 && s().day?.phase !== 'exploring'; i++) { s().advanceDayPhase(); await sleep(20); }
    s().adjustAffinity('bramble', 6);
    s().endDay('retired-early'); await sleep(50);
    for (let i = 0; i < 4 && s().day?.phase !== 'night'; i++) { s().advanceDayPhase(); await sleep(20); }
  });
  await page.waitForTimeout(500);
  // night digest → tomorrow
  for (let i = 0; i < 6; i++) {
    const b = await page.$('.chr-scene__btn, .chr-digest__btn, .chr-dusk__skip');
    if (!b) break;
    await b.click().catch(() => {});
    await page.waitForTimeout(400);
    const ph = await page.evaluate(() => window.__manorStore.getState().day?.phase);
    if (ph === 'morning') break;
  }
  await page.evaluate(() => { const s = window.__manorStore.getState(); if (!s.day || s.day.phase === 'night') s.startDay(); });
  await page.waitForTimeout(250);
  const dawn = await page.evaluate(() => {
    const s = window.__manorStore.getState();
    return {
      day: s.day?.day, phase: s.day?.phase, steps: s.stepsRemaining(),
      teaEntries: s.ledger.entries.filter(e => e.reason === 'tea').map(e => e.delta),
      aff: s.affinities.bramble,
      floats: [...document.querySelectorAll('.chr-float')].map(n => n.textContent),
      headerVisible: (() => { const h = document.querySelector('.chr-header'); if (!h) return null; const r = h.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { rect: [r.x, r.y, r.width, r.height], topEl: el && el.className }; })(),
      morningCardText: document.querySelector('.chr-scene')?.innerText?.slice(0, 300) ?? null,
    };
  });
  console.log('[r7] DAWN with bramble=6:', JSON.stringify(dawn, null, 1));
  await page.screenshot({ path: 'docs/shots/round7/r7-dawn-tea.png' });

  // --- B. Sanctum with a thin file (0 fragments) — the 4.16 nudge ----------
  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForTimeout(700);
  const thin = await page.evaluate(() => ({
    lines: [...document.querySelectorAll('.snc-line')].map(n => n.innerText),
    journalLink: document.querySelector('.snc-journal-link')?.innerText,
    speakDisabled: document.querySelector('.snc-speak')?.disabled,
    anyMentionOfClimb: document.body.innerText.match(/landing|climb|stairs|door at the top/gi),
  }));
  console.log('[r7] SANCTUM thin-file:', JSON.stringify(thin, null, 1));
  await page.screenshot({ path: 'docs/shots/round7/r7-sanctum-thin.png' });

  // wrong guess from the ground floor
  const inp = await page.$('.snc-input');
  if (inp) {
    await inp.fill('CANDLE');
    await page.click('.snc-speak');
    await page.waitForTimeout(2200);
    const after = await page.evaluate(() => ({
      guesses: window.__manorStore.getState().volume.guesses,
      struck: [...document.querySelectorAll('.snc-struck__word')].map(n => n.innerText),
      dlg: !!document.querySelector('.dlg__sheet'),
      text: document.body.innerText.slice(0, 400),
    }));
    console.log('[r7] after wrong guess:', JSON.stringify(after, null, 1));
    await page.screenshot({ path: 'docs/shots/round7/r7-sanctum-wrong.png' });
  }

  // --- C. journal usefulness ----------------------------------------------
  await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 8; i++) { s().collectFragmentForRoom('mystery'); await sleep(15); }
    location.hash = '#/journal';
  });
  await page.waitForTimeout(800);
  const jrn = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.jrn-tabs button')].map(b => b.innerText.replace(/\s+/g, ' '));
    const link = document.querySelector('.jrn-nudge__link');
    let linkInfo = null;
    if (link) {
      const r = link.getBoundingClientRect();
      linkInfo = { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], inViewport: r.y >= 0 && r.bottom <= window.innerHeight, hit: (() => { const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el ? el.className : null; })() };
    }
    return { tabs, linkInfo, bodyLen: document.body.innerText.length, head: document.body.innerText.slice(0, 700) };
  });
  console.log('[r7] JOURNAL:', JSON.stringify(jrn, null, 1));
  await page.screenshot({ path: 'docs/shots/round7/r7-journal-8frag.png' });
} finally { await browser.close(); }
