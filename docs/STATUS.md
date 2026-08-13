# Lexicon Manor — where this stands

*Handoff written 12 Aug 2026, at the end of round 21.*

**This file names no commit sha and no commit count, deliberately.** Three separate
critics have now caught this doc stale on exactly that line, because a document that
carries a moving number is wrong the moment the next commit lands. To find out what is
live: `git log --oneline -1`, then grep the served bundle for that sha (the build stamps
it). That is the check the deploy protocol already requires, so it can never disagree.

**Play it:** https://mhartwig21.github.io/LexiconManor/ — installable on a phone via Add to Home
Screen. Deploys from `main` on every push, three CI jobs (build · glass · deploy); a failure in
either of the first two skips the deploy, so a broken build cannot reach production.

**Repo:** github.com/mhartwig21/LexiconManor. The owner is building it as a gift for his wife.

---

## READ THIS FIRST — the one thing that is wrong right now

**THE MODEL HAS BEEN CHARGING THE GALLERY FOR A MISTAKE CLASS THE ROOM DELETED IN ROUND 28, AND
EVERY BAND IN AAA 4.10 WAS MEASURED THROUGH IT** (found in round 44 while pricing a study).
`twistleAdapter` has returned `kind: 'study'` — no mistake event, no weight, no strike — for every
real word she traces off the ask since round 28, and at tier 1 the Gallery cannot charge a costed
mistake at all: there is no centre rule to break. `engine/economy/simulate.ts` has gone on levying
`STEP_TABLE.mistake` for those traces at every tier for sixteen rounds.

`SimProfile.studyRelief` is the share of them a run forgives — **0 in everything the game ships,
1 is the truth** — and `tests/economy-effort.test.ts` runs both on every run and publishes the gap:
forgiving them puts the median evening at **~16 minutes against 4.10b's published 10–15**. It is
**more than twice** the size of the whole mechanic round 44 shipped, and it moves the day in the
direction the owner cares about.

**The fix is not in this file's gift.** Evening length is an OUTPUT of the starting count and the
payouts (his own words, `docs/THE_CLIMB.md` §1b), and correcting the model makes evenings LONGER —
so paying this off means moving `BASE_DAY_BUDGET`, re-measuring the whole campaign, and re-deriving
every band that hangs off it. That is an economy round. Until it runs, every 4.10 band in the repo
is measured through a Gallery that is poorer than the shipped one.

**~~Second, and cheap:~~ PAID IN ROUND 45, together with the day's own arithmetic.** Five rooms
were printing the pre-round-42 price (`const stepCost = tier === 3 ? 3 : 2` in `WordWebView`,
`CrosswordView`, `SudokuView`, `ForgottenWordView`, `CipherView`), the Counting House's
`figureCost = claimCost * 2` printed **−6 on a button** against a charge of 1, `Step back · 1 step`
charged nothing at all, and the night digest counted **the dawn cup twice** — it is inside the
figure the candle shows at dawn AND was printed again under "Steps given back", which is why all
three cold-read players did the day's sum and all three got the same wrong answer. Every price is
read off `STEP_TABLE` now, and the day closes on an identity: `dayStartTotal − stepsSpent +
stepsGivenBack === ledgerTotal`. Full write-up, with the band that moved and its reason, in
`docs/THE_CLIMB.md` §1d.

---

**THE MOVE-COSTS-1 ECONOMY IS BUILT** (round 42). A move costs **1**, a day starts at **12
moves**, a wrong guess costs **1** at every weight and every tier, and solving pays moves back —
the owner's four rulings from `docs/THE_CLIMB.md` §1b, which now carries a BUILT block with every
band that moved and every measurement behind it. The move price and the starting count are
RULINGS, not knobs: if an evening ever runs long or short, the levers are the starting count and
the payouts, in his own words, and never the move price.

**~~The one thing that is wrong now is a CONTENT debt~~ — ROUND 46 PAID HALF OF IT AND PROVED
THE OTHER HALF VOID.** Round 42 published one commission for two ratchets and it was reasoned
rather than measured. Full account in `docs/THE_CLIMB.md` §1f.

- **PAID: 4.10h's fourth wage spread, 1.71× → 1.36×**, back under the 1.43× it stood at before
  round 42. Both ends of that ratio were the Darkroom, and `ROOM_EFFORT.cipher` was the only row
  in the effort table with **no derivation behind it and no pin under it** — it priced a
  *no-crib* cryptogram 33% above one that hands over an `A` and three high-frequency letters,
  while the generator has graded that room on crib class since round 4. `docs/BENCHMARKS.md`
  §11 is the teardown that did not exist; the row is `[3.0, 4.5, 5.5]` and **not one payout
  moves**, so no ledger band moves with it.
- **VOID: the dominance ratchet cannot be paid with room lengths.** An ORACLE that forces the
  widest payout spread the ceiling allows makes it **WORSE** (41.7/41.0% → 43.0/44.2%), and it
  is not even available — at tier 3 the payout is clamped to {1,2,3}, so seven rooms tie by
  pigeonhole at every possible value of `ROOM_EFFORT`. Both proofs run in
  `tests/draft-dominance.test.ts`. If that ratchet is ever to fall the levers are deck plan
  spread or the payout CEILING, and a later round should not spend itself on room lengths.
- **Also corrected: FOUR of the seven rooms pay +1 at tier 1, not five** (twistle,
  forgotten-word, cipher, crossword — the Word Web pays +2). It was repeated in three documents
  and four code comments.

**~~AND THE CARD IS THE LEVER, NOT THE WAGE (round 46)~~ — OVERRULED BY THE OWNER ON 13 AUG,
AND ROUND 49 ANSWERED IT THE OTHER WAY.** Round 46 printed **`+1 page`** on a puzzle card and
measured a real win (a word room outbid on its face fell 11.3% → 7.5%, 0.0% where the clause
printed). The ruling: *"I think we want to keep true to Blue Prince where certain clues about
the benefits of rooms aren't immediately apparent. Saying +1 page feeds everything to the
player. But when a page is revealed, the player has to be able to figure out — oh, this room
provided me a page!"*

**THE LINE IT DRAWS IS THE ROUND'S REAL PRODUCT, and it is not "say less":** the card states
PRICES and RULES OF PLAY — a move's cost, a wrong guess's cost, what a solve pays back, how long
the room asks for, which doors the plan leaves her — and never states WHAT A ROOM IS WORTH TO
THE MYSTERY. Rounds 42–45 were about a player who could not audit her own counter and every one
of those clauses stays. The page clause was on the other axis.

So the clause is deleted and the burden moves to the moment of reward — which could not carry it,
because **neither the seal nor the journal named a room**, which is exactly why
`docs/COMPREHENSION.md`'s only [blocker] blind spot is the one it is. A page now remembers the
room that produced it and says so twice: *"The Long Gallery gives up an engraving"* on the glass
as it lands, *"Taken out of the Long Gallery."* on the filed page afterwards. A torn leaf names
the violet room; the solve that makes it out credits the word room, so *"Taken out of the
Archive, made out in the Darkroom."* Attributed per CARD, never per kind (the Gallery and the
Long Gallery are one kind and two rooms), and nothing is invented — testimony from a parlor and
every page in an older save print no line at all. Two write-once flag families, `docs/flags.md`.

**THE ROUND-46 RATCHET IS RETIRED RATHER THAN RE-TUNED, and that is stated where it lived.**
Under this ruling `outbid` SHOULD rise, so a tighter band would fail the build for obeying the
owner and a looser one would be the quiet re-tune STATUS §3.7 names. `tests/word-room-face.test.ts`
keeps the instrument (it prints the three face numbers every run) and now gates the RULING — no
card prints a page clause, which would have been red on the previous commit. The replacement is
**`npm run gate:attribution`**: real input at both phone sizes, verdicts on painted strings, and
`--prove` drives all ten attribution checks red through the pre-round-49 call shape. Full
account in `docs/THE_CLIMB.md` §1g.

**AND THE MYSTERY'S ARC WAS NOT COLLAPSING BECAUSE A CLUE WAS SHARP (round 47).** A blind
cold read reported LACUNA falling on day 1–2 "from one fragment of twenty-eight". Measured
against the shipped dictionary, **the softness property is intact**: the tightest engraving
alone admits **240** words (floor 100), the tightest of all 45 pairs admits **18** and both
of those arrive in the volume's back half, and the tightest pair she can hold early admits
**6,575**. What carries the design is the REVEAL ORDER — and the letter channel does not
respect it. `a-pressed-rubbing` (day 4) enclosed `v1-e4`, **revealOrder 24 of 28**, behind no
`minFragments` gate at all, so **the field on day 4 was NINE WORDS** on the repo's own drip
harness and the tube hears one free word a day from day 1. `tests/volume-pacing.test.ts` was
green throughout, because it measures the day a PAGE lands and a page count cannot see how
much dictionary is still standing. Both halves shipped, full account in `docs/MANOR_DESIGN.md`
§7: **the order gate** (a letter may bring the next engraving forward, never a later one —
day-4 field **9 → 208**, first ten-word shortlist **day 4 → 9**), and **the plate counts** —
the Word tab prints how many words still fit the engravings she can READ, precomputed by
`content/generate-volume.ts --plate` and verified in `content:verify`. A count, never a list.

**AND THREE ROOMS HAD A CLOCK NOBODY HAD EVER DERIVED (round 50).** Round 46 wrote that the
Darkroom was *"the only row in the effort table with no derivation behind it and no pin under
it."* It was the only row with no derivation **and a wrong shape**. Three more had a plausible
shape and nothing under it, and one of them was FLAT — the Study was clocked at 1.5 minutes at
every tier, across three tiers whose headwords run a median corpus rank of **25,286 / 81,158 /
219,760** and **fifteen of whose forty-three tier-3 words do not occur in a third of a million
words of English**. Full account in `docs/THE_CLIMB.md` §1h.

- **`forgotten-word` [1.5, 1.5, 1.5] → [1.5, 2.25, 3.5]**, and **the Study's teardown did not
  exist** — §7 of this file has said *"if yours is missing, write it before you build"* for four
  rounds. `docs/BENCHMARKS.md` §12 is it, and its first finding is the one `LINEN_CLOSET.md`
  told us to make explicit: **this room has NO NYT twin.** Wordle bounds it and is not it —
  Wordle restricts its answers to ordinary vocabulary *because* letter feedback alone cannot
  make a rare word fair; the Study does the opposite and pays for it in a free gloss and a crib.
- **`crossword` [1.25, 1.5, 2.0] → [1.25, 1.75, 2.25]**. Round 29 gave the room a hem and
  `docs/LINEN_CLOSET.md` records in its own cost list that *"`ROOM_EFFORT.crossword` is
  untouched"*. **The unit is the finding**: per SQUARE the row read 9.4 / 6.9 / 8.6 s and looked
  like round 26's defect, but this room is not a crossword and a sparse grid's squares are typed
  rather than solved. Per CLUED ANSWER — the room's own unit — it read 18.8 / **18.0** / 24.0 s,
  and still ran backwards at tier 2.
- **`word-web` [4.5, 5.0, 6.0] → [4.5, 5.25, 6.0]**, and the rule underneath it is the round's
  real product: **a room's difficulty GRADE and its CLOCK are not the same measurement.** The
  Library's headline figure is contested tiles and it is a median 2 at EVERY tier by design, so
  a clock built on the graded number could not have had a tier in it. The tier lever is duller
  and real — plain categories 3 / 2 / 1 — and with counts like that the middle tier is forced to
  the mean of the ends, which the shipped row missed by a quarter of a minute.
- **ONE PAYOUT MOVES — a tier-3 Study pays +2** — the first `ROOM_EFFORT` has moved since round
  27, an output rather than an aim, with the rounding edge it sits 0.16 minutes above published
  in the row. **No wage spread moves** (4.53× / 2.60× / 2.40× / 1.36×) and **the game did not
  get longer**: the decent evening is 14.53 → 14.61 on the suite's fixture and flat or shorter
  across its four seeds.
- **TWO `ceil(measured)` BANDS FELL OUT OF IT, and neither was broken by the content.** 4.10f's
  skilled evening ceiling had **eleven seconds** of headroom (21.824 against 22) and 4.10b's
  bare first evening had **half a second** (12.991 against 13) — and that one was already RED
  against its own note, which claims *"the lower half of the 10–15 window"* (≤ 12.5). Round 48's
  rule condemns both (headroom must exceed one move a day, 1.5 min); the first is re-published
  **14–24** and the second is RETIRED in favour of what the welcome pot is measurably worth
  (1.14 minutes of first evening, gated two-sided).

**AND ROUND 48 WAS A GATE-INTEGRITY ROUND: three gates could not do their job.** An
adversarial verifier refuted round 44's evidence and every finding held up when re-derived.

1. **THE GALLERY'S DEAD-GROUND GATE WAS A CHECKSUM, NOT AN AUDIT.** Round 43's metric is
   good — a barren tile is one under two *findable-in-practice* words, a barren cluster is
   king-adjacent barren tiles, ceiling 2 — but the gate declared three independences and
   the decisive one is false: `submitTwistleWord` accepts exactly `targetWords ∪ extraWords`,
   so the raw-ENABLE walk finds a **2.2% surplus** and throws it away, leaving the
   generator's own list to settle the verdict. The generator refuses anything over the
   ceiling, so the gate could only ever confirm it — hence a shipped worst wall of exactly
   2 at every tier. **The ceiling is defended as a ruling, not widened** (headroom would
   mean shipping what the owner complained about); the whole condemned pre-round-43 pool is
   now a checked-in fixture read by the same instrument (**103 offenders, 13/30/60, worst
   6/9/15**, exact); and the tautological "survives a wider line" proof is relabelled an
   instrument check and replaced by one that can disagree — the line moved **tighter**, to
   rank ≤ 10,000, where mean worst wall goes 4.714→3.971 / 5.171→4.657 / 11.586→7.300.
   The debt is published: at ≤10,000 the shipped pool still has **155/210** boards over the
   ceiling. Teardown in `docs/BENCHMARKS.md` §8.
2. **FIVE BANDS WERE `ceil(measured)`, AND THREE OF THEM WERE ALREADY RED.** Re-measured
   over six campaign seeds instead of the one each was set on: her sealed-overnight `<48%`
   is red on 4 of 6, his violet-met `<86%` on 1 of 6, her late p90 `≤23` on 4 of 6. Full
   table and the re-derivations in `docs/AAA_BAR.md` (ROUND 48 block).
3. **ONE STATISTIC WAS GATED TWICE AGAINST TWO POPULATIONS**, with the tighter bound on the
   one where it still passed — "still a rare room (<50%)" on standalone evenings (35.7%)
   and on campaign evenings (55.2%).

The two rules the replacements are derived from, and they are the round's real product:
**a metric's name must match what it computes** (a violet-met DAY-share is `1−(1−p)^rooms`
and climbs with evening length at constant rarity, which is why it was republished three
times while the deck never moved — the rarity gate is now violet's share of the ROOMS she
enters, <20% against a measured 6.03% / 10.65%), and **a band's headroom must exceed the
granularity of the lever allowed to move it** (one move a day is 1.04 rooms and 1.5 minutes,
so a ceiling with 0.49 minutes under it is not a band). Three day-share ceilings are
**retired rather than widened**, with the design requirement each stood in for gated in its
place, and every replacement is proved red on `PROFILE_SKIPPER` in the suite.

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
| The Gallery | Twistle (word search) | 210 | **yes**, on section 8's two rules |
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

**1b-bis. `npm run gate:attribution`** (`tests/round49-attribution-live.mjs`, round 49) — **every
page-granting event names the room that produced it, on the glass as it lands and in the journal
afterwards.** Drives a real day at both sizes, dispatches the solve through `applyRoomEvents` (the
one seam every adapter's solve travels) and reads `.mom__title` / `.jrn-card__whence`, never the
store. Expected room names are parsed off `deck.ts` so the instrument cannot agree with the
composer it audits. `--prove` re-runs every scenario through the pre-round-49 call shape and all
ten attribution checks go red. Note its own lesson, learned the hard way in-file: an
`elementFromPoint` ownership probe is the WRONG paint test for a seal over a playfield, which is
`pointer-events: none` by design (round 15) — it would call every in-room reward invisible.

**1b. `npm run test:prices`** (`tests/round45-prices-live.mjs`, round 45) — **no room may PRINT a
number the ledger does not CHARGE.** Drives all seven rooms and the draft footer at both sizes and
compares one PAINTED string against another: the price on the glass against how far the candle's
own numeral moved. It never asks the store what it charged — the store is where both halves of a
mispriced control agree. The control scan is generic (any visible enabled button painting a `−N`),
so a new priced button is gated the day it ships. Proved red on round 44's tree: **12 findings**.
`--prove` re-injects both shipped forms and holds 26/26 + 2/2 red.

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

Every builder runs: `tsc --noEmit` · `vitest run` (**1,483** baseline as of round 50) ·
`content:verify` · `lint:clearance` · `build` · `gate:glass` (0 findings at both sizes) ·
`test:prices` · `gate:attribution` (both, and both `--prove` halves).

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

1. **~~The wage table is too coarse to spread a draft~~ — settled in round 46, both halves**
   (top of this file). What is left in its place, ranked: **(a)** the page clause is VALVED, so
   the word room's card reverts to the round-45 face once the day's engraving is filed — the
   named next lever is printing `decipherYield(tier)` (1/2/3 sealed pages made out, unvalved,
   on every solve), which needs a second live predicate and a second clause on a stake line that
   already wraps at 375×667 — **(a) IS DEAD: the owner deleted the page clause on 13 Aug and
   round 49 moved the burden to the moment of reward, so a round that revives it in any form is
   relitigating a ruling**; **(b)** the Darkroom is over `LADDER_MINUTES` at tiers 2 and 3 with
   no rung to pay — its adapter emits one progress event in the whole room — pinned as a bounded
   debt in `tests/economy-effort.test.ts`; **(c)** 13 of 44 tier-2 cipher boards carry no crib
   word at all, because `tierOf` is two gates and a remainder (BENCHMARKS §11).
2. **Her campaign is ~18–19 days, was ~28.** Flat movement took ~6 evenings off the median player
   and the three-cell landing took more; the skilled player barely moved, because the old toll fell
   on exactly the storeys she re-walks. **If 28 was deliberate, this needs a ruling.**
3. **A moment seal paints over the dusk veil undimmed** — a cream card over the candle at full
   brightness during the fade.
4. **Reduced motion lost a quarter of its dusk**, unpublished — gone by ~906ms.
5. **The Library** (median 2 contested tiles against 2–4) and **the Darkroom** — the two rooms that
   do not clear their benchmark.
   - **AND THE STUDY IS THE ROOM NOBODY HAS EVER SEEN PLAYED (named round 50, BENCHMARKS §12).**
     It is `tierRange: [3, 3]`, so it sits on rows 5–6 behind the padlocks, and **no blind tester
     in `docs/COMPREHENSION.md` has ever reached it** — there is not one finding about it in that
     file. Its clock is derived now and its teardown exists; what nothing in this repo can tell
     you is whether a stranger solves an archaic word off a riddle with two letters standing.
     That is a cold-read question, and the next cold read should be told to climb.
   - **THE GALLERY'S STUDIES PAY NOW (round 44)** — a study hands back the move she spent walking
     in, once a board, and the clause that says so is on the never-hidden rule line. The finding
     that made three rounds of copy fail is worth more than the mechanic: **the only sentence
     stating what a study was for was deleted at 375×667 by
     `@media (max-height: 700px) { .anch__flavour { display: none } }`** — authored, certified by
     reading the string, and never once painted on the phone the game is judged on. Every band that
     moved is in `docs/THE_CLIMB.md` §1c with its cause. `tests/round38-gallery-live.mjs` gained
     GROUND/SAYS (the clause is painted, at both sizes, before she traces) and GROUND/PAID (the
     candle rises by one on the first study and does not rise again for seven more), both proved
     red by injection.
   - **The Gallery's grid was round 43, off owner play** — *"a lot of letter placements that
     totally close off any ability to ever form a word… like c c c all next to each other."*
     The measurement had to be invented and the FIRST one was green and wrong: counted against
     the board's accept-list, a tile serving no word is essentially extinct (median 0 a tier), so
     that gate would have passed without a grid moving. The accept-list is the wrong denominator
     — round 38 grew it to the whole dictionary, so a tile "serving 22 words" means AIVERS and
     AKEES. Counted against what is FINDABLE IN PRACTICE (accepted **and** rank ≤ 20k) the
     complaint is right there: the largest run of king-adjacent tiles serving under two such
     words was a median 1 / 2 / 6 and a worst of 6 / 9 / 15, on **103 of the 210 boards**. The
     ceiling is 2, enforced at generation and gated by an enumerator that reads raw ENABLE and
     walks the shipped grid itself; it is red on the previous pool and clean on this one at both
     rank ≤ 20k and rank ≤ 60k. **And his own example is not the mechanism** — three touching C's
     is uncorrelated with barren ground (0.160 barren share either way), so the fill rule written
     to suppress it was deleted on that number rather than shipped with a comment the data
     refuses. Bands that moved, with causes, in BENCHMARKS §8: accepted words a board 100 / 92 /
     172 → **102 / 104 / 200**; cozy-gate refusals 534 → **619**, still zero for any rule of play;
     tier 2's `minEntryRank` 1,000 → **1,500**, because word-dense boards carry commoner words
     and the tier-2 median cheapest solve had fallen under its published floor.
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
  Strands, NYT Sudoku, the Cryptoquote, Blue Prince, Hades — **and, since round 50, the Study
  (§12), whose finding is that it has NO NYT twin and is bounded rather than benchmarked.**
  **Rooms were being judged against teardowns that did not exist in this file; if yours is
  missing, write it before you build.** All seven rooms now have one, and §2 and §10 gained the
  CLOCKS they had never carried.
- `docs/AAA_BAR.md` — ~130 criteria plus the mandatory live-interaction pass. **Round 42 added a
  block re-publishing every 4.10 band that moved, with its cause.**
- `docs/REVIEW_AA.md` — the hostile 5/10 review that drove rounds 15–19. Largely answered.
- `docs/MANOR_DESIGN.md` — the original design. **§4's step table is denominated in moves as of
  round 42, and `tests/steps.test.ts` holds it to the live constants.**
