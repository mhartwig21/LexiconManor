/**
 * Round-8 live pass — dialogue-mystery (AAA §0.4).
 *
 *  A. The word games pay the mystery: a solved puzzle room and a solved Study
 *     each file a fragment, announced by a moment on the screen she is on.
 *  B. The door is a place: from the Entrance Hall /sanctum reads as the
 *     Stairwell (no guess row, no audience), its exit hit-tests and lands on
 *     the blueprint, and the journal points at the door instead of teleporting.
 *  C. From the landing the guess row is on glass and his opening is the
 *     first-arrival line, not the old "you have climbed far enough" on day 1.
 *
 * ONE browser, system Edge, closed in a finally (harness rules).
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5233/LexiconManor/';
const log = (...a) => console.log('[r8-wiring]', ...a);

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 30000 });
  await page.waitForTimeout(400);

  const boot = await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    s().startDay();
    for (let i = 0; i < 6 && s().day?.phase !== 'exploring'; i++) { s().advanceDayPhase(); await sleep(20); }
    return { day: s().day?.day, phase: s().day?.phase, frags: s().volume.foundFragmentIds.length };
  });
  log('A. booted:', JSON.stringify(boot));

  // --- A. the solve channels -------------------------------------------------
  const solve = await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const before = [...s().volume.foundFragmentIds];
    s().recordEvent({ type: 'room-solved', cellKey: '1,1', kind: 'word-web', tier: 1, perfect: false });
    await sleep(120);
    const afterLintel = [...s().volume.foundFragmentIds];
    s().recordEvent({ type: 'room-solved', cellKey: '3,1', kind: 'twistle', tier: 1, perfect: false });
    await sleep(120);
    const afterSecond = [...s().volume.foundFragmentIds];
    s().recordEvent({ type: 'room-solved', cellKey: '2,2', kind: 'forgotten-word', tier: 2, perfect: false });
    await sleep(120);
    const afterStudy = [...s().volume.foundFragmentIds];
    return { before, afterLintel, afterSecond, afterStudy };
  });
  log('A. a solved Library filed:', solve.afterLintel.filter((x) => !solve.before.includes(x)));
  log('A. a second solve the same day filed:', solve.afterSecond.filter((x) => !solve.afterLintel.includes(x)), '(expected: nothing — daily valve)');
  log('A. a solved Study filed:', solve.afterStudy.filter((x) => !solve.afterSecond.includes(x)));

  await page.waitForTimeout(500);
  const momentText = await page.$eval('.mom', (el) => el.innerText).catch(() => null);
  log('A. moment on glass at fire time:', JSON.stringify(momentText));
  const momentBox = await page.$('.mom').then((el) => el && el.boundingBox()).catch(() => null);
  log('A. moment box:', JSON.stringify(momentBox));
  for (let i = 0; i < 8; i++) { const m = await page.$('.mom'); if (!m) break; await m.click().catch(() => {}); await page.waitForTimeout(220); }

  // --- B. the stairwell ------------------------------------------------------
  const where = await page.evaluate(() => JSON.stringify(window.__manorStore.getState().manor?.playerCell));
  log('B. standing at:', where);
  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForTimeout(600);
  const stair = await page.evaluate(() => ({
    title: document.querySelector('.snc__title')?.textContent ?? null,
    line: document.querySelector('.snc-line')?.textContent?.slice(0, 120) ?? null,
    caption: document.querySelector('.snc-door__caption')?.textContent ?? null,
    guessRow: !!document.querySelector('.snc-input'),
    audience: !!document.querySelector('.snc-audience'),
  }));
  log('B. off-landing screen:', JSON.stringify(stair, null, 1));

  const back = await page.$('.snc__nav');
  const bb = await back.boundingBox();
  const hit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName}.${el.className}` : null;
  }, [bb.x + bb.width / 2, bb.y + bb.height / 2]);
  log('B. exit hit test at centre:', hit, '| box', JSON.stringify(bb));
  const corners = await page.evaluate(([x, y, w, h]) => ['tl', 'tr', 'bl', 'br'].map((c, i) => {
    const px = x + (i % 2 === 0 ? 4 : w - 4);
    const py = y + (i < 2 ? 4 : h - 4);
    const el = document.elementFromPoint(px, py);
    return `${c}:${el ? el.tagName + '.' + el.className : 'null'}`;
  }), [bb.x, bb.y, bb.width, bb.height]);
  log('B. exit corners:', corners.join(' '));
  await back.click();
  await page.waitForTimeout(500);
  log('B. route after tapping the exit:', await page.evaluate(() => location.hash));

  // --- B2. the journal no longer teleports -----------------------------------
  await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    while (s().volume.foundFragmentIds.length < 4) { s().collectFragmentForRoom('mystery'); await sleep(20); }
  });
  await page.evaluate(() => { location.hash = '#/journal'; });
  await page.waitForTimeout(700);
  const jr = await page.evaluate(() => ({
    frags: window.__manorStore.getState().volume.foundFragmentIds.length,
    link: !!document.querySelector('.jrn-nudge__link'),
    text: [...document.querySelectorAll('.jrn-nudge__text')].map((n) => n.textContent.slice(0, 90)),
  }));
  log('B2. journal with', jr.frags, 'fragments — Sanctum BUTTON present:', jr.link);
  log('B2. journal nudge copy:', JSON.stringify(jr.text));

  // --- C. from the landing ---------------------------------------------------
  await page.evaluate(() => {
    const store = window.__manorStore;
    const m = store.getState().manor;
    const landing = { col: 2, row: 5 };
    store.setState({
      manor: {
        ...m,
        rooms: {
          ...m.rooms,
          '2,5': { cardId: 'reading-nook', cell: landing, doors: ['N', 'S'], solved: true, kind: 'parlor' },
        },
        playerCell: landing,
      },
    });
    location.hash = '#/sanctum';
  });
  await page.waitForTimeout(700);
  const atDoor = await page.evaluate(() => ({
    title: document.querySelector('.snc__title')?.textContent ?? null,
    line: document.querySelector('.snc-line')?.textContent ?? null,
    caption: document.querySelector('.snc-door__caption')?.textContent ?? null,
    guessRow: !!document.querySelector('.snc-input'),
    audience: !!document.querySelector('.snc-audience'),
    landingFlag: window.__manorStore.getState().flags.filter((f) => f.includes('landing')),
  }));
  log('C. at the door:', JSON.stringify(atDoor, null, 1));

  // A second visit the same day, with the flag now set: the "again" shade.
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(300);
  await page.evaluate(() => { location.hash = '#/sanctum'; });
  await page.waitForTimeout(600);
  log('C. repeat visit line:', JSON.stringify(await page.evaluate(() => document.querySelector('.snc-line')?.textContent ?? null)));

  // …and an arrival on fumes.
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    let guard = 0;
    while (s().stepsRemaining() > 2 && guard++ < 200) {
      s().applyStepEntry({ reason: 'move', delta: -1, at: Date.now() });
    }
    location.hash = '#/sanctum';
  });
  await page.waitForTimeout(600);
  const spent = await page.evaluate(() => ({
    steps: window.__manorStore.getState().stepsRemaining(),
    line: document.querySelector('.snc-line')?.textContent ?? null,
  }));
  log('C. arrival on fumes (steps ' + spent.steps + '):', JSON.stringify(spent.line));
} finally {
  await browser.close();
}
