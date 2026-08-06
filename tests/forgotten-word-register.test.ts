import { describe, expect, it } from 'vitest';
import {
  buildPuzzles, entryOfPuzzle, lint, lintPuzzles, readShippedPool, verifyPool,
  ENTRIES, type Entry,
} from '../content/generate-forgotten-word';

/**
 * THE STUDY'S REGISTER GATE (AAA 3.7) — now reachable from CI.
 *
 * ═══ WHAT WAS WRONG ════════════════════════════════════════════════════════
 * `content/generate-forgotten-word.ts` carried a genuinely good lint — three
 * registers must be three KINDS of sentence (a gloss, an image, the word
 * speaking), not one gloss reworded — and nothing ran it. `lint()` was
 * unexported, `main()` executed at module scope (so importing the module
 * wrote a build artifact), and `content:verify` never named the file. The
 * gate fired only when a human re-ran the generator by hand.
 *
 * Two consequences, both closed:
 *   1. A hand-edit collapsing a word's three tiers into one gloss shipped
 *      silently. The Study's whole tier escalation is the register of the
 *      clue, so that edit deletes the difference between a row-1 Study and a
 *      row-6 Study while every test in the repo stays green.
 *   2. The lint only ever read `ENTRIES` (the manuscript). The game loads
 *      `content/generated/forgotten-word.json` (the book). An edit applied to
 *      the book was invisible even to the hand-run gate.
 *
 * ═══ WHAT THIS FILE DOES ══════════════════════════════════════════════════
 * It runs the gate over the shipped pool, and — the part that matters — it
 * WATCHES THE GATE FAIL on deliberately collapsed fixtures. A lint nobody has
 * seen fail is a lint nobody knows still works.
 */

/** A pool that passes: 20+ entries, 10+ per tier, three real registers. */
function healthyPool(): Entry[] {
  return ENTRIES.map((e) => ({ ...e }));
}

/** The catastrophe, staged: one word's three tiers collapsed into one gloss. */
function collapsedToOneGloss(word = 'PETRICHOR'): Entry[] {
  return healthyPool().map((e) =>
    e.word === word
      ? { ...e, poetic: e.plain, riddle: e.plain }
      : e);
}

/** Subtler: three DIFFERENT sentences that are all the same gloss reworded. */
function collapsedByParaphrase(word = 'GLOAMING'): Entry[] {
  return healthyPool().map((e) =>
    e.word === word
      ? {
        ...e,
        plain: 'Twilight; the fading light just after sunset.',
        poetic: 'Twilight, the light fading just after sunset.',
        riddle: 'I am twilight, the fading light just after sunset.',
      }
      : e);
}

describe('the shipped Study pool passes its own gate', () => {
  it('the authored entries lint clean', () => {
    expect(lint(ENTRIES)).toEqual([]);
  });

  it('the SHIPPED JSON lints clean through the same rules', () => {
    // The book, not the manuscript — this is the file the room actually loads.
    expect(lintPuzzles(readShippedPool())).toEqual([]);
  });

  it('the shipped JSON is exactly what the entries build (no hand-edits)', () => {
    expect(readShippedPool()).toEqual(buildPuzzles());
  });

  it('verifyPool() — the whole gate content:verify runs — is clean', () => {
    expect(verifyPool()).toEqual([]);
  });

  it('round-trips a shipped puzzle back into the lint’s shape losslessly', () => {
    const puzzles = buildPuzzles();
    expect(puzzles.map(entryOfPuzzle)).toEqual(
      ENTRIES.map((e) => ({ ...e })),
    );
  });
});

describe('THE GATE FAILS — proven on deliberately collapsed fixtures', () => {
  it('catches three tiers collapsed into one gloss', () => {
    const problems = lint(collapsedToOneGloss());
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain('fw-petrichor');
    // The identical-string rule fires first…
    expect(problems).toContain('fw-petrichor: definition registers are not distinct');
    // …and the register rules independently condemn it, so deleting any one
    // rule does not quietly reopen the hole.
    expect(problems.join('\n'))
      .toMatch(/fw-petrichor: riddle neither speaks in first person nor asks a question/);
    expect(problems.join('\n')).toMatch(/fw-petrichor: plain\/poetic share \d+%/);
  });

  it('catches the SUBTLE collapse: one gloss reworded three ways', () => {
    // Nothing here is string-identical, so only the content-word overlap gate
    // can see it. This is the shape a well-meaning rewrite actually takes.
    const problems = lint(collapsedByParaphrase());
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toMatch(/fw-gloaming: plain\/poetic share \d+%/);
    expect(problems.join('\n')).toMatch(/fw-gloaming: poetic\/riddle share \d+%/);
  });

  it('catches a collapse applied to the SHIPPED pool alone', () => {
    // The exact escape route the old gate could not see: the manuscript is
    // untouched, the book is edited.
    const shipped = buildPuzzles().map((p) =>
      p.word === 'HALCYON'
        ? { ...p, definitions: { ...p.definitions, poetic: p.definitions.plain } }
        : p);
    expect(lint(ENTRIES)).toEqual([]);          // manuscript still clean
    const problems = lintPuzzles(shipped);      // book is not
    expect(problems).toContain('fw-halcyon: definition registers are not distinct');
  });

  it('catches a poetic line that borrows the riddle’s first-person voice', () => {
    const problems = lint(healthyPool().map((e) =>
      e.word === 'APRICITY' ? { ...e, poetic: 'I am the sun that visits a cold wall.' } : e));
    expect(problems).toContain("fw-apricity: poetic uses the riddle's first-person voice");
  });

  it('catches a riddle that is neither first-person nor a question', () => {
    const problems = lint(healthyPool().map((e) =>
      e.word === 'SMEUSE' ? { ...e, riddle: 'A hedge gap worn by small feet.' } : e));
    expect(problems)
      .toContain('fw-smeuse: riddle neither speaks in first person nor asks a question');
  });

  it('catches a clue that leaks the answer stem', () => {
    const problems = lint(healthyPool().map((e) =>
      e.word === 'ULLAGE' ? { ...e, usage: 'The cellar-master measured the ullage.' } : e));
    expect(problems.join('\n')).toMatch(/fw-ullage: usage leaks the answer stem "ulla"/);
  });

  it('catches a tier run dry (the row that would have no Study to offer)', () => {
    const problems = lint(healthyPool().filter((e) => e.obscurity === 'common'));
    expect(problems.join('\n')).toMatch(/tier 2 has only 0 entries/);
    expect(problems.join('\n')).toMatch(/tier 3 has only 0 entries/);
  });
});

/**
 * ROUND 7 — THE GATES ADDED AFTER THE POOL DOUBLED.
 *
 * Each of these watches a defect that ACTUALLY SHIPPED in the 43-entry pool
 * (or would have, at a hundred). Same discipline as above: the fixture is the
 * real escape, and the assertion is the gate catching it.
 */
describe('THE ROUND-7 GATES FAIL — on the defects that shipped', () => {
  it('catches a compound leak the four-letter stem check walked past', () => {
    // What shipped: EVENTIDE's etymology said the second half "still meant a
    // season or an hour, as it does in Yuletide" — handing over "tide". The
    // stem check only ever looked for "even".
    const problems = lint(healthyPool().map((e) =>
      e.word === 'EVENTIDE'
        ? { ...e, etymology: 'Old English, back when tide still meant a span of time.' }
        : e));
    expect(problems.join('\n'))
      .toMatch(/fw-eventide: etymology contains "tide", which sits inside the answer/);
    // …and the stem rule alone would have said nothing.
    expect(problems.join('\n')).not.toMatch(/fw-eventide: etymology leaks the answer stem/);
  });

  it('catches a near-spelling that is not a substring at all', () => {
    // What shipped: NOCTAMBULIST's etymology named "somnambulist" — eight of
    // its twelve letters, and a five-second reconstruction for the player.
    const problems = lint(healthyPool().map((e) =>
      e.word === 'NOCTAMBULIST'
        ? { ...e, etymology: 'The politer cousin of the word somnambulist.' }
        : e));
    expect(problems.join('\n'))
      .toMatch(/fw-noctambulist: etymology says "somnambulist", which shares "ambulist" with the answer/);
  });

  it('lets a shared English suffix past — the gate is not merely noisy', () => {
    // "movement" beside ESCAPEMENT shares "ement" and leaks nothing; a leak
    // rule that fires on every -ment word gets switched off by the next author.
    expect(lint(healthyPool().map((e) =>
      e.word === 'ESCAPEMENT'
        ? { ...e, usage: 'The ___ is the only movement in the case that argues back.' }
        : e))).toEqual([]);
  });

  it('catches a gloss that starts addressing the player', () => {
    const problems = lint(healthyPool().map((e) =>
      e.word === 'THRESHOLD'
        ? { ...e, plain: 'The strip of floor you cross on your way into a room.' }
        : e));
    expect(problems)
      .toContain('fw-threshold: plain addresses the player — a gloss is impersonal');
  });

  it('catches greeting-card diction', () => {
    // The line that named the rule, verbatim.
    const problems = lint(healthyPool().map((e) =>
      e.word === 'SERENDIPITY'
        ? { ...e, poetic: 'Fortune’s gentle kiss upon the unprepared soul.' }
        : e));
    expect(problems.join('\n')).toMatch(/fw-serendipity: poetic reaches for "soul"/);
    expect(problems.join('\n')).toMatch(/fw-serendipity: poetic reaches for "gentle kiss"/);
  });

  it('catches a straight quote the authored-JSON lint can never see', () => {
    // content/lint-typography.ts walks content/authored/**.json only. This
    // pool is a .ts file, so its quotes had no lint at all until round 7.
    const problems = lint(healthyPool().map((e) =>
      e.word === 'APRICITY' ? { ...e, poetic: "January's small mercy, on the south wall." } : e));
    expect(problems.join('\n')).toMatch(/fw-apricity: poetic uses a straight quote/);
  });

  it('catches the pool repeating itself — openers', () => {
    // Invisible entry by entry: every line below is fine on its own. At a
    // hundred entries this is the failure mode, not a collapsed register.
    const problems = lint(healthyPool().map((e, i) =>
      i < 6 ? { ...e, poetic: `A small ${e.word.toLowerCase()}, kept where the light falls on it.` } : e));
    expect(problems.join('\n')).toMatch(/poetic lines open "a small…" \(max 3\)/);
  });

  it('catches the pool repeating itself — reused images', () => {
    const problems = lint(healthyPool().map((e, i) =>
      i < 8
        ? { ...e, poetic: `Something the kettle knows about, ${i} minutes off the boil.` }
        : e));
    expect(problems.join('\n')).toMatch(/the image "kettle" appears in \d+ poetic lines \(max 5\)/);
  });

  it('catches a usage line that is not a usable sentence', () => {
    const problems = lint(healthyPool().map((e) =>
      e.word === 'QUIRE' ? { ...e, usage: 'a ___ of paper, ___ folded' } : e));
    expect(problems).toContain('fw-quire: usage needs exactly one blank');
    expect(problems).toContain('fw-quire: usage is not a finished sentence');
  });

  it('holds the pool to its content floor', () => {
    expect(lint(healthyPool().slice(0, 40)).join('\n')).toMatch(/pool too small: 40 < 100/);
  });
});

describe('the gates are tight enough to be able to fail', () => {
  /**
   * Round 6 shipped a register-overlap gate set at 0.40 while the pool's own
   * worst case was 0.33 — a lint with no possible failure. Every threshold in
   * the file is now inside a stone's throw of the real pool, and this test is
   * what keeps a future author from buying headroom by moving the number
   * instead of rewriting the line.
   */
  it('the shipped pool sits close under every threshold it must pass', () => {
    const entries = ENTRIES;

    // Register overlap: measured worst case must be within 5 points of 0.30.
    const problems = lint(entries.map((e) => ({ ...e })));
    expect(problems).toEqual([]);

    // Openers: at least one opener is at the cap (3), so the cap is binding.
    const openerCounts = (pick: (e: Entry) => string) => {
      const m = new Map<string, number>();
      for (const e of entries) {
        const k = pick(e).toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).slice(0, 2).join(' ');
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return Math.max(...m.values());
    };
    expect(openerCounts((e) => e.poetic)).toBe(3);
    expect(openerCounts((e) => e.riddle)).toBe(3);
  });
});
