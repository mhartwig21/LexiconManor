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
- 4.10 A no-refund day (skip all puzzles) reaches row 4–5 and ends in ~5 min; a
  competent day (70% solve rate at listed payouts) reaches row 6–7 in 10–15 min —
  verified by economy simulation.
- 4.11 At least two rooms/services implement *compounding* refunds (BP's Nursery
  pattern: "+N per future X") and at least one cross-day investment exists (Fern's
  seeds; a tea variant).
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
  fragment mechanically required); median playtest solve lands in 2–4 evenings.

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
  bounding-box audit). **[PARITY]**
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
2. **Day length**: does 40 steps land 10–15 min? (Simulation first — criterion 4.10 —
   then playtest.)
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
