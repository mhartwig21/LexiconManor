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
  semantic clusters). Zero unintended complete groupings ship; planted herrings ≤3, each
  a 5th-member or cross-category trap, never a fully-valid fake group. **[BEAT]**
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
- 4.10 **The campaign arc** (rewritten from the 2026-08 owner playtest: *"way too easy —
  I reached the Forgotten Word on my first day; Blue Prince took me 28 days"*). The
  economy is a push-your-luck **climb** whose ceiling rises across weeks, and every
  number below is verified by `tests/economy-simulation.test.ts` over thousands of
  seeded days and hundreds of seeded multi-week campaigns played through the real
  `STEP_TABLE` + ledger — **before** any playtest, and re-run on every tuning edit:
  - **4.10a — the no-refund day.** Skipping every puzzle tops out on the middle floors
    (median row 3–5, never the Sanctum row) and is over in **2–5 minutes**. Refunds are
    what buy a real day.
  - **4.10b — the decent day is 10–15 MINUTES at the median, p90 ≤ 23.** Not 20 (the
    pre-overhaul measurement) and not 29 at p90; measured median ~11.6, p90 ~21.5
    (round 5: the day-1 pot and the lifted low tea ranks moved the median up from
    ~11.2). That is **5–8 rooms** with 2–4 puzzles
    actually solved — the post-cull deck is anchor-heavy, so fewer rooms *is* the same
    amount of game. The simulation's clock must be calibrated against the **live deck
    mix** (`deckMixAt` derives category and micro/anchor shares from `BASE_DECK` ×
    `categoryWeight` × `RARITY_WEIGHTS` × the room-adapter registry, so sudoku's
    Counting House counts as anchor-weight and a future deck edit breaks the test
    rather than the owner's evening).
  - **4.10c — a great single day flirts with the top, it does not own it.** A sharply
    played day reaches row 5–6; the **Sanctum landing** is reached on **<25%** of even
    great days. Standing at that door is a campaign event, not a Tuesday.
    **Round 6 correction:** these clauses said "the Sanctum row", and the simulation
    measured row 7 — a row the player never stands on, because row 6 (0-based row 5)
    is the *landing* where the sealed door is, and row 7 is the Sanctum behind it.
    The arc was therefore verified against a storey nobody enters; at the live
    landing the old tables gave 41.5% day-1 reach against a published <8%. The
    milestone row is now `SANCTUM_LANDING_ROW`, tied to `SANCTUM_DOOR_CELL.row`, and
    `tests/economy-simulation.test.ts` asserts the identity so the two can never drift
    apart again.
  - **4.10d — a skilled player FIRST REACHES the Sanctum landing on day 6–10** (median),
    **<8% on day 1**, and >90% of campaigns get there by day 21. A bare, perfectly
    efficient ascent must cost **more than the entire base day budget**
    (`reserveToTop(1) > BASE_DAY_BUDGET`, measured **to the landing**: **22 > 18**, i.e.
    `1+2+3+7+9`), so the top is always bought with refunds. *Round 7 (verifier) — that
    number read 21 in this clause and in `steps.ts`'s own file header, stale since round
    10 moved `MOVE_COST_BY_ROW[4]` from −6 to −7 and updated only one of the three places
    quoting the sum. The test asserted `> BASE_DAY_BUDGET` and `>= BASE_DAY_BUDGET + 2`,
    both of which stay true through the drift — which is exactly how the round-6
    "verified against a storey nobody enters" defect survived in the docs.
    `tests/economy-simulation.test.ts` now pins the **exact** value, so any movement
    retune has to update this line consciously instead of silently outdating it.*
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
    skilled player of 4.10d** (median; measured 15 on all four campaign seeds,
    p10 13, p90 18), **<3% inside the first week** (measured 0%), 0% on day 1,
    100% by day 28. Winning requires **both** gates independently:
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
    - **the skilled player** (4.10d's): first landing day 6–10, volume won at
      median **12–20** (round 21; was 8–16, and 14–28 before that), 100% by
      day 28.
    - **the median player** (`PROFILE_DECENT`, 4.10b's): first landing at median
      day **12–20** (measured 16–18, 0% never inside 45 days), the word
      deducible at median day **14–24** (round 21, was 10–20; measured 18),
      the volume won at median day **18–28** (round 21, was 14–24; measured
      21–22 across the four campaign seeds, p10 17, p90 29), <2% inside the
      first week (measured 0), **>80% inside 45 evenings** (measured 100%), and
      her evening stays inside 10–15 minutes start to finish (4.10f).
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
  - **4.10f — sessions never inflate.** The median day stays inside 10–15 minutes for the
    whole campaign: the tea arc's extra budget goes into the *climb* (cheap in minutes),
    never into more puzzles per evening.
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
  - **Levers, in the order they were pulled** (all in `engine/economy/steps.ts`, the one
    tunable file): per-row movement pricing (`MOVE_COST_BY_ROW`, −1 ground floor → −9 up
    top — *climbing is the expense*); leaner-as-you-climb refunds (anchor +6/+5/+4, micro
    +3/+3/+2 — a tier-3 solve no longer funds the storey that reached it); a lean base
    budget (18); locked upper-row doors (`DOOR_LOCKS`, **rows 4–5 carry the gate at
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
  player since round 21, 18–28 for the median player, <3% inside week one) — the pre-overhaul "median playtest solve lands in 2–4 evenings"
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
    inside (b). The arithmetic that forces it: the cipher's longest phrase is 41 letters
    with an 8-letter longest word, and a 44px slot needs ~2 more ranks, which pushes the
    print — the primary solving channel, since the read is letter-frequency across the
    whole phrase — off the glass. The crossword is 5 squares plus a 3-row 48px QWERTY
    plus a clue row plus the room's verb inside a 481.6px stage at 375×667.
  - All three classes must be **measured and recorded** every round — the exemption is
    from the number, never from the measurement. *Round 7 (verifier): this ruling was
    requested by three separate passes and was being silently waived in the meantime,
    which is worse than either answer — a criterion no critic can pass or fail.*

  **MEASURED, ROUND 8** (`scripts/r8-tap-targets.mjs`, real Edge, effective tap target
  derived by hit-testing outward from each control's centre, so `::after` extenders and
  inter-cell dead zones are both caught — a bounding-rect read cannot tell them apart):

  | control | clause | 390×844 (css / effective) | 375×667 (css / effective) |
  |---|---|---|---|
  | `.ch-cell` ledger cell | (a) | 43.3×43.3 / 43×43 | 39.7×39.7 / 39×39 |
  | `.mic-key` Darkroom key | (b) | 32.5×55.7 / 34×56 | 33.7×48.0 / 34×48 |
  | `.lc-key` Linen QWERTY key | (b) | 32.5×50.5 / 34×52 | 33.7×48.0 / 34×48 |
  | `.dk-cell` cipher slot | (c) | 31.2×47.3 / 38×54 | 30.0×38.0 / 36×44 |
  | `.lc-cell` crossword square | (c) | 48.6×48.6 / 50×49 | 34.1×34.1 / 35×35 |
  | `.ch-pad` ledger pad key | none | 59.0×52.0 | 57.3×44.0 |
  | `.mic-btn--primary` Darkroom verb | none | 150.5×44.0 | 150.5×44.0 |
  | `.lc-clue` clue row | none | 336.8×44.0 | 328.2×44.0 |

  Both keyboards are inside (b)'s floor at both viewports — including the 48px height,
  which round 12 found them under and fixed. **Zero costed controls are under 44pt on
  any surface at either viewport.** *Round 8 correction to the record: a round-13 pass
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
