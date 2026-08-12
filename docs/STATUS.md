# Lexicon Manor — where this stands

*Handoff written 12 Aug 2026, at the end of round 21. Live at `7093e2f`.*

**Play it:** https://mhartwig21.github.io/LexiconManor/ — installable on a phone via Add to Home
Screen. Deploys from `main` on every push, three CI jobs (build · glass · deploy); a failure in
either of the first two skips the deploy, so a broken build cannot reach production.

**Repo:** github.com/mhartwig21/LexiconManor — 77 commits. The owner is building it as a gift for
his wife.

---

## READ THIS FIRST — the one thing that is wrong right now

**The owner ruled that a move costs 1 step. The code still charges 3.** The ruling is written in
`docs/THE_CLIMB.md` section 1b and marked binding; it is documented, not built. An adversarial
verifier refuted round 21 on exactly this and was correct to.

- `MOVE_COST_BY_ROW` is a flat −3 and `BASE_DAY_BUDGET` is 22. **22 steps at 3 a move is 7 moves**
  — the 22 is a fiction the player has to divide her way out of.
- The spec: **a move costs 1; a day STARTS at 10–14 moves (build to ~12) and she EARNS MORE as she
  goes.** Solving buys more day. Earnings and penalties re-denominate into moves.
- **~66 test and doc sites are pinned to the rejected constants**, and `MANOR_DESIGN.md` plus
  `AAA_BAR.md` 4.10a still argue for them.
- **Evening length must never again be steered by re-pricing a move.** It is an OUTPUT of moves
  granted and moves earned back. Steering it through the move price is what produced the −3.
- The ceiling on a great day should be **geometric** — 35 cells, a frontier that closes, dead ends
  that cost walks — not a cap on moves earned. Measure it before reaching for a constant.

**This is the first job of the next round.**

---

## 1. What the game is

A cosy-detective word-puzzle roguelike. You draft rooms onto a 5×7 blueprint of a manor, each holds
a word game, mistakes cost **steps** rather than health, and a mystery — a word struck from every
dictionary — is assembled across days. Volume 1 answers to LACUNA. **2D only: the wife gets
motion-sick, so never propose 3D or parallax.**

Seven rooms, ~1,123 shipped puzzles, all solver-verified at build time:

| Room | Game | Pool | Clears its benchmark? |
|---|---|---|---|
| The Conservatory | Hive (Spelling Bee) | 300 | **yes** — mean answer length 5.30 vs 5.3 |
| The Study | Forgotten Word | 113 | **yes** — publishable writing |
| The Counting House | Sudoku | 120 | **yes** — t1 = NYT Medium, t2 = NYT Hard exactly |
| The Linen Closet | Acrostic-like sparse grid + the hem | 76 | **yes** |
| The Gallery | Twistle (word search) | 210 | **yes**, on section 8 one rule |
| The Library | Word Web (Connections) | 183 | no — median 2 contested tiles, wants 2–4 |
| The Darkroom | Substitution cipher | 121 | no |

**Five of seven, up from two in early August.** The three PROTECTED rooms are the Conservatory, the
Study and the Counting House — do not improve them; touch them only when a task names them, and
critics check loudly.

**The cast:** Mrs. Bramble, Ellery, Posy, Fern, Dewey the cat, the Portrait — 805 lines / 16,541
words, Hades-style contextual selection.

---

## 2. The feedback loops — the most important process fact here

Established 11 Aug at the owner request: *"I'd rather we have slow but very very high quality
feedback loops."* Before them the suite had ~370 content invariants, ~700 engine tests, ~157
economy-simulation tests **(a MODEL — there is NO telemetry in this game)** and **zero tests of the
glass**, while 62 Playwright scripts rotted unrun in `scripts/`.

**1. `npm run gate:glass`** (`scripts/smoke-gate.mjs`) — walks **22 scenes** at 375×667 and
390×844, ~1,689 hit probes at centre plus four radius-scaled edge midpoints, ~310 scrollports,
~55s, wired into CI as its own job. `gate:glass:prove` drives injected defect classes red by name.
It reaches the night by **driving a real day to a real dusk**, never by mounting a component.
**It has blocked three deploys.** Known flaw: `--prove` was seen non-deterministic once — worth
fixing before trusting it blind.

**2. THE COLD READ** — three agents play the **live deploy** blind (no repo access, no
store-poking, real pointer input) and are quizzed from memory; a fourth grader marks them against
ground truth and reports the DELTA against the previous run. **68/100 (10 Aug) → 77 (11 Aug).**
This is the only signal the builders cannot game. Re-run it every round or two. Personas:
NYT-regular (the wife proxy, most important), systems-player, story-reader. Write-up in
`docs/COMPREHENSION.md`.

---

## 3. The failure modes this project keeps repeating

Every one has cost real time. They are why the docs read the way they do.

1. **We measure the artifact, not the experience.** Solver-verified pools and green campaign bands
   never once asked whether a person saw anything.
2. **Never verify a fix with an instrument that shares its assumptions.** The Gallery certified
   "0 words refused" using a trie blind to the very words that caused the bug — twice, in two
   different rounds, each time with a perfect-looking certificate.
3. **A gate that cannot come out wrong is not a gate.** A sweep of 1,240 test blocks found three
   asserting a table against itself; the round that ran the sweep then shipped a fourth.
4. **Build it, then check a player can reach it.** The speaking tube was written, the campaign
   retuned around it, and it was wired to nothing. Authored copy has shipped invisible more than
   once (a media query at 900px against an 844px screen).
5. **A gate whose data is missing does not fail — it changes its mind.** Three deploys died on
   gitignored corpora.
6. **"Tests green" is not "the deploy served."** Two deploys failed with every test passing,
   because one file starved the vitest worker reporter. If you add heavy synchronous compute to a
   test, yield the event loop — see `breathe()` and `HEAVY_MS`.
7. **Republish every band that moves, with its reason.** A band quietly re-tuned to fit is the most
   common way this codebase has lied to itself.

---

## 4. How the work runs

Rounds of ultracode subagents. **Critique and verification fan out in parallel; implementation is
STRICTLY SEQUENTIAL** — parallel writers in one checkout lost ten agents twice. Each builder owns
distinct files, runs every gate, and commits its own work.

Every builder runs: `tsc --noEmit` · `vitest run` (1,401 baseline) · `content:verify` ·
`lint:clearance` · `build` · `gate:glass` (0 findings at both sizes).

**Playwright must use system Edge (`channel: msedge`)** — the browser download silently fails on
this machine. ONE browser at a time. **Test 375×667 first** — nearly every defect found in August
lived only there. **The game commits on pointerdown/pointerup, so `element.click()` drives
nothing**; use real `page.mouse` input. Pill and hex controls are rounded, so fixed corner insets
give false misses — probe centre and edge midpoints.

**Shipping mode (12 Aug):** push every builder the moment it is green — do not batch, do not wait
for the verify panel. The glass gate is the guard. Then confirm the deploy SERVED by grepping the
live bundle for the HEAD sha. Revert to batching when the wife is playing again.

---

## 5. Owner rulings — binding, do not relitigate

- **The door-plan line on the draft card stays as it is** ("Two ways on — east and west"). A cold
  read settled it: one tester traded +12 steps for a north door on purpose. It is the only change
  in this project that demonstrably altered how a stranger PLAYED rather than what she could
  recite.
- **The Study tier-3 overrun at 375×667 is left alone** — he will test it himself.
- **Fewer but better word games.** He cut four micro-rooms himself and did not regret it.
- **Dead ends are a legitimate Blue Prince mechanic** — do not sand them off.
- **He hates scrollbars.** A panel that scrolls instead of fitting is a defect.
- **His wife is expert at sudoku**, so expert is the BASELINE tier, not the ceiling.
- **The game leans too far into Blue Prince** — weight the work toward WORD GAME CRAFT.

---

## 6. What is open, ranked

1. **THE MOVE-COSTS-1 ECONOMY** (top of this file). Documented, not built.
2. **Her campaign is now ~19 days, was ~28.** Flat movement took ~6 evenings off the median player
   and the three-cell landing took more; the skilled player barely moved, because the old toll fell
   on exactly the storeys she re-walks. **If 28 was deliberate, this needs a ruling.**
3. **A moment seal paints over the dusk veil undimmed** — a cream card over the candle at full
   brightness during the fade.
4. **Reduced motion lost a quarter of its dusk**, unpublished — gone by ~906ms.
5. **The Library** (median 2 contested tiles against 2–4) and **the Darkroom** — the two rooms that
   do not clear their benchmark.
6. **The landing offer overflows** 69px at 375×667 and 79px at 390×844 — known debt, bounded by the
   gate, needs a different layout rather than another trim.
7. **`docs/ROOM_CHANNELS.md`** — typed clue channels, the room sets the lens and the puzzle pays,
   owner-approved and not yet built.
8. **Cross-session ladders** — no beat-your-best anywhere; named the bigger retention prize.
9. **Affinity 10–14 buys nothing**; the Portrait is 43 nodes against a 150–220 line floor.

---

## 7. The docs, and which to trust

- `docs/THE_CLIMB.md` — **the economy and landing decisions from play. Most current.**
- `docs/COMPREHENSION.md` — the blind-play test. The most valuable evidence in the repo.
- `docs/LINEN_CLOSET.md`, `docs/ROOM_CHANNELS.md` — owner rulings on those two designs.
- `docs/BENCHMARKS.md` — teardowns of Spelling Bee, Connections, Wordle, the Mini, the Acrostic,
  Strands, NYT Sudoku, Blue Prince, Hades. **Two rooms were being judged against teardowns that did
  not exist in this file; if yours is missing, write it before you build.**
- `docs/AAA_BAR.md` — ~130 criteria plus the mandatory live-interaction pass. **Its 4.10a still
  argues for the rejected economy.**
- `docs/REVIEW_AA.md` — the hostile 5/10 review that drove rounds 15–19. Largely answered.
- `docs/MANOR_DESIGN.md` — the original design. **Also carries rejected-economy blocks.**
