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
  - **4.10e — the volume is typically won in 14–28 days** of daily play (median), <2%
    inside the first week, >90% by day 35. Winning requires **both** gates independently:
    knowing the word (fragments) *and* reaching the door that day.
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
    player's days** (measured ~37%); **a solve makes a page out on ≥1 day in 3**
    (measured ~50%); and the tripwire — **a player who solves nothing makes out nothing**,
    all campaign, however many violet rooms she walks through. The supply side is the
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
    +2..+6, compounding hooks +1..+2, tea 0 → +11 across the friendship).
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
- 4.15 Journal: any document ever seen is re-readable in ≤2 taps from anywhere;
  fragments auto-grouped; zero information exists only in a transient scene. **[BEAT]**
- 4.16 Insufficient-info signaling: attempting the Sanctum with < X fragments gets an
  explicit sympathetic nudge, never silence; false leads are impossible to chase for
  more than one room without a character wrongness signal. **[BEAT]**
- 4.17 Wrong Sanctum guess: consumes only the daily guess, plays a sympathetic Portrait
  reaction (variant-keyed to closeness: shared letters / right length / repeat guess),
  and journals the guess so she can see her own elimination history. **[COZY]**
- 4.18 Volume solvable-in-principle from day 1 (answer fixed at volume start; no
  fragment mechanically required). **This criterion owns solvable-in-principle
  ONLY.** The solve horizon belongs to 4.10e (14–28 days median, <2% inside
  week one) — the pre-overhaul "median playtest solve lands in 2–4 evenings"
  clause was deleted in round 6: it contradicted 4.10e outright, so no critic
  could pass or fail the mystery's pacing and the economy and mystery owners
  were optimising against opposite targets. The shipped fragment drip is built
  for 4.10e and is now measured against it by
  `tests/volume-pacing.test.ts` (seeded campaigns through the real deck mix,
  letter grants and pity channel: median day-of-fragment-16 in 10–20, p10 ≥ 6).

---

## 5. Dialogue & characters vs Hades

### The system sees you
- 5.1 **Reaction latency**: every notable event (wrong guess, dry day, first fragment,
  quest step, pangram, perfect day) is referenced by at least one character at the next
  interaction opportunity — scripted test over 10 event types. **[BEAT]**
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
    with zero gutters (measured 43.3×43.3px). NYT Sudoku ships ~41px at this width. The
    exemption is safe because **nothing on the board commits anything**: touching a cell
    only moves a cursor, and every costed verb lives on a ≥44px pad key (59×52px), so a
    fat-fingered cell tap can never spend a step.
  - **(b) Full-width alpha keyboards** (Darkroom 27-key, Linen Closet QWERTY). Ruled
    floor: **≥32px wide × ≥48px tall with no inter-key dead zone** — iOS system keys are
    themselves ~32px wide, so shrinking to satisfy the number would make us worse than
    the benchmark in order to pass it. Measured 32.5×55.7px, inside the ruling.
  - Both classes must be **measured and recorded** every round (they are, in
    `docs/shots/*/metrics.json`) — the exemption is from the number, never from the
    measurement. *Round 7 (verifier): this ruling was requested by three separate passes
    and was being silently waived in the meantime, which is worse than either answer —
    a criterion no critic can pass or fail.*
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
   pins median 10–15 min, first Sanctum reach day 6–10, volume win 14–28 days (4.10).
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
  opt in are untouched. **[PARITY]**
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
