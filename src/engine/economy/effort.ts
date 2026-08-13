/**
 * THE HONEST WORKLOAD TABLE — OWNER: A2 (Economy/Day). Pure TS, no React/DOM.
 *
 * ═══ WHY THIS FILE EXISTS (REVIEW_AA §6 / "5.6", round 22) ════════════════
 * `STEP_TABLE.solve(size, tier)` had no room parameter at all. Five anchors
 * that range from twenty seconds (the Gallery, as it was: five words of a
 * 106-word pool — round 26 fixed the room, see `ROOM_EFFORT.twistle`)
 * to thirty-five minutes (the Counting House at tier 2: 25 givens, 98% of
 * boards requiring an X-wing, an XY-wing, a swordfish or colouring) were paid
 * off one row-band table — a **36× spread in seconds-per-step**, and 15×
 * between two rooms sitting on the same storey at the same tier. The rational
 * player farms the Gallery and never opens the Conservatory, which is exactly
 * what both hostile reviewers did.
 *
 * The instrument that certified the day was blind to it too: `TIME_TABLE`
 * priced every anchor at one uniform `[180, 360]` band, so AAA 4.10b's
 * published 10–15 minute median had never been measured against a room that
 * takes a quarter of an hour.
 *
 * So this table is the missing axis: **what a room actually costs a player, in
 * minutes**, per kind and per row-band tier. Two things read it and nothing
 * else may hard-code a duration or a payout again:
 *
 *   1. `engine/economy/steps.ts` prices the SOLVE off it (`solvePayout`), so a
 *      long room pays proportionally and a short room cannot out-earn it;
 *   2. `engine/economy/simulate.ts` clocks the DAY off it, so 4.10b/f are
 *      measured against the rooms the game actually ships.
 *
 * ═══ WHERE THE NUMBERS COME FROM (the model, stated) ══════════════════════
 * These are instrumented estimates over the SHIPPED pools, not wishes, and
 * `tests/economy-effort.test.ts` re-derives the content facts each one rests on
 * — median target counts, pool sizes, given counts, ladder thresholds — so a
 * content edit that changes a room's workload FAILS A TEST instead of quietly
 * re-opening the 36× spread. If one of those pins fires, the fix is to
 * re-derive the row here, never to relax the pin.
 *
 *   twistle (the Gallery)      ROUND 26, RE-DERIVED — the content this row was
 *                              measured on changed, so the row moved with it.
 *                              5 words of a median 23-word pool at tier 1
 *                              (need/pool 0.048 → 0.217), every target 5+
 *                              letters and turning at least once; 6 of 21 at
 *                              tier 2 with the centre tile required; 6 of 22
 *                              at tier 3, unchanged. See the row itself.
 *   crossword (Linen Closet)   ROUND 50, DERIVED — the room is CLUE-led (the
 *                              owner's ruling, docs/LINEN_CLOSET.md), so its
 *                              unit is the clued answer and not the square:
 *                              4 / 5 / 5 of them (entries + the hem), against
 *                              answers whose median corpus rank runs
 *                              5,100 / 8,854 / 19,461. See the row.
 *   cipher (the Darkroom)      ROUND 46 — opening(crib class) + letters ×
 *                              12.5 s (`CIPHER_CLOCK`). See the row.
 *   word-web (the Library)     ROUND 50, DERIVED — 16 tiles, 4 groups, and the
 *                              tier lever is which of the four you can read
 *                              straight off: a median 3 / 2 / 1 PLAIN
 *                              categories by tier (`WEB_CLOCK`). See the row.
 *   forgotten-word (the Study)  ROUND 50, DERIVED — read two registers, then
 *                              produce candidates against a length, a crib and
 *                              a meaning. The tier moves how many candidates
 *                              that takes, because the headword's median corpus
 *                              rank runs 25,286 / 81,158 / 219,760 and 15 of
 *                              the 43 tier-3 words are absent from a
 *                              333,333-word corpus outright (`STUDY_CLOCK`).
 *   hive (the Conservatory)    Full Bloom is 70% of totalPoints, which needs
 *                              32 of the median 70 valid words EVEN PLAYING
 *                              PERFECTLY (highest-scoring first; worst order
 *                              61), at the repo's own instrumented finding rate
 *                              (~20 s/find, decaying as the pool empties).
 *   sudoku (Counting House)    ROUND 27, RE-DERIVED AGAINST A BENCHMARK — see
 *                              the row itself. The pool it was measured on was
 *                              regenerated in the same commit: the three tiers
 *                              are no longer the same board with a different
 *                              technique on it.
 *
 * ═══ THE LADDER — A ROOM PAYS ON THE WAY UP, NOT ONLY AT THE SUMMIT ═══════
 * REVIEW_AA's "done looks like" for this item is *"every anchor is 2–4 minutes
 * to a payout, or it pays IN STAGES … the hive pays at every ladder rung, not
 * only at Full Bloom"*. `stageFractionOf` reads the progress details the
 * adapters ALREADY emit (`tier-up:Bower`, `inked:36-of-51`, `group-solved:blue`)
 * and answers one question: how much of this room's payout has she earned so
 * far? The room slice pays the difference as she crosses each rung, and the
 * `solved` event pays exactly the remainder. Only rooms longer than
 * `LADDER_MINUTES` have one: the Gallery is over in a minute and a quarter and
 * the review's bar for it is "2–4 minutes TO A PAYOUT", which it already meets.
 *
 * THE INVARIANT THAT MAKES THIS SAFE, and the reason no published band in AAA
 * 4.10 moves because of it: **staging never changes what a room pays in total.**
 * A solved room pays `solvePayout(kind, tier)` whether it paid it in one lump
 * or in four instalments. What changes is WHEN — and therefore what a player
 * who works a long room for six minutes and leaves it for tomorrow walks out
 * with, which used to be nothing at all.
 */

import type { RoomPuzzleKind } from '../rooms/room-puzzle';
import type { Tier } from '../types';

/** Honest median minutes for one room, indexed by tier − 1. */
export type EffortByTier = readonly [number, number, number];

/**
 * Honest median minutes to a FULL solve, per kind and tier. See the header for
 * the derivation of every row; `tests/economy-effort.test.ts` pins the content
 * facts they rest on.
 */
export const ROOM_EFFORT: Record<RoomPuzzleKind, EffortByTier> = {
  // ── anchors ──────────────────────────────────────────────────────────────
  /**
   * ROUND 26 — THE GALLERY, RE-CLOCKED BECAUSE ITS WORK CHANGED.
   *
   * `1.0` was honest arithmetic over a dishonest room: five words of a median
   * 106-word pool whose fifth-commonest member sat at frequency rank 305 — five
   * words you already had in your head — which is twenty seconds of play and
   * was the highest reward-per-minute cell in the house.
   * `content/generate-twistle.ts` now ships a board with no chaff on it (5+
   * letters and a turn floor on EVERY target, the centre rule from tier 2 up, a
   * findable pool capped at one word in five of the ask), so the row is
   * re-derived rather than defended:
   *
   *   tier 1 — 5 finds × 15 s = 1.25 min. The ask did not move; the board did.
   *            A median 23 findable words rather than 106, the fifth-commonest
   *            of them at rank 2,581 rather than 305. Nothing on the grid is
   *            free now, so the find sits at 15 s rather than the 12 s floor of
   *            the repo's own instrumented 12–25 s band.
   *   tier 2 — 6 finds × 15 s = 1.5 min, unchanged in minutes. The ask FELL
   *            (7 → 6) and the board hardened: two turns minimum and every
   *            trace through the marked centre tile. A centre rule cuts both
   *            ways on the clock — it complicates the trace and it prunes the
   *            search — so the per-find figure holds where tier 1's landed.
   *   tier 3 — 6 finds × 25 s = 2.5 min. UNCHANGED. This is the tier both
   *            hostile reviewers left alone, and the one tiers 1–2 borrowed
   *            from; its 6×6 board and four-turn traces are why a find there
   *            costs two thirds again what it costs downstairs.
   *
   * ═══ WHAT THE FIFTEEN SECONDS COST, AND WHY THE ROW IS NOT HIGHER ═══════
   *
   * The honest reading of a constrained find spans 12–25 s, so 5 finds is
   * anywhere from 1.0 to 2.1 minutes and 1.25 is the low-middle of it. It is
   * the low-middle because THE MANOR HAS NO CLOCK LEFT. Measured on the
   * shipped simulation before this round, the published bands sat here:
   *
   *   - 4.10b's decent evening: 14.48 min against a ceiling of 15;
   *   - 4.11's maximal-carry-over evening: 14.97 against the same 15;
   *   - 4.10e's skilled win-by-day-35: 96.3% against a floor of 95%.
   *
   * Fifteen seconds on the most-drafted anchor in the deck moves those to
   * 14.63, 15.11 and 95.3%. Thirty seconds breaks 4.10e outright (94.3%), and
   * a two-and-a-half-minute Gallery — which is what an ask of 8 would honestly
   * cost — puts the decent evening at 15.18 and the campaign at 93.0%. So the
   * room was fixed by SHRINKING THE BOARD rather than by lengthening the
   * sitting, and this row records the ceiling that forced it: **the next room
   * in this table that gets longer has to be paid for by one that gets
   * shorter.** That is a commission for an economy round, not a word-game one.
   *
   * It stays well under `KEY_SUPPLY.workKeyMinutes` (3.0) at tier 1, so no
   * ground-floor key source opens and no campaign band moves for that reason.
   * `tests/economy-effort.test.ts` re-derives all three numbers off the shipped
   * pool; `tests/puzzles/twistle-boards.test.ts` gates the board itself.
   */
  'twistle': [1.25, 1.5, 2.5],
  /**
   * ROUND 50 — THE LIBRARY, AND THE MIDDLE TIER WAS OFF ITS OWN LINE.
   *
   * `[4.5, 5.0, 6.0]` had no derivation under it: one line in the header,
   * *"16 tiles, 4 groups, 1 ambiguous, 1 herring"*, with no tier in it. That is
   * the state `ROOM_EFFORT.cipher` was in before round 46.
   *
   * ═══ WHAT A TIER ACTUALLY CHANGES ABOUT A WORD WEB ════════════════════════
   *
   * Not the contested tiles. `ambiguousWords` is the room's HEADLINE figure
   * (BENCHMARKS §2, round 30) and it is a median **2 at every tier** on the
   * shipped pool — so does `herrings` — which means the number the room is
   * GRADED on is not the number its CLOCK can be built out of. What does move,
   * monotonically, is how many of the four threads read straight off the tiles:
   * `TIER_SPECS.minPlain` is 2 / 1 / 1 and the shipped pool carries a median
   * **3 / 2 / 1 PLAIN categories** by tier (`isPlainish` in
   * content/generate-wordweb.ts — a semantic, trivia or compound thread, solved
   * by thinking in English rather than by performing an operation on the
   * letters). The other 1 / 2 / 3 are WORKED: an anagram, a silent letter, a
   * doubled pair — invisible until you do something to the word.
   *
   * So the board is four categories of two kinds, and the row is:
   *
   *     minutes = (plain × WEB_CLOCK.plainSeconds
   *                + worked × WEB_CLOCK.workedSeconds) / 60
   *
   * ═══ WHAT IS DERIVED HERE, AND WHAT IS ONLY CHECKED — SAID PLAINLY ════════
   *
   * The two RATES are read off this row's own two ends, which round 22 set and
   * never derived. That half is circular and is not claimed as a derivation:
   * what it establishes is only that the ends imply a **plausible** pair — a
   * plain category just under a minute, a worked one just under one and three
   * quarters — both inside the bands `WEB_CLOCK` publishes.
   *
   * THE CLAIM THIS ROUND ACTUALLY MAKES IS THE OVER-DETERMINATION, and it is a
   * gate that can go red. With plain counts of exactly 3 / 2 / 1 the middle
   * tier is not free: two rates and three tiers leave one degree of it, and the
   * arithmetic forces **t2 = (t1 + t3) / 2 = 5.25**. The shipped row said 5.00.
   * A tier-2 board carries one more worked category than a tier-1 board and one
   * fewer than a tier-3 board; it cannot cost less than the midpoint of the two.
   * `tests/content.test.ts` re-reads the plain counts off the shipped JSON
   * every run — it lives there rather than in `economy-effort.test.ts` because
   * it needs the generator's own `isPlainish` and that import costs 24 seconds
   * of module evaluation, which content.test.ts is already paying — so a pool
   * regeneration that changes the mix fails instead of leaving this row
   * describing yesterday's shelf.
   *
   * WHAT IT COSTS: **no payout moves** (0.45 × 5.25 = 2.36, the +2 the room
   * already paid) and the wage falls 0.400 → 0.381 moves a minute at tier 2,
   * which is interior to all four of 4.10h's populations.
   */
  'word-web': [4.5, 5.25, 6.0],
  'hive': [14.0, 11.0, 7.0],
  /**
   * ROUND 50 — THE STUDY, WHICH WAS FLAT ACROSS THREE TIERS THAT ARE NOT.
   *
   * `[1.5, 1.5, 1.5]` was the only row in this table that claimed a tier costs
   * NOTHING, and its whole account was one line in the header — *"read three
   * authored definitions, name a word"*. Measured against the room the
   * generator actually ships, the three tiers differ in four ways at once, and
   * every one of them is a fact about the clock:
   *
   *   | | t1 | t2 | t3 |
   *   |---|---|---|---|
   *   | headword's median corpus rank | 25,286 | 81,158 | **219,760** |
   *   | absent from a 333,333-word corpus | 0 of 34 | 4 of 36 | **15 of 43** |
   *   | headline register | poetic | poetic | **riddle** |
   *   | letters standing (`cribIndices`) | 0 | 1 | 2 |
   *   | guesses (`maxGuessesForLevel`) | 6 | 5 | 5 |
   *
   * A flat row says a word fifteen of whose forty-three instances do not occur
   * in a third of a million words of English costs the same to reach as one at
   * rank 25,000. It does not.
   *
   * ═══ THE MODEL: A READ, AND THEN CANDIDATES ═══════════════════════════════
   *
   *     minutes = registers / STUDY_CLOCK.readWordsPerMinute
   *               + candidates(tier) × STUDY_CLOCK.candidateSeconds / 60
   *
   * The READ is measured off the pool: the headline register plus the free
   * plain gloss run a median 25 / 27 / 29 words, which is 10 / 11 / 12 seconds
   * and is NOT where the tier lives.
   *
   * The CANDIDATE RATE does not move either, and that is deliberate — it is the
   * Darkroom's cascade argument in a different room (*the fill is the fill*).
   * Producing one word that fits the letter count, the standing letters and the
   * meaning, submitting it, and reading the closeness that comes back is the
   * same act at every storey. What the tier changes is HOW MANY of them the
   * median solve takes, and the pool says why:
   *
   *   tier 1 — every entry tagged `common`, all 34 inside ENABLE, median rank
   *            25,286, and NO crib because none is needed. The gloss names a
   *            word she owns. **1.5 candidates**: 0.17 + 1.25 = 1.42 →
   *            **1.5 min** at the table's own quarter-minute granularity,
   *            which is where the flat row was already right.
   *   tier 2 — median rank 81,158, three times deeper, four of the thirty-six
   *            outside the corpus entirely, one letter standing. She has met
   *            the word and does not have it to hand. **2.5 candidates**:
   *            0.18 + 2.08 = 2.26 → **2.25 min**.
   *   tier 3 — median rank 219,760, and **fifteen of forty-three do not occur
   *            in the corpus at all** (SMEUSE, SELCOUTH, APRICITY — round 14's
   *            own list). The headline is the riddle. There is nothing to
   *            retrieve, so she builds the word out of the gloss, the length
   *            and two standing letters, and she uses most of the rope she is
   *            given. **4 candidates of the 5 allowed**: 0.20 + 3.33 = 3.53 →
   *            **3.5 min**.
   *
   * The two crib letters are the one lever pushing the other way and they are
   * measured rather than waved at: they cut the lexical field — ENABLE words of
   * the right length with those letters standing — from a median 856 at tier 2
   * to **52** at tier 3. That is what stops the tier-3 row running away, and it
   * is why the room is fair; it is not enough to make it as quick as tier 1.
   *
   * ═══ WHAT IT COSTS, AND THE ONE PAYOUT THAT MOVES ═════════════════════════
   *
   * **A tier-3 Study pays +2 rather than +1** (0.45 × 3.5 = 1.58). It is the
   * only payout `ROOM_EFFORT` moves this round and it is an OUTPUT of the
   * derivation, not the reason for it. Two things about it are worth writing
   * down rather than discovering later:
   *
   *   - **THE ROUNDING EDGE IS AT 3.34 MINUTES** and this row sits 0.16 above
   *     it. `candidateSeconds` is 50 and its published band is 40–60; anywhere
   *     from 48 s up pays +2 and anywhere below pays +1. A later
   *     re-derivation that lands under the edge has to say so and re-publish.
   *   - **THE STUDY ONLY EVER SHIPS AT TIER 3.** `deck.ts` gives it
   *     `tierRange: [3, 3]` (the 2026-08 owner playtest: *"I reached the
   *     Forgotten Word on my FIRST DAY"*), so tiers 1 and 2 of this row are
   *     priced, published in 4.10h's wage populations, and never dealt. They
   *     are derived here anyway because a table with three tiers must be honest
   *     at all three, and because a deck edit that lowers the Study must not
   *     find two invented numbers waiting for it.
   *
   * It stays under `LADDER_MINUTES` (4), so the Study does not join the
   * no-ladder debt the Darkroom carries, and the draft card's own duration
   * clause goes from *"a minute or two"* to *"a few minutes"* — which is a RULE
   * OF PLAY (how long the room asks for), the half of the owner's 13 Aug ruling
   * that is always stated.
   */
  'forgotten-word': [1.5, 2.25, 3.5],
  /**
   * ROUND 27 — THE COUNTING HOUSE, RE-CLOCKED BECAUSE ITS BOARDS WERE REGRADED.
   *
   * `[12.5, 27.0, 30.0]` was honest arithmetic over an UNGRADED pool. The three
   * tiers were the same length (24/25/24 givens, ~57 empty cells at every
   * storey) and differed only in technique — and `docs/BENCHMARKS.md` §7, the
   * sudoku teardown this repo did not have until this round, records that the
   * technique end of it was off the top of the reference ladder as well:
   * **98% of tier-2 and 100% of tier-3 boards required a wing, a fish or a
   * colouring chain, and NYT Hard — the hardest board that benchmark publishes
   * — requires none of the three.** Two of three storeys were above the top of
   * the ladder and indistinguishable from each other, and the ground floor was
   * a twelve-and-a-half-minute room offered as often as the Gallery.
   *
   * `content/generate-sudoku.ts` now digs each tier to its own given band as
   * well as rating it by technique ceiling, so the two levers move together
   * (`SUDOKU_TIER_GRADE`, engine/puzzles/sudoku.ts). Measured on the shipped
   * pool, and this row is arithmetic over those two facts, not a wish:
   *
   * ═══ THE NUMBER THAT WAS ACTUALLY WRONG WAS SECONDS PER PLACEMENT ═══════
   *
   * The old row implied **13 s per placement at tier 1 and 28 and 32 at tiers
   * 2 and 3** — on boards of IDENTICAL length (57 empty cells at every storey).
   * It was charging two and a half times as long for each figure because one
   * technique in the solve was harder. That is not what a wing costs. A wing,
   * a fish or a colouring chain is a SEARCH: one stall, one sweep of the whole
   * grid, a few minutes once or twice in the board — not a tax on all
   * fifty-seven cells. Tier 1's own 13 s/cell was the honest rate all along;
   * the top of the table was the fiction, and it is where the 27- and
   * 30-minute rooms came from.
   *
   * So the row is arithmetic over the regraded pool at a rate that climbs the
   * way a rate can:
   *
   *   tier 1 — 30 givens, **51 empty cells**, locked candidates and NOTHING
   *            above them (0/40 boards need a subset, a wing, a fish or a
   *            chain) = NYT MEDIUM. 51 × 13 s = **11.0 min**.
   *   tier 2 — 26 givens, **55 empty cells**, naked/hidden subsets required and
   *            0/40 needing anything above them = NYT HARD. A subset is a scan
   *            of one unit, so a cell costs a second more: 55 × 14 s =
   *            12.8 → **13.0 min**. This is the headline: the 27-minute board
   *            in a 10–15-minute evening is a 13-minute board.
   *   tier 3 — 24 givens, **57 empty cells**, and 40/40 boards require an
   *            X-wing, an XY-wing, a swordfish, an XYZ-wing or a colouring
   *            chain — the rung ABOVE anything NYT prints, which is the owner's
   *            expert directive kept rather than argued with. The hunt is real
   *            and it is worth four seconds a cell across the board:
   *            57 × 18 s = 17.1 → **17.0 min**.
   *
   * WHAT THE RE-CLOCK COSTS THE ECONOMY, measured, because round 26 wrote down
   * that the manor has no clock left: **nothing at all in steps.**
   * `solvePayout` is clamped by tier at +12/+9/+6 and all three tiers were
   * pinned to their caps before and still are (1.4 × 11.0 = 15 → 12;
   * 1.4 × 13.0 = 18 → 9; 1.4 × 17.0 = 24 → 6). Not one payout in the manor
   * moves. What moves is the WAGE — the room stops being the bottom of the
   * table (sudoku t3 0.200 → 0.353 steps a minute) — and the CLOCK, which is
   * the thing the owner was complaining about.
   *
   * AND THE ONE THING THAT DID MOVE, recorded because it is a regression and
   * this file's neighbours are ratchets: a shorter room is more often FINISHED,
   * and a finished anchor pays a key and the perfect bonus as well as its
   * steps. `tests/economy-pressure.test.ts` measures the skilled player's
   * ground-floor drain at −0.214 steps a room, from −0.274. It is still a cost
   * and it is still negative for every profile, which is what 4.10i is about;
   * the bound moves and the finding is named there.
   *
   * AND WHAT IT DOES NOT FIX. Seven minutes is still nearly three times the
   * median appetite for one room (`PATIENCE_SPREAD`), so the Counting House is
   * still a room she leaves unfinished — at every tier, by design. That is what
   * the OPEN LEDGER is for (engine/rooms/room-bank.ts): the grid is still hers
   * tomorrow, so an unfinished sudoku is a thread rather than an abandonment.
   */
  'sudoku': [11.0, 13.0, 17.0],
  // ── micro ────────────────────────────────────────────────────────────────
  /**
   * ROUND 46 — THE DARKROOM, DERIVED FOR THE FIRST TIME.
   *
   * `[3.0, 3.5, 4.0]` was the only row in this table with no derivation behind
   * it and no pin under it. Its whole account was one line in the header —
   * *"11 of 14 distinct letters to deduce over 26"* — a single figure with no
   * tier in it, and the three numbers were spread by hand around it. Measured
   * against the room the generator actually ships (`content/generate-cipher.ts`,
   * and the pool bears it out at 34/34, 0/44 and 0/43), that row said a
   * **no-crib** cryptogram costs 33% more than one with an `A` and three
   * high-frequency letters handed over. It is the same defect round 27 found in
   * the sudoku row — a difficulty lever the clock did not follow — and it is
   * the reason `docs/AAA_BAR.md` 4.10h's fourth wage ratchet has been sitting
   * above its own published figure since round 42.
   *
   * ═══ THE MODEL: A CRYPTOGRAM IS AN OPENING AND THEN A CASCADE ═════════════
   *
   * `docs/BENCHMARKS.md` §11 (written this round, because the Darkroom is one
   * of the two rooms this repo grades and had no teardown to grade against) is
   * the source. Its finding in one line: **a cryptogram's clock is dominated by
   * the search for a foothold you trust, not by the letters.** Once three or
   * four letters stand, the rest falls out of word shape. So the row is two
   * terms, and the tiers differ in exactly ONE of them — which is what the
   * generator says about itself:
   *
   *     minutes = CIPHER_OPENING[tier] + lettersToDeduce × CIPHER_CASCADE_S / 60
   *
   *   tier 1 — a ONE-LETTER WORD (`A`/`I`, a two-way guess before a single
   *            deduction) and 3 revealed HIGH-frequency letters. 34/34 shipped
   *            puzzles carry the crib word. A median 13 distinct letters, 3
   *            given ⇒ **10 to deduce**. Opening ≈ 55 s: the foothold is handed
   *            over. 0.92 + 2.08 = **3.0 min — UNCHANGED**, and see below for
   *            the constraint that holds it there.
   *   tier 2 — NO one-letter word (0/44), a TWO-LETTER word, and ONE revealed
   *            MID-frequency letter. A median 13 distinct, 1 given ⇒ **12 to
   *            deduce**. The two-letter word narrows to a couple of dozen
   *            candidates rather than two, and one mid-frequency letter is a
   *            place to stand rather than an answer: opening ≈ 120 s.
   *            2.00 + 2.50 = **4.5 min** (was 3.5).
   *   tier 3 — NO crib word at all: every word is 3+ letters (0/43 carry one
   *            shorter), so nothing in the phrase SHAPE hands over a letter.
   *            The longest phrases (median 31 letters) over the widest
   *            alphabets (median 15 distinct), 2 given ⇒ **13 to deduce** — and
   *            31 letters is well under the 60–120 a newspaper cryptoquote
   *            gives frequency analysis to bite on (BENCHMARKS §11). The
   *            opening is the whole room: ≈ 167 s. 2.79 + 2.71 = **5.5 min**
   *            (was 4.0).
   *
   * The openings run **55 s / 120 s / 167 s** and the cascade rate does not
   * move, because the fill is the fill: the letters are the same letters
   * whichever tier handed you the first of them.
   *
   * ═══ WHY TIER 1 DID NOT MOVE, AND IT IS NOT BECAUSE IT WAS RIGHT ══════════
   *
   * The honest band for tier 1 is roughly 1.7–3.3 minutes and 3.0 is the top of
   * it. It is the top because `KEY_SUPPLY.workKeyMinutes` is **3.0 and the
   * Darkroom is one of the four rooms that clause names** — a tier-1 solve pays
   * a ground-floor key when the room asked at least that much honest work. The
   * row sits exactly ON the threshold, so any downward re-derivation deletes a
   * ground-floor key source by side effect. Measured at 2.25 minutes it does:
   * the round-10 directive that solves outsupply the deck inverts hard
   * (**11,426 solve-keys against 18,640 off the green deck**, from 23,867
   * against 29,507 — `tests/economy-simulation.test.ts`), and 4.10b's first
   * evening and two 4.10g bands move with it. **That is an ECONOMY round's
   * change, not a word-game one**, and it is written here so the next round
   * that reads this row knows the number is pinned by a threshold rather than
   * by confidence.
   *
   * ═══ WHAT IT COSTS, AND WHAT IT PAYS ══════════════════════════════════════
   *
   * **Not one payout moves.** 0.45 × 4.5 = 2.03 and 0.45 × 5.5 = 2.48 both
   * round to the **+2** the room already paid, so no card face changes its
   * number, no ledger entry changes, and every band that hangs off
   * `solvePayout` is untouched. What moves is the WAGE — the thing 4.10h
   * measures — and the CLOCK.
   *
   *   - 4.10h's fourth population (tier-1/2 rooms of two minutes or more, minus
   *     the Counting House) **1.71× → 1.36×**, back under the 1.43× it stood at
   *     before round 42 collapsed the unit. Both ends of that ratio were the
   *     Darkroom; one of them still is.
   *   - The other three populations do not move: the Darkroom is at neither end
   *     of any of them.
   *   - The clock: tier-2 and tier-3 Darkrooms are a minute and a half longer.
   *     Every published evening and campaign band holds unmoved
   *     (`tests/economy-simulation.test.ts`, `economy-pressure`, `volume-pacing`).
   *
   * **AND THE DEBT IT GROWS, published rather than absorbed.** `LADDER_MINUTES`
   * is 4: a room longer than a sitting must pay on the way up. The Darkroom has
   * no ladder — `cipher-adapter.ts` emits one `progress` event in the whole room
   * (`print-developed`, at the end) — so there is no marker to hang a rung on.
   * At tier 3 it was **already** over the line at 4.0 and nothing in this repo
   * said so; at tier 2 it now is too. `tests/economy-effort.test.ts` pins the
   * list of unstaged long rooms, so the debt is named and bounded instead of
   * discovered again. Paying it needs the adapter to broadcast how much of the
   * print has developed, which is A4's seam and a room's own change.
   */
  'cipher': [3.0, 4.5, 5.5],
  /**
   * ROUND 50 — THE LINEN CLOSET, AND THE UNIT IT HAS TO BE CLOCKED IN.
   *
   * `[1.25, 1.5, 2.0]` was one header line — *"4×4, 3 entries, 11 letters —
   * ~75 s"* — written before round 29 gave the room a hem, and
   * `docs/LINEN_CLOSET.md` records in its own cost list that
   * *"`ROOM_EFFORT.crossword` is untouched"*. A room grew a second clued answer
   * and a whole checking mechanic and its clock did not move.
   *
   * ═══ THE UNIT IS THE CLUED ANSWER, NOT THE SQUARE ═════════════════════════
   *
   * This matters more than the numbers, because the obvious measurement is
   * wrong. Counted per SQUARE the shipped row runs 9.4 / 6.9 / 8.6 seconds and
   * reads as a defect — a bigger, later board implying a faster square, which
   * is exactly what round 26 caught in the Gallery and round 27 in the Counting
   * House. It is not that defect. **This room is not a crossword** (the owner's
   * ruling, LINEN_CLOSET.md: *"build it around its clues — the thing it is
   * actually good at — rather than around crossings"*), and a sparse grid's
   * squares are not its work: three quarters of them have no crossing, so a
   * square is typed, not solved. The work is the CLUE, and there are
   * `entries + 1` of them because the hem is clued in the list with the rest.
   *
   * Counted in the room's own unit the shipped row runs **18.8 / 18.0 / 24.0
   * seconds a clued answer — and the middle one still runs backwards**, on a
   * tier that asks one more clue, a longer answer and a rarer word than the one
   * below it. That is the real finding, and it survives the unit change.
   *
   *     minutes = cluedAnswers × CLOSET_CLOCK.answerSecondsByTier / 60
   *
   * Measured off `content/generated/crossword.json`, and every fact here is a
   * median over the shipped boards:
   *
   *   tier 1 — 4×4, **3 entries + the hem = 4 clued answers**, 3-letter
   *            answers at corpus rank 5,100, clues of 4 words. 4 × 18.5 s =
   *            74 s = 1.23 → **1.25 min — UNCHANGED**, which is the check on
   *            the model rather than a result of it.
   *   tier 2 — 5×5, **4 + hem = 5**, 4-letter answers at rank 8,854, clues
   *            still 4 words. One more clue and one more letter in each
   *            answer: 5 × 22 s = 110 s = 1.83 → **1.75 min** (was 1.5).
   *   tier 3 — 5×5, **5 clued answers** again, but the answers are **3.8×
   *            rarer than tier 1's** (median rank 19,461) and the clues are a
   *            word longer (5 words, 29 characters against 22) — the room's
   *            only remaining lever, since it does not get another entry.
   *            5 × 28 s = 140 s = 2.33 → **2.25 min** (was 2.0).
   *
   * The per-answer figures are 18.75 / 21.0 / 27.0 s and they climb, which is
   * the invariant round 26 wrote down: a harder board may never imply a faster
   * unit of its own work. Each sits inside `CLOSET_CLOCK`'s published band for
   * its tier, and the bands are the NYT Mini's 2–6 s a square (BENCHMARKS §10)
   * scaled by the thing that separates the two rooms — a Mini answer is
   * confirmed by its crossings and one of ours is confirmed only by the hem.
   *
   * **No payout moves**: 0.45 × 1.75 and 0.45 × 2.25 both round to the +1 the
   * cozy floor was already paying. What moves is the wage (0.667 → 0.571 at
   * tier 2, 0.500 → 0.444 at tier 3, both interior to 4.10h), the clock, and
   * the draft card's tier-3 duration clause — *"a few minutes"* rather than
   * *"a minute or two"*, which is truer and is a rule of play.
   */
  'crossword': [1.25, 1.75, 2.25],
};

/**
 * ── THE LIBRARY'S TWO RATES, NAMED SO THE ROW CAN BE RE-DERIVED ────────────
 *
 * A Word Web board is four categories of two kinds, and the tier chooses the
 * mix (`TIER_SPECS.minPlain` 2/1/1; the shipped pool's medians 3/2/1). See the
 * row for what is derived here and what is only checked.
 */
export const WEB_CLOCK = {
  /**
   * Seconds for a category you can read straight off the tiles — semantic,
   * trivia or compound (`isPlainish`). It is the board's way in, and the
   * player's own verb is the same one Connections asks for: name the thread.
   */
  plainSeconds: 56.25,
  /**
   * …and for one that has to be PERFORMED before it is visible: an anagram, a
   * silent letter, a doubled pair. BENCHMARKS §2's fairness note is the reason
   * these are not the same number — a worked thread is a mechanic you have to
   * find, not a list you have to recognise.
   */
  workedSeconds: 101.25,
  /** The bands the two rates must sit inside (seconds). */
  plainBandSeconds: [45, 70] as readonly [number, number],
  workedBandSeconds: [85, 120] as readonly [number, number],
} as const;

/**
 * ── THE STUDY'S TWO TERMS, NAMED SO THE ROW CAN BE RE-DERIVED ──────────────
 *
 * `ROOM_EFFORT['forgotten-word']` is arithmetic over these and the shipped
 * pool's own register lengths, corpus ranks and crib counts (see the row).
 * `tests/economy-effort.test.ts` inverts the row through them every run.
 */
export const STUDY_CLOCK = {
  /**
   * Reading rate for the two registers the room gives away free — the headline
   * (poetic at tiers 1–2, the riddle at tier 3) and the plain gloss under it.
   * Deliberately slow for prose: these are the best-written sentences in the
   * game and they are read as clues, not skimmed.
   */
  readWordsPerMinute: 150,
  /**
   * Seconds to produce ONE candidate — a word that fits the letter count, the
   * letters already standing and the meaning — submit it, and read the
   * closeness that comes back. **Constant across tiers on purpose**, exactly as
   * `CIPHER_CLOCK.cascadeSeconds` is: the act is the same act at every storey,
   * and the tier changes how many of them the median solve takes. It sits above
   * the Conservatory's ~20–30 s find because a hive word is spotted on seven
   * letters and a Study word is retrieved against a meaning.
   */
  candidateSeconds: 50,
  /** The band that rate must sit inside. The row takes the middle. */
  candidateBandSeconds: [40, 60] as readonly [number, number],
  /**
   * Candidates the median solve takes, by tier — the only term that moves, and
   * the one the pool's corpus ranks argue for. Bounded above by the room's own
   * rope (`maxGuessesForLevel`, 6 / 5 / 5).
   */
  candidatesByTier: [1.5, 2.5, 4.0] as readonly number[],
} as const;

/**
 * ── THE LINEN CLOSET'S RATE, NAMED SO THE ROW CAN BE RE-DERIVED ────────────
 *
 * Seconds for one CLUED ANSWER (an entry, or the hem, which is clued in the
 * list with the rest). The room's unit is the clue and never the square — see
 * the row, and `docs/LINEN_CLOSET.md` for the ruling that makes it so.
 */
export const CLOSET_CLOCK = {
  answerSecondsByTier: [18.5, 22, 28] as readonly number[],
  /** Per-tier bands; the row takes the middle of each. */
  answerBandSeconds: [
    [15, 22],   // 3-letter answers, rank ~5k, 4-word clues
    [18, 26],   // 4-letter answers, rank ~9k
    [24, 32],   // 4-letter answers at rank ~19k, clues a word longer
  ] as readonly (readonly [number, number])[],
} as const;

/**
 * ── THE DARKROOM'S TWO TERMS, NAMED SO THE ROW CAN BE RE-DERIVED ───────────
 *
 * `ROOM_EFFORT.cipher` is arithmetic over these and the shipped pool's own
 * letter counts (see the row's note, and `docs/BENCHMARKS.md` §11).
 * `tests/economy-effort.test.ts` inverts the row through them every run: it
 * reads the distinct-letter and reveal counts off `content/generated/cipher.json`,
 * subtracts the cascade, and holds the residue — the OPENING — to the band
 * below. So a regenerated pool that changes what the room asks fails a test
 * instead of quietly leaving the row describing yesterday's Darkroom.
 */
export const CIPHER_CLOCK = {
  /**
   * Seconds to deduce and place one letter ONCE A FOOTHOLD EXISTS. Constant
   * across tiers on purpose: the fill is the fill, and the tiers differ in the
   * opening rather than in the letters. Sits between the sudoku's 13 s locked-
   * candidate placement and its 18 s hunt (round 27) — a cipher letter is a
   * word-shape read plus two taps.
   */
  cascadeSeconds: 12.5,
  /**
   * Minutes to a foothold you trust, by tier — the crib the generator hands
   * over (`content/generate-cipher.ts` REVEALS + the tier gates), and the only
   * term that moves. The bands are BENCHMARKS §11's, and the row takes the
   * middle of each except at tier 1, where `KEY_SUPPLY.workKeyMinutes` holds it
   * at the top (see the row).
   */
  openingBandMinutes: [
    [0.5, 1.2],   // a one-letter word + 3 high-frequency letters, already given
    [1.5, 2.5],   // a two-letter word + 1 mid-frequency letter
    [2.2, 3.5],   // nothing: every word 3+ letters, 2 mid-frequency letters
  ] as readonly (readonly [number, number])[],
} as const;

/** Honest median minutes for `kind` at `tier`. */
export function effortMinutes(kind: RoomPuzzleKind, tier: Tier): number {
  const row = ROOM_EFFORT[kind];
  const i = Math.max(0, Math.min(2, Math.floor(tier) - 1));
  return row[i]!;
}

/**
 * Player-facing duration for the draft card (REVIEW_AA §6: *"the draft card
 * states the expected time"*). Deliberately coarse and deliberately rounded
 * DOWN to a familiar unit — "about 3 min", "about a quarter hour" — because the
 * card is a decision aid, not a stopwatch, and a cozy game must not put a timer
 * in front of the player (AAA 4.13: rooms are always leavable).
 */
export function effortLabel(kind: RoomPuzzleKind, tier: Tier): string {
  const m = effortMinutes(kind, tier);
  if (m < 2) return 'a minute or two';
  if (m < 4) return 'a few minutes';
  if (m < 8) return 'five minutes or so';
  if (m < 20) return 'a long sit';
  return 'a long sit';
}

/**
 * ── THE STAGE LADDER ──────────────────────────────────────────────────────
 *
 * How much of a room's payout each of its OWN progress markers has earned,
 * as a fraction of the full solve. Every detail string below is one an adapter
 * already emits today — nothing here asks a room to change what it broadcasts.
 *
 * The fractions are DERIVED, not chosen:
 *   - the hive's rungs are their own point percentages against the 70% solve
 *     gate (`HIVE_LADDER` / `ladderThreshold(maxScore, 70)`), so Blossom is
 *     25/70 of the way to a solved room and Garden 50/70. If the ladder or the
 *     gate moves, `tests/economy-effort.test.ts` fails here first.
 *   - the sudoku pays per NINE placements — one box's worth of ink — against
 *     THE BLANK COUNT OF THE LEAF SHE IS SITTING AT, which the adapter's own
 *     marker carries (round 27), which is the granularity the review asked for
 *     ("+2 per nine placements") expressed as a fraction.
 *   - the word web pays per group, off its own `group-solved` details.
 *
 * Micro rooms have no ladder: a 75-second Linen Closet has nothing to stage,
 * and inventing rungs for it would be ceremony rather than reward.
 */
export const HIVE_STAGE_PCT: Readonly<Record<string, number>> = {
  Blossom: 25,
  Bower: 40,
  Garden: 50,
};

/** The point percentage at which the Conservatory counts as solved. */
export const HIVE_SOLVE_PCT = 70;

/**
 * ROUND 27 — WHERE `SUDOKU_BLANKS` WENT, AND WHY IT IS NOT COMING BACK.
 *
 * This was `export const SUDOKU_BLANKS = 57`: the median empty-cell count over
 * the shipped pool, used as the denominator of the sudoku ladder. It was a
 * POOL AVERAGE standing in for A PROPERTY OF THE BOARD ON THE TABLE, and it
 * was wrong in two independent ways at once — the regraded pool runs 51/55/57
 * empty cells by tier, and a row-band tier-1 cell may deal a technique-tier-2
 * board anyway (`TIER_PREFERENCE`, sudoku-adapter.ts), so no per-tier table
 * would have fixed it either.
 *
 * The fix is not a better constant. The adapter's own progress marker now
 * carries the leaf's size — `inked:12-of-51` — so `stageFractionOf` divides by
 * the board it is being paid for, and there is no number here left to drift.
 */



/** Placements per sudoku instalment: one box's worth of ink. */
export const SUDOKU_CELLS_PER_STAGE = 9;

/** Groups on a Word Web board / the Library's instalment count. */
export const WEB_GROUPS = 4;

/**
 * The fraction of a room's payout earned by the progress marker `detail`,
 * given the fraction already earned. Returns `null` when the marker is not a
 * stage (a pangram, a dead letter, a word that changed nothing).
 *
 * Monotone by construction: callers pay `floor(total × fraction) − alreadyPaid`
 * and can never pay twice for the same rung, in any event order.
 */
export function stageFractionOf(
  kind: RoomPuzzleKind,
  detail: string | undefined,
  earnedSoFar: number,
): number | null {
  if (!detail) return null;
  switch (kind) {
    case 'hive': {
      if (!detail.startsWith('tier-up:')) return null;
      const pct = HIVE_STAGE_PCT[detail.slice('tier-up:'.length)];
      return pct === undefined ? null : pct / HIVE_SOLVE_PCT;
    }
    case 'sudoku': {
      // `inked:<left>-of-<blanks on this leaf>` — the board says how big it is
      // (round 27; see the note where `SUDOKU_BLANKS` used to live).
      const m = /^inked:(\d+)-of-(\d+)$/.exec(detail);
      if (!m) return null;
      const blanks = Number(m[2]);
      // THE SUMMIT BELONGS TO THE SOLVE, exactly as the hive's does (the
      // Conservatory's `tier-up:Full Bloom` returns null here for the same
      // reason). `ceil` gives the leaf a last, short rung, and the climb is
      // capped one rung below it — so the ladder can never pay the whole room
      // off the second-to-last figure, which `floor` did on any board whose
      // blanks are not a multiple of nine (a 51-blank leaf reached 5/5 with
      // six cells still empty).
      const total = Math.ceil(blanks / SUDOKU_CELLS_PER_STAGE);
      if (total <= 0) return null;
      const placed = Math.max(0, blanks - Number(m[1]));
      const stages = Math.min(Math.floor(placed / SUDOKU_CELLS_PER_STAGE), total - 1);
      return Math.max(0, Math.min(1, stages / total));
    }
    case 'word-web': {
      if (!detail.startsWith('group-solved:')) return null;
      // The detail carries the group's colour, not its index, so the ladder
      // counts: each group solved is one more quarter of the board.
      const done = Math.round(earnedSoFar * WEB_GROUPS) + 1;
      return Math.min(1, done / WEB_GROUPS);
    }
    default:
      // The Gallery, the Study and the micro rooms: one sitting, one payout.
      // A room already under `LADDER_MINUTES` has nothing to stage — inventing
      // rungs for a seventy-five-second board would be ceremony, not reward.
      return null;
  }
}

/**
 * A room longer than a median player's appetite for ONE room must pay on the
 * way up (`PATIENCE_SPREAD` in engine/economy/simulate.ts models that appetite
 * at ~3 minutes; this is deliberately a little above it, so the rooms that
 * stage are the ones she cannot expect to finish in a sitting).
 */
export const LADDER_MINUTES = 4;

/** Does this room pay on the way up? */
export function paysInStages(kind: RoomPuzzleKind, tier: Tier): boolean {
  return effortMinutes(kind, tier) >= LADDER_MINUTES
    && stageFractionOf(kind, LADDER_PROBE[kind] ?? '', 0) !== null;
}

/** A detail string each staging room really emits — proof it has a ladder. */
const LADDER_PROBE: Partial<Record<RoomPuzzleKind, string>> = {
  'hive': 'tier-up:Blossom',
  'sudoku': 'inked:40-of-51',
  'word-web': 'group-solved:green',
};

/**
 * WHERE THE LADDER'S PROGRESS LIVES — on the room it belongs to, inside
 * `manor`, which `store.selectSave` already persists whole. Augmented rather
 * than declared in `engine/types.ts` for the same reason (and by the same
 * established pattern) as `PlacedRoom.session`: that file is architect-owned
 * and shared with every other agent.
 *
 * It is a FRACTION of the room's payout, not a step count, so it survives a
 * retune of the payout itself: if `solvePayout` moves overnight, a half-climbed
 * Conservatory is still half paid and can never be paid twice.
 */
declare module '../types' {
  interface PlacedRoom {
    ladderEarned?: number;
  }
}
