/**
 * A2 round-7 verification — the two live claims in my fix set.
 *
 *  1. THE DAWN POT SPEAKS (AAA 4.9 / 11.15). Bramble's tea used to change the
 *     counter in silence: StepMeter classified the whole dawn batch as "fresh
 *     ledger, a new day, no floats", and the header is covered by the morning
 *     card anyway. It now rewinds on a reset and HOLDS the batch until the card
 *     is dismissed, so the +N floats on the blueprint where her eyes are.
 *  2. THE DOOR IS A PLACE (AAA 4.10e). A guess from the ground floor is
 *     refused by the store, so a fresh save cannot win the volume on day 1.
 *
 * One browser instance, system Edge, 390x844 (AAA §0.4 harness rules).
 */
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

  // ---- 1. the dawn pot, floated where she is looking ---------------------
  const float = await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    s().startDay();
    for (let i = 0; i < 6 && s().day?.phase !== 'exploring'; i++) { s().advanceDayPhase(); await sleep(20); }
    s().adjustAffinity('bramble', 6);           // a warm friendship: the +11 pot
    s().endDay('retired-early'); await sleep(60);
    for (let i = 0; i < 4 && s().day?.phase !== 'night'; i++) { s().advanceDayPhase(); await sleep(30); }
    await sleep(200);

    s().startDay();                              // day 2 dawn: the pot is poured
    await sleep(150);
    const ledger = s().ledger.entries.map((e) => [e.reason, e.delta]);
    const duringMorning = document.querySelectorAll('.chr-float').length;
    const cardText = document.querySelector('.chr-scene')?.innerText ?? null;

    return { ledger, duringMorning, cardText };
  });

  // She reads the card and begins the day — then we photograph the very next
  // frames from OUTSIDE the page, so the float is caught mid-life rather than
  // after its 1.15s (a screenshot taken at the end of a sample loop shows an
  // expired float and proves nothing).
  await page.evaluate(() => {
    const s = window.__manorStore.getState();
    s.shareMorningTea();
    s.advanceDayPhase();
  });
  // Screenshot immediately: the float peaks at ~155ms and a capture costs
  // longer than that, so any deliberate wait photographs an expired float.
  await page.screenshot({ path: 'docs/shots/a2-dawn-float.png' });
  const shot = await page.evaluate(() => {
    const n = document.querySelector('.chr-float');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    const stack = [];
    for (let e = n; e; e = e.parentElement) {
      const c = getComputedStyle(e);
      stack.push(`${e.tagName}.${typeof e.className === 'string' ? e.className : e.className?.baseVal ?? ''}` +
        ` z=${c.zIndex} pos=${c.position} pe=${c.pointerEvents}`);
    }
    return {
      text: n.textContent, opacity: cs.opacity, visibility: cs.visibility, display: cs.display,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      onGlass: r.width > 0 && r.height > 0 && r.y >= 0 && r.y + r.height <= innerHeight,
      stack: stack.slice(0, 4),
      phase: window.__manorStore.getState().day?.phase,
    };
  });
  const samples = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = [];
    for (let t = 0; t < 12; t++) {
      out.push({ t: t * 100, floats: document.querySelectorAll('.chr-float').length });
      await sleep(100);
    }
    return out;
  });
  float.samples = samples;
  console.log('[a2] float at +250ms    :', JSON.stringify(shot));

  const withFloats = float.samples.filter((s) => s.floats > 0);
  console.log('[a2] dawn ledger        :', JSON.stringify(float.ledger));
  console.log('[a2] floats DURING card :', float.duringMorning, '(held on purpose — the card covers the header)');
  console.log('[a2] morning card says  :', JSON.stringify(float.cardText));
  console.log('[a2] samples with float :', withFloats.length, 'of', float.samples.length);

  // ---- 2. the second gate ------------------------------------------------
  const gate = await page.evaluate(async () => {
    const s = () => window.__manorStore.getState();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const before = {
      cell: s().manor?.playerCell, steps: s().stepsRemaining(), status: s().volume.status,
    };
    // Everything she could possibly know, filed:
    const content = s().volume;
    s().guessAtSanctum('LACUNA');
    await sleep(80);
    const groundFloor = {
      status: s().volume.status, guesses: s().volume.guesses.length,
      steps: s().stepsRemaining(),
    };
    // Now put her at the door and try the same word.
    const m = s().manor;
    window.__manorStore.setState({
      manor: {
        ...m,
        rooms: {
          ...m.rooms,
          '2,5': { cardId: 'gallery', cell: { col: 2, row: 5 }, doors: ['N', 'S'], solved: true, kind: 'twistle' },
        },
        playerCell: { col: 2, row: 5 },
      },
    });
    s().guessAtSanctum('LACUNA');
    await sleep(80);
    const atDoor = { status: s().volume.status, guesses: s().volume.guesses.length };
    return { before, groundFloor, atDoor, volumeId: content.volumeId };
  });
  console.log('[a2] gate:', JSON.stringify(gate, null, 1));
} finally {
  await browser.close();
}
