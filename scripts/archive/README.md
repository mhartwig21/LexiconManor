# scripts/archive — one-shot drivers, frozen

**Nothing in this directory runs. Nothing in this directory is maintained. Do
not trust a number you read in one of these files without re-deriving it.**

That warning is the whole reason the directory exists.

There were 62 Playwright drivers in `scripts/`, and CI ran none of them. Each
was written by one agent for one round, ran once, found its bug, and then
rotted quietly in place. The cost was not the disk space — it was that the
next agent could not tell which of them still told the truth, so the Linen
Closet's clue panel was "fixed" in three separate rounds, each time by
somebody re-deriving from scratch what an earlier script already knew.

The 58 files here are that pile, sorted into the only two categories that
matter to whoever reads them next.

---

## A. SUPERSEDED (49 files)

Every claim these made about **our glass** is now made by
`scripts/smoke-gate.mjs`, which runs in CI on every commit, at 375x667 and
390x844, with a self-test on its own verdicts and a `--prove` pass that
re-introduces six shipped defects and fails unless the gate goes red.

They are kept as source, not deleted, because there is real technique in
them, and most of it is already harvested into the gate:

| technique | came from | where it lives now |
| --- | --- | --- |
| the pointer-event trap — `element.click()` drives nothing here, the game commits on pointerdown/pointerup | `r20-glass-drive.mjs` | `drivenChecks()` |
| radius-scaled hit probing, and never probing corners because the hive is a hexagon and half the buttons are pills | `r8-tap-targets.mjs` | `probeHits()` |
| seeding a room under her feet through `window.__manorStore`, and pinning the puzzle id so the walk is the same walk twice | `critic-rooms-audit.mjs`, `r8-tap-targets.mjs` | `enterRoom()` |
| draining a campaign moment the way a player does — one tap each, and only when the moment is not the subject | `smoke-day.mjs`, `r20-glass-drive.mjs` | `clearMoments()` |
| refusing to measure a server whose edition is not this tree's | `verify-build-stamp.mjs`, `edition.mjs` | `judgeEdition()` + the `vite preview` stale-dist guard |
| walking to `exploring` through the real front step / morning / dialogue rather than writing the phase into the store | `r8-live-walk*.mjs` | `ensureExploring()` |
| measuring how much of a clue row the panel actually paints, not whether the row exists | `r20-glass-drive.mjs` | `drivenChecks()`, the Linen Closet pass |

`a2-dawn-float-and-gate`, `a2-float-trace`, `a2-house-panel`,
`a9-visual-audit`, `a9-visual-audit2`, `anchor-fill-audit`,
`critic-herring-probe`, `critic-library-probe`, `critic-rooms-audit`,
`micro-rooms-round7-verify`, `nav-shots`, `probe-seal-geometry`,
`probe-visual-nav`, `r20-glass-drive`, `r20-room-parchment`,
`r6-critic-rooms`, `r6-critic-rooms2`, `r6-critic-rooms3`,
`r6-critic-rooms4`, `r7-anchor-probe`, `r7-arc-visibility`, `r7-beeline`,
`r7-beeline2`, `r7-compose-audit`, `r7-compose-fit`, `r7-compose-hit`,
`r7-compose-probe`, `r7-day1-sanctum`, `r7-journal-teleport`, `r7-probe`,
`r7-tea-float`, `r8-chrome-height-probe`, `r8-live-walk`, `r8-live-walk2`,
`r8-live-walk3`, `r8-live-walk4`, `r8-live-walk5`, `r8-live-walk6`,
`r8-mystery-wiring`, `r8-sanctum-door-probe`, `r8-svg-type-probe`,
`r8-tap-targets`, `r9-reach-walk`, `round3-capture`, `round4-ergo-audit`,
`round5-capture`, `round5-nav2`, `round6-headline`, `verify-build-stamp`.

## B. FROZEN, NOT SUPERSEDED (9 files)

These measured something the glass gate does **not** measure, so nobody
should read "archived" as "covered".

* `round3-benchmarks`, `round3-benchmarks2`, `round3-benchmarks3`,
  `round3-bench-debug`, `round3-retry`, `round3-sb`, `round5-benchmarks`,
  `spot-check-round3` — the **competitor** benchmark harnesses behind
  `docs/BENCHMARKS.md`. They drive third-party sites (Spelling Bee,
  Connections, Wordle, a hard sudoku) whose markup and paywalls have moved
  since; any of them is likelier to be measuring a consent dialog than a game.
  Re-derive before quoting.
* `r7-critic-economy` — a round-7 economy/dialogue drive. The claims are
  economy claims, and the economy is covered by `tests/` and by
  `scripts/smoke-day.mjs`, not here.

## What is still live in `scripts/`

* `smoke-gate.mjs` — **the glass gate**. CI, every commit, both phones.
* `smoke-day.mjs` — the only full in-game-day walk there is; it asserts the
  step economy (the day-1 climb, the free probe, the refund) which the glass
  gate deliberately says nothing about. Not superseded, and not yet in CI.
* `lint-chrome-clearance.mjs` — the CI lint whose class of defect stopped
  recurring, and the shape the glass gate was built to copy.
* `edition.mjs`, `dist-guard.ts`, `build.ts`, `build-sw-precache.ts` — build
  integrity.
* `gen-grain.mjs`, `gen-pwa-assets.ts`, `draft-shape.ts`, `review-metrics.ts`,
  `round3-plan.ts`, `wordweb-mechanics.ts`, `gate-vite.config.ts` — tooling.

Comments across `src/` still cite several of these by their old
`scripts/<name>.mjs` path (chrome.css, journal.css, a5micro.css,
counting-house.css, moment/dock.ts, and two test files). Every one of those
names is listed above; the file is one directory deeper, and frozen.

**The rule going forward: a probe worth writing twice belongs in
`scripts/smoke-gate.mjs`, wired to CI, with a fixture that proves it can go
red. A probe worth writing once is a probe you should expect to be archived
next round.**
