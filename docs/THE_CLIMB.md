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
