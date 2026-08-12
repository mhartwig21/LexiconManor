# The comprehension test — can someone actually play this?

*10 Aug 2026. Three people who had never seen Lexicon Manor played the LIVE deploy blind on a
phone-sized screen, with no access to this repository and no developer shortcuts — they clicked,
like a person with a phone. They then answered twelve questions from memory, with a stated
confidence on each. A fourth reader, holding the design docs, marked those answers against
ground truth. This file is the result.*

**Why it exists.** Every critic this project has ever run read the design docs first, and so knew
what a step was, why Bramble appears, and what LACUNA is. A reader who already knows the answer
cannot measure whether the game gives it. This is the first test run by people who did not know.

---

## The verdict

**Playable: yes.** All three reached day 2 by clicking; one reached day 3, deduced LACUNA
unaided, and spoke it. Nobody was ever stuck on a screen they could not leave.

**Comprehension: 68/100**, marking half-right as wrong. That single number hides the real
finding: they played two different games. The STORY comprehends at near 100% — all three had the
premise, the goal, the dead lexicographer, the journal and where clues file, inside ninety
seconds. The MACHINE comprehends at roughly 40%. Every one of them finished holding at least one
confidently-held false rule about what costs steps.

**The shape of the problem, and the thing to hold on to:** almost nothing that went wrong is
mystery. The manor withholds the right things — the word, the definition, what the engravings
imply, what is at the top — and it worked. What it withholds wrongly is PRICES and RULES OF PLAY.
Most of the fix list below is labels on things the code already knows: every step entry already
carries a `reason` the meter throws away, `pointsToNextRank` already exists and is unused by the
dialogue scene, and Twistle’s “Words need 4+ letters” message is already authored and
unreachable. This does not need a tutorial. It needs about nine labels and one blueprint
affordance.

---

## Wrong beliefs — the player was CONFIDENT and WRONG

These are worse than confusion. A confused player knows to ask; this one does not.

### “You can only guess the word at the Sanctum door, four floors up — there is no way to test a guess until you climb.”

**Truth.** The speaking tube in the Entrance Hall hears one word a day, from day 1, at zero steps (engine/manor/tube.ts; SPEAKING_TUBE_CELL = ENTRANCE_CELL). It is the same daily guess the door hears. Round 17 built it specifically to decouple guessing from the climb.

**What it cost.** Two of three players spent the entire session believing the game's core verb was unreachable. The systems player: 'twelve fragments' worth of mystery and no surface to interact with it' — he named it as the thing that would make him quit. The NYT player never got within four floors of the door and reported never having played the actual game.

### “Talking to a character costs a step.”

**Truth.** Conversation is free. Only gifting costs 1 step (STEP_TABLE.gift, applied in day.ts when a 'gift-given' event is recorded).

**What it cost.** Directly suppresses the behaviour the campaign economy runs on. Bramble's tea arc is +1 affinity per two SHARED MORNINGS (TEA_ARC), and that arc is what eventually makes the Sanctum affordable. Two players started rationing conversations in a game whose stated pillar is 'characters make it a home'.

### “Gifts do nothing — the four diamonds by each name never move, so either they aren't a friendship meter or the gift system is broken.”

**Truth.** A gift is +1 affinity point. The pips render RANK, not points, and rank 1 needs 2 points (AFFINITY_RANK_THRESHOLDS = [0,2,5,9,14]). One gift per character therefore lights nothing anywhere.

**What it cost.** All three concluded the gift economy is inert. The atmosphere player gave away every bookmark he owned across three characters — three separate 1-point gifts, three unlit meters — and listed it as the thing he'd want fixed before recommending the game. Bookmarks are the scarce currency feeding five characters' service tiers.

### “The manor gave me fewer steps on day 2 than day 1 — the base allowance went down, possibly as a penalty for retiring early.”

**Truth.** BASE_DAY_BUDGET is a constant 18 on every day of the campaign. Day 1 adds a scripted one-off FIRST_MORNING_POT, and **at HEAD that pot is +4, so day 1 opens at 22** — the build these three played still had +3 (=21), which is the number they read and the number this file first quoted. Day 2's tea (+4 at one affinity point) is granted by shareMorningTea when the morning scene actually plays — after the header has already rendered 18. Day 2 is richer than day 1, not poorer.

**What it cost.** Both counting players read a difficulty spike or a punishment where there is a raise. The systems player recorded it as an unexplained regression and cited it in his 'the engine hasn't visibly turned over' verdict. (Round 23's TEA_POUR dawn cup already makes the day-2 dawn purse **22** at >=1 point — the same number day 1 shows, so the arithmetic is fixed at HEAD; the naming is the half that landed in round 24's DawnGrants rows.)

### “Wrong letters in the mini crossword cost 2 steps each, silently — and I was charged even for a word I got right.”

**Truth.** Placing and erasing letters is free (letters are probes). The only charge is the auto-check when the grid FILLS: a full grid that is wrong costs one weight-1 mistake (−2), and an identical re-check is free (crossword.ts `checkedSignatures` / `costedChecks`). Revealing a cell is a separate step-priced hint.

**What it cost.** The atmosphere player stopped experimenting in the one puzzle that most rewards trial fills, having been told elsewhere in the same game to 'pencil freely, it costs nothing'. Both counted steps instead of solving.

### “Guessing costs steps in the Conservatory (Spelling Bee) — my counter dropped 2 mid-hive for no reason I could name.”

**Truth.** An invalid, too-short, or already-found word is mistake weight 0 — completely free. Only a structural slip (missing centre letter, a letter not in the hive) costs a flat −1 at any tier (mistakeDelta). There is no −2 available in that room.

**What it cost.** Chills the free-guessing loop the entire Spelling Bee format depends on. A player who believes guesses are priced plays a hive at maybe a third of its speed.

### “'Anchor' rooms are the ones you can keep building upward from; micro rooms dead-end you.”

**Truth.** Onward growth is decided by the DOOR PLAN (dead-end / corridor / corner-L / corner-R / tee / fork / cross), which the card draws post-rotation with the entry wall gilded. micro/anchor is puzzle length and payout, nothing else.

**What it cost.** The NYT player chose on the wrong attribute for two consecutive days, dead-ended both climbs, and formed the anchor theory only after his session was effectively over. He named this as the single thing he never cracked: 'How to get upstairs. That's the whole game.'

### “'Seals itself' is atmosphere — a cosy room that shuts its own door.”

**Truth.** It is the dead-end stamp, and it is a priced trade: SEALED_ROOM_BOUNTY pays +1 gem precisely because the room costs you a frontier. The stamp already reads 'Seals itself · +1 gem'.

**What it cost.** One player took it twice in two days and ended his upward progress both times without knowing he had done it.

### “'Leave it for tomorrow' means the puzzle will still be there tomorrow.”

**Truth.** The manor is wiped nightly (endDay resets layout, gems, keys, solve states). That room does not exist tomorrow. Session restore only holds within the same day.

**What it cost.** False reassurance delivered at the precise moment a player decides to abandon content. It also quietly contradicts the nightly reset the game elsewhere works hard to justify in Bramble's voice.

### “'The manor gave back +20' on the night screen is a payout — a climb bonus, a score, or steps banked toward tomorrow.”

**Truth.** It is `stepsRefunded(ledger)`: a retrospective sum of everything today's ledger paid IN — solves, perfect bonuses, tea, snacks. Nothing is banked, nothing carries. It is a stat, not a transaction.

**What it cost.** All three chased it. The systems player: 'this is the one that bothers me most, because it looks like the game's main scoring signal.' The atmosphere player built a whole false model (a climb-height bonus) on it.

### “Bookmarks were confiscated at bedtime along with the gems and keys.”

**Truth.** endDay zeroes gems and keys and explicitly preserves bookmarks (`currencies: { gems: 0, keys: 0, bookmarks: s.currencies.bookmarks }`). Bookmarks are the one persistent currency.

**What it cost.** He now believes the gift currency is also disposable, which combined with the dead pips means gifting looks like pure loss.

### “The mystery runs on violet rooms; I never once saw the room type the whole game is about.”

**Truth.** Since round 21 the lintel channel — finishing ANY ordinary word game — stocks 16 of Volume 1's 28 pages, one per channel per day (volume.ts LINTEL_CHANNEL; the spine watcher in app/slices/journal.ts). Violet is the extra drip and is deliberately ~2% of ground-floor offers, ramping to ~10.5% at the top.

**What it cost.** Two players spent the session hunting a category that is no longer the main supply line, concluded the game had starved them of its own core content, and never learned the true rule: solve a puzzle, get a page. Both cited this as a probable quit reason.

### “There is a way to bring Ellery something warm, and I can't find it.”

**Truth.** There is no tea-giving mechanic. The interpretation service unlocks at Ellery affinity >=2 with >=1 legible fragment, met in a parlor room (ellery.arc.interpret-offer). One more bookmark would have opened it.

**What it cost.** The player who read every word finished with two engravings half-read and a hint he was certain he was failing to act on, one gift away from the real lever.

---

## Blind spots — the game never said

- **[blocker]** What solving a word game gives you toward the mystery — that finishing any room files a journal page, once per channel per day. This is the mystery's main supply line and no player learned it.
  - *Where it should have been taught:* The Journal's Word tab at zero fragments (engine/journal.ts journalNudge:759, currently 'Draft toward the violet rooms'), and the first room-solved reward toast.
- **[major]** What happens when steps reach zero. All three explicitly said they never found out; two played conservatively because of it.
  - *Where it should have been taught:* Bramble's day-1 morning tea scene, one clause — the day ends gently, nothing is lost. Or the step meter when it first drops below ~4.
- **[major]** What counts as solving the Conservatory. The solve line is Full Bloom = 70% of max score (ladderThreshold(maxScore, 70)) and the ladder never marks it.
  - *Where it should have been taught:* The hive rank bar (HiveView.tsx:233 already computes `solveAt`) — mark the Full Bloom rung as the door and state the payout.
- **[major]** The minimum word length in the Gallery. The authored message 'Words need 4+ letters' exists but is unreachable, because Claim is disabled below minLength so the toast never fires.
  - *Where it should have been taught:* TwistleView.tsx:372 — either enable the button so the existing message fires, or print the rule under the trace tray.
- **[minor]** Why some claimed Gallery words get struck through afterwards (they are real words traceable on the grid that are not in the puzzle's target list).
  - *Where it should have been taught:* The struck-through strip in TwistleView.tsx:381 needs a two-word header, e.g. 'real words, not on his list'.
  - **ROUND 38 — CLOSED, AND IT WAS NEVER A COPY PROBLEM.** Round 28 made a struck real word into a kept STUDY, and round 34 then spent a round on the evidence for it (a +1 on the chip, a caption per pile, separated rows) because two cold readers still finished believing that only the pre-chosen words count. The cause was under both fixes: **on the pool those rounds shipped, tiers 1 and 2 carried a median of ZERO studies.** The ground floor is 62% of the rooms the median player enters, so in the room she plays most there was no second class to learn about, and the belief she formed was a correct reading of her screen. Round 38 widened acceptance from the ask's own frequency band and length window to the whole dictionary; the ground floor now carries a median 79. `tests/round38-gallery-live.mjs` (`npm run test:gallery-ground`) traces GRIDS — rank 20,286, i.e. 286 places outside a band she cannot see — on a tier-1 board with real pointer input at 375x667 and 390x844, and requires the room to answer it in its good voice, hang it, mark it +1 and move the score. Both sizes, both checks, and each check is proven by re-introducing the shipped form until it goes red.
- **[major]** The Darkroom has no rules text of any kind and no visible word boundaries. The one player who entered it never solved it and flagged it as the room that would strand a non-cryptogram player.
  - *Where it should have been taught:* CipherView.tsx, on entry — one sentence in house voice about one letter standing for one letter throughout.
- **[major]** What gems are for beyond rerolling, where they come from (Gem Vault +2, Still Room +1, a sealing plan +1, hive Every Petal +1), and that they die at midnight. Two players finished with zero gems and never saw a reroll happen.
  - *Where it should have been taught:* The currency chip in the header (currently an unlabelled diamond), and the greyed Reroll button in the draft modal.
- **[major]** What keys are for and how they arrive (solve payouts by tier, Key Cabinet, Boot Room, Fern's sill at affinity). Nobody ever held one, so the padlock arc was pure scenery.
  - *Where it should have been taught:* The padlocked-door refusal line already names the remedy ('It wants a key') but never the source; add the source. Also the header's key chip.
- **[minor]** The three currency chips in the header are never labelled on screen — one player only worked out gems/keys/bookmarks by reading accessible text.
  - *Where it should have been taught:* CurrencyChip.tsx — a word beside the glyph, or a first-run one-time label.
- **[minor]** The diamonds stacked in the map's left margin are TIER pips (rank-pressure band: which puzzle tier that storey draws from). All three noticed them, none could guess, two guessed gems.
  - *Where it should have been taught:* BlueprintSheet.tsx:458 — the margin already draws a rate card; give the pip column a one-word key in the title block.
- **[major]** What the tier system gates at all — higher rows draw higher-tier puzzles, more violet, fewer green, and locked doors. 'tiers I–III' on a card was noise to all three.
  - *Where it should have been taught:* The draft modal's storey heading, one clause; it already names the storey.
- **[minor]** Where the keepsakes actually are. The night digest says they 'sit unlooked-at on the mantel'; the shelf is in Chronicles below the trunk. One player searched three days and never found it.
  - *Where it should have been taught:* ui/moment/mantel.ts mantelLine — call it by the name of the place the player can reach (the Chronicles shelf), not by a fictional mantel.
- **[minor]** That the Floorplan Cabinet exists at all. Both players who found it called it the most useful screen in the game; one found it by accident on day 2, one never learned it was a reference rather than a collection.
  - *Where it should have been taught:* The draft modal — a 'see every plan' link at the point of the decision it informs.
- **[major]** That the floorplan is demolished every night. All three were blindsided at the day-2 map. Bramble covers it beautifully in fiction AFTER the fact ('the manor invents the rest daily') — nobody hears it before they retire.
  - *Where it should have been taught:* Bramble's day-1 goodnight, or the armed 'End the day?' state. This is the one blind spot I'd flag as genre-legitimate — it is a roguelite convention and the reveal has real charm — but three of three called it the biggest surprise of the session, so I'd say it once, in her voice, on day 1 only.
- **[minor]** 'Beneath the floorboards' on the Chronicles page is a storage/build diagnostics panel, and it reads to a curious player as an unexplained meta-system.
  - *Where it should have been taught:* ChroniclesPage.tsx:601 — label it Diagnostics, or move it behind the settings toggle.
- **[minor]** Posy's 'the house checks the outgoing tray every morning' reads as a system with no surface. It is actually a joke — the same line says the tray has never once had anything in it. Flagging for the owner rather than as a defect: it landed as a missing feature on the systems player, which may be a cost you're happy to pay for the gag.
  - *Where it should have been taught:* content/authored/dialogue/posy.json:178 — owner's call.

---

## The fix list, ranked by comprehension bought per unit of work

**1. [small] Print the reason word beside every step float. The ledger already carries `reason` on every entry and StepMeter throws it away — it renders a number and a colour class. Show '−1 gift', '−2 wrong fill', '−1 dead letter', '+2 perfect', '+4 tea', '−7 climb'. This is the single highest-value change on the list: one label kills four separate false rules and closes most of Q9's blindness, and the data is already in hand.**

*Closes:* Wrong beliefs: talking costs a step; wrong crossword letters cost 2 each; the hive charges for guesses; and 'I played two days without ever learning what the downside of being wrong is'.

*Files:* `src/ui/chrome/StepMeter.tsx`

**2. [small] Make the moment card a link, not just a dismiss target. MomentLayer's only onClick is `momentQueue.dismiss()`; every moment already carries a `where` string naming exactly where it filed ('Waiting in the Journal · Letters', 'Kept in the Chronicles · Keepsakes'). Add a route per moment kind and navigate on tap. Optionally give the day-1 letter moment no auto-dismiss at all.**

*Closes:* All three players' very first input in the game hit nothing, and 'every reward the game gave me announced itself in a card I could not catch'.

*Files:* `src/ui/moment/MomentLayer.tsx`, `src/ui/moment/moments.ts`

**3. [small] Rewrite the journal's zero-fragment nudge. journalNudge currently returns 'Draft toward the violet rooms, dear' — stale since round 21 re-routed 16 of 28 pages through ordinary word games. Say the true rule in Ellery's voice: finish a room, any room, and a page goes into this file; the violet rooms keep more of them, higher up.**

*Closes:* The blind spot that solving a puzzle feeds the mystery, and the wrong belief that violet rooms are the mystery's only channel — the belief that made two players feel the game had starved them of its own content.

*Files:* `src/engine/journal.ts`

**4. [small] Show points, not just rank, on the affinity pips. `pointsToNextRank` already exists in engine/dialogue/affinity.ts and is unused by the scene. Either light a half-pip per point or print 'one more kindness' under the pips. Do the same on the gift confirmation.**

*Closes:* The most widely shared wrong belief in the test: gifts do nothing. It also rescues the tea arc, Ellery's interpretation service and Fern's key, all of which are affinity-gated and all of which the players wrote off.

*Files:* `src/ui/dialogue/DialogueScene.tsx`

**5. [medium] Put the speaking tube on the blueprint. Draw it on the Entrance Hall cell as a tappable affordance routing to /sanctum from day 1, and stop gating the tube's existence behind THIN_FILE_THRESHOLD (keep the gate on the nudge prose if you like, never on the affordance). Then add one clause to Posy's welcome letter naming the brass in the hall alongside the door at the top.**

*Closes:* The largest wrong belief in the test: two of three believed the game's central verb was four floors away and unaffordable. Round 17 already built this mechanic to solve exactly this; only the surfaces are missing.

*Files:* `src/ui/blueprint/BlueprintSheet.tsx`, `src/ui/journal/JournalView.tsx`, `content/authored/volumes/volume-1.json`

**6. [small] Fix the Gallery's dead Claim button. It is `disabled={word.length < minLength}`, which makes the already-authored message 'Words need 4+ letters' unreachable. Enable the button so the toast fires, or print the minimum under the trace tray. While there, give the struck-through strip a header ('real words — not on his list').**

*Closes:* Two blind spots, one of which the systems player had to solve by experiment on a disabled control that 'photographs exactly like a working one' — your own STATUS lesson.

*Files:* `src/ui/rooms/anchor/TwistleView.tsx`

**7. [small] Mark Full Bloom as the door on the hive ladder. `solveAt = ladderThreshold(state.maxScore, 70)` is already computed; label that rung 'Full Bloom — finishes the room' and put the step payout on it.**

*Closes:* Two players could not tell what counted as solving the Conservatory; one overshot by accident, one reached Garden with 39 words to go and quit the room via a button labelled 'Leave it for tomorrow'.

*Files:* `src/ui/rooms/anchor/HiveView.tsx`

**8. [small] Change 'Leave it for tomorrow' to something true — 'Leave it' or 'Step away'. The manor is wiped nightly, so the current copy is a promise the game breaks.**

*Closes:* The false belief that abandoned puzzles persist, delivered at the exact moment a player abandons one.

*Files:* `src/ui/rooms/RoomHost.tsx`

**9. [small] Hold the Retire button's armed state until the player taps elsewhere, instead of auto-disarming after 2600ms. All three missed the confirm; one pressed it four times over several minutes and concluded it was bugged.**

*Closes:* The only control in the game that three of three players believed was broken.

*Files:* `src/ui/chrome/DayHeader.tsx`

**10. [small] Rename the night digest's headline number so it reads as a summary rather than a payout: 'You spent 11; the manor paid back 20 along the way. Nothing carries to tomorrow.' Currently refundLine says 'The manor gave back +20', which is transactional language for a stat.**

*Closes:* The number all three chased and none found — the systems player's single biggest irritation.

*Files:* `src/engine/day.ts`, `src/ui/chrome/DayTransitions.tsx`

**11. [small] Say the day-1 pot is a one-off, and pour the tea before the morning header settles. Name the welcome cup as the first morning's own ('a cup for a first morning, +3'), so day 2's smaller header does not read as a demotion. HEAD's TEA_POUR dawn cup already fixes the arithmetic; this is the naming half.**

*Closes:* The confident belief that the base allowance shrank on day 2 — read by two players as a difficulty spike or a punishment for retiring early.

*Files:* `src/app/slices/day.ts`, `src/ui/chrome/DayTransitions.tsx`

**12. [small] Repoint the engraving's Ellery note at the real lever. 'Ellery might read more in this, over something warm' names a gesture with no mechanic; the service unlocks at Ellery affinity >=2 in a parlor room. Say that in her register — 'Ellery would read more in this, once she trusts you a little further.'**

*Closes:* A player who reads every word finished with two half-read engravings, certain he was failing to perform an action that does not exist.

*Files:* `src/ui/journal/JournalView.tsx`

**13. [medium] Give the Darkroom one sentence of rules on entry, in house voice, and make word boundaries visible in the ciphertext.**

*Closes:* The one room that stopped a player outright. Every other room was carried by the player's existing NYT habit; this one has no NYT twin to borrow from.

*Files:* `src/ui/rooms/micro/CipherView.tsx`

**14. [small] Have Bramble say once, on day 1's goodnight only, that the house redraws its rooms overnight and the journal is what keeps. Flagging this as the one item where I'd want the owner's ruling: the reset is a genre convention and the day-2 reveal has real charm, but three of three named it the biggest surprise of the session and one read the title card's 'nothing here can be lost' as a broken promise because of it.**

*Closes:* The universal day-2 shock, and the specific grievance that the title screen's promise is false.

*Files:* `content/authored/dialogue/bramble.json`, `src/ui/chrome/DayTransitions.tsx`

**16. [EXECUTED, round 31] Put the door plan in WORDS on the draft card, beside the diagram.** Wrong belief 7 is the most expensive miss in this file and was the only one on the list with no fix number, so no round ever picked it up. The plan was on the card — as a 32×32px diagram whose only statement was an `aria-label`, beside the loud bold line that named the wrong attribute. Each card now prints its onward doors in type a step darker and heavier than that line ("Two ways on — east and west", "One way on — north"), derived from `onwardDoors` in engine/manor/grid.ts, which `sealsItself` is now defined as the zero of. The wall she came in through is named once above the three cards instead of three times inside their icons.

*Closes:* Wrong belief 7 — "'anchor' rooms are the ones you can keep building upward from" — and the NYT player's *"How to get upstairs. That's the whole game and I never cracked it."*

*Gate:* `tests/grid.test.ts` — "states the ways on, in words, for every card in the deck at every heading" walks the manor with its own compass tables, never the production function, over 112 offers. Proved red on the pool it condemns (bare geometry lies on 11 of the 112).

*Files:* `src/ui/blueprint/doorplan.ts` (new), `src/ui/blueprint/DraftModal.tsx`, `src/engine/manor/grid.ts`

**17. [EXECUTED, round 31] Make "seals itself" read as the priced trade it is, and un-mute the margin.** The stamp said `Seals itself · +1 gem` and was read as atmosphere; it now says `Seals itself · no way on from here · +1 gem`, in the same words as the door-plan line above it, so the card states the charge as well as the payout. In the margin, the rate card and the tier pips both carried `aria-hidden="true"` and the pips had no text at all — both are announced now, one image and one sentence each, off `moveAt`; and the pip column is headed on the glass with the one word every card already uses, TIER (the key's own word was RANK, the engine's name for the band).

*Closes:* Wrong belief 8, and blind spots 15/141 (the unreadable left margin).

*Gate:* `tests/grid.test.ts` — "speaks its margin", red on the old markup.

*Files:* `src/engine/manor/deck.ts`, `src/ui/blueprint/BlueprintSheet.tsx`, `src/ui/blueprint/pricing.ts`

**15. [small] Label the header currency chips and the blueprint's left-margin tier pips. A word beside each glyph, and a one-word key on the pip column in the title block the margin already draws.**

*Closes:* Three unlabelled trinkets in the corner and an unreadable margin — every player noticed both, none could read either.

*Files:* `src/ui/chrome/CurrencyChip.tsx`, `src/ui/blueprint/BlueprintSheet.tsx`

---

## The three players, in their own words

**Daily NYT-games player (Wordle, Connections, Spelling Bee, expert at the Sudoku). No roguelike experience; did not know what "drafting" meant. Wants a satisfying puzzle with coffee, not a system to decode.**

> Tomorrow, yes — for the writing and to find out if the word is LACUNA. By the end of the week, probably not, unless the house stops silently punishing me for choices it won't explain. The puzzles themselves are excellent and instantly familiar; the manor around them is the part that made me feel stupid, and I did not come here to feel stupid before nine in the morning.

**Systems-first player. I open a game looking for the resource, the spend, and the thing that compounds. I'll sit through a slow, pretty opening if I can feel an economy underneath it; I get hostile fast if the "choices" turn out to be flavour text with the same payout.**

> Yes — tomorrow, once, and with a stopwatch on it. The opening is unusually confident: the Journal's empty states teach you the whole evidence economy before you act, the writing has a real voice, and the draft screen has actual tension in it (flat steps vs. steps-on-solve, door count as an expansion constraint, a room that 'seals itself' for a gem). I want to see whether the Kitchen's '+2 per green room drafted after' actually snowballs, and I want to know what a violet room is.
>
> But two days in, the engine hasn't visibly turned over. I built a house, solved two rooms, retired — and Day 2 handed me an empty map and three fewer steps than Day 1. The game told me on day one to 'draft toward the violet rooms' and then never offered me one. The upper two-thirds of the map has been hatched-out and unreachable both days, so the whole tier system, the padlock, the Sanctum door and the actual act of guessing the word are things I have only read about. I've got two of twelve fragments and no surface anywhere to even write a guess down.
>
> So the honest answer is: I'd open it again to find out whether Day 3 or 4 raises the ceiling. If it doesn't — if the loop is 'build four rooms in the same two rows, solve two of them, go to bed' — then the compounding I was promised is a rumour, and I'd stop. The thing that would keep me is a visible, per-day proof that I'm climbing higher than yesterday. Right now the only number that claims to measure that ('the manor gave back +20') is one I can't find anywhere in my inventory.

**Atmosphere-and-story player; reads every word on screen; here for a cosy mystery and for characters who feel like people. Plays NYT word games daily, which turned out to matter a lot.**

> Yes — tomorrow, first thing. I say that as someone who bails on most puzzle games in ten minutes. Three things earned it. The prose is genuinely good and, more importantly, it is load-bearing: Posy's letter is the tutorial, Mrs. Bramble's 'the manor invents the rest daily' is the excuse for the roguelite reset, and Ellery's marginal notes on the definition are simultaneously character work and the clue-delivery system. The deduction is real — six candles for six letters, an A somewhere inside, shares no letter with WORDSMITH — and I solved it myself, on paper, in my head, which almost never happens in a game that calls itself a mystery. And the payoff is perfectly judged: the pipe went quiet and then said 'Say it again to my face. The doors will not trouble you now', and the padlock on the map was gone. I want to climb four floors and say it to her. That is a hook. What I would want fixed before recommending it to a friend who doesn't do the NYT games every morning: the Darkroom needs one sentence of rules, the Retire button needs to not look broken, and somebody needs to tell me what those four diamonds next to everyone's name are for, because I gave away every bookmark I owned to fill them and nothing ever happened.

---

## Two calibration notes

1. They played the live deploy, one commit behind HEAD at the time. Some of the day-2 step
   arithmetic is already half-fixed at HEAD — the NAMING is not. Fix the naming; do not fix the
   arithmetic twice.
2. Fix 14 (Bramble saying once, on day 1 only, that the house redraws overnight) is flagged for
   the owner’s ruling rather than as a defect. The nightly reset is a genre convention and the
   day-2 reveal has real charm — but three of three named it the biggest surprise of the session,
   and one read the title card’s “nothing here can be lost” as a broken promise because of it.
