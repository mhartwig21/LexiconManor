# Lexicon Manor — where we are

*Written 7 Aug 2026, after thirteen build rounds and one hostile editorial review.
Rewritten 10 Aug 2026 at the end of **round 25**, because it had gone two rounds stale — it
still said "working tree at `8a125bd`" and "1,249 tests" with HEAD ten commits and forty-nine
tests further on. The rewrite is itself part of round 25's brief: this file is the one document
a new reader starts from, and a stale one is worse than none.*

**Live:** https://mhartwig21.github.io/LexiconManor/ — installable on iPhone via Add to
Home Screen. Deploys from `main` on push; verify the run actually succeeded, because
three in a row silently did not (see *Lessons* below).

**Repo:** github.com/mhartwig21/LexiconManor — 49 commits. HEAD is *"The numbers had drifted
from the tree"* (round 25); the three before it are *"The instrument could not see the manor"*
(round 24), *"The house names its own rules of play"* and *"The manor starts naming its
prices"* (round 24's comprehension half). **Rounds are named by commit subject here rather
than by sha, because the sha on this line is exactly what went stale twice.**

---

## 1. What the game is now

A cozy-detective word-puzzle roguelike. You draft rooms onto a 5×7 blueprint of a manor,
each holds a word game, mistakes cost **steps** rather than health, and a mystery — a
word struck from every dictionary — is assembled across days from clues you find and
decipher. The floorplan is demolished every night; what persists is the case file, the
people, and the bookmarks.

**Seven rooms, 1,106 shipped puzzles.**

| Room | Game | Puzzles |
|---|---|---|
| The Library | Word Web (Connections-style) | 152 |
| The Conservatory | Hive Builder (Spelling Bee-style) | 300 |
| The Gallery | Twistle (grid word search) | 210 |
| The Study | Forgotten Word (poetic definitions) | 113 |
| The Counting House | Sudoku, expert baseline | 120 |
| The Darkroom | Substitution cipher | 121 |
| The Linen Closet | Sparse clue puzzle with a hem (NYT Acrostic, §10) | 76 |

*(1,083 was the count this file printed for two rounds; round 23 regenerated the Darkroom
from 94 prints to 121 when it cut the stock proverbs, and nobody moved the total.)*

Four micro-rooms (anagram, word ladder, rhyme, category sprint) were **cut** in round 4
on the owner's "fewer but better" directive. They are gone, not disabled.

**The mystery.** Volume 1 is 28 authored fragments — 10 definition lines, 10 engravings,
8 testimonies — plus 9 letters. The ten engravings narrow the dictionary in reveal order
171755 → 15232 → 6575 → 208 → 146 → 56 → 11 → 5 → 3 → 2 → 1. Every clue is soft alone
(each admits ≥100 words) and none is load-bearing: drop any one and the answer still
survives with ≤3 candidates standing. Since round 21 the **lintel channel** — finishing any
ordinary word game — stocks 16 of those 28 pages; violet rooms are the extra drip, ~2% of
ground-floor offers ramping to ~10.5% at the top.

**The cast.** Mrs. Bramble, Ellery, Posy, Fern, Dewey the cat, and the Portrait. Roughly
150+ authored lines each for the speaking four, with Hades-style contextual selection, and
since round 23 Mrs. Bramble says goodnight in her own voice — 30 authored night beats, 27
of them conditioned on what the day actually contained.

**The evening, measured** (`PROFILE_DECENT`, 3,000 seeded days — the number the whole
economy is calibrated on): **median 14.48 minutes, p90 18.78**, 9 rooms drafted, a median 2
of them finished. The published band is 10–15 / ≤23, and the median sits near the top of it.

---

## 2. Where the quality bar stands

A hostile two-reviewer panel played three days each and rated the game **5/10** against a
high-end indie bar (Blue Prince, Case of the Golden Idol, Strange Horticulture). Full text
in `docs/REVIEW_AA.md`. Sub-ratings at the time: writing 7, onboarding 6, puzzles 5,
mystery 5, presentation 5, **drafting 3**.

Its verdict: *"a genuinely well-written, unusually well-engineered game whose loop does
not work — and a daily game is its loop."* Both reviewers stopped wanting to open it on
day 3.

Its one-line diagnosis, which has driven every round since:

> **Everything Lexicon Manor does best is behind a door the deck rarely opens.**

### And then three strangers played it — read `docs/COMPREHENSION.md` first

**This is the most important document in the repo right now.** On 10 Aug three people who
had never seen the game played the LIVE deploy blind on a phone, with no repo access and no
developer shortcuts, and were then quizzed from memory and marked against ground truth by a
fourth reader holding the design docs.

**Comprehension 68/100 — and that single number hides the finding: they played two
different games.** The STORY comprehends at near 100% (all three had the premise, the dead
lexicographer, the journal and where clues file, inside ninety seconds). The MACHINE
comprehends at about 40%. Every one of them finished holding at least one confidently-held
false rule about what costs steps. One of them deduced LACUNA on paper on day 3 and spoke
it.

Its central conclusion governs the current work, and is quoted here so nobody re-derives it:

> **"You do not need a tutorial. You need about nine labels and one blueprint affordance."**

And its guardrail, which matters as much: **the manor withholds the RIGHT things** — the
word, the definition, what the engravings imply, what is at the top — **and that worked.**
What it withholds wrongly is PRICES and RULES OF PLAY. Do not resolve a mystery beat with a
tooltip.

---

## 3. What the last few rounds changed, with their numbers

### Round 36 — a move costs a move, wherever she is

The owner, after playing: *"The steps economy is insane right now… It shouldn't get more
expensive the further you move up. The steps economy is driven by needing to double
back."* `MOVE_COST_BY_ROW` was `[-2, -2, -2, -2, -7, -9, -9]` — an **altitude toll** that
charged her for doing the thing the game is about. It is one price now, and
`BASE_DAY_BUDGET` moved with it because the two constants have always been one lever.
Nothing else in `engine/economy/steps.ts` was retuned: the padlock, the key supply, the
tea arc, the solve wage and the deck are untouched, so every number below is a
consequence rather than a second tuning pass. Full derivation and every moved band:
docs/THE_CLIMB §1 and AAA 4.10's round-36 block.

| | Was | Now |
|---|---|---|
| A move, by storey | −2 −2 −2 −2 −7 −9 −9 | **−3 on every storey** |
| Start-of-day budget | 18 | **22** (at 18 the evening fell to 9.9–10.1 min, under 4.10b's floor) |
| Bare ascent to the landing | 22 steps, against an 18-step budget | **15**, against 22 |
| Median player: first at the DOOR | day 23–26 | **day 20–21** (band 22–30 → **17–25**) |
| Median player: volume won | day 25–28 | **day 21–22** (band 24–32 → **18–26**) |
| Median player: never finished in 45 evenings | 8.4–13.6% | **0–1%** |
| Skilled player: first at the DOOR / volume won | day 17–18 / 18–19 | **16 / 16.5–17** — both bands unmoved |
| Decent evening (4.10b) | 14.6 min, p90 18.9 | **12.2 min, p90 17.5** — band 10–15 unmoved |
| Ground floor: net steps per room | −1.22 | **−2.24** — §5.10's floor got dearer, not slacker |
| A no-refund evening reaching the door | 0%, *by construction* | **0.03%**, measured |
| Wage spread, every room × tier (4.10h) | 9.07× | **7.77×** — the ceiling is thirds of a day |

**The asymmetry is the finding.** The skilled player's published bands did not need
touching; the median player's moved by five or six evenings. She is modelled at
`walkbackPerRow` 0.58 against his 0.36, and the old table charged −7 and −9 for exactly
the storeys she re-walks — so the altitude toll was, measurably, a tax on doubling back
that only the player who doubles back paid. The owner's diagnosis, arriving as a number.

**What got worse, published rather than absorbed.** The late-campaign evening inflates
harder (1.05 → 1.26 for him, 1.07 → 1.23 for her): climbing IS drafting rooms now, so
Bramble's arc buys minutes as well as storeys, and if the owner wants the late evening
shorter the lever is `TEA_BY_POINTS`, not the move price. The seal's overnight backlog
rose for both profiles (67.6% / 36.5%), because more of every evening happens on the
storeys where violet is dense while solving stays bounded by the clock. **The game did
not get longer for anyone; it got about six evenings shorter for her.**

**The invariant this deleted, on purpose.** `reserveToTop(1) > BASE_DAY_BUDGET` — "a
bare, perfect ascent costs more than the whole day, so the top is always bought with
refunds" — is an altitude-toll inequality and no honest flat price can restore it: an
evening is a dozen-plus moves and the minimum ascent is five of them. It is replaced by
the clause that is still true about the WALK (a realistic ascent, with walk-backs, costs
25.8 against 22) and by the day-1 gate measured on the grid-true model instead of derived
from the table it was gating.

### Round 35 — the fifth member the letters cannot see, and the median the Library owed

| | Was (round 30's shelf) | Now |
|---|---|---|
| Contested tiles per board — **median** | **1** | **2** |
| — mean | 1.41 | **1.68** |
| — distribution | 1:100 2:61 3:3 over 164 | **1:76 2:91 3:15 4:1 over 183** |
| Boards inside Connections' 2–4 band (BENCHMARKS §2) | 39% | **58.5%** |
| Shelf size | 164 | **183** (floor 150) |
| What can make a tile contested | a SPELLING collision only | spelling **or authored membership** |
| Named threads by relation | 5 kinds | **6** — `compound` is new and ships 75 |
| Boards carrying a new-relation thread | — | **90 of 183** |

**The wall was a detector, not a language.** Round 30 measured that 90 of 164 shipped boards
could not contest a second tile at any budget and concluded the shelf needed authored supply.
Both halves were true, and the reason the supply was so expensive is that everything in
`findTraps` discovered a contested tile by SHAPE — three letters at a word's edge, a doubled
pair, a rhyme key, a `Contains "X"` token spelled out in the label. Four hand-written categories
collide in their *spelling* about once. `memberTraps` asks the other question, which this file
has known how to answer since round 14 and only ever asked about DECOY labels: does this word
honestly BELONG to that category. A bank pool is eight verified members and a board deals four,
so the other four are exactly the provable fifth members — 273 words in the bank already sat in
more than one pool and every one of them was invisible to the number the room is graded on.
LINEN is a fabric and a thing a housekeeper counts; LEDGER is kept and on the desk; SADDLE is a
mountain feature and in the coach house.

**That is what made the authoring cheap, and the authoring is the round.** Twelve new pools were
written to SHARE MEMBERS rather than to share spellings — four house pools (the butler's
polishing, the stillroom, what the housemaid carries up, what the housekeeper locks away) and
eight ordinary-English ones chosen for subjects the rest of the bank is built out of (`Things a
Person Takes`, `Things That Can Be Broken`, `Things That Are Struck`, `Things a Fire Needs`…).
Round 18's house pools had to smuggle a letter pattern into a subject the manor genuinely has,
which is a real constraint on what the house is allowed to be about; these did not have to.
`assertManorCollides` was widened to the same union the shipping detector scores, and still goes
red on the round-17 pools it was written to condemn.

**Three ceilings, because a shared member is a trap only up to a count.** `poolQuartetProblems`
fails the build if two pools share four words — a dealt hand could then BE the other pool's whole
category, which is a second right answer rather than a contested tile, and it caught three pools
that were already in the bank (`Silent Letters at the End` was the union of `Silent "B"` and
`Silent "N"`; `Can Precede "STONE"` was `___ STONE` under a second label). `memberSentenceOf` is
a whitelist: a membership trap ships only where the room can say WHY truthfully, so a plain
category is named out loud and `Add a "T" for a New Word` contests nothing. And a foreign
category keeps quiet about a tile the board can already name — all four surviving cross-board
threads were the same sentence twice.

**Where the player is looking (standing rule 4), measured on glass.** The named-category line is
the longest copy this room has ever printed: 90 characters against a shelf maximum of 55.
`tests/round35-library-threads-live.mjs` drives a real wrong guess onto a new thread at 375×667
and 390×844, and drives one onto an OLD thread on the same board and viewport so a new defect can
be told from a standing one. The worst sentence the shelf can produce wraps to **two lines, the
same as the worst sentence the room already printed**, and `--prove` pads it past that and watches
the check go red. **Standing finding, not this round's:** a wrong guess that names any thread
grows the Library's reserved toast slot by up to 12px and the board moves ~30px under her — on a
build whose diff touches no CSS, no layout and no view, and identically on the old copy. That is
`.anch--library .anch-toastslot`'s reservation being one line short at 375×667, and it wants a
layout decision, not a content one.

### Round 31 — the card says which way is on, and the Study fits at tier 3

COMPREHENSION wrong beliefs **7** and **8** were the only two on that list with no fix number, so
no round ever assigned them — and two critics in a row named the first as the #1 reason a player
quits on day 4. The NYT-games player's answer to *"what did you never figure out at all"* was
*"How to get upstairs. That's the whole game and I never cracked it."*

| | Was (HEAD, round 30) | Now |
|---|---|---|
| Where a draft card states its onward doors | a 32×32px diagram, `aria-label` only | **a line of type on the card face, a step darker and heavier than the stake line** |
| Beside it, the loudest line on the card | `anchor · five minutes or so · +7 steps` (the WRONG attribute) | unchanged — but no longer the loudest |
| The sealing stamp | `Seals itself · +1 gem` | **`Seals itself · no way on from here · +1 gem`** |
| Wall she came through, per offer | named 3× (once per icon, AT only) | **named once, above the three cards, on the glass** |
| Rate card / tier pips, to assistive tech | `aria-hidden="true"` / no text at all | **one image + one sentence each, derived from `moveAt`** |
| The pip column's key word | `RANK` (the engine's name), in the bottom margin only | **`TIER` — the word every card uses — headed over its own column** |
| Draft sheet scroll at 375×667 | 29px (the third card's bottom hit-tested as the sticky foot) | **0px — all three cards and both prices on the glass** |
| Draft sheet scroll at 390×844 | 0px | **0px** |
| Study, tier 3, at rest — entries that fit, 375×667 | **9 of 43** (typical overrun 11px, worst 65px) | **37 of 43** (worst 50px) |
| Study, tier 3, at rest — entries that fit, 390×844 | **33 of 43** (typical 7px, worst 32px) | **43 of 43** |
| Tests | 1334 | **1360** |

**The gates, and what they go red on.** `states the ways on, in words, for every card in the deck
at every heading` walks the manor's room map with its own compass tables — never `onwardDoors`,
`sealsItself` or `doorPlanWords` — over 112 offers, and demands the card's own visible text agree.
Proved red on the pool it condemns: with the card face built from bare geometry (doors minus the
entry wall, the obvious wrong implementation) it lies on **11 of the 112**, first miss
`long-gallery` entered from the west, claiming three ways on where there are two.
`speaks its margin` finds each mark's group in the rendered sheet and refuses an `aria-hidden`;
proved red by restoring the old markup.

**What the Study fix did NOT touch.** The room is protected and at NYT standard, so every number
moved is chrome: the column's gutters and padding, the entry card's padding, one crib-slot box
height, the deck's gutter, and one column gap that should never have existed (the crib caption is
the crib row's caption and was a sibling flex child). No word, no font size, no line-height and no
tap target changed. **What is left:** 6 of 43 tier-3 entries still overrun at 375×667 (1–50px),
and an UNSEALED clue — bought reading matter — still overruns at both sizes. Closing those needs
the riddle itself to get shorter or a tap target to go, and both are content.

### Round 30 — the Library composes from its contested tiles, and the house is what contests them

| | Was (HEAD, round 17) | Now |
|---|---|---|
| Contested tiles per board — mean | 1.34 | **1.41** |
| — median | **1** | **1** — NOT WON, see below |
| — distribution | 1:103 2:46 3:3 over 152 boards | **1:100 2:61 3:3 over 164** |
| Boards inside Connections' 2–4 band (BENCHMARKS §2) | 32% | **39%** |
| Boards whose supply CAN contest ≥2 tiles | 69 of 218 candidates (the shelf's own number was never printed) | **74 of 164 shipped** |
| What the board composer optimises | `roughTraps`, a letters-only proxy blind to rhyme, to completeness and to WHICH tile | **`contestedCapacity(findTraps(...))` — the shipping detector** |
| House categories shipped | 5 groups of 608 | **22 groups of 656, on 17 boards** |
| House groups whose own tile is the contested one | 0 | **8** |
| Shelf size | 152 | **164** (floor 150) |

**The proxy was the supply.** Two thirds of the shelf is composed by `synthesiseBoards`, and it
chose which four categories to put together with `roughTraps` — a stand-in written in round 13
because the phonetic dictionary is declared further down the file than the composer was. That
was a fact about the ORDER OF THE DECLARATIONS, not about the code. The shelf is now composed at
the bottom of `content/generate-wordweb.ts` and the composer asks `findTraps` directly. The proxy
counted collisions; the format is graded on TILES, and ten collisions about one word are one
contested tile.

**Three more free levers, all of them choices the pipeline was already making blind.**
`redealHands` re-picks which four words each bank category puts on the FINISHED board (the hand
was chosen mid-composition, against a board that then moved underneath it) and now reaches
authored groups whose four words are all members of a bank pool of the same category. The
variant loop, which compares four admissible compositions of every board, weighs contested tiles
at 3 — below the way-in floor at 8 and the finish floor at 4, and no higher, because at 6 it held
on to a compound frame every time one was offered and drove the compound family to 114 of 162
boards against a 70% wallpaper budget that `validate` correctly failed. And `shippedHerrings`
tops the budget up from the looser band when the tight threads FILL it but contest too little —
the round-17 rule only topped up when the tight threads ran out, so a tier-3 board with four
tight threads about one word shipped four sentences about one word.

**§5.9 — the manor in the threads — is answered structurally, and the answer is an authoring
rule with a gate on it.** Round 26/17 proved the tension: a house-voiced category is written for
its subject, so it is semantically isolated, so it contests nothing, so the trap planter swapped
37 of 42 of them back out; four knobs were tried and all four cost the shelf boards. A house pool
is now written in two registers at once — some members make the category true, and at least three
are ordinary English words the rest of the bank is built out of. GAMEKEEPER is staff AND a word
with AME in it; CARRIAGE is in the coach house AND carries CAR and AGE; HANDBILL was behind the
bookcase AND doubles an L. `assertManorCollides()` fails the build unless every hand `bankDraws`
can deal from a house pool carries such a member — the colliders sit at pool indices 1, 2 and 5,
a hitting set of the twelve draw patterns. **It goes red on the pools it was written to condemn:
run against the round-17 house bank it reports 53 problems, 9 of 14 pools below the collider
floor and 44 dealable hands with nothing in them, `What a Lexicographer Collects` accounting for
13.** Four new house pools were authored collider-first (the coach house, under the stairs, the
post tray, what the gardener brings in). With that guarantee in place, `pickBankGroup` may now
prefer a house hand among the hands that have already tied on contested tiles — the trade round 17
measured at −7 and −10 boards no longer exists, because the house hand is one of the winners.

**The same rule, applied to the other family that cannot argue.** `Letters in Alphabetical
Order`, `Three Vowels in a Row` and `Made of a Repeated Syllable` fell off the shelf the moment
the composer started choosing by contested tiles — `tests/puzzles/wordweb-ladder.test.ts` caught
all three by name — because a pool nothing can argue with loses every tie. Two were fixed by
re-choosing their members (HILLY, FLOOR, BEEFY, TARTAR, GEEGEE, the `-OUS` words). The third,
`Spelled Without a Vowel`, cannot be fixed that way and the reason is definitional: a shape
mechanic has no token in it, so there is nothing for a fifth word to take hold of. The
`letter-shape` family is therefore exempt from the contested-tile FILTER — it rejoins the draw
rather than being struck out of it, competing on the same seeded pick — and all six shape
mechanics ship again.

**What did NOT land: the median.** The round's number was the median contested tile count, 1 → 2,
and it is still 1: 100 of 164 boards contest exactly one tile. The instrument now says exactly
where the wall is, on the SHELF rather than on the candidate list (the old "tiles AVAILABLE"
census counted the sixty-odd boards that then left, which is standing rule 2 again). **90 of the
164 shipped boards cannot contest a second tile at any budget** — their sixteen words simply do
not offer a second word that is a fifth member of anything. Of the 74 that can, 61 do; 6 of the
remaining 13 are cut by the colour ladder, which is a rule and should win. So the median needs
~25 more boards to GAIN supply, and every free lever in the pipeline has now been spent. The next
one is not free: it is either authored supply (the house pools are the proof that authoring for
collisions works, and the wordplay bank has ~110 pools that were not written that way) or the
trap planter buying tiles with a whole bank theme, which round 17 measured at −13 boards and
which this round did not re-run.

### Round 27 — the word games' round: the Counting House is graded, and it has a tomorrow

| | Was | Now |
|---|---|---|
| Sudoku teardown in `BENCHMARKS.md` | **none** — three source comments cited "NYT hard" against nothing | §7, with NYT's whole published ladder (Easy/Medium/Hard) |
| Boards needing a wing / fish / colouring, by tier | 0% / **98%** / **100%** — two storeys above the top of NYT | **0% / 0% / 100%**, gated off the shipped boards |
| Givens (median) by tier | 24 / 25 / 24 — one length at every storey | **30 / 26 / 24** (51 / 55 / 57 blanks) |
| `ROOM_EFFORT.sudoku` | 12.5 / **27.0** / 30.0 min | **11.0 / 13.0 / 17.0** |
| Implied seconds per placement | 13 / **28** / **32** on boards of the same length | **13 / 14 / 18** |
| Solve payouts | +12 / +9 / +6 | **unchanged** — all three were capped and still are |
| 4.10h wage spread (all rooms / tier-1–2) | 16.00× / 9.60× | **9.07× / 4.62×** |
| An unfinished ledger leaf | died with the manor at midnight | **the OPEN LEDGER** — one board, banked with the rungs already paid for it |
| The sudoku ladder's denominator | `SUDOKU_BLANKS = 57`, a pool median | the leaf's own blank count, carried by the adapter's marker |
| §5.10 ground-floor drain (skilled / great) | −0.274 / −0.176 | **−0.231 / −0.136** — LOOSENED, see below |

The one ratchet that moved the wrong way, recorded because this file's neighbours are
ratchets: a shorter room is more often FINISHED, and a finished anchor pays a key and +2 as
well as its steps. The Counting House was the manor's only tier-1 anchor too long to finish
in a sitting, and that was quietly holding up 4.10i. Every profile still costs her steps on
the ground floor, which is what §5.10 is about; the bound is re-derived by a sixth and the
lever for winning it back is the deck's ground-floor mix or the walk, not the room's clock.

**Banking is a deliberate exception to the nightly wipe, so it is legible as one** — the
exit reads *"Leave the ledger open"* under the rule (*the house is put away at night; this
leaf is not*), a resumed leaf opens under *"Left open on day N — still yours"* and keeps
*"Left open day N"* in the deck's meta line, and the finished card says the leaf is closed
and the next one is a fresh sheet. The first draft put the notice in `.ch__sub`, which is
`display:none` below 760px; the live pass at 375×667 caught the grid coming back with the
room saying nothing, which is exactly the class of defect that bar exists for.

### Round 23 — the ground floor, the night, and two rooms saying somebody else's sentences

| | Was | Now |
|---|---|---|
| §5.10 Steps in hand on the ground floor (median / skilled) | **28 / 30** against an 18-step budget | **18 / 20** *(round 36, against a 22-step budget: 15 / 20)* |
| §5.10 Net steps per ground-floor room (median / skilled) | **−0.84 / −0.36** (a wash) | **−2.58 / −0.96** *(re-derived on round 24's grid-true instrument: −1.24 / −0.26; round 36's flat price: **−2.24**)* |
| §5.10 In hand arriving at the first padlock (median / skilled) | 15 / **21** — richer than she started | 12 / 18 *(now 11 / 19)* |
| §5.10 Solve : walk ratio on row 0 | 12 : 1 | **6 : 1** (one price, −2, across rows 0–2) *(round 36: one price, −3, across ALL SEVEN — 4 : 1)* |
| §5.9 Darkroom plaintexts that are stock proverbs | **59 of 94 (62.8%)** | **0 of 121** |
| §5.9 Linen Closet unique clues per entry | **0.431** (155 of 360) | **1.000** (696 clues over 174 bank words) |
| §5.9 Most-repeated crossword answer / clue | SUN ×12 · "Parchment guide" ×8 | ×4 · **never twice** |
| §5.11 Night-line variants (the last thing she reads) | **3**, keyed by end cause alone | **30** authored beats, 27 keyed to the day |
| §5.11 Distinct goodnights across consecutive nights, driven live | **2 in 6** | **8 in 8** |
| 6.19c Linen Closet clue rows visible at 375×667 | 1 of 5, with a row's own centre over the QWERTY | 2 of 5 (3 on a 4×4) *(round 20)* → **all of them, at both sizes** *(round 29)* |
| Linen Closet entries with ≤1 checked letter | **190 of 360 (52.8%)** | **0 of 288** — the hem, BENCHMARKS §10 |
| Linen Closet letters under outside check | **39.9%** (566 of 1,417) | **62.3%** (730 of 1,172) |
| The night digest at 375×667 | **667 / 751 — 84px past the glass**, hidden by `overflow-y` | fits, no scroll |

Bramble's tea also stopped landing on the floor it was never about: `TEA_POUR` pours a cup
at the door and leaves the rest of the pot on the second landing, so **the dawn purse is 22
on day 1 and 22 on day 30**, and a warmer Bramble is worth exactly what she always was over
an *evening*.

### Round 24a — the house names its own rules of play (COMPREHENSION 1–9, 12, 13, 15)

Nine labels, not a tutorial. Every one is a label on something the code already knew:

- **The reason beside every step float.** The ledger has carried `reason` on every entry
  since the economy was written and `StepMeter` threw it away. It says the word now —
  "−1 gift", "−7 climb", "−2 wrong fill", "+4 tea" — and four false rules die on the first
  float she sees, starting with "talking to a character costs a step" (it does not; two
  testers began rationing conversations in a game whose stated pillar is the characters).
- **The brass is drawn on the Entrance Hall cell, every day.** The largest wrong belief in
  the test was that saying a word requires a climb four floors up. It has not since round 17
  — the speaking tube hears one word a day from day 1 at zero steps — but it had exactly one
  surface, gated on holding four legible fragments: the affordance gated on the content the
  affordance exists to test.
- The moment card is a **link**, not a dismiss target, and the day-1 letter waits.
- The affinity pips **count points, not only ranks** (`pointsToNextRank` had existed unused
  since the ranks were written; a first gift moved nothing, so all three concluded gifting
  was inert).
- The Gallery's Claim button was **disabled below its own minimum**, making its authored
  "Words need 4+ letters" unreachable by construction.
- Full Bloom is **drawn as the door** on the hive ladder, at zero height cost — the obvious
  placement put a 19–20px scrollbar in the Conservatory.
- "Leave it for tomorrow" → **"Step away"** (the room does not exist tomorrow).
- The Darkroom **states its rule**, in the reserved line above the keys — *not* in
  `.mic__sub`, which is `display: none` at both shipped phone heights.
- The three currency glyphs are **named once**, under the cluster, on the first morning only.

### Round 24b — the instrument could not see the manor

For twenty-three rounds `simulateDay` tracked a scalar row and a step budget. It never held
a Cell, never called `resolveDoors`, never asked `sealsItself`. It is grid-true now, and the
finding is that **the top of the house is priced by GEOMETRY, not by steps**: only 24.5% of
the evenings that reach the landing storey end on the landing *cell* with a plan that opens
north, and with an unlimited purse and ten keys the door is still a 30% proposition.

**Every ACCESS band moved; every KNOWLEDGE band held.** Skilled first door 6–10 → **14–22**;
the median player's first door 12–20 → **22–30**; her volume win 18–28 → **24–32**. Her
deduction day did not move at all (14–24, measured 17) — she reads the volume exactly as
fast as she did, and then waits a median 8 more evenings to be handed a landing plan that
opens north. Two gates that had been answering themselves were killed: the vacuous
"unspent budget 0.0%" (now median 0.0%, **p90 33.3%**, 14.4% of evenings shut in) and the
`sessionMinutes` clip. **"79.2% of offers have a real choice"** was retired outright and
replaced by the **dominance rate** (AAA 4.10j) — measured 67.0% against a *derived* target
of <40% and a permutation null of 68.7%, gated as a ratchet at 70%.

### Round 25 — the numbers had drifted from the tree

An adversarial verifier refuted several published figures, and it was right about the shape
even where the work underneath was good. **This round changed no game behaviour at all**; it
re-derived every headline against the current tree.

| Claim, as shipped | The tree | Now published as |
|---|---|---|
| `steps.ts`: "Bare ascent 22 → 23" | 2+2+2+7+9 = **22**, pinned at 22 twelve lines below | unchanged at 22, with the before/after arithmetic |
| `TEA_POUR`: the cup is "the same 3 steps" | `dawnCup` is **4** | 4 |
| `TEA_POUR`: "21 steps on day 1 and on day 30" | **22** — which the member comment below it already said | 22 |
| `TEA_POUR`: "2+2+3 = 7 steps out of a 21-step purse" | **2+2+2 = 6 out of 22** | 6 / 22 |
| `economy-effort.test.ts`: "45× → 12× overall" | **20.00×** (AAA_BAR already said 20) | 20.00× |
| AAA 4.10e: "<2% in the first week (measured 0.5%)" | first week **0.0%**; 0.5% is the ≤14-day figure | 0.0%, with the fortnight named |
| AAA 4.10b: "median ~11.6, p90 ~21.5", "5–8 rooms" | **14.48 / 18.78**, 9 rooms | re-measured; band unmoved |
| AAA 4.10g: an evening finishes "1.99 for her, 1.82 for him" | **2.18 / 2.38 — and the order has inverted** | re-measured; both moves published |
| AAA 4.10c: great-day landing reach "4.2% → 4.3%" | **3.7%** | 3.7% |
| AAA 4.10i: skilled ground-floor drain "−0.35" | **−0.257**, against a bound of −0.25 | −0.26 |
| `COMPREHENSION.md`: day 1 is "+3 (=21)" | `FIRST_MORNING_POT` is **4**, so day 1 opens at 22 | 22, with the testers' 21 kept as history |

**The headline named for something it did not measure.** *"≤ 2× across the rooms an ordinary
evening is actually made of (measured 1.75×)"* was computed on `tier ≤ 2 AND effortMinutes ≥
2 AND not the Counting House at tier 2` — a filter that removes **the Gallery, the Linen
Closet and the Study**, three of the commonest draws, for being SHORT, in a metric about how
short rooms are paid. Seven of fourteen tier-1/2 pairs survived it. That is structurally the
same defect as the "79.2% real choice" headline, committed in the round that retired it.
Four populations are published and gated now, and none of them is called an evening:
**every room × tier 20.00× · all tier-1/2 unfiltered 12.00× · tier-1/2 minus the Counting
House 4.89× · tier-1/2 of two minutes or more, minus the Counting House, 1.75×**.

**Two test floors, judged.** Both were loosened in round 22, both documented in the tests —
this repo's standard — and both absent from that round's report. Both are **restored**,
because in each case the finding that justified the loosening expired when round 24 fixed
the instrument:

- `tests/volume-pacing.test.ts`'s filing dry-run bound, `PITY_DROUGHT_DAYS + 1 → + 2`.
  Re-derived over the same 240 seeded campaigns at HEAD: worst filed dry run
  **0 ×110 · 1 ×107 · 2 ×21 · 3 ×2**, max 3, against a legible max of 2. `+ 1` is exactly
  the measurement again, with 2 of 240 campaigns sitting on the bound.
- the padlock deck-key floor, `> 0.3 → > 0.2`. Round 22 walked it down because the deck
  share had fallen to ~29%; round 24 found that was an artefact of the instrument — the old
  model handed a green card its key only when the player was short of one, while the live
  game pays `UTILITY_EFFECTS[cardId].keys` on every placement. Measured at HEAD: **68.5%**
  on the deck channel, 84.4% on solves, 96.1% either. Restored to 0.3 rather than raised to
  the measurement, because a floor's job is to fail when the green deck dies, not to track
  today's number.

---

## 4. What is left

Ordered most value first.

**In flight**
- *(nothing)*

**Queued — from the comprehension test; the ranked fix list is in `docs/COMPREHENSION.md`**
- The **blueprint affordance** its conclusion names beside the nine labels: how you get
  upstairs. The NYT player chose rooms on the wrong attribute for two consecutive days and
  named this as the one thing he never cracked — onward growth is the DOOR PLAN, not
  micro/anchor, and "seals itself" is the dead-end stamp rather than atmosphere.
- The remaining **blind spots**: what happens when steps reach zero (all three said they
  never found out, two played conservatively because of it); what gems and keys are for and
  where they come from; what the tier pips in the map margin mean; and that the floorplan is
  demolished nightly (genre-legitimate, but say it once, in Bramble's voice, on day 1).

**Queued — from the review**
- **~~The Gallery~~ — DONE, round 26.** *(Left here with the finding, because the finding is
  the reusable part.)* The room was not a puzzle: tier 1 asked **5 words of a median 106-word
  findable pool** (need/pool 0.047) and the fifth-commonest of those words sat at frequency
  rank **305**, so it cleared in twenty seconds out of pure recall. It now asks **5 of 23**
  (0.217) with a cheapest solve at rank **2,581**, and the fix is almost entirely
  SUBTRACTIVE — a 5-letter floor and a turn floor on every target at every tier, tier 3's
  centre rule brought down to tier 2, and a generated ceiling that forbids any board from
  offering more than five words per word it asks for. **The ask itself did not rise at all**
  (tier 2's fell, 7 → 6). A word search is not a puzzle because it is long.
  Three published spreads fell with it (4.10h: 20.00× → 16.00×, 12.00× → 9.60×,
  4.89× → 3.91×) and the fourth — the one filtered to rooms of two minutes or more — did not
  move, because the room became a puzzle without becoming long.
- **~~The Gallery, again~~ — DONE, round 28.** *(Left here with the finding.)* Round 26's fix
  narrowed what the room ACCEPTS without narrowing what the player can TRACE, and nothing
  measured it. At tier 3 the four-corner floor **refused 1,610 known, traceable, printable
  words across the seventy boards — a median 23 a board, against 22 accepted, of which only 11
  are words she plausibly knows.** More known words refused than accepted, for a rule the
  header never stated; the room answered them with *"isn't in the lexicon"*, which was false.
  The header was false too: it read *5+ letters* while **0 works of exactly five letters
  existed anywhere at tier 3**.
  BENCHMARKS **§8 is the missing teardown** (NYT Strands — the only mainstream word game whose
  input gesture is ours, and the game whose whole design answers this exact question). Its
  rule, stolen whole: *a traced real word is never wrong.* The board now ships two classes —
  **works** (the ask; unchanged, so round 26's one-in-five share and the whole economy are
  untouched) and **studies** (accepted, kept, scored, and they do not open the door). Refusals
  of known traceable words: **1,610 / 51 / 3 → 0 / 0 / 0** at tiers 3 / 2 / 1. The only
  refusals left in the house are the cozy gate's 175, which is an editorial choice.
  And the room got the **ladder** it never had (BENCHMARKS §1 calls the Bee's *the retention
  machine*; this room's win was `foundWords.length >= targetCount` and nothing else): *a
  letter is a point, a corner is two*, a study is one, five rungs from Bare Wall to Curator's
  Eye. Measured on the shipped pool, a player who merely solves lands on **rung 2–4 of 5 on
  every board at every tier**, always with something above her. **No minute of the evening
  moved** — the door is still the same count of the same words, `ROOM_EFFORT.twistle` is
  untouched, and no room had to be shortened to pay for it.
- **~~The Counting House~~ — DONE, round 27.** *(Left here with the finding.)* It was a
  27-minute tier-2 board inside a 10–15-minute evening, and the deeper defect was that
  **there was no sudoku benchmark in this repo at all** — the ladder's three tiers were the
  generator's own output histogram cut into thirds. `BENCHMARKS.md` §7 is now the teardown,
  and the grade is measured against it: **98% of tier-2 and 100% of tier-3 boards required a
  wing, a fish or a colouring chain, and NYT Hard requires none of the three**, so two of
  three storeys sat above the top of the reference ladder and were indistinguishable from
  each other. Now 0% / 0% / 100% by tier, gated. The pool was regenerated to grade LENGTH
  too (30 / 26 / 24 givens, 51 / 55 / 57 blanks) because every board had been dug to
  minimality and all three tiers were the same fifty-seven placements. `ROOM_EFFORT.sudoku`
  is **[11.0, 13.0, 17.0] minutes**, down from [12.5, 27.0, 30.0] — and the number
  that was really wrong was seconds per placement: the old row charged **13 s at tier 1 and
  28 and 32 at tiers 2 and 3, on boards of identical length**. A wing is one search, not a
  tax on fifty-seven cells. **No payout in the manor moved** (all three tiers were pinned to
  their caps and still are); the wage spread fell 16.00× → 9.07× and 9.60× → 4.62×.
- **THE EVENING HAS NO CLOCK LEFT — the commission round 26 hands on.** Fifteen seconds on
  the most-drafted anchor in the deck spent very nearly all of it. Measured before round 26:
  4.10b's decent evening 14.48 min against a ceiling of 15; 4.11's maximal-carry-over evening
  14.97 against the same 15; 4.10e's skilled win-by-day-35 96.3% against a floor of 95%.
  After: 14.63, 15.11 and 95.3%. A two-and-a-half-minute Gallery — which is what an ask of
  eight words would honestly have cost — puts them at 15.18 and 93.0%, i.e. **the honest
  clock for a better version of this room is a band the manor cannot currently pay for.**
  The next room in `ROOM_EFFORT` that gets longer has to be paid for by one that gets
  shorter, and that is an economy round's decision, not a word-game round's.
- **The deck's door layouts.** Round 24's finding hands this to the next round: the top of
  the house is priced by geometry, and the dominance rate (67.0% against a <40% target) comes
  down through **finer spread**, not de-correlation — frontier spread is zero on 31.3% of
  offers and all three cards are one category on 19.9%.
- **Key supply for the median player.** With the key model fixed, round 10's "skill, not just
  persistence, earns the campaign" holds for the skilled player (20,213 solve keys against
  17,342 deck) and **fails for the owner's own profile** (13,882 against 15,700). Recorded,
  not tuned — round 24 was an instrument round and could not touch `deck.ts`.
- **§5.9 remainder.** The Darkroom and the Linen Closet are done. The Gallery and the
  Conservatory carry no authored prose field at all, so neither can speak until its room shell
  grows a surface to speak from; the Study's 113-entry pool is still the thinnest per tier in
  the game.
- **The manor in the Library's threads: ANSWERED in round 30** — see the round entry above. The
  tension was real and structural, and the resolution was an authoring rule with a build gate
  (`assertManorCollides`) rather than another knob: a house category is written so that some of
  its members are words the ordinary bank is built out of, which makes the house the thing that
  contests a tile instead of the thing the planter evicts. 5 house groups on the shelf → 22, on 17
  boards, 8 of them contesting the tile the room argues about. The record of the four failed knobs
  is kept below because it is why the answer had to be authoring.

- **(The round-26 record.)** Fourteen
  manor categories were authored into the bank (`MANOR_BANK`) — the staff, the dictionary
  entry, what a lexicographer collects, the sounds in an empty corridor. All fourteen are
  drawn three times each by the composer, and **five survive onto the shelf**: the trap
  planter swaps thirty-seven of the forty-two out for a category that buys the board a
  thread, and every attempt to stop it cost the pool more boards than it saved (planter
  quality above the trap counts: 155 → 151 boards; as a tie-break below them: 155 → 149;
  manor-first composition: 155 → 148). The fix is not a knob. Either the manor categories
  have to be `QUALITY_PROTECTED` compound frames (three were tried, `HOUSE ___` / `BOOK ___`
  / `KEY ___`, and cost five boards), or the wordplay bank needs enough new subtle supply
  that the planter stops being the pool's scarcest resource. That is an authoring round.
- **§5.11 remainder.** Per-room palettes still borrow from other products.

### The Linen Closet: EXECUTED (round 29) — it is not a crossword, and it has a hem

The section below is kept as the record of how the decision was reached; what follows is what
was done with it. The owner's ruling (docs/LINEN_CLOSET.md) chose neither of the two options
round 25 measured: **keep the sparse grid, stop calling it a crossword, and give the
disambiguation job to the shaded squares.** That is built.

- **The missing spec exists.** `docs/BENCHMARKS.md` had no Mini and no crossword teardown at
  all — the room drifted for twenty-odd rounds against a spec that was not in the house's own
  spec document. §10 is now a teardown of the **NYT Acrostic**, the one mainstream NYT word
  puzzle whose letters are checked without crossings, and it strikes the Mini explicitly with
  the round-17 measurement so no later round re-derives it from an empty page.
- **The hem.** One marked square per entry; read down the clue list they spell a further answer,
  which is clued on a row of its own and mirrored into a column down the right edge of the clue
  panel. Free to read (it is derived from letters already placed, exactly as a crossing is),
  it refuses to spell when an answer is wrong, and read the other way it hands one letter to
  every entry.
- **The number the old metric hid.** 25.0% checked squares was the Mini's measure. The real
  defect: **190 of 360 entries (52.8%) had at most ONE letter anything on the board could
  contradict.** Now 0 of 288, and letters under outside check go 39.9% → 62.3%.
- **A free correctness oracle was found and removed.** `.lc-clue--done` dimmed a clue the
  moment its entry matched the SOLUTION — unlimited, unpriced, per-entry right/wrong in a room
  whose one costed moment is the full-grid check. It means FILLED now.
- **The clue panel stopped hiding the puzzle.** Three of five rows failed the hit test at
  375×667 at centre and all four inset corners, behind the QWERTY. Nothing scrolls at either
  size now, on any board in the pool, driven in system Edge.
- **The clock was not spent.** The generator caps each tier's running mean board size at the
  mean the old pool shipped; tier 3 traded its fifth entry for the hem and asks for 2.2 fewer
  letters. `ROOM_EFFORT.crossword` is untouched. The bill was paid in VARIETY: **76 boards,
  from 90** (tier 1: 16, from 30), because a layout is discarded unless a bank word can be
  spelled out of its uncrossed letters.

### The Linen Closet: measured, decided, NOT executed

The NYT critic's blocker is real and this round confirmed it exactly: **median 25.0% checked
squares** across all 90 shipped puzzles (min 18.8%, max 33.3%; tier medians 25.0 / 23.1 / 26.7)
against the Mini's 100%. Three quarters of the letters have no crossing, so a wrong answer is
never disproved by anything. It is a list of clues sharing a grid.

Round 25 was asked to choose between rebuilding the grid to full checking and cutting the room.
**The measurements say cut, and the reason is stronger than the critic's.** They also say the
brief's two premises about the rebuild are both false, so they are written down here rather
than measured a third time:

- **It is not a layout-engine change.** Every fully-checked, connected grid mask that can exist
  at sizes 3–5 with no entry under 3 letters was enumerated: **251 of them** (1 at 3×3, 15 at
  4×4, 235 at 5×5). **Zero** are fillable from the room's 174-word clue bank — 2,008 seeded
  attempts, no hits. Full checking is reachable only from a much larger word list: all 38
  tested 5×5 masks with ≥8 entries fill from a 2,034-word pool (`enable1` ∩ top-8000 English ∩
  the cozy gate), and fill quality there is fine (ASH/ESSAY/SAUCE/THEME, ROSE/EVIL/SETS/TREE).
  The cost is **authoring, not geometry**: at 20 puzzles a tier and a 6/8/10 entry ladder,
  362 distinct answers of which **305 are new → ≥915 new clues**. At a minimum-contract 12 a
  tier it is still 188 new words / 564 new clues, and that pool ships **288 entries against
  today's 360**. The room's entire authored history is 696 clues.
- **The clue writing does NOT survive a rebuild — it survives a cut.** Only **57 of 362**
  (15.7%) of the answers a fully-checked pool needs clear the manor bank the room's own authors
  hand-picked. A rebuild orphans about two thirds of the 174 words and most of the 360 shipped
  clues. §5.9's writing and the two reviewers who *sat up* at `1D: "Mrs. Bramble's morning
  ritual"` are on the CUT side of this trade, not the rebuild side.
- **Full checking and this room's voice are in direct opposition, permanently.** The clues are
  good *because* the grid is sparse: a skeleton lets an author choose every word, which is how
  you get OWL from "Night's librarian". Full checking takes that choice away and pays in
  connective fill — plural/verb answers go **2.3% → 13.4%**, and ALA, ALT, ANA, ATT, AYE, ABS,
  DEL, BETA arrive with it. You can have a beautifully-clued word list on a grid, or a real
  crossword. At this bank size and this tone bar, not both.

**Why it is not executed here.** Removing the card is not a deletion, it is a re-tuning. Probed
live: taking `linen-closet` out of `deck.ts` alone reds **14 tests across 4 files** — the seal
backlog bands (4.10g, both profiles), the session median (4.11), the padlock gate, the grid's
~32% shape-seal figure, and tier-flow's top-of-house draftability. Each is a published band
with a rationale, and re-deriving fourteen of them in the tail of a round is precisely how a
number gets tuned until it passes. The Closet is also **1 of only 2 micro cards** and the only
one covering `DEAD_END`, so the cut owes a replacement micro archetype, not just a removal.

**And the transplant target in the brief is wrong.** The Study cannot take these clues: its pool
is long forgotten words in three enforced registers (plain gloss / poetic image / riddle, with
leak and overlap gates), and TEA, OWL, PIE are not Study headwords in any register. Re-homing
is its own authoring job and should be scoped as one.

**Also missing, and it is the reason this room has drifted for 24 rounds:** `docs/BENCHMARKS.md`
has **no NYT Mini teardown and no crossword section at all** — the spec the room is judged
against does not exist in the house's own spec document. Write it before the next attempt.

**Known live findings nobody has claimed** (each verified byte-for-byte on a clean HEAD
build, so none is a regression from the round that reported it)
- The Darkroom print `cipher-t2-21` (30 glyphs, 6 words) overflows its stage by 14px at
  375×667 — one glyph short of the `dense` threshold, so it takes full-size cells.
- `tests/round20-drafting-live.mjs` "no wing plate is drawn in gilt";
  `tests/room-persistence-live.mjs` "Library: expected 16 steps, saw 17";
  `tests/critic-round12-live.mjs`'s six.

**Open design questions, awaiting play rather than analysis**
- **Is the skilled player's ground floor thin enough?** Round 23 took him from +0.36 net
  steps a room to −0.96 and his purse from 30 to 20; on the grid-true instrument that drain
  is −0.26, which is 0.007 inside the bound the test asserts. He can still very nearly fund
  his own evening down there, because he solves 90% of what he sits for. That may be exactly
  right — it is what skill should buy — or it may be one more step of walk. It is a single
  constant and `tests/economy-pressure.test.ts` measures it; tune it from play.
- **The seal rate.** Dead ends fell from 13.6% to 7.6% as-played. The owner has noted dead
  ends are a legitimate Blue Prince mechanic and this may now be too forgiving. Also a single
  constant; tune it from play, not from theory.
- **Room adjacency.** Wings made *where* a room goes matter, but rooms still do not affect
  each other the way Blue Prince's do. This is the next real move on the drafting axis, and
  every sketch of it so far moved the step economy.
- **A second volume.** The machinery exists and rolls; only Volume 1 is authored.

---

## 5. How the work runs

Single focused agents, one task each, verified live in a real browser before landing.
Large multi-agent workflows were abandoned after two rounds lost ten agents apiece to a
network outage. Every round: `tsc` clean, full suite green, content and clearance lints
green, production build, then Playwright against **system Edge** (`channel: 'msedge'` —
never a downloaded browser; the download silently fails on this machine) driving the real
game at **both 390×844 and 375×667**, hit-tested with `elementFromPoint` at each control's
own centre *and* its four inset corners — then commit, push, and *confirm the deploy
actually served it*.

**Test count by round: 1,249 (23) → 1,271 → 1,283 → 1,286 → 1,297 (24) → 1,298 (25).**

`docs/AAA_BAR.md` is the enforceable bar (~130 criteria plus a mandatory live-interaction
pass). `docs/BENCHMARKS.md` holds the teardowns of Spelling Bee, Connections, Wordle,
Blue Prince, Hades and NYT Sudoku that the criteria derive from. `docs/COMPREHENSION.md` is
the only document in here written by people who did not already know the answers.

---

## 6. Lessons worth keeping

- **A BREAKPOINT CAN MAKE A HONEST WITNESS LOOK WRONG.** *(Round 33.)* The 11 Aug cold read
  scored a blind tester's "the Kitchen card listed no step reward at all — I couldn't price
  it against its rivals" as a WRONG BELIEF, with the correction "it does: utility cards state
  their numbers in the PREVIEW line". Both halves were true and the tester was still right:
  `blueprint.css @media (max-height: 700px)` carried `.bp-card__preview { display: none }`,
  and on a utility card that line is the only place its numbers are ever printed. Measured
  live before the fix, in a real offer: at 375x667 every preview box was 0x0; at 390x844 all
  three rendered. A comprehension finding that reads like a misunderstanding may be a
  rendering defect wearing one — and the way to tell is to reproduce the tester's viewport,
  not to re-read the source. **When a report contradicts the code, measure the glass at the
  size he held.** The general form: a media query written to spend "the decorative reserve
  first" is only as honest as its SELECTOR. `.bp-card__preview` was flavour on two card
  categories and the price on the third, and the rule could not tell them apart.
- **A GATE THAT CANNOT COME OUT WRONG IS NOT A GATE.** *(Round 25 adds this one, and adds it
  because round 23 stated it and broke it in the same round.)* Round 23 correctly killed the
  vacuous "unspent budget at day end 0.0%" gate — `simulateDay`'s only exit was an empty
  ledger, so 100% of days ended at 0 by construction — and then introduced
  `PROFILE_DECENT.sessionMinutes = 18` against a published "p90 ≤ 23 minutes". The loop broke
  at `sessionMinutes` and the wind-down capped the last room, so no evening could exceed
  ~21.6 and the gate was unfalsifiable (measured max 19.9 over 3,000 days). Round 24 found it
  and made `CLOCK_BAND` the rule: **a modelled stopping rule may never sit below a band
  published about the quantity it stops.** Before trusting a number, ask what value it CANNOT
  take — and ask it of the gate you are writing, not only of the one you are deleting.
- **A HEADLINE MUST BE NAMED FOR WHAT IT MEASURES.** *(Round 25.)* Twice now a filtered
  sample has shipped under a population's name: "79.2% of offers have a real choice" (which
  never asked whether the three cards DIFFER) and "≤2× across the rooms an ordinary evening
  is made of" (which excluded three of the commonest rooms for being short). The second was
  committed in the round that retired the first. If the name and the filter disagree, rename
  the metric or drop the filter — do not do neither.
- **A LOOSENED BOUND OUTLIVES ITS REASON.** *(Round 25.)* Two test floors were walked down in
  round 22 for findings that were honest at the time and that round 24 then invalidated. A
  documented loosening is not a permanent one: when the instrument changes, re-derive every
  bound that was moved to accommodate the old one.
- **A gate whose data is missing does not fail — it changes its mind.** Three deploys in a
  row died because corpora the lints judge against were gitignored. All four are vendored
  now. The frequency list was the dangerous one: absent, the register lint quietly judged
  differently in CI than on a laptop.
- **A stale literal in a gate is worse than no gate.** `tests/tube-day1-live.mjs` reported two
  failures on a clean HEAD for two rounds because it asserted a day-1 purse of 21 against a
  game that deals 22. It trains the next reader to skip two red lines. Derive the number from
  the thing, and assert relatively.
- **Build the thing, then check it is reachable.** The speaking tube was written, the
  campaign retuned around it, and it was wired to nothing — every number in that round
  described a build nobody could play. The same shape had already bitten us twice: dead
  Portrait dialogue, and a back button painted under the chrome. And then a third time: the
  Gallery's "Words need 4+ letters" was authored and unreachable by construction, because
  Claim was disabled below the minimum the message exists to explain.
- **Screenshots are not evidence of interaction.** Three navigation defects survived three
  critic rounds because a buried control photographs exactly like a working one. The bar now
  requires hit-testing at the centre and all four inset corners, at both sizes.
- **A ONE-CLASS SELECTOR LOSES TO A LATER ONE-CLASS SELECTOR, AND SAYS NOTHING.** *(Round
  26.)* The Gallery's hung sheet carried a rule, and a comment explaining it, saying it does
  not want `.anch-done`'s tall leading spacer. `.tw-hung` is exactly as specific as the
  `.anch-done` rule in the short-glass media query 400 lines below it, so on the one glass
  where the saving mattered the later rule won and the panel took 46.7px of leading it had
  explicitly refused. It had been scrolling at 375×667 on every tier for several rounds.
  A comment is not a cascade.
- **A PIN CAN MEASURE THE WRONG THING AND STAY GREEN THROUGH ITS OWN FIX.** *(Round 26.)*
  Round 15 pinned `effortMinutes('twistle', 1) < 2` under the message *"the Gallery became a
  puzzle — retighten 4.10h"*, so the deferred content fix could not be forgotten. The fix
  landed and the room gained fifteen seconds: the pin would have gone on passing, and the
  bounds it guards would never have been retightened by the very thing they were waiting
  for. It was a MINUTES assertion standing in for a PUZZLE-QUALITY claim — the same
  name-versus-computation defect as the two above, one level more subtle, because the number
  it computed was correlated with the thing it meant right up until somebody fixed the room.
  **If a pin is waiting for a content fix, assert the CONTENT FACT.**
- **A DIFFICULTY LADDER WITH NO EXTERNAL REFERENCE IS A HISTOGRAM.** *(Round 27.)* The
  sudoku's three tiers were set from "the measured ceiling distribution over ~1500 dug
  boards" — the generator's own output, cut into thirds — and the test that guarded them read
  `TECHNIQUE_LEVEL` against itself, so it could catch a board in the wrong bin and never the
  table being wrong about what a technique is worth. Both were wrong: two of three storeys
  demanded a wing, a fish or a colouring chain, none of which the benchmark's hardest
  published board requires. **Write the teardown first, then grade against it.** The repo had
  benchmark sections for five games and none for the sixth, and that is the whole story.
- **ONE DIFFICULTY LEVER IS HALF A GRADE.** *(Round 27.)* Given count is a famously bad proxy
  for TECHNIQUE and an excellent one for LENGTH, and the generator had been told the first
  half only — so it dug every board to minimality and shipped fifty-seven placements at every
  storey. The ground floor's twelve and a half minutes were not a technique problem at all.
- **Measure the thing you are claiming.** The rounds that went well ended with a number
  beside the review's number. The rounds that went badly ended with an assertion. Round 25
  adds the corollary: **and re-measure it, in the tree, before you republish it** — eleven
  shipped numbers had drifted from the code they described, several of them inside the very
  files that carry this repo's warnings about drift.
- **The whole-day aggregate hides the storey.** §5.10 survived twenty-two rounds of economy
  tuning because every published number was a per-day total, and a ground floor that charged
  one step a room while a solve paid twelve looked exactly like one that bit. If a criterion
  is about a place, it has to be measured at that place.
- **A model that cannot see the board cannot price the board.** For twenty-three rounds the
  economy simulation had no floorplan — so no change to door layouts, the rigid rotation or
  the sealed-room bounty could move a single published number, and the top of the house
  turned out to be priced by geometry the model could not represent.
