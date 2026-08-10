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

**Seven rooms, 1,107 shipped puzzles.**

| Room | Game | Puzzles |
|---|---|---|
| The Library | Word Web (Connections-style) | 153 |
| The Conservatory | Hive Builder (Spelling Bee-style) | 300 |
| The Gallery | Twistle (grid word search) | 210 |
| The Study | Forgotten Word (poetic definitions) | 113 |
| The Counting House | Sudoku, expert baseline | 120 |
| The Darkroom | Substitution cipher | 121 |
| The Linen Closet | Mini crossword | 90 |

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

## 3. What the last three rounds changed, with their numbers

### Round 23 — the ground floor, the night, and two rooms saying somebody else's sentences

| | Was | Now |
|---|---|---|
| §5.10 Steps in hand on the ground floor (median / skilled) | **28 / 30** against an 18-step budget | **18 / 20** |
| §5.10 Net steps per ground-floor room (median / skilled) | **−0.84 / −0.36** (a wash) | **−2.58 / −0.96** *(re-derived on round 24's grid-true instrument: −1.24 / −0.26)* |
| §5.10 In hand arriving at the first padlock (median / skilled) | 15 / **21** — richer than she started | 12 / 18 *(now 11 / 19)* |
| §5.10 Solve : walk ratio on row 0 | 12 : 1 | **6 : 1** (one price, −2, across rows 0–2) |
| §5.9 Darkroom plaintexts that are stock proverbs | **59 of 94 (62.8%)** | **0 of 121** |
| §5.9 Linen Closet unique clues per entry | **0.431** (155 of 360) | **1.000** (696 clues over 174 bank words) |
| §5.9 Most-repeated crossword answer / clue | SUN ×12 · "Parchment guide" ×8 | ×4 · **never twice** |
| §5.11 Night-line variants (the last thing she reads) | **3**, keyed by end cause alone | **30** authored beats, 27 keyed to the day |
| §5.11 Distinct goodnights across consecutive nights, driven live | **2 in 6** | **8 in 8** |
| 6.19c Linen Closet clue rows visible at 375×667 | 1 of 5, with a row's own centre over the QWERTY | 2 of 5 (3 on a 4×4), every row whole |
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
- **§6 content commissions, which are also both ends of the wage ratchet.** The Gallery is
  not yet a puzzle at tier 1 (one minute), and the Counting House at tier 2 is a 27-minute
  expert board that should bank across days. Fixing either FAILS 4.10h on purpose and forces
  the published spread down.
- **The deck's door layouts.** Round 24's finding hands this to the next round: the top of
  the house is priced by geometry, and the dominance rate (67.0% against a <40% target) comes
  down through **finer spread**, not de-correlation — frontier spread is zero on 31.3% of
  offers and all three cards are one category on 19.9%.
- **Key supply for the median player.** With the key model fixed, round 10's "skill, not just
  persistence, earns the campaign" holds for the skilled player (20,213 solve keys against
  17,342 deck) and **fails for the owner's own profile** (13,882 against 15,700). Recorded,
  not tuned — round 24 was an instrument round and could not touch `deck.ts`.
- **§5.9 remainder.** The Darkroom and the Linen Closet are done. The Library's 612 threads
  still hold two about the manor; the Gallery and the Conservatory carry no authored prose
  field at all, so neither can speak until its room shell grows a surface to speak from; the
  Study's 113-entry pool is still the thinnest per tier in the game.
- **§5.11 remainder.** Per-room palettes still borrow from other products.

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
