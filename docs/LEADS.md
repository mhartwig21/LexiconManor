# Leads — how the house tells you where to look

*Owner ruling, 13 Aug 2026. This supersedes round 46 (the "+1 page" clause on the draft card) and
refines the 13 Aug discovery ruling that replaced it.*

---

## The three positions, and why the third is right

**1. The card states the benefit.** Round 46 printed "+1 page" on every puzzle draft card. It
measured well and the owner overruled it on sight:

> *"I think we want to keep true to Blue Prince where certain clues about the benefits of rooms
> are not immediately apparent. Saying +1 page feeds everything to the player."*

A card that prints the rule hands a player the whole model of the game before she has drafted a
single room. Blue Prince does not do that, and most of the pleasure of that game is the rules you
deduce.

**2. Pure silent discovery.** Take the clause off and say nothing. Honest, but the first blind-play
test recorded the result: nobody learned where pages come from at all — the only blocker-severity
blind spot that test has ever produced. And a stranger who plays two days never gets there.

**3. A LEAD, in a character voice.** The owner:

> *"I am okay with a hint saying... draft the library, the old codger left an important document on
> the shelves there, worth a read... and the player then saying oh shit, I need to go to the
> library and solve it. But then also getting the reward and seeing the connection."*

This is the answer, and the distinction is exact:

| | |
|---|---|
| **A card printing "+1 page"** | the GAME telling you a RULE, before you have played |
| **A lead** | a PERSON telling you about a PLACE, right now, in the fiction |

A lead creates intent. It does not describe a payout, it does not generalise, and it does not
survive as a rule — it sends you somewhere once. The rule is still yours to deduce, because the
lead never states it. What the lead buys is that you go and look, and the reward then closes the
loop: *the Library gave me this.*

---

## What a lead is, and is not

A lead **is**:
- spoken by a character, in that character voice, about a specific place
- a reason to go, not a description of what you get
- occasional and situated — it lands because Ellery happens to mention it, not because a system
  fired
- confirmed afterwards by the reward, which must be attributable to the room (see below)

A lead is **not**:
- a payout figure, a rate, or a mechanic ("solve any word game to file a page")
- a nudge printed by the interface in the house voice — that is the same announcement wearing a
  costume, and it is the failure this ruling exists to prevent
- a repeated tip that becomes a checklist. If a player can predict the lead, it has become a rule
  and it has stopped working.

---

## Why this is the right shape for THIS game

The cast is the best thing in the product — 805 lines across six characters, and two independent
blind testers named Mrs. Bramble as the reason they would come back. Mechanically the cast does
almost nothing: Bramble pours the morning tea, and the rest talk.

Leads make the characters **load-bearing**. Posy sorts the post and mentions the post room. Ellery
reads and mentions the shelves. Fern tends the greenhouse. That is what a detective story does —
people tell you where to look — and it means the writing carries mechanical weight instead of
sitting beside it.

It also answers the measured problem without breaking the design. Word rooms lose the draft on
their face: the card says +1 next to a utility card saying +5, and no blind tester ever entered a
Gallery in three attempts. A lead does not argue with the +5. It just makes her want the Library
tonight.

---

## What this owes, to be built together

1. **The card says nothing about pages.** Prices and rules of play stay — steps, the door plan,
   the key on solve, how long the room asks for. What a room is WORTH to the mystery is discovered.
2. **The reward is attributable.** When a page files, it must be obvious which room produced it,
   at the moment it lands and again in the journal afterwards. Without this the lead has nothing
   to close against and the loop never completes.
3. **Leads are authored dialogue, gated to be occasional.** They should feel like something
   somebody happened to say. Frequency is a design number to derive, not to guess: too rare and
   nobody meets one, too common and it is a quest log.
4. **A lead must be honest.** If Ellery says the shelves hold something, drafting the Library that
   day must actually pay. A character who is wrong is worse than a character who is silent — this
   project already retired one line of Dewey prophecy for exactly that reason.

## Measuring it

The round-46 metric (how often a word room is outbid on its face) now measures the wrong thing and
should be retired or re-aimed: under this ruling that number is SUPPOSED to be worse.

What can be measured honestly:
- **Attribution**: every page-granting event names its room on the glass, and in the journal after.
- **Lead honesty**: a lead is never issued for a room that cannot pay it that day.
- **Lead frequency**: the share of evenings carrying at least one, held inside a derived band.

And the real test is the blind read, with the question changed. Not *"did she choose the word
room"* — she is not supposed to, on day one, for the right reasons. Ask instead: **did she work
out where pages come from, and can she say which room gave her one?**
---

# BUILT — round 54

**Eight leads, in four voices, and the mechanism that makes a character incapable of being wrong.**
Everything below is measured; every band says where it came from.

## 1. A lead does not take the conversation's slot — it is a tail on one

The obvious build is a node in the ordinary pools. It was built first and withdrawn, and the
measurement is the round's most useful finding — the same wall `engine/dialogue/whereabouts.ts`
hit in round 12:

- **ABOVE the reaction band** a lead outranks *"I heard you speak at the Sanctum door yesterday"* —
  **six reaction-latency cases went red** in `tests/dialogue-content.test.ts`. That is AAA 5.1
  breaking, and a rumour is not worth it.
- **BELOW the arc band** a lead never plays at all: over six simulated campaigns on a real
  floorplan the parlor leads fired **zero** times in twenty-four evenings, because a character
  with thirteen unseen reactions and six unseen arcs always has something better to say.

There is no third priority — the conversation's one slot is spoken for by content that is better
than a rumour. So a lead is `chainOnly`, is never dealt as a scene, and the SCENE plays it as a
TAIL once its own lines are done (`ui/dialogue/DialogueScene.tsx` → `selectLead`). She says her
piece, and then, on your way out, she mentions the shelves. **Nothing is displaced and no band
moves** — and that is also why the first lead lands on **day 2** rather than day 3: Mrs. Bramble
finishes her own introduction and *then* mentions the linen closet.

Three gates on the tail, one per clause of the ruling: **one a day** (read off the spine, so a
three-conversation evening is not a quest log), **only off a visit** (`morning`/`parlor` — a rumour
tacked onto the Portrait's sigh after a wrong guess is the interface talking), and **never off a
lead** (a tail has no tail).

## 2. Honesty is structural, not editorial

A lead's node id NAMES A CARD (`ellery.lead.library.shelves`), and two mechanisms hold it to that
name, so the dishonest case is not rare but unreachable:

- **`withHonestLeads`** removes a lead from the pool the selector sees unless the room it names can
  pay. The filter is on the POOL, so an unsayable lead loses its turn to ordinary content instead
  of leaving a hole in the scene.
- **The house keeps its promise.** A room she has been sent to today waives the day's channel valve
  and nothing else (`solveChannelPage({ valveWaived })`). That is the case which would otherwise
  make a character wrong: she hears Ellery at six, solves a Darkroom on the way, and arrives at the
  Library to be paid nothing.

**The honesty predicate is the channel's STOCK, not `solveChannelPage`** — and that correction is
worth keeping. Asking the full one-decision function (valve included) made leads a **morning-only
channel worth one or two a campaign**, because she solves a word room early most evenings and the
valve then shuts every word room out of every mouth until dusk. Ellery would have been forbidden to
mention the shelves at six o'clock for a reason that has nothing to do with whether anything is on
them. The valve is not part of the question because the valve is not part of the answer.

**What the waiver costs, published rather than absorbed: 0–1 pages a campaign**, against the 16 the
lintel channel carries, measured over six campaigns on the harshest reading of the order
(`tests/leads.test.ts` prints it every run). It is bounded at one a day by construction.

## 3. The frequency band, and where each end came from

| | | |
|---|---|---|
| **Ceiling** | at most **1 evening in 3** carries a lead | `WHEREABOUTS_EVERY = 3`, the shipped cadence of the game's only other passing-mention channel. A lead is a stronger act than a mention, so that cadence is the CEILING rather than the target. **Borrowed, not measured** — said plainly, because hidden provenance is how this repo has lied to itself before. |
| **Floor** | at least **3 leads** a campaign | A rule is deduced from instances: one is an accident, two is a coincidence. Stated as a count against the measured campaign rather than as a share, so the two cannot drift apart. |
| **Deadline** | the first lead by **day 3** | The only evidence in the repo about how long a stranger plays: every blind reader in `docs/COMPREHENSION.md` reached day 2 and one reached day 3, and the only [blocker] that test has produced is that nobody learned where pages come from. |

**Measured over six campaigns of 24 evenings** (`PROFILE_DECENT`; real offers through `rollCards`,
real picks through `chooseCard`, real selection through the shipped authored JSON behind the
shipped honesty filter):

- **evenings carrying a lead: 16.7% / 16.7% / 16.7% / 16.7% / 20.8% / 20.8%** — inside the ceiling
  with a third of it to spare
- **leads a campaign: 4 / 4 / 4 / 4 / 5 / 5**
- **first lead: day 2, on all six**
- **the named room came up again that evening on 57.7% of leads**

Three things the instrument models rather than measures, all of them pushing the number DOWN: she
taps every parlor host she stands in front of; **the cat is counted as never met** (Dewey stands on
one cell a day and the day model does not track whether her path crosses it); and the day's channel
is spent on her first solve, which is the earliest it can go.

## 4. What is deliberately NOT done, with the number a later round would have to beat

**A lead is a rumour about a place, not a summons.** Nothing here biases the deck toward the room
that was named — which would move `deckMixAt` and every clock calibrated against it — so the house
is under no obligation to deal her that door tonight. Measured: **the named room turned up in a
later offer on 57.7% of leads.** If a round ever argues for a deck bias, that is the number it has
to beat, and it should expect to pay for it in `tests/draft-dominance.test.ts` and the 4.10b clock.

## 5. And the ruling was finished where it was still being broken

Three surfaces still stated what a room is WORTH TO THE MYSTERY. Two were flagged last round; the
third was not, and it was the largest of them.

- **The seal's `where` line** (`ui/moment/moments.ts`, four rows) read *"Filed in the Journal ·
  finish a room to make it out"* — the sentence round 49's own comment, three lines above it,
  condemns as *"the deleted clause wearing different clothes"*. **Cut.** `where` is the filing
  address again, which is what AAA 11.12 asks of it.
- **The made-out seal** read *"Made out, in the Journal · the higher the room, the more at once"* —
  a RATE, the sharpest possible statement of what a room is worth, printed at the instant a room
  pays. **Cut.** The tier lever is FELT in the count ("Three pages made out"), which is what that
  seal was always for.
- **The journal rail** read *"N pages filed but not made out · finish a room to make them out (more
  of them, the higher the room)"* — both forbidden sentences on one rail, on the surface she looks
  at most. **The count stays** (state, not a rule, and the useful half); the instruction and the
  tier hint go.
- **AND THE ONE NOBODY HAD FLAGGED: `journalNudge`'s empty-file branch.** It said *"Finish a room,
  dear — any room, any puzzle — and a page files itself in here. One a day from the word games,
  however many you finish; the Study keeps its own count. The violet rooms keep more of them, and
  the higher you go the more they keep."* That is the channel, the rate, the second channel's
  separate valve and the tier scaling — **four rules, in Ellery's voice, before she has filed a
  single page** — which is exactly the "same announcement wearing a costume" the ruling names by
  hand. It outlived round 49 because nobody had read that branch since round 32. It now says what
  is true and is not a mechanic: *"He took his own definition apart and left it about the house in
  his own hand."*

  **Rounds 24 and 32 were right about the defect they measured** — the line before theirs named
  violet rooms, and two blind testers hunted them for two days on the strength of it. The ruling's
  answer is that the fix for a WRONG rule is not a COMPLETE one. It is the fiction, plus a person
  telling you where to look, plus a page that says which room it came out of.

## 6. The gates

- **`npm run gate:leads`** (`tests/round54-leads-live.mjs`) — the live half, at 375×667 and
  390×844, driven with real pointer input through a real morning. The lead is PAINTED (computed
  style, a real rect, inside the viewport, its box not scrolling), a PERSON says it (the
  nameplate), it states no figure and no payout, and it names a room the deck has. Then the hard
  case: a Gallery is solved first to spend the day's channel, and only then does she walk into the
  room she was told about — and it pays, and the page it files remembers which room produced it.
  `--prove` drives the same day with nothing said: **4 reds**, no lead painted and no page paid.
  The needle it searches for is derived — the longest word the lead uses that the character never
  uses anywhere else — so the gate cannot pass by reading the conversation the lead rode in on.
- **`tests/leads.test.ts`** — the authoring rules with a negative control per clause (a room not in
  the deck, a room that pays nothing, a room the ground floor cannot draw, a repeatable tip, an
  interface nudge, a numeral, the rulebook's vocabulary, a lead that takes the slot), the honesty
  filter, the promise, and the frequency band above. It prints every number it measured on every
  run.
- **`content/validate-dialogue.ts`** fails the BUILD on any authoring clause, so a dishonest or
  rule-stating lead cannot ship.

## 7. The eight leads

| Voice | Room | From |
|---|---|---|
| Mrs. Bramble | The Linen Closet | day 2 |
| Ellery | The Library | day 2 |
| Fern | The Conservatory | day 4 |
| Posy | The Darkroom | day 6 |
| Dewey *(narration — he does not speak, he sits down and stares)* | The Gallery | day 7 |
| Ellery | The Counting House | day 10 |
| Fern | The Linen Closet | day 12 |
| Posy | The Library | day 14 |

Every one names a room the ground floor can draw — a lead to a `tierRange: [3, 3]` room would be a
character sending her somewhere the deck cannot put her tonight, which is the honesty rule failing
at the geometry instead of at the ledger, and the validator refuses it.
