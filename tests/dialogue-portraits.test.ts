/**
 * The two Lexicographers must be one man — OWNER: A6 (Dialogue).
 *
 * There are two hand-drawn portraits of the same character in this codebase:
 * `ui/sanctum/PortraitFrame` (the gilt oval over the Sanctum door) and
 * `ui/dialogue/portraits` `PortraitPortrait` (the 48px-and-up cameo beside
 * every line he speaks). They drifted: the oval gave him round spectacles —
 * "his one glint of light" — and the cameo delegated its face to the shared
 * `Face` helper, which has none. So the man who sighs at your wrong guess was
 * not the man in the frame directly above him, and the two women in the cast
 * wore glasses while the lexicographer defined by them did not (AAA 6.12:
 * every cast member recognizable from the 48px cameo alone).
 *
 * A screenshot review cannot be run from vitest, so this is the structural
 * half of that check: both drawings are rendered and their spectacle geometry
 * compared in their own viewBox. The reviewer sign-off row lives in the shot
 * index; this stops the pair silently diverging between rounds.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CharacterPortrait from '../src/ui/dialogue/portraits';
import PortraitFrame from '../src/ui/sanctum/PortraitFrame';
import { CHARACTER_IDS } from '../src/engine/types';
import { PORTRAIT_EXPRESSIONS } from '../src/engine/dialogue/schema';

const svgFor = (character: (typeof CHARACTER_IDS)[number]) =>
  renderToStaticMarkup(createElement(CharacterPortrait, { character }));

interface Circle { cx: number; cy: number; r: number }

function circles(markup: string): Circle[] {
  const out: Circle[] = [];
  for (const m of markup.matchAll(/<circle\b[^>]*>/g)) {
    const tag = m[0];
    const num = (attr: string) => {
      const hit = new RegExp(`${attr}="([-\\d.]+)"`).exec(tag);
      return hit ? parseFloat(hit[1]!) : NaN;
    };
    const c = { cx: num('cx'), cy: num('cy'), r: num('r') };
    if (![c.cx, c.cy, c.r].some(Number.isNaN)) out.push(c);
  }
  return out;
}

/** A spectacle pair: two same-radius circles mirrored about the face axis. */
function lensPair(markup: string, axis: number): Circle[] | null {
  const cs = circles(markup);
  for (const a of cs) {
    for (const b of cs) {
      if (a === b || a.cx >= b.cx) continue;
      const mirrored = Math.abs((a.cx + b.cx) / 2 - axis) < 4;
      const sameSize = Math.abs(a.r - b.r) < 1.5;
      const sameHeight = Math.abs(a.cy - b.cy) < 2;
      const lensSized = a.r >= 8 && a.r <= 18;
      const apart = b.cx - a.cx >= 24;
      if (mirrored && sameSize && sameHeight && lensSized && apart) return [a, b];
    }
  }
  return null;
}

describe('the Lexicographer is one man in both drawings (AAA 6.12)', () => {
  const cameo = svgFor('portrait');
  const frame = renderToStaticMarkup(createElement(PortraitFrame, { soft: false }));

  it('the Sanctum frame wears his spectacles', () => {
    expect(lensPair(frame, 120)).toBeTruthy();
  });

  it('the dialogue cameo wears them too — the defect itself', () => {
    expect(lensPair(cameo, 120)).toBeTruthy();
  });

  it('the two pairs sit at the same height and spread, in the same viewBox', () => {
    const a = lensPair(frame, 120)!;
    const b = lensPair(cameo, 120)!;
    expect(Math.abs(a[0]!.cy - b[0]!.cy)).toBeLessThanOrEqual(14);
    const spread = (p: Circle[]) => p[1]!.cx - p[0]!.cx;
    expect(Math.abs(spread(a) - spread(b))).toBeLessThanOrEqual(12);
    // Both are authored at 240x300 — a mismatch here means one got rescaled.
    expect(frame).toContain('viewBox="0 0 240 300"');
    expect(cameo).toContain('viewBox="0 0 240 300"');
  });

  it('the lenses ride on his eyes, not on his forehead', () => {
    // Face() puts the cameo's eyes at cy 138 (±22 * 0.92 from cx 120).
    const pair = lensPair(cameo, 120)!;
    const l = pair[0]!;
    const r = pair[1]!;
    expect(Math.abs(l.cy - 138)).toBeLessThanOrEqual(4);
    expect(Math.abs(l.cx - (120 - 22 * 0.92))).toBeLessThanOrEqual(4);
    expect(Math.abs(r.cx - (120 + 22 * 0.92))).toBeLessThanOrEqual(4);
  });

  it('every cameo still renders for every expression (no crashes, no blanks)', () => {
    for (const c of CHARACTER_IDS) {
      for (const expression of PORTRAIT_EXPRESSIONS) {
        const markup = renderToStaticMarkup(
          createElement(CharacterPortrait, { character: c, expression }),
        );
        expect(markup.length).toBeGreaterThan(200);
        expect(markup).toContain(`aria-label="${c}"`);
      }
    }
  });

  it('the two women are not the only ones in glasses', () => {
    // Bramble and Ellery draw their own; if the Portrait ever loses his again
    // this is the sentence that fails.
    expect(lensPair(svgFor('bramble'), 120)).toBeTruthy();
    expect(lensPair(svgFor('ellery'), 120)).toBeTruthy();
    expect(lensPair(cameo, 120)).toBeTruthy();
  });
});
