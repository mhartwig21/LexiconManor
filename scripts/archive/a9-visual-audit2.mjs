/**
 * Deferred-visual-minors audit, part 2 — the surfaces that need real game
 * state: the dialogue box fit (content-fit vs the old fixed well), the draft
 * modal scrim, the room commit pill, and the journal unread dot with actual
 * unread content. Drives `window.__manorStore` + the real UI affordances.
 * ONE msedge instance, 390x844, both themes.
 *
 * Usage: node scripts/a9-visual-audit2.mjs [port]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = process.argv[2] ?? '5333';
const BASE = `http://localhost:${port}/LexiconManor/`;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round5-visual');
mkdirSync(SHOTS, { recursive: true });

/** Every fragment id in the shipped Volume I — read from content, not guessed. */
const VOLUME_FRAGMENT_IDS = JSON.parse(
  readFileSync(resolve(root, 'content/authored/volumes/volume-1.json'), 'utf8'),
).fragments.map((f) => f.id);

const out = {};
const browser = await chromium.launch({ channel: 'msedge', headless: true });

/** Measure the dialogue box's fit: reserved area vs the ink inside it. */
const DLG_METRICS = () => {
  const area = document.querySelector('.dlg__text-area');
  if (!area) return { mounted: false };
  const box = document.querySelector('.dlg__box');
  const ghost = document.querySelector('.dlg-tw__ghost');
  const live = document.querySelector('.dlg-tw__live');
  const ar = area.getBoundingClientRect();
  const gr = ghost?.getBoundingClientRect();
  return {
    mounted: true,
    chars: ghost?.textContent.length ?? 0,
    textAreaHeight: +ar.height.toFixed(1),
    inkHeight: gr ? +gr.height.toFixed(1) : null,
    fillRatio: gr ? +(gr.height / ar.height).toFixed(2) : null,
    boxHeight: +box.getBoundingClientRect().height.toFixed(1),
    livePosition: live ? getComputedStyle(live).position : null,
  };
};

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: theme,
  });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  const t = (out[theme] = { errors });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  await page.evaluate(() => window.__manorStore.getState().startDay());
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => /Begin the day/i.test(b.textContent))?.click();
  });
  await page.waitForTimeout(600);

  // --- dialogue: Bramble's morning scene ----------------------------------
  // Sampled mid-reveal, then at rest, then after tapping through to a
  // different-length line, so both the fit and the no-reflow claim are on
  // record rather than asserted.
  t.dialogue = { lines: [] };
  t.dialogue.lines.push({ when: 'mid-reveal', ...(await page.evaluate(DLG_METRICS)) });
  await page.waitForTimeout(1400);
  t.dialogue.lines.push({ when: 'settled', ...(await page.evaluate(DLG_METRICS)) });
  await page.screenshot({ path: resolve(SHOTS, `dialogue-line1-${theme}.png`) });
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      document.querySelector('.dlg__sheet')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(DLG_METRICS);
    if (!m.mounted) break;
    t.dialogue.lines.push({ when: `line${i + 2}`, ...m });
  }
  // What the same lines WOULD have measured under the retired fixed well —
  // the stranded-paper number this change exists to kill.
  t.dialogue.oldFixedWellPx = 7.2 * 16;
  await page.screenshot({ path: resolve(SHOTS, `dialogue-line3-${theme}.png`) });

  // close the scene
  for (let i = 0; i < 8; i++) {
    const done = await page.evaluate(() => {
      if (!document.querySelector('.dlg')) return true;
      const end = [...document.querySelectorAll('.dlg-choice')].pop();
      if (end) { end.click(); return false; }
      document.querySelector('.dlg__sheet')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
      return false;
    });
    await page.waitForTimeout(350);
    if (done) break;
  }

  // --- draft modal scrim ---------------------------------------------------
  // The draft only opens while `exploring`; clear whatever morning scene is
  // still up, then try each door until an offer lands.
  for (let i = 0; i < 12; i++) {
    const phase = await page.evaluate(() => window.__manorStore.getState().day?.phase);
    if (phase === 'exploring') break;
    await page.evaluate(() => {
      const end = [...document.querySelectorAll('.dlg-choice')].pop();
      if (end) { end.click(); return; }
      const btn = [...document.querySelectorAll('button')]
        .find((b) => /Begin the day|Onward|Continue|Farewell|Leave him/i.test(b.textContent));
      if (btn) { btn.click(); return; }
      document.querySelector('.dlg__sheet')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    });
    await page.waitForTimeout(400);
  }
  t.dayPhase = await page.evaluate(() => window.__manorStore.getState().day?.phase);
  for (const dir of ['N', 'E', 'W', 'S']) {
    await page.evaluate((d) => window.__manorStore.getState().openDraft(d), dir);
    await page.waitForTimeout(400);
    if (await page.evaluate(() => !!document.querySelector('.bp-modal'))) break;
  }
  t.scrim = await page.evaluate(() => {
    const m = document.querySelector('.bp-modal');
    if (!m) return { found: false };
    const cs = getComputedStyle(m);
    const bg = cs.backgroundColor;
    const rgb = bg.match(/[\d.]+/g)?.map(Number) ?? [];
    return {
      found: true, background: bg,
      isPureBlack: rgb.length >= 3 && rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0,
      warm: rgb.length >= 3 && rgb[0] !== rgb[2],
    };
  });
  await page.screenshot({ path: resolve(SHOTS, `draft-scrim-${theme}.png`) });
  await page.evaluate(() => window.__manorStore.getState().cancelDraft());
  await page.waitForTimeout(300);

  // --- journal: force unread state, then check every tab -------------------
  await page.evaluate((ids) => { window.__a9Fragments = ids; }, VOLUME_FRAGMENT_IDS);
  await page.evaluate(() => {
    const S = window.__manorStore;
    const st = S.getState();
    const all = window.__a9Fragments ?? [];
    const day = st.day?.day ?? st.volume.day;
    S.setState({
      volume: { ...st.volume, foundFragmentIds: [...new Set([...st.volume.foundFragmentIds, ...all])] },
      recentEvents: [
        ...st.recentEvents,
        ...all.map((id) => ({ day, event: { type: 'fragment-found', fragmentId: id } })),
      ],
    });
  });
  await page.goto(`${BASE}#/journal`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  t.journal = { perTab: {} };
  for (const label of ['The Word', 'Engravings', 'Testimony', 'Letters']) {
    await page.evaluate((label) => {
      [...document.querySelectorAll('.jrn-tab')]
        .find((x) => x.textContent.trim().startsWith(label))?.click();
    }, label);
    await page.waitForTimeout(260);
    t.journal.perTab[label] = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.jrn-tab')].map((b) => ({
        label: b.textContent.trim(),
        active: b.classList.contains('jrn-tab--active'),
        dot: !!b.querySelector('.jrn-tab__dot'),
      }));
      const seal = document.querySelector('.jrn-seal');
      return {
        tabs, dotOnActive: tabs.some((x) => x.active && x.dot),
        sealShadow: seal ? getComputedStyle(seal).boxShadow : null,
        cardTexts: [...document.querySelectorAll('.jrn-card__text')].map((p) => p.textContent),
        poemLines: [...document.querySelectorAll('.jrn-poem__line')].map((p) => p.textContent.trim()),
      };
    });
    await page.screenshot({ path: resolve(SHOTS, `journal-${label.replace(/\s+/g, '')}-${theme}.png`) });
  }

  await page.close();
}

await browser.close();
writeFileSync(resolve(SHOTS, 'metrics2.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 12000));
