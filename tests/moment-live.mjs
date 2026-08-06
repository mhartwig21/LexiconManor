/**
 * Live interaction pass for THE MOMENT (AAA §0.4) — one browser, one context,
 * sequential routes, system Edge, never a downloaded binary.
 *
 * Drives the real build and asserts the seal is mounted, non-zero, ON GLASS
 * (elementFromPoint at its centre returns the seal or a descendant) on every
 * screen a campaign grant can fire from — including behind the full-screen
 * dialogue overlay, which is where three of the four fragment channels live.
 *
 * Run: node tests/moment-live.mjs  (with `npx vite --port 5211` up)
 */
import { chromium } from 'playwright';

const BASE = process.env.MOMENT_BASE ?? 'http://localhost:5211/LexiconManor/';
const routes = ['#/', '#/journal', '#/chronicles', '#/sanctum', '#/room'];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const rows = [];
await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
await page.waitForSelector('.bp-page, .chr-scene', { timeout: 15000 });

/** Push a moment through the app's own queue module (same module instance the
 *  layer renders from — dev server ESM registry), then hit-test it. */
async function check(route, label) {
  if (route) {
    await page.goto(BASE + route);
    await page.waitForTimeout(400);
  }
  const res = await page.evaluate(async () => {
    const m = await import('/LexiconManor/src/ui/moment/queue.ts');
    m.momentQueue.reset();
    m.momentQueue.push({
      key: 'live-' + Math.random(), kind: 'fragment', sigil: 'T',
      title: 'Testimony, written down',
      quote: '“Six candles at his desk, always six…”',
      where: 'Filed in the Journal · Testimony',
    });
    await new Promise((r) => setTimeout(r, 350));
    const el = document.querySelector('.mom');
    if (!el) return { mounted: false };
    const b = el.getBoundingClientRect();
    const at = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return hit === el || el.contains(hit) ? 'ok' : (hit?.className || hit?.tagName || 'null');
    };
    return {
      mounted: true,
      w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top),
      inViewport: b.top >= 0 && b.bottom <= window.innerHeight,
      centre: at(b.x + b.width / 2, b.y + b.height / 2),
      tl: at(b.x + 6, b.y + 6),
      tr: at(b.right - 6, b.y + 6),
      bl: at(b.x + 6, b.bottom - 6),
      br: at(b.right - 6, b.bottom - 6),
      text: el.textContent,
    };
  });
  rows.push([label, JSON.stringify(res)]);
  return res;
}

for (const r of routes) await check(r, r);

// The hard cases: the full-screen scenes the old footer note played behind and
// expired unseen — the morning card (.chr-scene) and the dialogue overlay
// (.dlg, position:fixed, z-index 40), which is where the testimony channel
// (grantsFragmentIds) and the letter-aside channel both fire.
const clickText = async (re) => page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const b = [...document.querySelectorAll('button')].find((x) => rx.test(x.textContent || ''));
  if (b) { b.click(); return true; }
  return false;
}, re);

await page.evaluate(() => localStorage.clear());
await page.goto(BASE + '#/');
await page.waitForTimeout(500);
if (await clickText('begin the first day')) {
  await page.waitForTimeout(600);
  await check(null, 'morning card (.chr-scene)');
  if (await clickText('begin the day')) {
    await page.waitForSelector('.dlg', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const overlay = await page.evaluate(() => Boolean(document.querySelector('.dlg')));
    if (overlay) await check(null, 'dialogue overlay (.dlg)');
    else rows.push(['dialogue overlay (.dlg)', 'NOT REACHED — no .dlg mounted']);
  }
} else {
  rows.push(['morning card / dialogue overlay', 'SKIPPED — no "begin the first day" button']);
}

// Tap-to-dismiss.
const dismissed = await page.evaluate(async () => {
  const m = await import('/LexiconManor/src/ui/moment/queue.ts');
  m.momentQueue.reset();
  m.momentQueue.push({ key: 'dismiss-me', kind: 'letter', sigil: 'L', title: 'A letter', where: 'Journal' });
  await new Promise((r) => setTimeout(r, 300));
  document.querySelector('.mom')?.click();
  await new Promise((r) => setTimeout(r, 200));
  return { gone: !document.querySelector('.mom') };
});
rows.push(['tap-to-dismiss', JSON.stringify(dismissed)]);

// Queue: two grants in quick succession, both seen.
const queued = await page.evaluate(async () => {
  const m = await import('/LexiconManor/src/ui/moment/queue.ts');
  m.momentQueue.reset();
  m.momentQueue.push({ key: 'q1', kind: 'fragment', sigil: 'W', title: 'First', where: 'Journal' });
  m.momentQueue.push({ key: 'q2', kind: 'fragment', sigil: 'E', title: 'Second', where: 'Journal' });
  await new Promise((r) => setTimeout(r, 250));
  const first = document.querySelector('.mom')?.textContent;
  document.querySelector('.mom')?.click();
  await new Promise((r) => setTimeout(r, 250));
  const second = document.querySelector('.mom')?.textContent;
  return { first, second };
});
rows.push(['queue (two in a row)', JSON.stringify(queued)]);

// END TO END: a REAL grant through the real store, with no help from the
// queue module — the watcher's subscription is the only thing that can put
// this on the glass, and it does it from inside a room.
await page.goto(BASE + '#/room');
await page.waitForTimeout(400);
const real = await page.evaluate(async () => {
  const q = await import('/LexiconManor/src/ui/moment/queue.ts');
  q.momentQueue.reset(); // clear the synthetic probes above; nothing else
  const s = await import('/LexiconManor/src/app/store.ts');
  s.useManorStore.getState().fileFragment('v1-e1');
  await new Promise((r) => setTimeout(r, 400));
  const el = document.querySelector('.mom');
  const b = el?.getBoundingClientRect();
  return {
    onGlass: Boolean(el) && document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) !== null
      && el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)),
    text: el?.textContent ?? null,
  };
});
rows.push(['REAL grant (fileFragment) seen from /room', JSON.stringify(real)]);
await page.screenshot({ path: 'moment-live.png' });

console.log(rows.map(([a, b]) => `${a}\n   ${b}`).join('\n'));
console.log('pageerrors:', errors.length ? errors : 'none');
await browser.close();
