/**
 * tests/chrome-clearance.test.ts — OWNER: A2 (chrome).
 *
 * The two static halves of AAA 11.4 / 11.5. The third half is live and cannot
 * be faked from source: `tests/modal-hit-test.mjs` drives the real build in
 * Edge and hit-tests the retire moon under every overlay (§0.4 — a screenshot,
 * and a source grep, are both insufficient evidence for §11 on their own).
 *
 * WHAT IS ASSERTED HERE
 *   1. The clearance lint passes on the repo, its self-test still detects the
 *      literal that shipped the navigation bug, and no exemption has outlived
 *      the defect it excuses. (This test is what puts the lint in front of CI:
 *      package.json is architect-owned, so `npm test` is the gate available.)
 *   2. Every layer in the app names its rung from the published scale
 *      (src/ui/chrome/layers.ts) and the ORDER holds: overlays above pages,
 *      chrome above overlays (deliberately — the candle stays readable), the
 *      moment above everything the game draws. The shipped defect was three
 *      modules independently choosing "40"; a scale nobody's CSS obeys would
 *      just be a fourth opinion.
 *   3. The chrome's modality locks are both present: the CSS one (`:has()` +
 *      the stamped attribute) and the React one (the retire control is not
 *      rendered while an overlay is up).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAYERS } from '../src/ui/chrome/layers';

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/** Strip comments so a documented example is never mistaken for shipped CSS. */
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The z-index a named rule resolves to, following `var(--z-x, N)`. */
function zIndexOf(css: string, selector: string): number | null {
  const rule = new RegExp(`(^|[,}])\\s*${selector.replace(/[.\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm')
    .exec(strip(css));
  if (!rule || !rule[2]) return null;
  const decl = /z-index\s*:\s*([^;]+);/.exec(rule[2]);
  if (!decl || !decl[1]) return null;
  const value = decl[1].trim();
  const viaVar = /var\(\s*(--[\w-]+)\s*(?:,\s*(\d+)\s*)?\)/.exec(value);
  if (viaVar) return viaVar[2] ? Number(viaVar[2]) : null;
  return Number(value);
}

describe('chrome clearance lint (AAA 11.4)', () => {
  it('finds no literal chrome height in any page or overlay CSS', () => {
    // Throws (and prints every offending file:line) on a non-zero exit.
    const out = execFileSync('node', [resolve(ROOT, 'scripts/lint-chrome-clearance.mjs')], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(out).toMatch(/ok — every page\/overlay surface clears the bar/);
  });

  it('still detects the literal that shipped the navigation bug', () => {
    const out = execFileSync(
      'node', [resolve(ROOT, 'scripts/lint-chrome-clearance.mjs'), '--self-test'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(out).toMatch(/self-test ok/);
  });

  it('keeps the bar itself on the token, both ends of the drift', () => {
    const header = /\.chr-header\s*\{([\s\S]*?)\}/.exec(strip(read('src/ui/chrome/chrome.css')));
    expect(header?.[1]).toMatch(/min-height:\s*calc\(\s*var\(--chrome-h\)/);
    // …and the surfaces that clear it read the same token, never a copy.
    expect(strip(read('src/ui/blueprint/blueprint.css'))).toMatch(
      /padding:\s*calc\(var\(--chrome-h\)\s*\+\s*env\(safe-area-inset-top/,
    );
  });

  it('trims the bar wherever tokens.css trims the token', () => {
    // --chrome-h drops to 50px at max-height:700; the bar's own padding has to
    // give back the same 2px or the clearance is a promise the bar breaks.
    const chrome = strip(read('src/ui/chrome/chrome.css'));
    const tokens = strip(read('src/ui/theme/tokens.css'));
    const breakpoints = [...tokens.matchAll(/@media\s*\(max-height:\s*(\d+)px\)/g)].map((m) => m[1]);
    expect(breakpoints.length).toBeGreaterThan(0);
    for (const bp of breakpoints) {
      const block = new RegExp(`@media\\s*\\(max-height:\\s*${bp}px\\)\\s*\\{[\\s\\S]*?\\.chr-header`).exec(chrome);
      expect(block, `chrome.css has no .chr-header rule at max-height:${bp}px`).toBeTruthy();
    }
  });
});

describe('the layering scale (AAA 11.5)', () => {
  const chrome = read('src/ui/chrome/chrome.css');

  it('paints the rungs in the published order', () => {
    expect(LAYERS.page).toBeLessThan(LAYERS.overlay);
    expect(LAYERS.overlay).toBeLessThan(LAYERS.chrome);
    expect(LAYERS.chrome).toBeLessThan(LAYERS.notice);
    /**
     * ROUND 53 — THIS PAIR IS THE OTHER WAY UP NOW, AND IT IS A FINDING RATHER
     * THAN A RENUMBERING. The veil was 55 under the rail's 60, and a live
     * verifier photographed `.chr-notices` at [0, 220, 375, 161] printing a
     * cream payout card at FULL BRIGHTNESS over the candle, dead centre, while
     * the rest of the glass went dark around it. Dusk falls out of the last
     * step and the last step is very often the one that drafted the room the
     * notice is about, so the collision is the ordinary shape of the last
     * draft of the day rather than a rare alignment. Dusk falls over the whole
     * house — including the rail, which is a payout line and not a system
     * prompt. Both layers are pointer-transparent, so nothing about what may
     * be TAPPED changed with them (ui/chrome/layers.ts).
     */
    expect(LAYERS.notice).toBeLessThan(LAYERS.veil);
    expect(LAYERS.veil).toBeLessThan(LAYERS.moment);
    expect(LAYERS.moment).toBeLessThan(LAYERS.material);
    expect(LAYERS.material).toBeLessThan(LAYERS.platform);
  });

  it('gives every layer its rung from the scale, not a number of its own', () => {
    expect(zIndexOf(chrome, '.chr-header')).toBe(LAYERS.chrome);
    expect(zIndexOf(chrome, '.chr-notices')).toBe(LAYERS.notice);
    expect(zIndexOf(chrome, '.chr-scene')).toBe(LAYERS.overlay);
    expect(zIndexOf(chrome, '.chr-dusk')).toBe(LAYERS.veil);
    expect(zIndexOf(read('src/ui/dialogue/dialogue.css'), '.dlg')).toBe(LAYERS.overlay);
    expect(zIndexOf(read('src/ui/blueprint/blueprint.css'), '.bp-modal')).toBe(LAYERS.overlay);
    expect(zIndexOf(read('src/ui/moment/moment.css'), '.mom-layer')).toBe(LAYERS.moment);
  });

  it('never leaves the chrome and an overlay sharing a rung', () => {
    // The whole defect in one assertion: equal z-index means DOM order
    // decides, and <GameChrome /> mounts last.
    const overlayRungs = [
      zIndexOf(read('src/ui/dialogue/dialogue.css'), '.dlg'),
      zIndexOf(read('src/ui/blueprint/blueprint.css'), '.bp-modal'),
      zIndexOf(chrome, '.chr-scene'),
    ];
    for (const rung of overlayRungs) {
      expect(rung).not.toBeNull();
      expect(rung).not.toBe(zIndexOf(chrome, '.chr-header'));
    }
  });

  it('locks the chrome out of an overlay in CSS and in React', () => {
    const css = strip(chrome);
    // Lock 1: pointer-inert while any overlay is mounted — both the :has()
    // rule and the attribute fallback for engines without it.
    expect(css).toMatch(/:root\[data-overlay-open\]\s*\.chr-header/);
    expect(css).toMatch(/body:has\([^)]*\.dlg[^)]*\)\s*\.chr-header/);
    expect(css).toMatch(/pointer-events:\s*none/);
    // Nothing inside the bar may opt back in.
    expect(css).not.toMatch(/\.chr-(retire|chip|steps)[^{]*\{[^}]*pointer-events:\s*auto/);
    // Lock 2: the destructive control is not rendered at all.
    const header = read('src/ui/chrome/DayHeader.tsx');
    expect(header).toMatch(/useOverlayOpen\(\)/);
    expect(header).toMatch(/const showRetire =[^;]*!overlayOpen/s);
  });

  it('watches the DOM, because no slice of the store knows a scene is up', () => {
    const watch = read('src/ui/chrome/overlay-watch.ts');
    expect(watch).toMatch(/MutationObserver/);
    expect(watch).toMatch(/childList: true, subtree: true/);
    // The opt-in contract for any overlay added later.
    expect(read('src/ui/chrome/layers.ts')).toMatch(/\[data-overlay\]/);
  });
});
