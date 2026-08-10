/**
 * lint-chrome-clearance — OWNER: A2 (chrome). CI gate for AAA 11.4.
 *
 * THE BUG THIS EXISTS TO PREVENT (it already shipped once):
 * `ui/blueprint/blueprint.css` cleared the fixed day bar with
 * `calc(52px + env(safe-area-inset-top))` while `ui/theme/tokens.css`
 * re-declared `--chrome-h: 50px` at the short-screen breakpoint. Two numbers
 * for one measurement: retune the bar and every page carrying a pixel copy of
 * its old height silently buries whatever sits in its top band — which is how
 * the journal's and chronicles' back buttons ended up UNDER an opaque header,
 * un-tappable, in a build whose screenshots all looked correct (AAA §0.5.1).
 *
 * THE RULE: page and overlay CSS clears the chrome with `var(--chrome-h)`
 * (plus `env(safe-area-inset-top)`), never with a literal. This lint fails the
 * build if a literal comes back.
 *
 * WHAT IS FLAGGED
 *   R1  Any declaration whose value mixes a px literal >= 24 with
 *       `env(safe-area-inset-top)`. That shape IS top-band clearance, whatever
 *       the property is called, and the literal is always the bar's height.
 *   R2  A literal equal to any declared `--chrome-h` value standing in the TOP
 *       edge of a clearance property (top / padding-top / margin-top / inset-
 *       block-start, or the first component of the `padding` / `margin` /
 *       `inset` shorthands). A 52px key cap or a 50px tile is none of the
 *       lint's business; a 52px top inset is.
 *   R3  The bar itself: `.chr-header` in chrome.css must derive its height
 *       from `var(--chrome-h)`. The drift has two ends and this is the other
 *       one — a token nobody's bar obeys is just as broken as a bar nobody's
 *       page reads.
 *   R4  `var(--chrome-h, <fallback>)` is allowed — it is the house pattern for
 *       a token that may not have landed yet, and it is inert the moment the
 *       token exists — but the fallback must be one of the declared heights.
 *       A fallback nobody keeps up to date is a literal with an alibi.
 *   R5  THE OTHER END OF THE SAME DEFECT (REVIEW_AA §5.11, round 24). A
 *       `position: sticky` bar pinned with a NON-ZERO `bottom` is an opaque
 *       layer floating above its scrollport's floor: everything under it in
 *       the scroll is unreachable unless the scroller reserves that lift at
 *       the end of its content. The Cabinet shipped exactly that — "the
 *       Cabinet's close button covers The Study's row", live-measured again
 *       this round with the last plate crossing the foot at FULL scroll — and
 *       it shipped because the lift was written as a literal in one rule with
 *       nothing anywhere answering it. So: the lift must be a `var()`, and
 *       that same custom property must be consumed by a `padding-bottom` (or
 *       `scroll-padding-bottom`) somewhere in the file. `bottom: 0` is exempt
 *       — a bar resting on the floor hides nothing at full scroll.
 *
 * Run: `node scripts/lint-chrome-clearance.mjs`
 * Also asserted by `tests/chrome-clearance.test.ts`, which is what puts it in
 * front of CI today (package.json is architect-owned — a `lint:clearance`
 * script is listed under SHARED-FILE REQUESTS).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');

/** Declares the token; the one file allowed to say the number out loud. */
const TOKENS_FILE = 'src/ui/theme/tokens.css';

/** px literals below this are ornament (hairlines, gaps), never a bar height. */
const MIN_SUSPECT_PX = 24;

/** Properties whose first value component is a top-edge offset. */
const TOP_EDGE_PROPS = new Set([
  'top', 'padding-top', 'margin-top', 'inset-block-start',
  'padding', 'margin', 'inset', 'padding-block', 'margin-block', 'inset-block',
]);

/**
 * Known, DOCUMENTED, self-clearing exemptions.
 *
 * Each entry must still match something: if the literal it covers is gone the
 * lint fails with "stale exemption", so an exemption cannot quietly outlive
 * the defect it describes. Entries are only ever added for files this agent
 * may not edit.
 */
/* ROUND 9: the list is EMPTY, and that is the point. Its one entry was
   src/index.css `.page { padding-top: calc(56px + env(safe-area-inset-top)) }`
   — a third number matching neither the token (52) nor the measured bar. The
   architect landed `var(--chrome-h)` there, so the exemption went stale and was
   deleted in the same change. That is the mechanism working as designed. */
const PENDING = [];

/** Blank out comments, preserving line numbers (and this file\'s own examples). */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function listCss(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) listCss(full, out);
    else if (entry.endsWith('.css')) out.push(full);
  }
  return out;
}

/** Split a value into top-level components (whitespace outside parentheses). */
function components(value) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function pxLiterals(text) {
  return [...text.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
}

/**
 * `var(--tap-target, 44px)` is not a hard-coded anything: the fallback is dead
 * code wherever the token exists, and the house pattern is to carry one so a
 * module works before a requested token lands. Drop fallbacks before hunting
 * literals — but R4 below still checks that a --chrome-h fallback is honest.
 */
function stripVarFallbacks(value) {
  let out = value;
  for (let i = 0; i < 8; i++) {
    const next = out.replace(/var\(\s*(--[\w-]+)\s*,[^()]*\)/g, 'var($1)');
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Every declaration in a stylesheet, with 1-based line numbers. Each carries
 *  the id of the block it sits in, so a rule-level check (R5 needs
 *  `position: sticky` and `bottom:` in the SAME rule) can group them. */
function declarations(css) {
  const src = stripComments(css);
  const out = [];
  let line = 1;
  let buf = '';
  let bufLine = 1;
  let depth = 0;
  let blocks = 0;
  const stack = [];
  for (const ch of src) {
    if (ch === '\n') line++;
    if (ch === '{') { depth++; stack.push(++blocks); buf = ''; bufLine = line; continue; }
    if (ch === '}') { depth--; stack.pop(); buf = ''; bufLine = line; continue; }
    if (ch === ';') {
      if (depth > 0) {
        const idx = buf.indexOf(':');
        if (idx > 0) {
          out.push({
            property: buf.slice(0, idx).trim().toLowerCase(),
            value: buf.slice(idx + 1).trim(),
            line: bufLine,
            block: stack[stack.length - 1],
          });
        }
      }
      buf = '';
      bufLine = line;
      continue;
    }
    if (!buf.trim() && /\s/.test(ch)) { bufLine = line; continue; }
    buf += ch;
  }
  return out;
}

/** The values `--chrome-h` is ever declared as, across all breakpoints. */
export function chromeHeights(root = REPO_ROOT) {
  const css = readFileSync(resolve(root, TOKENS_FILE), 'utf8');
  const found = [...stripComments(css).matchAll(/--chrome-h\s*:\s*(\d+(?:\.\d+)?)px/g)]
    .map((m) => Number(m[1]));
  if (!found.length) {
    throw new Error(`${TOKENS_FILE} declares no --chrome-h — the lint has nothing to compare against`);
  }
  return [...new Set(found)];
}

/**
 * Scan one stylesheet. Exported so the test can feed it the literal that
 * shipped the bug and prove the lint still catches it — a lint nobody has
 * seen fail is a lint nobody knows works.
 */
/**
 * R5 — a sticky bottom bar, and the room the scroller keeps for it.
 * See the header. Runs over the whole sheet because the two halves of the
 * contract live in two different rules by construction: the bar states its
 * lift, the scroller reserves it.
 */
function scanStickyFeet(rel, decls) {
  const violations = [];
  /** Custom properties consumed by a bottom-padding declaration anywhere. */
  const reserved = new Set();
  const PADDING_PROPS = new Set(['padding-bottom', 'scroll-padding-bottom', 'padding', 'padding-block']);
  for (const d of decls) {
    if (!PADDING_PROPS.has(d.property)) continue;
    for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) reserved.add(m[1]);
  }

  const byBlock = new Map();
  for (const d of decls) {
    if (!byBlock.has(d.block)) byBlock.set(d.block, []);
    byBlock.get(d.block).push(d);
  }

  for (const block of byBlock.values()) {
    const sticky = block.some((d) => d.property === 'position' && /sticky/.test(d.value));
    if (!sticky) continue;
    const bottom = block.find((d) => d.property === 'bottom');
    if (!bottom) continue;
    // A bar resting on the scrollport floor hides nothing at full scroll.
    if (/^0(px|rem|%)?$/.test(bottom.value.trim())) continue;
    const vars = [...bottom.value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
    if (vars.length === 0) {
      violations.push({
        file: rel, line: bottom.line, rule: 'R5', property: 'bottom', value: bottom.value,
        message: 'a sticky bar lifted off the scrollport floor by a literal — the content under it can never be scrolled clear. Name the lift as a custom property and reserve it with padding-bottom on the scroller.',
      });
      continue;
    }
    if (!vars.some((v) => reserved.has(v))) {
      violations.push({
        file: rel, line: bottom.line, rule: 'R5', property: 'bottom', value: bottom.value,
        message: `nothing reserves ${vars.join(' / ')} — the sticky bar floats above the scrollport floor and the last row stays under it. Add it to the scroller's padding-bottom.`,
      });
    }
  }
  return violations;
}

export function scanCss(rel, css, heights, onPending) {
  const violations = [];
  const decls = declarations(css);
  violations.push(...scanStickyFeet(rel, decls));
  for (const raw of decls) {
      // R4 — a --chrome-h fallback must name a height the token really takes.
      for (const m of raw.value.matchAll(/var\(\s*--chrome-h\s*,\s*(\d+(?:\.\d+)?)px\s*\)/g)) {
        if (!heights.has(Number(m[1]))) {
          violations.push({
            file: rel, line: raw.line, rule: 'R4', property: raw.property, value: raw.value,
            message: `var(--chrome-h, ${m[1]}px) falls back to a height tokens.css never declares (${[...heights].join('px, ')}px). Match it or drop the fallback.`,
          });
        }
      }

      const decl = { ...raw, value: stripVarFallbacks(raw.value) };
      const hit = (rule, message) => {
        const pending = PENDING.find(
          (p) => p.file === rel && p.property === decl.property &&
            pxLiterals(decl.value).includes(p.literal),
        );
        if (pending) { onPending?.(pending); return; }
        violations.push({ file: rel, line: decl.line, rule, property: decl.property, value: decl.value, message });
      };

      // R1 — a px literal doing the safe-area's arithmetic is a bar height.
      if (/env\(\s*safe-area-inset-top/.test(decl.value)) {
        const big = pxLiterals(decl.value).filter((n) => n >= MIN_SUSPECT_PX);
        if (big.length) {
          hit('R1', `${big.join('px, ')}px added to env(safe-area-inset-top) — this is chrome clearance written as a literal. Use calc(var(--chrome-h) + env(safe-area-inset-top, 0px)).`);
          continue;
        }
      }

      // R2 — a known chrome height sitting on a top edge.
      if (TOP_EDGE_PROPS.has(decl.property)) {
        const first = components(decl.value)[0] ?? '';
        const literal = /^(\d+(?:\.\d+)?)px$/.exec(first);
        if (literal && heights.has(Number(literal[1]))) {
          hit('R2', `${first} is a literal copy of --chrome-h on a top edge. Use var(--chrome-h).`);
      }
    }
  }
  return violations;
}

export function lintChromeClearance(root = REPO_ROOT) {
  const heights = new Set(chromeHeights(root));
  const violations = [];
  const matchedPending = new Set();

  for (const file of listCss(resolve(root, 'src'))) {
    const rel = relative(root, file).split(sep).join('/');
    if (rel === TOKENS_FILE) continue;
    violations.push(
      ...scanCss(rel, readFileSync(file, 'utf8'), heights, (p) => matchedPending.add(p)),
    );
  }

  // R3 — the bar obeys the token too, or the token means nothing.
  const chromeCss = readFileSync(resolve(root, 'src/ui/chrome/chrome.css'), 'utf8');
  const header = /\.chr-header\s*\{([\s\S]*?)\}/.exec(stripComments(chromeCss));
  if (!header) {
    violations.push({ file: 'src/ui/chrome/chrome.css', line: 0, rule: 'R3', property: '.chr-header', value: '', message: 'no .chr-header rule found — the bar the whole scale is measured from has gone missing' });
  } else if (!/(min-height|height)\s*:[^;]*var\(\s*--chrome-h/.test(header[1])) {
    violations.push({ file: 'src/ui/chrome/chrome.css', line: 0, rule: 'R3', property: '.chr-header', value: '', message: '.chr-header does not derive its height from var(--chrome-h) — the bar and the clearance token can drift apart again' });
  }

  const stale = PENDING.filter((p) => !matchedPending.has(p));
  return { violations, stale, pending: PENDING.filter((p) => matchedPending.has(p)) };
}

/* --- Self-test ------------------------------------------------------------
   A lint nobody has watched fail is a lint nobody knows works. These fixtures
   are the literal that shipped the bug, the fixed form, and the two shapes
   most likely to be argued about (a 52px key cap, which is NOT clearance, and
   a var() fallback, which is allowed but must be honest).
   -------------------------------------------------------------------------- */

export function selfTest(heights = new Set([52, 50])) {
  const cases = [
    { name: 'the literal that shipped the bug',
      css: '.bp-page { padding: calc(52px + env(safe-area-inset-top, 0px)) 0 10px; }',
      expect: ['R1'] },
    { name: 'a different literal against the safe area is still clearance',
      css: '.page { padding-top: calc(56px + env(safe-area-inset-top, 0px)); }',
      expect: ['R1'] },
    { name: 'the token form is clean',
      css: '.bp-page { padding: calc(var(--chrome-h) + env(safe-area-inset-top, 0px)) 0 10px; }',
      expect: [] },
    { name: 'a bare chrome height on a top edge',
      css: '.jrn-page { padding-top: 52px; }',
      expect: ['R2'] },
    { name: 'a 52px key cap is not clearance',
      css: '.ch-key { min-height: 52px; }',
      expect: [] },
    { name: 'a 44pt tap target beside the safe area is not clearance',
      css: '.mom-layer { top: calc(var(--chrome-h) + env(safe-area-inset-top, 0px) + var(--tap-target, 44px)); }',
      expect: [] },
    { name: 'an honest var fallback is allowed',
      css: '.mom-layer { top: calc(var(--chrome-h, 52px) + env(safe-area-inset-top, 0px)); }',
      expect: [] },
    { name: 'a var fallback tokens.css never declares',
      css: '.mom-layer { top: calc(var(--chrome-h, 64px) + env(safe-area-inset-top, 0px)); }',
      expect: ['R4'] },
    // R5 — the Cabinet's foot, in all four of its shapes (REVIEW_AA §5.11).
    { name: 'the sticky foot that shipped over the last row',
      css: '.bp-modal__foot { position: sticky; bottom: calc(0.9rem + env(safe-area-inset-bottom, 0px)); }',
      expect: ['R5'] },
    { name: 'a lift named as a token but reserved by nobody',
      css: '.bp-modal__foot { position: sticky; bottom: var(--bp-foot-lift); }',
      expect: ['R5'] },
    { name: 'the fixed form: one lift, pinned once and reserved once',
      css: '.bp-modal__sheet { padding-bottom: calc(var(--bp-foot-lift) + 0.8rem); }\n'
         + '.bp-modal__foot { position: sticky; bottom: var(--bp-foot-lift); }',
      expect: [] },
    { name: 'a sticky deck resting on the scrollport floor is not lifted',
      css: '.room-deck { position: sticky; bottom: 0; }',
      expect: [] },
    { name: 'comments are not code',
      css: '/* was: padding-top: calc(52px + env(safe-area-inset-top)) */\n.x { color: red; }',
      expect: [] },
  ];
  const failures = [];
  for (const c of cases) {
    const got = scanCss('fixture.css', c.css, heights).map((v) => v.rule).sort();
    const want = [...c.expect].sort();
    if (got.join(',') !== want.join(',')) {
      failures.push(`${c.name}: expected [${want}] got [${got}]`);
    }
  }
  return failures;
}

/* --- CLI ------------------------------------------------------------------ */

const invokedDirectly = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly && process.argv.includes('--self-test')) {
  const failures = selfTest(new Set(chromeHeights()));
  for (const f of failures) console.error(`[clearance] self-test: ${f}`);
  if (failures.length) {
    console.error('[clearance] SELF-TEST FAIL — the lint no longer detects what it was written for.');
    process.exit(1);
  }
  console.log('[clearance] self-test ok — the shipped literal is still caught, the token form is still clean.');
} else if (invokedDirectly) {
  const { violations, stale, pending } = lintChromeClearance();
  for (const p of pending) {
    console.warn(`[clearance] PENDING SHARED-FILE REQUEST — ${p.file} (${p.property}: ${p.literal}px)\n            ${p.why}`);
  }
  for (const v of violations) {
    console.error(`[clearance] ${v.file}:${v.line}  ${v.rule}  ${v.property}: ${v.value}\n            ${v.message}`);
  }
  for (const s of stale) {
    console.error(`[clearance] STALE EXEMPTION — ${s.file} (${s.property}: ${s.literal}px) no longer matches anything. Delete it from PENDING in scripts/lint-chrome-clearance.mjs.`);
  }
  const bad = violations.length + stale.length;
  if (bad) {
    console.error(`[clearance] FAIL — ${violations.length} literal chrome height(s), ${stale.length} stale exemption(s).`);
    process.exit(1);
  }
  console.log('[clearance] ok — every page/overlay surface clears the bar by var(--chrome-h).');
}
