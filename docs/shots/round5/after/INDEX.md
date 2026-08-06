# Round 5 — AFTER (post gap-fix verification)

Re-shoot of the round-5 tour taken by the **verifier**, after every Round 5
SHARED-FILE REQUEST was applied and reconciled. Same script
(`scripts/round5-capture.mjs`, run with `R5_OUT=docs/shots/round5/after`),
same harness rules: Playwright driving **system Edge** (`channel: 'msedge'`),
**one** browser instance, closed when done, against `npx vite preview` on
`http://localhost:4173/LexiconManor/`.

* **Primary viewport: 390 × 844 @2x** — every file in this folder (44 shots).
* **Secondary viewport: 375 × 667 @2x** — `375x667/`.

Compare against the sibling `docs/shots/round5/` for the before state.

---

## The build caveat from the baseline INDEX is CLEARED

The baseline index opens with "`npm run build` is **RED**" — `tsc --noEmit`
failing because the regenerated pools had dropped `difficulty` while
`src/engine/types.ts` still declared it required. That is fixed: the type and
its three field declarations are gone, and **these shots were taken against a
`dist/` built from a clean typecheck**, so the served app is serving the
current pools rather than stale ones.

Green at capture time: `tsc --noEmit` 0 errors · `vitest run` 573/573 ·
`content:verify` pass · `vite build` succeeds.

---

## What these shots are evidence for

| Shot | Shows |
|---|---|
| `04`, `10`, `11` | The blueprint's **step rate card** in the left margin (`−5 −5 −4 −3 −2 −1 −1`), tier pips, and price stamps on walk/ghost targets where the price differs from the player's storey. |
| `10-padlocks-no-key` | The brass padlock drawn **shut** with 0 keys in pocket, on a frontier door — the gate is legible before a step is spent toward it. |
| `11-padlocks-key-in-pocket` | The same locks in the **ready** state (shackle swung open, gilt) once keys are held — shape carries the state, not hue alone. |
| `05`, `12` | Draft modal: both prices named, warm token-derived scrim (no pure black). |
| `15-journal-scrolled` | **No longer a duplicate of `14`.** The lower half of the journal: the alphabet-as-the-engravings-leave-it grid, the derived "Six candles — 6 letters", Ellery's right-aligned margin note signed "— E.", and "Take it to the Sanctum". |
| `16-sanctum-before-guess` | Nameplate engraving sits **inside** its brass plate with clear margin; the `the forgotten word` placeholder renders unclipped; the Portrait's **spectacles** are back on the cameo; and **"Speak with the Portrait"** — his haunt, which shipped unmounted. |
| `22-library-solved` | The four woven threads and the "Woven." verdict. **Also the standing typography defect**: `Anagrams of ”LISTEN”` and `Contains ”OUT”` render with both quotes as right-curly. |
| `25-conservatory-fullbloom` | **Full Bloom is a landing, not an ejection.** The hive stays on the table, the ladder reads "Full Bloom · In full flower", the note offers "gather on, or step out", the "Still folded ▾" affordance is present, and the footer's primary verb is **"Step back out"** — not "Leave it for tomorrow". No verdict panel here, which is correct. |
| `32`–`34`, `38`–`39c` | Darkroom and Counting House fitting the glass. Asserted, not eyeballed: `.dk-sheet` cleared the deck by **162px**, `.ch-leaf` by **67px** at this viewport. |
| `41-chronicles-settings` | **No longer a duplicate of `40`.** |

Every one of the 44 shots in this folder has a **unique md5** — the two
byte-identical pairs the round-5 review found (`14`/`15` and `40`/`41`) are gone.

---

## Known evidence gaps (stated, not papered over)

1. **`25-conservatory-solved` does not show the Every Petal verdict panel.**
   The tour reached Full Bloom (41 words) and then could not drive the board to
   100% through the UI, so the 100%-only panel and its `+1 gem` — the reward
   that was unreachable dead code before round 5 — still have **no visual
   evidence**. The script now warns instead of passing silently. This is the
   one open item for the next capture.
2. `12-draft-upper-row` is a best-effort shot: the tour hunts for a premium
   offer behind a padlocked door and takes the closest match it finds, logging
   what it settled for.

---

## Harness fixes made to get honest evidence

The capture script itself was producing false evidence; four bugs were fixed in
`scripts/round5-capture.mjs` while re-shooting:

1. **Duplicate shots.** `15` and `41` scrolled by hard-coded selectors that
   matched nothing (every panel here scrolls *internally*, so a page-level
   scroll is a no-op). Replaced with `scrollPanel()`, which finds the largest
   genuinely-overflowing descendant and **warns when nothing moved**.
2. **The tour died at shot 09 and silently lost the other 30+.** `manor` is
   null until the day reaches `exploring`, and several `page.evaluate` blocks
   dereferenced `st.manor.rooms` unguarded. Guards now live *inside* the
   evaluate (a wait-then-evaluate pair is two round trips and the day machine
   can null it between them).
3. **One bad room took every later room with it.** Each room is now isolated in
   its own `try`/`catch`, as are the two fragile pre-room sections.
4. **A twenty-minute phantom hang.** `page.click(sel).catch(() => {})` on a
   *disabled* button burns the full 15s default timeout and swallows the error.
   The room verbs are disabled by design most of the time. Replaced with
   `softClick()` at a 2s cap.
