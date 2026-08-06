/**
 * tests/navigation-reachability.test.ts — OWNER: A2 (chrome).
 *
 * The STATIC half of the round-10 navigation pass. The live half is
 * `tests/navigation-live.mjs`, which drives the real app in Edge and is the
 * only admissible evidence for §11 (AAA §0.1.7). This file exists because that
 * one needs a browser and a dev server: these assertions are the tripwires
 * that fire in `vitest run`, on every commit, when someone reaches for the
 * shape of a defect this round removed.
 *
 * Each `it` names the defect it is standing over, so a failure reads as "you
 * are re-opening X", not as "a regex did not match".
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** Comments explain defects, so they are full of the words being linted. */
const code = (tsx: string) =>
  tsx.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the destructive control is labelled (AAA 11.7)', () => {
  const header = code(read('src/ui/chrome/DayHeader.tsx'));
  const css = strip(read('src/ui/chrome/chrome.css'));

  it('renders a word at rest, not only after the first tap has armed it', () => {
    // THE DEFECT: `{armed ? 'Retire?' : '☾'}` — the only glyph in the chrome
    // that ends the day, and the word appeared one tap too late to warn her.
    expect(header).not.toMatch(/\{\s*armed\s*\?[^}]*:\s*['"]☾['"]\s*\}/);
    expect(header).toMatch(/chr-retire__word/);
    // The unarmed face says the verb; the armed face says the consequence.
    expect(header).toMatch(/>Retire</);
    expect(header).toMatch(/End the day\?/);
  });

  it('keeps the moon as decoration, never as the meaning', () => {
    expect(header).toMatch(/chr-retire__moon[^>]*aria-hidden/);
    expect(css).toMatch(/\.chr-retire__moon\s*\{[^}]*color:\s*var\(--ink-faint\)/);
  });

  it('keeps the two-tap arming that makes it survivable', () => {
    expect(header).toMatch(/if\s*\(!armed\)\s*\{\s*setArmed\(true\)/);
    expect(header).toMatch(/endDay\('retired-early'\)/);
  });

  it('does not dress as a fourth currency chip', () => {
    // The chips are FILLED and borderless; the retire plate is OUTLINED. If
    // these two ever agree again it is back to looking like a display toggle.
    const chip = /\.chr-chip\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const retire = /\.chr-retire\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(chip).toMatch(/background:\s*var\(--paper-shade\)/);
    expect(retire).toMatch(/background:\s*transparent/);
    expect(retire).toMatch(/border:\s*var\(--rule\)/);
    expect(chip).not.toMatch(/border:\s*var\(--rule\)/);
  });

  it('gives the armed confirm somewhere to fit', () => {
    // Measured at 390x844: the bar has ~7px of slack with three chips on it,
    // so the longer armed string only fits because the chips stand aside.
    expect(header).toMatch(/chr-right--arming/);
    expect(css).toMatch(/\.chr-right--arming\s+\.chr-chip\s*\{\s*display:\s*none/);
  });
});

describe('the victory ceremony is leavable (AAA 11.1)', () => {
  const view = read('src/ui/sanctum/SanctumView.tsx');

  it('offers its terminal action from the ceremony, not only from the epilogue', () => {
    // THE DEFECT: `won-reveal` and the CLOSING_BEATS variant of `won-portrait`
    // carried only forward controls ("Look up at the Portrait", "…", "Let him
    // rest") and there is no auto-advance, so 11.1's single exemption did not
    // apply. The campaign's one unrepeatable scene had no way out.
    expect(view).toMatch(/const ceremonyExit = \(/);
    const reveal = /if \(phase === 'won-reveal'\) \{[\s\S]*?\n  \}/.exec(view)?.[0] ?? '';
    const portrait = /if \(phase === 'won-portrait'\) \{[\s\S]*?\n  \}/.exec(view)?.[0] ?? '';
    expect(reveal).toMatch(/\{ceremonyExit\}/);
    expect(portrait).toMatch(/\{ceremonyExit\}/);
  });

  it('closes the volume properly rather than merely navigating away', () => {
    // A plain BackLink here would have been worse than no exit: `closeVolume`
    // is the ONLY caller of beginNextVolume()/endDay('volume-solved') in the
    // app, and the already-solved screen she would return to does not offer it.
    expect(view).toMatch(/const ceremonyExit = \([\s\S]*?closeVolume\(\)/);
    expect(view).toMatch(/const closeVolume = \(\) => \{\s*beginNextVolume\(\);/);
  });

  it('leads with the recognisable phrase and keeps the flavour subordinate', () => {
    expect(view).toMatch(/snc-btn__label">Let the house sleep</);
    expect(view).toMatch(/snc-btn__sub">/);
    const css = strip(read('src/ui/sanctum/sanctum.css'));
    const sub = /\.snc-btn__sub\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(sub).toMatch(/font-size:\s*var\(--text-sm\)/);
    expect(sub).toMatch(/color:\s*var\(--ink-faint\)/);
  });
});

describe('a fresh save can reach the trunk (AAA 11.8 / 11.26)', () => {
  const page = read('src/pages/ManorPage.tsx');

  it('puts the doors on the front step, not only below the early return', () => {
    const front = /if \(!day\) \{[\s\S]*?\n  \}/.exec(page)?.[0] ?? '';
    expect(front).toMatch(/<Entrances \/>/);
    expect(front).toMatch(/Begin the first day/);
  });

  it('keeps them in ONE component so a future early return cannot drop them', () => {
    expect(page).toMatch(/function Entrances\(/);
    expect(page).toMatch(/navigate\('\/chronicles'\)/);
    // Two call sites, one definition: the no-day branch and the footer.
    expect(page.match(/<Entrances[\s/]/g)?.length).toBe(2);
  });
});

describe('the boot gate is not a dead end (AAA 11.1 / 11.26)', () => {
  const app = read('src/App.tsx');
  const gate = read('src/ui/chrome/BootGate.tsx');

  it('stops retrying silently after a bounded budget', () => {
    // THE DEFECT: the gate rendered one italic line with no controls and
    // retried forever. In the standalone PWA there is no reload button, so
    // that line was the whole application, permanently.
    expect(app).toMatch(/const BOOT_ATTEMPTS = \d+;/);
    expect(app).toMatch(/if \(tries >= BOOT_ATTEMPTS\) \{ setStalled\(true\); return; \}/);
  });

  it('keeps /chronicles routable while the pools are missing', () => {
    const boot = /if \(!ready\) \{[\s\S]*?\n  \}/.exec(app)?.[0] ?? '';
    expect(boot).toMatch(/<Route path="\/chronicles" component=\{ChroniclesPage\} \/>/);
    expect(boot).toMatch(/<BootGate/);
  });

  it('retries by reloading, because a failed dynamic import stays failed', () => {
    // Measured live (tests/navigation-live.mjs): the module map records the
    // failure, so re-calling loadPools() in the same document re-throws the
    // stored error without refetching. An in-place retry could not work once.
    expect(app).toMatch(/onRetry=\{\(\) => \{[^}]*window\.location\.reload\(\)/);
  });

  it('offers exactly the two things a stalled boot owes: retry, and the trunk', () => {
    expect(gate).toMatch(/onClick=\{onRetry\}/);
    expect(gate).toMatch(/navigate\('\/chronicles'\)/);
    expect(gate).toMatch(/boot__aside-label">Chronicles</);
  });

  it('says it in the house voice, with no defeat language (AAA 4.12)', () => {
    const copy = [...gate.matchAll(/>([^<>{}]{12,})</g)].map((m) => m[1]!).join(' ');
    expect(copy).toMatch(/slow to wake/i);
    for (const banned of ['fail', 'failure', 'lose', 'lost', 'error', 'death', 'defeat', 'crash']) {
      expect(copy.toLowerCase(), `boot-gate copy uses "${banned}"`).not.toContain(banned);
    }
  });
});
