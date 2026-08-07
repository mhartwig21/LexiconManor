# Round 8 — tap targets and composition residue

Round 7's composition pass drove contrast failures to zero on every surface and left
four kinds of residue. This round closes them, and — where a number genuinely cannot be
reached — says so with the arithmetic instead of waving it through.

## The harness

`scripts/r7-compose-audit.mjs` (extended), `scripts/r7-compose-fit.mjs`,
`scripts/r7-compose-hit.mjs`, and a new `scripts/r7-compose-probe.mjs`
(the vertical-budget worksheet: stage box, deck box, the height of every child of the
room column, and the probe-measured *effective* tap target of the board cell).

Playwright against **system Edge** (`channel: 'msedge'`, never a downloaded browser),
**one** instance, closed in a `finally`, sequential routes. 26 surfaces × 390×844 and
375×667 × light and dark, run twice (reduced motion off, then on), with the round-7
safe-area shim in the cascade so every number is the device layout and not the desktop
one (stage 651.8px at 390×844, 481.6px at 375×667).

```
node scripts/r7-compose-audit.mjs --tag before --out docs/shots/round8/compose
node scripts/r7-compose-audit.mjs --tag after  --out docs/shots/round8/compose
node scripts/r7-compose-audit.mjs --tag after --rm --out docs/shots/round8/compose
node scripts/r7-compose-probe.mjs
```

### What changed in the harness, and why it had to

**1. The 6.19 exemption split.** Round 7 reported one `smallTap` number per surface and
the reader had to take on trust which of it AAA 6.19 forgives. That is not a number a
critic can pass or fail. There are four buckets now, and the classifier applies the
*written* ruling rather than a selector's say-so:

| bucket | rule |
|---|---|
| `costedTap` | the label prices the control (`−N steps`). 6.19 forgives **nothing** here, on any surface. |
| `ledgerTap` | 6.19(a), the Counting House 9×9 leaf. Exempt from the number, never from the measurement. |
| `keyboardTap` | 6.19(b), a full-width alpha keyboard key — exempt **only while inside its ruled floor** (≥32 wide × ≥48 tall). |
| `smallTap` | everything else, including a keyboard key that has fallen *out* of its own floor. |

This is what surfaced the two real failures: `.lc-key` was never in the exempt selector
list at all (so it was counted, but nothing said whether it should have been), and both
keyboards fell under the ruled 48px height at 375×667 while being reported as forgiven.

**2. Clipped is not buried.** A control inside an internally-scrolling panel keeps its
layout rect wherever the scroll has left it, so a list row two rows past the end of a
scroller reported a bounding box sitting over whatever is painted below the panel — and
both the burial test and the home-indicator test believed it. Neither was true. Anything
whose centre falls outside its clipping ancestors is now recorded as `offPanel` and
excluded from `buried` / `homeBand`. Same class of error as measuring `env()` on a
desktop browser: the number was real, it was describing a different thing.

**3. The safe-area shim stopped eating the page.** Round 7's shim rewrote a rule's
whole declaration block (`rule.style.cssText = sub(...)`) because a per-longhand rewrite
silently no-ops on a shorthand carrying an `env()`. That is true, and the fix took every
*other* `var()`-carrying shorthand in the same block down with it. Measured: `.jrn-sheet`
declares both `padding: … calc(0.9rem + env(safe-area-inset-bottom))` and
`background: <two gradients>, var(--paper-raised)` (plus `border: var(--rule)`), and after
one `cssText` round-trip the rule's `background-image` is the empty string and the computed
value is `none`. So the journal's **ruled page — added in round 7 precisely because the
sheet measured as featureless parchment — was being erased by the instrument that
photographed it**, in every still round 7 produced. The rewrite is additive now: each
inset-bearing declaration is lifted out of the rule's own text (`rule.cssText` keeps the
authored `env()`), substituted, and re-declared `!important` in one appended stylesheet
under the rule's own selector inside its own media condition. Nothing is assigned back
into an existing block.

**HONESTY NOTE on the dead-band column.** The `before` numbers were taken with the round-7
shim, i.e. against a page missing the borders and backgrounds of every rule that carried an
`env()`. The final `after` numbers were taken with the corrected shim. For the four journal
rows the `→ 0%` is therefore **not** a like-for-like delta: it is mostly `.jrn-sheet`'s own
`border` surviving the shim, and the harness's ink-row scan credits a bordered element
across its whole height. The composition work on those tabs is real and is evidenced by the
screenshots, not by that number. Every other column (tap targets, under-layer, home band,
type floors) is geometry and computed style and is unaffected.

**4. The dusk veil's animations are *all* jumped.** The survey freezes dusk's animations
at their last frame (its resting appearance is what the criterion is about). The new
candle was not in that selector list, so it measured at opacity 0 and the composition fix
looked like it had done nothing.

## Per-screen table

Counts are summed over the four viewport × theme combinations of that surface.
`ledger(ex)` and `keys(ex)` are the two **exempt** classes — recorded, never failed.

See `_table.md` (generated from the metrics JSON).

## Raw data

- `metrics-before.json`, `metrics-after.json`, `metrics-after-rm.json` — every finding,
  per surface, per combination, with selectors and boxes.
- `probe.json` — the vertical-budget worksheet for the four rooms that were over their
  stage.
- `_table.md` — the generated before/after table.

## Screenshots

`<tag>--<surface>--<viewport>-<theme>.png`, tag `before` or `after`, shot at the two
diagonal corners of the grid (390×844 light, 375×667 dark) with the insets shimmed in.

Worth opening side by side:

- `*--14c-room-unregistered-kind--390x844-light.png` — 54% featureless → 20.9%.
- `*--15-journal-tab-2-Testimony--390x844-light.png` — 55% → 15.2%.
- `*--17-dusk--390x844-light.png` — the veil's 372px void, now holding the day's candle.
- `*--13-counting-house--390x844-light.png` — the ledger cell back from 39px to 42px, and
  the toolbar's 12.8px labels at the 15px floor.
- `*--14-linen-closet--390x844-light.png` — the crossword square at 44pt, the QWERTY
  inside 6.19(b), the clue rows at 44pt.
- `*--11-study--390x844-light.png` — the sealed (costed) clue rows moved into the sticky
  deck; nothing that spends steps can be behind anything now.
