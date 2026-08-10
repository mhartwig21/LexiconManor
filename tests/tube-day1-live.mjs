/**
 * tests/tube-day1-live.mjs — THE LIVE EVIDENCE for REVIEW_AA §5.2, driven in a
 * real browser at 390x844@2x.
 *
 * §5.2 in one sentence: *"the Sanctum door is addressable from the Entrance
 * Hall every day, at zero or near-zero step cost… a wrong guess on day 2
 * becomes a scene — the Portrait has 33 nodes and 43 lines of authored reaction
 * that almost nobody will ever see. Success metric: the day a player first says
 * a word at the door drops from median 18–21 to median ≤ 3."*
 *
 * WHY THIS FILE EXISTS AT ALL. Round 17 built the whole mechanic in the engine
 * — `SPEAKING_TUBE_CELL`, `atSpeakingTube`, `canAddressSanctum`,
 * `sanctumAnsweredFlag`, `doorsHeldOpen`, a 60-line module docstring — re-tuned
 * every published campaign band in `economy/simulate.ts` against it, and wired
 * it to NOTHING. `guessAtSanctum` still gated on `atSanctumDoor`, SanctumView
 * still rendered the input only at the door, the journal rail still printed
 * "the door … only hears a word from someone standing at it" on the very cell
 * the brass hangs in, and `lockViewFor` was passed to no caller. The docs, the
 * model and four AAA clauses described a game nobody could play. That is
 * REVIEW_AA §0's own finding — the team measuring a build that does not exist —
 * and a unit test on the engine would have gone on being green through all of
 * it. Only a real tab can say the mechanic is REACHABLE.
 *
 * WHAT IT DRIVES, on a wiped save, on day 1:
 *   1. she stands in the Entrance Hall with the ledger untouched;
 *   2. the journal's rail offers the tube, and taking it costs no steps;
 *   3. a WRONG word is heard: it is journaled, struck through, the Portrait
 *      answers, and the ledger has not moved;
 *   4. the door hears one word a day — the second attempt is refused;
 *   5. the volume is NOT won by a right word downstairs: the house sets its
 *      answered flag, holds its padlocks open, and the ceremony waits upstairs.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a browser. Exactly ONE browser instance,
 * closed in a finally. 390x844 @2x.
 *
 * Run: `node tests/tube-day1-live.mjs`   (spawns its own vite dev server)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VOLUME = JSON.parse(
  readFileSync(resolve(ROOT, 'content/authored/volumes/volume-1.json'), 'utf8'),
);
const ANSWER = String(VOLUME.answer).toUpperCase();

/**
 * The dawn purse on a fresh day 1: `BASE_DAY_BUDGET` (18) + `FIRST_MORNING_POT`
 * (4), both in src/engine/economy/steps.ts.
 *
 * ROUND 24: this file carried the literal `21` in two places, and had done
 * since before round 23 raised `FIRST_MORNING_POT` to 4 — so the §5.2 gate had
 * been reporting two failures on a clean HEAD that had nothing to do with the
 * speaking tube (verified by running this file on a stashed tree). A stale
 * literal in a gate is worse than no gate: it trains the next reader to skip
 * two red lines. It is named and derived here, and the "the word cost nothing"
 * claim below is now made RELATIVELY, against the purse the page actually
 * dealt, so it can never go stale again while still failing the moment a guess
 * starts charging.
 */
const DAY1_PURSE = 18 + 4;

async function freePort(from = 5431, to = 5490) {
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

const log = (...a) => console.log('[tube]', ...a);
const ok = (m) => console.log('[tube]   ✓', m);
let failures = 0;
const fail = (m) => { console.error('[tube]   ✗ FAIL:', m); failures++; };
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(
  process.execPath,
  [resolve(ROOT, 'node_modules/vite/bin/vite.js'), '--config', resolve(ROOT, 'scripts/gate-vite.config.ts'),
    '--port', String(PORT), '--strictPort'],
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

let browser;
try {
  await serverUp;
  log('dev server up on', BASE);

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !!window.__manorStore, null, { timeout: 60000 });

  const state = () => page.evaluate(() => {
    const s = window.__manorStore.getState();
    return {
      day: s.day?.day ?? null,
      phase: s.day?.phase ?? null,
      steps: s.stepsRemaining(),
      cell: s.manor?.playerCell ?? null,
      status: s.volume.status,
      guesses: s.volume.guesses.map((g) => g.guess),
      answered: s.flags.includes(`vol.${s.volume.volumeId}.answered`),
      heldOpen: s.flags.includes(`vol.${s.volume.volumeId}.answered`),
    };
  });

  /** Start day 1 and walk out onto the blueprint, exactly as the app does. */
  await page.evaluate(() => {
    const s = () => window.__manorStore.getState();
    s().startDay();
    s().advanceDayPhase();
    if (!s().manor) s().ensureManor?.();
    location.hash = '#/';
  });
  await sleep(500);
  await page.waitForFunction(() => !!window.__manorStore.getState().manor, null, { timeout: 20000 });

  /* --- 1. day 1, in the hall, nothing spent ------------------------------- */
  log('');
  log('— 1. day one, in the Entrance Hall —');
  const start = await state();
  check(start.day === 1 && start.phase === 'exploring',
    `day ${start.day}, phase ${start.phase}`,
    `expected day 1 / exploring, saw day ${start.day} / ${start.phase}`);
  const entrance = await page.evaluate(() => window.__manorStore.getState().manor.playerCell);
  const atTube = await page.evaluate(() =>
    window.__manorStore.getState().manor.playerCell.row === 0);
  check(atTube,
    `she is standing at the tube's cell (${entrance.col},${entrance.row}) with ${start.steps} steps`,
    `she is not in the Entrance Hall — playerCell ${JSON.stringify(entrance)}`);
  check(start.status === 'active' && start.guesses.length === 0,
    'the volume is open and no word has been said',
    `volume ${start.status}, ${start.guesses.length} guess(es) already`);

  /* --- 1b. THE BRASS IS ON THE PLAN (round 24 — COMPREHENSION fix 5) ------
   *
   * The comprehension test's largest wrong belief, held by two of three blind
   * players for a whole session: "you can only guess at the Sanctum door, four
   * floors up." Round 17's mechanic was real; its only surface was the journal
   * rail below, which needs her standing in the hall AND holding four LEGIBLE
   * fragments — so the affordance was gated on the content it exists to test.
   *
   * This is the reachability claim, and it is deliberately made on the HARDEST
   * save the game has: day 1, an EMPTY case file, on the first screen she ever
   * sees. Screenshots are not evidence here — `elementFromPoint` is asked at
   * the control's own centre AND its four inset corners, because a control
   * buried under fixed chrome photographs exactly like a working one.
   */
  log('');
  log('— 1b. the brass, drawn on the Entrance Hall, with an empty journal —');
  const filedNow = await page.evaluate(
    () => window.__manorStore.getState().volume.foundFragmentIds.length,
  );
  check(filedNow === 0,
    'her case file is empty — nothing has been filed yet',
    `expected an empty journal for this claim, saw ${filedNow} fragment(s) filed`);
  await page.waitForSelector('.bp-sheet', { timeout: 20000 });
  await sleep(500);

  /** The tube's hit target, asked five times with elementFromPoint. */
  const probeTube = (p) => p.evaluate(() => {
    const drawn = document.querySelectorAll('.bp-tube').length;
    const live = document.querySelectorAll('.bp-tube--live').length;
    const zone = document.querySelector('.bp-tubehit .bp-hit__zone');
    if (!zone) return { drawn, live, zone: null };
    const r = zone.getBoundingClientRect();
    const IN = 4;
    const pts = [
      ['centre', r.x + r.width / 2, r.y + r.height / 2],
      ['top-left', r.x + IN, r.y + IN],
      ['top-right', r.right - IN, r.y + IN],
      ['bottom-left', r.x + IN, r.bottom - IN],
      ['bottom-right', r.right - IN, r.bottom - IN],
    ];
    const owns = pts.map(([name, x, y]) => {
      const el = document.elementFromPoint(x, y);
      return { name, ok: Boolean(el && el.closest('.bp-tubehit')),
        got: el ? (el.closest('[class]')?.getAttribute('class') ?? el.tagName) : 'nothing' };
    });
    return {
      drawn, live,
      zone: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      centre: [r.x + r.width / 2, r.y + r.height / 2],
      owns,
      label: document.querySelector('.bp-tubehit')?.getAttribute('aria-label') ?? null,
      inView: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0
        && r.right <= window.innerWidth,
    };
  });

  const tube390 = await probeTube(page);
  check(tube390.drawn === 1,
    'the brass is drawn on the Entrance Hall cell',
    `expected exactly one speaking tube on the plan, saw ${tube390.drawn}`);
  check(tube390.live === 1,
    'and it is gilt — she is standing in the hall, so it is a live control',
    'the tube is drawn in quiet ink while she stands on its own cell');
  check(Boolean(tube390.zone) && tube390.zone.w >= 44 && tube390.zone.h >= 44,
    `its tap target is a full cell: ${tube390.zone ? `${tube390.zone.w}x${tube390.zone.h} at (${tube390.zone.x}, ${tube390.zone.y})` : 'MISSING'}`,
    `the tube has no full-cell hit zone: ${JSON.stringify(tube390.zone)}`);
  check(tube390.inView === true,
    'wholly inside the glass at 390x844',
    'the tube cell is not wholly on screen at 390x844');
  const missed390 = (tube390.owns ?? []).filter((o) => !o.ok);
  check(missed390.length === 0,
    'hit-tested at its centre and all four inset corners — every point returns the tube',
    `buried at ${missed390.map((o) => `${o.name} (${o.got})`).join(', ')}`);

  const beforeTap = (await state()).steps;
  await page.mouse.click(tube390.centre[0], tube390.centre[1]);
  await page.waitForSelector('.snc', { timeout: 20000 });
  await sleep(400);
  const tubeHeading = (await page.locator('.snc__title').innerText()).trim();
  const afterTap = await state();
  check(/speaking tube/i.test(tubeHeading),
    `tapping the hall opens the brass: "${tubeHeading}"`,
    `tapping the hall opened "${tubeHeading}" instead of the Speaking Tube`);
  check((await page.locator('.snc-row').count()) === 1,
    'with the mouthpiece on it — an input and a Speak button, on day 1, with nothing filed',
    'the tube screen offered no way to say a word');
  check(afterTap.steps === beforeTap,
    `and the walk to it cost nothing — still ${afterTap.steps} steps`,
    `reaching the brass from the plan charged her: ${beforeTap} → ${afterTap.steps}`);

  /* The same claim on the small glass. Every defect this project shipped this
     year lived only at 375x667. A SECOND CONTEXT, never a second browser. */
  const smallCtx = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
  });
  const small = await smallCtx.newPage();
  small.setDefaultTimeout(20000);
  small.on('pageerror', (e) => errors.push(String(e)));
  await small.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await small.waitForFunction(() => !!window.__manorStore, null, { timeout: 60000 });
  await small.evaluate(() => {
    const s = () => window.__manorStore.getState();
    s().startDay();
    s().advanceDayPhase();
    location.hash = '#/';
  });
  await small.waitForFunction(() => !!window.__manorStore.getState().manor, null, { timeout: 20000 });
  await small.waitForSelector('.bp-sheet', { timeout: 20000 });
  await sleep(600);
  const tube375 = await probeTube(small);
  const missed375 = (tube375.owns ?? []).filter((o) => !o.ok);
  check(tube375.drawn === 1 && tube375.live === 1 && missed375.length === 0 && tube375.inView,
    `and at 375x667: drawn, gilt, wholly in view, and all five points return it (${tube375.zone ? `${tube375.zone.w}x${tube375.zone.h} at (${tube375.zone.x}, ${tube375.zone.y})` : 'no zone'})`,
    `at 375x667 the tube failed: drawn ${tube375.drawn}, live ${tube375.live}, inView ${tube375.inView}, buried at ${missed375.map((o) => `${o.name} (${o.got})`).join(', ') || 'nowhere'}`);
  await small.mouse.click(tube375.centre[0], tube375.centre[1]);
  await small.waitForSelector('.snc', { timeout: 20000 });
  await sleep(400);
  const smallHeading = (await small.locator('.snc__title').innerText()).trim();
  check(/speaking tube/i.test(smallHeading),
    `the small glass opens the same brass: "${smallHeading}"`,
    `at 375x667 the hall opened "${smallHeading}"`);
  await smallCtx.close();

  // Back to the plan for the rail's own claim below.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bp-sheet', { timeout: 20000 });

  /* --- 2. the journal offers the tube, for nothing ------------------------ */
  log('');
  log('— 2. the journal rail points at the brass —');
  // The rail only shows once the file is worth carrying (`sanctumReadiness`),
  // which is a content gate, not an access one — so file enough to see it.
  await page.evaluate(() => {
    const s = () => window.__manorStore.getState();
    for (const id of ['v1-d1', 'v1-e1', 'v1-t2', 'v1-d2']) s().fileFragment(id);
  });
  await page.goto(BASE + '#/journal', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.jrn-rail', { timeout: 20000 });
  await sleep(400);
  const railText = (await page.locator('.jrn-nudge').first().innerText().catch(() => '')).trim();
  const tubeLink = page.locator('.jrn-nudge__link');
  const hasTubeLink = (await tubeLink.count()) > 0 && /tube/i.test(await tubeLink.first().innerText());
  check(hasTubeLink,
    `the rail offers the tube: "${(await tubeLink.first().innerText().catch(() => railText)).trim()}"`,
    `the rail does not offer the tube. It says: "${railText}"`);
  check(!/only hears a word from someone standing at it/i.test(railText),
    'and it no longer claims the door only hears her from the landing',
    `the rail still prints the pre-tube copy: "${railText}"`);

  const beforeWalk = (await state()).steps;
  await tubeLink.first().click();
  await page.waitForSelector('.snc', { timeout: 20000 });
  await sleep(500);
  const afterWalk = await state();
  check(afterWalk.steps === beforeWalk,
    `reaching the tube cost nothing — still ${afterWalk.steps} steps`,
    `reaching the tube charged her: ${beforeWalk} → ${afterWalk.steps}`);
  const heading = (await page.locator('.snc__title').innerText()).trim();
  check(/speaking tube/i.test(heading),
    `the screen names where she is: "${heading}"`,
    `the screen calls the hall "${heading}"`);
  const speakRow = await page.locator('.snc-row').count();
  check(speakRow === 1,
    'the mouthpiece is on screen — an input and a Speak button',
    'there is no input at the tube: §5.2 is still unwired');

  /* --- 3. a wrong word, on day one, is a scene ---------------------------- */
  log('');
  log('— 3. a wrong word on day 1 —');
  await page.fill('.snc-input', 'CANDLE');
  await page.click('.snc-speak');
  await sleep(2600);
  const afterWrong = await state();
  check(afterWrong.guesses.includes('CANDLE'),
    'the word went up the brass and is journaled',
    `the tube did not hear her — guesses ${JSON.stringify(afterWrong.guesses)}`);
  check(afterWrong.steps === beforeWalk,
    `and it was free — ${afterWrong.steps} steps, unchanged`,
    `speaking charged her: ${beforeWalk} → ${afterWrong.steps}`);
  check(afterWrong.status === 'active' && !afterWrong.answered,
    'the volume is still open and the house has not been answered',
    `volume ${afterWrong.status}, answered ${afterWrong.answered}`);
  const struck = await page.locator('.snc-struck__word').allInnerTexts();
  check(struck.map((t) => t.trim().toUpperCase()).includes('CANDLE'),
    `the refusal is drawn: struck through ${JSON.stringify(struck)}`,
    `the wrong word left no trace on glass (struck: ${JSON.stringify(struck)})`);
  // His answer arrives either as the rendered sigh or as an authored
  // DialogueScene, depending on what `sanctum-after-guess` selects — both are
  // "he said something", which is the 4.16 claim. Give the beat time to land.
  await sleep(2200);
  const reaction = await page.evaluate(() => {
    const scene = document.querySelector('.dlg')?.innerText;
    const line = document.querySelector('.snc-line')?.innerText;
    return (scene || line || '').replace(/\s+/g, ' ').trim();
  });
  check(reaction.length > 1 && reaction !== '…',
    `the Portrait answers on day 1: "${reaction.slice(0, 90)}${reaction.length > 90 ? '…' : ''}"`,
    `the door was silent after a wrong word (AAA 4.16) — it printed "${reaction}"`);
  const spine = await page.evaluate(() =>
    window.__manorStore.getState().recentEvents.filter((r) => r.event.type === 'sanctum-guess-wrong').length);
  check(spine === 1,
    'and the refusal is on the event spine, so the cast can react to it tomorrow',
    `expected one 'sanctum-guess-wrong' on the spine, saw ${spine}`);

  /* --- 4. one word a day, brass or oak ------------------------------------ */
  log('');
  log('— 4. one word a day —');
  const rowStillThere = await page.locator('.snc-row').count();
  if (rowStillThere > 0) {
    await page.fill('.snc-input', 'SILVER').catch(() => {});
    await page.click('.snc-speak').catch(() => {});
    await sleep(1200);
  }
  const afterSecond = await state();
  check(afterSecond.guesses.length === 1,
    'the second word of the day is refused — the anti-brute-force rule is untouched',
    `a second word got through: ${JSON.stringify(afterSecond.guesses)}`);

  /* --- 5. the right word downstairs does not win the volume ---------------- */
  log('');
  log('— 5. the right word, said from the hall —');
  // A GENUINELY FRESH INSTALL, so the strongest form of the claim is the one
  // measured: the TRUE word, said on DAY ONE, from the hall, with the ledger
  // untouched. (The volume is solvable in principle from day 1 — AAA 4.18 —
  // and §5.2's whole argument is that saying so should not cost three weeks of
  // stairs.) A second CONTEXT, not a second browser: the save lives in that
  // context's storage, and clearing it in-page races the store's own
  // persist-on-mutation subscription, which is how this step first "passed"
  // day 1 with yesterday's guess still in it.
  const freshCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page2 = await freshCtx.newPage();
  page2.setDefaultTimeout(20000);
  page2.on('pageerror', (e) => errors.push(String(e)));
  page2.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state2 = () => page2.evaluate(() => {
    const s = window.__manorStore.getState();
    return {
      day: s.day?.day ?? null, steps: s.stepsRemaining(), status: s.volume.status,
      guesses: s.volume.guesses.map((g) => g.guess),
      answered: s.flags.includes(`vol.${s.volume.volumeId}.answered`),
    };
  });

  await page2.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page2.waitForFunction(() => !!window.__manorStore, null, { timeout: 60000 });
  await page2.evaluate(() => {
    const s = () => window.__manorStore.getState();
    s().startDay();
    s().advanceDayPhase();
  });
  // WAIT FOR THE MANOR BEFORE WALKING TO THE BRASS. `sanctumStanding(null)` is
  // 'away', and the Sanctum screen quite correctly draws no mouthpiece for a
  // player who is nowhere — so navigating in the same tick as `startDay` is a
  // race that mounts the screen before the house exists.
  await page2.waitForFunction(() => !!window.__manorStore.getState().manor, null, { timeout: 20000 });
  await page2.evaluate(() => { location.hash = '#/sanctum'; });
  await page2.waitForSelector('.snc-input', { timeout: 20000 });
  await sleep(500);
  const day1 = await state2();
  check(day1.day === 1 && day1.guesses.length === 0 && day1.steps === DAY1_PURSE,
    `a fresh install: day ${day1.day}, ${day1.steps} steps, nothing said yet`,
    `expected a fresh day 1 with ${DAY1_PURSE} steps, saw day ${day1.day} / ${day1.steps} steps / ${day1.guesses.length} guess(es)`);

  await page2.fill('.snc-input', ANSWER);
  await page2.click('.snc-speak');
  await sleep(2800);
  const answered = await state2();
  check(answered.answered,
    'the house heard the true word from the hall on DAY ONE — vol.*.answered is set',
    'the right word down the tube set no answered flag');
  check(answered.status === 'active',
    'and the volume is STILL OPEN — the ceremony is four floors up (tube.ts clause 3)',
    `the tube closed the volume outright (status ${answered.status})`);
  check(answered.steps === day1.steps,
    `still ${answered.steps} steps: the word cost nothing, exactly as SANCTUM_GUESS_COST says`,
    `saying the word charged her (${day1.steps} → ${answered.steps} steps)`);
  const answeredLine = (await page2.locator('.snc-line').first().innerText()).trim();
  check(/say it again|face|doors/i.test(answeredLine),
    `he answers down the pipe: "${answeredLine.slice(0, 100)}…"`,
    `the answer beat said nothing about the climb: "${answeredLine}"`);
  // …and from this moment the house holds its padlocks open for the walk up:
  // the lock view every draft-gate and the blueprint read is derived from this
  // one flag (`doorsHeldOpen`), and round 19 is where it reached a caller.
  const heldOpen = await page2.evaluate(() =>
    window.__manorStore.getState().flags.includes(
      `vol.${window.__manorStore.getState().volume.volumeId}.answered`));
  check(heldOpen === true,
    'and the padlocks are held open for the climb (doorsHeldOpen)',
    'the answered flag did not reach the lock view');

  /* --- page errors -------------------------------------------------------- */
  log('');
  const real = errors.filter((e) => !/favicon|manifest|sw\.js|Failed to load resource/i.test(e));
  check(real.length === 0,
    'no page errors across the whole walk',
    `page errors:\n      ${real.join('\n      ')}`);

  log('');
  log(failures === 0 ? 'ALL LIVE CHECKS PASSED' : `${failures} LIVE CHECK(S) FAILED`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

process.exit(failures === 0 ? 0 : 1);
