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
