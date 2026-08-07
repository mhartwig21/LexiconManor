# Lexicon Manor — Design Document

*Working title. A cozy-detective word-puzzle roguelike: draft rooms to build a manor,
solve word games inside them, and piece together the mystery of a word that was erased
from every dictionary.*

**Status:** design approved for build. Supersedes the fork/diamond node-map run structure
from the v2 Phase 2–5 build. The puzzle engine, content pipeline, and presentation layer
from v2 carry over (see §10).

---

## 1. Pillars

1. **Cozy detective, never punishing.** A run ending is "the day is over," not a defeat.
   Progress is primarily *knowledge in the player's head*, plus warm permanent unlocks.
   The journal does the bookkeeping; the player gets the "aha."
2. **One currency: steps.** Exploration, puzzle mistakes, and puzzle rewards all move a
   single step budget. Tension is always "can I afford one more room?"
3. **Strictly 2D.** Top-down blueprint/parchment view at all times. No 3D camera, no
   first-person, no parallax that implies depth motion. (Player gets motion-sick.)
4. **The manor is a container for every word game.** Any word game, any size, can become
   a room archetype. The four existing modes are the anchor rooms; small new games fill
   out the deck.
5. **Characters make it a home.** A small recurring cast with Hades-2-style dialogue —
   portraits, evolving contextual lines across days, small choices — who are also the
   game's services (tea, hints, deliveries, trades).

## 2. Core loop (one "day" ≈ 10–15 minutes)

1. Morning: brief scene in the Entrance Hall (one character beat, e.g. tea with the
   housekeeper). Player starts with their step budget.
2. Walk to any closed door on the blueprint → **draft**: 3 room cards are offered. Pick
   one; the room is placed on the grid behind that door and you step in.
3. The room presents its **word puzzle**. Mistakes cost steps; solving pays out steps,
   gems, keys, and (in mystery rooms) clue fragments.
4. Repeat — push deeper, chase clues, visit characters — until steps run out or the
   player reaches and unseals the **Sanctum** at the top of the manor.
5. Night: journal updates, letters may arrive, permanent unlocks bank, the manor resets.
   (The mystery does not reset — see §7.)

## 3. The manor grid

- **5 columns × 7 rows.** Entrance Hall fixed at bottom-center; the **Sanctum** fixed at
  top-center, sealed. 33 draftable cells. (Smaller than Blue Prince's 5×9 to hit the
  10–15 minute day.)
- Rooms are 1×1 cells with door openings on 1–4 walls. A door drawn against the manor's
  outer wall or an existing wall is dead. Drafting is only offered at a door you're
  standing at, into an empty adjacent cell.
- **Rank pressure:** rooms drafted in higher rows draw from higher-tier puzzle pools and
  cost more gems for premium picks. This is the difficulty progression — it's spatial,
  visible, and chosen by the player.
- The blueprint view is the *only* view: parchment sheet, inked room outlines, the
  player as a small token. Entering a room zooms the flat blueprint to a room card /
  puzzle screen. Reuse the v2 parchment map art direction wholesale.

## 4. Step economy (first-pass numbers, all tunable)

| Event | Steps |
|---|---|
| Start-of-day budget | 40 |
| Enter a room (move one cell) | −1 |
| Puzzle mistake (wrong guess / invalid word) | −2 (tier 3 rooms: −3) |
| Solve a small room (micro-puzzle) | +3 |
| Solve a large room (anchor mode) | +6 to +8 |
| Perfect solve (no mistakes) | +2 bonus |
| Kitchen snack / Bramble's tea | green-room refills +2..+6 (Kitchen +6, Larder +5, Boot Room +3, Still Room +2; compounding hooks +1..+2) · tea 0 → +13 across the friendship |
| Petting Dewey (the cat) | −1 (worth it) |

- Steps never go negative mid-puzzle: a puzzle can always be *abandoned* (the room stays
  unsolved and yields nothing, no extra penalty — cozy, not cruel).
- Day ends at 0 steps with a gentle "dusk" transition, never a failure sting.
- Target (RETUNED, round 4 — see AAA 4.10a–f, which is the live spec): a decent day
  visits **5–8 rooms** and solves 2–4 puzzles in **10–15 minutes**; a great day reaches
  row 5–6, and the Sanctum row is a *campaign* event (first reached around day 6–10),
  not something refills buy on a Tuesday. Base budget is **18 steps**, and movement is
  priced per row (−1 on the ground floor rising to −5 up top), so the climb — not the
  puzzle count — is what a day is spent on.

**Other currencies** (secondary, all reset nightly except keys' meta-variants):
- **Gems** — spent to draft premium room cards and reroll a draft offer (1 gem).
- **Keys** — open locked doors and locked drawers found inside rooms.
- **Clue fragments** — the mystery currency; persist forever in the journal (§7).

## 5. Drafting

- 3 cards per draft. Each card shows: room name, door layout, puzzle type icon, tier,
  reward preview, and gem cost (0 for common rooms).
- **Reroll** once per draft for 1 gem.
- Room categories (color-coded on the card, colorblind-safe shapes as well):
  - **Puzzle rooms (blue)** — the word games; the bulk of the deck.
  - **Parlor rooms (yellow)** — a character is here; dialogue scene + their service.
  - **Utility rooms (green)** — economy: Kitchen (steps), Gem Vault, Key Cabinet.
  - **Mystery rooms (violet)** — rare; contain clue fragments, engravings, the
    lexicographer's effects. The reason to push upward.
- Deck composition shifts by row (higher rows: more violet/tier-3, fewer green).
- Meta-progression adds new room cards to the deck permanently (§8) — the collection is
  visible in the Chronicles as a "floorplan cabinet."

## 6. Room taxonomy — the word games

Anchor rooms (ported from v2 engine, one mode each):

| Room | Mode | Size |
|---|---|---|
| The Library | Word Web (Connections-style grouping) | Large |
| The Conservatory | Hive Builder (Spelling Bee + entropy) | Large |
| The Gallery | Twistle (grid word search) | Large |
| The Study | Forgotten Word (poetic definitions) | Large, rare — feeds the meta-mystery directly |

New micro-rooms (new engine modules, 30–90 seconds each). **Round 4 culled four of
the original six** — the Vestibule (anagram), Staircase (word ladder), Music Room
(rhyme chain) and Pantry (category sprint) were shallow, and shipping four thin games
cost more than it bought. Their engines, views, generators, pools and dialogue are
gone, not disabled. The surviving two are listed below, plus the round-4 addition:

| Room | Game | Status |
|---|---|---|
| The Darkroom | Simple substitution cipher over a short phrase | shipped |
| The Linen Closet | Mini crossword (3–5 clues) | shipped |
| The Counting House / The Strong Room | Sudoku on a 9×9 ledger leaf — expert baseline, three technique tiers | shipped (round 4; priced as an **anchor**, not a micro, despite living in `ui/rooms/micro/`) |

Micro-room content comes from the existing build-time content pipeline with new
generators + validators (same pattern as the hive/twistle generators: generated offline,
solver-verified, shipped as static JSON). The taxonomy is intentionally open — future
word game ideas become new room cards without touching the run structure.

## 7. The meta-mystery: the Forgotten Word

The manor belonged to a lexicographer who struck one word from every dictionary. The
Sanctum doesn't want a key — it wants the word *spoken* (typed).

- **Clue fragments** persist across days in the auto-collecting **journal**: lines of the
  word's poetic definition (the Forgotten Word content — the best writing in the game —
  now *is* the meta-puzzle), letter-constraint engravings ("the word shares no letter
  with CANDLE"), and character testimony.
- The answer is fixed for the whole **volume** — the moment she figures it out, she can
  march to the Sanctum and win, even on day one. Knowledge is the progression.
- **One guess per day** at the Sanctum door (prevents brute force; a wrong guess gets a
  sympathetic sigh from the Portrait, never a penalty).
- Solving a volume rolls the manor to a **new volume**: next forgotten word, new fragment
  set seeded from the content pipeline, some new rooms/characters beats. Volume 1 is
  hand-authored end-to-end; later volumes lean on the pipeline with hand-authored
  definition poems (Phase-6-style content work).
- **Cozy-detective tuning:** the journal groups fragments, cross-references automatically,
  and characters will nudge ("you might reread what the engraving in the Gallery said,
  dear") — the *deduction* is the player's, the *filing* is not. No wiki-bait obscurity.

## 8. Characters & dialogue (Hades 2 style, cozy cast)

**Interface:** portrait on the left, nameplate, typewriter text box, occasional 2–3
player choices. One substantial conversation per character per day (further visits get
short idle lines) — Hades-style contextual priority: first-meeting > reacts-to-recent-
event (found a fragment, solved their quest, guessed wrong at the Sanctum) > relationship
milestone > general pool. Dialogue is data (JSON nodes with conditions), not code.

**Affinity:** raised by conversations and by **gifting bookmarks** (a rare drop). Each
affinity rank unlocks a warmer service tier and a piece of mystery context. No romance
mechanics — this is found-family cozy.

The cast (each has a mechanical role so dialogue is never pure flavor):

| Character | Where | Role & service |
|---|---|---|
| **Mrs. Bramble**, housekeeper | Entrance Hall every morning | Tutorialization, daily tea (start-of-day step bonus scales with affinity), emotional anchor |
| **Ellery**, the ghost librarian | The Library & Reading Rooms | Lore of the lexicographer; at affinity ranks, *interprets* one journal fragment for you |
| **Posy**, the postmistress | Post Room; letters arrive overnight | Letters contain micro-puzzles and side-quest chains ("find me a word that means…") whose rewards are new room cards |
| **Fern**, the groundskeeper | Conservatory & garden rooms | Trades gems/keys; seeds that grow into a chosen room card tomorrow |
| **Dewey**, the manor cat | Random room each day | No dialogue, obviously. Petting costs 1 step and reveals whether this row hides a violet room. Sits on important documents |
| **The Portrait** (the Lexicographer) | Landing outside the Sanctum | The mystery's heart. Stern → softening as volumes progress; receives your daily guess; the closest thing to an antagonist, and ultimately the person you're healing |

**Why characters matter structurally:** they are the drip-feed for mystery exposition
(gated by affinity, not grind), the retention hook between days, and the tone-setters
that keep "roguelike" feeling like "coming home."

## 9. Persistence & progression

**Resets nightly:** manor layout, steps, gems, keys, room solve-states.
**Persists forever:** journal + all clue fragments, character affinity & dialogue seen,
floorplan cabinet (unlocked room cards), chronicles/stats, achievements, cosmetic manor
touches (flowers Fern plants, etc.), current volume state.

Permanent *power* progression stays gentle (this is a puzzle game, not a stat game):
mostly new room cards, small start-of-day step bumps from affinity, and quality-of-life
(journal tabs, Dewey's hint). Skill and knowledge do the heavy lifting.

## 10. What carries over from v2 (and what's replaced)

**Carries over as-is or near-as-is:**
- `src/engine` puzzle modes (Word Web, Hive, Twistle, Forgotten Word) — become room
  interiors behind a common `RoomPuzzle` interface.
- Content pipeline (`content/`) + validators — extended with micro-room generators and
  volume/fragment authoring.
- Parchment art direction, sound, victory juice, achievements, chronicles.
- localStorage save layer, Vite+React shell, vitest suite pattern.

**Replaced:** fork/diamond node map → 5×7 grid + drafting; health/defeat flow → step
economy + dusk flow; run-scoped perk/glyph loadout → review against the new economy
(glyphs likely become room effects or bookmark-style trinkets; decide during build).

**New systems to build:** grid/drafting engine, step economy, dialogue system (data-
driven, contextual priority queue), journal, volume/mystery state machine, letters,
micro-room engine modules + generators.

## 11. Out of scope (settled)

- Any 3D or camera motion. Any screen-shake beyond the mildest existing juice.
- Multiplayer, accounts, servers — local-first static SPA stays.
- Health/damage framing anywhere in copy or UI.
- Timed pressure as a core mechanic. (The Pantry sprint used to be the one playful
  exception; it was culled in round 4, so there is now no timed room at all.)

## 12. Open tuning questions (answer via wife-playtests)

1. ~~Day length: does 40 steps land in the 10–15 min window?~~ **Answered (round 4):**
   no — 40 steps ran long and made the manor trivially climbable. The budget is now 18
   with per-row movement pricing; measured median 11.2 min, p90 21.5 (AAA 4.10b).
2. Mistake cost: is −2 felt-but-fair in each mode? (Hive invalid words may need −1.)
3. ~~Volume 1 mystery difficulty: target "solved in roughly 2–4 evenings of play."~~
   **Answered (round 6):** the 2–4 evening target was a pre-overhaul number that
   contradicted the retuned campaign arc; AAA 4.10e owns the horizon (14–28 days median,
   <2% inside week one) and AAA 4.18 now owns only solvable-in-principle-from-day-1.
   The drip is measured against 4.10e by `tests/volume-pacing.test.ts`.
4. Dialogue volume: how many lines per character before Volume 1 needs a refresh?
5. Do glyphs/perks return, and in what form?
