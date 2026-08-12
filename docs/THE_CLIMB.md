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
