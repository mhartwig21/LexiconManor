# Lexicon Manor — where we are

*Written 7 Aug 2026, after thirteen build rounds and one hostile editorial review.*

**Live:** https://mhartwig21.github.io/LexiconManor/ — installable on iPhone via Add to
Home Screen. Deploys from `main` on push; verify the run actually succeeded, because
three in a row silently did not (see *Lessons* below).

**Repo:** github.com/mhartwig21/LexiconManor · 33 commits · working tree at `c673921`.

---

## 1. What the game is now

A cozy-detective word-puzzle roguelike. You draft rooms onto a 5×7 blueprint of a manor,
each holds a word game, mistakes cost **steps** rather than health, and a mystery — a
word struck from every dictionary — is assembled across days from clues you find and
decipher.

**Seven rooms, 1,083 shipped puzzles.**

| Room | Game | Puzzles |
|---|---|---|
| The Library | Word Web (Connections-style) | 156 |
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

Also shipped outside the review's list: room orientation now follows the direction you
enter (and the draft card shows the true placement); a fresh-start reset; the
first-meeting ceremony; Bramble's whereabouts asides; wings, so the horizontal axis of
the manor means something.

---

## 3. What is left

Ordered as the review ordered them — most value first.

**In flight**
- **§5.8 Word Web variety.** ~67% of groups are one of eleven mechanical templates and
  the difficulty colours are decorative. The Library is the marquee game and our
  head-to-head with Connections. An agent is measuring the true distribution with a
  re-runnable classifier before changing anything.

**Queued**
- **§5.6 Anchor time/reward parity.** A forty-minute sudoku pays the same +6 as a
  twenty-second Gallery solve.
- **§5.9 House voice in puzzle content.** Stock proverbs in the cipher; 155 unique clues
  across 360 crossword entries. The puzzles are not yet *about* the lexicographer.
- **§5.10 Step pressure below row 4.** The ground floor has no tension.
- **§5.11 The night, and player choice.** Three night-line variants; ~20 player choices in
  the whole game; notice cards can overlap; per-room palettes borrow from other products.

**Open design questions, awaiting play rather than analysis**
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
