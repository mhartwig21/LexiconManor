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
