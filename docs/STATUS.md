# Lexicon Manor — where we are

*Written 7 Aug 2026, after thirteen build rounds and one hostile editorial review.
Updated 10 Aug 2026: §5.8, §5.6 and §5.10 landed.*

**Live:** https://mhartwig21.github.io/LexiconManor/ — installable on iPhone via Add to
Home Screen. Deploys from `main` on push; verify the run actually succeeded, because
three in a row silently did not (see *Lessons* below).

**Repo:** github.com/mhartwig21/LexiconManor · 37 commits · working tree at `8a125bd`.

---

## 1. What the game is now

A cozy-detective word-puzzle roguelike. You draft rooms onto a 5×7 blueprint of a manor,
each holds a word game, mistakes cost **steps** rather than health, and a mystery — a
word struck from every dictionary — is assembled across days from clues you find and
decipher.

**Seven rooms, 1,083 shipped puzzles.**

| Room | Game | Puzzles |
|---|---|---|
| The Library | Word Web (Connections-style) | 153 |
| The Conservatory | Hive Builder (Spelling Bee-style) | 300 |
| The Gallery | Twistle (grid word search) | 210 |
| The Study | Forgotten Word (poetic definitions) | 113 |
| The Counting House | Sudoku, expert baseline | 120 |
| The Darkroom | Substitution cipher | 94 |
| The Linen Closet | Mini crossword | 90 |

Four micro-rooms (anagram, word ladder, rhyme, category sprint) were **cut** in round 4
on the owner's "fewer but better" directive. They are gone, not disabled.

**The mystery.** Volume 1 is 28 authored fragments — 10 definition lines, 10 engravings,
8 testimonies — plus 9 letters. The ten engravings narrow the dictionary in reveal order
171755 → 15232 → 6575 → 208 → 146 → 56 → 11 → 5 → 3 → 2 → 1. Every clue is soft alone
(each admits ≥100 words) and none is load-bearing: drop any one and the answer still
survives with ≤3 candidates standing.

**The cast.** Mrs. Bramble, Ellery, Posy, Fern, Dewey the cat, and the Portrait. Roughly
150+ authored lines each for the speaking four, with Hades-style contextual selection.

---

## 2. Where the quality bar stands

A hostile two-reviewer panel played three days each and rated the game **5/10** against a
high-end indie bar (Blue Prince, Case of the Golden Idol, Strange Horticulture). Full text
in `docs/REVIEW_AA.md`. Sub-ratings at the time: writing 7, onboarding 6, puzzles 5,
mystery 5, presentation 5, **drafting 3**.

Its verdict: *"a genuinely well-written, unusually well-engineered game whose loop does
not work — and a daily game is its loop."* Both reviewers stopped wanting to open it on
day 3.

Its one-line diagnosis, which has driven every round since:

> **Everything Lexicon Manor does best is behind a door the deck rarely opens.**

### Answered since the review

| Item | Was | Now |
|---|---|---|
| §5.2 Say a word at the door | median **day 18–21** | **day 1** (100% within 3) |
| §5.1 Days filing a readable clue, first fortnight | **0.23** | **0.96** |
| Volume win, median player | day 33–34 | day 22 |
| Never finishes inside 45 days | **25%** | **0%** |
| §5.7 Drafting: offers with a real choice | 66.4% | **79.2%** |
| §5.4 Re-solve exploit (printed steps *and* keys) | open | closed |
| §5.3 Mid-puzzle reload | lost the board, kept the penalty | restores both |
| §5.5 Review loop measuring a stale build | open | guarded |
| §5.8 Word Web colour ladder (yellow→purple spread) | **0.33** | **4.06** |
| §5.8 Boards whose colours mis-state their difficulty | **89.7%** | **0%** |
| §5.8 Groups that are one of eleven templates | 67.3% | 63.1% (top one 14.7%) |
| §5.8 Distinct board architectures / dominant one | — | 63 across 153 boards / 9.8% |
| §5.6 Seconds-per-step spread across the seven rooms | **36×** | 20× overall, **≤2×** across an ordinary evening |
| §5.10 Steps in hand on the ground floor (median / skilled) | **28 / 30** vs an 18-step budget | **18 / 20** |
| §5.10 Net steps per ground-floor room (median / skilled) | **−0.84 / −0.36** (a wash) | **−2.58 / −0.96** |
| §5.10 In hand arriving at the first padlock (median / skilled) | 15 / **21** — richer than she started | 12 / 18 |
| §5.10 Simulated days that could end with steps in hand | **0%** (the gate answered itself) | 5.5% early nights, reported |

Also shipped outside the review's list: room orientation now follows the direction you
enter (and the draft card shows the true placement); a fresh-start reset; the
first-meeting ceremony; Bramble's whereabouts asides; wings, so the horizontal axis of
the manor means something.

---

## 3. What is left

Ordered as the review ordered them — most value first.

**In flight**
- *(nothing)*

**Queued**
- **§5.9 House voice in puzzle content.** Stock proverbs in the cipher; 155 unique clues
  across 360 crossword entries. The puzzles are not yet *about* the lexicographer.
- **§5.11 The night, and player choice.** Three night-line variants; ~20 player choices in
  the whole game; notice cards can overlap; per-room palettes borrow from other products.

**Open design questions, awaiting play rather than analysis**
- **Is the skilled player's ground floor thin enough?** Round 23 took her from +0.36 net
  steps a room to −0.96 and her purse from 30 to 20, but she can still very nearly fund
  her own evening down there, because she solves 90% of what she sits for. That may be
  exactly right — it is what skill should buy — or it may be one more step of walk. It is
  a single constant and `tests/economy-pressure.test.ts` measures it; tune it from play.
- **The seal rate.** Dead ends fell from 13.6% to 7.6% as-played. The owner has noted
  dead ends are a legitimate Blue Prince mechanic and this may now be too forgiving. It is
  a single constant; tune it from play, not from theory.
- **Room adjacency.** Wings made *where* a room goes matter, but rooms still do not affect
  each other the way Blue Prince's do. This is the next real move on the drafting axis and
  every sketch of it so far moved the step economy.
- **A second volume.** The machinery exists and rolls; only Volume 1 is authored.

---

## 4. How the work runs

Single focused agents, one task each, verified live in a real browser before landing.
Large multi-agent workflows were abandoned after two rounds lost ten agents apiece to a
network outage. Every round: `tsc` clean, full suite green (**1,199 tests**), content and
clearance lints green, production build, then Playwright against system Edge driving the
real game — then commit, push, and *confirm the deploy actually served it*.
(Round 23: **1,249 tests**.)

`docs/AAA_BAR.md` is the enforceable bar (~130 criteria plus a mandatory live-interaction
pass). `docs/BENCHMARKS.md` holds the teardowns of Spelling Bee, Connections, Wordle,
Blue Prince, Hades and NYT Sudoku that the criteria derive from.

---

## 5. Lessons worth keeping

- **A gate whose data is missing does not fail — it changes its mind.** Three deploys in a
  row died because corpora the lints judge against were gitignored. All four are vendored
  now. The frequency list was the dangerous one: absent, the register lint quietly judged
  differently in CI than on a laptop.
- **Build the thing, then check it is reachable.** The speaking tube was written, the
  campaign retuned around it, and it was wired to nothing — every number in that round
  described a build nobody could play. The same shape had already bitten us twice: dead
  Portrait dialogue, and a back button painted under the chrome.
- **Screenshots are not evidence of interaction.** Three navigation defects survived three
  critic rounds because a buried control photographs exactly like a working one. The bar
  now requires hit-testing.
- **Measure the thing you are claiming.** The rounds that went well ended with a number
  beside the review's number. The rounds that went badly ended with an assertion.
- **A gate whose answer is fixed by the loop condition is worse than no gate.** For
  twenty-two rounds `metrics:review` printed *"unspent budget at day end 0.0%"* as a pass
  of the review's own third criterion, while `simulateDay`'s only exit was an empty
  ledger — 100% of days ended at 0 by construction. Third time this shape has bitten
  (the stale `dist`, the wing weight nobody could feel). Before trusting a number, ask
  what value it CANNOT take.
- **The whole-day aggregate hides the storey.** §5.10 survived twenty-two rounds of
  economy tuning because every published number was a per-day total, and a ground floor
  that charged one step a room while a solve paid twelve looked exactly like one that
  bit. If a criterion is about a place, it has to be measured at that place.
