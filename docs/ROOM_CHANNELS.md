# Room channels — drafting a room should be choosing a lead

*Owner's proposal, 10 Aug 2026: "tying some of the puzzle elements to specific rooms. Right now,
letters just randomly show up? Having to draw a post room to find letters is a good idea — so you
have certain types of rooms which help you accumulate wisdom."*

This converges with the standards verifier's own #11, filed independently the same day:

> Letting the room she chooses bias WHICH fragment arrives makes choosing a room into choosing a
> lead, and it is the one move that would make the manor's geography matter to the mystery.

---

## What already exists (this is half-built)

- `SolveChannel { id, category, kind }` in `src/engine/volume.ts` — the abstraction is already the
  right shape. There are only **two instances**: `STUDY_CHANNEL` (the Study pays definition lines)
  and `LINTEL_CHANNEL` (literally everything else).
- `FragmentContent.channel` — a fragment may NAME its channel, and an explicit label wins outright
  over inference. Added in an earlier round for exactly this reason.
- `sourceRoomCategory` is authored on **every one of Volume 1's 28 fragments**.
- Four room categories in `deck.ts`: `puzzle`, `utility`, `parlor`, `mystery`. Thirty cards.
- A `post-room` card already exists — category `parlor`, flavour *"Posy sorts the morning letters"*.

**The authoring already believes in the mapping.** Volume 1's spread:

| sourceRoomCategory | kind | count |
|---|---|---|
| parlor | testimony | 7 |
| mystery | engraving | 5 |
| mystery | definition-line | 5 |
| puzzle | engraving | 5 |
| puzzle | definition-line | 5 |
| mystery | testimony | 1 |

Seven of the eight testimonies are parlor. The engine collapses all of it into one channel.

**Letters are a pure calendar.** The only gate is `volume.ts:870` —
`if ((letter.earliestDay ?? 1) > day) return false;`. Nothing about the Post Room, or Posy, or
anything the player did. This is precisely the "they just randomly show up" the owner named.

---

## The proposal

**The principle: which room she draws decides which KIND of knowledge she can gain.**

| Channel | Source | Pays | Status |
|---|---|---|---|
| Study | the Study | definition lines | exists |
| Lintel | any puzzle room solved | definition lines | exists, would narrow |
| **Parlor** | parlor rooms (Post Room, Morning Room, Drawing Room, Reading Nook, Greenhouse) | **testimony** | NEW |
| **Mystery** | mystery rooms (Archive, Chart Room, Observatory, Bureau, Map Room) | **engravings** | NEW |
| **Post** | the Post Room specifically | **letters** | NEW |

Testimony is what a person tells you, and parlors are where you meet people. Engravings are what
the house has inscribed, and the mystery rooms are the house's own records. The mapping is not
arbitrary — it is the one the content was already written against.

**Letters stop being a calendar.** `earliestDay` becomes a FLOOR rather than a trigger: a letter
needs its earliest day AND a post room drawn (or Posy met). Drawing the Post Room becomes a real
reason to spend a draft on a non-puzzle card.

---

## The risk that must be gated before this ships

**Starvation.** If testimony only comes from parlors, and parlors are a small share of offers, a
player can stall on a channel through no fault of her own. Every channel needs
**supply >= stock across a campaign**, measured, with the tail reported — not the median.

This is exactly why this work must come AFTER the grid-true simulator lands: channel supply
depends on which rooms actually get DRAFTED, and the current `simulateDay` has no columns, doors,
seals or neighbours, so it cannot see the deck at all. Tuning channels on a grid-blind instrument
would be the campaign's fourth repetition of measuring a game we do not ship.

**Keep the mercy valve.** `volume.ts` already synthesizes pity letters so "the mercy channel never
exhausts". A cozy game must never lock its mystery behind a card the deck declines to offer. The
valve should stay, and its trip rate should be reported per channel — if it is tripping often, the
channel is mis-supplied and the pity letter is hiding it.

---

## Why this is also a COMPREHENSION win

`docs/COMPREHENSION.md` found that **none of three testers learned where clues come from**. The
lintel channel is invisible because "solve anything, get a page" has no surface a player can
notice. A typed channel teaches itself: *"the Post Room brings letters"* is a rule a player can
state out loud after seeing it happen once — and once she can state it, drafting a parlor becomes
a decision she is making on purpose.

That is the same reason it must NOT be delivered as a tooltip. Let her notice it.

---

## Open question for the owner

Should a room type also gate the *deduction order*? Today `FRAGMENTS_TO_DEDUCE = [25, 28]` and
rooms pull the lowest unfound `revealOrder`, so which clue arrives next is fixed no matter what she
plays — she reads a serialised novel in order. Typed channels make the KIND choosable; letting her
choose the kind is most of the win, and full free order may be a step too far for a mystery that
needs its reveals to build. Recommend: typed channels now, keep order within a channel.
