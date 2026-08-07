/**
 * tests/round8-marker-states.mjs — ROUND 8 VERIFIER.
 *
 * WHAT THIS ADDS OVER tests/round7-seal-live.mjs
 * Round 7's pass proves the four marker states exist and that the ENTRANCE
 * count is exact. It checks each level against the derived model separately.
 * It never asks the question this round was asked to ask:
 *
 *     do the entrance, the tabs and the cards agree with EACH OTHER?
 *
 * That is a different question, and it is the one that actually bites. Three
 * levels can each be individually "correct against the store" while printing
 * three different numbers to the player, because they are three different
 * derivations of three different shapes:
 *
 *   entrance  — ONE number, the whole backlog          (`.sealed__n`)
 *   tab       — one mark PER TAB, each counting only its own channel
 *               (no printed digit; the count lives in the aria-label, which is
 *               what a screen-reader user actually gets, so that is what is read)
 *   card      — one pip PER PAGE, counting nothing
 *
 * So the invariant is not "three equal numbers", it is:
 *
 *     Σ(per-tab counts) == entrance count == #(card pips across all tabs)
 *                       == |sealed set|
 *
 * A round-7-style per-level check passes happily when the tabs sum to 4 and the
 * entrance says 5. This fails.
 *
 * IT ALSO USES A BACKLOG THAT SPANS TABS. Round 7 drives one sealed page, and
 * with one page every level trivially reads 1 — the sum and the max and the
 * count are the same number, so a level that counts TABS rather than PAGES
 * cannot be told from a correct one. This seeds a mixed backlog across The Word
 * / Engravings / Testimony precisely so those two readings diverge.
 *
 * AND IT PHOTOGRAPHS THE FOUR STATES (docs/shots/round8/) — as evidence for the
 * human, never as evidence for the criterion (AAA §0.1.7): every claim below is
 * asserted off the DOM and the store, and the screenshots are taken alongside.
 *
 * HARNESS RULES (this dev box, non-negotiable): system Edge via
 * `channel: 'msedge'` — never download a playwright browser. Exactly ONE
 * browser instance, closed in a finally. 390x844 @2x, and the marker states
 * re-measured at 375x667 because that is where the layout is tightest.
 *
 * Run: `node tests/round8-marker-states.mjs` (needs `vite preview` on :4173).
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(root, 'docs/shots/round8');
mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:4173/LexiconManor/';

const log = (...a) => console.log('[r8]', ...a);
const ok = (m) => console.log('[r8]   ✓', m);
const fail = (m) => { console.error('[r8]   ✗ FAIL:', m); process.exitCode = 1; };

/**
 * THE MEASUREMENT. Everything the three levels say, read off the glass in one
 * pass so the numbers cannot be taken a frame apart from each other.
 *
 * The per-tab count is parsed out of the mark's `aria-label` ("3 engravings not
 * yet made out"), because SealedMark only prints a digit when `showCount` is
 * set and the tabs deliberately do not set it. That label is not a proxy for
 * the number — for a screen-reader user it IS the number, so a drift between it
 * and the entrance is a real defect and not a testing artefact.
 */
const measure = (tabName) => `(() => {
  const s = window.__manorStore.getState();
  const pre = 'vol.' + s.volume.volumeId + '.';
  const ids = (p) => new Set(
    s.flags.filter((f) => f.startsWith(pre + p)).map((f) => f.slice((pre + p).length)),
  );
  const viewed = ids('viewed-'), glanced = ids('glanced-'), legible = ids('legible-');
  const sealed = new Set([...ids('sealed-')].filter((id) => !legible.has(id)));
  const found = [...s.volume.foundFragmentIds];

  const num = (el) => {
    if (!el) return 0;
    const m = /^\\s*(\\d+)/.exec(el.getAttribute('aria-label') || '');
    return m ? Number(m[1]) : 0;
  };
  const tabs = [...document.querySelectorAll('.jrn-tab')].map((t) => ({
    label: (t.textContent || '').replace(/\\d+/g, '').trim(),
    sealed: num(t.querySelector('.sealed')),
    unread: num(t.querySelector('.unread')),
  }));
  return {
    tab: ${JSON.stringify(tabName)},
    model: {
      found,
      sealed: found.filter((id) => sealed.has(id)),
      unread: found.filter((id) => (sealed.has(id) ? !glanced.has(id) : !viewed.has(id))),
    },
    tabs,
    tabSealSum: tabs.reduce((n, t) => n + t.sealed, 0),
    tabUnreadSum: tabs.reduce((n, t) => n + t.unread, 0),
    // Cards on the CURRENTLY OPEN tab only — the sheet renders one tab at a time.
    pipSealHere: document.querySelectorAll('.jrn-sheet .sealed--pip').length,
    pipUnreadHere: document.querySelectorAll('.jrn-sheet .unread--pip').length,
  };
})()`;

const entranceState = () => `(() => {
  const btn = [...document.querySelectorAll('.bp-btn--quiet, .chr-scene__aside')]
    .find((b) => /^\\s*Journal/.test(b.textContent || ''));
  if (!btn) return { found: false };
  const n = (sel) => {
    const el = btn.querySelector(sel);
    return el ? Number(el.textContent) : 0;
  };
  return {
    found: true,
    wax: btn.querySelectorAll('.unread').length,
    waxN: n('.unread__n'),
    seal: btn.querySelectorAll('.sealed').length,
    sealN: n('.sealed__n'),
    sealAria: btn.querySelector('.sealed')?.getAttribute('aria-label') || null,
  };
})()`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const [W, H] of [[390, 844], [375, 667]]) {
    const tag = `${W}x${H}`;
    const wide = W === 390;
    const page = await browser.newPage({
      viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    const shot = async (name) => { if (wide) await page.screenshot({ path: resolve(SHOTS, name + '.png') }); };
    const goJournal = async () => {
      await page.goto(BASE + '#/journal', { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
    };
    const goBlueprint = async () => {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      // Clear any queued campaign seal off the map so the entrance is readable.
      for (let i = 0; i < 8; i++) {
        const m = await page.$('.mom button, .chr-scene button, .dlg button');
        if (!m) break;
        await m.click({ force: true }).catch(() => {});
        await page.waitForTimeout(220);
      }
    };

    log(`\n===================== ${tag} =====================`);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    /* ---- seed a MIXED, MULTI-TAB sealed backlog ------------------------- */
    const seeded = await page.evaluate(() => {
      const s = window.__manorStore.getState();
      if (s.phase !== 'exploring' && s.startDay) s.startDay();
      const st = window.__manorStore.getState();
      // Fragment ids encode their channel: v1-d* definition (The Word),
      // v1-e* engravings, v1-t* testimony. Seal a spread across all three so
      // "sum over tabs" and "number of tabs" are different numbers.
      const want = ['v1-d1', 'v1-d2', 'v1-e1', 'v1-e2', 'v1-t2'];
      for (const id of want) st.fileFragment(id, { sealed: true });
      return want;
    });
    await page.waitForTimeout(400);
    log(`seeded a sealed backlog of ${seeded.length} across three tabs: ${seeded.join(', ')}`);

    /* ================= STATE A — unread AND sealed ========================
     * MEASURED FROM THE BLUEPRINT, ON PURPOSE. The journal marks the open tab
     * as seen the moment it mounts — which is correct behaviour (11.20 says wax
     * retires on viewing and on nothing else) but it means a probe that opens
     * the journal and then asks "is this unread?" has already destroyed the
     * state it came to measure. The first cut of this file did exactly that and
     * reported 3 of 5 unread; the two missing pages were the two on the tab it
     * had just opened. The store is the truth here; the journal comes after. */
    await goBlueprint();
    const a = await page.evaluate(measure('blueprint'));
    if (a.model.sealed.length !== 5) {
      fail(`[${tag}] A: expected 5 sealed pages, the store has ${a.model.sealed.length}`);
    }
    const aUnreadSealed = a.model.sealed.filter((id) => a.model.unread.includes(id));
    if (aUnreadSealed.length === 5) {
      ok(`[${tag}] A: all 5 pages are UNREAD and SEALED at once — two states, two marks`);
    } else {
      fail(`[${tag}] A: only ${aUnreadSealed.length}/5 sealed pages are also unread`);
    }
    /* ---- THE ROUND-8 ASSERTION: three levels agree with each other ------ */
    const eA = await page.evaluate(entranceState());
    await shot('marker-A-entrance');
    if (!eA.found) fail(`[${tag}] A: no Journal entrance on the blueprint`);

    // Now the journal, for the tab and card levels.
    await goJournal();
    const aj = await page.evaluate(measure('word'));
    await shot('marker-A-unread-and-sealed');
    if (aj.tabs.filter((t) => t.sealed > 0).length >= 2) {
      ok(`[${tag}] A: the backlog spans ${aj.tabs.filter((t) => t.sealed > 0).length} tabs — `
        + `"sum of tabs" and "number of tabs" are now distinguishable`);
    } else {
      fail(`[${tag}] A: backlog did not span multiple tabs (${JSON.stringify(aj.tabs)})`);
    }
    log(`[${tag}] A levels — entrance ${eA.sealN} · tabs Σ ${aj.tabSealSum} `
      + `(${aj.tabs.map((t) => `${t.label}:${t.sealed}`).join(' ')}) · model ${a.model.sealed.length}`);
    if (eA.sealN === aj.tabSealSum && eA.sealN === a.model.sealed.length) {
      ok(`[${tag}] A: ENTRANCE, TABS and MODEL agree exactly — ${eA.sealN} = Σtabs ${aj.tabSealSum} `
        + `= ${a.model.sealed.length} sealed pages (AAA 11.19/11.21)`);
    } else {
      fail(`[${tag}] A: the seal chain DISAGREES with itself — entrance ${eA.sealN}, `
        + `Σtabs ${aj.tabSealSum}, model ${a.model.sealed.length}`);
    }
    if (eA.sealAria === `${a.model.sealed.length} pages not yet made out`) {
      ok(`[${tag}] A: the entrance says it in words too — "${eA.sealAria}"`);
    } else {
      fail(`[${tag}] A: entrance aria-label "${eA.sealAria}" does not name ${a.model.sealed.length} pages`);
    }

    /* ---- and the CARD level, tab by tab --------------------------------- */
    let pipTotal = 0;
    const tabKeys = ['The Word', 'Engravings', 'Testimony'];
    for (const key of tabKeys) {
      const btn = await page.$(`.jrn-tab:has-text("${key}")`);
      if (!btn) { fail(`[${tag}] A: no "${key}" tab`); continue; }
      await btn.click({ force: true });
      await page.waitForTimeout(350);
      const m = await page.evaluate(measure(key));
      const declared = m.tabs.find((t) => t.label.startsWith(key))?.sealed ?? -1;
      pipTotal += m.pipSealHere;
      if (m.pipSealHere === declared) {
        ok(`[${tag}] A: "${key}" — ${m.pipSealHere} card pip(s) match the ${declared} its own tab declares`);
      } else {
        fail(`[${tag}] A: "${key}" — the tab declares ${declared} sealed but the sheet draws ${m.pipSealHere} pip(s)`);
      }
      await shot(`marker-A-tab-${key.replace(/\s+/g, '-').toLowerCase()}`);
    }
    if (pipTotal === a.model.sealed.length) {
      ok(`[${tag}] A: the CARD level totals ${pipTotal} across the tabs — the third level agrees`);
    } else {
      fail(`[${tag}] A: card pips total ${pipTotal}, model has ${a.model.sealed.length} sealed`);
    }

    /* ================= STATE B — READ but still sealed ==================== */
    // Look at every tab, which is the only thing that retires wax (11.20).
    for (const key of tabKeys) {
      const btn = await page.$(`.jrn-tab:has-text("${key}")`);
      if (btn) { await btn.click({ force: true }); await page.waitForTimeout(500); }
    }
    await page.waitForTimeout(400);
    const b = await page.evaluate(measure('all'));
    await shot('marker-B-read-but-sealed');
    // The three FRAGMENT tabs only. "Letters" counts unopened post, which is a
    // different channel with its own unread rule and which this pass never
    // opens — folding it in would make the assertion about the tray, not about
    // the seal. (Round 7 measures the tray separately and this defers to it.)
    const fragTabs = b.tabs.filter((t) => !/^Letters/.test(t.label));
    const bWax = fragTabs.reduce((n, t) => n + t.unread, 0);
    const bSeal = fragTabs.reduce((n, t) => n + t.sealed, 0);
    const stillSealed = b.model.sealed.length;
    const stillUnread = b.model.unread.filter((id) => seeded.includes(id)).length;
    if (stillSealed === 5 && stillUnread === 0) {
      ok(`[${tag}] B: THE ROUND-8 CASE — 5 pages read and still sealed: `
        + `the smudge mark stays, the wax mark is gone (AAA 11.20)`);
    } else {
      fail(`[${tag}] B: expected 5 sealed / 0 unread after viewing, got ${stillSealed} / ${stillUnread}`);
    }
    if (bWax === 0 && bSeal === 5) {
      ok(`[${tag}] B: on the tabs too — Σ wax 0, Σ smudge ${bSeal} across the three fragment tabs`);
    } else {
      fail(`[${tag}] B: fragment tabs say wax Σ${bWax} / smudge Σ${bSeal}, expected 0 / 5`);
    }
    /* THE CARD LEVEL IS DELIBERATELY NOT LIVE, and this asserts the real rule
     * rather than the one that looks obvious.
     *
     * JournalView keeps `shownNew` in a ref for the whole visit: the tab and
     * entrance marks answer "is there something you have not looked at?" (live,
     * and they clear permanently as she looks), while the CARD pip answers
     * "which of these is the new one?" and is frozen for as long as she is
     * standing there — so the answer does not vanish out from under her the
     * instant the tab paints. A first cut of this file failed the game for
     * showing 1 wax pip on the tab it had just opened, which is the documented
     * behaviour and the better one.
     *
     * So the honest claim is not "the pip is gone now", it is "the pip is gone
     * when she comes BACK". That is what is measured. */
    await goBlueprint();
    await goJournal();
    const btnT = await page.$('.jrn-tab:has-text("Testimony")');
    if (btnT) { await btnT.click({ force: true }); await page.waitForTimeout(450); }
    const b2 = await page.evaluate(measure('revisit'));
    if (b2.pipUnreadHere === 0 && b2.pipSealHere > 0) {
      ok(`[${tag}] B: on a RETURN visit the cards carry no wax pip and still carry `
        + `${b2.pipSealHere} smudge pip(s) — the per-visit freeze thaws, the seal does not`);
    } else {
      fail(`[${tag}] B: on return, cards show ${b2.pipUnreadHere} wax / ${b2.pipSealHere} smudge pip(s) `
        + `(expected 0 wax, >0 smudge)`);
    }
    await goBlueprint();
    const eB = await page.evaluate(entranceState());
    await shot('marker-B-entrance');
    const bTabSealSum = bSeal;
    if (eB.sealN === 5 && eB.sealN === bTabSealSum) {
      ok(`[${tag}] B: the entrance still names the whole backlog (${eB.sealN}) and still `
        + `agrees with Σtabs — a read backlog does not become an invisible one`);
    } else {
      fail(`[${tag}] B: entrance ${eB.sealN} vs Σtabs ${bTabSealSum} (expected 5 and equal)`);
    }

    /* ================= STATE C — sealed becomes legible ===================
     * Deciphered and measured FROM THE BLUEPRINT, for the same reason state A
     * is: the whole claim here is that the wax mark comes BACK, and opening the
     * journal to look would retire it again before it could be counted. */
    const madeOut = await page.evaluate(() => window.__manorStore.getState().decipherFragments(2));
    await page.waitForTimeout(600);
    const c = await page.evaluate(measure('after-decipher'));
    log(`[${tag}] C: made out ${JSON.stringify(madeOut)}`);
    const reRaised = madeOut.filter((id) => c.model.unread.includes(id));
    if (reRaised.length === madeOut.length && madeOut.length > 0) {
      ok(`[${tag}] C: becoming legible RE-RAISED the wax mark on all ${madeOut.length} page(s) — `
        + `new information she has not read (AAA 11.20)`);
    } else {
      fail(`[${tag}] C: ${reRaised.length}/${madeOut.length} made-out pages re-raised their unread mark`);
    }
    if (c.model.sealed.length === 5 - madeOut.length) {
      ok(`[${tag}] C: the smudge count fell by exactly ${madeOut.length} (5 → ${c.model.sealed.length})`);
    } else {
      fail(`[${tag}] C: sealed is ${c.model.sealed.length}, expected ${5 - madeOut.length}`);
    }
    const eC = await page.evaluate(entranceState());
    await shot('marker-C-entrance');
    await goJournal();
    const cj = await page.evaluate(measure('after-decipher-journal'));
    await shot('marker-C-legible-reraises-unread');
    const cSeal = cj.tabs.filter((t) => !/^Letters/.test(t.label)).reduce((n, t) => n + t.sealed, 0);
    if (eC.sealN === c.model.sealed.length && eC.sealN === cSeal) {
      ok(`[${tag}] C: all three levels moved together — entrance ${eC.sealN} = Σtabs `
        + `${cSeal} = model ${c.model.sealed.length}`);
    } else {
      fail(`[${tag}] C: entrance ${eC.sealN}, Σtabs ${cSeal}, model ${c.model.sealed.length}`);
    }

    /* ================= STATE D — read AND legible ========================= */
    await goJournal();
    for (const key of tabKeys) {
      const btn = await page.$(`.jrn-tab:has-text("${key}")`);
      if (btn) { await btn.click({ force: true }); await page.waitForTimeout(500); }
    }
    await page.waitForTimeout(400);
    const d = await page.evaluate(measure('all'));
    await shot('marker-D-read-and-legible');
    const dMadeOutUnread = madeOut.filter((id) => d.model.unread.includes(id));
    if (dMadeOutUnread.length === 0) {
      ok(`[${tag}] D: the made-out pages now carry NEITHER mark — read, and legible`);
    } else {
      fail(`[${tag}] D: ${dMadeOutUnread.length} made-out page(s) still unread after viewing`);
    }

    /* ---- survival: reload, then the day roll ---------------------------- */
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const r = await page.evaluate(measure('reload'));
    if (r.model.sealed.length === d.model.sealed.length
        && r.model.unread.length === d.model.unread.length) {
      ok(`[${tag}] both marks survive a RELOAD (sealed ${r.model.sealed.length}, `
        + `unread ${r.model.unread.length})`);
    } else {
      fail(`[${tag}] reload changed the marks: sealed ${d.model.sealed.length}→${r.model.sealed.length}, `
        + `unread ${d.model.unread.length}→${r.model.unread.length}`);
    }
    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      if (s.endDay) s.endDay();
      const t = window.__manorStore.getState();
      if (t.startDay) t.startDay();
    });
    await page.waitForTimeout(700);
    const n = await page.evaluate(measure('day-roll'));
    if (n.model.sealed.length === r.model.sealed.length) {
      ok(`[${tag}] and the smudge survives the DAY ROLL (${n.model.sealed.length})`);
    } else {
      fail(`[${tag}] day roll changed the sealed set ${r.model.sealed.length}→${n.model.sealed.length}`);
    }

    /* ================= STATE E — THE GRAMMAR AT COUNT 1 ===================
     * ROUND 16 (AAA 11.7/11.19). Every state above is measured at counts > 1,
     * which is exactly the band where a hard-coded plural is invisible. The
     * entrance and the day-transition levels of this chain compute a singular
     * ("1 unread thing in the journal", "1 new floorplan"); the journal's tab
     * buttons passed a hard-coded plural, so at one page the accessible name
     * of the control that tells her WHICH tab to open read "1 unread letters",
     * "1 engravings not yet made out", "1 lines not yet made out" — measured
     * live off the rendered aria-label. Same chain, same derivation, two
     * grammars, and the level that got it wrong is the innermost one, which is
     * the level a screen-reader user navigates by.
     *
     * So: wipe to a backlog of exactly ONE page on ONE tab, and read the label
     * off the glass. No plural may survive a count of 1, at any level. */
    await page.evaluate(() => {
      const s = window.__manorStore.getState();
      // Clear every fragment flag and start again from a single sealed page.
      const keep = s.flags.filter((f) => !/^vol\.[^.]+\.(sealed|legible|viewed|glanced)-/.test(f));
      window.__manorStore.setState({
        flags: keep,
        volume: { ...s.volume, foundFragmentIds: [] },
      });
      window.__manorStore.getState().fileFragment('v1-e1', { sealed: true });
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => { location.hash = '#/journal'; });
    await page.waitForSelector('.jrn-tabs', { timeout: 8000 });
    await page.waitForTimeout(400);
    const oneLabels = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('.jrn-tab .unread, .jrn-tab .sealed, .unread, .sealed')) {
        const a = el.getAttribute('aria-label');
        if (a && /^\s*1\b/.test(a)) out.push(a);
      }
      return [...new Set(out)];
    });
    log(`[${tag}] E: every count-1 accessible name on glass: ${JSON.stringify(oneLabels)}`);
    if (oneLabels.length === 0) {
      fail(`[${tag}] E: nothing on the journal reported a count of 1 — the probe measured nothing`);
    } else {
      // "1 engravings", "1 letters", "1 lines not yet made out", "1 pieces…" —
      // a plural head noun immediately after the numeral 1.
      // No allowlist on purpose: every noun this chain uses is singular in a
      // form that does not end in -s at count 1 ("thing", "engraving",
      // "letter", "piece of testimony", "line of the definition"), so an
      // exception here would only be a place for the next plural to hide.
      const bad = oneLabels.filter((a) => /^\s*1\s+(?:unread\s+)?[a-z]+(?:s|ies)\b/.test(a));
      // The check must be able to FAIL: prove the matcher on the exact strings
      // that were measured live before the fix.
      for (const wrong of ['1 unread letters', '1 engravings not yet made out',
        '1 lines not yet made out', '1 pieces not yet made out']) {
        if (!/^\s*1\s+(?:unread\s+)?[a-z]+(?:s|ies)\b/.test(wrong)) {
          fail(`[${tag}] E: the grammar check cannot see "${wrong}" — it proves nothing`);
        }
      }
      if (bad.length) fail(`[${tag}] E: a plural survived a count of 1 — ${JSON.stringify(bad)}`);
      else ok(`[${tag}] E: every count-1 label is singular — ${JSON.stringify(oneLabels)}`);
    }

    if (errors.length) fail(`[${tag}] console/page errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(process.exitCode
  ? '[r8] DONE WITH FAILURE(S)'
  : '[r8] DONE — the entrance, the tabs and the cards agree with each other in all four marker states');
