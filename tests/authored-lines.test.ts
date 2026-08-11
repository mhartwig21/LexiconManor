/**
 * NOTHING AUTHORED MAY BE INVISIBLE ON EVERY PHONE THE GAME SHIPS TO.
 * OWNER: A4 (rooms) / A2 (chrome). Static, and deliberately so — this defect
 * is invisible to a screenshot BY CONSTRUCTION, which is how it survived four
 * rounds of live passes.
 *
 * THE DEFECT, MEASURED (round 28, three instances, all shipped):
 *   `.mic__sub`  "A phrase sits in the tray, its letters swapped…"   0.0 x 0.0
 *   `.m2__sub`   "Small words, neatly folded. Fill every square."    0.0 x 0.0
 *   `.ch__sub`   "Every row, column, and quarter carries all nine…"  0.0 x 0.0
 * at BOTH 390x844 and 375x667, because each was `display: none` inside a
 * `@media (max-height: 900px)` block and 844 < 900. Two of the three carried a
 * ROOM'S RULE. One of them was written by the round whose stated job was to
 * put that room's rule somewhere it could be read, three lines under a comment
 * that said the line was hidden.
 *
 * THE RULE THIS GATE ENFORCES: if a selector is switched off by a max-height
 * query at or above the tallest phone the game supports, then that query is on
 * for every supported phone, and no shipped view may render into it. Trim
 * chrome by all means — `.m2__head` goes at 900 and that is a fit decision —
 * but then take the element out, do not leave copy standing in a box the game
 * never draws.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src');

/** Every phone the game is tested and shipped against (AAA §0.4). */
const SHIPPED_HEIGHTS = [844, 667];
const TALLEST = Math.max(...SHIPPED_HEIGHTS);

function walk(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, ext));
    else if (full.endsWith(ext)) out.push(full);
  }
  return out;
}

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Class names a stylesheet switches off at EVERY supported phone height — i.e.
 * `display: none` inside a `@media` block whose `max-height` is at or above the
 * tallest shipped phone, so the query is live on all of them.
 */
export function hiddenOnEveryPhone(css: string): string[] {
  const body = strip(css);
  const found = new Set<string>();
  const media = /@media[^{]*\(\s*max-height:\s*(\d+)px\s*\)[^{]*\{/g;
  for (let m = media.exec(body); m; m = media.exec(body)) {
    if (Number(m[1]) < TALLEST) continue;
    // Walk to the matching close brace: the block holds whole rules.
    let i = m.index + m[0].length;
    let depth = 1;
    while (depth > 0 && i < body.length) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') depth--;
      i++;
    }
    const block = body.slice(m.index + m[0].length, i - 1);
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    for (let r = rule.exec(block); r; r = rule.exec(block)) {
      if (!/display\s*:\s*none/.test(r[2]!)) continue;
      for (const sel of r[1]!.split(',')) {
        for (const cls of sel.matchAll(/\.([A-Za-z0-9_-]+)/g)) found.add(cls[1]!);
      }
    }
  }
  return [...found];
}

/**
 * The ONE class allowed to be rendered into a box no phone draws, and why.
 *
 * A room's NAME is repeated on the blueprint she walked in from and by the
 * room's own dialogue; a room's RULE is written once. That is the whole of the
 * distinction: a nameplate may be traded for fit, a sentence may not, because a
 * sentence is the only place a rule can live. Round 8 measured what this trade
 * buys — the 40px is most of what takes the Linen Closet's square from 40.4px
 * to the ruled 44 (AAA 6.19) at 375x667.
 *
 * The list is asserted whole below: a NEW entry cannot appear without a human
 * writing the reason, and an entry whose CSS no longer hides it fails too.
 */
const EXEMPT: Record<string, string> = {
  m2__head:
    'The Linen Closet nameplate. It holds a NAME, not a rule, and the 40px it '
    + 'costs is what keeps the square at 44px on a 667-tall phone (round 8).',
};

describe('no authored line is invisible on every shipped phone', () => {
  it('keeps its exemption list short, reasoned, and still true', () => {
    const hidden = new Set(
      walk(SRC, '.css').flatMap((f) => hiddenOnEveryPhone(readFileSync(f, 'utf8'))),
    );
    for (const [cls, why] of Object.entries(EXEMPT)) {
      expect(why.length, `${cls} is exempt with no reason`).toBeGreaterThan(40);
      // An exemption that has outlived its defect is deleted, not kept.
      expect(hidden.has(cls), `.${cls} is no longer hidden — drop the exemption`).toBe(true);
    }
  });

  it('finds no class the app renders into a box no phone draws', () => {
    const sheets = walk(SRC, '.css');
    const views = walk(SRC, '.tsx').map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));
    const offences: string[] = [];
    for (const sheet of sheets) {
      for (const cls of hiddenOnEveryPhone(readFileSync(sheet, 'utf8'))) {
        if (cls in EXEMPT) continue;
        // A className token, not a mention: `className="… cls …"` or a
        // template/conditional that yields the token.
        const used = views.filter((v) => new RegExp(
          `className=(?:"|'|\\{\`)[^"'\`]*\\b${cls}\\b`,
        ).test(v.text));
        for (const v of used) {
          offences.push(
            `.${cls} is display:none for every shipped phone `
            + `(${relative(ROOT, sheet)}) and is still rendered by ${relative(ROOT, v.file)}`,
          );
        }
      }
    }
    expect(offences, offences.join('\n')).toEqual([]);
  });

  it('still detects the three lines that shipped 0.0 x 0.0 (self-test)', () => {
    // The rule exactly as it stood in micro.css before round 28 retired it.
    const shipped = `
      .mic__sub { margin: 0.15rem 0 0; font-size: var(--text-sm); }
      @media (max-height: 900px) {
        .mic { gap: 0.45rem; }
        .mic__sub { display: none; }
      }
    `;
    expect(hiddenOnEveryPhone(shipped)).toEqual(['mic__sub']);
    // A trim that only bites the SHORT phone is a fit decision, not a defect:
    // the line is still read on a 844-tall glass, so the parser must not flag
    // it. (`.mic__head` is exactly this case and has to keep working.)
    expect(hiddenOnEveryPhone(`
      @media (max-height: 700px) { .mic__head { display: none; } }
    `)).toEqual([]);
    // And a comment about the defect is not the defect.
    expect(hiddenOnEveryPhone(`
      /* @media (max-height: 900px) { .ghost { display: none; } } */
      .ghost { color: red; }
    `)).toEqual([]);
  });

  it('watches the heights it claims to watch', () => {
    // If a taller phone is ever added to the supported set, this gate has to
    // widen with it or it silently stops covering the new one.
    expect(SHIPPED_HEIGHTS).toContain(844);
    expect(SHIPPED_HEIGHTS).toContain(667);
    expect(TALLEST).toBe(844);
  });
});
