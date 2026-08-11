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

## 8. Reference numbers cheat-sheet (for tuning conversations)

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
