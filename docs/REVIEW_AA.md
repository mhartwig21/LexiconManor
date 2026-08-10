# Lexicon Manor — Editorial Review

*Synthesis of two independent hostile reviews (A: player experience; B: systems and craft), adjudicated against the source and against a live build at 390×844@2x. Where the reviewers disagreed I went and looked. Where they agreed and were wrong, I say so. Where they agreed and were right, I have not softened it.*

**Editor's evidence:** `dist` rebuilt from HEAD (see §0), driven in Edge via Playwright at 390×844@2x; screenshots in `C:\Users\hartw\lexicon-loop-v2\.editor\shots\`. Content claims re-counted from `content/generated/*.json` and `content/authored/`. Code claims verified in `src/engine/`.

---

## 0. Before anything else: both reviewers reviewed a stale build

`npm run build` is **red at HEAD**:

```
src/ui/rooms/anchor/WordWebView.tsx(147,44): error TS2532: Object is possibly 'undefined'.
src/ui/rooms/anchor/WordWebView.tsx(147,64): error TS2532: Object is possibly 'undefined'.
```

`build` is `tsc --noEmit && vite build`. When `tsc` fails, `vite build` never runs — and `vite preview` then cheerfully serves the **stale `dist/` already sitting in the repo**. Reviewer B's stated procedure was exactly `npm run build` → `vite preview`.

The fingerprints confirm it. Both reviewers reported that the Word Web victory screen prints "Perfect!" twice. It does not. `WordWebView.tsx:80` carries the fix and names the old string in its own comment:

> `// ROUND 16 (AAA 2.14): this used to read 'Perfect! Every thread true.' and`
> `// sat directly under the title 'Perfect!' …`

Live at HEAD it reads **"Perfect!" / "Every thread true, first time."** Reviewer A's cited line numbers (`:77`, `:332`) are ~20 lines off current source. B's content counts are consistently 2–5% under current (162/648 word-web boards/groups against a current 156/624; Portrait 29 nodes/39 lines against a current 33/43; Bramble 159 lines against 161).

**This is the highest-leverage thing in the document and it is not a game problem.** The team's review loop is measuring yesterday's game. Fix the two type errors, and make `preview` refuse to serve a `dist` older than `src`. Every finding below was re-verified against HEAD; the stale-build caveat is why.

---

## 1. The verdict

# **5 / 10**

I am not averaging A's 6 and B's 5, and I am not splitting them. Five is the number.

Lexicon Manor is a genuinely well-written, unusually well-engineered game whose loop does not work, and a daily game is its loop. The prose is real — not "good for a hobby project," good. The Journal is the best detective board I have seen on a phone. The engineering discipline in `src/engine/` is better than most funded studios ship: the source contains its own audit history, its own economy simulation, and tests that fail the build when authored content drifts from the numbers the design publishes. I want to score that.

But the game's own simulation, in its own source comments, says that for `PROFILE_DECENT` — the profile whose docstring calls it "the MEDIAN evening… i.e. the owner" — the player first reaches the Sanctum door at **median day 18–21**, that **10–14% never reach it inside 45 days**, that the volume is won at **median day 33–34**, and that **25% of campaigns are unfinished after 45 evenings**. Against a design that targets 14–28 days for Volume 1. The central verb of the game is, by the team's own measurement, unavailable for the first three weeks.

And two independent hostile players, playing separately, both stopped wanting to open it on day 3. That is the single most important datum available about a daily habit game, and it arrived twice.

What keeps it off a 4 is that the architecture is already right in the places that matter most. B's headline — that the word games and the mystery are strangers — is **factually wrong**, and I verified it live: on day 1, in the first room, a perfect Word Web solve filed *"An engraving, taken down — Filed in the Journal · Engravings."* The solve channel exists. The seal mechanic exists (entering a violet room files a sealed page; solving a word game makes pages out). The constraint chain is real deduction design and it resolves to exactly one word. This is a 5 that is a **content-routing job and an access-gating job** away from a 7 — not a rewrite. That is rare and worth saying plainly.

**What a 10 looks like for this game.** Every evening, competent play files at least one line of the lexicographer's own definition — the beautiful ones, the *"Where a thing is missing, I am what remains"* register — and it arrives *because I solved something*, not because the deck rolled violet. The manor I draft has a shape I chose and can point at, and something about it survives the night. The puzzles are about him: the Library board is drawn from his index cards and one of its four threads is a clue; the cipher decodes to his marginalia, not to *"a bird in the hand."* And when I know the word, I can walk to the door and say it **that day**, and the Portrait's reaction is the reward for the climb — being turned away is content, being unable to walk over is not. A 10 is the game where deleting the manor breaks the puzzles and deleting the puzzles breaks the mystery. Right now you can delete either and the other is unharmed.

---

## 2. Sub-ratings

| Category | Rating | One line |
|---|---|---|
| **The word puzzles themselves** | **5** | Individual authored boards are NYT-grade, but 67% of shipped groups are one of eleven mechanical templates and the difficulty colours are decorative. |
| **The drafting / manor layer** | **3** | 7 of 30 cards can *only* be dead ends and 13 can roll one; the manor comes out a corridor, nothing survives the night, and the three draft doors are labelled nearly identically. A was right, B was generous. |
| **The mystery** | **5** | The constraint chain is real, designed, and resolves to exactly one word — and 15 of its 17 fragments are routed through the rarest rooms in the deck. |
| **Characters and writing** | **7** | The prose is an 8 and the character *system* is a 6: 14,338 words, contextual selection that verifiably works, and **20 player choices in the entire game**. |
| **Presentation and feel** | **5** | The typography is the best craft signal in the build; it is set on pages with 250–500px of dead parchment, and three rooms in it starts borrowing other products' palettes. |
| **Onboarding and first hour** | **6** | Taught entirely through fiction with no popups — genuinely good — and it ends with steps unspent and nothing to want. |

---

## 3. What works

These are the things the comparators would respect. They are not consolation prizes.

**The writing has a voice and it does mechanical work.** Bramble: *"Your room is the one that stays put — I insisted, and the house respects a woman with a mop."* Ellery: *"fiction sulks by the window, reference never sleeps, and the poetry cases are load-bearing. Do not test that last one."* Posy: *"Rule the fourth: if Dewey is asleep on a parcel, the parcel waits. I fought that battle in '61 and the scars are administrative."* Both reviewers independently quoted different lines and both were moved by the gift scene. That is not an accident.

**The Journal is the best screen in the game.** Six empty letter slots, an alphabet plate labelled *"The alphabet, as the engravings leave it,"* recovered definition lines in italic, Ellery's gloss in a green-ruled margin, and a live A–Z elimination grid that lights green as constraints land. It looks like a page someone kept.

**The constraint chain is real deduction design.** Filtering the dictionary by the six authored constraints in reveal order: 6 letters → 15232; shares no letter with WORDSMITH → 298; starts with L → 22; one letter twice → 11; vowels A-U-A → 2 (LACUNA, LAGUNA); contains C → 1. The last fragment exists purely to break the tie. Someone thought hard about this.

**The solve→mystery channel and the seal exist, and they fire.** Verified live on day 1: a perfect Word Web filed an engraving into the Journal. `engine/volume.ts` implements two strict channels (the Study pays definition lines; every other puzzle room pays engravings) plus a legibility system where entering a violet room files a *sealed* page and solving a word game deciphers 1–3 of the backlog. B denied this exists. It exists. It is starved, which is a different and more fixable problem (§5.1).

**Four mechanical inventions better than the thing they borrow from.** The Word Web's last group asks you to *name the thread* from three plausible decoys rather than handing it to you — I saw *"___ MATE / Add an 'R' for a New Word / Can Follow 'SHOW'"* and had to think. Wrong guesses return *"Two of these share a thread"* — graded, better than NYT's binary "one away." The blueprint stamps the row-price gutter (−1, −1, −2, −3, −7, −9, −9) down the margin so the climb is legible before you commit. Draft cards read *"1 step to look, 2 in all if you take it"* and *"you enter from the south — no other door: this room seals itself."* That is honest UI, and honest UI is rarer than good UI.

**Onboarding through fiction, not popups.** Posy's day-1 letter teaches both core rules in character. The Journal's empty states do the same: *"Not one line of it recovered yet. The violet rooms keep his torn pages."* No tooltip, no "TAP HERE."

**The engineering is genuinely disciplined.** The economy has a simulation harness that caught its own authors twice — Round 11 found that violet rooms appeared on 9.5% of median days because a rarity table contradicted a category ramp; Round 12 found that every published campaign target had been measured on the wrong player profile. Both corrections are in the source with the numbers. The Forgotten Word pool (113 entries, three registers each) is publishable puzzle writing. The "Erase everything" confirmation itemises exactly what dies and offers to pack a copy first — better than most shipped commercial software.

---

## 4. Adjudications — where the reviewers disagreed

Recorded because the team should know which reviewer to trust on which axis.

**The Gallery. B was right; A was wrong, and importantly wrong.** A described a 5×5 grid with no theme as opaque staring. B cleared it in twenty seconds with five throwaway four-letter words. The data settles it: tier-1 Twistle puzzles ship `targetCount: 5` against a mean **106-word** valid pool at `minLength: 4` (tier 2: 7 of ~88; tier 3: 6 of ~32 at minLength 5 with centre required). Any five of a hundred. A read the room as a Strands-alike where the theme is the puzzle; it is not, and the consequence is worse than A's version — the Gallery is the highest-EV room in the game and the rational player farms it and never touches the hive.

> **ANSWERED, round 26.** The boards were regenerated against this paragraph. Tier 1 now asks 5 of a median **23** (need/pool 0.047 → 0.217) and the fifth-commonest findable word on it sits at frequency rank **2,581** rather than 305 — B's five throwaway four-letter words are not on the board any more, because `minLength` is 5 at every tier and every target's straightest trace turns at least once. Tier 2 asks 6 of 21 with the centre-tile rule brought down from tier 3. What did NOT happen is the obvious fix: the ask did not rise (tier 2's fell). A word search is not a puzzle because it is long, and the manor's clock could not have paid for a longer one anyway (see `docs/STATUS.md`). The Gallery is also no longer the highest-EV room: its wage fell 4.000 → 3.200 steps a minute, which is the cozy floor rather than a price, and three of 4.10h's four published spreads fell with it.

**The journal drip. Both were right, and neither saw why.** A had definition lines by day 3 and deduced LACUNA on day 1. B had **zero** definition lines after four days and only two constraints. Both are true because fragment delivery is keyed to *room category*, not to a schedule. All six definition lines route through mystery-category rooms or The Study; the only two fragments an ordinary puzzle solve can ever pay are engravings #2 ("six letters") and #8 ("begins with L") — which is *exactly* what B's journal contained. A drew violet rooms; B did not. **The mystery's pace is a deck lottery with enormous run-to-run variance, and the two reviews are the two tails of that distribution.** This is the most important finding in the document and neither reviewer reached it alone.

**"Solving never advances the mystery" (B's headline). Wrong.** See §3. B misattributed his own two engravings to walking rather than to solving. The channel is real; B never hit its floor because the channel's authored stock is two fragments deep.

**"Mistakes barely register" (A). Overgeneralised.** A's evidence was the Gallery and the hive, where mistake weight is **0 by explicit design** — `twistle.ts:6` ("the Gallery's pressure is its targetCount, not step taxes"), `hive.ts` ("spam-guessing is the fun"). But the Word Web charges −2 per wrong group; I paid −4 in one board live. This is a deliberate, defensible split that A read as a bug. A's *conclusion* still holds for a different reason (§5.8): the day never gets tight.

**Word Web quality. Both were half right, and the truth is worse than B's number.** A called the construction NYT-grade; the boards I drew justify it — `web-d22` runs BRASS ___ (neck / band / tacks / monkey) against *Instruments in a Brass Band*, with BAND as the trap, and it is a lovely board. But across the shipped pool: **420 of 624 groups (67.3%)** are one of eleven mechanical templates — Contains ×98, ___ X ×90, Rhymes ×88, Silent letter ×39, Add a letter ×26, Hidden ×24. B said 56%; it is 67%. My first live board carried **two** "Contains" groups (OWN and RAM) at different difficulty bands. B's "70% of boards repeat a template" is overstated — the real figure is **23.7%** — but B's underlying claim is vindicated and then some.

**Difficulty bands. B was right.** "Contains X" is tagged green 48×, blue 33×, yellow 13×, purple 4×. "Rhymes with X" spans all four. The colour predicts nothing, so the reveal — the moment the board should pay off its structure — is noise.

**Deck composition. A was exactly right.** 30 cards; **7 can only ever be dead ends** (Study, Strong Room, Larder, Gem Vault, Archive, Observatory, Boxroom); **13 can roll one**. A's numbers are precise.

**Draft-door labels. B was nearly right.** Not three identical labels — two read "Draft a room on the ground floor — 1 step" and one "on the half landing." Then the half-landing door opened a modal headed *"Three floorplans for the ground floors."* The labels still tell you nothing about the decision, and one of them is wrong.

**Both reviewers' data is otherwise sound.** B's crossword figures are exact: 90 puzzles, 360 entries, **155 unique clues, 115 unique answers**, SUN ×12, CAT ×11, ASH ×10. B's "20 player choices" is exact: Bramble 4, Ellery 6, Fern 4, Posy 4, Portrait 2, Dewey 0. Trust A on the player's felt experience and the shape of a day; trust B on content and systems.

---

## 5. The ranked improvement list

Ordered by how much the game gains per unit of work. Items 3–5 are cheap and unblock measurement of everything else.

---

### 1. Route the good writing through the puzzles — the solve channel is two fragments deep

**Problem.** The integration exists and is starved. Volume 1 authors 17 fragments. Sorted by what can actually pay them:

| Route | Fragments | Requires |
|---|---|---|
| Lintel channel (any puzzle room solve → engraving) | **2** | nothing |
| Study channel (Study solve → definition line) | 3 | The Study: tier 3 only, `rarity: 'rare'`, `gemCost: 2` |
| Violet draw (enter a mystery room) | 8 | drawing a mystery card |
| Parlor testimony | 4 | meeting a character |

**Evidence.** `STUDY_CHANNEL`/`LINTEL_CHANNEL` in `engine/volume.ts` match strictly on `(category, kind)` with **no fallback** — by design, so an unauthored channel pays nothing rather than draining the violet drip. Volume 1 authors only engravings #2 and #8 as `sourceRoomCategory: "puzzle"`. So from roughly day 2 onward, solving every word game in the manor advances the mystery **zero**. The team's own simulation measured the consequence: *"a solve made a page out on 0.23 of days."* Fewer than one day in four. Reviewer B lived exactly this and concluded the channel did not exist — which is the most damning possible review of a mechanic that does.

All six definition lines — the best prose in the repository, the *"In my mother Latin I was a little pool"* register — are behind violet draws and a rare tier-3 room. The game is choosing not to give the player its best writing.

**Done looks like.** Re-label fragments in `volume-1.json` so that the *ordinary* puzzle rooms carry the spine: at least one definition line reachable by a normal anchor solve on day 1, and enough puzzle-sourced stock that a competent evening files something legible **every day for the first two weeks**. The instrument already exists — this is a JSON authoring pass, not an engine change. Target the sim at `legibleDays` ≥ 0.9 for `PROFILE_DECENT` over the first 14 days, and pin it in `tests/volume-pacing.test.ts` so it cannot drift back.

---

### 2. Decouple the guess from the climb

**Problem.** Knowledge is available on day 1; access to the door is a compounding lottery that the game's own model puts three weeks out.

**Evidence.** `atSanctumDoor` requires **both** standing on the landing cell **and** having drafted a card there whose north door matches the Sanctum's sealed south one. `SANCTUM_ARC` documents the odds: the median player stands on the storey below the landing *"about one evening in twelve"*; even at the landing, P(the 3-card offer contains a north-opening plan) is **~0.61 bare deck**, warming toward 0.9 only after **30 survey evenings**. The campaign numbers follow: first landing median day 18–21, 10–14% never inside 45 days, volume won median day 33–34, 25% unfinished at 45. Reviewer A deduced LACUNA on **day 1** and was still stranded at row 5 on day 3 with 15 steps against a door costing 2 keys and 16 steps. Neither reviewer saw the Sanctum in four days. `SANCTUM_GUESS_COST` is already `0` — the guess is free; the *walk* is the wall.

**Done looks like.** The Sanctum door is addressable from the Entrance Hall every day, at zero or near-zero step cost. The climb buys **fragments and the Portrait's attention**, not permission. A wrong guess on day 2 becomes a scene — the Portrait has 33 nodes and 43 lines of authored reaction that almost nobody will ever see. Keep the mercy system as a floor, but it should stop being the primary path. Success metric: the day a player first *says a word at the door* drops from median 18–21 to median ≤ 3.

---

### 3. Persist in-room progress (and stop charging for work you delete)

**Problem.** Board state lives in React state and is not saved. Step penalties already paid are saved.

**Evidence.** Verified live, not inferred: in the Library I solved *Types of Cake*, paid −4 in wrong-group penalties (20 → 16 steps), reloaded the tab, and got back sixteen unsolved tiles **and 16 steps**. The architecture confirms it — `ActiveRoomRef` is `{ cellKey, kind, puzzleId, tier }` (`engine/types.ts:357`), `SaveV2` has no room-progress field, and the session lives in `RoomHost.tsx`'s `useState`. This is a phone PWA whose front page promises *"Nothing here can be lost"* and whose `app/platform/persistence.ts` opens with *"The save is the product."* iOS evicts backgrounded tabs routinely.

**Done looks like.** Serialise adapter state into the save keyed by `cellKey`; restore on mount. Reload mid-board returns the exact board, the found words, the struck-through guesses and the ladder rung. Add a test that reloads mid-room and asserts identity.

---

### 4. Guard the re-solve exploit — it prints steps *and keys*

**Problem.** A solved room can be solved again, indefinitely, for full payout.

**Evidence.** In `app/slices/room.ts`, the `case 'solved':` branch pays `STEP_TABLE.solve`, the perfect bonus, and `solveKeys(tier)` with **no check on `placed.solved`** — it *sets* `solved: true` four lines later but never reads it. It also calls `markPuzzleSeen`. That combination is the loop: solve → puzzle marked seen → reload → `selectByTier` filters `fresh = atTier.filter(p => !seen.has(p.id))`, the array shrinks, the same seed picks a **different** board in the same cell → solve again → paid again. Reviewer A observed exactly this (+8, reload, new board, +8). Keys are the padlock currency gating the climb, so the exploit does not just print steps — it trivially unlocks the Sanctum that §2 says is otherwise three weeks away.

**Done looks like.** One guard at the top of the `solved` branch: if `manor.rooms[cellKey].solved`, emit nothing. Plus a regression test. This is a ten-line fix and it should ship with item 3, since 3 makes it unreachable but 4 is what makes it *impossible*.

---

### 5. Fix the red build and make the review loop honest

**Problem.** See §0. `npm run build` fails on two `TS2532`s in `WordWebView.tsx:147`; `vite preview` then serves a stale `dist/`, and reviewers file already-fixed defects.

**Done looks like.** `TIER_RANK[a.tier] ?? 0` (or a `Record<Tier, number>` typed to be total), build green, and `preview` erroring — not warning — when `dist` is older than `src`. Consider not committing `dist` at all.

---

### 6. Make the four anchors cost and pay comparably

**Problem.** Rooms priced identically on the draft card cost wildly different amounts of a player's life, so the correct strategy is to abandon half of them on sight.

**Evidence.**

| Room | Asks | Real time | Pays |
|---|---|---|---|
| The Gallery (Twistle) | any 5 words, min 4 letters, from a ~106-word pool | **~20 s** | +5–8, +1 key |
| The Library (Word Web) | four groups of four | 3–6 min | +6 (+2 perfect) |
| The Conservatory (Hive) | **70% of total points** (`hive.ts` Full Bloom) | 10–20 min | +5–6, +1 key |
| The Counting House | 9×9 expert sudoku, 23 givens | 20–40 min | +5–6, +1 key |

70% is NYT Spelling Bee "Genius," and the room pays **nothing** below it — A typed 30 words, found 20, and got zero. Both reviewers independently pressed "Leave it for tomorrow" on the sudoku. Note that the sudoku's difficulty is a **deliberate owner directive** (`deck.ts`: *"the owner's expert-baseline request, so BOTH cards draw from a pool with no easy bin"*) — so the fix is not necessarily "delete it," but it cannot keep costing 40 minutes for the same +6 as a 20-second search grid, and a game called *Lexicon Manor* set in a lexicographer's house should not have its largest single time investment contain no letters.

**Done looks like.** Every anchor is 2–4 minutes to a payout, or it pays **in stages** and carries across days. The hive pays at every ladder rung, not only at Full Bloom. The Gallery's `targetCount` rises or its pool shrinks until it is a puzzle. The draft card states the expected time. If the expert sudoku stays, it becomes a long-form room that banks partial progress overnight and pays proportionally.

---

### 7. Make drafting a decision

**Problem.** The manor is a corridor and nothing you build is yours.

**Evidence.** 7 of 30 cards can only be dead ends; 13 can roll one; `CORNER` always turns you 90°. A's day-3 board was a one-cell-wide chimney five rooms tall with 28 of 33 cells untouched; A's day 1 was a T with three dead ends out of five rooms; B's was a vertical column. The layout resets nightly, so nothing persists. The three draft doors are labelled near-identically and one of them is labelled *wrongly* (§4).

**Done looks like.** Dead ends drop to a small, telegraphed, deliberately-chosen minority — the card face says "this room seals itself" *and the player takes it anyway because it pays for it*. Draft doors say something about what is behind them (the row, the tier, the category odds). And **something survives the night**: a wing you sealed, a corridor you banked, a room you furnished. Blue Prince's floorplan is an argument you conduct across runs; this one is a fresh coin flip every morning, and that is why the drafting layer scores a 3.

---

### 8. Cut the Word Web templates and make the colour bands mean something

**Problem.** 67.3% of shipped groups are one of eleven mechanical shapes; the difficulty band is decorative.

**Evidence.** Contains ×98, ___ X ×90, Rhymes ×88, Silent ×39, Add-a-letter ×26, Hidden ×24, Can Follow ×20, Can Precede ×14, Homophones ×10, Anagrams ×7, Drop ×4 — 420 of 624. 23.7% of boards carry two or more groups of the same shape; my first live board had two "Contains" groups. "Contains X" is tagged green 48×, blue 33×, yellow 13×, purple 4×. By week two the player is running a checklist rather than solving: find the rhyme group, find the letter-string group, split the remainder.

**Done looks like.** Half the templates cut from the generator; a hard cap of **one templated group per board**; and the band assigned by measured solve order over playtest data rather than by generator whim. The authored boards prove the ceiling — `web-d22`'s BRASS ___ against *Instruments in a Brass Band* is a genuinely good puzzle. Ship more of those and fewer of the rest.

---

### 9. Give the puzzle content the manor's voice

**Problem.** Nothing inside a puzzle knows the lexicographer exists.

**Evidence.** A's first cipher decoded to *"A BIRD IN THE HAND IS WORTH TWO IN THE BUSH."* B measured the cipher pool at ~60% stock proverbs — *"An apple a day keeps the doctor away"* in a dead lexicographer's darkroom. Word Web categories are *Things That Can Be Royal*, *Types of Haircuts*, *Picnic Basket Items*. And then, on day 1, a Linen Closet crossword hands you *1D: "Mrs. Bramble's morning ritual" · 2A: "Celebration slice" · 3D: "Dewey, for one"* → TEA, CAKE, CAT — and both reviewers sat up. **The pool contains the good version.** It just does not dominate. Meanwhile the crossword's 360 entries carry only 155 unique clues and 115 unique answers, verbatim-repeated (SUN ×12, CAT ×11, *"Parchment guide"* → MAP ×8), so what voice there is gets memorised inside ten Linen Closets.

**Done looks like.** Cut the stock proverbs from the cipher pool entirely and replace them with house voice — the pool already has *"Every locked drawer hides a first draft"* and *"Ink recalls what paper forgets."* Raise crossword clue uniqueness above ~90% of entries. Author at least one Word Web thread per board that is about the house, the staff, or him. This is the axis on which Golden Idol and Strange Horticulture beat this game outright (§7), and it is pure authoring — no engine work.

---

### 10. Make the step economy bite where the game is, not where the game isn't

**Problem.** The lower floors have no pressure and the upper floors are a toll booth.

**Evidence.** A ended day 1 with **23 steps of a 21-step budget** and nothing left to spend them on. B ended day 1 with **32 unspent** after four rooms and a full climb, having gone 15 → 39 on a single perfect Library solve. Neither reviewer ever faced "can I afford one more room" below row 4. Meanwhile the row gutter runs −1, −1, −2, −3, **−7, −9, −9**, so one step at row 5 costs a third of a day. The pressure exists only in the part of the game items 1 and 2 say the player cannot reach.

**Done looks like.** Movement gets cheaper and the climb differential flattens (the ascent should be paid for in *keys and knowledge*, not in a step tax that makes the top floor arithmetic rather than tension). Solve payouts come down so that a good evening ends near zero with a room you *wanted* and could not afford. The target feeling is "one more room," not "I have 23 steps and nothing to buy."

---

### 11. The night, the Portrait, and the small frictions

**Problem.** A cluster of cheap fixes with disproportionate emotional cost.

**Evidence and fixes.**
- `NIGHT_LINES` in `DayTransitions.tsx:146` is a `Record<string, string>` with **exactly three entries**, one per end reason. Retiring early is how almost every day ends, so *"An early night, well chosen."* is the last thing the player reads before bed, every night, forever. Morning lines rotate. **Give the night at least as many variants as the morning, and let them react to what the day contained.**
- **20 player choices in the whole game** (Bramble 4, Ellery 6, Fern 4, Posy 4, Portrait 2, Dewey 0) across 14,338 words. The stated model is Hades 2, where dialogue steers a relationship. Here you tap. The **Portrait** — the design's "mystery's heart, the person you're healing" — is thinnest at 33 nodes / 43 lines / 1,036 words against Bramble's 161 lines. Item 2 makes the Portrait reachable; this makes it worth reaching.
- Notice cards land on top of the screen's own title. The dusk screen's "And so, to bed" overlaps "The Grounds"; the Cabinet's close button covers The Study's row. Every room screen carries 250–500px of dead parchment — including the Darkroom's reveal, the payoff of a room whose entire metaphor is a photograph developing, rendered as two lines of centred text with no development animation.
- The palette is borrowed per room — NYT-Connections yellow/green/blue/purple in the Library, Spelling-Bee green in the Conservatory, saturated blue selection outlines in the sudoku and crossword. **The game looks authored until three rooms in, at which point it looks assembled.** Bring every room into the parchment system.
- The Word Web's last group is forced but still requires selecting all four and pressing Weave. "Step back · 1 step" charges you again to leave a draft you already paid to open. The hive accepts a hardware keyboard; the crossword silently ignores it. Crossword clue selection puts the cursor on the first *empty* cell rather than the first cell. Ellery greets you with "Welcome to the Library" while you stand in the Reading Nook. The steps aria-label reads "39 steps left of 21."

---

## 6. The one thing holding it back

Reviewer A said the game withholds its climax from the player who earned it. Reviewer B said the puzzles and the mystery are strangers. A is right; B is wrong about the mechanism but right about the feeling. Both are symptoms of one cause:

> **Everything Lexicon Manor does best is behind a door the deck rarely opens.**

The definition lines — the finest writing in the repository — sit behind violet draws and a rare tier-3 room. The Portrait, the emotional centre, sits behind a landing the median player reaches on day 18. The Study, the room the design calls the mystery's engine, is `tierRange: [3,3], rarity: 'rare', gemCost: 2`. The solve channel that connects the word games to the case is authored two fragments deep. The Forgotten Word pool is 113 entries of publishable writing that reviewer B never saw a single line of in four days of play.

The team has built the good game. It has then gated the good game behind a probability distribution and shipped the ungated remainder — newspaper puzzles and a walk — as the daily experience. Items 1 and 2 are both instances of the same instruction: **stop rationing the parts that are good.**

---

## 7. The honest comparison

**Against Blue Prince — below, on the axis Blue Prince owns.** In Blue Prince, where you place a room *is* the problem: dead ends punish you, corridors bank you, the North wing is a spatial argument you conduct against the grid across dozens of runs, and the knowledge you accumulate is permanent even though the house is not. Lexicon Manor's floorplan is a corridor generator with a price list. 7 of 30 cards are pure dead ends, the layout resets nightly, nothing you build persists, and after four drafts both reviewers had a vertical column. Blue Prince would also recognise something here it does well itself — the honest draft-card copy, the legible row-price gutter, the seal that makes solving matter — but on the core drafting axis this is not close.

**Against Case of the Golden Idol — below, decisively, on integration.** Golden Idol has no puzzle layer and story layer; extracting the words *is* the deduction, and every noun you place is a claim about what happened. Lexicon Manor has a deduction layer (the Journal, the constraint chain — both genuinely good) and a puzzle layer (four newspaper games and a sudoku), connected by a payout hook rather than by authorship. The connection *exists* — B was wrong to say it doesn't — but solving "Rhymes with FLOWER" deciphering a page about a dead lexicographer is a mechanism, not a meaning. Strip Golden Idol's art and it is still a game. Strip this one's and you have a folder of puzzle generators and a very good short story.

**Against the cozy comparators (Strange Horticulture, A Little to the Left) — level on writing and voice, above on chrome honesty, below on place.** The prose here beats Strange Horticulture's outright, and the confirmation dialogs, the row-price gutter and the "leave it for tomorrow with no penalty" grammar are more considerate than anything in that genre. But Strange Horticulture puts every interaction on a rendered desk with a lamp and a cat; here the Library and the Gallery are the same grid of rounded tiles on the same sheet of paper, one holding words and one holding letters. The card promises *"Four shelves, sixteen spines"* and delivers a 4×4 of buttons. The manor exists only on the blueprint, and the blueprint is a floor plan of a house you never actually enter.

**Where it is already above all of them:** the Journal as a detective instrument, the "name the thread" twist on Connections, the graded wrong-guess feedback, and the quality of the engineering underneath. None of those are small.

---

## 8. Time to quality: 5 → 6

**Roughly 2–3 focused weeks for one developer plus a content pass.** The rating moves a full point when a player who is paying attention learns something about the lexicographer *every day* and can act on it — not when the manor looks better.

The critical path is narrow because the architecture is already right:

| Work | Effort | Gets you |
|---|---|---|
| §0 + §5.5 — green build, no stale `dist` | ~1 hour | You can trust every measurement after this |
| §5.4 — re-solve guard | ~1 hour | Closes an infinite-currency exploit |
| §5.3 — persist room state in the save | 2–3 days | The PWA stops breaking its own promise |
| §5.1 — re-route fragments through the puzzle channels | 3–5 days (mostly JSON + pinning the sim) | The mystery moves every day; the best writing gets seen |
| §5.2 — decouple the guess from the climb | 3–5 days | The climax becomes reachable; ~1,000 words of Portrait dialogue come out of storage |
| §5.6 — anchor time/reward parity, hive pays per rung | 2–3 days | Players stop abandoning half the deck on sight |

That is the point. Items 1 and 2 together are worth more than the other nine combined, and both are largely *authoring and tuning against instruments the codebase already has* — the volume JSON, the channel definitions, and `economy/simulate.ts`.

**The 6→7 move is different work and should not be started first:** cutting the Word Web templates, giving the puzzle content the house's voice, and making the drafting layer a decision. Call that another 3–4 weeks, and it is where the game stops being a beautiful frame around other people's puzzles.

**How to know it worked.** Not by re-reading this document. Re-run `simulateCampaigns(PROFILE_DECENT, …)` and require: first Sanctum guess by median day ≤ 3; a legible fragment on ≥ 90% of the first 14 days; no day ending with more than ~20% of the budget unspent and unspendable. Then hand it to two more hostile players from a wiped save and ask them the only question that matters — **did you want to open it on day 4?** Both of these two said no.
