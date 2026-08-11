import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  lockedDraftLabel, lockedRefusalAnnouncement, lockedRefusalLine, LOCKED_REFUSAL_LINES,
} from '../src/ui/blueprint/pricing';
import { rowName } from '../src/engine/economy/steps';

/**
 * ═══ THE PADLOCK REFUSED WORDLESSLY (round-5 verifier, AAA 4.16) ══════════
 *
 * Tapping a padlocked door with no key played a 420ms shrug on the brass and
 * said NOTHING. Everything else about the refusal was right — nothing charged,
 * nothing scolded, the padlock drawn on the sheet long before she walked
 * toward it — but 4.16 is explicit that a gate never answers with silence, and
 * silence is worst exactly where it landed: a player who has not yet learned
 * what the brass shape means gets no way to learn it by trying, and an
 * animation with no message is indistinguishable from a mis-tap.
 *
 * Compounding it, the ghost carried `aria-disabled="true"`, so assistive tech
 * was told the control was inert while a real finger got a response. ARIA that
 * contradicts behaviour is worse than absent ARIA: AT is invited to skip a
 * control that *does* answer, so the one player who most needs the gate
 * explained is the one told there is nothing there.
 *
 * This file pins both halves of the fix. There is no DOM environment in this
 * project's vitest config, so the wiring is asserted by source inspection —
 * the same technique tests/notice-copy.test.ts already uses for render sites.
 */

const root = join(__dirname, '..');
const SHEET = readFileSync(join(root, 'src', 'ui', 'blueprint', 'BlueprintSheet.tsx'), 'utf8');
const SHEET_CSS = readFileSync(join(root, 'src', 'ui', 'blueprint', 'blueprint.css'), 'utf8');

describe('the refusal has words (AAA 4.16 — never silence at a gate)', () => {
  it('every line is short, warm, and names the remedy', () => {
    expect(LOCKED_REFUSAL_LINES.length).toBeGreaterThanOrEqual(2);
    for (const line of LOCKED_REFUSAL_LINES) {
      expect(line.trim().length).toBeGreaterThan(0);
      // Short enough to read at a glance on a 390px sheet without wrapping.
      expect(line.length).toBeLessThanOrEqual(48);
      // The refusal's whole job is to point at the key supply.
      expect(line.toLowerCase()).toContain('key');
    }
  });

  /**
   * ═══ ROUND 33 — NAMING THE REMEDY IS NOT NAMING THE SOURCE ════════════════
   *
   * The assertion above has been green since round 6 and the blind spot it was
   * written for has survived two cold reads and five testers: "what keys are
   * for / how they arrive" was still [major] and OPEN on 11 Aug, by which time
   * keys actually arrive — one tester collected FOUR and lost all four unused,
   * the other earned one and lost it, and both saw the padlock drawn on the map
   * without ever connecting it to the chip in the bar. "It wants a key" passes
   * the test above and tells a player with no key nowhere to go.
   *
   * So the line must also say where a key comes from, and the answer has to be
   * the one the game actually pays: a SOLVE. This is not a second vocabulary —
   * `draftCardStake` prints "+1 key on solve" on a card's face if and only if
   * `solveKeys(tier, kind) > 0` (pinned in tests/steps.test.ts), so the refusal
   * points at a card and the card keeps the promise.
   *
   * NOT GREEN BY CONSTRUCTION (standing rule 1). Measured against the copy this
   * replaces: all three of round 6's lines — "Shut fast. It wants a key.",
   * "Still shut — a key first, then the door.", "The brass holds. Bring a key
   * and it won’t argue." — fail it, and so does any future line that names the
   * price without naming where the price is earned.
   */
  it('every line also names WHERE a key comes from, not only that one is wanted', () => {
    for (const line of LOCKED_REFUSAL_LINES) {
      expect(
        /solve[sd]?\b/i.test(line),
        `"${line}" names the remedy but not its source`,
      ).toBe(true);
    }
    // And the spoken form ties it to the surface that keeps the promise.
    expect(lockedRefusalAnnouncement(0, 5, 1).toLowerCase()).toContain('solved room pays');
  });

  it('uses no defeat language (AAA 4.12 string lint)', () => {
    const copy = [
      ...LOCKED_REFUSAL_LINES,
      lockedRefusalAnnouncement(0, 5, 1),
      lockedDraftLabel(3, 5, 1, false),
    ].join(' ').toLowerCase();
    for (const banned of ['fail', 'failure', 'lose', 'loser', 'death', 'damage', 'defeat']) {
      expect(copy).not.toContain(banned);
    }
    // Costs read as spending, never dying (AAA R.3) — and here nothing is even
    // spent, which the copy has to be able to say.
    expect(lockedRefusalAnnouncement(0, 5, 1).toLowerCase()).toContain('nothing was spent');
  });

  it('answers a second try instead of parroting the first', () => {
    expect(lockedRefusalLine(1)).not.toBe(lockedRefusalLine(0));
    expect(lockedRefusalLine(2)).not.toBe(lockedRefusalLine(1));
    // It rotates rather than running out.
    expect(lockedRefusalLine(LOCKED_REFUSAL_LINES.length)).toBe(lockedRefusalLine(0));
    expect(lockedRefusalLine(-4)).toBe(lockedRefusalLine(0));
  });

  it('the spoken form restates the whole gate (the glyph is invisible to AT)', () => {
    const spoken = lockedRefusalAnnouncement(0, 5, 1);
    expect(spoken).toContain(lockedRefusalLine(0));
    expect(spoken).toContain(rowName(5));       // WHICH door
    expect(spoken).toContain('1 key');          // what opens it
    expect(spoken.toLowerCase()).toContain('padlock');
    // It is a restatement, not a repetition of the terse drawn line.
    expect(spoken.length).toBeGreaterThan(lockedRefusalLine(0).length * 2);
    // Plural agreement, in case a future retune raises the price.
    expect(lockedRefusalAnnouncement(0, 5, 2)).toContain('2 keys');
  });
});

describe('the ARIA matches the behaviour', () => {
  it('the sheet no longer claims a responsive control is disabled', () => {
    // The defect, in one grep: a control that answers a tap must not be
    // announced as disabled. If a future edit reintroduces the ATTRIBUTE
    // anywhere on the sheet, this fails. (The prose explaining why it was
    // removed is allowed to name it — that is the point of the comment.)
    expect(SHEET).not.toMatch(/aria-disabled\s*=/);
  });

  it('the keyless ghost is still a button, and still tells AT it is padlocked', () => {
    expect(SHEET).toContain('role="button"');
    // ROUND 20: the label gained the WING it opens into (REVIEW_AA §4), so the
    // grep is for the padlock's own arguments — the key cost and whether she
    // can pay — which are the part this test is about.
    expect(SHEET).toMatch(/lockedDraftLabel\(player\.row, cell\.row, KEY_COST, canPay,/);
    // The label carries the state ARIA no longer (wrongly) carries.
    const keyless = lockedDraftLabel(3, 5, 1, false);
    expect(keyless.toLowerCase()).toContain('padlocked');
    expect(keyless).toContain('1 key');
    // With a key it reads as an opening, not a wall.
    expect(lockedDraftLabel(3, 5, 1, true).toLowerCase()).toContain('unlock');
  });

  it('a keyless tap routes to the refusal, never to a charged draft', () => {
    expect(SHEET).toContain('canPay ? onOpenDraft(dir) : refuse(key, cell.row)');
  });
});

describe('the refusal reaches the player where she is standing', () => {
  it('is drawn on the sheet and announced in a polite live region', () => {
    expect(SHEET).toContain('bp-refusal');
    expect(SHEET).toContain('lockedRefusalLine(attempt)');
    expect(SHEET).toContain('role="status"');
    expect(SHEET).toContain('aria-live="polite"');
    expect(SHEET).toContain('refused?.spoken');
  });

  it('outlasts the shrug it accompanies (a line nobody can read is silence)', () => {
    // The lock's shrug animation is 420ms; the words must stay far longer.
    const shrug = /bp-padlock-shrug\s+(\d+)ms/.exec(SHEET_CSS);
    expect(shrug).not.toBeNull();
    const hold = /setTimeout\(\(\) => setRefused\(null\), (\d+)\)/.exec(SHEET);
    expect(hold).not.toBeNull();
    expect(Number(hold![1])).toBeGreaterThan(Number(shrug![1]) * 3);
    expect(Number(hold![1])).toBeGreaterThanOrEqual(2000);
  });

  it('cannot eat the next tap, and cannot shift the sheet', () => {
    const block = SHEET_CSS.slice(SHEET_CSS.indexOf('.bp-refusal'));
    expect(block).toMatch(/pointer-events:\s*none/);
    // The spoken form is out of flow, so it moves nothing (AAA 1.5).
    expect(SHEET_CSS).toMatch(/\.bp-sr\s*\{[^}]*position:\s*absolute/);
    expect(SHEET_CSS).toMatch(/\.bp-sr\s*\{[^}]*clip-path:\s*inset\(50%\)/);
    // Never display:none — that would drop it out of the a11y tree entirely.
    expect(/\.bp-sr\s*\{[^}]*display:\s*none/.test(SHEET_CSS)).toBe(false);
  });

  it('survives reduced motion with the words intact (AAA U.3)', () => {
    const reduced = SHEET_CSS.slice(SHEET_CSS.indexOf('prefers-reduced-motion'));
    expect(reduced).toContain('.bp-refusal');
    expect(reduced).toMatch(/\.bp-refusal\s*\{\s*opacity:\s*1/);
  });

  it('does not dress like a reward (AAA 11.14)', () => {
    const block = SHEET_CSS.slice(
      SHEET_CSS.indexOf('.bp-refusal'),
      SHEET_CSS.indexOf('/* A door she cannot open today'),
    );
    // Nothing is awarded here, so it must not borrow reward ink: no wax red,
    // no gilt, no stamp idiom.
    expect(block).not.toContain('--wax');
    expect(block).not.toContain('--gilt');
  });
});
