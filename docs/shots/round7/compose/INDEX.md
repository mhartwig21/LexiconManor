# Round 7 — mobile composition pass

**Owner directive:** *"make sure that all buttons, text, typography, etc. are visible on
screen on a mobile phone and that it looks good."*

Both halves, measured. Every number below is a bounding box, a computed style or a hit
test taken by driving the real build in the real browser — no impressions, no stills used
as evidence for anything §11 owns (AAA §0.1.7).

## The harness

`scripts/r7-compose-audit.mjs` — the walk. Playwright against **system Edge**
(`channel: 'msedge'`, never a downloaded browser), **one** instance, closed in a
`finally`, sequential routes. 26 surfaces × **390×844 and 375×667** × **light and dark**,
run twice: once with `prefers-reduced-motion` off (`metrics-after.json`) and once with it
on (`metrics-after-rm.json`). Per surface it records page-level horizontal scroll,
elements past the viewport, text clipped by an overflow-hidden ancestor, tap targets under
44pt, controls in the 34px home-indicator band, controls under a fixed layer,
body-text contrast in both themes, painted type under the published floors, and — for the
composition half — the largest featureless vertical band and the ink coverage.

`scripts/r7-compose-fit.mjs` — the room-fit worksheet: stage box and the height of every
child of every room column.
`scripts/r7-compose-hit.mjs` — the **effective** tap target: probes outward from each
board cell's centre until the hit test stops answering as that cell, so a target extended
by a pseudo-element is measured for what it really is.

### The safe-area shim — why "before" was measuring the wrong phone

Desktop Chromium resolves every `env(safe-area-inset-*)` to **0**, and this Edge build
has no `Emulation.setSafeAreaInsets` (verified: *"'Emulation.setSafeAreaInsets' wasn't
found"*). So every previous still of this game was taken on a phone with no notch and no
home indicator. The harness walks the live CSSOM and rewrites, in place, every declaration
that mentions the insets — same rule, same specificity, same cascade order — substituting
the iPhone 12 numbers (top 47, bottom 34). Two bugs had to be fixed in the shim itself
before it worked, both recorded in the script:

1. Since CSS Nesting landed, a plain `CSSStyleRule` also exposes an (empty) `cssRules`
   list, so an `if (rule.cssRules) recurse; else inspect` walker skips **every**
   declaration in the app and reports "0 rules rewritten".
2. `padding: calc(…) 0 max(10px, env(safe-area-inset-bottom))` is a *shorthand* carrying
   an `env()`, which Chrome stores as a pending-substitution value:
   `getPropertyValue('padding-bottom')` answers `""` and a per-longhand rewrite silently
   no-ops. The whole declaration block is rewritten instead.

**With the insets applied, the room stage is 651.8px at 390×844 and 481.6px at 375×667 —
not 844 and 667.** Every board in the game was sized against the larger number.

## Per-screen table

Counts are summed over the four viewport × theme combinations of that surface.

| surface / state | before | after | after + reduced-motion | worst dead band |
|---|---|---|---|---|
| `01-front-step` | **clean** | **clean** | **clean** | 35.1% |
| `02-chronicles` | contrast 14, home-band 4, <15px 2 | home-band 2, <15px 2 | home-band 2, <15px 2 | 15% |
| `03-morning-card` | contrast 20, <15px 12 | <15px 4 | <15px 4 | 4.2% |
| `04-dialogue` | contrast 12, <15px 8 | <15px 4 | <15px 4 | 4.2% |
| `05-blueprint` | contrast 8, <15px 4 | <15px 4 | <15px 4 | 4.2% |
| `06-draft-modal` | contrast 44, <15px 4 | <15px 4 | <15px 4 | 4.2% |
| `07-cabinet` | contrast 66, <15px 8 | <15px 8 | <15px 8 | 0% |
| `08-conservatory` | contrast 8, under-layer 12, <15px 10 | <15px 4 | <15px 4 | 13.3% |
| `08-conservatory-mistake` | contrast 9, under-layer 12, <15px 10 | <15px 4 | <15px 4 | 10.8% |
| `09-library` | contrast 4, <15px 30 | **clean** | **clean** | 8.5% |
| `10-gallery` | contrast 8, under-layer 4, <15px 6 | **clean** | **clean** | 5.7% |
| `11-study` | contrast 20, <15px 24 | under-layer 2, <15px 10 | under-layer 2, <15px 10 | 6.2% |
| `12-darkroom` | contrast 4, <44pt 132, <15px 8 | <44pt 100 | <44pt 84 | 11.8% |
| `13-counting-house` | contrast 4, <44pt 324, <15px 32 | under-layer 18, <44pt 324, <15px 20 | under-layer 18, <44pt 324, <15px 20 | 5.4% |
| `14-linen-closet` | contrast 4, <44pt 172, <15px 20 | under-layer 6, <44pt 172, <15px 16 | under-layer 6, <44pt 168, <15px 16 | 5.4% |
| `14b-gallery-solved` | contrast 14, <15px 6 | **clean** | **clean** | 9% |
| `14c-room-unregistered-kind` | contrast 4, <15px 4 | **clean** | **clean** | 54% |
| `14d-room-no-active` | contrast 8, <15px 4 | <15px 4 | <15px 4 | 4.2% |
| `15-journal` | contrast 20, <15px 10 | <15px 2 | <15px 2 | 3.6% |
| `15-journal-tab-1-Engravings` | contrast 8, <15px 8 | **clean** | **clean** | 50.2% |
| `15-journal-tab-2-Testimony` | contrast 4, <15px 8 | **clean** | **clean** | 55% |
| `15-journal-tab-3-Letters` | contrast 12, <15px 8 | **clean** | **clean** | 63.5% |
| `16-sanctum` | contrast 12, <15px 10 | <15px 2 | <15px 2 | 12.8% |
| `17-dusk` | contrast 11, <15px 8 | **clean** | **clean** | 44.1% |
| `18-night-digest` | contrast 12, <15px 8 | **clean** | **clean** | 6.2% |
| `19-not-found` | contrast 12, <15px 8 | **clean** | **clean** | 16.1% |

## Screenshots

`<tag>--<surface>--<viewport>-<theme>.png`, tag `before` or `after`, shot at the two
diagonal corners of the grid (390×844 light, 375×667 dark) with the insets shimmed in, so
the images are the device layout and not the desktop one.

Worth opening side by side:

- `*--08-conservatory--390x844-light.png` — Delete / Shuffle / **Enter** were 64px below
  the bottom of their own stage. The room's primary verb, off the glass, on the target
  device.
- `*--05-blueprint--390x844-light.png` — the footer plate and its index tabs.
- `*--01-front-step--390x844-light.png` — the title plate.
- `after--15-journal-ruled*.png` — the journal page, ruled, with the text blocks masking
  the rules they sit on.

## Raw data

- `metrics-before.json`, `metrics-after.json`, `metrics-after-rm.json` — every finding,
  per surface, per combination, with selectors and boxes.
- `fit-before.json`, `fit-mid.json`, `fit-after.json` — the room-fit worksheets.
- `_table.md` — the generated table above.
