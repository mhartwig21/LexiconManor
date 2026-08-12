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
| Traced real word, not wanted | Strands: accepted, 3 of them = 1 hint | accepted as a *study* — 1 point, never refused |
| Word-search answer count | Strands: 7–9 theme words + spangram | 5 / 6 / 6 *works* (`ROOM_EFFORT.twistle`) |
| Word-search ladder | Strands: none at all | Bee's curve on letters + 2×corners (`TWISTLE_RANKS`) |
| Linen Closet benchmark | **NYT Acrostic (§10)**, not the Mini — the Mini is struck, with the measurement | one marked square per entry spelling a clued answer |
| Closet board | Mini: 5×5, ~10 entries, 100% checked | 4×4/3 entries (t1), 5×5/4 (t2, t3) + a hem row |
| Closet letters under outside check | Mini 100%; Acrostic ~100% by transfer | 39.9% → **62.3%**; entries with ≤1 checked letter 52.8% → **0%** |
| Closet squares to fill (mean) | — | 8.38 / 13.30 / 13.93 (was 8.40 / 13.30 / 16.10) |

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

---
