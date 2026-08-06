# Round 5 — capture index

Fresh tour of the retuned game plus the live benchmark set.
Captured with Playwright driving **system Edge** (`channel: 'msedge'`), one browser
instance at a time, against `npx vite preview` on `http://localhost:4173/LexiconManor/`.

* **Primary viewport: 390 × 844 @2x** — every file in this folder.
* **Secondary viewport: 375 × 667 @2x** — `375x667/` holds the *same 41 filenames*
  (`01-front-step.png` … `41-chronicles-settings.png`). The benchmark shots
  (`50-` … `56-`) are 390 × 844 only, as asked.
* Scripts: `scripts/round5-capture.mjs` (the game tour) and
  `scripts/round5-benchmarks.mjs` (NYT). Both close their browser when done.

---

## Build caveat — read this first

`npm run build` is **RED**. `tsc --noEmit` fails before Vite ever runs: the
regenerated content pools no longer carry a `difficulty` field, but
`src/engine/types.ts` still declares it **required** on `WordWebPuzzle`,
`HivePuzzle` and `TwistlePuzzle` (lines 45 / 63 / 80). 13 errors across
`content/generate-*.ts`, `src/app/pools.ts` and four test files.

Consequence: `dist/` on disk was stale (built before the content regen), so the
served app was serving *older* puzzle pools. **These shots were taken against a
fresh `npx vite build`** (transpile only, no typecheck) so the tour reflects the
current source and the current content. Nothing else about the build was changed.

## How honest are the numbers on screen?

* **Shots 01–09 are a completely unseeded day 1.** Fresh save, real draft, steps
  burned by walking until dusk fell on its own. Day 1's budget really is
  **18 steps** (shot 04) and the day really did end at 0.
* **Shots 10–41 seed *placement*, never the step budget.** Rooms are written onto
  the manor so one sitting can reach every shipped room type, the upper storeys,
  a parlor, the journal and the Sanctum. Gems/keys are granted in shots 10–12 so
  a padlocked door can actually be opened. The **step meter is never touched**:
  it shows whatever the real day has left, and when a day runs out the tour
  sleeps through dusk/night and wakes into the next one (hence "Day 2" / "Day 3"
  in the headers).
* Two honest artefacts of that, worth knowing before you read the meter:
  * **shot 12 reads `0 steps`** — hunting across upper-storey doors for an offer
    with all three card kinds cost 12 real draft-opens at −1 step each. Dusk is
    waiting for the open draft to resolve, which is the shipped behaviour.
  * **the later room shots read 32–47 steps** — the tour solved seven anchor/micro
    rooms back to back inside one day and the solve refunds stack (+3…+7 each,
    plus +2 perfect). Because the rooms were seeded under her feet she never paid
    the movement cost that would price that climb in real play. Treat those
    numbers as a tour artefact, not as a day-3 budget.

---

## The tour (390 × 844, and the same files under `375x667/`)

### Honest day 1 — nothing seeded

| file | what it shows |
| --- | --- |
| `01-front-step.png` | The front step on a virgin save: title, the missing-word premise, "Begin the first day". |
| `02-morning-card.png` | Day 1 morning card — the framed "Day 1" plate and its line, before the character beat. |
| `03-bramble-morning.png` | Mrs. Bramble's morning scene over tea: portrait, nameplate, affinity pips, typewriter line. |
| `04-blueprint-day1.png` | **The real day-1 blueprint at 18 steps.** Entrance Hall, three gilt draft doors, the sealed Sanctum up top, tier bands + pips, and one padlock already legible below the Sanctum. Gems 0, keys 0. |
| `05-draft-modal-day1.png` | The genuine first draft: Library / Kitchen / Darkroom — all free, tier I ground floors, reroll priced at 1 gem, "Step back". |
| `06-first-room-entered.png` | The room drafted on day 1, entered straight off the draft (the first playable board of a fresh save). |
| `07-dusk-veil.png` | Dusk falling on its own after the budget ran out — the wordless veil and "And so, to bed". |
| `08-night-digest.png` | Night digest: rooms drafted / solved / steps spent / fragments found for day 1. |
| `09-day2-morning.png` | The loop closing — day 2's morning card. |

### Padlocks, the upper storeys and the draft (seeded for reach)

| file | what it shows |
| --- | --- |
| `10-padlocks-no-key.png` | Rooms placed up to row 4 so the upper landings are legible: **padlocks drawn shut, in quiet ink, keys 0** — no gilt handle on doors she cannot open. |
| `11-padlocks-key-in-pocket.png` | Identical manor, **2 keys in pocket**: the same padlocks now render *open-shackle and gilt* — the state change is carried by shape, not hue alone. |
| `12-draft-upper-row.png` | The draft on a **padlocked** tier-III door. Shows all three asks at once: the lock line ("This door was padlocked · placing a room spends 1 key"), a **common/free** card (The Counting House), a **premium** card (The Orangery, 1 gem), and a **locked-row-only** card (The Boxroom, rare, tier III, 2 gems). Meter reads 0 — see the caveat above. |

### Characters, journal, Sanctum

| file | what it shows |
| --- | --- |
| `13-parlor-dialogue.png` | A parlor visit with Ellery in the Reading Nook — portrait, affinity pips, and a **branching choice pair** ("A pleasure, Ellery." / "You're… a ghost?"). |
| `14-journal-fragments.png` | The journal with 7 fragments filed: the six-slot word frame, the recovered definition lines, the struck alphabet plate, and the derived "Six candles — 6 letters" constraint. Tabs (Engravings / Testimony / Letters) carry unread dots. |
| `15-journal-scrolled.png` | The same journal scrolled to its lower half — cross-references and Ellery's interpretation offer. |
| `16-sanctum-before-guess.png` | The Sanctum door before a guess: the Lexicographer's portrait, "the door will hear one word today", the input + Speak, and the fragment count link. |
| `17-sanctum-after-wrong-guess.png` | Immediately after a wrong word (CLOISTER): the door's caption flips to "Today's is spent", the guess is struck through, and the **Portrait's authored sigh** types out keyed to closeness ("Wrong. And yet the hinges shifted…"). |
| `18-sanctum-guess-struck.png` | The settled after-state once the sigh is tapped through — the elimination list standing as her own record. |

### Every shipped room type, in play / mistake / solved

| file | what it shows |
| --- | --- |
| `20-library-play.png` | **The Library** (word-web). One thread already woven into a banner, a fresh two-tile selection on the board. |
| `21-library-mistake.png` | Library mistake: four words that cross threads — shake, and the priced refusal toast. |
| `22-library-solved.png` | Library solved: all four banners in tier order with themes named, "Woven." + warm graded copy. |
| `23-conservatory-play.png` | **The Conservatory** (hive). Rank ladder with points-to-next, found chips, the hive in the thumb zone. |
| `24-conservatory-mistake.png` | Conservatory mistake: legal letters, not in the lexicon — shake + "Not in the lexicon · −1 step". |
| `25-conservatory-solved.png` | Conservatory at Full Bloom, with the still-folded silhouettes (lengths + first letters, never spoilers). |
| `26-gallery-play.png` | **The Gallery** (twistle). Two works hung as chips, a third trace part-built on the grid. |
| `27-gallery-mistake.png` | Gallery mistake: a real path that isn't a word — "CSNO isn't in the lexicon", and the miss is remembered struck-through so she never re-derives it. |
| `28-gallery-solved.png` | Gallery solved — "The gallery is hung", every claimed word popped in. |
| `29-study-play.png` | **The Study** (forgotten word, tier III only). The definition card, letter count, whispers remaining, the two sealed clues and their step prices. |
| `30-study-mistake.png` | Study mistake: a wrong whisper of the right length — shake, whispers-left countdown, the step cost stated. |
| `31-study-solved.png` | Study solved — the word returning to the page letter by letter. |
| `32-darkroom-play.png` | **The Darkroom** (cipher). Half the truth table pencilled, "n of m letters penciled", the 27-key pad, the two verbs. |
| `33-darkroom-mistake.png` | Darkroom mistake: a full print developed with one letter wrong — "Still murky — n of m letters ring true · −N steps". |
| `34-darkroom-solved.png` | Darkroom developed: the plaintext coming back to the light. |
| `35-linen-closet-play.png` | **The Linen Closet** (mini crossword). One entry folded away; all clues visible at once above the in-view keyboard. |
| `36-linen-closet-mistake.png` | Linen Closet mistake: the grid filled with one wrong square — the auto-check refuses and prices it. |
| `37-linen-closet-solved.png` | Linen Closet solved — "Neat as new linen." |
| `38-counting-house-play.png` | **The Counting House** (sudoku). Six figures inked, one cell carrying free pencil marks, Normal/Candidate tools and the figure pad. |
| `39-counting-house-mistake.png` | Counting House mistake: a guaranteed contradiction inked — it costs, and the refused figure never lands on the leaf. |
| `39b-counting-house-solved.png` | Counting House balanced — "The ledger balances", with the technique read-back ("Expert leaf — it turned on a naked pair"). |

### Chronicles

| file | what it shows |
| --- | --- |
| `40-chronicles.png` | Chronicles: lifetime totals (days / rooms solved / fragments / keepsakes), the day ledger with cause + rooms + steps for days 1 and 2, and the household settings block. |
| `41-chronicles-settings.png` | Chronicles scrolled further — settings, the travelling trunk (save-code export/import) and the "Beneath the floorboards" storage panel. |

### 375 × 667 note

The `375x667/` copies are the same beats. One difference worth looking at:
in `375x667/38-counting-house-play.png` the 9×9 leaf is taller than the glass
allows, so the bottom rank of cells is clipped by the pinned deck (the stage
scrolls, so it is reachable — but the board is not wholly visible at rest, which
no other room does).

---

## The live benchmarks (390 × 844)

Each game gets three frames: `-a-landing` (what the URL actually serves cold),
`-b-board` (after consent + house ad + onboarding are dismissed),
`-c-typed` / `-c-selected` (the board in play).

| file | what it shows |
| --- | --- |
| `50-nyt-spelling-bee-a-landing.png` | Spelling Bee cold: NYT's **Ethyca "Fides" GDPR interstitial** ("Manage privacy preferences", 335 vendors) covering the whole glass. |
| `50-nyt-spelling-bee-b-board.png` | Past consent and the full-page house ad — the free Spelling Bee board. |
| `50-nyt-spelling-bee-c-typed.png` | Spelling Bee in play: rank ladder ("Beginner 0"), "Your words" drawer, live entry with the centre letter coloured, hive + Delete / Shuffle / Enter. Persistent **"Subscribe to play the full game"** ribbon pinned at the bottom. |
| `52-nyt-connections-a-landing.png` | Connections cold (note: `/puzzles/connections` is dead — "This page no longer exists"; the live URL is `/games/connections`). |
| `52-nyt-connections-b-board.png` | The Connections board, with the **"Connections badges … with a free NYT account"** tooltip sitting over the top row. |
| `52-nyt-connections-c-selected.png` | Connections in play: four tiles selected (filled dark), "Mistakes Remaining ●●●●", Shuffle / Deselect All / Submit — Submit only becomes solid at exactly four. |
| `54-nyt-wordle-a-landing.png` | Wordle cold — the onboarding/how-to gate. |
| `54-nyt-wordle-b-board.png` | The empty Wordle grid and keyboard. |
| `54-nyt-wordle-c-typed.png` | Wordle with a first guess typed (CRANE) before submit — six rows, in-view QWERTY, "Subscribe to Games" the only upsell. |
| `56-nyt-sudoku-hard-a-landing.png` | `nytimes.com/puzzles/sudoku/hard` cold — the same Fides consent interstitial. |
| `56-nyt-sudoku-hard-b-board.png` | The hard board after consent + house ad + tutorial dismissal. |
| `56-nyt-sudoku-hard-c-selected.png` | Sudoku in play: difficulty + running timer with pause, row/column/box highlight on the selected cell, Normal/Candidate toggle, Undo, 1–9 pad + erase, Auto Candidate Mode. |

### Paywall notes

* **Nothing in this set was hard-paywalled.** All four are playable free, without an
  account, at these URLs on this date.
* Every NYT game sits behind **three** gates before first play: the Fides GDPR
  consent interstitial → a full-page "Continue to <game>" house ad → the game's own
  onboarding modal. All three were dismissed; the consent step required clicking
  `.fides-accept-all-button` (a `<button>` whose label is a nested `<span>`, and
  which ships as two copies — one hidden banner, one live modal).
* **Spelling Bee is soft-walled**: free play is capped, and a permanent
  "Love Spelling Bee? Subscribe to play the full game" ribbon occupies the bottom
  of the glass (visible in `50-…-c-typed.png`). Wordle, Connections and Sudoku
  showed only a "Subscribe to Games" chip in the header.
* **Connections** additionally pushes a free-account tooltip over its top row on
  first load (`52-…-b-board.png`); it does not block play.
