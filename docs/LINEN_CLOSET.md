# The Linen Closet is not a crossword, and should stop pretending

**Owner's decision, 10 Aug 2026: keep the room, stop calling it a crossword.** Build it around
its clues — the thing it is actually good at — rather than around crossings, which it will never
have.

## The measurement that forced the decision

A hostile NYT critic's first blocker was that the room ships a median **25.0% checked squares**
(min 18.8%, max 33.3%) against the NYT Mini's **100%**, with 3/4/5 entries against the Mini's 10.
A crossword's defining mechanic is that a wrong answer is disproved by its crossings; on three
quarters of our letters there is no crossing.

Round 17 then measured what a rebuild would actually cost, and found the brief's premises wrong:

- **It is not a layout problem.** All 251 fully-checked connected masks that can exist at sizes
  3-5 were enumerated. **Zero** are fillable from the room's own 174-word clue bank across 2,008
  seeded attempts. Full checking is reachable only from a much broader common-word pool.
- **A rebuild destroys the room's one asset.** Only **57 of the 362** answers a fully-checked grid
  needs clear the hand-picked manor bank. A rebuild orphans ~2/3 of the 174 words and most of the
  360 clues, and needs 564-915 new ones.
- **And it makes the writing worse.** Connective fill forces plural/verb S-endings from 2.3% of
  the bank to 13.4% of what full checking requires.

The finding underneath all three:

> The clues are good BECAUSE the grid is sparse. A skeleton lets an author choose every word
> (OWL from "Night's librarian"). Full checking removes that choice and pays in connective fill.
> **The room's one asset and the crossword's defining mechanic are permanently opposed.**

So the room was never a bad crossword. It was a good something-else wearing a crossword's name,
and being judged — by us, for twenty-odd rounds — against a spec it structurally cannot meet.

## What it now has to become

Renaming alone is not a fix. A sparse grid with 3-5 entries is a thin puzzle whatever it is
called, and the honest problem is this: **with no crossings, nothing disambiguates a wrong
answer.** That job has to be given to something else. The room needs a mechanic where the clues
themselves do the work crossings used to.

The strongest candidate, and the one to try first — **the shaded squares spell something.**
A small set of clue-led answers whose marked letters assemble into one further word. It is a
classic crossword-meta device, it works *better* on a sparse grid than a dense one (the author
picks every answer, so the author picks every marked letter), and it gives the room three things
it currently lacks:

1. **A reason a wrong answer is wrong.** The meta refuses to spell. That is the disambiguation
   crossings were providing.
2. **A second, better solve.** The first solve is four clues; the real solve is seeing the word
   they hide. That is a puzzle rather than a quiz.
3. **A join to the mystery.** The hidden word can be a fragment of the missing definition, which
   makes this room pay the mystery through SOLVING — exactly the shape
   [[docs/ROOM_CHANNELS.md]] argues for ("the room sets the lens, the puzzle pays").

Whatever mechanic is chosen, two constraints hold:

- **The clue panel must stop scrolling.** It scrolls at BOTH sizes today (.lc-clues 220/176 at
  390x844, 220/88 at 375x667 on crossword-t3-19). If the clues ARE the puzzle, hiding three of
  five is no longer a presentation bug, it is the puzzle being unreadable. The owner hates
  scrollbars; here it is also a correctness issue.
- **Keep the 696 clues.** They are the reason the room survives.

## A process finding worth keeping

`docs/BENCHMARKS.md` has **no Mini teardown and no crossword section at all**. The spec this room
was judged against did not exist in the house's own spec document, which is how the room drifted
this far before anyone measured it. Whatever the room becomes, write its benchmark down first —
and if the new form has no NYT twin, say so explicitly rather than leaving a gap that a later
round will fill with an assumption.

## Rejected, with reasons

- **Rebuild to full checking** — measured above: costs 564-915 new clues, orphans two thirds of
  the bank, and degrades the clue voice. Rejected by the owner.
- **Cut the room and transplant into the Study** — the Study's registers (plain gloss / poetic
  image / riddle, with leak and overlap gates) are built for long forgotten words. TEA, OWL and
  PIE are not Study headwords in any register; measured incompatible. Cutting also reds 14
  published campaign bands across 4 files and removes the only micro card carrying a dead-end
  layout, leaving every micro offer as the Darkroom.

---

# What was built (round 29)

The owner's ruling above was carried out as written: the grid stayed sparse, the room stopped
being called a crossword, and the disambiguation job was given to **the shaded squares**, which
the ruling proposed first. It is called **the hem**.

## The mechanic, in the room's own words

One square in every answer is marked. Read down the clue list, the marked letters spell a
further answer — and that answer is **clued in the list with the rest**, on a row that names
itself `Hem`. The marked letters are mirrored into a column down the right edge of the clue
panel, so the column reads as a word without the player having to hunt the board for them.

It does the three things the doc asked for:

1. **A reason a wrong answer is wrong.** A wrong entry puts a wrong letter in the column and
   the hem refuses to spell. It costs nothing to see, because it is derived from letters
   already on the board — exactly as reading a crossing is. `tests/puzzles/micro2.test.ts`
   pins that: spelling the hem emits no event, charges nothing, and cannot end the room.
2. **A second, better solve.** The first solve is three or four clues; the real one is the word
   they hide, and reading the hem's clue first hands one letter to every answer.
3. **A join.** The closet names its hem on the way out — *"The hem reads SNOW."* That is the
   room paying through solving. It is the small version of the join: the hidden word is not yet
   wired to a Volume fragment, and that is left undone deliberately rather than half-done.

**The benchmark that was missing now exists.** `docs/BENCHMARKS.md` §10 is a teardown of the
**NYT Acrostic** — the one mainstream NYT word puzzle whose letters are checked without
crossings, by transfer and by an initial-letter spine. It also strikes the Mini explicitly, with
the round-17 measurement, so no later round can re-derive the Mini from an empty page. Where we
differ from the Acrostic is written down: any-position marking instead of initials (of the 90
boards shipped at HEAD, **1** admits an initials-only spine), and no quotation grid, because
checks 1 and 2 need twenty minutes and this room has ninety seconds.

## The number that was actually wrong

"25% checked squares" was the Mini's metric and it hid the real defect. Measured on the pool at
HEAD: **190 of 360 entries (52.8%) had at most ONE letter in the whole answer that anything on
the board could contradict.** A wrong word sat there looking exactly as right as a right one
until she paid for a check. With one marked square per entry, placed on a letter no crossing
already covers, that is **0 of 288**, and the share of an answer's letters under outside check
goes **39.9% → 62.3%**.

The gate is `MIN_FRESH_SPINE_RATIO`, and it is not true by construction: the first build of the
generator took the first bank word a layout could spell, fell back to marking crossings rather
than discarding the layout, and shipped 90 valid boards at **0.679** with 50 entries still
single-checked — green on every other gate in the file. The generator now throws a layout away
instead (32,979 of them), and both the generator and the suite re-measure it.

## Two things found on the way that were not in the brief

- **The room had a free correctness oracle.** `.lc-clue--done` dimmed a clue the moment its
  entry matched the *solution* — an unlimited, unpriced, per-entry right/wrong answer, in a room
  whose entire economy rests on the full-grid check being the one costed claim. The brief said
  "nothing disambiguates a wrong answer"; the truth was worse, because something did, for free,
  and it made the charge unreachable for anyone who noticed it. The dim now means FILLED.
- **Three of five clues were not merely scrolling, and the fix was not a scrollbar.** Five 44px
  clue rows over a five-rank board want 132px that a 375×667 stage does not have. It was paid
  by: the clue rows giving up being *controls* (they commit nothing, so AAA 6.19 does not reach
  them, and 5 × 28px fits where 5 × 44 cannot — selection moved to the numbered squares plus a
  cursor that auto-advances to the next unfilled answer); the room's verb becoming a wide
  keyboard key, sized past 44×44pt because 6.19 exempts nothing costed; and tier 3 trading its
  fifth entry for the hem. Measured live in system Edge at both sizes: nothing scrolls, all five
  rows hit-test as themselves, and the bank's longest sentence still fits one line.

## What it cost

- **The pool is 76 boards, from 90** — tier 1 hardest hit at 16, from 30 — because a layout is
  discarded unless a bank word can be spelled out of its *uncrossed* letters. The shipped floor
  is ten per tier.
- **Nothing else.** The room was not allowed to buy the hem with squares: the generator caps the
  running mean per tier at the mean the old pool shipped (8.40 / 13.30, and 14 at tier 3 against
  its old 16.10), because the hem's freshness rule pulls the search toward sparser layouts and,
  unconstrained, took tiers 1 and 2 to 9.00 and 14.50. `ROOM_EFFORT.crossword` is untouched.
- **The 696 clues survived.** One was shortened — "Posy saves the crimson for letters that
  matter" (46 chars) rendered 40.7px in a 28px row at 375×667 — and the bank is now gated at 42
  characters, which is the longest sentence measured to fit on one line.
