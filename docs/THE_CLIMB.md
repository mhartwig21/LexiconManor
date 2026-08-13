# The climb — three ways at the landing, and a cost that comes from walking

**Owner's decisions, 11–12 Aug 2026.** Two changes that are the same idea seen from different
ends, to be built together in one round.

---

## 1. The step economy is geometric, not altitudinal

> *"It shouldn't get more expensive the further you move up... the steps economy is driven by
> needing to double back, etc."*

**Today:** `MOVE_COST_BY_ROW = [-2, -2, -2, -2, -7, -9, -9]` against `BASE_DAY_BUDGET = 18`.
That is an **altitude toll**. It charges the player for doing the thing the game is about, and it
gets steeper exactly where the content is. It is also why the economy reads as punishing: the
premise is "get upstairs" and the ledger fines you for climbing.

**The change:** a move costs a move, wherever you are. Scarcity comes from **distance walked** —
you run low because you went east, hit a dead end, and had to come all the way back.

Three things this fixes at once:

- **Dead ends bite honestly.** Today a seal pays a consolation gem. Under a walked-distance
  economy it costs you the walk you already spent, which is what a dead end should mean.
- **The draft becomes a decision.** The drafting sub-rating has been 3/10 for five rounds and the
  measured dominance rate sits at chance (~67% dominated against a 68.7% permutation null). If
  geometry is the cost then SHAPE is the stake, and the three cards differ in consequence without
  anyone tuning a weight.
- **It is the Blue Prince model** the owner asked for at the pivot, rather than an abstraction
  layered over it.

The grid-true simulator (round 25) makes this verifiable against campaign bands for the first
time. Before it existed, no movement change could move a published number.

### BUILT — round 36. What shipped, and the one thing it could not keep.

`MOVE_COST_BY_ROW` is **−3 on every storey**, and `BASE_DAY_BUDGET` moved **18 → 22** with
it. Nothing else in `engine/economy/steps.ts` was retuned. The budget had to move because
the two constants are one lever and this file has said so since the overhaul: a flat −3 is
1.5× the old ground-floor rate on the storeys where nearly every move happens, and left at
18 the median evening measured **9.9–10.1 minutes across four seeds — under AAA 4.10b's own
10–15 floor**, which is the owner's original "way too easy" fix undone from the other side.
22 is the smallest budget at which the measured evening lands back on what the altitude
table produced; 24 puts it over the ceiling instead.

**The invariant this deletes, and it is the thing to argue with if anything here is wrong:**
`reserveToTop(1) > BASE_DAY_BUDGET` — *"a bare, perfect ascent costs more than the whole day
budget, so the top is always bought with refunds"* — is an ALTITUDE-TOLL inequality. An
evening is a dozen-plus moves and the minimum ascent is five of them, so no honest flat
price can make the staircase dearer than the day. The bare ascent is **15 against 22**.
Re-typing a constant until the inequality came back would have been this project's own
recurring failure committed deliberately, so instead the claim is re-made on an instrument
that could disagree with it: on the grid-true model a refund-less SKIPPER still tops out on
the middle floors and reaches the door on **0.03% of evenings**, and the skilled player
first stands there on **day 16** of a 14–22 band. Round 24 had already found the reason and
written it down — *"the deck's door layouts, not the step table, are what price the top of
the house."*

**Every band that moved is published in AAA 4.10's round-36 block with its cause.** The
headline: the median player's campaign shortened by five or six evenings (door 23–26 → 20–21,
win 25–28 → 21–22) and her 8–14% never-finished tail went to ~0, while the skilled player's
two bands did not need touching. That asymmetry is this section's own claim arriving as a
number — she is modelled at `walkbackPerRow` 0.58 against his 0.36, and the toll was charged
on exactly the storeys she re-walks. **The game got shorter for her and longer for nobody.**

**What got worse, stated rather than absorbed.** The late-campaign evening now inflates
1.26× (his) and 1.23× (hers) against 1.05/1.07, because climbing IS drafting rooms under a
distance economy — so Bramble's tea buys minutes as well as storeys. If that late evening
wants shortening, the lever is `TEA_BY_POINTS`, not the move price.

---

## 1b. A move costs ONE. The owner's correction, 12 Aug — this supersedes the numbers above.

Round 21 shipped a flat cost of **−3 a move against a budget of 22**, and the owner rejected it
on sight, correctly:

> *"Why isn't it just 1 step is −1. Why do you keep coming up with a convoluted economy. What you
> should be modifying is the amount of steps you start with and how many more you can earn and
> the penalties."*

**He is right, and the tell is arithmetic: 22 steps at 3 a move is 7 moves.** The 22 is a fiction
the player has to divide her way out of. Price a move at 1 and the counter *is* the quantity it
measures — "I have twelve moves today" — and the whole economy fits in her head, which is what
cosy asks for.

It also closes the largest unresolved comprehension finding. Both cold testers reported their step
counter moving for reasons they could not account for — three separate times for one of them. You
cannot audit a ledger denominated in an arbitrary unit. You can audit one denominated in moves.

**How this went wrong, so it does not recur:** the flat −3 was chosen to keep EVENING LENGTH
inside its published band. That is tuning a derived quantity through the wrong lever. Evening
length is an OUTPUT of how many moves she gets and what she earns back; it must never again be
steered by re-pricing a move.

### The shape, binding

- **A move costs 1.** Not 2, not 3. This is not a tuning parameter.
- **A day STARTS at 10–14 moves** (owner's number, 12 Aug) — build to ~12 — **and she earns more
  as she goes.** This is the loop, not a budget: a room costs a move to enter, solving it pays
  moves back, so a good session extends itself and a poor one folds early and she dozes off.
  It also puts the word games at the centre of the economy — solving is not rewarded BESIDE the
  exploration, it is the exploration's fuel, which is exactly where the owner has been steering
  since 10 Aug.
  **The guardrail that needs deriving rather than assuming:** what stops a great day being
  endless. The honest ceiling is probably geometric — the manor is 5x7 = 35 cells, the frontier
  closes as it fills, and dead ends cost walks — rather than an arbitrary cap on moves earned.
  Measure it on the grid-true model before reaching for a cap; if a cap IS needed, prefer
  diminishing returns per room kind per day over a hard ceiling, because a hard ceiling is
  another fiction the player has to divide her way out of. Remember the owner's very first
  economy complaint, before any of this: the game was TOO EASY and he reached the Sanctum on day
  one. A day that never ends is that failure wearing a new hat.
- **Earnings are moves.** A solve pays back *moves* — small integers she can feel — not +12
  against a budget of 22. Re-denominate the whole solve wage, keeping the round-22 principle that
  a room is paid for the work it asks for.
- **Penalties are moves.** A mistake costs a move; a bad one costs two. Today a −2 mistake against
  a −3 move is an incoherent ratio — it prices an error at two thirds of a room.
- **If the evening comes out too short or too long, fix the STARTING COUNT or the PAYOUTS.**
  Never the move price.

Everything in section 1 above still holds — scarcity comes from distance walked, and doubling
back is what drains her. This section only fixes the unit it is counted in.

### BUILT — round 42. What shipped, what moved, and the two things that got worse.

**A STEP IS A MOVE.** `MOVE_COST_BY_ROW` is **−1 on every storey**, `BASE_DAY_BUDGET` is **12**,
and every costed mistake at every weight and every tier is **−1**. The counter on the glass is
now the quantity it measures: *twelve moves, and a cup*. The player-facing word stays "steps" —
it is the manor's word, and for the first time it is honest, because one step is one move.

The whole economy is re-denominated with it. Solve payouts are wage-priced as before, at **0.45
moves a minute** (read the other way: *about two and a quarter minutes of honest word game buys
one more move*), with a cozy floor of **+1** — *a solved room always pays back at least the move
it cost to walk into* — and a ceiling that came off the budget and onto the **staircase**:
`BARE_ASCENT_STEPS` is 5, so **the most any single room may pay is one whole climb, a move
leaner every storey: +5 / +4 / +3**. Every payout in the shipped game is now one of {1,2,3,4,5}.
Bramble's pot is **one move a point, 0 → +6**. Refills are +1..+2. A perfect solve is +1.

**THE TWO CONSTANTS THAT ARE NOT KNOBS.** The move price is a ruling and `tests/steps.test.ts`
says so beside it; the starting count is the owner's own 10–14. If a future round finds the
evening too long or too short, the levers are the STARTING COUNT and the PAYOUTS, in his words,
and never the move price. That rule is the whole of why the previous economy was convoluted.

**WHY SO LITTLE MOVED, and it is arithmetic rather than design.** The purse grew 64% in moves
(7.3 → 12) and the campaign barely shifted, because the mistake ruling pushes the other way:
mistakes were 36% of the whole economy at round-36 HEAD and are 45% of it now. A bigger purse
and a dearer error very nearly cancel. It is written down so the next round does not read the
stability as evidence the change was small.

| | before | after |
|---|---|---|
| her evening, median / p90 | 12.2 / 17.5 min, 8 rooms | **13.6 / 17.8 min, 9 rooms** (band 10–15 / ≤23, unmoved) |
| her first DOOR / WIN | 16.5–17 / 19 | **15–16 / 18–19** (bands unmoved) |
| her DEDUCTION | 17 | **16–17** (band unmoved) |
| his first DOOR / WIN | 13–14 / 15–15.5 | **12–13 / 14–15** (bands unmoved) |
| his evening, early → late | 15.2 → 18.8 | **17.1 → 21.1**; band 14–20 → **14–22** |
| ground floor, net per room | −0.75 moves hers | **−0.95 moves** — the floor got DEARER |
| steps in hand, rows 0–2 | 16 of a 26-step purse | **8 of a 13-move purse** |
| wage spread, every room × tier | 7.77× | **4.53×** |
| the bare ascent | 15 of a 22-step budget | **5 of 12** |

**THE GUARDRAIL, DERIVED RATHER THAN ASSUMED — this section asked for it and here it is.**
What stops a great day being endless is **not** a cap on moves earned. Measured on the grid-true
model and gated in `tests/economy-pressure.test.ts`:
1. **ARITHMETIC.** The average room is net NEGATIVE in moves for *every* profile — the median
   player spends 1.50 and earns 0.95, the skilled 1.64 and 0.81, a GREAT day 1.70 and 1.13. So
   solving LENGTHENS an evening and can never SUSTAIN one, and the gap is widest for the player
   who doubles back most, which is where §1 says scarcity should come from.
2. **GEOMETRY.** 31 draftable cells, and a frontier that closes as it fills. Over 6,000
   simulated evenings across four profiles **not one ended `filled`**, and 8–20% ended
   `stranded` — the house shut with moves still in her hand.
A hard ceiling was not needed and was not added: it would be one more fiction to divide out of.

**WHAT GOT WORSE, PUBLISHED RATHER THAN ABSORBED.**
1. **A coarse unit ties the draft.** `isDominated` reads what a card pays, and FOUR of the seven
   shipped rooms now pay +1 at tier 1 — so offers TIE on the wage axis far more often and a tie
   is a weak win. The dominance ratchet rose for the first time in its life, **0.41 → 0.42**
   (measured 41.3%), and one of 4.10h's four wage spreads rose with it, **1.43× → 1.71×** (the
   Darkroom is 3.0 minutes at tier 1 and 3.5 at tier 2 — a 17% difference in length that rounds
   to a 100% difference in pay). **Neither is fixable with a wage; both are fixable with
   CONTENT** — a wage table needs more distinct room LENGTHS in it — and they should be paid off
   together by a word-game round.
2. **His late-campaign evening is 21.1 minutes**, and 9.7% of them now end on his own appetite
   clock rather than on an empty ledger (5.5% before). 4.10f's late p90 is retired because of it:
   it measured 28.0 against a `sessionMinutes` of 28, i.e. it had started reading the clock
   rather than the game. What replaces it is the median and the early-night share itself.
3. **Four green cards became two.** The Kitchen and the Larder now pay the same, and so do the
   Boot Room and the Still Room: +6/+5/+3/+2 steps is 2/1.67/1/0.67 moves, and there are two
   integers in that range.

**AND TWO THINGS THE UNIT NEARLY BROKE, both caught by tests rather than by a reviewer.**
`stageSteps` paid `floor(total × fraction)`, so with the Library's whole payout at +2 the first
thread she wove banked **nothing** — REVIEW_AA §6's original complaint, reintroduced by a change
of unit. It pays at least one move for a rung climbed and keeps one for the summit now. Fixing
that exposed the second: `app/slices/room.ts` reconstructed the ladder's receipt as
`floor(total × ladderEarned)` in two places — its own second opinion about `stageSteps` — and the
moment the two disagreed a room paid MORE than `solvePayout`. There is one of that number now
(`stagePaidAt`). Twelve player-facing strings also said `${n} steps` and were right by accident
until the singular became the commonest number in the ledger; `stepWords` owns the plural and
`tests/notice-copy.test.ts` walks the tree for "1 steps".

---

## 1c. A study buys back your step in — round 44, from owner play

**THE OWNER, FROM PLAY:** *"For the gallery, for the words that aren't part of the gallery, it was
confusing what their purpose was. It didn't automatically add steps."* Two blind testers in
`docs/COMPREHENSION.md` reached the same belief before him — *only the five pre-chosen words
count* — which is exactly the belief round 28's two-class board was built to kill. He traced a real
word on a legal path and waited for the economy to answer. It answered with a score point, which is
not a unit he spends.

### The finding, which is not the copy

**The one sentence saying what a study was for has never been on the glass at 375x667.** It lived
in `rules.studies`, rendered into `.anch__flavour`, and `anchor.css` carries
`@media (max-height: 700px) { .anch__flavour { display: none } }` — the decorative reserve a short
screen gives up. 667 is under 700. Round 28 wrote the sentence, round 34 wrote a caption and a mark
to reinforce it, and on the phone this game is judged on the sentence was **deleted**, while both
rounds certified it by reading the string the engine returns. That is failure mode 4 of
`docs/STATUS.md` §3, verbatim: authored copy shipped invisible behind a media query.

### The ruling

**A STUDY HANDS BACK THE MOVE SHE SPENT WALKING IN. ONCE A BOARD.** It pays in moves, the one unit
the game counts in. It does **not** open the door — the exhibition still opens on `targetCount`
works and nothing else, so round 26's defect (five common words ending a room) stays shut. And the
clause that says so rides `rules.line`, which is never hidden in any viewport, and states its own
bound rather than carrying a count: *"a study buys back your step in"* can only happen once,
because there was only ever one step in, so the sentence stays true on the second study without the
word "first" in it.

### Why it is a REFUND and not a wage — the number that settled it

**The Gallery is already the joint top of the house's wage table.** `solvePayout` pays it 1 move
for 1.25 honest minutes at tier 1 — **0.80 moves a minute**, against 0.176 at the bottom (sudoku
t3), which is the **4.53x** spread AAA 4.10h publishes as a ratchet that may fall and may never
rise. It is at the top because `SOLVE_WAGE.floor` catches it: 0.45 x 1.25 is 0.56 of a move and the
ledger has no coin smaller than 1. So there is no room above it to pay a study a wage out of:

- priced honestly at the house rate a study is worth **0.11 of a move** — nine studies to the move
  at tiers 1-2, five at tier 3 — and nine is not a number that answers a woman who has traced one
  word;
- priced at the ledger's smallest coin, a solved tier-1 Gallery plus four studies earns 5 moves for
  2.25 minutes: **2.22 moves a minute, and the published spread goes 4.53x → 12.6x.**

A wage prices WORK; a refund un-charges a COST. The ledger has always known the difference
(`stepsSpent` / `stepsRefunded`), and `SOLVE_WAGE.floor` already says the cozy version of it in this
unit — *a solved room always pays back at least the move it cost to walk into*. This is that
sentence moved off the solve and onto the honest word. **`solvePayout` is untouched, so not one
number in 4.10h's wage table moves.**

### BUILT — round 44. What shipped, what it cost, and what it found.

`STUDY_REFUND` (steps.ts) + a `refund` RoomEvent + `StepReason` `'study'`, so the candle's float
says the word **"study"** beside the **+1** — the price tag `ui/chrome/step-reasons.ts` exists for.
The adapter asks once a board; **the ledger is what answers** (`app/slices/room.ts` reads the
`'study'` entries already stamped with the room's key), so a board cannot pay twice by being left
and come back to.

**WHAT IT COSTS, measured over 4,800 evenings a profile on the grid-true model: 1.04 moves a day
for the median player** — she meets about one Gallery an evening and traces a real word in it. One
move a day is one more room on the evenings that have the tea to spend it, and **three published
bands moved for it, all in the same direction, all republished with this cause:**

| band | was | now | why |
|---|---|---|---|
| 4.10f her LATE evening median | ≤ 18 (17.0) | **≤ 19** (18.51) | one more room on a full evening. Her EARLY median (14.6) and her p90 (22.9 ≤ 23) did not move, and they are the guard |
| 4.10g her sealed-overnight share | < 0.45 (36.5%) | **< 0.48** (47.3%) | a room drafted later is a violet page with no solve left after it |
| 4.10g her violet-met share | < 0.55 (50.3%) | **< 0.56** (55.3%) | ten rooms an evening rather than nine, at the same violet share of the same deck |
| 4.10g HIS violet-met share | < 0.85 | **< 0.86** (85.8%) | the same, upstairs, where violet is densest. The SPLIT — his against hers — is unmoved, and it is what the clause is about |
| 4.10g her overnight rate (`volume-pacing`) | 10–45% (36.5%) | **10–50%** (48.2%) | the same one move a day, measured by the volume's own instrument |

If a later round wants the 18 back, **the lever is the day's starting count** — the owner's own,
§1b — never the price of a move and never this mechanic's reach.

**AND THE COMMISSION IT UNCOVERED, measured every run so it cannot go stale.** Pricing a study
meant modelling one, and modelling one exposed that `engine/economy/simulate.ts` **has been
charging the Gallery for wrong words since round 28 that the room does not charge**: an off-ask
trace has emitted no mistake event for sixteen rounds, and at tier 1 the Gallery cannot charge a
costed mistake at all (there is no centre rule to break). `SimProfile.studyRelief` is the share of
them a run forgives — **0 in everything the game ships, 1 is the truth** — and
`tests/economy-effort.test.ts` runs both every time: forgiving them puts the median evening at
**~16 minutes against 4.10b's published 10-15**, which is **more than twice what round 44's own
mechanic costs.** Paying that off means moving the day's starting count. That is an economy round,
not a word-game one, and it is the largest open number in this document.

---

## 1d. The ledger got legible, and then the arithmetic was wrong — round 45

Round 42's whole gift was a day the player can audit: a move costs 1, so the counter *is* the
quantity it measures. The cold read that followed proves it landed — all three strangers derived
"a move costs 1" unaided — and it cost exactly what a legible ledger costs. **They did the sum.
All three got the same wrong answer, and two of the three named it as the reason they would stop
playing.**

### The dawn cup was counted twice

The candle reads **13** at dawn: twelve moves and Bramble's cup (`BASE_DAY_BUDGET` +
`TEA_POUR.dawnCup`). The night digest's *"Steps given back"* was `stepsRefunded` — **every**
positive entry — so the cup was inside the starting figure AND printed again as something the day
handed back. Add it up her way and the day comes out over by exactly the morning's grants.

The fix is at the source, not in the digest. Every grant ledgered before she walks out — the cup,
day 1's welcome pot, what yesterday left steeping, and a shared morning's top-up — is stamped
`TEA_POUR.dawnKey`, and two numbers are derived from that stamp rather than from a reason word:

- **`dayStartTotal`** = budget + dawn grants. It used to count EVERY `'tea'` entry, including the
  pot Bramble carries up to the second landing mid-evening — so the burn-down's denominator grew
  halfway through the day and **the wick got taller after a gift**, which is the one thing a
  burn-down may never do. Nobody had noticed; it fell out of writing the stamp down.
- **`stepsGivenBack`** = `stepsRefunded` − dawn grants. `stepsRefunded` is unchanged and stays
  unchanged: it is one half of the ledger identity `total = budget + refunded − spent`, which
  `tests/economy-simulation.test.ts` pins, and it is the right number for the model and the wrong
  number to print.

**The band that moves, with its reason:** the night digest's *Steps given back* falls by the day's
dawn grants — **1 on a normal evening** (the cup), 1 on day 1 (the welcome pot), more only on a
morning she shares tea. On a day that gave nothing else back the row now reads 0 and is suppressed,
which is the cozy rule already in force ("a quiet day says less"). `DayRecord.stepsRefunded` is
renamed `stepsGivenBack` and the old field is kept read-only for nights banked before this round —
there is nothing honest to migrate an over-count to.

What it buys is an identity, and it is the one the player performs:

> **`dayStartTotal` − `stepsSpent` + `stepsGivenBack` === `ledgerTotal`**

### Five rooms were printing the pre-round-42 price

`const stepCost = tier === 3 ? 3 : 2` survived round 42 in `WordWebView`, `CrosswordView`,
`SudokuView`, `ForgottenWordView` and `CipherView`. The Library printed *"Two of these share a
thread. · −2 steps"* in red beside a ledger entry of −1 — a blind tester tested it three times on
purpose and logged the contradiction — and the Counting House's `figureCost = claimCost * 2`
printed **−6 on a button** at tier 3 against a charge of 1. A stale toast teaches a false rule; a
stale button asks her to decide on a lie. Every one now reads `STEP_TABLE.mistake` / `.hint` at the
weight its adapter actually emits, which is the pattern `TwistleView` has used since round 44.

The draft footer was the same defect with the sign filed off: **`Step back · 1 step` charged
nothing**, because the walk to the door is ledgered when the offer OPENS (AAA 4.6's two-part walk).
The price is gone from the button; the door-step is unchanged.

### The gate, and why it cannot pass by construction

`tests/round45-prices-live.mjs` (`npm run test:prices`) drives all seven rooms and the draft on a
real phone-sized Edge, and every verdict is **one painted string against another painted string**:
it reads the price off the glass, taps the control with a real pointer, and reads how far the
CANDLE'S OWN NUMERAL moved. It never asks the store what it charged — the store is where both
halves of a mispriced control agree, and a check that recomputes the price from the table the view
reads can never catch a view that disagrees with the engine. The control scan is generic: any
visible enabled button whose painted text carries a `−N`, so a room that grows a new priced button
is gated the day it ships one.

**Proved red before it was fixed:** on round 44's tree it reported **12 findings at 375×667** —
every item above, including `Consult · −6 steps` against a charge of 1 and `13 − 1 + 2 = 14`
against a candle showing 13. `--prove` puts both shipped forms back into the running app and holds
at 26/26 printed prices and 2/2 day sums red.

*(One thing the gate caught about itself, worth keeping: its first price reader looked only for
U+2212, so it read `Step back · 1 step` — a control that charges nothing — as "unpriced" and passed
it. The house prices things two ways, and a gate that knows only one of them agrees with the bug.)*

---

## 1e. The card was printing the one number where the rooms are least comparable — round 46

> **⚠ OVERRULED BY THE OWNER, 13 AUG. THE CLAUSE THIS SECTION SHIPPED IS DELETED — see §1g.**
> Everything below is kept because the diagnosis is still right and the measurement is still
> the baseline: what a draft card compares, and what it cost the Gallery. Only the ANSWER
> changed, and the reason it changed is a design principle rather than a bug.

**THE OWNER, off the cold read of 12 Aug:** *"NOT ONE OF THREE BLIND PLAYERS ENTERED A
GALLERY."* Two were offered one and declined. The grader named the cause and it is not the
Gallery: **the card advertises +1 beside cards advertising +5.** Three consecutive rounds of
Gallery craft — the accept-list (19,000 refusals down to 534), the grid, the studies — were
invisible to a stranger because nobody chose the room.

Round 42's re-denomination was right and the owner asked for it, and this is what it cost.
**The payout is CORRECT and stays correct**: a room is paid for the work it asks for (§1b,
round 22), and that principle is not up for renegotiation. **So the lever is the CARD.**

### What a draft card was actually comparing

A utility room hands over a number and asks nothing. A word room asks a few minutes of thought
and hands over that number **plus a page of the book the whole game is about**. The card
printed the first and stayed silent on the second, so a player choosing on the printed number
was choosing correctly given what she was told, and what she was told was not the truth about
the room.

**A page is also `docs/COMPREHENSION.md`'s only [blocker] blind spot** — *"what solving a word
game gives you toward the mystery… This is the mystery's main supply line and no player learned
it"* — and the draft card is the one surface where learning it changes a decision rather than a
recital.

### BUILT — the clause, and the rule that keeps it honest

A puzzle card now prints **`+1 page`** between its steps and its keys, and it is a LIVE claim,
not a boast. `engine/volume.solveChannelPage` is one decision with two callers: the store's
`pageOnSolve` asks it for the card, and `collectFragmentForSolve` is paid out of it. So the
clause appears exactly when the page would land and goes quiet otherwise — round 45's rule
(*"no room may PRINT a number the ledger does not CHARGE"*) in the mystery's own currency, and
`tests/journal.test.ts` holds the claim against the PAYMENT rather than against the predicate,
by solving the rooms and counting what the volume gained.

It is per KIND, and that matters: **the Study carries a channel of its own.** On an evening
that has already filed a lintel engraving, the Study card still promises a page and the Library
card does not — a real difference between two cards in the same offer, in the currency the
game is about.

### The measurement, and the number it is gated on

`tests/word-room-face.test.ts` models the offer the way a player reads it: it composes the card
face out of the shipped renderers and counts every `+N` clause on it, and asks the owner's own
question. **`outbid` — of the offers where a word room sits beside at least one card that ASKS
NOTHING of her (utility, parlor, mystery), the share where some word room is outbid on its face
by every one of them.**

| | round 45 | round 46 |
|---|---|---|
| **word room outbid by every ask-nothing card** | 11.3% | **7.5%** (gate 0.08) |
| …where the page clause is PRINTED | — | **0.0%** |
| …where it is not | — | 9.5% |
| word room bottom against ALL rivals, word rooms included | 21.6% | 18.8% |
| a word room prints the strictly lowest STEP figure | 19.7% | **19.7% — unmoved, and that is the point** |

**The last row is the guard.** The wage is locked, so the +1 is still a +1 and the share of
offers where a word room prints the lowest number is identical to the offer. What the round
buys is that the +1 is no longer the whole of what the card says.

**AND THE RESIDUE IS THE VALVE, NOT THE CARD.** Where the clause is printed the event does not
happen at all; all of what is left is that a page is filed once per channel per day, so after
the evening's engraving lands every ordinary word room's card says what it said in round 45.
**The next lever is named and it is not a card change:** `creditSolve` also pays
`decipherYield(tier)` — 1 / 2 / 3 SEALED pages made out, on every solve, unvalved — and the
card is silent about it. That clause would be true all evening and would scale with the storey.
It needs a second live predicate and a second clause on a stake line that already wraps at
375×667, so it is a round of its own.

---

## 1f. The Darkroom's clock, and a commission that turned out to be void — round 46

Round 42 published two things as one debt: the dominance ratchet rose (0.41 → 0.42) and one of
4.10h's four wage spreads rose with it (1.43× → 1.71×), and it named a single fix for both —
*"the wage table needs more DISTINCT values in it, which is a fact about how long the rooms
are."* `docs/STATUS.md` carried it as the top open item. Half of it was right.

### The half that was right: the Darkroom was never clocked

`ROOM_EFFORT.cipher` was `[3.0, 3.5, 4.0]` and it was **the only row in the table with no
derivation behind it and no pin under it** — its whole account was one line with no tier in it.
Measured against the room the generator actually ships, that row priced a **no-crib** cryptogram
at 33% above one that hands over an `A` and three high-frequency letters. It is round 27's
sudoku defect exactly: a difficulty lever the clock did not follow.

`docs/BENCHMARKS.md` §11 is the teardown that did not exist (the Darkroom is one of two rooms
this repo grades and it had nothing to grade against). Its finding: **a cryptogram's clock is
the OPENING, not the letters** — once three or four letters stand, word shape does the rest. So
the row is two terms, `opening(crib class) + letters to deduce × 12.5 s`, and the openings run
**55 s / 120 s / 167 s** against a crib ladder of *a one-letter word and three high-frequency
letters* → *a two-letter word and one mid-frequency letter* → *nothing at all*.

**`ROOM_EFFORT.cipher` is `[3.0, 4.5, 5.5]`.** Tier 1 did not move, and not because it was
right: `KEY_SUPPLY.workKeyMinutes` is 3.0 and the Darkroom sits exactly on it, so a downward
re-derivation deletes a ground-floor key source by side effect — measured at 2.25 minutes the
round-10 directive inverts (11,426 solve-keys against 18,640 off the deck) and three published
bands move. That is an economy round's change and this was a word-game one.

**What moved, and what did not.** Not one payout: 0.45 × 4.5 and 0.45 × 5.5 both round to the
**+2** the room already paid, so no card face changes its number and no ledger band moves.

| band | was | now | why |
|---|---|---|---|
| 4.10h wage spread, tier-1/2 ≥2 min minus the Counting House | 1.71× | **1.36×** | both ends of that ratio were the Darkroom. Back under the 1.43× it stood at before round 42 |
| 4.10h, the other three populations | 4.53× / 2.60× / 2.40× | **unmoved** | the Darkroom is at neither end of any of them |
| every campaign and evening band | — | **unmoved** | the row moves the CLOCK by a minute and a half at two tiers and the PRICE not at all |

**AND THE DEBT IT GROWS, published rather than absorbed.** `LADDER_MINUTES` is 4 and the
Darkroom has no ladder — `cipher-adapter.ts` emits one progress event in the whole room. At tier
3 it was **already** over the line at 4.0 and nothing in this repo said so; tier 2 now is too.
`tests/economy-effort.test.ts` pins the list of unstaged long rooms so it is bounded, and the
seam that pays it is the adapter broadcasting how much of the print has developed.

**A content debt the teardown found on the way:** `tierOf` is two gates and a REMAINDER, so
**13 of the 44 shipped tier-2 boards carry no crib word at all** — a tier-3 opening on a
tier-2 card. The row is the median board's, which is what `ROOM_EFFORT` is defined to be, and
BENCHMARKS §11 carries the fix (a third gate in the generator, and a pool regeneration).

### The half that was wrong: room lengths cannot pay the dominance ratchet

The diagnosis was reasoned, never measured. `tests/draft-dominance.test.ts` now refutes it with
two instruments, neither of which is the one that wrote the claim:

1. **THE ORACLE.** Force the widest payout spread the shipped ceiling permits — honesty
   ignored — and the dominance rate gets **WORSE**: 41.7% / 41.0% → **43.0% / 44.2%**.
   Spreading the wage axis manufactures STRICT winners, and a strict winner dominates whenever
   it also leads on frontier.
2. **THE PIGEONHOLE.** At tier 3 the payout is clamped to `[floor, capByTier[2]]` = **[1, 3]**.
   Seven rooms into three integers: at least three tie at every tier-3 door, at every possible
   value of `ROOM_EFFORT`.

**So no later round should spend itself on room lengths for that number.** If the ratchet is to
fall, the levers are the ones round 40 already named — within-category plan spread in the deck —
or the payout ceiling itself, which is an owner-facing economy decision.

*(One more thing, corrected because it is repeated in three documents and in four comments and
it is wrong: **FOUR of the seven shipped rooms pay +1 at tier 1**, not five. Twistle,
forgotten-word, cipher and crossword. The Word Web pays +2.)*

---

## 1g. The card may state a PRICE and may not state a VALUE — round 49, the owner's ruling

**THE OWNER, 13 AUGUST, overruling round 46 five hours after it landed:**

> *"I think we want to keep true to Blue Prince where certain clues about the benefits of rooms
>  aren't immediately apparent. Saying +1 page feeds everything to the player. But when a page
>  is revealed, the player has to be able to figure out — oh, this room provided me a page!"*

Round 46 was well built and it measured well: `+1 page` was a LIVE claim (one predicate, asked
by the card and paid by the solve), and a word room outbid on its face by every card that asks
nothing of her fell **11.3% → 7.5%**, and to **0.0%** wherever the clause printed. None of that
is disputed. What it did was hand the player the rule that drafting a puzzle room feeds the
mystery, before she had ever drafted one — and the pleasure of the game it is modelled on is
largely the rules you deduce.

### The line, because it is not "say less"

This ruling is not a retreat from rounds 42–45, and reading it as one would undo them. Those
rounds were about a player who could not audit her own step counter, and they were right.

- **STATED, ALWAYS — PRICES AND RULES OF PLAY.** What a move costs. What a wrong guess costs.
  What a solve pays back. How long the room asks for. Which doors the plan leaves her (the
  door-plan line is an owner ruling and stays). A player who cannot audit her own counter is
  being cheated, and no clause of this ruling touches any of that.
- **NEVER STATED — WHAT A ROOM IS WORTH TO THE MYSTERY.** That is the discovery the game is
  made of. It is learned by drafting the room, using it, and noticing what happened.

The two are not the same axis and the round-46 clause was on the wrong one.

### What that obliges, and it is the harder half

If the card does not say it, the MOMENT OF REWARD must show it — and the moment of reward could
not, because **neither the seal nor the journal named a room.** That is why
`docs/COMPREHENSION.md`'s only [blocker] blind spot is the one it is: a reward whose cause is
anonymous teaches nothing however often it lands. So a page now remembers which room produced
it, and says so twice:

| Event | On the glass, as it lands | In the journal, afterwards |
|---|---|---|
| A word room's solve files its channel page | *"The Long Gallery gives up an engraving"* | *"Taken out of the Long Gallery."* |
| A violet room hands over a torn leaf | *"The Archive gives up a rubbing, not yet made out"* | *"A torn leaf out of the Archive, not yet made out."* |
| A solve makes the sealed backlog out | *"The Darkroom makes out two pages"* | *"Taken out of the Archive, made out in the Darkroom."* |

Three rooms, three different lessons, and not one of them is stated as a rule. The room is the
SUBJECT of the sentence and the first words on the card, because that is the instant her eye is
on it. Two write-once flag families carry it (`from-`, `readby-` — `docs/flags.md`), because a
leaf carried out of one room and made out in another has two rooms in its history and crediting
either for the other's work would teach her the opposite of how the game works.

**Attributed per CARD, never per KIND.** The Gallery and the Long Gallery are one puzzle kind and
two rooms. A seal reading "the Gallery" over a Long Gallery would be the right kind and the
wrong room, and would teach her to draft the wrong card.

**Nothing is invented.** Testimony spoken in a parlor, a letter's enclosure, and every page in a
save written before this round record no room and print no line. The temptation to fill the gap
from the authored `source` field is exactly the trap: *"Carved on the Gallery lintel"* is where
the writing IS in the house, not where she got it, and a player who solved the Library was
already reading the first as if it were the second.

### The band that moved, and it moved UP on purpose

**`WORD_ROOM_FACE_GATE.outbid` (0.08) IS RETIRED, NOT RE-TUNED.** Under this ruling the number
it counts should RISE — a card that says less loses to a card that says +5 — so tightening it
would fail the build for obeying the owner and loosening it to fit would be the quiet re-tune
this repo calls its most common self-deception. `tests/word-room-face.test.ts` keeps the
INSTRUMENT and prints `outbid` / `faceBottom` / `lowestSteps` over the same 900 evenings on
every run, so the next round to touch the draft face argues with a measured baseline instead of
a memory. What it GATES now is the ruling itself: no card prints a page clause, at any tier, in
any offer — a gate that would have been red on the commit immediately before this one.

**The replacement gate is `npm run gate:attribution`** (`tests/round49-attribution-live.mjs`):
real input at 375×667 and 390×844, verdicts on PAINTED strings, and `--prove` re-runs every
scenario through the pre-round-49 call shape so all ten attribution checks go red on the build
this round replaced. What it cannot gate — whether a stranger assembles the rule — is the cold
read's question, and COMPREHENSION now names the question to ask her.

---

## 1h. Three rooms had a clock nobody had ever derived — round 50

**THE COMMISSION THIS ROUND WAS GIVEN, and the first honest thing to say about it is that
half of it was already settled and the other half was already proved void.** The brief was
round 42's: five of seven rooms pay +1 at tier 1, the draft ties on the axis that decides
whether a choice is real, and a wage spread rose with it — *"what fixes both is MORE DISTINCT
ROOM LENGTHS in `ROOM_EFFORT`."*

- **The wage spread was paid in round 46** (1.71× → 1.36×, the Darkroom's row derived for the
  first time), and it is FOUR of seven rooms at tier 1, not five (§1f).
- **The dominance ratchet cannot be paid with room lengths, and round 46 proved it twice** —
  an ORACLE forcing the widest payout spread the ceiling allows makes it WORSE (41.7/41.0% →
  43.0/44.2%), and at tier 3 seven rooms are clamped into three integers, so ties are forced
  by pigeonhole at *every possible value of `ROOM_EFFORT`*. That proof stands, this round did
  not relitigate it, and **no later round should spend itself on room lengths for that
  number.** The levers named there are the deck's plan spread and the payout CEILING.

**What was still open, and it is the craft half, was that the table had rows with nothing
under them.** Round 46 wrote that the Darkroom was *"the only row in the effort table with no
derivation behind it and no pin under it."* That was true of the only row with no derivation
**and a wrong shape**. Three more had a plausible shape and no derivation at all, and one of
them was flat.

### What was actually wrong with each, measured

| room | row | what its whole account said | what the pool says |
|---|---|---|---|
| **the Library** | `[4.5, 5.0, 6.0]` | *"16 tiles, 4 groups, 1 ambiguous, 1 herring"* — no tier in it | the graded number (contested tiles) is **flat at 2** across tiers; the tier lever is **plain categories 3 / 2 / 1** |
| **the Linen Closet** | `[1.25, 1.5, 2.0]` | *"4×4, 3 entries, 11 letters — ~75 s"*, written before the room had a hem | per CLUED ANSWER the row ran **18.8 / 18.0 / 24.0 s — backwards at tier 2** |
| **the Study** | `[1.5, 1.5, 1.5]` | *"read three authored definitions, name a word"* | median corpus rank **25,286 / 81,158 / 219,760**, and **15 of 43** tier-3 words absent from a 333,333-word corpus |

**THE STUDY IS THE ONE THAT MATTERS.** A flat row is a claim that a tier costs nothing, and it
was made about a room whose three tiers differ in four ways at once — the headword's rarity,
the register in the headline, the letters standing, and the rope. Fifteen of its forty-three
tier-3 words do not occur in a third of a million words of English. That is not a 1.5-minute
room, and nothing in the repo had ever said so because **the Study had no teardown at all** —
`docs/STATUS.md` §7 has carried *"if yours is missing, write it before you build"* for four
rounds, and round 46 wrote the Darkroom's and left this one. `docs/BENCHMARKS.md` §12 is it,
and its first finding is the one `LINEN_CLOSET.md` told us to make explicit: **this room has NO
NYT twin.** Wordle and the cryptic definition BOUND it and neither is it, and the difference is
load-bearing — Wordle restricts its answers to ordinary vocabulary *because* letter feedback
alone cannot make a rare word fair, and the Study does the opposite and pays for it in gloss
and crib.

### The rows, and the one payout that moves

| room | was | now | model |
|---|---|---|---|
| `word-web` | 4.5 / 5.0 / 6.0 | **4.5 / 5.25 / 6.0** | plain × 56.25 s + worked × 101.25 s |
| `crossword` | 1.25 / 1.5 / 2.0 | **1.25 / 1.75 / 2.25** | clued answers × 18.75 / 21 / 27 s |
| `forgotten-word` | 1.5 / 1.5 / 1.5 | **1.5 / 2.25 / 3.5** | read + candidates × 50 s |

**Two of the three tier-1 numbers did not move, and that is the check rather than the result.**
The model reproduces the Linen Closet's 1.25 and the Study's 1.5 from content facts that had
nothing to do with how those numbers were originally chosen.

**A TIER-3 STUDY PAYS +2 RATHER THAN +1.** It is the only payout `ROOM_EFFORT` has moved since
round 27, it is an OUTPUT of the derivation, and the row publishes the rounding edge it sits
0.16 minutes above so the next round to touch it knows what it would be crossing. **No other
payout moves and no wage spread moves** — 4.53× / 2.60× / 2.40× / 1.36×, all four unchanged,
because every wage that moved is interior to every population it is in.

### What it did to the evening, and to every band — measured, not asserted

**The game did not get longer.** The decent evening measures **14.53 → 14.61** minutes on the
suite's own fixture (band 10–15, unmoved) and 14.58 / 14.52 / 14.57 / 14.50 across its four
seeds against 14.59 / 14.63 / 14.54 / 14.63 before — flat, or slightly shorter. Her campaign
door and win, his door and win, the room count, the refunds, `volume-pacing`, the ground-floor
drain and the whole of `economy-pressure` are unmoved. The Study is `tierRange: [3, 3]` and
rare, so the largest re-clock in the round costs the evening almost nothing.

**TWO BANDS DID MOVE, AND NEITHER MOVED BECAUSE OF THIS ROUND'S CONTENT.** Both were
`ceil(measured)` ceilings with less headroom than the granularity of the only lever allowed to
move them — round 48's own rule, in two clauses round 48 did not reach — and this re-clock is
what made them visible rather than what broke them:

| band | headroom at round-49 HEAD | now | what replaced it |
|---|---|---|---|
| 4.10f his campaign evening ≤ **22** | measured **21.824 — eleven seconds** | measured 22.009 | re-published **14–24**: the measurement plus one move a day (1.5 min, round 44), rounded up |
| 4.10b bare first evening **< 13** | measured **12.991 — half a second**, and RED against its own note (*"the lower half of the 10–15 window"* is ≤ 12.5) | — | **RETIRED, not widened.** What replaced it is the claim the note argues: `FIRST_MORNING_POT` is one move and it is worth **1.14 minutes** of first evening, gated two-sided at 0.7–2.5 |

The neighbouring *"the median is not the cap either, with room to spare"* moved with the first
for the identical reason — `sessionMinutes − 5` left 1.18 minutes of "spare" against a 1.5-minute
lever — and reads `sessionMinutes − 4` now.

### The rule this round is worth remembering for

**A room's difficulty GRADE and a room's CLOCK are not the same measurement, and the Library is
the clean example.** Its headline figure is contested tiles, it is the number three rounds of
craft were spent on, and it is a median 2 at every tier *by design* — so a clock built on the
graded number could not have had a tier in it. The clock had to be built on a different, duller
fact (how many threads read straight off the tiles: 3 / 2 / 1). Reaching for the graded number
would have produced a flat row and a derivation that looked rigorous, which is exactly what the
Study already had.

---

## 2. The landing is three cells, not one

**Today** the manor is 5x7. `SANCTUM_CELL` is `{col: 2, row: 6}` — dead centre, top. The landing
is `SANCTUM_DOOR_CELL`, defined as exactly one cell at `{col: 2, row: 5}`, and
`opensOntoSanctum(doors, cell)` requires `sameCell(cell, SANCTUM_DOOR_CELL) && doors.includes('N')`.

**Every campaign in the game funnels through one square.** Consequences, all observed:

- A bad draft at that square is checkmate. A cold tester's run ended at a door where all three
  offered cards sealed and he had no gem to reroll; he read it as arbitrary, and he was right to.
- There is no route variety in the thing the whole game climbs toward.
- **The approach already matters and nobody can see it.** Rooms rotate to face the direction you
  enter from (`resolveDoors(card, entryDir, manor, cell)`), so arriving at the landing from the
  south, the east or the west changes WHICH of the three offered cards can open north. That is a
  real decision, in the engine, today — surfaced nowhere.

**The change:** make the landing a row of cells beneath the Sanctum — any of which can open north
onto it. The climax gains genuine route variety, the last hop stops being a single funnel, and
"which way do I come at it" becomes a decision worthy of the ending.

It also completes change 1: with one landing cell, three sealed cards is the end of a two-week
campaign. With three, it is a **detour** — which costs steps, which is exactly the doubling-back
economy the owner described.

### BUILT — round 37. What shipped, what moved, and the one thing that got worse.

**THE SANCTUM IS THREE CELLS WIDE.** For a cell at (1,5) to open north *onto the Sanctum*, the
Sanctum has to BE at (1,6) — so the sealed chamber fills the middle three cells of the top storey,
(1,6)–(3,6), and shows three sealed south doors. The landing is the three cells beneath them and
**any of them can open north**: `opensOntoSanctum` is now `isSanctumLanding(cell) && doors.includes('N')`,
and `atSanctumDoor` is that predicate asked of the cell she is standing on. `SANCTUM_DOOR_CELL` was
DELETED rather than redefined — a constant named "the door cell" that means "the middle one of
three" is this project's own standing failure, so every one of its ~40 call sites was moved to
`SANCTUM_LANDING_CELLS` / `isSanctumLanding` / `SANCTUM_LANDING_MID`. (0,6) and (4,6) stay
draftable: 31 draftable cells, not 33.

The three seals are three `PlacedRoom` records with **one south door each and no doors between
them**, which is load-bearing: give them E/W doors and the grid-true walker's BFS would path
*through* the ending and come out on the next landing cell. `canMoveTo` now refuses a Sanctum cell
outright — the blueprint had always declined to draw that walk, and with three chambers there were
three matched door pairs a caller could have stepped through into the ending.

**THE BANDS MOVED, THREE EVENINGS EACH, AND THE DEDUCTION BAND DID NOT.** Measured on
`scripts/review-metrics.ts` immediately before and after, 800 campaigns a profile:

| | before | after |
|---|---|---|
| his first DOOR | 16 | **13–14** (band 14–22 → 11–19) |
| his volume WIN | 16.5–17 | **15–15.5** |
| her first DOOR | 20 | **16.5–17** (band 17–25 → 14–22) |
| her volume WIN | 22 | **19** (band 18–26 → 16–24) |
| her DEDUCTION | 17 | **17** ← unmoved |
| her never-finished | 0–0.4% | **0.0%** |
| her win inside 28 evenings | 86–91.6% | **98–100%** |
| first LANDING (his / hers) | 8–10 / 10–12 | 8–9 / 10–11 |

The deduction band holding still is the check on the whole claim: she reads him at exactly the
same speed, and every evening this hands back is an evening she used to spend waiting on one
square. The landing day barely moving is round 24's finding arriving as a number — **the storey
was never the gate.** `engine/economy/steps.ts` was not retuned by a single constant to absorb
any of it; the note it left for this round said so in advance, on purpose.

**WHAT GOT WORSE, PUBLISHED RATHER THAN ABSORBED.** His day-1 door rate **tripled, 0–0.5% →
0.5–1.5%** — three ways up on the last hop is three rolls at it, and "I reached the Forgotten
Word on my first day" is the owner playtest behind 4.10d. It is still five times under the
enforced <8% and it is the number to watch if the landing is ever widened again.

**A SECONDARY CAUSE, NAMED SO IT IS NOT MISTAKEN FOR THE LANDING.** `MOVEMENT.sanctumColumnPull`
used to pull toward one column; it reads `sanctumColumnDrift` now, which is 0 across all three
landing columns. So a climb aimed at the top of the house stops paying a preference tax for being
one column off centre, and her steps in hand entering the first padlocked storey rose 14 → 15.

**THE APPROACH — SAID OUT LOUD, ONCE, AS A RULE OF PLAY.** The rotation already made the approach
matter and nothing surfaced it. The draft modal now merges its two header rules into one sentence
**at the landing only** — *"Each plan turns to the south wall at your feet. Only one that opens
north reaches the sealed door."* At every other door those are two facts; at this one, since the
landing can be entered from the south, the east or the west, they are one fact with two halves.
It states the RULE and stops: it does not say which approach is better, and it does not say that
walking one cell along the landing deals a different offer. Those are hers to find.

**THE OVERFLOW: 69px → 27px at 375x667 and 79px → 31px at 390x844.** That merge is worth 42px and
48px. What is left is now **smaller than the three per-card "opens onto / turns its back on"
stamps (56px)**, so the entire residue is round 13's rule that every card prints its own answer —
and the owner has frozen the door-plan line those stamps sit beside. **It is his call, and the
glass gate still owns the number.** The two options on the table are unchanged: fold the stamp
into the plan line (blocked by the ruling) or print the answer once instead of three times
(contradicts round 13's "a card that says nothing beside two that do reads as a rendering gap").

**TWO CONSEQUENCES NOBODY ASKED FOR, both real and both kept.**
1. **The landing spans all three wings** — (1,5) West, (2,5) Stair Hall, (3,5) East — so the
   papers' wing memory is informative at the ending for the first time.
2. **The two corners of the top storey got harder.** (0,6) and (4,6) have two outer walls and the
   chamber's blank plaster on the third, so a tee or a cross laid there can seal itself, which it
   never could. Measured under 6% of those shapes' placements; `tests/grid.test.ts` had asserted
   a flat 0 and now asserts the bound with its cause.

**A SAVE MIGRATION SHIPPED WITH IT.** An evening interrupted under the old build can hold a
drafted room at (1,6) or (3,6); a manor missing two of its three seals is one where a landing
room's north door opens onto an ordinary parlor and `atSanctumDoor` — which asks the manor, not a
constant — would answer yes at a door that is not the ending. `migrateSanctumSuite` restores the
chamber at the door and drops whatever stood in it.

---

## Blast radius — name it before building

This touches more than a constant. At minimum:
`opensOntoSanctum`, `cardOpensOntoSanctum`, `atSanctumDoor` and its three-state cousin,
`SANCTUM_DOOR_CELL` / `SANCTUM_DOOR_KEY`, `reserveToTop`, the speaking tube's cell check, the
landing draft in `DraftModal`, the blueprint's rendering of the top storey, every AAA 4.10 band
that mentions reaching the door, and the seal/frontier logic in the grid-true simulator.

Two rules from this project's own history apply hard here:

1. **Re-derive every band and publish every one that moves, with its reason.** A band that moves
   because the game got better is good news stated plainly; a band quietly re-published to fit is
   the failure this campaign keeps repeating.
2. **Do not verify the change with an instrument that shares its assumptions.** The Gallery once
   proved "0 words refused" using a trie blind to the very words that caused the bug.

---

## Also queued in the same round, from owner play

- **The night screen has formatting errors**, and the cause is known: the glass gate walks 17
  scenes and the night, dusk and morning cards are not among them. Add them to the walk.
  - **BUILT — round 39. The walk is 22 scenes, and it found two.** The three cards are reached
    by driving a real day to a real dusk on a clean glass — the front step, Mrs. Bramble's
    morning, rooms drafted until the last step is gone, `applyStepEntry` →
    `scheduleDuskCheck` → `endDay` — never by mounting a component, because the night is a
    read-back of what the day contained. Which way the day ended is printed every run (it
    retires early on the floorplans that box her in, rather than silently measuring nothing).
    **What it found on its first pass, both sizes:** the dusk veil's skip button drawn
    straight through the blueprint's title block ("And so, to bed" on top of "The Grounds"),
    and the morning card's grant amount stranded beside the *first* line of a label that
    wraps at 375 — "+4 steps" level with "A welcome cup — this first morning" while the word
    "only" hung alone underneath. Both are published in AAA 4.12 / 11.4 with their causes.
    Four verdicts came with the walk and each is proved by re-breaking the app: **FIT**
    (every LINE and control of a lifecycle card, because these scenes hide their scrollbars
    by house rule, so what is off the glass is simply gone), **MORNING**, **DUSK** and
    **NIGHT** — which matches every tally row on the glass against the record the engine
    banked at `endDay`, an instrument that can disagree with the DOM. The tally is walked at
    its FULLEST (all six rows printing) because that is the only honest case to hold a fit
    claim against — round 25 published "the fullest night fits" as prose and it was 59px out.
- **The dusk fade feels disjointed** — it should feel like dozing off. The sound cue is fine and
  must not change. `chr-dusk` currently uses `3200ms ease-in` (an ACCELERATING curve, which reads
  as being switched off rather than drifting off), animates `opacity` and `background-color` in
  one keyframe so perceived darkness is their product and rushes at the end at any duration, and
  starts the candle at 1400ms over 1600ms so it lands 200ms before the veil completes and is
  swallowed. Build: one property, a decelerating curve with a long tail, the vignette CLOSING
  inward rather than a uniform dim, the candle landing early and holding, slower overall. The
  <=4s AAA 4.12 grace window must be re-examined rather than silently extended.
- **The landing offer overflows 69px at 375x667 and 79px at 390x844** — it was thought to be a
  375-only defect because nothing had ever opened a landing draft at the taller size. Every
  remaining copy trim lands ~1px short; it needs a different LAYOUT for this one draft. The
  Sanctum rule is a statement about the whole offer rather than about any card, so it belongs
  above the three cards as a header. Note this may change shape entirely once the landing is
  three cells.
  - **PART-PAID, round 37 — 69 → 27 and 79 → 31.** The Sanctum rule already WAS a header; what
    it was not was the *only* header. With the landing three cells wide, the rotation rule
    ("each plan is turned to the gilt door at your feet") and the Sanctum rule became one fact
    with two halves, so at this door they are one sentence: 42px at 375 and 48px at 390.
    **The residue is now smaller than the three per-card stamps that make it up (56px)**, which
    is the sharpest the debt can be stated without an owner ruling: the whole of what is left is
    round 13's "every card prints its own answer", and the two ways to pay it are folding the
    stamp into the door-plan line (**frozen by ruling 1**) or printing the answer once instead
    of three times (**contradicts round 13**). The glass gate walks the scene, prints the
    number every run, and still bounds it. **This one is the owner's.**
