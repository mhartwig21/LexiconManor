# Lexicon Manor — The AAA Bar

*The quality bar every critic enforces. Every criterion below is pass/fail by playing or
inspecting the game — no vibes. Companion docs: `BENCHMARKS.md` (why each bar is where it
is), `ARCHITECTURE.md` (how it gets built), `MANOR_DESIGN.md` (what we're building).*

**How to read this doc:** criteria are numbered `X.N`. A criterion tagged **[PARITY]**
means "failing it makes us feel worse than a free web game" — any PARITY fail is a
release blocker. **[BEAT]** criteria are where we must exceed the benchmark. **[COZY]**
criteria enforce the tone pillars and are also blockers (a cozy game that stings is a
broken game). Untagged criteria are quality targets triaged normally.

---

## 0. Ground rules

### 0.1 The side-by-side comparison protocol (mandatory for critics)

Every critic review of a word-game room follows this protocol, on a real iPhone
(iPhone 12-class or older, 390×844, 60Hz), not a desktop browser:

1. **Warm up on the benchmark.** Play the benchmark game (NYT SB / Connections / Wordle)
   on the same phone for 3 minutes immediately before playing our room. Feel is
   comparative and short-term memory decays fast — never review our room cold.
2. **Alternate in 2-minute passes**: benchmark → our room → benchmark → our room. Note
   every moment ours feels heavier, slower, mushier, or less legible. Each such moment
   maps to a numbered criterion below or becomes a new proposed criterion.
3. **Instrument, don't guess**: timings verified by 60fps screen recording (count frames)
   or in-code timestamps; contrast by automated checker; tap targets by bounding-box
   audit. "Feels fine" is not a pass on any criterion with a number in it.
4. **Record the artifact**: each review produces a per-criterion pass/fail table plus a
   screen recording of both games. A criterion without evidence is not passed.
5. **Grayscale + reduced-motion passes**: repeat one loop of play in grayscale screenshot
   review and one with `prefers-reduced-motion` on. Both must remain fully playable.
6. **The wife test outranks the critic.** Where a criterion says "playtest," her result
   is the datum, not the critic's.
7. **Drive the app, don't photograph it.** Every review round includes the live
   interaction pass of §0.4. **A screenshot is not evidence for §11** (reachability,
   event feedback, unread state) and never passes one of its criteria: a control that
   is invisible, buried under a fixed layer, or covered by an overlay photographs
   exactly like a working one. Any §11 row marked pass without a recorded hit test and
   a recorded route return is void.
8. **Start suspicious.** Read §0.5 (known blind spots) before the round and re-test
   those five shapes specifically, in whatever screens have appeared since.

### 0.2 Universal timings (apply to every system)

- U.1 Touch feedback within one frame of `pointerdown` on every tappable (pressed class,
  not `:active`). Verified by frame-stepping a recording. **[PARITY]**
- U.2 No interaction animation exceeds 300ms unless it is a celebration, and every
  celebration is tap-skippable. (Blue Prince's slow anims were resented by run 30.)
- U.3 All animations use only `transform`/`opacity`; `prefers-reduced-motion` disables
  grow/lift/tilt, stamps, shakes, and celebrations (state changes still legible). **[COZY]**
- U.4 No screen shake anywhere, no parallax, no motion implying camera depth. **[COZY]**
  (Motion-sickness pillar — MANOR_DESIGN §1.3.)

### 0.3 Economy rulings (contradictions resolved)

These override earlier drafts wherever they conflict:

- **R.1 Conservatory invalid words cost 0 steps.** SB proves spam-guessing is the fun;
  MANOR_DESIGN §4's "−2 per mistake" does NOT apply to invalid *dictionary* submissions
  in the Conservatory (shake + toast only). Structural violations the live entry-coloring
  already warned about (dead letter, missing center) cost −1. The design doc's −2/−3
  table stands for deliberate wrong *guesses* in deduction rooms (Library groups,
  Forgotten Word, cipher letters), where a guess is a claim, not a probe.
- **R.2 No haptics dependency.** `navigator.vibrate` does not exist on iOS Safari and the
  checkbox workaround died in iOS 26.5. Haptics may ship as a silent probe-gated
  progressive enhancement, never referenced in UI copy, never load-bearing for feel.
  (Overrides the SB report's haptics recommendation.)
- **R.3 No streaks, no mistake-dot UIs, no lives.** Costs read as *spending*, never
  dying. Chronicles track only accumulative, unloseable stats. **[COZY]**
- **R.4 Sound is a strict upgrade, never a requirement.** iOS 26.0–26.2 can kill PWA
  audio system-wide; the game must feel complete fully silent (see §7, §8).

### 0.4 The live interaction pass (mandatory every round)

The comparison protocol above measures *feel*. This pass measures whether the app can be
*used*, and it is the only admissible evidence for §11. It is run by driving the real
build in a real browser, not by reading code and not by looking at screenshots.

**Harness rules** (non-negotiable, this dev box):
- Playwright against the **system Edge** install (`channel: 'msedge'`). **Never download
  a browser**, never install browser binaries.
- **ONE browser instance at a time.** The box tolerates ~3 headless browsers; more has
  crashed it. One instance, one context, sequential routes.
- Viewport 390×844, DPR 3, `prefers-reduced-motion` off for pass 1 and on for pass 2.

**The walk.** Visit every route registered in `src/App.tsx` (currently `/`, `/manor`,
`/room`, `/journal`, `/chronicles`, `/sanctum`, plus the not-found fallback), *and* every
full-screen overlay reachable from them (draft, cabinet, dialogue, morning card, dusk
veil, night digest, victory ceremony), *and* every empty/error/pre-day branch a screen
can render (no day yet, unauthored volume, unregistered room kind, pools still loading).
For each surface, record:

1. **Hit test the exit.** Take the exit control's bounding box, then
   `document.elementFromPoint(cx, cy)` at its **centre**. The returned node must be the
   control itself or its own descendant. Anything else — the chrome header, a scrim, a
   sibling overlay — is a **fail**, and "the button is in the DOM" is not a rebuttal.
   Repeat at the four inset corners of the box for controls near a fixed layer.
2. **Confirm it goes where it says.** Click it and assert the resulting location is the
   route the label promises. A back control that lands somewhere other than its named
   destination fails 11.9 even though it "worked".
3. **Confirm it is above the fold.** The control must be inside the visual viewport with
   the page at scroll 0, and it must not be covered at any scroll position.
4. **Confirm the notice fires where the player is.** For every state change the walk can
   provoke (draft a mystery room, open a sealed letter, finish a puzzle, hear testimony
   that grants a fragment, take a gift, spend to a rank-up), trigger it from the screen
   the player would really be on and assert the notice is *rendered and visible on that
   screen* — mounted, non-zero size, not behind a scrim, still on glass long enough to
   read. Then leave the screen and assert the persistent trace (§11's Tier A) is there.
5. **Record the artifact.** A per-route table: route · exit control · hit-test result ·
   destination reached · notices observed. No table, no §11 pass.

### 0.5 Known blind spots (five escapes, recorded so they cannot repeat)

Five defects survived rounds of harsh critics because the bar had no criterion for
them *and* because the critics judged from stills. They are now §11, and every round
re-tests their shape:

1. **The un-tappable exit.** The journal's and chronicles' back buttons rendered
   *underneath* the fixed day-bar chrome (`.chr-header`, `position:fixed`, `z-index:40`,
   opaque). `elementFromPoint` at the button's centre returned `.chr-retire`. The owner
   could not get back to the map at all. Every screenshot of the page looked correct.
   → 11.1–11.8. Suspect any page that is itself `position:fixed` and any overlay that
   does not clear `--chrome-h`.
2. **The route with no door.** `/chronicles` had no entrance anywhere in the app. Sound,
   music, reduced motion, the ring-switch bypass, keepsakes and the entire save
   export/import trunk were reachable only by typing a URL — and the installed PWA has
   no address bar and no browser back button. → 11.3, 11.22–11.24. Suspect any feature
   whose only caller is the router.
3. **The reward nobody saw.** Finding a clue fragment — the core reward of the whole
   mystery — announced itself as a 3.2-second line in the blueprint footer, in the same
   style as the cat's flavour text, and mostly fired while the player was on a *different*
   screen (inside a room, on the journal, or behind the full-screen dialogue overlay).
   Nothing persisted: the Journal button carried no unread badge, so a missed notice meant
   the player never learned anything had arrived. → 11.10–11.21. Suspect every
   `recordEvent` / currency mutation whose notice is rendered by exactly one component.
4. **The second navigation band** (round 11). Fixed layers clear the shell by token —
   `--chrome-h` for the bar, `--tap-target` for the back row that every sheet screen
   puts under it — and that describes *most* surfaces exactly. It does not describe the
   journal, which puts a ribbon of four tabs below the back row. The moment seal's box
   was 12,108,366×143 and `elementFromPoint` at all four tabs' centres returned `.mom`;
   the seal is itself tappable, so reaching for "Testimony" dismissed the notice instead
   — on the screen the seal's own trace line had just named, for 5.6s per queued grant,
   and grants QUEUE. /chronicles and /manor were clean under the same probe, which is
   exactly why it survived: the clearance was right everywhere the critic looked.
   → 11.2, 11.4. Suspect any surface whose top band stacks something the shell's tokens
   do not describe, and probe *every* control in it, not only the back control.
   **It came back in round 12, in the rooms, and that is the real lesson.** The
   round-11 fix taught the seal about a band the journal *has*; a ROOM's problem is the
   opposite shape — it has no back row at all, so the same formula overshot straight into
   the playfield. Measured at 390×844: 27 of the Counting House's 98 cells (the whole top
   three rows), 12 of the Darkroom's 57, 6 Linen Closet squares, 5 Twistle cells, and the
   Conservatory's found-words toggle at both viewports. Driven: a tap aimed at "Row 1,
   column 1" dismissed the seal and left the cursor exactly where it was. Nobody re-probed
   the rooms, because the journal was the surface that had been wrong. → **11.27**. When
   a fixed layer is retuned for one surface, re-probe *every* surface it can appear over,
   including the ones that were clean before the retune.
   **It came back a THIRD time in round 15, on the BLUEPRINT, because that sentence
   was read as a list of SCREENS and it is a list of STATES.** Round 11 recorded
   "/manor was clean under the same probe" and it was — *on the ground floor*, where
   the seal's band (12,108,366×91 at 390×844) is empty parchment. The sheet draws the
   upper storeys at the TOP of the glass, so the moment she climbs, the manor's own
   controls move into it. Measured standing on the Sanctum landing (2,5) with a plate
   grant on glass: `elementFromPoint` at the centre of "Approach the Sanctum"
   [177,157,64,64] returned `.mom`; at 375×667 both "Padlocked door onto the Sanctum
   landing" controls were covered at centre too, and those are **costed** (2 keys plus
   the row's move price), which 6.19 exempts nothing from. Driven, both viewports: a
   real click at the Sanctum door left `location.hash` unchanged and flipped the seal
   from present to absent. Grants queue at 5.6s (4.0s behind a queue) and arriving at
   the landing is exactly when a plate, a keepsake or a fragment lands, so it fired at
   the campaign's milestone moment (4.10d) rather than at random. → the walk is now
   parameterised by the player's **position**, not only by which screen she is on
   (`tests/critic-round12-seal-overlap.mjs` walks /manor at rows 0, 3 and 5 at both
   viewports). Two screenshots of the same route can be a pass and a blocker.
   **And the same round found the mirror image at the other end of the glass.** A
   fixed layer can also carry its own TAPPABLE control over a live surface, and
   exactly one does: `.chr-dusk` is deliberately pointer-transparent so the blueprint
   stays walkable through the ≤4s fade (4.12's grace), and `.chr-dusk__skip` was
   pinned 28px off the bottom — on top of the blueprint's navigation row. Measured:
   skip [129,772,133,44] over Journal [114,788,120,44] at 390×844, and
   [121,595,133,44] over [109,611,115,44] at 375×667; driven at both viewports with
   reduced motion on and off, a click at the Journal entrance's centre left the hash
   unchanged. The digest four seconds later prints "A letter waits unopened in the
   post tray". → **11.4's clearance now has a foot as well as a head**: a surface that
   pins a navigation band at the BOTTOM publishes its ceiling (`--page-foot-ceiling`,
   measured from the live element in `app/platform/page-nav.ts`) and fixed layers take
   `max(own margin, ceiling + gap)`. Suspect every fixed layer that ships an
   interactive island, and hit-test that island against the surface underneath rather
   than eyeballing the layout.
   **AND ROUND 39 FOUND THE OTHER HALF OF THIS ONE, FOUR ROUNDS LATER.** The token
   was published from `.bp-foot__actions` — the index-tab ROW — because that is the
   row the collision was measured against. Round 33 then put the storey's own title
   block *above* the tabs, and "And so, to bed" came down on top of "The Grounds" at
   **both** shipped sizes: skip [595,639] over a plate at [569,657] at 375×667, and
   [772,816] over [746,834] at 390×844. Nothing saw it for four rounds, because the
   one automated thing in this project that looks at a screen had never looked at a
   dusk. → **a band published from one row of a plate clears one row of a plate**:
   the token is taken from `.bp-foot`, and `gate:glass` now judges the veil's
   furniture box-against-box with whatever the surface underneath pins at its foot,
   so a fourth row added to the title block moves the veil instead of being landed
   on. Measured after: skip [512,556] against a plate at [569,657].
5. **The scene with one door** (round 11). The morning card and the night digest are
   full-screen scenes the player stands on every day, and their only controls were the
   primary advance and the Chronicles aside. The journal cost **nine** taps from the
   morning card (dismiss, play the whole morning conversation to `exploring`, then tap
   Journal), and the digest *prints* "A letter waits unopened in the post tray" on a
   surface from which she cannot open it. → 4.15, 11.12, 11.24. Suspect every screen the
   player cannot avoid: count its controls, then measure the tap cost to each thing the
   screen mentions.

---

## 1. The Conservatory (Hive Builder) vs NYT Spelling Bee

### Input feel
- 1.1 Hex tap targets ≥64px effective diameter at 390px viewport; hive centered in the
  bottom-half thumb zone; one-handed play possible for a full session. **[PARITY]**
- 1.2 Touch-to-letter-render <50ms; hex press animation (scale ~0.85, spring back,
  ≤150ms) driven from `pointerdown`. **[PARITY]**
- 1.3 Entry line with blinking caret; **live letter coloring** before submit: center
  letter in the room accent, dead letters visibly muted. A doomed word is visible before
  Enter. **[PARITY]**
- 1.4 Delete / Shuffle / Enter row. Shuffle: petals fade out/in ≤400ms, center fixed,
  free and unlimited. Delete supports press-and-hold repeat. **[PARITY]**
- 1.5 Hive is one scalable SVG unit (2:√3 hexes); zero layout shift in any state,
  including long entries (font shrinks, never wraps). **[PARITY]**

### Feedback
- 1.6 Invalid word: shake ≤350ms + terse reason toast matching the 5-message taxonomy
  exactly (too short / missing center / bad letters / not in word list / already found)
  + auto-clear ~1s. The player never manually deletes a rejected word. **[PARITY]**
- 1.7 Valid word: praise toast scaled to score with "+N", word flies into the found
  list, total ≤900ms, never blocks further input. **[PARITY]**
- 1.8 Pangram: distinct oversized celebration (color burst + unique sound + named toast)
  that a blind A/B viewer rates ≥"about 5× a normal word." **[BEAT]**
- 1.9 Valid-word SFX exists (light chime, pitch rising with word length) — SB is silent;
  this is our strict upgrade. Fully optional per R.4. **[BEAT]**

### Economy & ladder
- 1.10 Per R.1: a playtester never hesitates before pressing Enter — measured: in a
  5-minute session, median gap between finishing typing and submitting <1s. **[COZY]**
- 1.11 In-room rank ladder follows the SB curve shape: ~8 tiers at ≈2/5/8/15/25/40/50/70%
  of room max, garden-themed (Seed → … → **Full Bloom** at 70%), hidden 100% tier
  ("Every Petal") paying a gem. Points-to-next-tier always visible.
- 1.12 The room is *solved* at 70%. Walking away at Full Bloom pays the full solve;
  remaining words are shown as silhouettes (lengths + first letters, SB-grid style) on
  exit — never spoiled, never shamed. **[COZY]**
- 1.13 First 2 minutes of play produce ≥3 tier-ups (front-loaded ladder). Verified by
  simulation over the shipped puzzle pool at a 50th-percentile word-finding rate.

### Presentation
- 1.14 One accent color owned by the room, used *only* for center cell, caret, progress,
  pangram — never decoration. Everything else ≤2 neutrals on parchment.
- 1.15 Praise copy is in-world, second-person, escalating warmth; Fern reacts to
  pangrams/Full Bloom in character — the thing SB structurally cannot do. **[BEAT]**
- 1.16 Full Bloom triggers a bespoke hand-drawn vignette ≤2s, tap-skippable (the
  "Beeatrice" milestone-art lesson).
- 1.17 Payouts have meaning beyond score: steps/gems/fragments that matter outside the
  room, and at least one character line references a notable Conservatory result the
  next day. **[BEAT]**
  - **ROUND 49 — WHERE THAT MEANING MAY BE STATED, AND WHERE IT MAY ONLY BE SHOWN.**
    Round 46 read 1.17 (with 4.10's *"cards state their mechanical effects"*) as licence
    to print `+1 page` on the draft card. The owner overruled it on 13 Aug: *"Saying +1
    page feeds everything to the player… when a page is revealed, the player has to be
    able to figure out — oh, this room provided me a page!"* **The clause both criteria
    actually license is a PRICE or a RULE OF PLAY** — a move's cost, a wrong guess's
    cost, what a solve pays back, the room's length, the door plan — and every one of
    those still prints. **What a room is worth TO THE MYSTERY is shown at the moment of
    reward and never announced in advance.** So a page names the room that produced it
    on the seal as it lands and on the filed page afterwards (`docs/THE_CLIMB.md` §1g),
    gated live by `npm run gate:attribution` at both phone sizes and proved red on the
    build before it. `WORD_ROOM_FACE_GATE.outbid` is **RETIRED, not re-tuned**: under
    this ruling it should rise, and it measures 11.3% — exactly the clause-free face
    round 46 recorded.

---

## 2. The Library (Word Web) vs NYT Connections (+ Wordle's juice)

### Feel & choreography
- 2.1 Tile-select response <100ms; selected state unambiguous at iPhone size (fill
  change, not just border). **[PARITY]**
- 2.2 Submit → sequential hop (80–120ms/tile stagger) → 300–400ms suspense hold →
  verdict. Total <1.5s. Never instant, never longer. **[PARITY]**
- 2.3 Correct group: slide/merge 600ms–1s ease into an inked banner row; category name
  stamps *after* tiles land; input locked during. **[PARITY]**
- 2.4 Wrong guess: 300–500ms horizontal shake; selection NOT auto-cleared (player edits
  it); step cost animates on the counter as spending. No red flash, no fail screen.
- 2.5 Perfect solve: staggered Wordle-dance bounce across the four banners (~100ms
  stagger).
- 2.6 Shuffle prominent, unlimited, free — and the generator *adversarially arranges*
  the opening layout (planted herrings clustered) so shuffle is a real tool. **[BEAT]**

### Fairness (fixing Koster's rap sheet — validator-enforced per board)
- 2.7 **Red-herring budget rule**: build-time solver counts unintended-but-valid
  4-groupings under all category heuristics (shared affixes, doubled letters, rhymes,
  semantic clusters). Zero unintended complete groupings ship; planted herrings ≤4, each
  a 5th-member or cross-category trap, never a fully-valid fake group. **[BEAT]**
  - **RULING (round 17, Library — the ceiling was ≤3 and it was the binding
    constraint on the number the format is made of).** BENCHMARKS §2 records
    Connections running **2–4 contested tiles**; the round-16 shelf measured a mean
    of **1.12, median 1**, with only 12% of boards inside that band. A contested
    tile is not a garnish on the format, it is the format: with one of them three
    of a board's four threads are uncontested and the evening is a sort. The
    per-tier ceilings move to **2 / 3 / 4** and this clause's cap moves to 4.
    Nothing else in 2.7 changes — zero unintended complete groupings is untouched,
    every planted herring is still a 5th-member or cross-category trap, and the
    per-tier FLOORS are untouched, because a floor that cannot be met drops the
    board and the shelf is already lean. The budget is *fitted* rather than spent:
    `fitHerrings` steps it down one thread at a time until the board's colour
    ladder still describes it honestly, so a board carries as many contested tiles
    as it can carry without lying. Enforced in `tests/puzzles/anchors.test.ts`
    ("the shelf contests more than one tile a night").
- 2.8 Solver-verified uniqueness: exactly one valid membership assignment per board.
- 2.9 ≤1 trivia-knowledge category per board (always the easiest tier); ≥2 categories
  solvable purely from letters/wordplay visible on the tiles. **[BEAT]**
  - **RULING (round 16, verifier — the clause was read two ways in round 15 and a
    critic could neither pass nor fail it while both readings stood).** The "≥2"
    half is a **per-board floor and stays one**: it is what guarantees that any
    board she opens can be entered without trivia she may not have, which is the
    fairness promise the clause exists to make. It is NOT to be re-read as a
    pool-level distribution target, and no fix agent may lower it. The round-15
    request for tier-1 boards at 1 and 0 wordplay categories is therefore
    **declined as written** — but the concern behind it is real and is answered by
    a different lever: a category may be *plain English* and still be solvable
    from the tiles (`___ BAR`, `IRON ___` — a compound is read, not decoded), and
    `isPlainish()` already counts those toward the floor. Tier 1 gets its warm,
    semantic feel from **plain-yellow steering and the quality ordering**
    (`qualityOf`, ≥60% plain yellow), not from starving the floor. The 2.9 census
    to watch is the **mechanic-family cap** (`FAMILY_BOARD_SHARE`), which is the
    measurement that actually tracks "the shelf feels like the same puzzle twice";
    the sweep to 0.45 that costs the shelf 8 boards and 7 tier-3 boards is
    recorded in `ARCHITECTURE_BUDGET`'s docstring and is not worth paying today.
    Getting the top families under 40% needs ~40 more authored pools — an
    **authoring** task for a future round, filed under 2.15, not a generator bug.
- 2.10 Every wrong guess yields ≥1 bit of usable information: "one away" equivalents,
  escalating intruder hints (priced in steps), and **acknowledged herrings** — a wrong
  guess matching a planted herring gets a knowing line ("they *do* all rhyme, don't
  they? But no."). Requires the generator to emit its herring list per board. **[BEAT]**
- 2.11 The final group is never pure leftovers: the player performs an act of naming
  (pick the category label from 3 options, or type a keystone word) for the perfect
  bonus. **[BEAT]**
- 2.12 Difficulty ordering playtested: the easiest group is found first on ≥70% of
  boards (Liu's tester-veto rule). Failing boards get re-tiered or rebuilt.

### Cozy compliance
- 2.13 No fail state: a 4th mistake does not end anything; steps are the only cost;
  abandon always offered. No countable mistake-dots UI. **[COZY]**
- 2.14 Endscreen copy graded and warm ("Perfect! / Splendid / Well pieced-together /
  Got there") — never shame-adjacent. **[COZY]**
- 2.15 Solved banners stay readable; remaining tiles never lose selection/state on
  shuffle (Wordle-keyboard persistence lesson).

---

## 3. The Gallery, The Study, and the six micro-rooms (general word-room bar)

The Gallery (Twistle), Study (Forgotten Word), and micro-rooms have no single benchmark,
so they inherit the cross-cutting standards distilled from Wordle/SB:

- 3.1 Reveal cadence: any multi-element verdict reveals sequentially (≥3 elements:
  stagger 100–400ms/element, state change at animation midpoint), never as an instant
  repaint. **[PARITY]**
- 3.2 Error state: invalid input = shake + terse reason toast + no resource cost for
  *malformed* input (only deliberate wrong claims cost steps, per R.1's principle).
- 3.3 Persistent memory prosthetics: any information the player has earned (eliminated
  letters, tried rungs, decoded cipher letters) stays visible — the player never
  re-derives what the game already told them. **[PARITY]**
- 3.4 Win state: distinct celebration animation ≠ the reveal animation, ≤2s,
  tap-skippable.
- 3.5 Micro-rooms complete in 30–90s at the 50th percentile (instrumented playtest);
  an anchor room fits inside one 10–15 minute day with steps to spare.
- 3.6 The Pantry's step-tick is the only timed pressure in the game, ticks *steps only*,
  and has no real-time fail state. **[COZY]** (MANOR_DESIGN §11.)
- 3.7 The Study's definitions read as the best writing in the game: every Forgotten Word
  poem passes an editorial read-aloud pass; out-of-guesses = auto-abandon, never a fail
  screen. **[COZY]**
- 3.8 Hard-mode philosophy: any difficulty knob constrains the player (Wordle hard mode)
  rather than adding content or speed.

---

## 4. Drafting & steps vs Blue Prince

### Offer generation (unit/simulation-tested)
- 4.1 Affordability-aware: with 0 gems, ≥1 free card in every offer; premium cards appear
  at elevated rates only when gems ≥ cost. (Offer-distribution unit test.) **[PARITY]**
- 4.2 Rarity shifts by row: simulate 10k drafts/row — violet + tier-3 share strictly
  increases with row; row 1 offers 0% tier-3.
- 4.3 Anti-repeat: an offered-and-declined card has measurably reduced probability in
  the next draft (per-rarity suppression, BP-style 60/80/90/99% shape; simulation test).
- 4.4 Never an unplaceable offer: no all-dead-end triples, no offer with zero
  connectable doors (property test over all cell/door configurations). **[PARITY]**
- 4.5 Day 1 draft #1 is scripted; a first-time player reaches a solvable puzzle room
  within 3 taps of starting.
- 4.6 **Drafts are cancellable** (back out for the 1 step already spent) and rerollable
  (1 gem) — fixing BP's most-resented friction. **[BEAT]**
- 4.7 Deck edits are visible: the floorplan cabinet shows exactly which cards are in the
  current deck and why (unlock badges); categories stay small and equal enough to
  memorize (≈8 per specialist category).
- 4.8 Reroll determinism: rerolling at door A provably does not perturb door B's future
  offers (per-cell RNG streams; property test).

### Step economy (simulation-tested before any playtest)
- 4.9 One audited ledger: every step delta (move, mistake, solve, perfect, tea, snack,
  Dewey, gift) flows through the single `STEP_TABLE`/ledger function; steps never
  negative; every delta renders as a floating +N/−N on the counter. **[PARITY]**
- 4.9a **NO SURFACE MAY PRINT A NUMBER THE LEDGER DOES NOT CHARGE, AND THE DAY'S SUM
  MUST CLOSE ON THE GLASS** (round 45, off the cold read of the round-42 build). One
  audited ledger is necessary and was never sufficient: five room views held a
  transcribed `tier === 3 ? 3 : 2` from the price ladder round 42 deleted, so the
  Library printed −2 beside a charge of −1 and the Counting House printed **−6 on a
  button** against the same −1, while `Step back · 1 step` charged nothing at all.
  Two published numbers, both stated as identities rather than as bands:
    · every printed price equals the charge — `tests/round45-prices-live.mjs` reads the
      price off the painted glass, taps the control with a real pointer, and compares it
      with the candle's own numeral. **Never against the store**: the store is where both
      halves of a mispriced control agree, which is why sixteen rounds of green economy
      tests never saw it.
    · **`dayStartTotal` − `stepsSpent` + `stepsGivenBack` === `ledgerTotal`.** The band
      that moved and why: the night digest's *"Steps given back"* falls by the day's dawn
      grants (1 on a normal evening — Bramble's cup was inside the figure on the candle
      AND printed again as a payout), so all three cold-read players did the sum and all
      three got the same wrong answer. `docs/THE_CLIMB.md` §1d. **[PARITY]**
- 4.10 **The campaign arc** (rewritten from the 2026-08 owner playtest: *"way too easy —
  I reached the Forgotten Word on my first day; Blue Prince took me 28 days"*). The
  economy is a push-your-luck **climb** whose ceiling rises across weeks, and every
  number below is verified by `tests/economy-simulation.test.ts` over thousands of
  seeded days and hundreds of seeded multi-week campaigns played through the real
  `STEP_TABLE` + ledger — **before** any playtest, and re-run on every tuning edit:

  > ### ROUND 24 — THE INSTRUMENT COULD NOT SEE THE MANOR
  >
  > **Every number in 4.10a–i before this round was measured on a model that tracked a
  > SCALAR ROW (1..6) and a step budget.** It never held a `Cell`, never called
  > `resolveDoors`, never asked `sealsItself`, never had a frontier and never had a
  > neighbour — grepping `sealsItself|draftTargets|resolveDoors|neighbor(` over
  > `src/engine/economy/simulate.ts` returned **0**. Three consequences, each of which
  > invalidated published numbers:
  >
  > 1. **No change to the deck's GEOMETRY could move a single published band.** Door
  >    layouts, the rigid rotation, the sealed-room bounty, round 22's dead-end
  >    rebalance — the campaign model was blind to all of it. A row is not a floorplan.
  > 2. **The evening could not STRAND**, so `metrics:review` printed *"unspent budget
  >    0.0%"* on every day and REVIEW_AA §8's third gate answered itself.
  > 3. **The landing gate was a proxy**: `landingDraft` rolled a hypothetical offer at
  >    (2,5) on an EMPTY manor whenever the scalar row hit 6 — i.e. it assumed that
  >    climbing the storey and standing on the landing CELL were the same event.
  >
  > `simulateDay` is grid-true now (`engine/economy/manor-walk.ts` plus a rewritten day
  > loop): a real `ManorState`, the frontier from `draftTargets`/`doorsConnect`, the
  > padlock from `isDoorLocked` per (daySeed, cell) rather than a per-row coin, the offer
  > from `rollCards` at the real door, the plan from `resolveDoors`, the seal from
  > `sealsItself`, and `reachedSanctum` **is** `atSanctumDoor(manor)`. The room she plays
  > is the CARD SHE TOOK, not a draw from `deckMixAt`. **One instrument, not two** — a
  > second harness would have needed its numbers gated against the first, and the first
  > is the one that is wrong.
  >
  > **THE HEADLINE FINDING: the top of the house is priced by GEOMETRY, not by steps.**
  > Standing on row 5 is not standing on (2,5). Measured with the manor in hand, only
  > **24.5%** of the evenings that reach the landing storey end on the landing cell with
  > a plan that opens north — and given an unlimited purse and ten keys the door is still
  > only a **30%** proposition per evening, while the house shuts (every reachable room's
  > doors on outer wall or blank plaster) after a median **20 of 33 cells**. That is the
  > commission this round hands the next one, and it is why the ACCESS bands below moved
  > while every KNOWLEDGE band stayed exactly where it was.
  >
  > **EVERY BAND THAT MOVED, before (grid-blind) → after (grid-true):**
  >
  > | band | before | after |
  > |---|---|---|
  > | 4.10a skipper: how the evening ends | 100% spent out *(by construction)* | 76% spent out · **24% shut in**, median 6 steps left |
  > | 4.10b rooms per evening | 5–8 (measured 6) | **7–11** (measured 9) |
  > | 4.10b median / p90 minutes | 10–15 / ≤23 (10.8 / 16.2) | band unmoved, measured **14.6 / 18.9** *(round 26: 14.4 → 14.6, the Gallery's re-clock)* |
  > | 4.10c great day, max row | 5–6 | measured **5**; landing 8.6% → **3.7%** *(round-25 re-derivation; this row shipped saying 4.2% → 4.3%, and neither figure is in the tree — `share(great, reachedLanding)` over the test's own fixture is 3.73%)* |
  > | 4.10d skilled first DOOR | 6–10 (measured 9–10) | **14–22** (measured 18 on all four seeds) |
  > | 4.10d skilled, by day 21 | >90% (99.5%) | **>65%** (72.3%); >85% by day 28 |
  > | 4.10e skilled volume win | 12–20 (measured 16) | **12–20 UNMOVED** (measured 18–19) |
  > | 4.10e skilled, by day 28 | >99% (100%) | **>85%** (88.2%); >95% by day 35 (95.3%) *(round 26: 88.7% / 96.3% before the Gallery's re-clock — the floors hold, with 0.3 pt of margin at day 35)* |
  > | 4.10f skilled evening, whole campaign | 10–15 (12.8) | **14–20** (16.9 early → 18.2 late) |
  > | 4.10f median-player evening | 10–15 (12.8) | **13–18** (14.5 early → 15.6 late) |
  > | 4.10d/e median player first DOOR | 12–20 (measured 19) | **22–30** (measured 24–26); never-inside-45 0% → **12.8%** |
  > | 4.10d/e median player volume win | 18–28 (measured 23) | **24–32** (measured 25.5–29) |
  > | 4.10d/e median player deduction | 14–24 (measured 19) | **14–24 UNMOVED** (measured 17) |
  > | 4.10d/e knowing→saying gap, median | 8 hers / 2 his | **9 / 4** (p90 22 / 16) |
  > | 4.10d/e keys: solves vs deck, median player | 10569 vs 2751 | **13882 vs 15700 — INVERTED** |
  > | 4.10g violet evenings, median player | 21.7% | **37.0%** |
  > | 4.10g a solve makes a page out, median player | <1 day in 3 (23.5%) | **35.2%** — she cleared it; the split is now about SIZE (his 65%) |
  > | 4.10g sealed overnight, skilled | 25–55% (49.0%) | **25–60%** (55.1%) |
  > | 4.10g sealed overnight, median player | 10–25% (18.3%) | **10–35%** (29.3%) |
  > | 4.10i ground-floor drain per room | −2.58 hers / −0.96 his | **−1.24 / −0.26** *(round-25 re-derivation: his figure shipped as −0.35; `drain(PROFILE_SKILLED)` over the pressure suite's own 120×45 fixture is −0.257, which is 0.007 inside the −0.25 bound the test asserts — a tighter squeeze than the published number implied)* |
  > | 4.10i in hand at the first padlock | 12 / 18 | **11 / 19** |
  > | §8 unspent budget at day end | median 0.0% p90 0.0% *(vacuous)* | median 0.0% **p90 33.3%**, 14.4% of evenings shut in |
  > | §5.7 "offers with a real choice" | 79.2% | **RETIRED — see 4.10j** |
  >
  > ### ROUND 36 — A MOVE COSTS A MOVE, AND WHAT THAT MOVED
  >
  > `MOVE_COST_BY_ROW` went `[-2,-2,-2,-2,-7,-9,-9]` → **`-3` on every storey**, and
  > `BASE_DAY_BUDGET` 18 → **22** with it, because the two are one lever
  > (docs/THE_CLIMB §1; the owner, after playing: *"It shouldn't get more expensive the
  > further you move up… the steps economy is driven by needing to double back"*).
  > Nothing else in `steps.ts` was retuned — the padlock, the key supply, the tea arc,
  > the wage and the deck are untouched — so every figure below is a CONSEQUENCE of the
  > two constants, measured on the round-25 grid-true model.
  >
  > | band | before (altitude toll) | after (a move costs a move) |
  > |---|---|---|
  > | 4.10a skipper stands at the DOOR | 0% *(by construction — the staircase cost more than the budget)* | **0.03%**, measured; gated <0.1% |
  > | 4.10b median / p90 minutes | band 10–15 / ≤23, measured 14.6 / 18.9 | band unmoved, measured **12.2 / 17.5** |
  > | 4.10b rooms per evening | 7–11 (measured 9) | band unmoved, measured **8** |
  > | 4.10c great day, max row | 5–6 (measured 5) | unmoved (measured **5**); landing 3.7% → **6.1%** |
  > | 4.10d skilled first DOOR | 14–22 (measured 17–18) | **band unmoved**, measured **16** on all four seeds |
  > | 4.10e skilled volume win | 12–20 (measured 18–19) | **band unmoved**, measured **16.5–17** |
  > | 4.10d/e median player first DOOR | 22–30 (measured 23–26) | **17–25** (measured **20–21**) |
  > | 4.10d/e median player volume win | 24–32 (measured 25–28) | **18–26** (measured **21–22**) |
  > | 4.10d/e median player never inside 45 | 8.4–13.6% | **0–1%** |
  > | 4.10d/e median player deduction | 14–24 (measured 17) | **band unmoved** (measured 17–18) |
  > | 4.10f skilled evening early → late | 17.0 → 18.0, inflation 1.05 | **14.8 → 18.6**, inflation **1.26**; ratio gate ×1.2 → ×1.3, p90 ≤26 → ≤27 |
  > | 4.10f median-player evening | 13–18 (14.7 → 15.7), inflation 1.07 | **12–18** (12.7 → 15.5), inflation **1.23** |
  > | 4.10g sealed overnight, skilled | 25–60% (55.1%) | **25–75%** (67.6%) |
  > | 4.10g sealed overnight, median player | 10–35% (29.3%) | **10–45%** (36.5%) |
  > | 4.10h wage spread, every room × tier | 9.07× | **7.77×** *(the ceiling is thirds of a day and the day grew)* |
  > | 4.10i ground-floor drain per room, median player | −1.22 | **−2.24** |
  > | bare ascent to the landing | 22 against an 18-step budget | **15 against 22** — see 4.10d, the invariant is deleted |
  >
  > **THE ASYMMETRY IS THE FINDING.** The skilled player's two published bands did not
  > need touching; the median player's moved by five or six evenings and her
  > never-finished tail went to nothing. She is modelled at `walkbackPerRow` 0.58 against
  > his 0.36, and the old table charged −7 and −9 for exactly the storeys she re-walks —
  > so the altitude toll was, measurably, a tax on doubling back that only the player who
  > doubles back paid. That is the owner's own diagnosis arriving as a number.
  >
  > **AND THE COST, STATED PLAINLY.** Three things got worse and are published rather
  > than absorbed: the late-campaign evening inflates harder (4.10f — climbing IS
  > drafting rooms now, so the tea arc buys minutes), the seal's overnight backlog rose
  > for both profiles (4.10g — more of every evening happens on the storeys where violet
  > is dense, while solving stays clock-bound), and a refund-less evening can now reach
  > the door on 3 days in 10,000 where the old arithmetic forbade it outright. **The game
  > did not get longer for anyone; it got about six evenings shorter for her.**
  >
  > **THE KEY INVERSION IS A FINDING, NOT A TUNING NOTE.** The old model handed a green
  > card its key only when the player was SHORT of one (`needsKeySoon && keys < 2 &&
  > roll < keyLuck`, else a flat 20%). The live game does no such thing:
  > `applyDraftEffects` pays `UTILITY_EFFECTS[cardId].keys` on placement, every time.
  > With that fixed, the round-10 owner directive — *"skill, not just persistence, earns
  > the campaign"* — **holds for the skilled player (20213 solve-keys vs 17342 deck) and
  > fails for the owner's own profile (13882 vs 15700)**. That is a deck-supply question
  > and it is recorded here rather than tuned away, because this round may not touch
  > `deck.ts`.
  >
  > **WHAT DID NOT MOVE, and it is the interesting half.** Every KNOWLEDGE band — both
  > profiles' deduction day, the legible-day share, the skilled volume win, the 10–15
  > minute single evening — is where it was. The climb to the landing STOREY is where it
  > was (skilled median day 12 against a grid-blind 9). What moved is the LAST STEP of
  > the climb and the tail of every distribution that waits on it. Nothing in `deck.ts`,
  > `drafting.ts` or any content file was edited: an instrument round that also tunes the
  > thing it measures is worthless.
  >
  > ### ROUND 42 — A STEP IS A MOVE, AND EVERY BAND WAS RE-DERIVED
  >
  > **THE OWNER, 12 Aug** (docs/THE_CLIMB §1b, binding): *"Why isn't it just 1 step is
  > −1. Why do you keep coming up with a convoluted economy. What you should be modifying
  > is the amount of steps you start with and how many more you can earn and the
  > penalties."* · *"10–14 moves at the start… but you can earn more moves as you go
  > yeah?"* · *"Step penalty for wrong guesses is way too harsh on things… it should be
  > 1 step for a wrong guess on things."*
  >
  > Round 36 shipped a flat **−3 a move against a budget of 22**, and 22 steps at 3 a
  > move is **seven moves** — a fiction the player has to divide her way out of, and the
  > largest unresolved COMPREHENSION finding (both cold testers reported the counter
  > moving for reasons they could not account for; you cannot audit a ledger denominated
  > in an arbitrary unit). Four rulings, none of them a tuning parameter: **a move costs
  > 1**, **a day starts at 12 moves**, **a wrong guess costs 1 move at every weight and
  > every tier**, and **solving buys more day**. Everything else in the economy is
  > re-denominated to match, and **evening length is an OUTPUT** of the starting count
  > and the payouts — never again steered by re-pricing a move.
  >
  > What was measured: 4,800 seeded evenings a profile and 800 seeded campaigns a
  > profile on the grid-true model, before and after, plus a 30,000-evening skipper run.
  >
  > | band | before (a move costs 3) | after (a move costs 1) |
  > |---|---|---|
  > | 4.10a skipper stands at the DOOR | 0.03%; gated <0.1% | **0.163%** over 30,000 evenings (per-seed 0.067–0.267%); gated **<0.5%** |
  > | 4.10a skipper evening | 2–5 min (2.4), 7 rooms | band unmoved, measured **3.4 min**, 10 rooms |
  > | 4.10b median / p90 minutes | band 10–15 / ≤23, measured 12.2 / 17.5 | **band unmoved**, measured **13.6 / 17.8** |
  > | 4.10b rooms per evening | 7–11 (measured 8) | band unmoved, measured **9** |
  > | 4.10b day-1 evening | 12.5 min | **13.2 min** |
  > | 4.10c great day, max row | 5–6 (measured 5) | unmoved (measured **5**); landing 6.1% → **8.7%**, band <25% |
  > | 4.10d skilled first DOOR | 11–19 (measured 13–14) | **band unmoved**, measured **12–13** |
  > | 4.10d skilled day-1 DOOR | <8% (0.5–1.5%) | band unmoved, measured **0.4–2.4%** |
  > | 4.10e skilled volume win | 12–20 (measured 15–15.5) | **band unmoved**, measured **14–15** |
  > | 4.10d/e median player first DOOR | 14–22 (measured 16.5–17) | **band unmoved**, measured **15–16** |
  > | 4.10d/e median player volume win | 16–24 (measured 19) | **band unmoved**, measured **18–19** |
  > | 4.10d/e median player deduction | 14–24 (measured 17) | **band unmoved**, measured **16–17** |
  > | 4.10f skilled evening early → late | 14–20 (15.2 → 18.8), p90 ≤27 | **14–22** (**17.1 → 21.1**), inflation 1.23 unmoved; **the late p90 is RETIRED — see below** |
  > | 4.10f skilled late evenings ended EARLY | 5.5% *(unpublished)* | **9.7%**, published and gated 2–15% |
  > | 4.10f median-player evening | 12–18 (12.7 → 15.5), inflation 1.23 | band unmoved, measured **13.9 → 17.0**, inflation 1.22 |
  > | 4.10g a solve makes HER page out | <45% (35.2%) | **<60%**, measured **56.8%** — the gap to his 79.7% is what the clause is about, and it holds |
  > | 4.10h wage spread, every room × tier | 7.77× | **4.53×** *(the ceiling came off the budget and onto the staircase)* |
  > | 4.10i ground-floor drain per room | −2.24 steps hers / −1.15 his = **−0.75 / −0.38 moves** | **−0.95 / −0.42 moves** — the floor got DEARER in the unit she counts in |
  > | 4.10i steps in hand, rows 0–2 | 16 hers / 20 his, of a 26-step purse | **8 / 11**, of a **13-move** purse |
  > | bare ascent to the landing | 15 against a 22-step budget | **5 against 12** |
  > | realistic ascent (with walk-backs) | 25.8 against 22 = **8.6 moves against 7.3** | **8.6 moves against 12** — see below, the replacement invariant is deleted too |
  >
  > ### ROUND 44 — the bands that moved for the Gallery's studies, and the one that did NOT
  >
  > A study hands back the move she spent walking in, once a board (`STUDY_REFUND`,
  > `docs/THE_CLIMB.md` §1c) — the owner, from play: *"It didn't automatically add steps."*
  > Measured over 4,800 evenings a profile on the grid-true model it pays the median
  > player **1.04 moves a day**, and one move a day is one more room on the evenings that
  > have the tea to spend it.
  >
  > | band | round 42 | round 44 |
  > |---|---|---|
  > | 4.10f median-player evening, LATE median | ≤18 (17.0) | **≤19** (measured **18.51**) |
  > | 4.10f median-player evening, EARLY median | 12–18 (13.9) | band unmoved, measured **14.6** |
  > | 4.10f median-player late p90 | ≤23 (22.3) | band unmoved, measured **22.9** |
  > | 4.10g her sealed-overnight share | <45% (36.5%) | **<48%** (measured **47.3%**) |
  > | 4.10g her violet-met share | <55% (50.3%) | **<56%** (measured **55.3%**) |
  > | 4.10g HIS violet-met share | <85% | **<86%** (measured **85.8%**) — the SPLIT, which is what the clause is about, is unmoved |
  > | 4.10g her overnight rate (`volume-pacing`) | 10–45% (36.5%) | **10–50%** (measured **48.2%**) |
  > | **4.10h wage spread, every room × tier** | 4.53× | **4.53× — UNMOVED, and that is the point** |
  >
  > **THE WAGE SPREAD IS UNMOVED BECAUSE A REFUND IS NOT A WAGE, and the counterfactual is
  > computed rather than asserted** (`tests/gallery-studies-pay.test.ts`). The Gallery is
  > already the joint TOP of the wage table — 0.80 moves a minute, and it is there because
  > `SOLVE_WAGE.floor` catches a 1.25-minute room, not because it is generous — so there is
  > no room above it to pay a study out of. Priced honestly a study is worth **0.11 of a
  > move** (nine to the move), which does not answer a woman who has traced ONE word;
  > priced at the ledger's smallest coin a solved tier-1 Gallery plus four studies earns
  > 2.22 moves a minute and **the published spread goes 4.53× → 12.6×**. `solvePayout` is
  > therefore untouched, and the payment un-charges a cost instead of pricing work.
  >
  > **AND THE INSTRUMENT ITSELF IS OFF BY MORE THAN THE CHANGE.** Modelling a study
  > exposed that `simulate.ts` has charged the Gallery for off-ask traces since round 28
  > that the room does not charge — `SimProfile.studyRelief`, 0 as shipped, 1 as the truth
  > — and `tests/economy-effort.test.ts` publishes the gap on every run: **the truthful
  > median evening is ~16 minutes against 4.10b's 10–15.** Every 4.10 band above is
  > measured through a Gallery poorer than the one that ships. Paying it off moves the
  > day's STARTING COUNT, which is an economy commission (STATUS §0).
  >
  > **THE SECOND HALF OF ROUND 36'S INVARIANT IS DELETED, DELIBERATELY.** Round 36 killed
  > `reserveToTop(1) > BASE_DAY_BUDGET` for the BARE staircase and replaced it with the
  > same inequality for the REALISTIC ascent (25.8 > 22). Denominated in moves the left
  > side never moved — the climb is 8.6 moves before and after — while the purse went 7.3
  > → 12 on the owner's own number, so the inequality is false and the only way to
  > restore it is to overrule his 10–14. **The claim it stood in for is measured instead,
  > on instruments that could disagree with it, and all three hold:** the refund-less
  > skipper reaches the door on 0.163% of evenings, the skilled player on day 1 in
  > 0.4–2.4% of campaigns against a published <8%, and a great single evening reaches the
  > landing storey on 8.7% against a published <25%. Round 24 had already found the
  > reason: *"the deck's door layouts, not the step table, are what price the top of the
  > house."*
  >
  > **WHY SO LITTLE MOVED, and it is not a design achievement — it is arithmetic nobody
  > predicted.** The purse grew 64% in moves and the campaign barely shifted, because the
  > third ruling pushes the other way: mistakes were 36% of the whole economy at round-36
  > HEAD (≈10 a day at −2 steps against a 56-step turnover) and are 45% of it now (≈10 a
  > day at −1 move against a 22-move turnover). A bigger purse and a dearer error very
  > nearly cancel. It is written down because the next round will otherwise read the
  > stability as evidence that the change was small.
  >
  > **THE GUARDRAIL, DERIVED RATHER THAN ASSUMED.** "Solving buys more day" invites the
  > owner's own first complaint back — a day that never ends is *"way too easy"* wearing
  > a new hat. What stops it is **not** a cap on moves earned. It is two measured facts,
  > both re-measured every run in `tests/economy-pressure.test.ts`:
  > **(1) ARITHMETIC** — the average room is net NEGATIVE in moves for every profile
  > (the median player spends 1.50 and earns 0.95; the skilled 1.64 and 0.81; a GREAT day
  > 1.70 and 1.13), so solving lengthens an evening and can never sustain one;
  > **(2) GEOMETRY** — the manor is 31 draftable cells and the frontier closes as it
  > fills. Over 6,000 simulated evenings across four profiles **not one ended `filled`**,
  > and 8–20% ended `stranded` — the house shut with moves still in hand.
  >
  > **AND WHAT GOT WORSE, PUBLISHED RATHER THAN ABSORBED.**
  > 1. **His late-campaign evening is 21.1 minutes** and 9.7% of those evenings now end
  >    on his own appetite clock rather than on an empty ledger (it was 5.5%). That is
  >    why the LATE p90 is retired: it measured 28.0 against a `sessionMinutes` of 28, so
  >    it was reading the clock and not the game — `CLOCK_BAND`'s own rule, applied to the
  >    quantity it is actually about. What replaces it is the median (nowhere near the
  >    cap) and the early-night share itself, which is two-sided and cannot be clipped.
  > 2. **The refund-less player reaches the sealed door five times more often** (0.03% →
  >    0.163%), because a 5-move staircase is affordable out of a 12-move purse in a way
  >    it was not out of seven moves. She still wins nothing: she has solved nothing, so
  >    she holds no fragments and has no word to say.
  > 3. **One of 4.10h's four wage spreads ROSE** — tier-1/2 rooms of two minutes or more,
  >    1.43× → 1.71× — and the ratchet is supposed to be one-way. The cause is the unit
  >    rather than the pricing: the Darkroom is 3.0 minutes at tier 1 and 3.5 at tier 2, a
  >    17% difference in length that rounds to 1 move and 2 moves, a 100% difference in
  >    pay. **That is the honest floor a coarse unit puts under this metric**, and the way
  >    to pay it back is content (lengthen the Darkroom's tier 1 or shorten its tier 2),
  >    not a fractional step. The other three all fell, hard.
  > 4. **The Kitchen and the Larder now pay the same**, and so do the Boot Room and the
  >    Still Room: +6/+5/+3/+2 steps is 2/1.67/1/0.67 moves and there are only two
  >    integers in that range. Four distinct refills became two, distinguished now by what
  >    else they carry rather than by how much they pay.
  >
  > **AND ONE THING THE UNIT ALMOST BROKE, caught by a test rather than by a reviewer.**
  > `stageSteps` paid `floor(total × fraction)`, and with the Library's whole payout at
  > +2 moves the first thread she wove banked **nothing** — REVIEW_AA §6's original
  > complaint, reintroduced by a change of unit. Two clauses fixed it and neither moves a
  > published band, because a solved room still pays exactly `solvePayout`: *a rung she
  > has climbed pays at least one move* (the ledger has no smaller coin), and *the summit
  > always keeps one*. The Conservatory's instalments are 1/2/3 with 2 at Full Bloom,
  > exactly what `floor` paid.
  >
  > ### ROUND 48 — five of these bands were screenshots, and three of them were already red
  >
  > A verifier read rounds 42 and 44 and found the same shape five times: a bound
  > republished as `ceil(measured)`. Re-measured over **six** campaign seeds instead of
  > the one each was set on, the complaint is not a prediction — it has already happened:
  >
  > | band | set at | across 6 seeds | verdict on the OTHER seeds |
  > |---|---|---|---|
  > | 4.10g her sealed-overnight day-share | <48% (47.3%) | 47.5 – 48.3% | **red on 4 of 6** |
  > | 4.10g HIS violet-met day-share | <86% (85.8%) | 85.1 – 86.3% | **red on 1 of 6** |
  > | 4.10g her violet-met day-share (`volume-pacing`) | <56% (55.4%) | 55.3 – 56.3% | **red on 2 of 6** |
  > | 4.10g her violet-met day-share (`economy-simulation`) | <56% (55.3%) | 55.2 – 55.8% | 0.4σ of margin |
  > | 4.10f her late p90, minutes | ≤23 (22.9) | 22.92 – 23.38 | **red on 4 of 6** |
  > | 4.10f her late median, minutes | ≤19 (18.51) | 18.33 – 18.64 | 2.6σ of margin |
  >
  > **AND ONE STATISTIC WAS ENFORCED TWICE, AGAINST TWO POPULATIONS, WITH THE TIGHTER
  > BOUND ON THE POPULATION WHERE IT STILL PASSED.** "Still a rare room (<50%)" was
  > asserted on `simulateDays` standalone evenings (violet-met **35.7%**, 10.2 rooms a
  > night) *and* on campaign evenings (**55.2%**, 12.3 rooms a night). 4.10g is a claim
  > about her campaign; it is asked of the campaign now, once.
  >
  > **THE RULES THE REPLACEMENTS ARE DERIVED FROM.** Two, and each band below is one:
  >
  > 1. **A metric's name must match what it computes.** "Still a rare room" is a claim
  >    about ROOMS and the gate computed DAYS. A violet-met day-share is
  >    `1 − (1−p)^rooms` — it rises toward 1 as the evening lengthens *at constant
  >    rarity*, which is exactly why rounds 42 and 44 each republished it while writing,
  >    correctly, that violet's share of the deck had not moved. Three day-share ceilings
  >    are therefore **retired, not widened**, and the design requirement each stood in
  >    for is gated in its place.
  > 2. **A band's headroom must exceed the granularity of the lever allowed to move it.**
  >    The only levers 4.10 permits are the day's starting count and the payouts (owner,
  >    THE_CLIMB §1b). Round 44 measured the smallest of them: **one move a day** is 1.04
  >    rooms and 1.5 minutes of evening. A ceiling with 0.49 minutes under it is finer
  >    than the smallest change the design may make.
  >
  > | band | round 44 | round 48 |
  > |---|---|---|
  > | 4.10g "still a rare room" | violet-met day-share <56% hers / <86% his | **RETIRED** → violet's share of the ROOMS she enters **<20%**, measured **6.03%** hers / **10.65%** his (σ 0.0004), against a deck offering violet on 1.97% of row-0 and 10.54% of row-6 cards |
  > | 4.10g sealed-overnight ceilings | <48% hers, <75% his, ≤50% (`volume-pacing`) | **RETIRED** → the floors stay (4.10g's own 25% for him, "never never" 8% for her) and the ceilings are replaced by *a solve lifts the seal the same night* (**82.0%** his / **62.7%** hers, floors 70/50%) and *the desk is clear at dawn* (**26.2%** his / **52.0%** hers, floor 20%) |
  > | 4.10f her late median | ≤19 min | **a NAMED DEBT: at most 5 minutes over 4.10b's published 15** (measured 3.46 over). The design's number is 15 and restoring it moves `BASE_DAY_BUDGET`, which is an economy commission — so what is gated is the DISTANCE from the criterion, not the build |
  > | 4.10f her late p90 | ≤23 min | **≤1.5× the window's own median** — 4.10b's own tail allowance (23/15 = 1.53), measured **1.250** (σ 0.003) |
  >
  > **EVERY REPLACEMENT IS PROVED RED ON A POPULATION THAT REALLY VIOLATES IT**, in the
  > suite rather than in a comment. `PROFILE_SKIPPER` — the player who solves nothing —
  > lifts a seal the same night on **0.0%** and wakes to a clear desk on **4.9%**, through
  > both new floors. And the rare-room ceiling is shown to be a ceiling on the DECK rather
  > than on taste: cranking `mysteryPull` to 5,000 **saturates at 14.92%** of rooms
  > entered, so the only way past 20% is to raise `deckMixAt`'s mystery ramp by about a
  > third — which is the change round 36 nearly shipped, and the one the clause exists to
  > refuse.
  - **4.10a — the no-refund day.** Skipping every puzzle tops out on the middle floors
    (median 1-based row 4) and is over in **2–5 minutes**. Refunds are what buy a real
    day.
    *ROUND 36 — "NEVER THE SANCTUM ROW" IS NOW "0.03% OF EVENINGS", AND THE OLD ZERO
    WAS ARITHMETIC RATHER THAN AN OBSERVATION.* Under the altitude toll a refund-less
    evening could not reach the landing because the bare staircase cost more than the
    whole budget; the 0 fell out of the table, not out of play. With one flat price
    (docs/THE_CLIMB §1) a freak evening can walk a clean line up the stair column with
    both padlocks open and draw a north-opening plan at the top — **1 evening in 3,000**,
    measured, and she wins nothing when she gets there because she has solved nothing and
    has no word to say. It is published at 0.03% rather than rounded back to zero,
    because "never" and "three hundredths of one per cent" are different claims.
    *ROUND 42 — **0.03% → 0.163%**, measured over 30,000 skipper evenings across ten
    seeds (per-seed 0.067–0.267%), gated at **<0.5%**. A bare staircase is five moves and
    the dawn purse is twelve, so the freak clean line is affordable in a way it was not
    when 22 steps bought seven moves. The old <0.1% was not merely tight — it sat inside
    the seed noise of the suite's own 3,000-day fixture, which is why the honest bound is
    published against a run ten times its size. She still wins nothing up there.*
  - **4.10b — the decent day is 10–15 MINUTES at the median, p90 ≤ 23.** Not 20 (the
    pre-overhaul measurement) and not 29 at p90. ***ROUND 42: the band is UNMOVED and
    the measurement inside it rose — median **13.64**, p90 **17.82**, **9 rooms** — on a
    day that starts at 12 moves rather than 7.3. See the round-42 block above for why so
    little moved.*** **Measured at round-36 HEAD: median
    12.21, p90 17.45** (3,000 seeded days, `PROFILE_DECENT`, seed `0xbeef`; 12.07–12.67
    and 17.41–17.66 across the four independent seeds the test also runs). That is
    **7–11 rooms** (measured 8) with a median 2 puzzles actually solved — the post-cull
    deck is anchor-heavy, so fewer rooms *is* the same amount of game.
    *ROUND 36 — the band did not move and the measurement inside it did: 14.63 → 12.21,
    i.e. from 0.37 min under the ceiling to 2.2 min over the floor. Cause: the move price
    flattened at −3 (docs/THE_CLIMB §1), which is 1.5× the old ground-floor rate on the
    storeys where nearly every move happens, and `BASE_DAY_BUDGET` moved 18 → 22 to meet
    it. 22 is where this number lands back inside the window with room on both sides —
    at 18 it measured **9.88–10.11 across the four seeds, i.e. UNDER the promised floor**,
    which is what set the budget rather than any wish to hand her more steps.
    A second consequence is worth recording because round 22 had quietly retired it: the
    scripted first-morning pot is load-bearing again. Day 1 WITHOUT it measures **9.92
    minutes**, under the floor, exactly as the round-5 audit originally found.*
    ***ROUND 50 — AND THAT GATE WAS RETIRED, NOT WIDENED, BECAUSE IT HAD STOPPED
    COMPUTING WHAT IT WAS NAMED FOR.*** The assertion under the sentence above read
    `bare < 13` beneath a note claiming the bare evening *"sits in the LOWER HALF of the
    10–15 window"* — which is ≤ 12.5. At round-49 HEAD it measures **12.991**: RED against
    its own description, and passing its own bound by **half a second**. Both round-48
    failures in one line — a name that does not match the computation, and a
    `ceil(measured)` level with a hundredth of the headroom one move a day buys. It is
    replaced by the claim the note actually argues, which can fail in both directions:
    **`FIRST_MORNING_POT` is ONE MOVE and what that move buys is measured — 1.14 minutes
    of first evening**, against round 44's independent measurement of a move a day at 1.04
    rooms and ~1.5 minutes. Gated **0.7–2.5 minutes**: red if the pot ever becomes
    decorative, red if day 1 quietly becomes a different evening from the other
    twenty-nine. The potted first evening keeps its 10–15 window unmoved (measured
    **14.21**).
    *Round 25 — THIS PARAGRAPH WAS THE STALEST PROSE IN THE FILE, and it disagreed with
    round 24's own table 40 lines above it. It read "measured median ~11.6, p90 ~21.5"
    and "5–8 rooms", both of which were round-5 figures: the median has since gone
    12.74 → 10.87 (round 23's ground-floor retune, shipped as "unchanged") → 14.48
    (round 24's grid-true instrument, which stopped charging a phantom walk-back per
    draft and stopped clipping the evening at `sessionMinutes`), and p90 21.5 → 16.19 →
    18.78. The BAND has not moved since it was written and is not moved here; the
    measurement inside it has moved three times, and only the last move was published.
    The median now sits 0.52 min under the 15-minute ceiling rather than 3.4 above the
    floor — the evening is at the long end of its promise, which is a thing to watch and
    is why the number is printed rather than the band widened.*
    The simulation's clock must be calibrated against the **live deck
    mix** (`deckMixAt` derives category and micro/anchor shares from `BASE_DECK` ×
    `categoryWeight` × `RARITY_WEIGHTS` × the room-adapter registry, so sudoku's
    Counting House counts as anchor-weight and a future deck edit breaks the test
    rather than the owner's evening).
  - **4.10c — a great single day flirts with the top, it does not own it.** A sharply
    played day reaches row 5–6 (measured **5** at round-36 HEAD); the **Sanctum landing**
    is reached on **<25%** of even great days (measured **8.7%** at round-42 HEAD, 6.1%
    at round-36 HEAD, against 3.7% before —
    a flat move price makes the top reachable more often on a single sharp evening, and
    the band is where round 24 set it). Standing at that door is a campaign event, not a
    Tuesday.
    **Round 6 correction:** these clauses said "the Sanctum row", and the simulation
    measured row 7 — a row the player never stands on, because row 6 (0-based row 5)
    is the *landing* where the sealed door is, and row 7 is the Sanctum behind it.
    The arc was therefore verified against a storey nobody enters; at the live
    landing the old tables gave 41.5% day-1 reach against a published <8%. The
    milestone row is now `SANCTUM_LANDING_ROW`, tied to `SANCTUM_LANDING_ROW0`, and
    `tests/economy-simulation.test.ts` asserts the identity so the two can never drift
    apart again.
  - **4.10d — a skilled player FIRST STANDS AT THE SANCTUM DOOR on day 11–19**
    (median; **6–10 before round 24 made the instrument grid-true**, 14–22 before round 37
    made the landing three cells — see both blocks above; the LANDING STOREY under it is
    still reached at median day 8–9), **<8% on day 1** (measured 0.5–1.5% — round 37
    tripled it, see the block above), and >65% of campaigns get there by day 21,
    >85% by day 28.
    ***ROUND 36 — THE HEADLINE INVARIANT OF THIS CLAUSE IS DELETED, ON PURPOSE.*** It
    read: *a bare, perfectly efficient ascent must cost more than the entire base day
    budget (`reserveToTop(1) > BASE_DAY_BUDGET`, measured to the landing: 22 > 18, i.e.
    `1+2+3+7+9`), so the top is always bought with refunds.* **That is an altitude-toll
    inequality and it cannot survive a distance economy** (docs/THE_CLIMB §1): an evening
    is a dozen-plus moves and the minimum ascent is five of them, so no honest flat price
    makes the staircase dearer than the day. `BARE_ASCENT_STEPS` is **15** against a
    budget of **22**, and re-typing the constant until the inequality came back would
    have been this project's own recurring failure committed on purpose.
    What replaces it is two things, and neither is arithmetic that agrees with itself by
    construction: (i) the clause that is still TRUE about the walk — a REALISTIC ascent,
    with the walk-backs a climb is actually made of, costs **25.8 against 22**
    (`reserveToTop(1, PROFILE_SKILLED)`); and (ii) the day-1 gate MEASURED on the
    grid-true model, which is an instrument that could disagree — **0.0–0.5% of skilled
    campaigns stand at the door on day 1**, and 4.10a's refund-less player gets there on
    0.03% of evenings. Round 24 had already found the reason and written it down: *"the
    deck's door layouts, not the step table, are what price the top of the house."*
    *Round 7 (verifier) — the old number read 21 in this clause and in `steps.ts`'s own
    file header, stale since round 10 moved `MOVE_COST_BY_ROW[4]` from −6 to −7 and
    updated only one of the three places quoting the sum. The test asserted
    `> BASE_DAY_BUDGET` and `>= BASE_DAY_BUDGET + 2`, both of which stayed true through
    the drift — which is exactly how the round-6 "verified against a storey nobody
    enters" defect survived in the docs. There is now ONE of that number
    (`BARE_ASCENT_STEPS`), quoted by MANOR_DESIGN §4 and gated in
    tests/economy-pressure.test.ts, so a movement retune moves all three at once.*
    **Round 11 correction — the gate is META *and* EARNED, and there are three arcs.**
    This clause used to read "the gate must be **meta, not skill**" and named exactly
    two levers: Bramble's tea and Fern/Key-Cabinet access. Round 10 then made SOLVED
    ROOMS the primary key source, on the owner's directive *"skill, not just
    persistence, earns the campaign"* — measured over 400 campaigns, **1.20 keys/day
    from solves against 0.68 off the green deck**. The shipped design therefore
    contradicted the criterion it was being measured against: the exact shape of the
    round-6 escape, a criterion no critic can pass or fail because the doc and the game
    disagree. **Three arcs** feed the climb: Bramble's tea (the step arc), Fern's dawn
    key and Key-Cabinet access (the padlock arc's drafting side), and the **solve
    channel** (`KEY_SUPPLY.solveKeysByTier` — the storey below a padlock is the storey
    that pays for it). The invariant critics enforce is the one the simulation actually
    holds, and it is unchanged in substance:
    1. **puzzle ability is constant across the campaign** — one `SimProfile`, with
       `attemptRate`/`solveRate`/`perfectRate`/`mistakes*` identical on day 1 and day
       45; only `campaignProfileForDay`'s tea, key-access and familiarity terms move;
    2. **day-1 landing reach stays under 8%** (measured 3.3–6.5% across seeds);
    3. **the early campaign reaches the landing at less than half the late campaign's
       rate** (days 1–3 vs days 15–21), which is the ramp itself, asserted in
       `tests/economy-simulation.test.ts`.
    Skill buys the keys; the meta arcs are what make the keys enough.
    **Round 13 correction — THE MILESTONE WAS THE STOREY, NOT THE DOOR.** Third
    recurrence of the round-6/7/11 escape, and the deepest. `simulateDay`
    returned `reachedSanctum: maxRow >= SANCTUM_LANDING_ROW` — *standing on the
    landing storey*. The gate the live game enforces is `atSanctumDoor`
    (`engine/manor/grid.ts`, consumed by the blueprint, the journal's guess flow
    and the Sanctum screen): the landing cell **and** a north door on the room
    drafted there, matching the Sanctum's sealed south one. Measured over the
    real deck and the rigid rotation, entering the landing from below only
    **27.7%** of tier-3-eligible plans place with a north door, and a real
    3-card `rollCards` offer at (2,5) contains one on **60.8%** of offers — so
    roughly two evenings in five she paid 22+ steps to arrive at an offer that
    *could not* open the door, and every 4.10d/e number retuned across rounds
    6–12 was measured against a storey. `simulateDay` now **drafts the landing
    for real** (`landingDraft`, through the same `rollCards` and the same
    `cardOpensOntoSanctum` the card face draws), `SimDayResult.reachedSanctum`
    **is** `atSanctumDoor`, the storey is reported separately as
    `reachedLanding`, and `tests/economy-simulation.test.ts` pins the identity
    the way it already pins `SANCTUM_LANDING_ROW === SANCTUM_DOOR_CELL.row + 1`.
    Both published bands below were re-tuned against the door and hold
    (measured: skilled first door median 9, 2.0% on day 1, 98% by day 21;
    median player first door median 19, 7.3% never inside 45 days).
    *The model's optimistic assumption — that when an offer contains a plan
    which opens north she takes it — is only honest because the same round made
    it legible: `ui/blueprint/DraftModal.tsx` stamps "Opens onto the Sanctum" on
    exactly those cards, off the same predicate. That UI is load-bearing for
    this number.*
  - **4.10e — the volume is typically won in 12–20 days** of daily play by **the
    skilled player of 4.10d** (median; measured 15–15.5 across the four campaign
    seeds since round 37, p10 13, p90 19 — the band itself is unmoved and is NOT
    re-published, because moving a band that still holds is the same failure as
    holding a band that has moved), **<3% inside the first week** (measured 0%),
    0% on day 1, 100% by day 28. Winning requires **both** gates independently:
    knowing the word (fragments) *and* reaching the door that day.
    **Round 21 correction — 8–16 → 12–20, because THE CONTENT COMMISSION BELOW
    WAS DELIVERED.** The round-19 note that follows closes with *"a four-week
    horizon needs roughly 28 authored pages… it is the open item, not a knob."*
    Volume 1 now authors **28** fragments (10 definition lines, 10 engravings,
    8 testimonies) and the same arithmetic runs the other way: the deduction
    floor is re-derived to **25** (`FRAGMENTS_TO_DEDUCE`, by the identical rule
    — the ten engravings sit at revealOrder 2/5/8/11/14/17/20/22/24/26, the
    chain runs 171755 → 15232 → 6575 → 208 → 146 → 56 → 11 → 5 → 3 → 2 → 1, so
    the LACUNA/LAGUNA tie is in hand at the twenty-fourth page and the
    tie-breaker at the twenty-sixth), and 25 ÷ 1 legible page a night is a
    **twenty-five-evening deduction at the slow end**. Nothing was tuned: the
    routing moved with the pages (the lintel channel stocks **16** of the 28
    and the Study 3, against 7 and 2 before), and §5.1's own success metric
    moved WITH the horizon rather than against it — the median player's
    legible-day share over her first fortnight measures **95.9%** in the
    campaign model (was 80.5%) and **0.896** through the stricter drip harness
    over the real authored content (was 0.648). Measured now: he deduces at day
    14 and wins at 15; she deduces at 18 and wins at 22 (p10 17, p90 29, 89.5%
    inside 28 evenings, 0.4% inside a fortnight). The two profiles are further
    apart than they were, not closer, so skill still buys knowledge. Her band
    moves with his — see the round-21 note on the median-player clause below.
    **Round 19 correction — 14–28 → 8–16, AND THE REASON IS ARITHMETIC, NOT
    TASTE.** The 14–28 band was measured on a campaign whose length was set by
    ACCESS: 15 of volume 1's 17 fragments sat behind violet draws, a
    `rarity: 'rare'` tier-3 room or a character scene, and the Sanctum door was
    a nightly lottery this model put three weeks out. REVIEW_AA §5.1 and §5.2
    deleted both walls deliberately — the spine now routes through ordinary
    word-game solves (7 lintel + 2 study of 17, against 2 before) and the
    speaking tube hears a word from the Entrance Hall on day 1 — and what
    remains is a campaign bounded by KNOWLEDGE. That bound is computable:
    volume 1 authors **17** fragments, the deduction floor is **15** of them
    (`FRAGMENTS_TO_DEDUCE`, re-derived off the reveal order — the six engravings
    sit at revealOrder 2/5/8/11/14/16, so the LACUNA/LAGUNA tie is in hand at
    about the fourteenth page and the tie-breaker at the sixteenth), and
    REVIEW_AA §5.1's own success metric is *at least one legible page a night*.
    15 ÷ 1 = a fifteen-evening deduction, and that is the **slowest** campaign
    the review's target permits. Measured, he reads 1.54 legible pages an
    evening and she 1.12, so they deduce at day 9 and day 15.
    A one-page-a-night cap was simulated: it does push both medians to 16/19 and
    both legible-day shares above 0.97, but it collapses the two profiles onto
    each other (deduction day 16 for both) and makes the mystery a calendar —
    skill stops buying knowledge at all, against the round-10 owner directive
    *"skill, not just persistence, earns the campaign"*. **A four-week horizon
    needs roughly 28 authored pages.** That is a content commission, recorded in
    `engine/volume.ts` beside `PITY_DROUGHT_DAYS` (*"Volume 1 needs more
    authored pages, not a smaller drought"*) and above the skilled block in
    `tests/economy-simulation.test.ts`, and it is the open item — not a knob.
    The clauses that were about SHAPE rather than about the deleted lottery are
    untouched and still measured: both gates required, no first-week walkover,
    no day-1 win, the 10–15 minute evening, and the median player measured
    beside him and slower on every milestone.
    **Round 19, the other half — THE TUBE WAS NEVER WIRED IN.** Round 17 built
    the §5.2 mechanic in the engine (`engine/manor/tube.ts`,
    `SPEAKING_TUBE_CELL`, `atSpeakingTube`, `canAddressSanctum`,
    `sanctumAnsweredFlag`, `doorsHeldOpen`), re-tuned every band in this clause
    against it, and connected it to **no live surface**:
    `app/slices/journal.ts guessAtSanctum` still gated on `atSanctumDoor`,
    `SanctumView` still rendered the mouthpiece only at the door, the journal's
    rail still printed *"the door … only hears a word from someone standing at
    it"* on the very cell the brass hangs in, and `lockViewFor` was passed to
    no caller so `doorsHeldOpen` governed nothing. Every number above described
    a build that did not exist — REVIEW_AA §0's finding, one level down, and the
    exact reason §0.1.7 says to DRIVE the app rather than photograph it. Round 19
    wired all four and proved it in a real tab:
    `tests/tube-day1-live.mjs` says a word down the brass on **day 1**, for
    **zero steps**, gets the Portrait's authored refusal, spends the day's one
    word, and — with the true word — sets `vol.*.answered` while leaving the
    volume OPEN, because the ceremony is still four floors up.
    **Round 12 correction — THIS CLAUSE HAD ONE NUMBER AND TWO PLAYERS.** Every
    campaign target in 4.10 was measured on `PROFILE_SKILLED` alone;
    `PROFILE_DECENT` — the profile whose own docstring calls it "the MEDIAN
    evening, the one 4.10b clocks", i.e. the owner — had played thousands of
    single days in the model and never once played a campaign. Run through the
    same `simulateCampaigns`, she first stood on the Sanctum landing at median
    day 18–21 (10–14% never inside 45 days) and won the volume at median day
    33–34, with **25% of campaigns unfinished after 45 evenings** against the
    ">90% by day 35" printed above. A number verified against a player the game
    is not describing is the round-6 and round-11 escape exactly, and no critic
    could pass or fail this clause for the person it was written for.
    **The two arcs cannot be collapsed** — the median player is modelled as more
    cautious on the stairs (`boldness` 1.3 vs 1.0), less efficient at finding
    frontier doors (`walkbackPerRow` 0.58 vs 0.36) and less inclined to push a
    storey at all (`pushBias` 0.62 vs 0.78), and every lever that pulled her
    median into 14–28 also put the skilled player at the Sanctum door on day 1
    in 17–20% of campaigns, against the <8% of 4.10d that is itself the
    owner-playtest blocker. So **both bands are published and both are
    measured**:
    ***ROUND 28 — THIS BLOCK WAS FIVE NUMBERS OUT OF DATE AND THE TESTS SAID SO.***
    *Round 24 rebuilt the instrument on the real 5×7 grid and moved four bands in
    `tests/economy-simulation.test.ts`; the bands published HERE were left at their
    round-21/23 values, so the doc promised 18–28 where the gate asserts 24–32,
    "measured 100%" where the model measures 89%, and "0% never" where one campaign
    in ten does not finish inside the window. A published band that contradicts the
    enforced one is worse than no band: it is the only number a critic reads. Every
    figure below is re-measured at HEAD over the four campaign seeds the test itself
    runs (`0x1234/0x9911/0x2f2f/0xabc1`, 200 skilled / 250 median-player campaigns
    each, 45-evening window), printed per seed as a range, and set beside the band
    the test enforces. Where a band moved, the move is published with its cause.*
    **AND TWO MILESTONES, NEVER ONE.** `firstLandingDay` is the day she stands on
    the landing — since round 37 that is any of THREE cells, (1,5)/(2,5)/(3,5);
    `firstSanctumReachDay` is the day she stands at a landing that actually opened
    north — the live `atSanctumDoor` gate. The old bullets printed
    one number and called it "first landing" while the test asserted the other, which
    is how a doc drifts eight evenings from its own gate. Both are published now.
    - **the skilled player** (4.10d's): the DOOR — the gate — at median day
      **13–14** across the four seeds (enforced 11–19; 0% never inside 45 evenings),
      the volume won at median **15–15.5** (enforced 12–20), **100% inside 28
      evenings** (enforced >85%), 0% inside the first week, and he stands at the
      door on day 1 in **0.5–1.5%** of campaigns (enforced <8%).
      ***ROUND 50 — HIS ABSOLUTE WINDOW WAS `ceil(measured)` AND HAD ELEVEN SECONDS
      UNDER IT.*** Round 42 published **14–22** off a measured 21.1 and four rounds put
      minutes into the evening without anyone re-reading the line: at round-49 HEAD it
      measures **21.824 against a ceiling of 22 — 0.176 minutes of headroom.** Round 48's
      own rule condemns it (*a band's headroom must exceed the granularity of the lever
      allowed to move it*; the only lever 4.10 permits here is the day's starting count,
      whose smallest step round 44 measured at **1.5 minutes**), and it is the same class
      as the five round 48 found, in a clause round 48 did not reach — it re-derived
      4.10f/g's day-SHARES, not this absolute window. Round 50's re-clock of the Linen
      Closet, the Library and the Study (`ROOM_EFFORT`) adds **0.185 min** and takes it
      red. The band is re-published **14–22 → 14–24**, measured **22.009** = the
      measurement plus one move a day, rounded up to the whole minute. *The re-clock is
      not why the band moved; it is only what made a spent band visible.* The neighbouring
      clause moved with it for the identical reason: *"the median is not the cap either,
      with room to spare"* read `sessionMinutes − 5` (= 23) against 21.824, i.e. 1.18
      minutes of "spare" — under the 1.5 one move buys — and is `sessionMinutes − 4`
      (= 24) now, measured 22.009, 1.99 minutes of it. The CLAIM under both is unchanged:
      his late evening is a fact about the game and not a reading of his appetite clock,
      and the two-sided early-nights share below is what states the clock's real effect
      (12.9%, gated 2–15%, unmoved in kind).
      His evening runs
      **17.1 early → 21.1 late** at round-42 HEAD (14.9–15.0 → 18.3–18.8 before; **17.7 →
      22.0 at round 50**), and
      the band was re-published **14–20 → 14–22** with **the late p90 RETIRED**: it
      measured 28.0 against his own 28-minute appetite, so it was reading the stopping
      rule rather than the game (`CLOCK_BAND`'s own lesson, applied to the quantity it is
      about). What is published in its place is the SHARE OF LATE EVENINGS HE ENDS EARLY
      — **9.7%, from 5.5%** — which is the clock's effect stated directly, is gated
      two-sided at 2–15%, and cannot be clipped by the thing it measures. The EARLY
      window keeps its p90 (24.4, gated ≤27). *(The pre-round-42 figures: p90
      23.1/26.0 against 4.10f's then-band of 14–20 and p90 ≤27.)*
      Also re-published at round 42: his DOOR at median **12–13** (enforced 11–19,
      unmoved) and his WIN at median **14–15** (enforced 12–20, unmoved); day-1 door
      **0.4–2.4%** against the same <8%.
      *ROUND 37 — THE LANDING IS THREE CELLS, AND THIS IS AN ACCESS BAND, SO IT
      MOVED (docs/THE_CLIMB §2).* **His door 16 → 13–14 and his win 16.5–17 →
      15–15.5, band 14–22 → 11–19.** The cause is geometry and nothing else: the
      sealed chamber now fills (1,6)–(3,6) and any of the three cells beneath it
      can open north onto it, so three sealing cards at a landing door is a
      detour rather than checkmate. **His DEDUCTION did not move — 14, before and
      after — and that is the check on the claim**: he reads the volume at exactly
      the same speed, and every evening this round hands back is an evening he
      used to spend waiting on one square. His first LANDING day barely moved
      either (8–10 → 8–9), which is round 24's finding arriving as a number: the
      storey was never the gate.
      **WHAT GOT WORSE, PUBLISHED RATHER THAN ABSORBED: his day-1 door rate
      TRIPLED, 0–0.5% → 0.5–1.5%.** Three ways up on the last hop is three rolls
      at it, and the owner-playtest blocker behind 4.10d is precisely "I reached
      the Forgotten Word on my first day". It is still five times under the
      enforced <8% and an order of magnitude under the 17–20% that clause was
      written against, so it is reported and not acted on — but it is the number
      to watch if the landing is ever widened again.
      *Round 36 — HIS BANDS DID NOT MOVE, and that is the measurement. The
      altitude toll came off (docs/THE_CLIMB §1) and his door slid 17 → 16 and his
      win 18 → 17, inside bands set two rounds ago. What DID move for him is the
      evening's SHAPE: 17.0 → 14.8 early and 18.0 → 18.6 late, i.e. an inflation
      of 1.26 against 1.05. See 4.10f below — with a flat move price the tea arc
      buys rooms, because climbing IS drafting rooms.*
      *(Superseded, kept as lineage: before round 36 this read "landing CELL at
      median day 10–11, DOOR at 17–18, volume won at 18–19, 87.5–91.5% inside 28,
      evening 17.0–17.5 early / 18.0–18.4 late, p90 24.7–24.9".)*
      *The move: "first landing 6–10, 100% by day 28" was a pre-round-24 number
      measured on a scalar row, where arriving on the storey WAS arriving at the
      door. On the real grid the last step is a draft — the landing plan has to draw
      a north door — so the storey is still reached on day 10 and the gate lands
      about eight evenings later. Nothing about the climb got dearer; the instrument
      stopped assuming the door.*
    - **the median player** (`PROFILE_DECENT`, 4.10b's): the DOOR at median day
      **16.5–17** (enforced 14–22; **0.0% never inside 45 evenings**), the word
      deducible at median **17** (enforced 14–24), the volume won at median
      **19** on every one of the four seeds (enforced 16–24), **100% inside 45
      evenings** and **98–100% inside 28** (enforced >95% and >90%), **0.0%
      inside the first week**. Her evening runs **12.7–12.9 minutes early,
      15.4–15.5 late**, p90 17.9/20.0 (4.10f's band for her, 12–18 and p90 ≤22).
      *ROUND 37 — HER TWO ACCESS BANDS MOVED AGAIN, THREE EVENINGS EACH, AND HER
      KNOWLEDGE BAND DID NOT.* **Her door 20 → 16.5–17 (band 17–25 → 14–22) and
      her win 22 → 19 (band 18–26 → 16–24)**, with the never-finished tail
      **0–0.4% → 0.0%** and the inside-28-evenings figure **86–91.6% → 98–100%**.
      Her deduction is unmoved at 17, for the third change running: she reads him
      at the same speed, and what keeps changing is how long the house makes her
      wait to say it. The secondary cause is worth naming because it is not the
      landing itself — `MOVEMENT.sanctumColumnPull` now reads `sanctumColumnDrift`,
      which is zero across all three landing columns, so a climb aimed at the top
      of the house stops paying a preference tax for being one column off centre.
      Her steps in hand entering the first padlocked storey rose **14 → 15** on
      the back of exactly that, and her first LANDING day 10–12 → 10–11.
      **The ratcheted floors are part of the move**: "99–100% inside 45" against
      a floor of >80% had become a gate that could not fail, and the 28-evening
      figure it was hiding is the one that actually moved.
      *ROUND 36 — THESE TWO BANDS MOVED FURTHER THAN ANY OTHER NUMBER IN 4.10,
      AND ONLY HERS DID.* **Her door 23–26 → 20–21 and her win 25–28 → 21–22**,
      with the never-finished tail **8.4–13.6% → 0–1%**, because the altitude toll
      was being paid almost entirely by the player who doubles back. She is
      modelled at `walkbackPerRow` 0.58 against his 0.36, and the old table charged
      −7 and −9 for exactly the storeys she re-walks; a flat −3 hands her back
      about six evenings and hands him one. That asymmetry is the owner's own
      diagnosis — *"the steps economy is driven by needing to double back"* —
      showing up as a measured number. **Her evening band 13–18 → 12–18**: 12.7
      early against 14.0 before and 15.5 late against 14.9, i.e. shorter at the
      start of the campaign and longer at the end of it, both from the same cause
      (see 4.10f). **The campaign got SHORTER for her and did not get longer for
      anyone** — which is the constraint this round was given, and the direction it
      moved in is stated rather than absorbed.
      *The earlier moves, and their causes: her win band 18–28 → 24–32 was round
      24's door geometry (she knows the word at 17 and waits for a landing plan that
      opens north — her DEDUCTION did not move at all). "Inside 10–15 minutes" →
      13–18 was round 24 lifting `sessionMinutes`, which had been clipping the
      evening at 18 and making the old figure true by construction rather than by
      design. And "0% never / measured 100%" was never hers: it was the round-23
      reading of a 45-day window on the pre-grid instrument.*
    *Round 21 — BOTH KNOWLEDGE BANDS MOVED AGAIN, AND THIS TIME THE CONTENT
    MOVED THEM. Her two ACCESS bands are untouched for the third round running:
    the climb did not change, the volume did. Volume 1 authors 28 pages against
    17 and the deduction floor is 25 against 15, so she has a fortnight more of
    him to read — and reads it, at 95.9% of her first fourteen evenings against
    80.5% before. That is the review's §5.1 target and the four-week horizon
    being met by the same change, which is what the commission was for.*
    *Round 19 — WHICH OF HER FOUR BANDS MOVED, AND WHICH DID NOT. Her two ACCESS
    bands (first landing, the day-1/day-2 floor) are untouched: §5.2 did not make
    the climb cheaper, it stopped the climb being the only mouth in the house.
    Her two KNOWLEDGE bands moved, and the size of the move is itself the round-13
    measurement paid back — the gap between her knowing the word and being allowed
    to say it ran median 9 evenings, p90 25, max 47, and the tube returns all of
    it. Her deduction moved only 20 → 14–15, i.e. §5.1's re-route is worth about
    five evenings and §5.2's tube about nine.*
    Both are pinned in `tests/economy-simulation.test.ts`, which now plays
    `PROFILE_DECENT` campaigns beside the skilled ones, asserts her band is
    *slower* than his (if that ever inverts, a profile has stopped describing
    the player it is named for), and re-measures the key-source ratio for her
    too. The gap was also narrowed at source — `TEA_BY_POINTS` lifted at its top
    four rungs, the one lever of four simulated that is strictly progressive and
    that leaves days 1–5 bit-identical (`teaArcPoints` does not reach those rungs
    until day 6, so the owner's "way too easy on day 1" is untouched); the three
    rejected levers and their measured failures are recorded in
    `engine/economy/steps.ts`. The retune narrows the gap; the second measured
    profile is the part that stops this happening again.
    **Round 11 correction — "knowing the word" means LEGIBLE fragments.** Round 10 made
    a violet room file a *sealed* page that narrows nothing until a solve makes it out,
    and gave the word games two fragment channels of their own. Both models still
    encoded the pre-seal rules: `simulateCampaign` added violet rooms *entered* straight
    into the deduction count and modelled no solve channel at all, so 4.10e was verified
    against a knowledge curve the game had stopped having and any retune of the seal
    would have moved the real horizon with every test still green. `SimDayResult` now
    carries `pagesMadeOut` and `sealedBacklog`, computed **in day order** through the
    real `decipherYield`, and only made-out pages count toward `deductionDay`. Measured
    after the fix: deduction median day 13, win median day 16, 0–1% inside week one.
    **Still open (A7's file):** `tests/volume-pacing.test.ts` measures the day fragment
    16 is *filed* and its header still calls that "the last engraving, after which the
    constraint set is a single word" — false for any sealed engraving. It owes the same
    change: thread `SimDayResult.pagesMadeOut`/`sealedBacklog` through its drip and
    measure the day the sixteenth fragment becomes **legible**, keeping the filed day as
    a secondary assertion so the cozy "it is hers immediately" promise stays pinned too.
  - **4.10f — sessions inflate a little, and the ceiling is published.** *(ROUND 24: this
    clause read "sessions never inflate — the median day stays inside 10–15 minutes for
    the whole campaign", and it was held by a CAP rather than by the design.*
    `PROFILE_DECENT.sessionMinutes` *was **18** while 4.10b publishes "p90 ≤ 23", and the
    day loop breaks at* `sessionMinutes`*: past minute 12* `SESSION_WIND_DOWN` *cuts her
    appetite to 0.35, giving a ceiling of 3 × 0.35 × 1.8 × 1.5 = 2.84 work-minutes in
    sight and at most ×1.2 of jitter — so **no evening could exceed ≈21.6 minutes** and
    "p90 ≤ 23" could not come out wrong. Measured over 3000 days: p90 16.2, p99 18.6,
    **max 19.9**. The distribution was clipped and the gate was reading the clip. Round
    15 killed a vacuous gate and added this one one paragraph later.)*
    **THE RULE THIS LEAVES BEHIND: a modelled STOPPING RULE may never sit below a band
    published about the quantity it stops.** `CLOCK_BAND` is that surface, in one place,
    and `tests/economy-pressure.test.ts` gates every profile's clock above it (26 / 28 /
    30 minutes — +8 on each, so the three profiles keep their ordering) and additionally
    requires the measured **p90 to sit at least two minutes clear of the cap**, so a
    clipped distribution cannot wear a passing test.
    With the clip gone the inflation is visible, and it is now the published thing: the
    skilled evening runs **14.8 minutes over his first ten and 18.6 over days 20–30**
    (band 14–20, p90 ≤ 27) and the median player's **12.7 → 15.5** (band 12–18, p90 ≤ 22).
    *(Round 36 re-measurement; round 28 published 17.0–17.5 → 18.0–18.4 and 14.7–14.9 →
    15.7–16.0 over the four campaign seeds, and round 24 the single-seed 16.9 → 18.2 and
    14.5 → 15.6.)*
    ***ROUND 36 — THE SHAPE CLAUSE LOST ITS SUBJECT, AND ITS BOUND IS RE-DERIVED.*** The
    clause was *"the tea arc's extra budget goes into the CLIMB (cheap in minutes), never
    into more puzzles per evening"*, gated at late/early **×1.2**. It rested entirely on
    climbing being expensive in STEPS and cheap in MINUTES — which was true only because
    the top storeys were tolled at −7 and −9. With one flat price (docs/THE_CLIMB §1)
    **climbing IS drafting rooms**: there is no purchase the arc can make that does not
    also add minutes, and the ratio no longer separates the two things it was named for.
    **Measured, and stated as a cost rather than absorbed: his inflation 1.05 → 1.26 and
    hers 1.07 → 1.23.** So the ratio bound is re-derived to **×1.3** — still bounded, so
    it cannot creep unwatched — and the gate that carries the clause's real content is
    the ABSOLUTE window, which did not move: 14–20 for him (his late evening measures
    18.6, so 1.4 minutes of headroom) and 12–18 for her (15.5, 2.5 minutes). **If the
    owner wants the late-campaign evening shorter, the lever is the tea arc
    (`TEA_BY_POINTS`), not the move price.**
    What is GATED is therefore the WINDOW first and the shape second: the late evening
    may not exceed ×1.3 the early one, or the tea arc is buying an evening the owner did
    not ask for. Retirement is now rare
    (0.04–2.1% of evenings) and the evening's honest second ending is the one the grid
    supplies for free — **stranded**, the house shut with steps still in hand.
  - **4.10g — the seal has to BITE** (the owner's *"solving needs to matter"*). Entering
    a violet room files a sealed page; a solve makes `decipherYield(tier)` of them out.
    As shipped in round 10 the mechanic was statistically a rounding error: only **9.5%**
    of median (`PROFILE_DECENT`) evenings contained a violet room at all, sealed supply
    ran 0.45/day against a decipher capacity of 2.6–6/day, and a page survived the night
    on 0.03 page-days per day — nine evenings in ten the player never met a sealed page,
    so the mechanic could not carry the design question it was built for. The published
    targets, all measured in `tests/economy-simulation.test.ts`:
    **a violet room appears on >15% of median evenings** (measured 21.7%) while staying
    a rare room (<50%); **a sealed page survives to the next dawn on 25–50% of a skilled
    player's days** (measured ~37%); **a solve makes a page out on ≥1 day in 3 for a
    skilled player** (measured ~50%) **and on ≥1 day in 5 for the median player**
    (measured ~23%); and the tripwire — **a player who solves nothing makes out nothing**,
    all campaign, however many violet rooms she walks through.
    **Round 12 correction — the made-out clause was unqualified and unmeasured.**
    It was built, like the rest of 4.10g's evidence, from
    `simulateCampaigns(PROFILE_SKILLED, …)`. The overnight clause above says
    "a skilled player's days" and is fine; this one said nothing, and on the
    median player's campaigns it measures 0.23 — false by a third for the exact
    evening 4.10b clocks and the exact mechanic ("solving needs to matter") the
    owner asked for. It is **qualified rather than tuned into range because the
    ceiling is arithmetic, not tuning**: a page can only be made out if she is
    holding one, her overnight backlog median is 0, so her made-out rate is
    pinned to how often she *meets* a violet room — and violet share is a
    function of ROW (`deckMixAt`: ≈2.0% at row 0, ≈10.5% at row 6). She tops out
    around the third landing and meets violet on ~24% of days; the skilled
    player climbs past it and meets it on ~54%. Lifting her to 1-in-3 therefore
    means lifting her violet-met rate past 1 in 3, which collides with this same
    criterion's "still a rare room (<50%)" and with the 4.10b clock calibrated
    on the deck mix. Both rates, the backlog-median-0 premise and the
    violet-met bound are pinned in `tests/economy-simulation.test.ts`, so the
    split is a measured fact a future retune can argue with rather than a
    sentence someone chose.
    **Round 14 — HER OVERNIGHT RATE IS PUBLISHED TOO.** The overnight clause
    above is explicitly scoped to "a skilled player's days" and said **nothing**
    about the median player, so the one clause that answers the owner's
    *"solving needs to matter"* had no row a critic could pass or fail for the
    exact evening 4.10b clocks. Measured over 200 `PROFILE_DECENT` campaigns ×
    45 days: **she meets a violet room on 24.6% of evenings, a solve makes a
    page out on 24.0%, and a page survives to her next dawn on 13.6%**
    (10–20% band across seeds; backlog median 0, p90 1), against his 54.9% /
    51.0% / 37.2%. **A sealed page survives to the MEDIAN player's next dawn on
    10–20% of her days** is the published row, pinned — beside his, and with the
    asymmetry itself asserted — in `tests/volume-pacing.test.ts` (the mystery's
    suite; the seal is the mystery's mechanic). So the mechanic bites in her
    evening roughly once a week.
    **ROUND 22 RE-PUBLISHED BOTH OVERNIGHT ROWS: hers 10–20% → 10–25%
    (measured 19–20%), his 25–50% → 25–55% (measured 52%).** 4.10h gave the day
    model per-room durations, and the consequence is arithmetic: an honest
    evening FINISHES about two rooms, not two and eight tenths (round 22 measured
    1.99 for her, 1.82 for him, against 2.76 / 2.4 under the flat 3–6 minute clock),
    because two of the four anchors cannot be finished in a cozy sitting at all.
    ***ROUND 25 — THIS DRIVER MOVED TWICE AND WAS REPORTED ONCE.*** Re-derived over
    the same fixtures the tests use (250 `PROFILE_DECENT` and 400 `PROFILE_SKILLED`
    campaigns × 45 days, seed `0x1234`), an evening now finishes **2.18 rooms for her
    and 2.38 for him** — 1.99 → 1.77 under round 23's ground-floor retune (unreported),
    then 1.77 → 2.18 under round 24's grid-true instrument (reported only as its
    consequences). **The order has inverted**: for the whole life of this clause she
    finished more rooms per evening than he did, and now he finishes more. That is the
    grid, not the clock — his `pushBias` 0.78 against her 0.62 buys more when the
    frontier is real geometry instead of a scalar row, and her longer walk-back
    (`walkbackPerRow` 0.58 vs 0.36) stopped being a phantom tax on both of them
    equally. The overnight bands above are re-measured on the current figure and are
    unmoved; the sentence "she finishes about two rooms" is still true of both players,
    which is the claim the seal arithmetic actually rests on.
    A page can only be made out by a finished room, so a page waits for tomorrow
    more often. The bands are re-measured rather than tuned back, because tuning
    them back means either a longer evening (4.10b/f) or a shorter Conservatory
    (content — REVIEW_AA §6 asks for the Gallery's `targetCount` and the hive's
    rungs, and round 22 landed the rungs only). The bound that keeps the seal a
    pressure rather than a debt spiral is the BACKLOG, and it did not move: her
    median is still 0 and his ≤ 2.
    **Once a week is a measured fact, not yet an accepted one.** The lever that
    would raise it without touching violet share — *decoupling bite from row*: a
    page still smudged at dusk seeds one guaranteed violet offer on the lower
    floors tomorrow, so the backlog she carries is what puts the next violet room
    in front of her — needs `engine/manor/drafting.ts` + `app/slices/manor.ts`
    (A1) and is filed as a cross-agent request rather than half-built here. The
    two alternatives are both already ruled out above: lifting violet share
    collides with this clause's own `<50%` rarity bound, and lifting her climb
    collides with the 4.10b clock. The supply side is the
    *realised* violet share per row (`deckMixAt`), not the category weight: `6 + row*7`
    read like a ramp while `RARITY_WEIGHTS[1]` scored tier 1's only two mystery cards 9
    and 1, for a realised **0.16%** of ground-floor draws. It is ≈2.0% at row 0 rising
    to ≈10.5% at row 6, strictly increasing, tuned with the sim rather than by feel.
  - **4.10h — TIME FOR REWARD: what a room pays follows what it asks** (REVIEW_AA §6,
    round 22). AAA_BAR carried ~130 criteria and not one of them constrained
    time-for-reward, which is exactly why a **36× wage spread** survived twenty-one
    build rounds, three critic panels and a hostile review that named the defect:
    `STEP_TABLE.solve(size, tier)` had no room parameter, so the Gallery's twenty
    seconds (5 target words of a 106-word pool) and the Counting House's half hour
    (25 givens, 98% of tier-2 boards needing a wing, a fish or colouring) were paid
    off one row-band table, and the correct strategy was to abandon half the deck on
    sight. Both hostile reviewers did.
    The criterion, pinned in `tests/economy-effort.test.ts`:
    (a) every registered room kind carries an instrumented honest duration
    (`engine/economy/effort.ts ROOM_EFFORT`, per kind AND tier) — **a room cannot ship
    unpriced or unclocked**; (b) the payout is `clamp(wage × honest minutes)` and is
    **monotone in the work** — no shorter room may out-earn a longer one at the same
    tier; (c) between the cozy floor (**+1 move** — *a solved room always pays back at
    least the move it cost to walk into*, so a short puzzle is never a bad choice) and
    the STAIRCASE ceiling (**one `BARE_ASCENT_STEPS`, a move leaner every storey: +5 /
    +4 / +3**, so no single room prints an evening and refunds still get leaner as you
    climb) **a minute is worth a minute**; *(ROUND 42 — both were re-derived. The floor
    was +4 steps and the ceiling was ⅔ / ½ / ⅓ of `BASE_DAY_BUDGET`, which is a LOOP:
    every round that moves the purse moves what one room may print, in the same
    direction, so a bigger day is automatically a day one room can buy back. On a
    12-move budget those thirds read 8/6/4 — two thirds of an evening for one
    Conservatory. The ceiling is tied to the climb now and not to the purse.)* (d) the residual spread is a RATCHET — that may fall and may never rise —
    and **round 25 re-derived it unfiltered**, because the second half of this clause
    used to read *"≤ 2× across the rooms an ordinary evening is actually made of
    (measured 1.75×)"* and that population was a filtered sample: `tier ≤ 2 AND
    effortMinutes ≥ 2 AND not the Counting House at tier 2`, which drops **the Gallery,
    the Linen Closet and the Study** — three of the commonest draws — for being short, in
    a metric about how short rooms are paid. Seven of fourteen tier-1/2 pairs survived it.
    Same defect as the retired "79.2% real choice" headline (4.10j), committed in the
    round that was told about that one. All four populations are published and gated now
    (`tests/economy-effort.test.ts`), and none is called "an evening":
    **every room × every tier 45.00× → 20.00× → 16.00× → 9.07× (round 27) → 7.77×
    (round 36) → 4.53× (round 42)**; **every tier-1/2 room, unfiltered 12.00× → 9.60× →
    4.62× → 3.78× → 2.60×**; **tier-1/2 minus the Counting House 4.89× → 3.91× → 3.20× →
    2.40×**; **tier-1/2 of two minutes or more, minus the Counting House, 1.75× → 1.43× →
    1.71× → 1.36×**.
    ***ROUND 50 — THREE ROWS OF `ROOM_EFFORT` HAD NO DERIVATION UNDER THEM AND NOW DO;
    NOT ONE OF THE FOUR SPREADS MOVES, AND THE FOURTH POPULATION GETS BIGGER AT THE SAME
    RATIO.*** Round 46 said the Darkroom was *"the only row in the table with no
    derivation behind it"* — it was the only row with no derivation AND a wrong shape.
    Three more had a plausible shape and no derivation at all: the Library
    (*"16 tiles, 4 groups, 1 ambiguous, 1 herring"*, with no tier in it), the Linen Closet
    (*"4×4, 3 entries, 11 letters — ~75 s"*, written before round 29 gave the room a hem
    and left the clock alone by its own admission) and the Study, which was **flat at 1.5
    minutes across three tiers** whose headwords run a median corpus rank of 25,286 /
    81,158 / **219,760**, fifteen of the forty-three tier-3 words being absent from a
    333,333-word corpus outright. All three are derived in `docs/BENCHMARKS.md` — §2's
    new clock, §10's new clock, and §12, **the Study's teardown, which did not exist**
    (STATUS §7: *"if yours is missing, write it before you build"*; the Study's answer is
    that it has NO NYT twin, said out loud rather than left for a later round to assume).
    Rows: `word-web` **[4.5, 5.25, 6.0]**, `crossword` **[1.25, 1.75, 2.25]**,
    `forgotten-word` **[1.5, 2.25, 3.5]**.
    **All four spreads are unmoved — 4.53× / 2.60× / 2.40× / 1.36× — because every wage
    that moved is interior to every population it is in.** What DOES move is the fourth
    population's MEMBERSHIP, **7 pairs → 8**: `forgotten-word t2` crosses the two-minute
    line the filter is named for and joins at 0.444, between the same two ends
    (`sudoku t1` 0.455 over `cipher t1` 0.333). A population that grew at the same ratio
    is the honest direction — more of the house sits in the band where a minute is worth a
    minute — and it is published here because the gate asserts that membership BY NAME and
    would otherwise let an eight-pair number be read as the seven-pair one.
    **ONE PAYOUT MOVES: a tier-3 Study pays +2 rather than +1** (0.45 × 3.5 = 1.58), the
    first payout `ROOM_EFFORT` has moved since round 27. It is an output of the derivation
    rather than its purpose, and the rounding edge it sits 0.16 minutes above is published
    in the row so a later re-derivation can see what it would be crossing. Two campaign
    bands moved in the same round and NEITHER because of that payout — both were
    `ceil(measured)` ceilings with less headroom than one move a day buys, and both are
    re-derived above (4.10f's skilled window **14–22 → 14–24**, and 4.10b's
    bare-first-evening `< 13` RETIRED in favour of what the welcome pot is measurably
    worth).
    ***ROUND 46 — THE ONE THAT ROSE HAS BEEN PAID BACK, AND THE COMMISSION THAT WAS
    SUPPOSED TO PAY IT IS VOID.*** The fourth population **1.71× → 1.36×**, under the
    1.43× it stood at before round 42 collapsed the unit. **Both ends of that ratio were
    the Darkroom** and the cause was never the unit: `ROOM_EFFORT.cipher` was the only
    row in the effort table with no derivation behind it and no pin under it, and it
    priced a **no-crib** cryptogram at 33% above one that hands over an `A` and three
    high-frequency letters — while `content/generate-cipher.ts` has graded that room on
    crib class since round 4. `docs/BENCHMARKS.md` §11 (written this round; the Darkroom
    is one of the two rooms this repo grades and it had no teardown) derives the row as
    an OPENING plus a CASCADE, and the row is **3.0 / 4.5 / 5.5**. *Not one payout
    moves* — 0.45 × 4.5 and 0.45 × 5.5 both round to the +2 the room already paid — so
    this is a wage correction with no ledger in it, and the other three populations do
    not move because the Darkroom is at neither end of any of them.
    **AND THE COMMISSION ROUND 42 LEFT — *"the wage table needs more DISTINCT values in
    it, which is a fact about how long the rooms are"* — IS FALSE, and
    `tests/economy-effort.test.ts` proves it two ways rather than arguing it.** (i) An
    ORACLE run that forces the widest payout spread this ceiling permits, honesty
    ignored, measures the draft-dominance rate **WORSE**, not better: 41.7% / 41.0% →
    **43.0% / 44.2%**. (ii) It is not even available — the tier-3 ceiling is +3, so
    seven rooms share three integers and ties are forced by pigeonhole at every possible
    row of the table. The dominance ratchet's rise is a fact about the CEILING and the
    UNIT, and the next round to touch it should not spend itself on room lengths.
    *(Also corrected, because it is repeated in three documents and is wrong: **FOUR of
    the seven shipped rooms pay +1 at tier 1**, not five — twistle, forgotten-word,
    cipher and crossword. The Word Web pays +2.)*
    ***ROUND 42 — THREE FELL HARD AND ONE ROSE, AND THE ONE THAT ROSE IS THE FINDING.***
    The economy is denominated in MOVES now (docs/THE_CLIMB §1b) and the ceiling in
    clause (c) came off the budget and onto the staircase, which is three tiers tighter —
    so every payout in the shipped game is one of {1, 2, 3, 4, 5} and the two long rooms
    come down onto a table whose whole range is five integers. **But the fourth
    population went 1.43× → 1.71×, and this ratchet is supposed to be one-way.** The
    cause is the UNIT rather than the pricing, and it is the honest floor a coarse unit
    puts under this metric: the Darkroom is 3.0 minutes at tier 1 and 3.5 at tier 2 — a
    17% difference in length that rounds to 1 move and 2 moves, a 100% difference in pay.
    No wage can fix it (0.50 moves a minute makes the same population 1.87×); the way to
    pay it back is CONTENT — lengthen the Darkroom's tier 1 or shorten its tier 2 — and
    that is a commission for a word-game round, recorded here rather than absorbed. The
    ends, at HEAD: overall `twistle t1 / crossword t1 0.800 · sudoku t3 0.176`.
    ***ROUND 36 — ALL FOUR FELL, AND NOT ONE OF THEM WAS AIMED AT.*** The step economy
    flattened (docs/THE_CLIMB §1) and `BASE_DAY_BUDGET` moved 18 → 22 with it, which is
    the same lever; the ceiling in clause (c) is DEFINED as thirds of a day, so it rose
    12/9/6 → 15/11/7 on its own. What that ceiling was clipping was exactly the two rooms
    round 22 found underpaid — the Conservatory and the Counting House at tier 1 both went
    +12 → +15, sudoku t2 +9 → +11, and the Word Web's tier 3 stopped being clipped at all
    (+6 → +7). Every column moved DOWN, which is the only direction this ratchet allows,
    and it moved because a derived ceiling followed its definition rather than because
    anybody re-typed a figure. The ends, at HEAD: overall `twistle t1 3.200 / sudoku t3
    0.412`; tier-1/2 `twistle t1 3.200 / sudoku t2 0.846`.
    ***ROUND 18 — THE FIRST TWO COLUMNS WERE STALE, AND THEY WENT STALE IN THE ROUND
    WHOSE SUBJECT WAS DOC DRIFT.*** This clause published `45.00× → 20.00× → 16.00×` and
    `12.00× → 9.60×` as the current figures; measured off the shipped tables
    (`ROOM_EFFORT` × `solvePayout`, the same arithmetic `tests/economy-effort.test.ts`
    runs) they are **9.07×** and **4.62×**. The cause is named because it is the same
    one twice: round 27 re-clocked the Counting House, which was one whole END of both
    populations — sudoku t3 went +6 for 30 min (0.200 steps a minute) to +6 for 17 min
    (0.353), and sudoku t2 went +9 for 27.0 (0.333) to +9 for 13.0 (0.692) — and it
    updated the ASSERTIONS (which read ≤10.0 and ≤5 at HEAD, and are green) without
    updating the prose beside them. Both ends of both numbers, at HEAD:
    overall `crossword t1 3.200 / sudoku t3 0.353`; tier-1/2 `crossword t1 3.200 /
    sudoku t2 0.692`. The RATCHET is unmoved and unloosened — every column still only
    falls — and the two figures are now smaller than the ones this file was claiming,
    so the drift was in the pessimistic direction and cost nothing but the truth.
    The Counting House at tier 2 was one whole end of the band and a
    CONTENT commission REVIEW_AA §6 asked for; **round 27 landed it** (the boards are
    graded per tier and the room keeps an open ledger), which is why taking that room
    out no longer narrows the tier-1/2 spread at all — 3.91× against 4.62×, the two
    numbers now within 1.0 of each other, asserted as such;
    *Round 26 — THE GALLERY'S END OF THE RATCHET LANDED.* The first three fell because
    the Gallery was one whole END of each of them, at 4.000 steps a minute; it now pays
    3.200 and ties the Linen Closet at the top rather than owning it, and both are there
    because of the cozy floor rather than a mispriced room. The fourth did NOT move, and
    that is the interesting one: its population is `effortMinutes ≥ 2`, and the Gallery
    went 1.0 → 1.25 minutes, so it is still outside. **The room became a puzzle without
    becoming long** — its ask over its own board went 0.047 → 0.217 and the cheapest set
    of words that clears it moved from frequency rank 305 to 2,581, by shrinking the
    board (a median 106 findable words to 23) rather than by asking for more of them;
    (e) a room longer than a sitting **pays its ladder, not only its
    summit** (`stageSteps`, off the progress markers the adapters already emit: the
    Conservatory pays at Blossom / Bower / Garden, the Counting House per nine
    placements, the Library per thread), out of the SAME total, so a solved room's price
    is unchanged and 4.10a–g's daily arithmetic does not move; and (f) the durations
    are pinned to the CONTENT FACTS they were measured from (target counts, pool sizes,
    given counts, the hive's own 70% gate), so a content edit that changes a room's
    workload fails a test instead of quietly re-opening the gap.
    What still misses, named so nobody has to rediscover it: **the top of the wage table
    is now the COZY FLOOR itself** — the Gallery and the Linen Closet, the two shortest
    rooms in the house, both paid +4 over 1.25 minutes — and the bottom is still the
    tier-3 Counting House, at **0.412** steps a minute (0.353 before round 36 lifted the
    ceiling with the day budget; the bottom of the table rose, which is why all four
    spreads fell). The test names all three, so
    lengthening any of them FAILS 4.10h and forces the bound to tighten.
    *Round 18 corrected the second half of that sentence too: it read "the tier-2/3
    Counting House, which should bank partial grids across days", and round 27 BANKED
    THEM — the room keeps an open ledger (`engine/rooms/room-bank.ts`) and its boards
    are graded per tier. Tier 2 is no longer at the bottom or anywhere near it (0.692,
    inside the band rather than an end of it), which is the whole reason the third
    population above stopped narrowing when you take that room out.*
    *Round 26 also retired a pin that would have stayed green through its own fix.* It
    read `effortMinutes('twistle', 1) < 2` under the message "the Gallery became a
    puzzle" — a MINUTES assertion standing in for a PUZZLE-QUALITY claim. The Gallery
    became a puzzle and gained fifteen seconds, so the pin would have gone on passing and
    these bounds would never have been retightened by the thing they were waiting for.
    The content facts are gated where they can be seen now, in
    `tests/puzzles/twistle-boards.test.ts`.
  - **4.10j — THE DRAFT IS A DECISION, MEASURED AS THE DOMINANCE RATE** (REVIEW_AA §5.7,
    round 24). The number this replaces was published as *"79.2% of offers have a real
    choice"* and is defined in `scripts/draft-shape.ts` as
    `(liveHist[2]+liveHist[3])/offerCount`, where "live" means only `!sealsItself(...)`.
    That is *the share of offers holding two or more cards that do not instantly wall you
    in* — how rarely the deck hands you a cul-de-sac — printed under a name that claims
    something else. **It never once asked whether the three cards DIFFER.** Three
    identical corridors score 3 live and count as a real choice. Same failure as the
    "1.75× wage spread" computed on a filtered subset, and the same standing rule retires
    it.
    **THE DOMINANCE RATE** is the share of offers containing a card that weakly dominates
    on BOTH axes the card face actually prints (`ui/blueprint/DraftModal.tsx`):
    **FRONTIER** — the post-rotation doors into empty cells, off the same `resolveDoors`
    the placement uses — and **STEPS** — what the room can pay, off the same
    `solvePayout` / `UTILITY_EFFECTS` the ledger pays out of. An offer holding such a
    card has its answer written on it; `1 − dominance` is the share where she must
    actually give something up.
    **The target is DERIVED, not asserted: <40%.** With three cards and two finely-spread
    unrelated axes, the same card is top of both exactly **1/3** of the time — so 1/3 is
    the floor a deck with no correlation between geometry and payout reaches, and 0.40 is
    that floor plus an allowance for honest ties. (The economy critic proposed <40%
    independently; this is why it is the number rather than an opinion.)
    **Measured at round 24's HEAD: 67.0%** through the diagnostic walker and
    **66.4–66.8%** on the evenings `simulateDays` really plays — against a **permutation
    null of 68.7%** (each offer's frontier vector paired with a different offer's step
    vector). So the deck is *not* pairing the two axes; the rate is what three coarse,
    tie-heavy axes produce on their own, and the way down is **finer spread** rather than
    de-correlation: frontier spread is zero on **31.3%** of offers and all three cards
    are one category on **19.9%**.
    `tests/draft-dominance.test.ts` gates the **RATCHET** — which fails on any
    deck edit that makes offers more dominated — and pins the target as the destination
    the next round walks it down to. Same shape as 4.10h's and 4.10i's ratchets, for the
    same reason.
    **ROUND 36 REACHED IT** (ratchet 0.70 → 0.41): 34.9% on the walker, 37.4–39.0% on the
    day model, against a null that fell to 49.5%.
    **ROUND 40 — THE OFFER MIX, AND WHAT IT COST TO PUT IT BACK.** Round 36 bought part of
    that fall out of a purse that was not its own. Its spread rule renormalised over the
    NON-mystery pool, so it held violet's share fixed and paid for plan variety with
    whichever ordinary category held the wide plans — and in this deck that is the
    parlors. Measured on the same walker, same door, same manor, same stream, rules on
    against rules off: **cards OFFERED went puzzle 58.90% → 55.26% and parlor 11.21% →
    14.38%**, unreported, in the direction the owner's standing steer says the game
    already leans too far. It also made `deckMixAt`'s own docstring false — *"probability
    that a card drawn for a door is of each kind"* — and the 4.10b clock, the fragment
    drip and volume pacing are all derived from it.
    The mix is restored by construction (`drafting.ts categoryNeutral`: every category is
    renormalised against itself, so no rule can move weight between categories) and gated
    two ways in `tests/drafting.test.ts` — the normaliser is proved against the same
    weights without it, and the dealt offer is held against the rules-silent draw storey
    by storey. **THE TWO GENUINELY TRADE**, so here is the frontier rather than a quiet
    pick: with the mix pinned, the spread rule loses its cheapest source of variety, and
    holding dominance took `PLAN_SPREAD_SUPPRESSION` 0.10 → 0.03 plus a second axis
    (RULE C, on what the room pays — the other thing the card face prints). Every band
    that moved, with its cause:

    | | round 36 | round 40 | why |
    |---|---|---|---|
    | offer's puzzle share | 55.26% | **59.05%** | the mix is `categoryWeight`'s again |
    | offer's parlor share | 14.38% | **11.16%** | ditto |
    | dominance (walker) | 34.9% | **34.6%** | RULE C replaces what RULE B lost |
    | dominance (day model) | 37.4–39.0% | **37.9–40.1%** | its offers carry the live anti-repeat list, so a rule that may not leave a category has least room there — 0.88pp under the ratchet at the worst of eight runs |
    | frontier spread zero | 5.6% | **7.7%** | RULE C sometimes buys the decision on the wage axis instead; bound held at ≤8% |
    | three of one category | 15.5% | **19.5%** | ARITHMETIC, not a regression — it goes as the cube of the commonest category's share. The gate is re-derived against the offer's own independence null, because an absolute bound here condemned the deck for being puzzle-heavy |
    | landing's bare N-opening offer | 71.2% | **74.3%** | a firmer spread surfaces the wide (north-opening) shapes harder |
    | a blind player's live seal rate | 35.89% | **34.61%** | fewer reaches out of the puzzle category land on a parlor's dead end. The DECK-alone column is bit-identical |
    | `keyLuck` (fern 0 → 3) | 21.5% → 53.4% | **18.6% → 44.6%** | `measuredKeyRate` was rolling a heading-free draw the game never makes; whether an offer holds a key differs on 8.91% of draws. Every 4.10 padlock band held at the corrected supply |

    **The deck was not touched.** `BASE_DECK`'s dead-end share (20.69%) and mean ways-on
    (1.052) are bit-identical, which is what keeps 4.10a's no-refund day, 4.10i's
    stranding and the campaign bands where they were — and it is why the deck-alone seal
    rates above did not move a digit.
  - **4.10i — THE GROUND FLOOR IS A RESOURCE, NOT A FORMALITY** (REVIEW_AA §5.10, round
    23). *"If a resource is never scarce it is not a resource."* Nothing in 4.10a–h
    constrained the storeys the median player spends 62% of her evening on, and measured
    over 300 campaigns × 45 days the tier-1 band (0-based rows 0–2) was a formality: her
    purse while walking it ran a **median 28 steps (skilled 30) against the then-18-step
    budget**, p10 20 / 26; **net −0.84 / −0.36 steps per room entered** — a wash, not a
    cost; **0.2% / 0.0%** of evenings ever contained a moment down there with fewer than
    four steps in hand; and she arrived at the first PADLOCKED storey holding 15 / 21,
    i.e. the skilled player reached the gate *richer than she started the day*.
    Two causes, and both are now gated by `tests/economy-pressure.test.ts`:
    (a) **the band charged one step a room against a solve worth up to twelve.** It is
    one price now, −2 across rows 0–2, which drops the solve:walk ratio from 12:1 to
    6:1. The payout half is deliberately untouched — cutting it would re-open 4.10h's
    36× wage spread, which is a worse trade — and the **bare ascent is still 22**, so
    the headline invariant and every band calibrated on it are unmoved by this half.
    (b) **the campaign arc was landing on the floor.** `TEA_BY_POINTS` climbs 0 → +13
    and all of it arrived at dawn, so the ground floor got a third richer every fortnight
    while never getting dearer. `TEA_POUR` pours a **cup at the door** (`dawnCup`, the
    same size as `FIRST_MORNING_POT`) and leaves **the rest of the pot on the second
    landing** — 0-based row 3, the first storey above the band and the last below a
    padlock, 6 steps' walk out of a 22-step purse. Same total, same arc, so a warmer
    Bramble is worth exactly what she always was *over an evening*; what she is no
    longer worth is anything extra on the ground floor. **The invariant: the dawn purse
    is 22 on day 1 and 22 on day 30.** Day 1 cannot move at all — `teaBonus(0)` is 0, so
    there is no pot to split — which is what protects 4.10d's "<8% on day 1" by
    construction rather than by tuning.
    Measured after: purse **28 → 18** (median player) and **30 → 20** (skilled), net per
    ground-floor room **−0.84 → −2.58** and **−0.36 → −0.96**, in hand at the first
    padlock **15 → 12** and **21 → 18**, evenings with a sub-four moment down there
    **0.2% → 6.0%**. The costs, published rather than buried: her first landing moved
    day **16–18 → 19** and her volume win **21–22 → 23**, both still inside the bands
    below; the skilled player's landing **8 → 9–10** and win **15 → 16**, likewise.
    *The bounds in `tests/economy-pressure.test.ts` are a RATCHET, like 4.10h's: they
    may be tightened and may not be loosened without a finding to point at.*
  - **THE DAY MODEL HAS TWO ENDINGS** (round 23). REVIEW_AA §8's third gate is *"no day
    ending with more than ~20% of the budget unspent"*, and `metrics:review` printed
    `0.0% / 0.0%` as a pass — **by construction**: `simulateDay`'s only exit was an
    empty ledger, so 100.0% of days ended at exactly 0. A gate whose answer is fixed by
    the loop condition is worse than no gate, and this list has named that failure mode
    twice already. `SimProfile.sessionMinutes` is the live game's other ending ("An
    early night, well chosen", `NIGHT_LINES`) as a rule: appetite, not affordability,
    because `openDraft` refuses only below one step and its own comment says *"even if
    it was her last step, the offer still opens"* — an affordability retirement would
    have modelled a game we do not ship. Reported now as the SHARE of each ending beside
    the number (measured: **spent out 94.5% · early night 5.5%**, and the early nights
    keep back a median 55.6%), which is a measurement where the bare 0.0% was not.
  - **Levers, in the order they were pulled** (all in `engine/economy/steps.ts`, the one
    tunable file): flat movement pricing (`MOVE_COST_BY_ROW`, **−3 on every storey since
    round 36** — *walking is the expense*; it was −2 on the ground floor rising to −9 up
    top, and docs/THE_CLIMB §1 is the owner's ruling against that); leaner-as-you-climb
    refunds (the ceiling `SOLVE_WAGE.capByTier`, ⅔/½/⅓ of a day — a tier-3 solve no
    longer funds the storey that reached it); a lean base budget (**22**, moved from 18
    with the move price because the two are one lever); locked upper-row doors (`DOOR_LOCKS`, **rows 4–5 carry the gate at
    0.9 / 0.95, and a padlock costs 2 keys** since round 10 — so the live ascent crosses
    **≈1.85 padlocks ≈ 3.7 keys**, bought mostly with solves. Row 6 is the sealed Sanctum
    and is never drafted, so both the older published "≈1.7 padlocks per ascent" and the
    1-key door it assumed described an ascent the drafter never makes; keys reset nightly
    so every ascent re-earns its way up); and scarce refills (green-room refills
    +2..+6, compounding hooks +1..+2, tea 0 → **+13** across the friendship —
    lifted from +11 at its top four rungs in round 12, the one lever of four
    simulated that closed most of the median player's 4.10e gap without moving a
    single one of the skilled player's published numbers and without touching
    days 1–5 at all; the three rejected levers are recorded in `steps.ts`).
    **Round 13 — THE SIXTH LEVER, AND THE FIRST ONE THAT IS STILL MOVING AT DAY 30.**
    Every lever above caps early: tea at day 12, Fern's dawn key at day 9, both
    `CAMPAIGN_ARC` familiarity terms by day ~9. Measured through
    `campaignProfileForDay`, the median player's evening was therefore statistically
    identical from day 13 to day 60 — P(she stands at the top) flat at 7–8%, i.e. the
    game's answer to a player who keeps stopping a storey short was "roll again,
    nightly, with the same dice, indefinitely". `SANCTUM_ARC` is the sixth lever and
    it is deliberately the slowest: **every evening she spends on the top storeys
    (`surveyRow0`, the storey below the landing) is a plan of that storey the
    floorplan cabinet keeps**, and plans that open onto the Sanctum surface more often
    up there as it warms (`planEveningsToFull` 30, `maxPlanWeightGain` 6 — raising the
    landing offer rate from ~0.63 bare toward ~0.96). It is EARNED (the counter moves
    only on an evening she paid the climb), STRICTLY PROGRESSIVE, exactly 0 until her
    first ascent — so 4.10d's "<8% on day 1" is protected by construction, not by
    tuning — and it is a WEIGHT, so the landing draft stays a decision (4.6). It reads
    `chronicles.dayRecords[].highestRow`, which the save already keeps, so there is no
    schema change. Measured across four seeds: the median player's door rate rises
    10–24% between the day-11–20 window and the day-26–45 one, while the CLIMB rate
    stays flat — which is the design, not a shortfall. The climb is the
    constant-difficulty push-your-luck 4.10c caps at "<25% of even great days"; what
    grows is the house's willingness to show its own door. Asserted as a
    strictly-increasing gate in `tests/economy-simulation.test.ts` ("does not flatten
    after day 12"), so an arc that flattens has to fail somewhere.
    **Round 6 correction:** this clause read "snack +3..+7", which described a
    distribution the deck cannot produce — refills are fixed authored numbers
    on the green cards (Kitchen +6, Larder +5, Boot Room +3, Still Room +2),
    and the Still Room sat *below* the declared floor while nothing paid 7 at
    all. `STEP_TABLE.snack` now declares the deck's real extremes and
    `tests/steps.test.ts` holds it to them; the simulation samples the shipped
    payouts rather than a uniform roll. Felt difficulty is unchanged — no card
    payout moved.
- 4.11 At least two rooms/services implement *compounding* refunds (BP's Nursery
  pattern: "+N per future X") and at least one cross-day investment exists (Fern's
  seeds; a tea variant). **Round 5: satisfied** — `CARRY_OVER_EFFECTS`
  (engine/manor/deck.ts) banks the Larder's +2 steps and the Still Room's +1 key
  into the following dawn, read off the audited event spine with no save-schema
  change.
- 4.12 0 steps triggers a dusk fade ≤4s with walk-but-no-interact grace. Hitting 0
  mid-puzzle lets the puzzle finish; dusk fires on exit. String-table lint: zero
  occurrences of fail/lose/death/damage/defeat in shipped copy. **[COZY]**
  **ROUND 39 — THE WINDOW RE-EXAMINED, AND THE NUMBERS THAT MOVED.** The owner
  played it: *"the fade that occurs when you run out of steps feels disjointed…
  it should feel really cozy like you're slipping off to peaceful slumber."*
  The bar was asked what it is actually protecting before anything was retimed,
  because "the fade wants to be slower" is exactly the shape of argument that
  quietly extends a ceiling. **It bounds how long the house is UNRESPONSIVE, and
  the house is not unresponsive**: `moveTo` answers through the whole of dusk
  (`duskGrace`, slices/day.ts), the veil is `pointer-events: none` so the
  blueprint underneath stays live, and `.chr-dusk__skip` is on the glass from
  the first frame. So the fade is taken **TO** the window and not past it —
  **3200ms → 4000ms** — and the held breath after it comes **down**, 1000ms →
  700ms (`DUSK_HELD_MS`), which is the part she is waiting through rather than
  the part she is watching. Dusk to night: **4000ms → 4700ms** measured end to
  end. Three shape changes went with it and they are the reason it reads
  differently at all: the curve is decelerating (`--ease-doze`: 12% dark at half
  a second, 82% at two, then eighteen hundred milliseconds for the last fifth)
  where it used to be `ease-in`, which is 29% of the way dark at half its time
  and reads as a switch being thrown; the veil animates **one** property, so
  perceived darkness is no longer the PRODUCT of an opacity ramp and a
  background-color ramp; and the vignette CLOSES inward around the candle, which
  lands at 2000ms and then holds for two full seconds instead of finishing
  200ms before the dark and being swallowed as it arrives. `gate:glass` now owns
  every one of those numbers on the real veil (`judgeDusk`), including asking
  the curve where it has got to at half its time.
  **ROUND 53 — THE VERDICT WAS A SCREENSHOT OF AN INTENTION, AND TWO DEFECTS
  WERE LIVING BEHIND IT.** Round 39's `judgeDusk` read the DURATION, the EASING
  NAME and the KEYFRAME PROPERTY COUNT off the stylesheet and evaluated the
  cubic. Every one of those is a declaration. The fade itself was right — a live
  verifier sampled the running opacity and confirmed it — but the gate would not
  have noticed if it stopped being right, and it did not notice either of these:
  - **A MOMENT'S PAYOUT CARD PAINTED OVER THE VEIL, UNDIMMED.** `.chr-notices`
    was on rung **60** against the veil's **55**, so a cream card ("A ROOM WITH
    ONE DOOR · Nothing has been through here in years, and now nothing will.
    +1 gem") sat dead centre over the candle **at full brightness** while
    everything behind it went dark. Measured at 375×667 by driving a real day to
    a real dusk: `[0, 220, 375, 161]`, z-index 60, two cards. It is not a rare
    alignment — the rail's dwell is 3400ms of a 4000ms fade and dusk falls out of
    the last step, which is very often the step that drafted the room the notice
    is about. **The rungs are swapped: notice 55, veil 60** (`ui/chrome/layers.ts`).
    Dusk falls over the whole house, which is the argument already written there
    for the bar. Nothing about what may be TAPPED changed — both layers are
    `pointer-events: none`. The moment SEAL is still above the veil and is not
    the same case: it defers through `ceremonyGate`, which `DuskVeil` holds, so
    the grant waits for tomorrow's blueprint instead of expiring behind the dark.
  - **REDUCED MOTION LOST ITS DUSK: full opacity by 220ms, the screen gone by
    906ms.** `chrDuskStill 200ms` was written from AAA U.3 — *the state still
    arrives, it just does not travel* — and applied to the one property in the
    transition that does not travel. **A cross-fade is not movement.** What
    travelled was the vignette's `scale(1.7 → 1)` and the line's 6px rise, and
    both were already removed; the veil now runs the same `chrDuskFall` on the
    same `--chr-dusk-ms` as everybody else. **The band that moved, with its
    reason:** `DUSK.reducedCeilingMs` (≤400ms, i.e. it *required* the defect) is
    **RETIRED, not widened**, and replaced by `reducedShareOfFade` — the reduced
    dusk must keep **≥75%** of the dusk everybody else gets, photographed by the
    same instrument, plus a keyframe check that nothing in it animates a
    transform. The fix photographs **98%** of it; the cut photographs **6%** —
    the 906ms above was opacity sampled until the whole choreography landed, and
    measured as DARKNESS the defect was worse than the finding said.
  **AND THE SHAPE IS PHOTOGRAPHED NOW.** The dusk's own animations are paused and
  their `currentTime` driven to an ABSOLUTE grid (0…6000ms — a grid derived from
  nothing in the stylesheet, so it cannot agree with it by construction), the
  glass is screenshotted at each stop, and the mean luminance of the frame is the
  darkness. What that buys, and none of it was reachable from a declaration: the
  fade's LENGTH as the eye sees it (the last 2% of a decelerating fade is
  invisible, so the paint settles at ~3.3s of a 4.0s clock), an answer at half
  time that is a photograph (**0.68**, against the **0.82** the declared cubic
  evaluates to — luminance is not linear in alpha, and both are printed every
  run; on `ease-in` the two nearly agree, 0.30 against 0.32, because it is the
  long decelerating tail they disagree about and that tail is the whole of round
  39), how much light the veil actually takes away (`minDarkeningL`: a drop of
  **171** of a parchment 222, so the same curve run to a haze is caught), and the
  undimmed-region check above. **Both ends of every new band are photographs:**
  undimmed **0.00%** shipped against a 0.5% ceiling and **7.12%** with the defect
  re-injected; the reduced dusk **3236ms of 3287ms (98%)** against a 75% floor
  and **195ms (6%)** with the cut put back. **What is
  still read off the stylesheet, deliberately:** the ≤4s grace itself, because it
  bounds when the NIGHT MAY TURN OVER, which is a fact about the clock; and the
  candle's lead and the line's landing, which are two declared times against a
  third. `--prove` carries a photograph of each new defect.
- 4.13 Abandoning a puzzle costs nothing beyond steps already spent, is always offered,
  and is copy-framed as "leaving it for tomorrow," not quitting. **[COZY]**

### Mystery pacing (fixing BP's late-game collapse)
- 4.14 Every clue-fragment class reachable via ≥2 distinct source types (violet rooms,
  character testimony, letters); pity system guarantees ≥1 new fragment within any 3
  consecutive days of normal play (simulation over seeded volumes). **[BEAT]**
  **Round 13 — THE MERCY NOW COVERS THE OTHER GATE TOO.** This clause floored the
  KNOWLEDGE gate (`PITY_DROUGHT_DAYS`, synthesized letters that never exhaust) and
  the ACCESS gate had no floor of any kind — while measured over 400
  `PROFILE_DECENT` campaigns, **every** unfinished campaign (30/30) belonged to a
  player who already knew the word, with median 9 evenings, p75 16, p90 25 and max
  47 between knowing and being let in. `SANCTUM_ARC` (engine/economy/steps.ts) adds
  the access side: once she holds `mercyFragments` **legible** pages (sealed smudges
  arm nothing, same rule as `legibleDroughtDays`) *and* has already climbed to the
  top storeys and been turned away, the landing offer's guaranteed-free slot is drawn
  from plans that open onto the Sanctum. Both halves are required, so it cannot touch
  4.10d's day-1 reach (neither term can be non-zero on day 1) and it is never a
  shortcut through the mystery — 4.18 is untouched. Measured after: the median
  player's knowing→winning gap is median 7, p90 17, and her never-finished share
  falls from 15.3% to 7.3%. Pinned in `tests/economy-simulation.test.ts`.
- 4.15 Journal: any document ever seen is re-readable in ≤2 taps from anywhere;
  fragments auto-grouped; zero information exists only in a transient scene. **[BEAT]**
- 4.16 Insufficient-info signaling: attempting the Sanctum with < X fragments gets an
  explicit sympathetic nudge, never silence; false leads are impossible to chase for
  more than one room without a character wrongness signal. **[BEAT]**
  **Round 13 — THE REFUSAL AT THE TOP WAS NOT SILENT, IT WAS WRONG.** The clause
  above is about the KNOWLEDGE gate; the ACCESS gate answered worse than silence.
  Driven at 390×844, standing at (2,5) in a room with doors S+E: `.bp-sanctumhit`
  was **absent** — the Sanctum untappable, with nothing drawn to say why — while
  `/sanctum` and the journal both printed "…only from the landing at the top of the
  stairs — you will have to climb to it", on the exact landing she had just paid
  22+ steps to reach. Nothing in the game — copy, blueprint, or card face — had
  ever stated that the landing ROOM must open north, and the decision point was
  unarmed: `DraftModal` named door *directions* and carried no Sanctum stamp, and
  `sealsItself` shipped with zero UI callers. Fixed in three places, all pinned by
  `tests/grid.test.ts`: `sanctumStanding` (engine/manor/grid.ts) makes the standing
  three-valued — `at-door` / `landing-sealed` / `away` — exported once so no surface
  can invent a fourth answer; the blueprint keeps the Sanctum **tappable** on a
  sealed landing and refuses in words through the same channel a keyless padlock
  uses ("This room turns its back on the Sanctum", plus a live-region restatement
  naming the remedy and "Nothing was spent"), and draws the blank north wall as the
  bricked seam it is; and every card in a landing offer is stamped **"Opens onto the
  Sanctum" / "Turns its back on the Sanctum"** off the same `resolveDoors` the
  diagram beside it already draws. *The last of those is load-bearing for 4.10d/e:
  the simulation's landing model assumes she takes the plan that opens north, which
  is only honest because the card now says which one that is.*
  **Round 14 — X IS NAMED, AND IT WAS TWO DIFFERENT NUMBERS.** "X" was
  `THIN_FILE_THRESHOLD` = 4 *legible* fragments in `engine/journal.ts`, and the
  Portrait's authored `portrait.gate.*` lines covered ≤0 and 1–3 only, while
  `KNOWLEDGE.fragmentsToDeduce` — the count at which the constraint set actually
  admits one word, and `tests/volume-solvability.test.ts` proves five of the six
  engravings still leave TWO candidates — is [13, 17]. So from four readable pages
  to about thirteen (measured median day 5 → median day 20 for `PROFILE_DECENT`:
  the majority of the volume) she stood at the door, spent her one word a day and
  got exactly the silence this clause forbids. Two numbers for one concept, and
  neither doc named the other — §0.5's unfalsifiable shape.
  **X is now the deduction floor**, one constant on the mystery's side
  (`engine/volume.FRAGMENTS_TO_DEDUCE`, read by `engine/journal.DEDUCTION_FLOOR`),
  the authored bands **tile 0 → X with no gap and no overlap** (empty · thin ·
  4–8 · 9–12), and `SanctumView` retires the nudge on `readiness.deducible`, never
  on the thin-file edge. `tests/journal.test.ts` pins the JSON bands, the constant
  and A2's `KNOWLEDGE.fragmentsToDeduce` to each other; `tests/dialogue-content.test.ts`
  re-proves it through the live `selectTaggedLine` path the screen actually calls.
- 4.17 Wrong Sanctum guess: consumes only the daily guess, plays a sympathetic Portrait
  reaction (variant-keyed to closeness: shared letters / right length / repeat guess),
  and journals the guess so she can see her own elimination history. **[COZY]**
- 4.18 Volume solvable-in-principle from day 1 (answer fixed at volume start; no
  fragment mechanically required). **This criterion owns solvable-in-principle
  ONLY.** The solve horizon belongs to 4.10e (12–20 days median for the skilled
  player since round 21, 24–32 for the median player since round 24 — *this line
  said 18–28 until round 28, which was her pre-grid band and is now four evenings
  under the one the tests enforce* — <3% inside week one) — the pre-overhaul "median playtest solve lands in 2–4 evenings"
  clause was deleted in round 6: it contradicted 4.10e outright, so no critic
  could pass or fail the mystery's pacing and the economy and mystery owners
  were optimising against opposite targets. The shipped fragment drip is built
  for 4.10e and is now measured against it by
  `tests/volume-pacing.test.ts` (seeded campaigns through the real deck mix,
  letter grants and pity channel: median day-of-legible-TIE-BREAKER in 10–22,
  p10 ≥ 8 — round 21, and the milestone is now DERIVED off the volume's own
  reveal order rather than typed as "fragment 16", which stopped being the
  tie-breaker the moment the volume grew to 28 pages).

### The floorplan is an argument (REVIEW_AA §5.7 / §7 — round 20)

*The review scored this layer **3/10**, the lowest sub-rating in the game, and the
charge was specific: "7 of 30 cards can ONLY be dead ends and 13 can roll one; the
manor comes out a corridor, nothing survives the night, and the three draft doors
are labelled nearly identically." Against Blue Prince: "where you place a room IS
the problem… the North wing is a spatial argument you conduct against the grid
across dozens of runs, and the knowledge you accumulate is permanent even though
the house is not. Lexicon Manor's floorplan is a corridor generator with a price
list." These four clauses are what that answer is measured against;
`scripts/draft-shape.ts` is the instrument, run against the live deck and the live
`rollCards`.*

- 4.19 **A draft usually presents a trade-off, not one live option and two duds.**
  Measured over real offers at real doors during a seven-draft evening: **≥75% of
  offers contain two or more plans that keep the path alive**, and **≤6% contain
  none**. Measured before the round-20 deck rebalance / after: real choice
  **66.4% → 79.2%**, no-choice **9.2% → 5.3%**, and the three plans in an offer
  resolve to three *distinct* shapes on **49.8%** of draws (was 37.9%).
  The deck's own geometry: cards that can only ever be a dead end **7 → 3**,
  dead-end plans **31.7% → 20.3%** of 59 (was 41), and the deck now holds a
  **mirror corner** — before the rebalance all twelve of its corner plans were
  `['N','E']`, which under the rigid rotation turns you LEFT every single time,
  so the house could bend one way and only one way.
  **The tension is deliberately kept**, per the review's own wording: twelve of
  the twenty-eight cards can still roll a dead end (the review counted thirteen),
  a bad hand can still seal a wing (a fork laid into a corner of the plot still
  can), the
  three surviving pure dead ends are the three rooms whose fiction is the end of
  the house (the Study, the Gem Vault, the Observatory), and a sealing plan is
  now something she may *want*: `SEALED_ROOM_BOUNTY` pays **+1 gem**, stamped on
  the card face before she taps, off the same `sealsItself` the slice pays from.
  A gem and never a step, because `STEP_TABLE` is the surface every 4.10 band is
  calibrated against and this item has no business moving it.
  Pinned in `tests/grid.test.ts` (the three seal rates) and
  `tests/drafting.test.ts` (the bounty).
  **The one number held fixed on purpose:** the Sanctum landing. Only a plan
  carrying canonical `'S'` opens north when the landing is entered from below, so
  every tier-3-eligible card's share of those is unchanged by the rebalance —
  **19.0% of plans and 63.4% of bare offers, before and after.** 4.10d/e are not
  this item's to retune.
- 4.20 **A column means something, and the argument outlives the night.**
  `rowTier` made the vertical axis mean difficulty, price and rarity; the
  horizontal axis meant *nothing at all*, which is why the optimal manor was the
  shortest path to the top. `engine/manor/wings.ts` gives the five columns three
  wings — **West Wing (0–1) · Stair Hall (2) · East Wing (3–4)** — and one rule
  with a night in the middle of it: two or more rooms of one category with no tie
  gives a wing its CHARACTER tonight; a wing that has ended the same way on
  `WING_MEMORY.eveningsToRemember` evenings, by a margin, is REMEMBERED forever;
  and a remembered wing **draws true** (`WING_AFFINITY`, a weight and never a
  filter — 4.6 keeps the draft a decision). The manor still resets at dusk. What
  survives is *where things are kept*, which is the Blue Prince property the
  review says we do not attempt.
  - **Two exclusions, both enforced in one place and both measured rather than
    chosen.** A wing can be argued into blue or yellow only. **Violet** cannot:
    a mystery wing spends 4.10g's published supply, and worse, the first build of
    the term boosted its character against *every* other category and took the
    increase out of violet — measured, the median player's made-out rate fell
    **24.0% → 18.9%**, through 4.10g's own ≥20% floor. The term is now normalised
    over the non-mystery pool, so **violet's share of an offer is bit-identical
    with a remembered wing and without one** — an equality, asserted at every row
    in `tests/wings.test.ts`, not a band. **Green** cannot either: a permanent
    working wing is a permanent step raise by geography, i.e. a retune of
    `STEP_TABLE` under another name, and at ×2.4 it put the median evening at
    **9.7 minutes** (under 4.10b's 10–15 floor) and dropped solve-sourced keys
    *below* Fern's arc, inverting the round-10 owner directive.
  - **`WING_AFFINITY` = 1.35 is derived, not chosen.** It is the largest value at
    which every published 4.10 band still holds with the term modelled at its
    pessimistic strength (`WING_MODEL`: a reading wing, on half of every
    evening's drafts). Walked down: ×2.00 → skilled first-week win **5.0%**
    against 4.10e's <3%; ×1.60 → 4.25%; ×1.45 → 3.25%; ×1.35 → **2.9%**, medians
    unmoved, skilled/median ordering intact. The mechanism is worth naming
    because it will catch the next person: blue rooms carry §5.1's fragment
    spine, so any term that puts more of them in front of a player shortens the
    campaign — the wing is a knowledge lever wearing a floorplan's clothes, and a
    stronger one needs 4.10e's open ~28-page content commission first.
  - **Modelled, not assumed.** `simulateDay` has no columns, so leaving this
    unmeasured would be §0.5's escape exactly. `deckMixAt` takes the same
    normalised term and `WING_MODEL` states its two assumptions, both chosen to
    make the bands hardest to hold.
  - **No save-schema change beyond one optional field.** The memory is derived
    from `chronicles.dayRecords[].wings`, written at dusk from the floorplan
    before `endDay` wipes it — the same trick `surveyEveningsIn` and
    `carryOverFrom` use to cross a night. An older save migrates by doing
    nothing.
- 4.21 **The doors out of a room are told apart before she opens one.** REVIEW_AA
  §4: *"two read 'Draft a room on the ground floor — 1 step' and one 'on the half
  landing.' Then the half-landing door opened a modal headed 'Three floorplans for
  the ground floors.' The labels still tell you nothing about the decision, and one
  of them is wrong."* Both halves fixed. **Wrong:** the modal took its words from
  the three-row tier BAND while the door took its from `rowName`; there is one
  vocabulary now and it is the storey's. **Says nothing:** the three doors differ
  in exactly one respect, the WING each opens into, so every draft label and the
  modal heading lead with it, plus what the papers remember that wing for. The
  blueprint draws the two wing seams and the three wing plates in survey ink, and
  a remembered wing's plate takes the gilt. Pinned in `tests/wings.test.ts` (the
  three labels out of the Entrance Hall are three distinct strings).

---

## 5. Dialogue & characters vs Hades

### The system sees you
- 5.1 **Reaction latency**: every notable event (wrong guess, dry day, first fragment,
  quest step, pangram, perfect day) is referenced by at least one character at the next
  interaction opportunity — scripted test over 10 event types. **[BEAT]**
  **Round 14 — THE SCRIPTED TEST EXISTS NOW, AND IT COVERS STATE AS WELL AS EVENTS.**
  There was no such test: coverage was only ever checked in aggregate by the 15-day
  greedy-talker sim (5.3), which cannot tell "somebody said something" from "somebody
  said something ABOUT THAT". Two states fell through the gap, and they are the two
  the player spends the longest in. (a) `vol.<id>.landing-reached` — written by
  SanctumView on her first arrival at the door, whitelisted in the dialogue validator
  *with a comment inviting authored content to condition on it*, and gated by NOT ONE
  node in any of the six files: the morning after the event 4.10c calls "a campaign
  event, not a Tuesday", nobody said a word. (b) A **full, legible file** — nothing
  anywhere was gated above `portrait.arc.read`'s `fragmentsLegible >= 6`, so the
  knowing-but-locked-out stretch (median 7 evenings, p90 17 for `PROFILE_DECENT`) had
  no line in it. Both are authored now (Bramble's morning recap, Ellery's and Fern's
  parlor beats, the Portrait's stairwell band) and both are rows in
  `tests/dialogue-content.test.ts`'s scripted table, which asserts the selected node
  **positively requires** the state — "a node was returned" is not a pass, because the
  never-silence fallback always returns one.
- 5.2 **The Hypnos test**: Bramble (morning recap) ships ≥12 distinct
  cause-of-day-end reactions, including one per room archetype the player went dry in.
- 5.3 **No repeat before day 15**: simulated 15-day greedy-talker playthrough hits zero
  repeated substantive conversations; repeats land only in the designated idle pool.
- 5.4 Priority correctness: with a first-meeting, an event reaction, and a general line
  all eligible, selection is deterministic: forced > event-reaction > arc > general >
  idle (unit-tested selector with fixture saves).
- 5.5 Nothing missable: no content invalidated on staleness; validator walks the
  requirements graph — orphans or requirement cycles = build failure.
- 5.6 Volume floors (Volume 1): each major character ≥40 conversations / ≥150 lines with
  the event-reaction bucket ≥12; the Portrait may run leaner (Charon precedent);
  Dewey has zero lines, forever. (Line-count lint on authored content.)

### Affinity & gifts
- 5.7 Every affinity rank-up plays a bespoke scene — never a generic "+1." First
  bookmark gifted to each character returns a small mechanical token.
- 5.8 A locked rank + personal favor quest (delivered via Posy's letters) exists for ≥3
  characters. **[BEAT]**
- 5.9 Pacing valves enforced and surfaced kindly: one substantive conversation and one
  gift per character per day; the valve line is warm ("we'll talk tomorrow, dear"),
  never a greyed button. **[COZY]**

### Presentation
- 5.10 Static portrait, speaker-only; portrait in ≤250ms; typewriter 40–60 cps; tap 1
  completes text, tap 2 advances; skipping records seen + applies effects and the
  journal logs a one-line summary. **[PARITY]**
- 5.11 Longest authored line fits the text box at 390px with zero scrolling —
  validator-enforced character budget per box. **[PARITY]**
- 5.12 ≥2 portrait state variants for the 3 arc-heavy characters by Volume 2 (portrait
  as progression reward).
- 5.13 Choices are verbs and flags, never plot forks; adding a character reaction is one
  JSON entry + validator pass, zero code change.

---

## 6. Visuals vs the cozy style guide

### Palette & theme
- 6.1 Zero pure `#000`/`#FFF` in either theme (token grep). Ink is `#2B2118` on
  parchment `#F0E7D8` family.
- 6.2 Body text ≥4.5:1 contrast both themes; category hues ≥3:1 as large glyphs;
  automated axe/contrast pass on every screen. **[PARITY]**
- 6.3 Every category color double-encoded (hue + shape glyph): a grayscale screenshot
  is fully playable. **[PARITY]**
- 6.4 Dark mode is authored (candlelit warm charcoal `#241D15` family; optional
  blueprint-night for the map screen only), never `filter: invert()`; portraits flip to
  pale-on-dark strokes via `currentColor`; grain lightens, never darkens.
- 6.5 Saturated-color budget: on any map screenshot >80% of pixels are paper/ink
  neutrals; saturated hues appear only on interactables and state (Strange Horticulture
  rule).

### Type
- 6.6 IM Fell English never below 22px; body serif (EB Garamond 17–18px / 1.45, or
  Libre Baskerville 16px fallback) never below 16px; all counters use
  `font-variant-numeric: tabular-nums` (no jitter while counting).
- 6.7 Dialogue box holds 45–70 chars/line at 390px and survives one iOS Dynamic Type
  step up without clipping.
- 6.8 Fonts self-hosted (OFL), Latin-subset, total payload <200KB, `font-display: swap`
  with matched fallback metrics (no visible reflow).

### Portraits & linework
- 6.9 All portraits share the stroke ladder (3.0 contour / 2.0 features / 1.2 hatch at
  240-unit authoring scale) and the max-3-hatch-layer rule (inspectable in the SVGs);
  ≥1 untouched-paper highlight zone per face.
- 6.10 Each portrait ships a journal-LOD variant; at 48px display no hatch gap renders
  under 2 device px (3× DPR zoom-screenshot test — the moiré bar).
- 6.11 No moiré/shimmer when a portrait animates in (60fps capture review).
- 6.12 Every cast member recognizable from the 48px cameo alone (wife names all six
  from journal thumbnails).

### Texture, lighting, chrome
- 6.13 Grain is a pre-rendered tile ≤10KB applied as background; no live `feTurbulence`
  on any scroll surface; vignette ≤8% ink in light mode; no OLED banding in dark mode
  at low brightness.
- 6.14 Nothing translates on scroll except the scroll itself — no parallax layers.
  **[COZY]**
- 6.15 Wax red (`#8C2B2B`) appears only for mistakes, unread markers, seals, and
  daily-guess state — never decoration (audit every use).
- 6.16 One metaphor per verb: all confirm/commit actions use the wax-seal (stamp-down
  120ms), all navigation uses ribbon/tab. No mixed idioms.
- 6.17 Every draggable does the grow (~4%) / lift (shadow 0→4px) / tilt (~2°) trio on
  touch-down; buttons press with ink-darken + 1px translate-down. **[PARITY]**
- 6.18 Paper sounds (page turn, crinkle, stamp) accompany every sheet transition
  (Strange Horticulture's cited core delight) — subject to R.4 (silent play stays
  complete).
- 6.19 All tap targets ≥44×44pt including ribbon tabs and map doors (automated
  bounding-box audit), **excluding the two grid classes ruled below**, where the floor
  is arithmetically unreachable at 390px and benchmark parity governs instead. Every
  **costed** control — anything that spends a step, a key or a guess — is ≥44×44pt with
  no exception, on every surface. **[PARITY]**
  - **(a) The 9×9 ledger grid** (Counting House). Nine cells at the floor need 396px;
    an iPhone 12-class portrait viewport is 390, and the leaf is already edge-to-edge
    with zero gutters. NYT Sudoku ships ~41px at this width. The
    exemption is safe because **nothing on the board commits anything**: touching a cell
    only moves a cursor, and every costed verb lives on a ≥44px pad key (59×52px), so a
    fat-fingered cell tap can never spend a step.
  - **(b) Full-width alpha keyboards** (Darkroom 27-key, Linen Closet QWERTY). Ruled
    floor: **≥32px wide × ≥48px tall with no inter-key dead zone** — iOS system keys are
    themselves ~32px wide, so shrinking to satisfy the number would make us worse than
    the benchmark in order to pass it.
  - **(c) Cursor-only grid cells** (Darkroom cipher slot, Linen Closet crossword square).
    *Ruled round 8, on the verifier's own measurements; the owner may override.* These
    are the third and fourth members of the family (a) already rules on, and until now
    they were the only ones unadjudicated — which meant they were being **silently
    waived**, the exact state round 7 called "worse than either answer". Ruled floor:
    **no smaller than the benchmark ships at the same width, with no inter-cell dead
    zone, and every costed verb on the surface at ≥44pt.** The exemption rests on the
    same argument as (a) and on nothing else — **a slot moves a cursor and commits
    nothing**; `Develop the print`, `Weigh the books` and every letter key are ≥44pt or
    inside (b).

    **ROUND 20 — THE ARITHMETIC THIS CLAUSE RESTED ON WAS HALF FALSE, AND THE HALF
    THAT WAS FALSE IS THE HALF IT LEANED ON.** Round 8 wrote: "a 44px slot needs ~2
    more ranks, which pushes the print off the glass." That is a claim about VERTICAL
    space, and it was tested against nothing. Measured live at HEAD on the pool's own
    worst phrase (`cipher-t3-40`, 41 letters, 8 words, longest word FOOTFALL), the
    `.dk-cell` block ended and `.mic-keys` began with **127.9px of empty stage between
    them at 390×844 and 90.3px at 375×667** — the slot was being waived at 38.8px tall
    with two-and-a-half ranks' worth of parchment sitting directly underneath it. The
    height is now **54.0px (390×844) and 44.0px (375×667)**, effective 61 and 47, i.e.
    the slot is inside 44pt on the axis the old argument claimed was impossible, at
    both viewports, on the worst board in the pool.

    What is true, and is the only thing this clause now rests on, is **horizontal and
    arithmetic**: the longest word must sit unbroken on one rank or word shape — the
    first read in a cryptogram, before letter frequency — is gone. Eight slots plus
    seven letter gutters inside the sheet's 346.4px content width is **38.05px a slot
    at 390×844, 36.2px at 375×667, ceiling**, before any question of taste. That bound
    does not move with the stage height, so no amount of reclaimed parchment reaches it.

    The dead-zone half of the ruled floor was also **being violated while the clause was
    read as satisfied**: sampling every inter-slot gutter ≤14px, 2 of 35 midpoints
    answered as `div.dk-sheet` at HEAD (both of them the wide inter-WORD gutter, tiled
    by a ±3px extension authored against the narrow inter-LETTER one). The extension now
    reads the gutters as variables and tiles exactly half of each; **0 of 35 at both
    viewports, driven** (`scripts/r20-glass-drive.mjs` clicks every midpoint and asserts the
    selection lands on one of the two slots either side).

    The crossword square's own residual is unchanged in kind and smaller in size: 5
    squares plus a 3-row 48px QWERTY plus the clue panel plus the room's verb still do
    not leave 44px a square inside a 550.6px stage at 375×667. The square is **36.3px
    there (was 34.1)** and stays a recorded residual; at 390×844 it is 48.6px and inside
    the floor.
  - All three classes must be **measured and recorded** every round — the exemption is
    from the number, never from the measurement. *Round 7 (verifier): this ruling was
    requested by three separate passes and was being silently waived in the meantime,
    which is worse than either answer — a criterion no critic can pass or fail.*

  **MEASURED, ROUND 20** (`scripts/r8-tap-targets.mjs`, real Edge, effective tap target
  derived by hit-testing outward from each control's centre, so `::after` extenders and
  inter-cell dead zones are both caught — a bounding-rect read cannot tell them apart).
  *Round 20 pinned the harness to the WORST board in each pool (`cipher-t3-40`,
  `crossword-t3-19`, `sudoku-t3-01`) rather than whichever board the day seed handed it.
  **Round 52: cipher ids are positional and the phrase list was rewritten, so that
  41-letter board is `cipher-t3-43` now — the three live harnesses derive the worst
  cipher board instead of naming it, because a pinned id that silently re-points is a
  gate that quietly measures an easier case.**
  Every number here is a floor, and a floor read off a soft board is not a floor: the
  cipher slot measures 37.4×54 on a 16-glyph phrase and 32.0×54 on the 41-glyph one, and
  only the second is the number this clause has to justify. The round-8 column below is
  re-measured on the same pinned boards, at HEAD, so before and after are the same
  question asked twice.*

  | control | clause | 390×844 was → now (css / effective) | 375×667 was → now |
  |---|---|---|---|
  | `.ch-cell` ledger cell | (a) | 43.3×43.3 / 44×44 (unchanged) | 39.7×39.7 / 40×40 (unchanged) |
  | `.mic-key` Darkroom key | (b) | 32.5×55.7 / 34×56 (unchanged) | 33.7×48.0 / 34×48 (unchanged) |
  | `.lc-key` Linen QWERTY key | (b) | 32.5×50.5 / 34×52 → **32.5×48.0 / 34×48** | 33.7×48.0 / 34×48 (unchanged) |
  | `.dk-cell` cipher slot | (c) | 31.2×38.8 / 37×49 → **32.0×54.0 / 39×61** | 30.0×30.7 / 36×41 → **30.8×44.0 / 38×47** |
  | `.lc-cell` crossword square | (c) | 48.6×48.6 / 50×50 (unchanged) | 34.1×34.1 / 35×35 → **36.3×36.3 / 37×37** |
  | `.ch-pad` ledger pad key | none | 59.0×52.0 (unchanged) | 57.3×44.0 (unchanged) |
  | `.mic-btn--primary` Darkroom verb | none | 150.5×44.0 (unchanged) | 150.5×44.0 (unchanged) |
  | `.lc-clue` clue row | none | 336.8×44.0 (unchanged) | 328.2×44.0 (unchanged) |

  Both keyboards are inside (b)'s floor at both viewports — including the 48px height,
  which round 12 found them under and fixed, and which the Linen Closet's key now sits
  exactly on rather than 2.5px above (round 20 spent the difference on the clue panel;
  a key ON its floor is inside the exemption, a key under it is not). **Zero costed
  controls are under 44pt on any surface at either viewport.**

  *Two honest discrepancies with the round-8 printing, both from the same cause and
  neither hidden: `.ch-cell`'s effective box reads 44×44 / 40×40 today where round 8
  recorded 43×43 / 39×39, and `.lc-cell`'s reads 50×50 where round 8 recorded 50×49.
  The walk-out probe counts whole pixels outward from a fractional centre, so it is
  ±1 on a cell whose css size is fractional (43.3, 39.7, 48.6). Nothing in the tree
  moved these three controls this round; the numbers above are simply what the same
  script prints today on a pinned board.*

  **The `.lc-clue` row's own geometry is unchanged and was never the defect.** What
  changed is how many of them the panel holds at rest — 2 → 4 rows at 390×844, 1 → 2 at
  375×667 (3 on a 4×4 board, which is every tier-1 closet in the pool) — and that a row
  is now either wholly on the panel or wholly off it. At HEAD a row could rest painted
  in part (measured: 10% of a row at 390×844, 4.5% at 375×667) with its own centre over
  the QWERTY; driven, a click at that centre selected the WRONG clue at 390×844 and the
  owner's report has it typing a letter into the grid. `scroll-snap-type: y mandatory`
  plus a cap that is exactly N × 44 + the panel's rule makes the straddle unreachable. *Round 8 correction to the record: a round-13 pass
  asked for 6.19(a)'s recorded 43.3×43.3 to be corrected to "42×42", on the grounds that
  the round-7 height reserve had shrunk the leaf to 39×39. The reserve fix is in the tree
  (`counting-house.css`, 18.8rem → 17.1rem) and the cell re-measures at **43.3×43.3**,
  i.e. back at the number this clause already recorded. The correction was not applied,
  because applying it would have introduced the error it was trying to remove. The 375×667
  column is new — (a) had only ever recorded one viewport.*
- 6.20 The style-density test: any screen, cropped to 25%, is still identifiably this
  game (Fell caps, parchment, ink rules, or a cameo in any quadrant).

---

## 7. iPhone PWA checklist

### Install & launch
- 7.1 Add to Home Screen yields the correct 180×180 icon (no gray placeholder, no black
  corners — icon has no alpha) and correct name. **[PARITY]**
- 7.2 Cold launch shows a matching splash (no white flash) on at least: SE-class
  (750×1334@2x), 12/13/14 (1170×2532@3x), 15/16 Pro (1179×2556@3x), Pro Max
  (1290×2796@3x); dark-mode splash variants if dark UI ships. (Generated via
  `pwa-asset-generator`, not hand-authored.)
- 7.3 Launch → interactive <2s on iPhone 12 over Wi-Fi; <1s warm.
- 7.4 Airplane mode after one online visit: full day playable including every room
  archetype (all content JSON precached). **[PARITY]**
- 7.5 Base-path integrity in CI: built manifest `start_url`/`scope`, SW scope, and all
  asset URLs carry the deploy prefix (hard-check `dist/` artifacts).
- 7.6 New deploy → installed app shows a "new edition" reload prompt within one session;
  never auto-reloads mid-puzzle; post-update save intact.

### Layout & viewport
- 7.7 Zero page-level scrolling ever, tab or standalone (`position:fixed` shell,
  `100dvh`); no layout jump when the Safari toolbar collapses pre-install. **[PARITY]**
  (Also the house no-scrollbars rule.)
- 7.8 No content under the notch/Dynamic Island or home indicator; bottom HUD padded
  `max(12px, env(safe-area-inset-bottom))`; nothing critical in the top
  `safe-area-inset-top` band (iOS 26.1 bar defense).
- 7.9 Keyboard open on every text-entry puzzle: input row rides above the keyboard
  (VisualViewport-driven), no focus auto-zoom (all inputs ≥16px), no dead space on
  dismiss. **[PARITY]**
- 7.10 Orientation handled explicitly: portrait layout, with a graceful "portrait
  please" screen on landscape (pick and ship one behavior).

### Touch
- 7.11 No double-tap zoom (`touch-action: manipulation` on html), no pinch-zoom on the
  board (`touch-action: none` + `gesturestart` preventDefault), no long-press
  loupe/callout on tiles, no gray tap-highlight. **[PARITY]**
- 7.12 No rubber-band bounce on non-scrollable surfaces; journal/dialogue panels scroll
  internally with `overscroll-behavior: contain`; no accidental pull-to-refresh.
- 7.13 Two-thumb-speed rapid taps drop zero inputs and never trigger text selection.

### Audio (iOS specifics; full music bar in §8)
- 7.14 First tap anywhere unlocks audio (resume on `touchend`/`pointerup`, never
  `touchstart`); nothing is gated on AudioContext state, ever (R.4). **[PARITY]**
- 7.15 Lock/unlock, phone call, Siri: audio recovers automatically via
  interrupted-state handling or on the next tap — never permanently silent, correct
  pitch after sample-rate flips (graph rebuild path exercised on hardware).
- 7.16 Ring/silent-switch behavior is a deliberate, documented decision
  (`navigator.audioSession.type='playback'` + settings toggle, or honored with a subtle
  "sound is off (ring switch)" hint) and verified on hardware.

### Persistence (the save is the product)
- 7.17 Force-quit mid-puzzle → relaunch: at most current puzzle input lost; steps,
  journal, affinity, day state intact (save on every state mutation + flush on
  `visibilitychange:hidden` and `pagehide` — never `beforeunload`). **[PARITY]**
- 7.18 `navigator.storage.persist()` requested at first save; result + `estimate()`
  visible in a hidden debug panel.
- 7.19 Save export/import code works Safari-tab → installed app (the two storage
  containers are separate — verified by test on hardware). **[PARITY]**
- 7.20 Dual-write saves (localStorage + IndexedDB mirror); every write wrapped;
  `QuotaExceededError` degrades with a user-visible message, never a silent loss.

---

## 8. Music & sound

### Timbre & mix
- 8.1 Piano voice: FM brightness decays 4–6× faster than amplitude; soft velocity is
  audibly darker, not just quieter.
- 8.2 Music-box/celesta partials are inharmonic (≈2.76/5.4/8.9 ratios), decay
  0.15–1.2s, used only above ~C5.
- 8.3 Zero clicks: 10-minute recording shows no waveform discontinuities; all node
  stops ≥30ms after release tails.
- 8.4 Exactly **one** ConvolverNode app-wide; IR generated (decaying noise,
  decorrelated L/R, 15ms fade-in, darkening tail), 1.8–2.5s; room "size" via send
  level + pre-delay only. Audible dry/wet difference between smallest and largest room
  in a blind A/B.
- 8.5 Ducking is explicit gain (no compressor sidechain — it doesn't exist): UI sounds
  duck music −4 to −6 dB, attack ≤50ms, release ≥500ms, refcounted so rapid letter
  taps hold the duck without pumping; dialogue holds −6 dB; fanfares −9 dB.
- 8.6 Ambience beds sit −18 to −30 dB under music; the Entrance Hall clock is
  subliminal (≈−36 dB), noticed only when pointed out; master compressor never exceeds
  3 dB reduction in normal play.

### Generativity & integration
- 8.7 30-minute recording: no 20-second window is sample-identical to another (no loop
  seams; incommensurable-loop or phrase-generator engine, no `loop=true` on anything
  musical).
- 8.8 Music continues seamlessly across ≥10 consecutive room transitions; mood morphs
  are parameter crossfades completing in 1.5–3s with no cut or retriggered notes.
- 8.9 Harmony rules hold on inspection of generated output: every chord change shares
  ≥2 common tones; top voice moves ≤2 semitones; no 3rds/7ths below ~G3; harmonic
  rhythm 8–16s.
- 8.10 Violet-room palette identifiable by ear (Lydian ♯4 / ♭III shift, celesta lead)
  in a 5-second clip — wife-playtest.
- 8.11 All note events scheduled via lookahead (≈25ms tick / 100ms horizon) against
  `ctx.currentTime`; clock stays metronomic under scroll/touch spam.
- 8.12 iOS robustness: cold start → first tap → sound within 100ms; backgrounded 5 min
  → foreground resumes with no event-backlog burst; `buildAudioGraph(ctx)` is
  idempotent and the only graph constructor (enables sample-rate rebuild).
- 8.13 Audio CPU <~5% of one core on A14-class over a 30-minute session; no
  ScriptProcessorNode, no AudioWorklet, no external audio assets (grep the audio
  module for `fetch(` → zero hits).

---

## 9. Performance budgets (iPhone 12-class, A14, 60Hz, DPR 3)

- 9.1 60fps during: board pan / zoom-to-room, tile placement, typewriter, victory
  juice; no frame >33ms in normal play (Web Inspector timeline). **[PARITY]**
- 9.2 Steady-state script+style+layout+paint ≤8ms/frame (headroom for thermal
  throttling and GC).
- 9.3 Low Power Mode (rAF throttled to 30fps): animations delta-time-driven and
  designed to look intentional at 30fps; game fully playable.
- 9.4 15-minute session: flat JS heap (no per-frame allocation churn), no thermal
  spiral, no memory-pressure kill.
- 9.5 Only `transform`/`opacity` animated (layer/paint-flash audit); any canvas capped
  at 2× DPR backing store.
- 9.6 Initial JS ≤300KB gzipped; room engine modules and volume content lazy-loaded;
  typewriter batches one text-node mutation per rAF (never one React render per
  character).
- 9.7 Grain/parchment textures are static compressed images; total font payload
  <200KB; room art shipped near display size (WebP/AVIF).
- 9.8 Lighthouse performance ≥90 on the deployed Pages build.

---

## 10. Open questions (for the director + wife-playtests, not for critics to guess)

1. **Glyphs/perks** (MANOR_DESIGN §12.5): return as room effects, bookmark-trinkets, or
   die? Data stays quarantined until decided.
2. ~~**Day length**: does 40 steps land 10–15 min?~~ **ANSWERED by the 2026-08 owner
   playtest + the economy overhaul**: 40 steps landed ~20 min *and* handed her the
   Sanctum on day 1. The budget is 18 with per-row movement pricing; simulation now
   pins median 10–15 min, first Sanctum reach day 6–10, volume win 8–16 days (4.10e,
   re-derived in round 19 — it read 14–28 before REVIEW_AA §5.1/§5.2).
   Remaining playtest question is only whether the *felt* pace matches the model —
   `TIME_TABLE` in `engine/economy/simulate.ts` carries estimated durations and must be
   replaced with instrumented medians once 3.5's playtest lands.
3. **Mistake-cost table**: R.1 fixes the Conservatory; are −2/−3 felt-but-fair in the
   deduction rooms? Is the Library's escalating-hint pricing right?
4. **Mute switch**: honor it (arguably correct for cozy) or bypass via
   `audioSession='playback'` with a settings toggle? Criterion 7.16 requires a decision,
   not a default.
5. **Dark-mode map**: candlelit-only, or blueprint-night (B) for the map screen + candlelit
   (A) elsewhere? Prototype both, screenshot vote.
6. **17th decoy tile** in tier-3 Libraries (the Forbes fix): ship in Volume 1 or hold as
   a later-volume difficulty modifier?
7. **Dialogue authoring budget**: 800–1,000 lines for the cast is the bar (5.6) — is
   that writable to quality for Volume 1, or do we ship 3 major + 2 lean characters and
   patch upward?
8. **Pantry step-tick cadence**: how fast can steps tick before it reads as "timed
   pressure" and violates the pillar? Needs a felt-pressure playtest.
9. **Conservatory 70%-solve payout vs 100%**: does paying full solve at Full Bloom make
   the hidden Every Petal tier feel optional enough, or does the gem lure reintroduce
   completionist grind?
10. **Volume 2+ pipeline**: how much of the fragment/definition authoring can the
    content pipeline carry before quality drops below the Study bar (3.7)?

---

## 11. Reachability, event feedback, and unread state

*Written after three defects of these shapes shipped past three rounds of harsh critics
(the escapes are recorded in §0.5). Every criterion here is verified by the **live
interaction pass** of §0.4 — driving the real app, hit-testing real controls. Static
screenshots are explicitly insufficient evidence for this entire section (§0.1.7): a
control that is buried, covered, or un-tappable photographs exactly like a working one.*

*Standing assumption: **the installed PWA has no address bar, no browser back button and
no reload.** The app's own affordances are the only navigation that exists. Anything the
player cannot reach by tapping is not shipped, however complete the code is.*

### Reachability — no dead ends, no doorless rooms

- 11.1 **Everything enterable is leavable.** Every route in `src/App.tsx`, every
  full-screen overlay, and every *branch* a screen can render (no day yet, content still
  loading, unauthored volume, unregistered room kind, empty collection, error) offers at
  least one control that returns the player toward the blueprint. Enumerated surface by
  surface in the §0.4 walk; a surface with zero exits is a release blocker, and "the
  ceremony advances on its own in a second" only counts if the auto-advance is
  unconditional and ≤2s. **[PARITY]**
- 11.2 **The exit passes a hit test, not a DOM check.** For every exit control:
  `document.elementFromPoint` at its centre — and at the four inset corners of its
  bounding box — returns that control or its own descendant, at 390×844, in both themes,
  with the fixed chrome mounted. Anything else (the chrome header, a scrim, a sibling
  overlay) is a fail. "It renders" and "it's in the DOM" are not rebuttals. **[PARITY]**
- 11.3 **Exit visible without scrolling.** Every exit control is inside the visual
  viewport with its surface at scroll 0, meets 6.19's 44×44pt floor, and stays uncovered
  at every scroll position of the surface it belongs to. **[PARITY]**
- 11.4 **Nothing load-bearing under a fixed layer.** Any surface that is itself
  `position: fixed` against the viewport clears the chrome with `var(--chrome-h)` (plus
  `env(safe-area-inset-top)`), never a hard-coded pixel copy of it — a token grep finds
  zero literal chrome heights in page/overlay CSS, so retuning the bar cannot silently
  bury a control. The same clearance applies to full-screen overlays that place anything
  interactive in the top band. **A surface that stacks navigation the shell's tokens do
  not describe publishes it** (round 11: the journal's ribbon tabs sit below the back
  row, and the moment seal — which clears the bar and the back row — landed on all four
  of them). The published value is **measured from the live element** and is the band's
  *floor*, not its height: a height must be summed with everything else the surface
  stacks above it, and that sum is a copy of somebody else's layout living in a second
  file, which is the drift this criterion exists to forbid. Fixed layers take
  `max(own clearance, published floor)`; the token defaults to 0 so surfaces that do not
  opt in are untouched. A surface with **no** band to publish — a room, whose glass is
  playfield from the top of the stage to the sticky key deck — is 11.27's case, not this
  one: there is no clearance that fits, so the layer stops taking taps instead.
  **Round 15 — the clearance has a FOOT as well as a head.** The clause above describes
  a band a surface stacks at the top and nothing else, so the one fixed layer that pins
  its own interactive island to the BOTTOM of the glass had nothing to clear: the dusk
  veil's `.chr-dusk__skip` sat 28px off the bottom, on top of the blueprint's navigation
  row (measured: skip [129,772,133,44] over Journal [114,788,120,44] at 390×844;
  `elementFromPoint` at the Journal button's centre returned `.chr-dusk__skip`; driven,
  the tap did not reach the journal). A surface that **pins a navigation band at the
  bottom publishes its ceiling** — `--page-foot-ceiling`, the distance from the
  viewport's bottom edge to the band's top, measured from the live element
  (`app/platform/page-nav.ts`) for the same reason the floor is: it stays true whatever
  the surface stacks *below* it (its own safe-area padding, a hint line, the home
  indicator). Bottom-pinned fixed layers take `max(own margin, ceiling + gap)`, and the
  token defaults to 0 so a surface that pins nothing is untouched. The published
  surfaces today: the blueprint's `.bp-foot__actions`, the journal's `.jrn-rail`, a
  room's `.room-host__footer`. **[PARITY]**
- 11.5 **Chrome does not reach through an overlay.** While any modal or full-screen
  overlay is up, controls belonging to the persistent chrome are either raised above it
  deliberately (documented, e.g. the day candle staying readable) or made
  non-interactive. A destructive chrome action — retire-for-the-evening above all —
  must never be tappable through a scene the player believes is modal. Verified by hit
  test at the chrome control's centre with each overlay open. **[PARITY]**
- 11.6 **The exit goes where its label says.** Clicking it lands on the named
  destination, not merely *somewhere else*. Asserted per route in the §0.4 table. (Blue
  Prince's retraversal complaint — BENCHMARKS §4, criticism 3 — is what an exit that
  lands wrong feels like after the tenth time.)
- 11.7 **Navigation leads with the recognisable word.** Every navigation affordance
  opens with a plain noun/verb or a standard icon ("The manor", "Journal", "Chronicles",
  a back chevron). House voice is permitted only as a *subtitle* at smaller size and
  softer ink ("Put it down"). Flavour never carries the meaning, and a control the owner
  cannot identify in a 1-second glance test fails. **[COZY]**
- 11.8 **First launch is navigable.** On a fresh save — before any day is started — the
  player can still reach settings and the save trunk (11.22) without mutating state.
  A returning player restoring a save code must never have to start a new day first.
  **[PARITY]**
- 11.9 **The route audit ships with the build.** Each `<Route path>` maps to ≥1 in-app
  entrance (a `navigate()` call site or equivalent affordance) in shipped UI. A route
  with zero entrances is deleted or given a door — it does not ship as a secret.
  **[PARITY]**

### Event feedback — "did something just happen?"

Three severity classes. Every reward, grant, unlock and state change is assigned to one,
and the class dictates what it owes the player:

| Class | Examples | Owes |
|---|---|---|
| **Campaign** | clue fragment filed, letter arrived, volume progress/solve, affinity rank-up, permanent unlock (room card, keepsake) | a **moment** on the screen the player is actually on **and** a persistent trace that survives the screen change, the day roll, and a force-quit |
| **Session** | steps, gems, keys, bookmarks, room solved, tier-up | a visible delta **on the counter or surface it changes**, on the current screen; no persistence required beyond the counter itself |
| **Flavour** | Dewey's purr, ambient lines, room dressing | transient, no persistence, and visually distinct from both classes above |

- 11.10 **Emit-site → notice-site audit.** For every event on the spine
  (`engine/events.ts`) and every currency mutation in `app/slices/*.ts`, the review
  records: which screens the player can be on when it fires, and which component renders
  its notice on each of those screens. An emitter whose notice is rendered by exactly one
  component is presumed broken until the walk proves otherwise. **[PARITY]**
- 11.11 **The notice appears where the player is.** Provoke each channel from each screen
  it can genuinely fire from — inside a room, behind a full-screen dialogue overlay, on
  the journal, on the chronicles, during a draft, during a lifecycle scene — and assert
  the notice is mounted, non-zero, unobscured and on glass on *that* screen. A notice
  rendered by a component that is unmounted or covered at fire time is a fail, not a
  near-miss. **[PARITY]**
- 11.12 **A Campaign moment cannot be missed by being elsewhere.** Its persistent trace
  is present after the moment ends: an unread marker on the entrance affordance, an entry
  in the night digest, or a row in the journal — reachable in ≤2 taps from anywhere
  (compounds with 4.15). **"Anywhere" includes the lifecycle scenes** (round 11): the
  morning card and the night digest are full-screen, unavoidable, and daily, so a trace
  they cannot reach is a trace that costs nine taps on the two screens the player stands
  on most. A scene that *names* a filed document — "A letter waits unopened in the post
  tray", "Filed in the Journal · Testimony" — and offers no route to it fails this
  criterion, whatever the blueprint offers. The tap count is measured in the §0.4 walk,
  by pressing real controls, never by counting `navigate()` call sites. Blue Prince
  shipped without this and players kept 44 pages of notes for it (BENCHMARKS §4,
  criticism 2); we do not get to repeat it. **[BEAT]**
- 11.13 **Transience is capped by attention, not by a timer alone.** A transient notice
  that can fire while the player's eyes are elsewhere either (a) waits for the player to
  return to the surface that shows it, or (b) is Campaign-class and therefore already
  owes a trace under 11.12. A 3-second footer line that expires behind an overlay is a
  fail even though it "played". **[PARITY]**
- 11.14 **Rewards never dress as flavour.** A notice announcing a reward or state change
  does not share its class, typography, ink or position with pure flavour text. Enforced
  by inspection: grep the shipped notice styles and show that reward copy and flavour
  copy resolve to different rules. If the cat's purr and a clue fragment render
  identically, the fragment reads as decoration. **[COZY]**
- 11.15 **Every currency shown in chrome animates its own delta.** 4.9 already requires a
  floating ±N for steps; the same applies to every other counter the chrome displays
  (gems, keys, and any currency added later). A number that changes silently between
  glances is indistinguishable from a bug. **[PARITY]**
- 11.16 **Every currency the player can spend is displayed somewhere persistent.** A
  currency that is granted and consumed but never shown outside the screen that spends it
  fails; the player cannot plan against a quantity she cannot see.
- 11.17 **No dead reward class.** Anything the UI advertises as earnable (keepsakes,
  unlockable floorplan cards, quest rewards) has a live emitter reachable in normal play
  — asserted by a test that drives the award path, not by the existence of a checker
  function. A section that can only ever render empty is either wired or removed.
  **[PARITY]**
- 11.18 **No orphan notice copy.** Authored notice strings (utility-room payout lines,
  reward toasts) are rendered by shipped UI. A string-table lint finds zero authored
  notice copy with no render site — unused copy is a notice someone forgot to show.

### Unread / state vocabulary

Wax red already means *state, never decoration* (6.15). That promise extends to the whole
unread chain.

- 11.19 **The chain is unbroken end to end.** If an item is unread, the marker appears at
  every level between the main screen and that item: the entrance affordance, the section
  or tab, and the item itself. A dot that exists only on the innermost tab is invisible to
  a player who has no reason to open the screen. (Wordle's keyboard-as-memory-prosthetic,
  BENCHMARKS §3: earned state stays visible where the player will actually look.)
  **[PARITY]**
- 11.20 **Unread clears on viewing, and on nothing else.** The marker retires when the
  item has actually been displayed to the player, and persists otherwise — across tab
  switches, screen changes, the day roll, and a force-quit. Unread state derived from
  day-scoped or session-scoped data (anything cleared at dusk) fails: it makes the marker
  a *recency* badge wearing state's clothes. **[PARITY]**
- 11.21 **The marker is truthful in both directions.** No marker where nothing is unread;
  a marker wherever something is. Any count shown alongside it matches the number of
  unviewed items exactly. **[COZY]**
- 11.22 **Unread survives grayscale and reduced motion.** The marker is double-encoded
  per 6.3 (shape or position, not hue alone) and legible with `prefers-reduced-motion`
  on. **[PARITY]**

### Settings & data reachability

- 11.23 **Two taps, from anywhere the player can stand.** Audio (sound, music, ring-switch
  policy), reduced motion, and save export/import are reachable in **≤2 taps from the main
  screen** — one tap to the surface that hosts them, one to the control — and the hosting
  surface has a permanent entrance on the blueprint (11.3). Measured by tap count in the
  §0.4 walk, not by counting clicks in the code. **[PARITY]**
- 11.24 **Reachable in every phase.** The same ≤2 taps hold during exploring and from a
  fresh save (11.8). If a lifecycle scene (morning, dusk, night) blocks them, the scene
  offers its own route to settings or is dismissible in one tap first.
- 11.25 **Reduced motion is reachable without motion, audio settings without audio.** A
  player who opened the app because it moved too much, or because it was too loud, can
  turn that off without sitting through the thing she is turning off. **[COZY]**
- 11.26 **The trunk is reachable read-only.** Reaching save export/import costs the player
  no game state: no day started, no step spent, no scene consumed. It is the recovery
  path (7.19) and a recovery path that charges admission is not one. **[PARITY]**

### Notices over playfields

*Added in round 12. §11 had a clause for a fixed layer landing on navigation (11.4) and
none for a fixed layer landing on a BOARD, so the moment seal sat on five of the seven
rooms for two rounds and no critic could pass or fail it.*

- 11.27 **A notice over a playfield does not take the taps aimed at the board.** A room's
  glass is playfield from the top of its stage to the sticky key deck; there is no spare
  band to clear (measured, all seven kinds — the Linen Closet's grid starts 7px below the
  top of the stage) and no way to give one back without taking it from the board itself.
  **Round 15 — THE BLUEPRINT IS A PLAYFIELD TOO.** It reads like a sheet screen and it
  is a board: every cell on it is a control, or will be one when she reaches it, from
  the top of the sheet to the footer. The seal's band is empty parchment on the ground
  floor — which is why round 11 recorded /manor clean — and the sheet draws the upper
  storeys at the TOP of the glass, so the moment she climbs, the manor's own controls
  move into it (measured: "Approach the Sanctum" [177,157,64,64] answering `.mom` at
  its centre on the Sanctum landing; the two padlocked-door controls at 375×667, which
  are **costed**). Declared once, unconditionally — a guard that asked "is a live cell
  inside the band right now?" would be a condition on a layout evaluated in a second
  file, i.e. the drift 11.4 forbids, and it would read green on every screen a critic
  happens to look at.
  So the rule is not about position, it is about **agency**: while a transient notice is
  over a playfield, `document.elementFromPoint` at every cell and every key returns that
  CONTROL, and a driven tap aimed at a control the notice covers performs that control's
  action. A notice that is itself tappable over a board fails, however briefly it is up —
  the tap it eats is indistinguishable from a dead control (§0.5 escape 4). Its
  corollaries, all verified by driving, never by stills:
  - **(a) The board pays nothing.** The notice may not resize, reflow or scroll the
    playfield to make room for itself. Boards here are sized off `--stage-h` and several
    sit at their measured floor already, so a reserved band comes straight out of the
    cell: measured at 390×844 and 375×667, reserving the seal's own height took the Counting
    House's exempt 9×9 cell from 43.3 → 35.8 and from **39.7 → 25.8**, and the hive hex
    from 107.3 → 75.8 and 86.1 → 46.1. 6.19(a)'s exemption is granted on a measurement,
    so a notice that invalidates the measurement for five seconds is a second defect and
    not a fix. Recorded every round by `scripts/probe-seal-geometry.mjs`, which prints
    stage height and cell geometry with and without a notice on glass; every value must
    be unchanged.
  - **(b) It retires on its own clock.** A notice that cannot be tapped away must not
    need to be: it is Campaign-class, so 11.12 already owes it a persistent trace, and
    the dwell is what has to carry it (5.6s alone, 4.0s with a queue behind it). It may
    not wait on a tap that would land on the board instead.
  - **(c) It still says everything 11.7/11.12/11.14 require** — the plain word for what
    arrived, the address of the trace, and a form that shares nothing with flavour. It
    may drop the reward's own words, which are one tap away at the address it just named;
    it may not drop the address.
  - **(d) Every surface, every round — and every STATE of every surface.** The gate is
    `tests/critic-round12-seal-overlap.mjs`: it walks all seven room kinds with a
    **distinct** grant each — re-filling an already-unlocked plate announces nothing,
    which is how a first pass silently measured six rooms with no notice on the glass at
    all — asserts zero covered controls, and then drives one tap at a cell under the
    notice to prove the tap is not eaten.
    **Round-15 correction: it was parameterised by ROOM KIND and nothing else**, so
    `/manor` — a board that reads like a sheet screen — was never in the table at any
    player row, and the seal sat on the Sanctum door for four rounds with the gate
    green. The walk now takes `/manor` at rows **0, 3 and 5** at both viewports
    (the ground floor where the band is empty, a middle storey, and the landing), each
    with its own distinct grant, and drives one tap at "Approach the Sanctum".
    **A surface parameterised by the wrong variable is a surface the gate does not
    name.** Round 15 also gave this file back its exit code: it ended
    `process.exit(0)` unconditionally, so it could count its own failures out loud and
    still report green.
    **And the dusk veil belongs in the same family, in the sibling gate.** It is the
    only fixed layer in the app that renders a *tappable* control over a live surface,
    and `tests/modal-hit-test.mjs` — which enumerates the morning card, the morning
    conversation, the bare blueprint, the cabinet, a draft, a parlor conversation, the
    journal-with-a-seal and the victory ceremony — did not enumerate it. It does now,
    at both viewports, hit-testing every control in the blueprint's nav row at its
    centre and four inset corners and driving one tap at the Journal entrance. §0.4's
    walk list has named "dusk veil" since it was written; the gate and the list now
    agree. **[PARITY]**
