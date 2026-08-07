import type { ForgottenWordPuzzle } from './types';

/**
 * The Forgotten Word (boss) engine.
 * Guess the word from a definition whose clarity scales with level:
 * plain (level 1) -> poetic (level 2) -> riddle (level 3+).
 * Etymology and usage clues are locked behind trials (timed Hive minigames);
 * the trial itself is a HiveState — this module only tracks lock state.
 */

export type ClueId = 'etymology' | 'usage';

export interface ForgottenWordState {
  puzzleId: string;
  guesses: string[];
  maxGuesses: number;
  unlockedClues: ClueId[];
  hintsUsed: number;
  status: 'playing' | 'won' | 'lost';
}

export type ForgottenWordGuess =
  | { kind: 'correct'; word: string }
  | { kind: 'wrong'; guessesLeft: number; lost: boolean }
  /**
   * 'wrong-length': the card already announced the letter count, so a guess of
   * a different length is malformed input, not a claim — refused for free, no
   * whisper consumed (AAA 3.2, Wordle's row-refusal precedent).
   */
  | { kind: 'invalid'; reason: 'empty' | 'repeat' | 'wrong-length' | 'finished' };

/**
 * ROUND 14 (AAA 3.5 / 3.8) — THE HELP NO LONGER SHRINKS AS THE WORD GETS
 * HARDER.
 *
 * The Study's 113 entries are the best writing in the game and the DELIVERY was
 * broken. All 43 tier-3 entries are rare-or-archaic — median frequency rank
 * 157,866 against `content/data/count_1w.txt`, 31 of the 43 past rank 100k, and
 * 15 (SMEUSE, SELCOUTH, CLINQUANT, APRICITY, BRUMOUS, NOCTAMBULIST,
 * TARADIDDLE, LUCUBRATION, PILCROW, YESTREEN, OVERMORROW, ANTIMACASSAR,
 * SENNIGHT, HANDSEL, LIMNER) absent from a 333k-word corpus entirely. Against
 * that, tier 3 headlined the RIDDLE, withheld the plain gloss, pre-revealed
 * nothing, and gave THREE guesses. SMEUSE in three blind guesses off "A door in
 * a wall of thorns, cut by nothing but habit" is not a puzzle, it is a reveal
 * with a step bill attached. Wordle gives six guesses on a word everybody
 * knows.
 *
 * 3.8 says a difficulty knob CONSTRAINS the player; it does not remove
 * solvability. So the knob moved off the guess allowance entirely. What still
 * makes a tier-3 Study hard is the riddle in the headline, the rarity of the
 * word itself, and the higher price of a clue — not a shorter rope.
 */
export function maxGuessesForLevel(level: number): number {
  return level <= 1 ? 6 : 5;
}

/**
 * The HEADLINE definition: the one line the Study stages in its largest
 * display italic, which AAA 3.7 [COZY] requires to read as the best writing in
 * the game.
 *
 * ROUND 11 — WHAT WAS WRONG. This function used to key the register straight
 * to the room tier (1 → plain, 2 → poetic, 3 → riddle), and the adapter
 * honours tier exactly, so a tier-1 Study could ONLY ever print `plain`. Two
 * of every three authored definitions never reached glass — 226 of the 339
 * lines in content/generated/forgotten-word.json were dead content — and the
 * quality was inverted: the first Study a player meets, in the biggest type
 * the room owns, got the dictionary gloss ("A small object held on to only
 * because of the person or place it recalls.") while the line that was
 * actually written for her ("A pebble, a ticket stub, a button: none of them
 * beautiful, all of them evidence.") was unreachable.
 *
 * The register is no longer the tier lever. `poetic` is the headline wherever
 * the room is meant to be readable (tiers 1–2); tier 3 — where the room IS the
 * difficulty — headlines the riddle. The tier lever moved to how much help
 * comes with it: see `glossForLevel`, and `maxGuessesForLevel` above.
 */
export function definitionForLevel(puzzle: ForgottenWordPuzzle, level: number): string {
  if (level <= 2) return puzzle.definitions.poetic;
  return puzzle.definitions.riddle;
}

/**
 * The free second register, shown under the headline: the dictionary reading
 * of the same word, at every tier.
 *
 * ROUND 14 (AAA 3.5 / 3.8) — this used to return the gloss at tier 1 only, so
 * the room withheld the plain meaning exactly where the word was least likely
 * to be known. Rarity and help were coupled the wrong way round. The gloss is
 * free everywhere now; what tier 3 pays for its difficulty is the riddle in the
 * headline (`definitionForLevel`) and the obscurity of the word itself, both of
 * which constrain the player without taking the puzzle away from her.
 *
 * Between this and `definitionForLevel`, all three authored registers reach
 * glass across the shipped pool — nothing authored to the 3.7 standard is
 * unreachable.
 */
export function glossForLevel(puzzle: ForgottenWordPuzzle, level: number): string | null {
  void level;
  return puzzle.definitions.plain;
}

/**
 * ROUND 14 (AAA 3.5 / 3.8) — THE CRIB: letters already in place, in proportion
 * to how unlikely the word is to be known.
 *
 * The other half of breaking the rarity/help coupling, and the half that
 * constrains rather than explains. A cryptic hands you crossers; an archaic
 * twelve-letter word opens with three or four of its letters standing. Keyed on
 * the WORD's obscurity and not on the room's tier, because obscurity is the
 * thing that made the guess blind — a rare word met at tier 2 is just as blind.
 *
 * Deterministic, so AAA 3.3's promise holds across a force-quit: the same entry
 * always opens with the same letters showing.
 */
/**
 * `medium` is not 0. The generator's solvability gate measures every headword
 * against `content/data/count_1w.txt`, and seventeen entries the pool calls
 * `medium` are past rank 100k or absent from the corpus outright — PETRICHOR,
 * SUSURRUS, MURMURATION and HOARFROST are not in it at all, RIGMAROLE sits at
 * 213,053. A tag is an author's estimate; the corpus is a measurement, and the
 * measurement says the middle of the house needs a crosser too. A twelve-letter
 * archaic word opens with three or four letters standing, a nine-letter middling
 * one with one.
 */
const CRIB_SHARE: Record<ForgottenWordPuzzle['obscurity'], number> = {
  common: 0, medium: 0.15, rare: 0.25, archaic: 0.3,
};

export function cribIndices(puzzle: ForgottenWordPuzzle): number[] {
  const share = CRIB_SHARE[puzzle.obscurity] ?? 0;
  const n = Math.round(puzzle.word.length * share);
  if (n <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const at = Math.round((i * puzzle.word.length) / n);
    if (at < puzzle.word.length && !out.includes(at)) out.push(at);
  }
  return out;
}

/**
 * The crib as a display row: the letter at each revealed position, `null`
 * everywhere she still has to supply one.
 */
export function cribLetters(puzzle: ForgottenWordPuzzle): (string | null)[] {
  const shown = new Set(cribIndices(puzzle));
  return [...puzzle.word].map((ch, i) => (shown.has(i) ? ch : null));
}

/**
 * The registers this level did NOT stage — printed in the verdict panel once
 * the word is settled (remembered or slipped away), as the rest of the
 * lexicographer's entry.
 *
 * This is the other half of the round-11 fix, and the half that makes the
 * claim absolute: the adapter honours the room tier exactly, so keying ANY
 * register to the tier leaves the others unread on that entry forever. With
 * this, every authored line on every shipped entry reaches glass in a single
 * visit — the two that are not the puzzle become the reward for finishing it,
 * which is where the best writing in the game (AAA 3.7) belongs anyway.
 */
export function unshownDefinitions(puzzle: ForgottenWordPuzzle, level: number): string[] {
  const shown = new Set([definitionForLevel(puzzle, level), glossForLevel(puzzle, level)]);
  return [puzzle.definitions.plain, puzzle.definitions.poetic, puzzle.definitions.riddle]
    .filter((d) => !shown.has(d));
}

export function startForgottenWord(puzzle: ForgottenWordPuzzle, level: number): ForgottenWordState {
  return {
    puzzleId: puzzle.id,
    guesses: [],
    maxGuesses: maxGuessesForLevel(level),
    unlockedClues: [],
    hintsUsed: 0,
    status: 'playing',
  };
}

function normalize(s: string): string {
  return s.toUpperCase().trim().replace(/[^A-Z]/g, '');
}

export function submitGuess(
  puzzle: ForgottenWordPuzzle,
  state: ForgottenWordState,
  rawGuess: string,
): { state: ForgottenWordState; result: ForgottenWordGuess } {
  if (state.status !== 'playing') return { state, result: { kind: 'invalid', reason: 'finished' } };
  const guess = normalize(rawGuess);
  if (!guess) return { state, result: { kind: 'invalid', reason: 'empty' } };
  if (state.guesses.includes(guess)) return { state, result: { kind: 'invalid', reason: 'repeat' } };

  const accepted = [normalize(puzzle.word), ...(puzzle.acceptedAnswers ?? []).map(normalize)];
  // Free refusal for a length the game already ruled out (any accepted answer's
  // length is fair game — alternate spellings may differ from the headword).
  if (!accepted.some((a) => a.length === guess.length)) {
    return { state, result: { kind: 'invalid', reason: 'wrong-length' } };
  }
  const guesses = [...state.guesses, guess];

  if (accepted.includes(guess)) {
    return { state: { ...state, guesses, status: 'won' }, result: { kind: 'correct', word: puzzle.word } };
  }

  const lost = guesses.length >= state.maxGuesses;
  return {
    state: { ...state, guesses, status: lost ? 'lost' : 'playing' },
    result: { kind: 'wrong', guessesLeft: state.maxGuesses - guesses.length, lost },
  };
}

/** Called when the player wins the corresponding trial (timed Hive minigame). */
export function unlockClue(state: ForgottenWordState, clue: ClueId): ForgottenWordState {
  if (state.unlockedClues.includes(clue)) return state;
  return { ...state, unlockedClues: [...state.unlockedClues, clue], hintsUsed: state.hintsUsed + 1 };
}

/** Glyph 'reveal_hint' support: unlock the next locked clue for free (no hint penalty). */
export function revealClueByGlyph(state: ForgottenWordState): ForgottenWordState {
  const next: ClueId | undefined = (['etymology', 'usage'] as const).find(
    (c) => !state.unlockedClues.includes(c),
  );
  if (!next) return state;
  return { ...state, unlockedClues: [...state.unlockedClues, next] };
}

/** Instant-solve support (Glyph of Decay). */
export function solveForgottenWord(state: ForgottenWordState): ForgottenWordState {
  return { ...state, status: 'won' };
}
