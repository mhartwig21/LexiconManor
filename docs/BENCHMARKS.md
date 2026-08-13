# Lexicon Manor — Benchmark Teardowns

*Distilled from team research (Aug 2026). These are the games we measure ourselves against.
Every number here was verified against the shipped product or primary sources; where a value
is an implementation estimate from clones/teardowns it is marked ~. Companion docs:
`AAA_BAR.md` (the enforceable bar), `ARCHITECTURE.md` (the build plan), `MANOR_DESIGN.md`
(the design).*

---

## 1. NYT Spelling Bee → benchmark for the Conservatory (Hive Builder)

### Geometry & input
- Hive = 7 pointy-top regular hexagons (1 center + 6 petals), each an SVG polygon with
  `viewBox="0 0 120 103.92"` (2 : √3 width:height). The hive scales as one SVG unit via
  percentage transforms — zero layout shift ever.
- On a typical iPhone the hive is ~240–280px wide → each hex ~75–90px across, roughly **2×
  Apple's 44pt minimum tap target**. Hive sits in the lower half (thumb zone); entry line
  above; found-words drawer above that; rank bar at top.
- Tap feedback: hex scales down (~0.8) and springs back, total <150ms, no sound. Letters
  appear in the entry line at touchstart-level responsiveness — **imperceptible input
  latency is the single biggest premium signal**.
- Entry line: large (~30px) bold uppercase letters, blinking yellow caret. **Live letter
  coloring** before submit: center letter yellow, valid letters black, letters not in the
  puzzle light gray — you can see a doomed word before pressing Enter. Long entries shrink
  font size rather than wrap.
- Control row: Delete / shuffle / Enter pills. Shuffle fades the 6 petals out (~200ms),
  repositions, fades in; **center never moves**. Free, unlimited — the de-facto hint
  button. Delete supports press-and-hold repeat.

### Scoring (exact)
- 4-letter word = 1 pt; N-letter word (N≥5) = N pts; pangram = length **+7** (7-letter
  pangram = 14).
- Every puzzle guarantees ≥1 pangram. Editor bans the letter **S** (kills plural
  inflation) — curation rule that silently keeps the list honest.
- Real scale: typical puzzles 45–80 words; historical max-score range 47–537; average
  answer length ≈5.3 letters. Example day: 17 answers / 82 max / Genius at 57.

### Rank ladder (the retention machine)
Thresholds are **percentages of that day's max score**; labels never change:

| Rank | % of max | | Rank | % of max |
|---|---|---|---|---|
| Beginner | 0% | | Nice | 25% |
| Good Start | 2% | | Great | 40% |
| Moving Up | 5% | | Amazing | 50% |
| Good | 8% | | **Genius** | **70%** |
| Solid | 15% | | Queen Bee (hidden) | 100% |

Why it works:
- **Front-loaded dopamine**: 2/5/8/15% = ~4 rank-ups in the first 2 minutes.
- **Ranks are second-person compliments** ("Nice", "Amazing", "Genius"), not neutral tiers.
- **The sanctioned finish is 70%, not 100%** — you "win" with ~30% of content unfound; you
  stop feeling smart, never exhausted. Queen Bee (100%) is an unadvertised Easter egg.
- "Points to next rank" is always visible — "7 to Genius" is the strongest one-more-word
  hook in the game.

### Feedback taxonomy
- **Valid word**: praise toast scaled to score ("Good!"/"Nice!"/"Awesome!", "Pangram!")
  with "+N"; word flies into the found list; score ticks; total ceremony ~800ms,
  never blocks input.
- **Invalid word**: horizontal shake (~3 oscillations, ~300ms) + terse black toast +
  **auto-clear after ~1s** — you never manually delete a failed word. Complete message
  set (all terse, blame-free): *Too short · Missing center letter · Bad letters · Not in
  word list · Already found.* **No penalty of any kind — failure costs ~1 second.** This
  is load-bearing: spam-guessing is a legitimate, fun strategy.
- **Pangram/Genius**: deliberately disproportionate — yellow burst on the letters;
  Genius = full-screen modal with bespoke bee mascot art ("Beeatrice"). Character art as
  a milestone payoff.

### Ritual & restraint
- New puzzle 3:00 a.m. ET; no streak counter — warmer than Wordle's obligation. The daily
  Forum publishes a **grid** (word counts by first letter × length) and **two-letter
  list**: hints are **quantitative silhouettes, never letters** — the game shows the shape
  of the unfound space, your brain does 100% of the finding.
- Visuals: NYT Franklin type, near-monochrome, **one accent** (#F7DA21 yellow) that only
  ever means something (center, caret, progress, pangram). Outer hexes flat #E6E6E6.
  The restraint is the luxury.

### Steal / Fix for the Conservatory
**Steal:** hex geometry + one-unit SVG scaling; live entry coloring; the 5-message
invalid taxonomy + auto-clear; free unlimited shuffle; the 2/5/8/15/25/40/50/70% ladder
shape with a hidden 100% tier; silhouette-style hints on exit; single-accent discipline.
**Fix/beat:** SB is silent (add harp/chime SFX, pitch rising with word length); SB has no
context (our payouts change the day's route); SB's compliments are disembodied (Fern can
react in-character); **do not tax invalid dictionary words with steps** — SB proves free
failure is the fun (see AAA_BAR §1 and the economy ruling in AAA_BAR §0.3).

---

## 2. NYT Connections → benchmark for the Library (Word Web)

### Mechanics
- 16 tiles, 4 groups of 4. Difficulty colors (yellow < green < blue < purple) revealed
  **only on solve** — a post-hoc grade, never player information.
- 4 mistakes allowed (dots deplete); 4th mistake auto-reveals the board. Wrong guesses
  give near-zero information — the most-attacked design decision.
- **"One away"** toast fires only when exactly 3 of 4 share a group; never says which 3.
  Its *absence* is also read as signal (the famous dating-apps trap).
- Reveal choreography: selected tiles hop sequentially (~100ms stagger) — a suspense beat
  — then correct groups slide/merge (~350ms pre-delay, ~1s ease) into a full-width colored
  banner (category name + words), stacked in solve order. Wrong: horizontal shake + dot
  drain. Input locked during animation.
- Shuffle: one-tap, unlimited — necessary because **the starting layout is deliberately
  adversarial** (editor clusters decoys adjacently).
- Endscreen grades by mistakes: Perfect! / Great! / Solid! / Phew! Share grid = colored
  emoji rows per guess in order.

### Authoring principles (Wyna Liu)
- **Red herrings are first-class content**: fake fifth categories, 5-words-fit-only-4-belong
  traps, purple stealing the obvious member of an easier group via wordplay.
- Human calibration: testers vote on whether yellow→purple ordering "feels right";
  unanimous objection = swap.
- Intended skill is **deferring guesses** until other solves disambiguate — the game
  rewards withholding, yet guessing is the only verb. That tension is why it feels cruel.

### The fairness rap sheet (Koster et al.) — what we must fix
1. **Trivia, not system**: crystallized knowledge, no learnable method, no mastery loop.
2. **Feedback poverty**: binary right/wrong; misses prune the trivia space, not the logic
   space.
3. **Red-herring budget rule** (directly actionable): a board should contain *fewer*
   unintended-but-valid groupings than the mistakes it allows. NYT boards routinely
   violate this (balloon/bassoon/oboe/saxophone all have doubled vowels — a real pattern
   the author never saw).
4. **Anticlimax by elimination**: the hardest group solves itself as leftovers — the only
   category you never actually deduce. (Proposed fixes: a 17th decoy tile; require naming
   the final group.)

### Steal / Fix for the Library
**Steal:** hop-then-verdict suspense beat; slide-merge banner reveal; adversarial starting
layout + prominent shuffle; difficulty grading revealed on solve; graded warm endscreen
copy. **Fix:** enforce the red-herring budget **in the build-time validator** (we have a
pipeline; NYT doesn't); make every wrong guess yield ≥1 bit ("one away", intruder hints,
acknowledged herrings — "they *do* all rhyme, don't they? But no."); require an act of
naming for the final group; cap trivia categories at 1/board (always the easiest tier);
steps-not-lives (already in the design).

### The number the Library is graded on, and the rule that supplies it (round 30)

The mechanics above are met. The one that is not is a COUNT: a Connections board argues about
**2–4 tiles**, and this room's median was 1 — three of its four threads uncontested, so the
evening is a sort rather than a puzzle. Contested tiles (`ambiguousWords`, deduped intruders,
NOT the named-thread count, which is a different and larger number) is therefore the Library's
headline figure, and 2 is the floor the format wants.

Round 30's finding, recorded here because it is a fact about generated word puzzles rather than
about our code: **a board is cheapest to contest before it exists.** Budgets, planters and
ceilings can only redistribute what the sixteen words already offer, and four hand-written
categories nearly collide about once. So a category earns its place partly by what it can be
ARGUED WITH — and a category with no token in it (a house category written for its subject; a
shape mechanic like `Spelled Without a Vowel`) can be argued with by nothing at all. The
authoring rule that follows: write a pool in two registers, so that some members make the
category true and at least three are ordinary English words the rest of the bank is built out
of. That is what stops "in the house's voice" and "the board pulls against you" being opposed.

### Round 35's finding, and it is the other half of round 30's

Round 30 said a board is cheapest to contest before it exists, and that the shelf therefore
needed AUTHORED supply. It did. What it did not say is why authoring one was expensive, and the
answer is a fact about generated word puzzles worth writing down here rather than in a code
comment: **a generator discovers a contested tile by SPELLING, and an editor writes one by
MEANING.** Every detector this project had — shared affix, doubled letter, rhyme key, hidden
string — asks whether two categories collide in their letters, and four hand-written categories
collide in their letters about once. Connections' editor is not doing that. She is choosing a
word that honestly belongs to two threads.

The cheap version of that for a pipeline is MEMBERSHIP: a pool holds more members than a board
deals, so the undealt members are provable fifth members of a category that is on the board, and
no phonetics or substring search is involved. It costs one authored list per category — which the
bank already was. That single change took this room's median from 1 to 2 and its share inside the
2–4 band from 39% to 58.5%.

Two rules come with it, both paid for during the round:
 * **Two pools may share at most three words.** Share four and a dealt hand can BE the other
   pool's whole category under a second label, which is a second right answer rather than a
   trap — the one thing a contested tile must never become.
 * **A trap may ship only where the room can say why, truthfully.** Membership is true of
   categories whose truth no relation can express (`Add a "T" for a New Word`, `Hidden Fruits` —
   each word hides a DIFFERENT fruit). Supply is not worth a sentence the player can check and
   find false; this is round 12's doubled-letter finding in a new place.

### Round 50's clock — and the number the room is GRADED on cannot be the one it is CLOCKED on

`ROOM_EFFORT['word-web']` was `[4.5, 5.0, 6.0]` with no derivation under it: one line, *"16
tiles, 4 groups, 1 ambiguous, 1 herring"*, with no tier in it.

The obvious candidate for a tier lever is the room's headline figure, and it does not work.
**Contested tiles (`ambiguousWords`) are a median 2 at every tier on the shipped pool, and so are
herrings.** That is the format working as intended — 2 is the floor Connections wants and the
room now clears it at all three storeys — but it means a clock built on the graded number would
have no tier in it at all. *A room's difficulty grade and a room's clock are not the same
measurement, and this is the cleanest example of it in the repo.*

What does move, monotonically, is **how many of the four threads read straight off the tiles.**
`TIER_SPECS.minPlain` is 2 / 1 / 1 and the shipped shelf carries a median **3 / 2 / 1 PLAIN**
categories (`isPlainish`: semantic, trivia or compound — solved by thinking in English). The
other 1 / 2 / 3 are WORKED: an anagram, a silent letter, a doubled pair, invisible until you
perform something on the word. That is Koster's rap sheet answered as a clock — a worked thread
is a *mechanic you have to find*, a plain one is a *list you have to recognise*, and they do not
cost the same.

| | tier 1 | tier 2 | tier 3 |
|---|---|---|---|
| plain / worked categories (median) | 3 / 1 | 2 / 2 | 1 / 3 |
| contested tiles (median) | 2 | 2 | 2 — **flat, by design** |
| `ROOM_EFFORT` | 4.5 | **5.25** (was 5.0) | 6.0 |

**Only the middle tier moves, and it is forced rather than chosen.** The two rates come off this
row's own two ends, which round 22 set and never derived — that half is circular and the code
says so. What has teeth is the over-determination: with plain counts of exactly 3 / 2 / 1, two
rates and three tiers leave one degree of freedom, and the arithmetic makes **t2 the mean of the
ends**. A tier-2 board carries one more worked category than a tier-1 board and one fewer than a
tier-3 board; it cannot cost less than the midpoint. The implied rates are **56.25 s a plain
category and 101.25 s a worked one**, both inside the bands `WEB_CLOCK` publishes.

**No payout moves** (0.45 × 5.25 = 2.36, the +2 the room already paid) and the wage falls
0.400 → 0.381 moves a minute at tier 2, interior to all four of AAA 4.10h's populations.

### Round 51's finding — THE REGISTER MIX, and the number the room had never been asked for

Everything above grades a board on how much it ARGUES (contested tiles, herring budget, the colour
ladder). Nothing graded what it argues ABOUT, and Wyna Liu's boards are built on exactly that: one
category is a list you know, the next is a trick you perform, and the tension between the two KINDS
of thinking is the puzzle. Measured, the shelf had drifted to one kind.

**THE REGISTER OF A CATEGORY IS WHAT A SOLVER MUST DO TO FIND IT**, and there are three:

| register | the operation | examples |
|---|---|---|
| MEANING | know what the words MEAN; nothing is done to the string | `Things a Housekeeper Counts`, `Kinds of Cloud`, `Greek Gods` |
| PHRASE | know what the words COMBINE WITH — a search of English phrase-space | `___ FIRE`, `Can Precede "KEEPER"` |
| FORM | operate on the LETTERS or the SOUNDS | `Contains "TEN"`, `Anagrams of "LISTEN"`, `Silent "N"` |

The distinction between the last two is not new here — round 13's `LETTER_MECHANIC_FAMILIES` makes
it in prose (*"solving `Contains "TEN"` is one skill applied identically every time; solving
`___ BAR` is a search of English"*) — but nothing counted it, so the shelf's own census called both
"wordplay" and could not see a monoculture forming inside one of them.

**THE ARITHMETIC THE FORMAT IMPLIES.** Three registers, four slots, and "at least two different
kinds of thinking" therefore means **no register may hold more than half the board**: FORM ≤ 2,
non-FORM ≥ 2, and at least one of those two MEANING — because `___ BAR` and `Contains "TEN"` are
two ways of playing with the word and only a semantic category is about the world. Not one of those
is a measured level rounded up.

| measured on the shipped shelf | round 50 | round 51 |
|---|---|---|
| boards with no category read in English | 10 of 183 | **0 of 157** |
| median FORM categories, t1 / t2 / t3 | 1 / 2 / 3 | 1 / 2 / 3 |
| boards over the FORM cap | 40 (all at tier 3) | 38 (all at tier 3) |
| …at tiers 1–2, where it is gated | 1 | **0** |
| purple is a FORM category | 174/183 | 154/157 |

**AND THE COLOUR LADDER WAS THE CAUSE OF THE THIRD ROW, not the editor.** `lateralOf` gave a
MEANING category a ceiling of 0 + 1 + 1 + 2 = **4** and purple's floor is **5**, so plain English
could not be the last colour on any board at any tier. The meaning axis is measured now — Zipf's
meaning-frequency law read off the shipped corpus, `content/lib/core-vocabulary.ts` — and a
core-word hand reaches 6, with an INTRINSIC ceiling of 4 that keeps the last colour something a
board has to earn with traps rather than with vocabulary. The share it actually ships is the round's
published debt (`docs/THE_CLIMB.md` §1i); the cause is `minSubtle`, which is an owner directive.

**WHY THE INSTRUMENT CAN DISAGREE WITH THE SHELF.** MEANING is not the residual bucket
`typeOfTheme` makes it: a category whose label carries a quoted token or a `___` is refused it
outright, and a category whose four TILES share a substring, an edge, a doubled letter or a rhyme is
refused it too, because a solver finds that group with the label covered up. The round-50 shelf is
checked in as a fixture and read by the same instrument, which names one such category by hand
(four tiles all containing BERRY) and reproduces every count above.

---

## 3. Wordle → benchmark for reveal juice, error states, daily ritual (all rooms)

- Tile flips: vertical rotateX, one at a time left→right, ~500ms flip, ~250–400ms stagger,
  color swapped at the 90° midpoint; total row ~1.5–2s. **Instant color change would have
  killed the game** — the cascade is engineered suspense, reproducible in ~15 lines of CSS.
- **Keyboard as memory prosthetic**: each key holds the best state earned so far
  (green > yellow > gray, never downgrades), updated only *after* the row reveal finishes.
- Invalid word: row shake + "Not in word list" toast; **guess not consumed**. Gentle refusal.
- Win: staggered jump/bounce "dance" across the winning row (~100ms/tile) — distinct from
  the reveal flip.
- Hard mode: difficulty by *constraining* the player (revealed hints must be reused), not
  by adding content.
- Share grid was invented by a player and adopted as a button; legible but spoiler-free.
- Streak psychology: streaks flip motivation from appetitive to protective (loss aversion —
  losing a 100-day streak hurts ~2× what gaining feels like). **Anti-cozy. We track only
  unloseable lifetime stats in the Chronicles.**

---

## 4. Blue Prince → benchmark for drafting, steps, the mystery (Metacritic ~92)

### Drafting (exact)
- 3 floorplans per door, always; **draft cannot be cancelled once opened** (resented —
  we fix this).
- **Slot 1 guaranteed free** if any free plan exists; a gem-cost plan landing in slot 1 has
  its cost waived. Slot 2 gem-draw chance scales with rank *and current gems* (0% at rank 1
  / 0 gems; 59.26% at ranks 8–9 / 4+ gems). Slot 3: 75–93.75% gem draw when slot 2 was
  free. **The game offers premium rooms only when you can afford them.**
- Two-stage draw: roll rarity tier (Commonplace/Standard/Unusual/Rare) → roll room of that
  tier. Higher rows skew rarer. Rarity re-tunes by day number and milestones.
- **Anti-repeat filter**: rooms offered in the previous draft are suppressed next roll at
  rarity-scaled rates — Commonplace 60%, Standard 80%, Unusual 90%, Rare 99%.
- Day 1's first draw is scripted (Bedroom, Closet, Hallway) — hand-authored tutorial
  disguised as RNG.
- Placement constraints: corner cells only dead-end shapes; edge cells forbid 4-door rooms;
  never all-three-dead-ends; orientation biased toward keeping paths flowing.
- Deck manipulation is the strategy layer: drafting a dud removes it from the day's pool;
  items permanently edit rarities. Critics specifically praised "draft the inconvenient
  room early to thin the pool."

### Step economy (exact)
- 50 steps/day base (70 upgraded; Curse Mode 13). **1 step per room entry**, re-entry costs
  again. Ratio ≈1.1 steps per cell before refunds — **refunds are what make deep runs
  possible** (Bedroom +2/entry, Guest Bedroom +10 first entry, Nursery +5 per subsequent
  bedroom drafted, food +2…+30, Silver Spoon doubles food).
- Compounding refund pattern ("+N per future X drafted") is the interesting one — maps to
  e.g. "Kitchen: +2 steps per green room drafted after it."
- Mercy rails: Nurse's Station floors you at 20 if below 10; Sauna banks +20 into
  *tomorrow* (cross-day investment).
- **At 0 steps: ~4-second wordless dusk fade, walk-but-no-interact grace, no failure
  screen.** Exactly the tone MANOR_DESIGN §4 wants — validated.

### Room taxonomy
Seven colors; every non-blue category has **exactly 8 rooms** (memorizable): blue =
default (46), violet = bedrooms/refunds, orange = hallways, green = gardens/gems, yellow =
shops, red = danger risk-reward, black = secret tier. Color is mechanically load-bearing
(items filter/count by color). Lesson: small, equal, memorizable categories; consider a
red-style "risk" category eventually.

### The mystery layering
Tiers: systems literacy → room-local repeatable puzzles → cross-room contraptions → the
paper layer (letters braid lore + tutorial + clue in one channel) → meta/lateral layer.
**Knowledge is the only true gate** — a fresh save can finish fast if you know the answers
("metroidbrainia"). Early/mid pacing praised ("solving one puzzle spawns two more"); late
game collapses into RNG lottery when the last threads each need one rare room.

### The criticism list (our to-fix list)
1. **RNG-gated verification**: solving in your head then waiting dozens of runs to test it
   (7 days to connect two rooms; a shop absent 12 consecutive eligible runs).
2. **No journal**: players kept 44 pages of notes / 900 screenshots; can't re-read found
   documents; some docs require *two visits* to read.
3. **Retraversal busywork**: re-climbing after credits; trial-and-error across runs with no
   indicator; false leads with no wrongness signal wasted hours.
4. **Slow repeated animations** on drafting/pickup — resented by run 30; deadly on a phone.
5. **Forced picks**: uncancellable drafts read as hostile.

### Steal / Fix for the Manor
**Steal:** affordability-aware offers + free slot 1; two-stage rarity draw scaled by row;
anti-repeat suppression; scripted first draft; equal-sized memorizable categories;
dud-drafting thins the pool; compounding step refunds; 4s dusk fade; cross-day
investments (Fern's seeds, a tea variant); letters as braided channel; knowledge-only
final gate winnable day one.
**Fix:** every clue fragment reachable via ≥2 source types + pity timer; auto-journal
everything, re-readable in ≤2 taps; allow backing out of a draft; documents journal in
full on first sight; characters signal insufficient-info before a false lead burns an
hour; all interactions ≤300ms or tap-skippable; no re-climb after any "credits" beat.

---

## 5. Hades 1/2 → benchmark for dialogue & characters

### Scale (the honest numbers)
- Hades 1: **21,020 voice lines, ~305K words, 30 characters.** Protagonist ~8,500 lines;
  a fully-alive major NPC = **~400–1,600 lines**; joke-minimal characters still 100+
  (Charon: ~120 highly-flavored grunts — an oracular character can run lean).
- **Hypnos has 75 distinct lines reacting to how you died** — one character, one context
  slot, 75 variants. The single most load-bearing number for "the game sees you."
- Repetition tolerance: tens of hours before a repeated *conversation*.

### Selection system (salience-based storylets, not branching trees)
1. Each NPC owns an ordered list of conversation entries with requirement fields:
   seen/not-seen line IDs (story chains), min counts, game-state predicates.
2. On interact: build eligible set → priority buckets — **forced story beats > contextual
   event reactions > relationship-chain next node > general pool > repeatable idle** —
   weighted-random within a bucket.
3. Seen-tracking = flat persistent set of conversation IDs. **Stale content is never
   invalidated** — an out-of-date line beats silence; nothing becomes permanently missable.
4. **One substantive conversation per NPC per visit**; afterwards short idle lines. This
   pacing valve is why 40 conversations last 40 days, not 4.

### Failure as content
Death is re-framed as arrival home; the new-dialogue drip is the guaranteed consolation
payout of every failed run. Failure *increments* the counters that unlock lines success
can't. Our death-equivalents: day ended at 0 steps, wrong Sanctum guess — both must be
first-class dialogue triggers.

### Affinity / gifts (exact)
- Hearts filled **only by gifts** (+1); conversations advance a *separate* story-chain
  track; milestones require BOTH. First gift → the character gives you a mechanical
  keepsake + bespoke reaction scene. Every gift rank = bespoke dialogue.
- After 5–6 gifts, hearts **lock** behind a personal favor quest; completing it unlocks
  the top ranks (filled by a rarer currency). **The locked-rank + favor beat is the
  strongest retention hook in the loop** — copy it for ≥3 characters.
- One gift per character per run (pacing valve).

### Presentation
- **Static painted portrait**, no animation/lip-sync, ~half–⅔ screen height, overlapping
  the text box. Speaker-only (protagonist gets no portrait — halves the art budget).
  **Portrait variants encode story state** — the portrait itself is a progression reward.
- Typewriter timed with VO; tap 1 = complete text, tap 2 = advance. Skipping never skips
  the event, only the pacing. Keyword highlighting doubles as soft tutorialization.
- Choices are rare and mostly verbs (gift / ask / farewell), cosmetic-plus-flag, never
  plot forks. Reactivity lives in the selection system, not branching.
- PWA defaults derived: 40–60 chars/sec typewriter, portrait in ≤250ms, longest authored
  line must fit the box with zero scroll (validator-enforced, ~220 chars/box).

### Volume floor for "alive" (derived for our cast)
Rule: unique conversations ≥ number of greetings in the content's lifespan +30% slack.
Per major character for Volume 1: first-meeting chain 2–3 · **event reactions 12–20**
(the bucket that reads as "alive" — the Hypnos lesson) · arc/affinity chain 6–10 ·
general pool 10–15 · idle repeatables 6–10. **Total ≈40–55 conversations ≈150–220 lines
per major character; ~800–1,000 lines for the cast of 5.** Below ~25 conversations a
character exhausts in under a week and the illusion collapses. Portrait can run leaner
and stranger (Charon precedent); Dewey needs 0 by design.

---

## 6. Cozy visual references → benchmark for the style guide

- **Blue Prince (art)**: a full year on the look; imperfect sketchy linework; **color =
  mechanical category, double-encoded** (card border + interior decoration + glyph);
  8 rooms per specialist color — rarity legible from color distribution alone.
- **Strange Horticulture**: muted world, **saturated color spent only on interactables**;
  tactile UI (map dragged from a drawer, crinkling paper SFX cited in reviews as core
  delight); ambient life is cheap (swaying vines, flickering candles, rain on windows);
  the cat was "arguably their most impactful decision" — validates Dewey.
- **A Little to the Left**: the touch-first grabbable signal — on touch an object
  **grows (~4%), lifts (shadow 0→4px), tilts (~2°)**. Steal the trio for every draggable.
- **Cozy Grove** (negative lesson): hidden-object needs killed their contrast; we are
  legibility-first — reserve high contrast for game state.
- **Card Shark**: pick **one real print process and imitate its physical artifacts**
  (for us: etching — plate tone, fuzzy acid-bitten lines) rather than a sepia filter.
  Period authenticity comes from process.
- **Ex-libris heritage**: bookplate composition = image in frame + name + motto banner —
  literally a room-card template. Ribbon & Wreath (oval shield, ribbon bow, laurel) is
  the most "cozy manor" cartouche style. WSJ hedcut stipple/hatch = the portrait method
  (author at 240×300, display at 72–96px, simplified LOD at 48px).
- Full palette tokens, type ramp (IM Fell English ≥22px display / EB Garamond ≥16px body),
  stroke ladder (3.0/2.0/1.2 at 240-unit scale, max 3 hatch layers), grain/vignette
  recipes, and chrome patterns (wax seal = commit, ribbon = navigation, rubrication =
  red only for state) are codified as testable criteria in `AAA_BAR.md` §6.

---

## 7. NYT Sudoku → benchmark for the Counting House

*Written in round 27. Until then this document had teardowns of five games and a
style guide, and the Counting House — the longest room in the manor — was
measured against nothing. Its tier ladder cited "NYT hard" in three source
comments and there was no NYT row anywhere to check them against.*

### The published ladder (the whole of it)

The NYT ships **three** sudoku a day and only three: **Easy, Medium, Hard**.
There is no Expert, no Diabolical, no Evil. That is the first fact and it is the
one the Counting House kept getting wrong — a room whose EASIEST tier sits above
the hardest board the benchmark publishes is not "expert baseline", it is
ungraded.

| NYT tier | Givens (~) | Empty cells (~) | Techniques the board actually requires |
|---|---|---|---|
| Easy | 36–40 | 41–45 | naked and hidden singles, nothing else |
| Medium | 30–34 | 47–51 | + **locked candidates** (pointing / claiming) |
| Hard | 25–28 | 53–56 | + **naked / hidden pairs and triples** |
| — (not published) | — | — | X-wing, XY-wing, swordfish, XYZ-wing, colouring |

The bottom row is the important one. **NYT Hard never requires a wing, a fish or
a colouring chain.** Every NYT puzzle is solvable by pure logic with no guessing
and no chain longer than a subset — that guarantee is the product. A board that
turns on an XY-wing is not a harder NYT puzzle; it is a puzzle from a different
publication.

### Time, and why it is the number that binds
- Solve times are personal, but the shape is stable across solver reports: for a
  practised daily solver Easy is ~3–5 min, Medium **~6–9 min**, Hard **~10–14
  min**. A board demanding wings/fish/colouring runs **~15–20 min** for the same
  solver, because the exotic step is a *search*, not a scan — the eye has to
  sweep the whole grid for a pattern that may not be there.
- Both levers move it, and they are independent: **empty cells set the floor**
  (every cell is a placement, ~6–9 s each once the technique is known) and
  **technique demand sets the multiplier** (the stall, the re-scan, the pencil
  pass). This is why given count alone is a famously bad difficulty proxy and
  also why it cannot be ignored: a 24-given board that falls to singles is still
  fifty-seven placements.

### The interface, in one paragraph
9×9 grid; tap a cell, tap a digit. **Notes/candidate mode** is a first-class
toggle and **Auto-candidate mode** fills every mark — NYT ships the crutch its
own Hard tier makes necessary, and does not price it. **Undo is unlimited and
free.** A wrong digit LANDS: the board lets you be wrong and live with it, and
"Check puzzle" is the separate, deliberate verb that grades you. There is no
mistake counter, no fail state, no timer you cannot hide.

### The thing NYT does that the manor could not
**The board is still there tomorrow.** An unfinished NYT sudoku is saved,
per-difficulty, and reopening the page returns the exact grid with the exact
pencil marks. It is the only NYT game with no daily reset on the *board* — you
do not lose a Hard you were forty cells into because you went to bed. This is
not a nicety; it is what makes a 14-minute puzzle survivable inside a life.

### Steal / Fix for the Counting House
**Steal:** the three-rung ladder AS PUBLISHED — Medium, Hard, and one rung above
anything NYT prints, each with a distinct *technique* requirement rather than a
distinct label; both difficulty levers moved together (fewer givens AND harder
technique as the tier climbs); auto-candidates free; wrong digits allowed to
land; **and the unfinished board that is still yours tomorrow.**
**Fix/beat:** NYT's Hard is the ceiling of a general-audience newspaper — the
owner's directive is that the top of our ladder sits above it, which the bottom
row of the table above defines exactly. What we may not do is put that board on
the ground floor and call it tier 1.

---

## 8. NYT Strands → benchmark for the Gallery (Twistle)

*Two rounds running, a Gallery was judged against a teardown that was not in this file. It is
here now. Strands is the only mainstream word game whose input gesture is ours — trace a path
through touching tiles — so it is the benchmark, and the one thing it does better than anything
else is what it does with a word you traced that it did not want.*

### Geometry & input
- **6 wide × 8 tall = 48 tiles.** Not a square. Trace through king-adjacent tiles (diagonals
  count), no tile reused inside one word; release to claim. Tap-to-build is offered as well.
- **Every tile belongs to an answer.** The board is exactly tiled by the theme words plus the
  spangram — there is no filler on a Strands board at all. The letters you have not used yet
  are therefore a live, honest clue about what is left.
- One **spangram**: the answer that names the theme and touches two opposite edges of the
  board. Found spangram is gold, found theme words are blue.
- A short **clue in words** sits over the board ("Get in shape"), and the theme is oblique
  rather than technical. The puzzle is a category puzzle wearing a word search's clothes.

### The rule this room exists to steal: A TRACED REAL WORD IS NEVER "WRONG"
This is the whole teardown in one line, and it is the exact defect the round-17 Gallery had.
- A theme word → counts, highlights, permanent.
- **Any other real word of 4+ letters → NOT rejected.** It is acknowledged, counted, and
  **three of them buy a hint**, which lights up the tiles of one unfound theme word (you still
  have to trace it). The counter toward the next hint is on screen at all times.
- Only a non-word gets the shake.

So Strands has **two classes of accepted word and no class of refused real word.** The player
who traces LEAN off a board about footwear is told "that is not the theme, and it is worth
something" — never "LEAN is not a word", which is a lie, and never a silent bounce, which
reads as a bug. A word search's single worst feeling is tracing a word you can see and being
told no; Strands designs that feeling out of existence rather than tuning it down.

### ROUND 44 — WHAT STRANDS PAYS FOR AN OFF-THEME WORD, AND WHY OURS PAYS SOMETHING ELSE

Strands' answer to *"what is this extra word FOR"* is **three of them buy a hint** — a currency
that exists only inside the puzzle, spends only on the puzzle, and cannot leak into anything else.
The Gallery has no hint to sell, and the manor has exactly one currency (moves), so the same design
question has a different answer here: **a study hands back the move she spent walking into the
room. Once a board.**

It is deliberately a REFUND and not a wage, and the reason is a number rather than a taste: the
Gallery is already the joint TOP of the house's wage table (0.80 moves a minute, and it is there
because the cozy floor catches a 1.25-minute room), so a study paid at the ledger's smallest coin
would take the published wage spread **4.53× → 12.6×**. Strands can pay in hints precisely because
a hint is worth nothing outside the board; the manor's equivalent of "worth nothing outside the
board" is money she has already spent. See `docs/THE_CLIMB.md` §1c.

The owner found the gap the way Strands players never would: *"for the words that aren't part of
the gallery, it was confusing what their purpose was. It didn't automatically add steps."* Strands
tells you on the board — the hint meter fills where you can see it. We were telling her in a
sentence that `@media (max-height: 700px)` deleted.

### What Strands does NOT have, and why it matters to us
- **No score. No rank. No ladder.** Completion is binary — all theme words plus the spangram —
  and the share card is a row of 🔵/🟡 with 💡 per hint used. Nothing accrues, nothing ranks.
- That is survivable for Strands because the *theme reveal* is the payoff and because it is a
  once-a-day ritual with a fixed, knowable end. It is **not** survivable for a roguelike room
  she meets forty times in a campaign, which is why the Gallery cannot copy Strands whole.
- So the Gallery is a **hybrid by design**: Strands' acceptance model (§8) bolted to the Bee's
  rank ladder (§1) — the ladder is the retention machine, and a word search has better material
  to rank on than a Bee does, because a traced word carries a *shape* as well as a length.

### Difficulty, where Strands actually puts it
Not in length and not in count (7–9 answers most days). It is in **the theme's obliqueness** and
in **the board's interference**: because every tile is spoken for, the letters of one answer sit
directly across the path of another, so the eye keeps assembling near-misses. Hard days are hard
because the grid is dense with plausible wrong traces, not because the words are rare.

### Steal / Fix for the Gallery
**Steal:** the two-class accept model, exactly — a real, traceable word she plausibly knows is
never refused; it lands somewhere and it is worth something. And Strands' honesty about which
rule is doing the work: the room states its own constraint over the board.

> **ROUND 38 — AND "PLAUSIBLY KNOWS" IS NOT A LINE THE ROOM MAY DRAW.**
> Twice this room was fixed against that sentence and twice the fix was graded with an
> instrument that shared the fix's own bounds — a solver blind past eight letters, and a
> "she plausibly knows it" bar drawn at the exact rank where the tier's vocabulary band
> stops. The rule is *simpler* than the sentence and it is the one this room now runs on:
> **every word of the game's dictionary she can trace under the rules the board PRINTS is
> accepted.** No frequency line, no length window. The ask keeps both — that is what a
> curator's choice IS — but the ask is not the accept-list, and any bound on acceptance is a
> bound somebody will have to justify to a player who can see the word on the tiles.
> The residue is one class and it is editorial, not mechanical: **534 words in the house that
> the manor will not print** (DEATH, PENIS, ANGER, SLUTS, CANCER…). Those are the cozy gate's
> and they are a deliberate choice; everything else the dictionary carries is a work or a
> study. Measured by enumeration that shares nothing with the generator — see STATUS' round-38
> entry and `tests/puzzles/twistle-boards.test.ts`.

> **ROUND 43 — AND STRANDS' OTHER RULE IS THE ONE THE OWNER JUST ASKED FOR.**
> The line four bullets up — *"Every tile belongs to an answer. The board is exactly tiled by
> the theme words plus the spangram — there is no filler on a Strands board at all"* — has sat
> in this teardown unused since it was written, because the Gallery's whole difficulty model
> (round 26) depends on filler. Owner, from play: *"There is a lot of letter placements that
> totally close off any ability to ever form a word. That is not fun. It is okay to have some,
> but it is too much — like c c c all next to each other."* That is this row of the teardown
> arriving as a complaint.
>
> **The Gallery cannot copy the rule** — a board exactly tiled by its answers gives away the
> answers, and Strands can afford that because a theme, not a search, is what it is selling.
> So it is copied as a FLOOR rather than as a construction: no wall of ground she can never
> form a word on. Measured against the words that are FINDABLE IN PRACTICE — the board accepts
> it AND she plausibly knows it — because round 38's whole-dictionary accept-list makes "a word
> crosses this tile" nearly meaningless (a tile "serving 22 words" is usually AIVERS, AKEES and
> twenty more she will never type). **The largest run of king-adjacent tiles serving fewer than
> two such words went 6 / 9 / 15 to 2 / 2 / 2, and 103 of the 210 boards were over the ceiling
> and none are.** Pairs stay, on purpose: a search with nothing to reject is not a search, and
> he asked for some.
>
> **His example was not the mechanism, and that is worth more than the fix.** Three touching
> C's is real — 70 of the 210 boards carried a run of three-or-more identical king-adjacent
> letters — and it is UNCORRELATED with barren ground: boards with such a run and boards
> without have the same barren share to three decimals (0.160 vs 0.160). A fill rule to
> suppress the runs was written and deleted on that number. He described the artifact he could
> see; the thing he felt was underneath it.
>
> **ROUND 48 — THE METRIC WAS GOOD AND THE GATE COULD NOT COME OUT WRONG.** Round 43's own
> header claimed the gate "shares as little of the generator as the question allows" and listed
> three independences. Two are real (raw ENABLE off disk; its own depth-first walk). The third
> is the decisive one and is the opposite of independent: `submitTwistleWord` accepts a word if
> and only if it is in the board's `targetWords` or `extraWords`, so the ENABLE walk finds a
> **2.2% surplus** and then discards it, and the verdict is settled by exactly the list
> `content/generate-twistle.ts` rejected on. The generator refuses any candidate over the
> ceiling; a gate that re-derives the generator's predicate over the generator's words can only
> confirm it — which is why the shipped pool reads a worst wall of **exactly 2** at every tier,
> flush on a ceiling of 2. Three things changed, and the ceiling itself did not:
>
> - **The ceiling is defended as a RULING, not given headroom.** It is the owner's sentence
>   transcribed — a barren pair is fine, a barren three is not — and margin on it would mean
>   shipping the boards he complained about.
> - **The condemned population is checked in whole** (`tests/puzzles/fixtures/twistle-pre-round43.json`,
>   the 210 boards at commit `fbef228`) and read by the identical instrument: **103 offenders,
>   13 / 30 / 60 by tier, worst walls 6 / 9 / 15**, asserted exactly, because the fixture is
>   frozen and the only thing that can move those figures is the gate's own reading.
> - **The "survives moving the line" proof is retired as a proof and replaced with one that can
>   disagree.** Re-running at rank ≤ 60,000 cannot fail — a wider vocabulary only adds words, and
>   round 43's own comment reasoned that out before asserting it. It is kept, relabelled as an
>   instrument self-check. The real test moves the line the other way, to **rank ≤ 10,000**,
>   where clusters can only grow and a pool that bought its cleanliness at 20,000 by threading
>   rare words through corners would show nothing. Mean largest barren cluster, before → after:
>   tier 1 **4.714 → 3.971**, tier 2 **5.171 → 4.657**, tier 3 **11.586 → 7.300**. The
>   assertion is the direction at every tier; the magnitudes are two frozen artifacts and
>   bounding them would be `ceil(measured)` again.
>
> **AND THE DEBT IS PUBLISHED.** The fix is a fix at and above the design's line. At rank
> ≤ 15,000 the shipped pool has 90 of 210 boards over the ceiling and a worst wall of 12; at
> ≤ 10,000, **155 boards and a worst wall of 21**. Nothing in the suite has ever claimed the
> ground is clean at every line, and now nothing in it can be read that way.
**Fix/beat:** give it the ladder Strands refuses to have (§1's curve, re-based on this room's
own material — letters AND corners, since a word search ranks on shape), and keep the *door*
on the constrained class so the ladder can never be climbed into a solve on easy words. Where
Strands ends flat, the Gallery should end on a rung with rungs visible above it.

---

## 9. Reference numbers cheat-sheet (for tuning conversations)

| Thing | Benchmark value | Our starting value |
|---|---|---|
| Day budget vs map size | BP: 50 steps / 45 cells (~1.1×) | 18 steps / 35 cells (~0.5×) — refunds and per-row movement pricing decide how deep a run goes |
| Draft offers | 3 cards, slot-1 free, affordability-aware | same, plus 1-gem reroll and cancel-out |
| Invalid-word cost | SB: 0 (shake only) | Conservatory 0 for dictionary misses; see AAA_BAR §0.3 |
| Rank ladder | 2/5/8/15/25/40/50/70% (+hidden 100%) | same curve, garden-themed, room "solved" at 70% |
| Mistake budget | Connections: 4 then death | steps only, no fail state, no dots UI |
| Reveal stagger | Wordle ~250–400ms/tile; Connections hop ~100ms | hop 80–120ms + 300–400ms hold |
| Dusk fade | BP: ~4s walkable no-interact | same, ≤4s |
| Dialogue floor | Hades NPC 400–1,600 lines | 150–220 lines/major character, Vol. 1 |
| Event-reaction variants | Hypnos: 75 death lines | Bramble ≥12 day-end-cause reactions |
| Typewriter | Hades feel → 40–60 cps | 40–60 cps, tap-complete/tap-advance |
| Portrait budget | static, speaker-only, state variants | same; 240×300 SVG hedcut, 2–3 expressions |
| Animation ceiling | BP's slow anims resented by run 30 | all interactions ≤300ms or tap-skippable |
| Sudoku tier 1 | NYT Medium: ~30 givens, locked candidates | same — `ROOM_EFFORT.sudoku[0]` |
| Sudoku tier 2 | NYT Hard: ~26 givens, subsets, NO wing/fish | same — `ROOM_EFFORT.sudoku[1]` |
| Sudoku tier 3 | above NYT's published ladder: wing/fish/colouring | same — `ROOM_EFFORT.sudoku[2]` |
| Unfinished sudoku | NYT: the board is still there tomorrow | the open ledger (engine/rooms/room-bank.ts) |
| Word-search grid | Strands: 6×8 = 48 tiles, every tile in an answer | 5×5 (tiers 1–2) / 6×6 (tier 3), filler allowed |
| Traced real word, not wanted | Strands: accepted, 3 of them = 1 hint | accepted as a *study* — 1 point, never refused, and **the first buys back the step she walked in on** (round 44) |
| Word-search accept-list | Strands: its whole dictionary | ours: **the whole dictionary**, at every length and every rank (round 38) |
| Words a board accepts (median) | Strands: 7–9, and every tile is spoken for | **102 / 104 / 200** by tier (round 43) — was 100 / 92 / 172 |
| Dead ground on the board | Strands: **none** — every tile belongs to an answer | **no run of 3+ king-adjacent tiles serving under 2 words she'd know** (`MAX_BARREN_CLUSTER`, round 43) — was runs of 6 / 9 / 15 |
| Word-search answer count | Strands: 7–9 theme words + spangram | 5 / 6 / 6 *works* (`ROOM_EFFORT.twistle`) |
| Word-search ladder | Strands: none at all | Bee's curve on letters + 2×corners (`TWISTLE_RANKS`) |
| Linen Closet benchmark | **NYT Acrostic (§10)**, not the Mini — the Mini is struck, with the measurement | one marked square per entry spelling a clued answer |
| Closet board | Mini: 5×5, ~10 entries, 100% checked | 4×4/3 entries (t1), 5×5/4 (t2, t3) + a hem row |
| Closet letters under outside check | Mini 100%; Acrostic ~100% by transfer | 39.9% → **62.3%**; entries with ≤1 checked letter 52.8% → **0%** |
| Closet squares to fill (mean) | — | 8.38 / 13.30 / 13.93 (was 8.40 / 13.30 / 16.10) |
| Darkroom benchmark | **the syndicated Cryptoquote (§11)** — written round 46; the room had none | crib-graded tiers, short phrases, letters given back |
| Cryptogram length | Cryptoquote: 60–120 letters, so frequency analysis bites | median **25 / 24 / 31** (`MAX_LETTERS` 41 — a glass ceiling, not a design one) |
| Cryptogram letters given | Cryptoquote: **zero** | **3 / 1 / 2** (`REVEALS`), high-frequency at t1, MID above it |
| Cryptogram crib | whatever the quotation happens to carry | graded: one-letter word / two-letter word / **nothing under 3** |
| Cryptogram clock | 3–8 min for a regular solver | **3.0 / 4.5 / 5.5** = opening(crib) + letters × 12.5 s (`CIPHER_CLOCK`) |
| Library clock | Connections has no published time | **4.5 / 5.25 / 6.0** = plain × 56.25 s + worked × 101.25 s (`WEB_CLOCK`, §2) |
| Library tier lever | editor's yellow→purple ordering | **plain categories 3 / 2 / 1** — contested tiles are flat at 2, by design |
| Closet clock | Mini: 20–60 s over ~10 crossed entries | **1.25 / 1.75 / 2.25** = clued answers × 18.75 / 21 / 27 s (`CLOSET_CLOCK`, §10) |
| Closet tier lever | Mini: none — one size, one grade | 4 / 5 / 5 clued answers, answers at corpus rank **5,100 / 8,854 / 19,461** |
| Study benchmark | **none — no NYT twin (§12)**, bounded by Wordle and the cryptic definition | a definition in three registers, a letter count and a crib |
| Study answer list | Wordle: ordinary vocabulary, on purpose | the opposite: median rank **25,286 / 81,158 / 219,760**, 15 of 43 off the corpus at tier 3 |
| Study clock | Wordle: ~4 guesses of 6 on a word you know | **1.5 / 2.25 / 3.5** = read + candidates × 50 s (`STUDY_CLOCK`, §12) |

## 10. NYT Acrostic → benchmark for the Linen Closet (the Hem)

*Three rounds running, a room was judged against a teardown that was not in this file: the Mini,
then Sudoku, then the Mini again. The Linen Closet's case is the worst of the three, because the
spec it was silently judged against for twenty-odd rounds is one it **structurally cannot meet**,
and nobody wrote the spec down long enough to notice. That is fixed here, in two parts: why the
Mini is NOT this room's benchmark, and what is.*

### Part 1 — why the NYT Mini is not, and never was, the benchmark

The Mini's numbers, for the record, because they are the ones the room was being failed against:

- **5×5, 25 squares, ~10 entries**, every square in exactly one across and one down entry.
- **100% checked squares.** There is no unchecked letter on a Mini, ever.
- Solve time is 20–60 seconds for a practised solver; the room's budget (`ROOM_EFFORT.crossword`
  = 1.25 / 1.5 / 2.0 min) is the right order of magnitude, so *time* was never the mismatch.

Round 17 measured what closing the 100%-checked gap would actually cost this room and found the
premise wrong three separate ways (recorded in full in `LINEN_CLOSET.md`):

- **Not a layout problem.** All 251 fully-checked connected masks that exist at sizes 3–5 were
  enumerated; **zero** are fillable from the room's own 174-word clue bank across 2,008 seeded
  attempts.
- **A rebuild destroys the asset.** Only **57 of the 362** answers a fully-checked grid needs
  clear the hand-picked manor bank. It orphans two thirds of the bank and needs 564–915 new clues.
- **And it degrades the writing.** Connective fill drives plural/verb S-endings from 2.3% of the
  bank to 13.4% of what full checking requires.

> The clues are good BECAUSE the grid is sparse. A skeleton lets an author choose every word
> (OWL from "Night's librarian"). Full checking removes that choice and pays in connective fill.
> **The room's one asset and the crossword's defining mechanic are permanently opposed.**

So the Mini is struck as this room's benchmark. It is kept above only so that a later round
cannot re-derive it from an empty page. **The Linen Closet is not a crossword and is not scored
as one.**

### Part 2 — the benchmark: the NYT Acrostic

The Acrostic is the one mainstream NYT word puzzle whose letters are **not** checked by
crossings, and it is not thereby a lesser puzzle — it runs in the same lineup, at a harder
average difficulty than the Mini, and has done for decades. That is the precedent this room
needs, and it is why the answer to "sparse grid" is not "make it dense" but "check the letters a
different way".

**Shape (approximate where marked ~; the Acrostic's dimensions vary by quotation):**

- Published **~twice a month** in the NYT lineup; long associated with constructors Emily Cox
  and Henry Rathvon.
- **Two halves on one page.** Left: a list of **~20–30 clues lettered A, B, C…**, each with a row
  of numbered blanks. Right: a rectangle of **~150–200 numbered squares** with black squares,
  word-spaced.
- Every blank in the clue list carries a **number**, and that number names a square in the grid.
  Filling an answer transfers its letters into the grid. Filling the grid spells a **quotation**.
- **The first letters of the answers, read down the clue list A→Z, spell the author and the title
  of the work.** That is the acrostic proper, and it is the device this room is taking.

**The three checks an Acrostic has, in place of crossings:**

1. **Transfer.** A letter you are sure of in one place appears immediately in the other. This is
   the workhorse, and it is a *crossing by another name* — the grid is a second context for the
   same letter.
2. **English.** The quotation is a sentence, so partial fills are disproved by grammar and idiom,
   not by geometry.
3. **The spine.** The initial letters accumulate into a name. A doubtful answer whose initial
   breaks the emerging name is refuted **without paying anything** — you did not have to submit,
   and the puzzle did not have to tell you.

Check 3 is the cheapest of the three to build and the only one that survives at micro scale.
Checks 1 and 2 both need a quotation grid, which is a 20–40 minute puzzle; this room has 90
seconds.

**What the Acrostic is honest about, and we must copy:** it *tells you what the spine will say*
("the author and the title") before you start. It is not a hidden Easter egg you may or may not
notice — it is a stated, usable constraint, and it is the reason a solver reaches for it.

### Steal / Fix for the Linen Closet

**Steal:** the spine, exactly, and its honesty. One marked square per entry; the marked letters,
read in clue order, spell a further answer; **that answer gets a clue of its own, printed in the
list with the rest.** A wrong entry is refuted the moment its marked letter refuses to fit the
spine — free, silent, and without a costed check. That is the job crossings were doing, given to
something a sparse grid can actually carry.

**Fix/beat, and where we deliberately differ:**

- **The spine is marked, not initial.** NYT takes the *first* letter of every answer. On a 174-word
  bank with 3–5 entries per board, initials-only is infeasible — measured: of the 90 shipped
  boards, **1** admits a spine under an initials rule. Any-position marking is the standard
  crossword-meta form (shaded squares), it costs nothing in legibility once the squares are
  shaded, and the author still picks every marked letter because the author picks every word.
- **A marked square must earn its keep.** Marking a square that is already an intersection buys
  nothing — it is checked twice and unchecked letters stay unchecked. The generator prefers
  unchecked squares and the pool is gated on it (`MIN_FRESH_SPINE_RATIO`).
- **No quotation grid.** Checks 1 and 2 are not affordable at 90 seconds and are not attempted.
  Said out loud so a later round does not read the omission as an oversight.
- **The spine is the tier knob's second hand.** The entries harden by word and by clue register
  (§ the room's own `wry` pool); the spine hardens with them.

### The number this room is scored on, and what it replaces

"Checked squares" was the Mini's metric and it condemned the room at a median 25.0%. The
replacement is stated here so it cannot drift:

| Metric | NYT Mini | NYT Acrostic | Linen Closet, before | after |
|---|---|---|---|---|
| Squares checked by a crossing | 100% | 0% — transfer does it | 25.0% median | 23.1% median, by design |
| **Entries with ≤ 1 checked letter** | 0% | 0% | **52.8%** (190 of 360) | **0.0%** (0 of 288) |
| Share of an answer's letters something else can disprove | 100% | ~100% | **39.9%** (566 of 1,417) | **62.3%** (730 of 1,172) |
| Free refutation of a wrong answer | the crossing | the spine + transfer | **none** | the hem |

The second row is the one the old metric hid, and it is the reason this room
needed rebuilding rather than renaming. "25% checked squares" sounds like a
puzzle that is three-quarters unfair; the truth was worse and more specific —
**on 190 of 360 entries there was at most ONE letter in the whole answer that
anything on the board could contradict**, so a wrong word usually sat there
looking exactly as right as a right one until she paid for a check. One marked
square per entry, placed on a letter no crossing already covers, takes that to
zero. The same 76 boards with their hems removed still measure 49.7%, which is
what makes the number a measurement rather than a property of the layout.

### What it cost, in the only currency the evening has

The hem adds a sentence to read, so the board was not allowed to add squares to
fill. Measured against the pool it replaces, per board:

| | squares to fill, before | after | rows printed, before | after |
|---|---|---|---|---|
| tier 1 | mean 8.40 (7–10) | **8.38** (7–9) | 3 | 4 |
| tier 2 | mean 13.30 (11–16) | **13.30** (12–15) | 4 | 5 |
| tier 3 | mean 16.10 (13–18) | **13.93** (12–16) | 5 | **5** |

Tier 3 paid for the other two: it gave up its fifth entry, so it prints the
same five rows and asks for 2.2 fewer letters. Tiers 1 and 2 are flat on
squares and gain one row each, and that row is READ, not typed. The generator
caps the running mean per tier and `tests/puzzles/micro2.test.ts` replays the
check on what shipped, so a later content edit cannot lengthen the room
quietly.

The variety bill is real and is recorded rather than hidden: **the pool is 76
boards where it was 90**, because a board is now thrown away unless a bank word
can be spelled out of its uncrossed letters (32,979 layouts were). Tier 1 falls
hardest — 16 boards, from 30 — since a 4×4 with three entries and 8 squares has
very few uncrossed letters to choose from. Ten per tier is the shipped floor
and tier 1 clears it by six.

### Round 50's clock — the room's unit is the CLUE, and the middle tier ran backwards

Round 29 gave this room a fourth and fifth printed row and `docs/LINEN_CLOSET.md` records, in
its own cost list, that ***"`ROOM_EFFORT.crossword` is untouched."*** The room grew a clued
answer and its whole checking mechanic and its clock did not move. It had never been derived at
all: one header line, *"4×4, 3 entries, 11 letters — ~75 s"*, written before the hem existed.

**The unit matters more than the numbers, because the obvious measurement is the wrong one.**
Counted per SQUARE the shipped row ran **9.4 / 6.9 / 8.6 seconds**, which reads as the defect
round 26 caught in the Gallery and round 27 in the Counting House — a bigger, later board
implying a faster unit. It is not that defect. **This room is not a crossword** (the owner's
ruling, LINEN_CLOSET.md), and on a sparse grid a square is *typed*, not *solved*: three quarters
of the letters have no crossing, so the work is the clue and there are `entries + 1` of them,
because the hem is clued in the list with the rest.

Counted in the room's own unit the shipped row ran **18.8 / 18.0 / 24.0 seconds a clued answer —
and the middle one still ran backwards**, on a board that asks one more clue, one more letter per
answer and a rarer word than the one below it. That is the finding, and it survives the change of
unit, which is why the unit is written down here.

| | tier 1 | tier 2 | tier 3 |
|---|---|---|---|
| grid | 4×4 | 5×5 | 5×5 |
| clued answers (entries + hem) | **4** | **5** | **5** |
| median answer length | 3 | 4 | 4 |
| **median answer's corpus rank** | **5,100** | **8,854** | **19,461** |
| clue length (median words / chars) | 4 / 22 | 4 / 22 | **5 / 29** |
| seconds a clued answer | 18.75 | **21.0** | **27.0** |
| `ROOM_EFFORT` | 1.25 — unchanged | **1.75** (was 1.5) | **2.25** (was 2.0) |

Tier 3 does not get another entry, so its only levers are the ones the table shows: answers
**3.8× rarer than tier 1's** and clues a word longer. The Mini's reference figure is 20–60
seconds for ~10 entries, i.e. 2–6 s a square with the crossings doing the confirming; ours is a
clue at a time with only the hem to confirm it, and the bands in `CLOSET_CLOCK` are that
reference scaled by exactly that difference.

**No payout moves** — 0.45 × 1.75 and 0.45 × 2.25 both round to the +1 the cozy floor was
already paying — so no ledger band moves with it. What moves is the wage (0.667 → 0.571 at tier
2, 0.500 → 0.444 at tier 3, both interior), the clock, and the draft card's tier-3 duration
clause: *"a few minutes"* rather than *"a minute or two"*, which is truer and is a rule of play.

---

## 11. The newspaper cryptogram → benchmark for the Darkroom

*The Darkroom is one of two rooms `docs/STATUS.md` grades as NOT clearing its benchmark, and
until this round there was no benchmark in this file to clear. That is the same failure the
Linen Closet's §10 opens on — a room failed for twenty rounds against a spec nobody wrote down
— and it is why `ROOM_EFFORT.cipher` was the only row in the effort table with no derivation
behind it and no pin under it. **(Round 50's correction: it was the only row with no derivation
AND a wrong shape. Three more had a plausible shape and no derivation at all — §2's Library,
§10's Linen Closet and §12's Study — and the Study's was FLAT.)***

### The reference, and its exact numbers

The syndicated **Cryptoquote / Celebrity Cipher** (King Features, Tribune) is the form this room
is a cosy version of. A simple monoalphabetic substitution, word spacing preserved, one puzzle a
day, no timer, no fail state.

- **Length: 60–120 letters.** This is the single most load-bearing number in the format and it
  is not decoration. Frequency analysis is a law-of-large-numbers argument: at 100 letters
  `E` really does show up about twelve times and the top of the count is trustworthy. At 25
  letters it is noise, and the solver has nothing to do with a frequency table.
- **Letters given: zero.** The published puzzle reveals nothing.
- **The crib is the WORD SHAPE, not the letters.** In order of what a solver actually reaches
  for: one-letter words (`A`/`I` — a two-way guess before a single deduction), the apostrophe
  (`'S`, `'T`, `N'T`), two-letter words (a couple of dozen candidates), doubled letters, and
  then the trigram `THE`, which at 60+ letters is nearly always present and nearly always
  findable by pattern.
- **Attribution line.** Celebrity Cipher prints the speaker's name in the same cipher, which is
  a second crib: a name is a word shape with a known population.
- **Time: 3–8 minutes** for a regular solver; 15 minutes or nothing at all for a first-timer.
  Every published "how to" agrees on the shape of that time, and it is the finding below.

### THE FINDING THIS ROOM IS PRICED ON: the clock is the OPENING, not the letters

Every account of solving one of these describes the same curve: a long flat stretch of nothing,
then a foothold, then the rest falls over in under a minute. Once three or four letters stand,
word shape does the remaining work — `T_E` is `THE`, and `THE` gives you `H` everywhere. **The
letters are cheap; the first foothold is the whole puzzle.**

That is why a cryptogram's difficulty ladder is made of CRIBS and not of length, and it is why
the Darkroom's own generator (`content/generate-cipher.ts`, round 4, on the owner's directive)
already reverses the naive rule: *"What actually makes a cryptogram tractable is not text volume
but a CRIB — a place to stand."* The generator has graded on crib class since round 4. The
clock never followed it. `ROOM_EFFORT.cipher` was `[3.0, 3.5, 4.0]`, which prices a phrase that
hands over nothing at 33% above one that hands over an `A` and three high-frequency letters.

### Where the Darkroom sits against the reference, and where it deliberately does not

| | Cryptoquote | The Darkroom |
|---|---|---|
| Length | 60–120 letters | **19–41**, median 25 / 24 / 31 by tier (`MAX_LETTERS` 41) |
| Letters revealed | 0 | **3 / 1 / 2** (`REVEALS`) — high-frequency at tier 1, MID at tiers 2–3 |
| Crib word | whatever the quotation happens to carry | **graded**: a one-letter word (34/34 t1), a two-letter word and no shorter (0/44 t2 carry a one-letter word), **nothing under 3 letters at all** (0/43 t3) |
| Distinct letters | ~20–24 of 26 | median **13 / 13 / 15** |
| Letters to deduce | ~22 | median **10 / 12 / 13** |
| Recognisable text | often — a famous quotation IS a crib | none: the proverbs were cut in round 24 for exactly that reason |
| Fail state | none | none |
| Time | 3–8 min | **3.0 / 4.5 / 5.5** — see below |

**The room is deliberately SHORT of the reference on length, and the reveals are what pay for
it.** A 25-letter phrase with nothing given is below the frequency-analysis floor and would be
a worse puzzle than a 100-letter one, not a harder one — round 24 already found this the
expensive way, when tier 3 shipped at zero reveals on the argument that pattern alone was
enough, and had to be walked back to two. The length ceiling is a GLASS constraint, not a design
one (`MAX_LETTERS` 41: the dense sheet has to sit above the deck at 375×667 without scrolling,
and the owner's standing rule is that a panel that scrolls instead of fitting is a defect). So
the room buys its difficulty in the one currency the reference also uses — the crib — and gives
letters back to compensate for the length it cannot have.

### Steal / Fix for the Darkroom

- **Price the room as an opening plus a cascade.** `minutes = opening(crib class) + letters to
  deduce × 12.5 s`, with the cascade constant across tiers because the fill is the fill.
  Openings measured against the reference's own crib ladder: **55 s** with a one-letter word and
  three high-frequency letters already standing, **120 s** with a two-letter word and one
  mid-frequency letter, **167 s** with no crib word at all on a phrase too short for frequency
  analysis to bite. That is `ROOM_EFFORT.cipher` = **3.0 / 4.5 / 5.5** and `CIPHER_CLOCK` is the
  two terms, named, so the row can be re-derived rather than re-typed.
- **The trigram crib is the one the room does not have and the reference leans on.** `THE`
  is findable at 60+ letters and a coin-flip at 25. Nothing to fix — it is the length ceiling
  arriving as a consequence — but it is why tier 3's opening is the whole room.
- **A CONTENT DEBT THIS TEARDOWN FOUND, named rather than absorbed: tier 2 is a REMAINDER,
  not a grade.** `tierOf` (`content/generate-cipher.ts`) is two gates and a leftover — tier 1
  is *has a one-letter word*, tier 3 is *has no word under three letters AND is long AND has a
  wide alphabet*, and tier 2 is everything else. So a **no-crib** phrase that misses tier 3's
  length or alphabet floor is filed at tier 2, and **13 of the 44 shipped tier-2 boards are
  exactly that**: they hand over nothing but their one mid-frequency letter, which is a tier-3
  opening on a tier-2 card. What tier 2 actually guarantees is only the half its name claims —
  no one-letter word. `ROOM_EFFORT.cipher[1]` is the MEDIAN board's clock, which is what that
  table is defined to be, and `tests/economy-effort.test.ts` holds the median at a two-letter
  crib and prints the share. The fix is a third gate in the generator (a two-letter word
  REQUIRED at tier 2, the rest re-filed), and it is a pool regeneration.
- **STILL OPEN, and it is what keeps the room off the benchmark:** the reference gives the
  solver a *procedure* (one-letter words, then two, then `THE`), and the Darkroom states no rule
  of any kind on entry. `docs/COMPREHENSION.md` [major]: *"The Darkroom has no rules text of any
  kind… the room that would strand a non-cryptogram player."* One sentence in house voice about
  one letter standing for one letter throughout is fix 13 on that list and is not built.
- **STILL OPEN: the room is now longer than a sitting and pays nothing on the way up.**
  `LADDER_MINUTES` is 4 and tiers 2 and 3 are over it (tier 3 already was, at 4.0, and nothing
  said so). `cipher-adapter.ts` emits one `progress` event in the whole room — `print-developed`,
  at the end — so there is no marker to hang a rung on. The reference has the same shape and gets
  away with it at 3–8 minutes and no economy attached; this room has an economy attached.
  `tests/economy-effort.test.ts` pins the list of unstaged long rooms so the debt is bounded.

---

## 12. The Study (Forgotten Word) → the room with NO NYT twin, and what it is graded against instead

*Written round 50. `docs/STATUS.md` §7 has said for four rounds that **"two rooms were being
judged against teardowns that did not exist in this file; if yours is missing, write it before
you build."** Round 46 wrote the Darkroom's. This is the other one, and it was worse off than
the Darkroom, because the Darkroom at least had a wrong clock — the Study had a FLAT one.*

### First, the thing `docs/LINEN_CLOSET.md` told us to say out loud

**There is no NYT twin for this room, and the gap is stated rather than left for a later round
to fill with an assumption.** The Study shows a definition in one of three authored registers,
names the letter count, stands some of the letters up, and takes up to six guesses, answering
each wrong one with Wordle's two closeness signals. Nothing in the NYT lineup does that. The two
references that BOUND it, and what each one settles:

- **Wordle** — six guesses, letter feedback, and *an answer list deliberately restricted to
  ordinary vocabulary*. That restriction is the whole reason the format is fair: with only
  letter feedback, a word you have never met is unguessable. **The Study does the opposite** —
  its tier-3 headwords have a median corpus rank of 219,760 and fifteen of forty-three do not
  occur in a third of a million words of English — **and it pays for that with the two things
  Wordle does not have: a MEANING and a CRIB.** That is the trade the room is, and round 14
  already built it (`glossForLevel` free at every tier, `cribIndices` keyed on obscurity,
  `maxGuessesForLevel` no longer shrinking with rarity). Wordle's other useful number is its
  measured mean of ~4 guesses of 6 on a list of words everybody knows.
- **The cryptic crossword's definition half** — a clue's definition is exact and unhelpful at the
  same time; you confirm it with the wordplay. Our confirmation is the letter count plus the
  standing letters, which is a weaker check, which is why the room may not also take the gloss
  away (AAA 3.5/3.8, and the generator's own `solvabilityProblems` refuses to ship an unranked
  word without a gloss, five guesses and a crib).

### The clock, and the flat row it replaces

`ROOM_EFFORT['forgotten-word']` was `[1.5, 1.5, 1.5]` — **the only row in the effort table that
claimed a tier costs nothing** — and its whole account was one header line: *"read three authored
definitions, name a word."* Measured against the room the generator actually ships, the three
tiers differ in four ways at once:

| | tier 1 | tier 2 | tier 3 |
|---|---|---|---|
| obscurity tag | 34/34 `common` | 36/36 `medium` | 31 `rare` + 12 `archaic` |
| **median corpus rank** | **25,286** | **81,158** | **219,760** |
| **absent from a 333,333-word corpus** | 0 of 34 | 4 of 36 | **15 of 43** |
| headline register | poetic | poetic | **the riddle** |
| letters standing (`cribIndices`) | 0 | 1 | 2 |
| guesses (`maxGuessesForLevel`) | 6 | 5 | 5 |
| registers to read (median words) | 25 | 27 | 29 |

**The model is a READ and then CANDIDATES**, and only the second term moves:

```
minutes = registers / 150 wpm  +  candidates(tier) × 50 s
```

The read is measured off the pool and is 10 / 11 / 12 seconds — it is not where the tier lives.
The candidate rate does not move either, and that is deliberate: it is the Darkroom's cascade
argument in another room (*the fill is the fill*). Producing one word that fits the letter count,
the standing letters and the meaning, submitting it and reading the closeness that comes back is
the same act at every storey; **what the tier changes is how many of them the median solve
takes.** 50 s is the middle of a published 40–60 s band, above the Conservatory's ~20–30 s find
because a hive word is spotted on seven letters and a Study word is retrieved against a meaning.

| | tier 1 | tier 2 | tier 3 |
|---|---|---|---|
| candidates (median solve) | 1.5 | 2.5 | **4 of the 5 allowed** |
| `ROOM_EFFORT` | **1.5 — unchanged** | **2.25** | **3.5** |

**And the crib is the one lever pushing the other way, measured rather than waved at.** The
letters standing cut the LEXICAL field — ENABLE words of the right length with those letters in
those places — from a median 23,109 at tier 1 (no crib) to 856 at tier 2 to **52 at tier 3**.
That is what stops the tier-3 row running away, and it is why the room is fair; it is not enough
to make it as quick as tier 1, because a fifty-two-word field is only a field if you can read the
riddle that picks one out of it.

### The one payout this row moves, and the two things to know about it

**A tier-3 Study pays +2 rather than +1** (0.45 × 3.5 = 1.58). It is an OUTPUT of the
derivation, not its purpose, and it is the only payout `ROOM_EFFORT` moved in round 50.

- **The rounding edge is at 3.34 minutes and the row sits 0.16 above it.** Anywhere from 48 s a
  candidate up pays +2 and anywhere below pays +1. A later re-derivation that lands under the
  edge has to say so and re-publish — the same disclosure round 46 wrote into the Darkroom's row.
- **The Study only ever ships at tier 3.** `deck.ts` gives it `tierRange: [3, 3]` (the 2026-08
  owner playtest: *"I reached the Forgotten Word on my FIRST DAY"*), so tiers 1 and 2 of this row
  are priced, are counted in two of AAA 4.10h's four wage populations, and are never dealt. They
  are derived anyway, because a three-tier table has to be honest at all three and because a deck
  edit that lowers the Study must not find two invented numbers waiting for it.

### Steal / Fix for the Study

**Steal:** Wordle's closeness as the answer to a costed claim (round 7 already did — the room
returns shared and exact letters rather than "no"); Wordle's *restraint about its answer list*,
inverted deliberately and paid for in gloss and crib rather than borrowed for free.
**Fix, still open:** the room has no ladder and does not need one at 3.5 minutes, but it is the
only anchor whose whole payout arrives at the summit and whose failure mode is running out of
rope — `docs/COMPREHENSION.md` has no finding on it because no blind tester ever reached row 5.
**That is this room's real open problem and it is not a clock problem: nothing in
`docs/COMPREHENSION.md` describes the Study being PLAYED, by anyone, ever.**
