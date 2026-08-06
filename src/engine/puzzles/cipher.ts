/**
 * Substitution Cipher — The Darkroom's 30–90s micro game. OWNER: A4.
 *
 * Pure engine: no React, no DOM, no audio. A short phrase sits in the
 * developing tray with its letters swapped by a fixed substitution. The
 * player pencils in guesses freely (free — penciling is thinking), then
 * "develops" the print: a full-mapping claim. Per AAA R.1's ruling, cipher
 * letters are deliberate claims — a wrong develop costs steps, but always
 * yields information ("N of M letters ring true", AAA 2.10's principle).
 *
 * The decode mapping is derived from the plaintext/ciphertext alignment —
 * the generator ships both, round-trip-verified.
 */

export interface CipherPuzzle {
  id: string;
  /** Encoded phrase: A–Z substituted, spaces/punctuation preserved. */
  ciphertext: string;
  plaintext: string;
  /** Cipher letters pre-developed at start (tier mercy, generator-chosen). */
  reveals: string[];
}

export interface CipherEngineState {
  /** cipherLetter → penciled plain letter. Missing key = blank cell. */
  guesses: Record<string, string>;
  /** Cipher letters locked in (starting reveals + purchased). */
  locked: string[];
  /** Develop attempts (claims), for feedback copy. */
  attempts: number;
  /**
   * Mapping signatures already developed. Re-developing an IDENTICAL mapping
   * yields zero new information, so it costs zero (AAA 3.2) — the same rule
   * the Linen Closet's `checkedSignatures` already ships.
   */
  developedSignatures: string[];
  /**
   * Every distinct print she has paid for, oldest first — the datum used to
   * live only in a 2s toast, so after three prints she had spent 6–9 steps and
   * could see none of what she bought. Earned information persists (AAA 3.3).
   */
  prints: { correct: number; total: number }[];
  status: 'playing' | 'won';
}

export type DevelopResult =
  | { kind: 'developed' }
  | { kind: 'incomplete'; missing: number }
  /** charged=false when this exact mapping was already developed. */
  | { kind: 'murky'; correct: number; total: number; charged: boolean };

const LETTER = /[A-Z]/;

/** cipher letter → true plain letter, from the shipped alignment. */
export function decodeMap(puzzle: CipherPuzzle): Record<string, string> {
  const map: Record<string, string> = {};
  const cipher = puzzle.ciphertext.toUpperCase();
  const plain = puzzle.plaintext.toUpperCase();
  for (let i = 0; i < cipher.length; i++) {
    const c = cipher[i]!;
    if (LETTER.test(c)) map[c] = plain[i]!;
  }
  return map;
}

/** Distinct cipher letters in order of first appearance. */
export function cipherLettersOf(puzzle: CipherPuzzle): string[] {
  const out: string[] = [];
  for (const c of puzzle.ciphertext.toUpperCase()) {
    if (LETTER.test(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

export function startCipher(puzzle: CipherPuzzle): CipherEngineState {
  const truth = decodeMap(puzzle);
  const guesses: Record<string, string> = {};
  const locked: string[] = [];
  for (const c of puzzle.reveals) {
    const upper = c.toUpperCase();
    if (truth[upper]) {
      guesses[upper] = truth[upper]!;
      locked.push(upper);
    }
  }
  return { guesses, locked, attempts: 0, developedSignatures: [], prints: [], status: 'playing' };
}

/** The claim, as a comparable string: sorted cipher→plain pairs. */
export function mappingSignature(state: CipherEngineState): string {
  return Object.keys(state.guesses).sort().map((c) => `${c}${state.guesses[c]}`).join('');
}

/** Pencil in (or erase, plain = null) a guess. Free; locked cells ignore it. */
export function assignCipher(
  state: CipherEngineState,
  cipherLetter: string,
  plain: string | null,
): CipherEngineState {
  const c = cipherLetter.toUpperCase();
  if (state.status !== 'playing' || state.locked.includes(c)) return state;
  // Identity-stable when nothing changes (erasing a blank, penciling the
  // letter already standing there): the adapter's `engine === state.engine`
  // guard and the view's cursor both key off "did this do anything".
  const current = state.guesses[c];
  if (plain === null) {
    if (current === undefined) return state;
    const guesses = { ...state.guesses };
    delete guesses[c];
    return { ...state, guesses };
  }
  const p = plain.toUpperCase();
  if (!LETTER.test(p)) return state;
  if (current === p) return state;
  return { ...state, guesses: { ...state.guesses, [c]: p } };
}

/** The claim: check the full mapping. */
export function developCipher(
  puzzle: CipherPuzzle,
  state: CipherEngineState,
): { state: CipherEngineState; result: DevelopResult } {
  if (state.status !== 'playing') return { state, result: { kind: 'incomplete', missing: 0 } };
  const truth = decodeMap(puzzle);
  const letters = cipherLettersOf(puzzle);
  const missing = letters.filter((c) => !state.guesses[c]).length;
  if (missing > 0) return { state, result: { kind: 'incomplete', missing } };
  const correct = letters.filter((c) => state.guesses[c] === truth[c]).length;
  if (correct === letters.length) {
    return {
      state: { ...state, attempts: state.attempts + 1, status: 'won' },
      result: { kind: 'developed' },
    };
  }
  // A double-tap on "Develop the print" used to cost another −2 (−3 at tier 3)
  // for literally zero new information: 6 steps of an 18-step day. The same
  // mapping is the same claim, so it is answered again for free, and the
  // answer she paid for goes on the paper (`prints`), not into a 2s toast.
  const sig = mappingSignature(state);
  const charged = !state.developedSignatures.includes(sig);
  return {
    state: {
      ...state,
      attempts: state.attempts + 1,
      developedSignatures: charged ? [...state.developedSignatures, sig] : state.developedSignatures,
      prints: charged ? [...state.prints, { correct, total: letters.length }] : state.prints,
    },
    result: { kind: 'murky', correct, total: letters.length, charged },
  };
}

/**
 * Reveal one letter (priced by the adapter): the most frequent cipher letter
 * that is blank or wrong gets its true value, locked. Fixes a wrong pencil
 * mark before a blank one only if it occurs more often — highest information
 * per step spent.
 */
export function revealCipherLetter(
  puzzle: CipherPuzzle,
  state: CipherEngineState,
): { state: CipherEngineState; letter: string | null } {
  if (state.status !== 'playing') return { state, letter: null };
  const truth = decodeMap(puzzle);
  const freq: Record<string, number> = {};
  for (const c of puzzle.ciphertext.toUpperCase()) {
    if (LETTER.test(c)) freq[c] = (freq[c] ?? 0) + 1;
  }
  const candidates = cipherLettersOf(puzzle)
    .filter((c) => !state.locked.includes(c) && state.guesses[c] !== truth[c])
    .sort((a, b) => (freq[b] ?? 0) - (freq[a] ?? 0));
  const letter = candidates[0] ?? null;
  if (!letter) return { state, letter: null };
  return {
    state: {
      ...state,
      guesses: { ...state.guesses, [letter]: truth[letter]! },
      locked: [...state.locked, letter],
    },
    letter,
  };
}

/** True once every cell is penciled (Develop becomes meaningful). */
export function isFullyPenciled(puzzle: CipherPuzzle, state: CipherEngineState): boolean {
  return cipherLettersOf(puzzle).every((c) => !!state.guesses[c]);
}
