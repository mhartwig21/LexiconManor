# Lexicon Manor — Architecture

*The build plan: module boundaries, data formats, and the file-ownership partition for
parallel agents. Refined against `MANOR_DESIGN.md`, `AAA_BAR.md` (criteria referenced as
"AAA X.N"), and `BENCHMARKS.md`. Supersedes the raw architecture report.*

---

## 0. What exists today (verified)

- **Stack:** Vite 7 + React 19 + TypeScript, `wouter` hash routing (`useHashLocation`,
  already subpath-safe), single `zustand` store, vitest (tests in `tests/`),
  `base: './'` in `vite.config.ts`. No PWA anywhere.
- **Engine (`src/engine/`, pure TS, `(state, action) -> state`):** `word-web.ts`,
  `hive.ts`, `twistle.ts`, `forgotten-word.ts` (each `startX(puzzle)` /
  `submitX(...) -> {state, result}`), plus `rng.ts` (seeded), `scoring.ts`, `map.ts`
  (fork/diamond — dies), `run.ts` (mind points — mostly dies), `effects.ts`
  (glyphs/perks — quarantined), `achievements.ts`, `stats.ts`, `types.ts`.
- **App layer:** `src/app/store.ts` (all mutations, persists per action), `save.ts`
  (localStorage `lexicon-loop-save-v2`, `SaveFile.version: 1`, base64 save-code export),
  `content.ts` (imports `content/generated/*.json`, seeded selection + seen-tracking),
  `sound.ts` (`sfx`).
- **UI:** `pages/` (Home, Map, Play, Chronicles, Sanctum = perk-loadout page — name
  collides with the new Sanctum), `modes/` (one component per mode, each calling
  `applyWrongAttempt`/`finishNode`/`markPuzzleSeen` directly), `components/`.
- **Content pipeline (`content/`):** `build-dictionary.ts` (enable1 + frequency),
  `generate-hive.ts`, `generate-twistle.ts`, `lib/dictionary.ts`, hand-authored
  `forgotten-word.json` & `word-web.json`. Offline-generated, solver-verified, static
  JSON. This pattern extends to everything new (including AAA 2.7's red-herring
  validator).

## 1. Target directory plan

```
lexicon-loop-v2/
├─ vite.config.ts                 # base: env-driven → MANOR_BASE for pages build, '/' dev
├─ scripts/
│  ├─ build-sw-precache.ts        # globs dist/ → injects PRECACHE list into sw.js
│  └─ gen-pwa-assets.ts           # wraps pwa-asset-generator: icons + iOS splash <link> set
├─ public/
│  ├─ manifest.webmanifest        # standalone, theme_color = parchment, maskable icons
│  ├─ icons/                      # 192, 512, maskable 512, apple-touch-icon 180 (opaque!)
│  └─ sw.js                       # hand-rolled service worker (§8)
├─ content/
│  ├─ build-dictionary.ts, lib/dictionary.ts          # KEEP
│  ├─ generate-hive.ts, generate-twistle.ts           # KEEP
│  ├─ lib/phonetics.ts            # NEW: CMUdict subset → rhyme keys (build-time ONLY)
│  ├─ generate-anagram.ts, generate-ladder.ts, generate-cipher.ts,
│  │  generate-crossword.ts, generate-rhyme.ts, generate-category.ts    # NEW
│  ├─ generate-volume.ts          # NEW: fragment sets from forgotten-word entries
│  ├─ validate-word-web.ts        # NEW: red-herring budget + uniqueness solver (AAA 2.7/2.8)
│  ├─ validate-dialogue.ts        # NEW: ids, gotos, condition kinds, portrait keys,
│  │                              #      per-box char budget (AAA 5.11), orphan/cycle walk (AAA 5.5)
│  ├─ authored/
│  │  ├─ dialogue/{bramble,ellery,posy,fern,portrait}.json
│  │  ├─ letters/volume-1.json
│  │  ├─ categories.json          # hand-curated for the Pantry
│  │  └─ volumes/volume-1.json    # answer, fragments, engravings
│  └─ generated/                  # existing 4 + 6 new puzzle pools (each board ships its
│                                 # planted-herring list for AAA 2.10)
├─ src/
│  ├─ engine/                     # pure TS, zero React/DOM/audio — invariant preserved
│  │  ├─ types.ts                 # v2 types (ARCHITECT-OWNED, frozen early)
│  │  ├─ events.ts                # GameEvent union — the spine (§6)
│  │  ├─ rng.ts, scoring.ts, achievements.ts, stats.ts    # KEEP (scoring trimmed)
│  │  ├─ puzzles/                 # existing 4 moved here + 6 new
│  │  ├─ rooms/
│  │  │  ├─ room-puzzle.ts        # RoomPuzzle interface (§2)
│  │  │  ├─ registry.ts           # kind → adapter map (one fenced line per room)
│  │  │  └─ adapters/*.ts
│  │  ├─ manor/  grid.ts · deck.ts · drafting.ts          # §3
│  │  ├─ economy/steps.ts         # StepLedger + STEP_TABLE (§4)
│  │  ├─ day.ts                   # day FSM: morning→exploring→dusk→night
│  │  ├─ dialogue/  schema.ts · select.ts · conditions.ts # §5
│  │  ├─ journal.ts               # fragment filing, grouping, cross-refs
│  │  └─ volume.ts                # mystery FSM (§7)
│  ├─ app/
│  │  ├─ store.ts                 # slice composition ONLY (architect-owned shell)
│  │  ├─ slices/{day,manor,room,dialogue,journal,meta}.ts
│  │  ├─ save.ts + migrations.ts  # v2 schema + v1→v2 (§9)
│  │  ├─ content/                 # content.ts split per domain: puzzles/dialogue/volumes/deck
│  │  ├─ sound.ts                 # KEEP (sfx) — routed through the music duck bus (§8)
│  │  ├─ music/                   # generative engine (§8) — the only audio-touching code
│  │  ├─ pwa.ts                   # SW registration + update-prompt toast
│  │  └─ platform/                # iOS glue: viewport.ts (VisualViewport → CSS var),
│  │                              # persistence.ts (flush points, storage.persist, dual-write)
│  ├─ ui/
│  │  ├─ theme/tokens.css         # palette/type tokens from the style guide (architect-owned)
│  │  ├─ blueprint/               # parchment grid view, player token, DraftModal
│  │  ├─ rooms/                   # RoomHost.tsx + view registry + per-kind views
│  │  ├─ dialogue/                # PortraitScene, TypewriterText, ChoiceRow
│  │  ├─ journal/                 # tabs: fragments, characters, letters, floorplan cabinet
│  │  ├─ sanctum/                 # guess flow + Portrait scene
│  │  └─ chrome/                  # DayHeader, StepMeter, OutcomeToast
│  ├─ pages/  Home · Manor · Room · Journal · Chronicles · Sanctum (rewritten)
│  └─ App.tsx                     # routes: /, /manor, /room, /journal, /chronicles, /sanctum
└─ tests/   grid · drafting · steps · day · dialogue · journal · volume ·
            puzzles/* · migrations (frozen v1 fixture) · economy-simulation (AAA 4.10)
```

**Deleted:** `engine/map.ts`, `tests/map.test.ts`, `pages/MapPage.tsx`,
`components/MindPoints.tsx`, PlayPage DefeatScreen, mind-point code in `run.ts`, all
defeat copy (enforced forever by the string-table lint, AAA 4.12).
**Quarantined, not deleted:** `effects.ts` glyph/perk data (open question AAA §10.1) —
`GlyphTray` removed from room UIs, defs kept compiling; the current SanctumPage
perk-loadout UI parks under Chronicles until decided.

## 2. RoomPuzzle interface (the load-bearing abstraction)

Two halves — a **pure adapter** (engine) and a **view** (React) — joined by a kind-keyed
registry. Adapters never touch steps or the store; they emit events, the room slice
applies economy.

```ts
// engine/rooms/room-puzzle.ts
export type RoomPuzzleKind =
  | 'word-web' | 'hive' | 'twistle' | 'forgotten-word'                    // anchors
  | 'anagram' | 'ladder' | 'cipher' | 'crossword' | 'rhyme' | 'category'; // micro

export interface RoomContext { tier: 1|2|3; seed: number; volumeId: string; }

export interface RoomOutcome {
  status: 'active' | 'solved' | 'abandoned';
  perfect: boolean;                        // no costed mistakes → +2 bonus
}

export type RoomEvent =                    // consumed by slices, never by adapters
  // weight 0 = free feedback moment (shake/toast, no step cost) — e.g. Conservatory
  // invalid dictionary words per AAA R.1. weight 1|2 = costed, mapped via STEP_TABLE.
  | { type: 'mistake'; weight: 0 | 1 | 2 }
  | { type: 'progress'; detail?: string }  // sfx/juice/music-director hook
  | { type: 'solved'; perfect: boolean }
  | { type: 'reward'; gems?: number; keys?: number; fragmentId?: string };

export interface RoomPuzzleAdapter<P = unknown, S = unknown, A = unknown> {
  kind: RoomPuzzleKind;
  size: 'micro' | 'anchor';
  select(opts: { tier: 1|2|3; seed: number; seenIds: string[] }): P;   // seeded, seen-aware
  start(puzzle: P, ctx: RoomContext): S;
  reduce(puzzle: P, state: S, action: A): { state: S; events: RoomEvent[]; outcome: RoomOutcome };
  puzzleId(puzzle: P): string;
}
```

- **Anchor adapters wrap, don't rewrite**: `adapters/twistle.ts` calls existing
  `startTwistle`/`submitTwistleWord` and translates results to events. Per-kind mistake
  semantics (the double-punishment risk):
  - **Hive:** entropy stays cosmetic-internal; invalid dictionary word → `weight: 0`
    (free, AAA R.1); structural violations pre-warned by live coloring → `weight: 1`.
    In-room rank ladder (AAA 1.11) lives in the adapter's state; `solved` fires at the
    70% tier.
  - **Word Web:** wrong group → `weight: 1` (steps-not-lives); herring acknowledgment
    and one-away info ride on `progress.detail`.
  - **Forgotten Word:** out-of-guesses → auto-`abandoned`, never a fail.
  - Malformed input in any room is always `weight: 0` (AAA 3.2).
- **React side:** `ui/rooms/RoomHost.tsx` reads `save.day.activeRoom`, looks up
  adapter + view, holds session state, pipes
  `dispatch(action) → adapter.reduce → slice.applyRoomEvents(events, outcome)`. Views
  get `{ puzzle, state, dispatch, tier }` — they never import the store for economy.
  This one change decouples the four existing mode components from
  `applyWrongAttempt`/`finishNode`.
- **Abandon** is a host-level action — works for every kind, guarantees the
  always-abandonable pillar (AAA 4.13) with zero per-game code.

## 3. Grid & drafting engine

```ts
// engine/manor/grid.ts
export type Dir = 'N'|'E'|'S'|'W';
export interface Cell { col: 0|1|2|3|4; row: number /* 0..6, 0 = bottom */; }
export interface PlacedRoom {
  cardId: string; cell: Cell; doors: Dir[];      // rotation resolved at placement
  solved: boolean; kind: RoomPuzzleKind | 'parlor' | 'utility' | 'mystery';
  puzzleId?: string;                             // pinned at placement — re-entry stable
}
export interface ManorState {
  rooms: Record<string /* "c,r" */, PlacedRoom>; // entrance (2,0) & sanctum (2,6) pre-placed
  playerCell: Cell;
  daySeed: number;
}
// legality: target empty & in-bounds & adjacent via a door on the current room;
// deadDoors(room, manor) = doors into the outer wall or a doorless neighbor wall.
```

```ts
// engine/manor/drafting.ts
export interface DraftOffer { atDoor: Dir; from: Cell; cards: RoomCard[]/*3*/; rerolled: boolean; }
```

Drafting rules (Blue Prince lessons baked in — AAA 4.1–4.8):
- **Affordability-aware offers:** with 0 gems, ≥1 free card guaranteed; premium-card
  probability scales with row band AND current gem count (never dangle what she can't buy
  as the only good option).
- **Two-stage draw:** roll rarity tier by row band (rows 1–2 / 3–4 / 5–6 → tier 1/2/3;
  violet weight ramps with row, green fades) → roll card within tier.
- **Anti-repeat suppression** on cards offered-and-declined last draft (rarity-scaled).
- **Deterministic streams:** draft rng = `createRng(hash(daySeed, cellKey, drawIndex))`
  so a reroll at door A never perturbs door B (property-tested, AAA 4.8).
- **Cancellable:** backing out costs only the step already spent (AAA 4.6 — the
  anti-Blue-Prince fix). Reroll: 1 gem, once per draft.
- **Scripted day-1 first draft** (Vestibule, Kitchen, Library or similar — tutorial
  disguised as RNG, AAA 4.5).
- Never an unplaceable offer (AAA 4.4): property test over all cell/door configs.

`deck.ts` holds `RoomCard` defs: `{ id, name, category, puzzleKind?, doorLayouts,
tierRange, gemCost, rarity, unlockedBy? }`. Base deck static; floorplan-cabinet unlocks
append ids from the meta slice. Keep specialist categories small and equal (≈8 cards)
per the Blue Prince memorability lesson.

## 4. Step economy service

```ts
// engine/economy/steps.ts — pure ledger, replayable, journal-friendly
export type StepReason = 'day-start'|'move'|'mistake'|'solve'|'perfect'|'tea'|'snack'|'pet-dewey'|'gift';
export interface StepEntry { reason: StepReason; delta: number; at: number; roomKey?: string; }
export interface StepLedger { budget: number; entries: StepEntry[]; }
export const stepsRemaining = (l: StepLedger) => Math.max(0, l.budget + sum(l.entries));
```

- **STEP_TABLE** is the single tunable const mapping `(mistake weight, tier)` and solve
  payouts to deltas: weight 0 → 0; weight 1 → −2 (tier 3: −3); weight 2 reserved for
  future risk rooms. Solve: micro +3, anchor +6..+8 by tier, perfect +2. This file is
  the only thing wife-playtest tuning touches (AAA 4.9, open questions §10.2–3).
- Every delta flows through `applyRoomEvents`/ledger helpers — no slice writes steps
  directly. UI renders each entry as a floating ±N.
- `engine/day.ts` — lifecycle FSM: `morning` (Bramble scene, budget = 40 +
  affinityBonus) → `exploring` → `dusk` (steps hit 0; **never fires inside an active
  puzzle** — the puzzle finishes, dusk fires on exit; ≤4s fade, AAA 4.12) → `night`
  (journal digest, letters roll, meta banks, manor resets) → next `morning`. Day state
  lives in the save; closing the tab mid-day resumes.

## 5. Dialogue system

One JSON file per character in `content/authored/dialogue/`, checked by
`validate-dialogue.ts` at build time (ids, gotos, condition kinds, portrait keys,
per-box character budget, orphan/cycle detection — AAA 5.5, 5.11).

```jsonc
{
  "character": "ellery",
  "nodes": [{
    "id": "ellery.fragment-react.2",
    "trigger": "parlor",           // morning | parlor | idle | sanctum-after-guess | letter | night
    "priority": 700,               // bands: forced/first-meeting 1000 > event-react 700
                                   //        > milestone/arc 500 > general 100 > idle 0
    "once": true,                  // seen forever; false = idle-pool repeatable
    "cooldownDays": 0,
    "conditions": [
      { "kind": "flag", "flag": "met.ellery" },
      { "kind": "affinity", "character": "ellery", "gte": 2 },
      { "kind": "event", "event": "fragment-found", "withinDays": 1 },
      { "kind": "fragmentCount", "gte": 3 },
      { "kind": "not", "cond": { "kind": "flag", "flag": "ellery.quest1.done" } }
    ],
    "lines": [{ "speaker": "ellery", "portrait": "wistful", "text": "…" }],
    "choices": [
      { "text": "Read it together", "goto": "ellery.fragment-react.2a",
        "effects": { "affinity": { "ellery": 1 }, "setFlags": ["ellery.read-together"] } },
      { "text": "Later, perhaps", "effects": {} }
    ],
    "effects": { "interpretFragment": "frag.v1.03" }
  }]
}
```

Selection (`engine/dialogue/select.ts`) — Hades rules encoded:
- Pure function `(seenSet, flags, counters, affinities, recentEvents, slot) → node`:
  filter by trigger → evaluate conditions against a `DialogueQuery` snapshot → drop
  seen-`once` and cooling-down → max priority, ties by file order (deterministic,
  unit-tested — AAA 5.4).
- **Never invalidate stale content** (Supergiant's rule): an out-of-date line beats
  silence; nothing is permanently missable.
- **Pacing valves:** one substantive conversation + one gift per character per day
  (per-character daily flags); further visits query `trigger:'idle'` only; the valve is
  surfaced with a warm idle line (AAA 5.9).
- **Two independent tracks per character**, exactly like Hades: `affinity`
  (integer, gift-fed) and the arc chain (seen-linked). Milestones require both; locked
  rank + favor quest for ≥3 characters (AAA 5.8).
- Skipping records seen + applies effects; journal logs a one-line summary (AAA 5.10).
- Flag naming convention published in `docs/flags.md`: `character.topic.step`.

Authoring floors (AAA 5.6): per major character ≥40 conversations with the
event-reaction bucket ≥12 (Bramble's day-end reactions are the Hypnos slot); lint the
authored JSON for these counts in CI.

## 6. Event spine

`engine/events.ts` defines the `GameEvent` union (`fragment-found`, `room-solved`,
`sanctum-guess-wrong`, `letter-opened`, `affinity-rank-up`, `volume-solved`,
`dewey-petted`, `day-ended` with cause, …). The day slice appends to
`day.recentEvents` (day-stamped, cleared at dusk; counters persist forever). Dialogue
conditions, achievements, journal cross-refs, and the music director all *read* this one
stream. **This file must exist and be frozen before parallel work starts** — it is what
keeps six systems decoupled, and it directly implements AAA 5.1 (reaction latency).

## 7. Journal & volume mystery FSM

```ts
// engine/volume.ts
export interface VolumeDef {
  id: string; answer: string; accepted: string[];
  fragments: FragmentDef[];   // { id, kind: 'definition-line'|'engraving'|'testimony',
                              //   text, sourceRoomCategory, group, revealOrder }
  letters: LetterDef[];
}
export interface VolumeState {
  volumeId: string; day: number;
  foundFragmentIds: string[];          // persist forever
  interpretedFragmentIds: string[];    // Ellery's service
  guesses: { day: number; guess: string }[];   // gate: one per day
  status: 'active' | 'solved';
}
```

- `guessAtSanctum`: normalize, check `accepted[]`. Wrong → `sanctum-guess-wrong` event
  carrying closeness metadata (shared letters, right length, repeat) so the Portrait's
  sigh variants key off it (AAA 4.17). Right → `volume-solved` → night sequence →
  `advanceVolume` (fresh state; journal archives the closed volume, still readable).
- **Anti-RNG-gating** (the Blue Prince fix, AAA 4.14): every fragment class has ≥2
  source types (violet rooms, testimony, letters); mystery-room drafts pull the lowest
  unfound `revealOrder` (deterministic drip); a pity rule force-seeds a violet offer if
  no new fragment appeared in 3 days. Simulation test over seeded volumes.
- `engine/journal.ts` is pure derivation: groups by `group`, renders letter-constraint
  engravings against the alphabet, orders definition lines with `— ? —` gaps, exposes
  nudge hooks for characters. Any seen document re-readable in ≤2 taps (AAA 4.15);
  insufficient-info nudges at the Sanctum (AAA 4.16).

## 8. Audio & music engine (`src/app/music/` — the only audio-touching code)

Module boundaries (refined from the music research; nothing in `src/engine` imports
audio):

- `context.ts` — lazy singleton AudioContext; gesture unlock on `touchend`/`pointerup`
  (never `touchstart`); interrupted-state recovery (`statechange` + `visibilitychange`
  → retry `resume()`, re-arm a one-time gesture listener as fallback);
  `navigator.audioSession.type = 'playback'` behind the settings toggle (open question
  AAA §10.4); suspend on hidden, rebuild phrase state on show. **Nothing anywhere waits
  on AudioContext state** (AAA R.4 — iOS 26 PWA audio bug defense).
- `graph.ts` — `buildAudioGraph(ctx)`: idempotent, the ONLY graph constructor (enables
  the sample-rate-flip teardown/rebuild fix). Permanent bus skeleton:
  `voices → duckGain → moodLowpass`, beds bus, one shared reverb send
  (pre-delay → single ConvolverNode, IR generated at `ctx.sampleRate` via
  OfflineAudioContext), gentle master compressor, masterGain. Voice subtrees
  attach/detach; fresh nodes per note (never reuse long-lived AudioParams).
- `theory.ts` — pure: scales/chord-walk rules (≥2 common tones, top voice ≤2 semitones,
  register floors), reuses `engine/rng`.
- `instruments.ts` — FM piano (1:1 body pair, fast-decaying mod index), additive
  celesta/music box (inharmonic partials, ≥C5), noise-attack transients; anti-click
  ramps everywhere.
- `beds.ts` — pre-rendered noise buffers (pink/brown at `ctx.sampleRate`), rain /
  fireplace / clock beds with event sprinkles (droplets, crackle clusters, 1.0s tick).
- `scheduler.ts` — lookahead clock (25ms tick / 100ms horizon vs `ctx.currentTime`);
  incommensurable note-loops + probabilistic phrase generator (no `loop=true` on
  anything musical).
- `director.ts` — the only module that knows the game: subscribes to store selectors +
  the GameEvent stream; maps `{dayPhase, steps band, roomCategory, sanctum proximity}` →
  `RoomMood` presets `{scaleMask, chordPair, density, brightness, bedMix, reverbSend,
  register}`; crossfades parameters over 1.5–3s (`setTargetAtTime`), retunes loops only
  at their next natural fire time — never hard-cuts (AAA 8.8).
- `duck.ts` — explicit refcounted gain ducking (no compressor sidechain exists): SFX −4
  to −6 dB fast-attack/slow-release; dialogue −6; fanfare −9; also ducks the *density*
  parameter. `app/sound.ts`'s sfx bus routes through this.

Budget (AAA 8.4, 8.13): exactly 1 ConvolverNode (≤3s stereo IR), ≤24 simultaneous
oscillators, ≤4 looping noise sources, ≤15 biquads, 1 master compressor. No
ScriptProcessorNode, no AudioWorklet, no fetched assets.

## 9. PWA & platform layer (iOS constraints baked in)

**Build config:**
- `vite.config.ts`: `base: process.env.MANOR_BASE ?? '/'` — CI sets the Pages subpath.
  The current `'./'` relative base breaks SW scope resolution; SW registers at
  `import.meta.env.BASE_URL + 'sw.js'`. CI hard-checks built `dist/` for the prefix in
  manifest `start_url`/`scope` and SW precache URLs (AAA 7.5).
- Hand-rolled `public/sw.js` (app is small; skip vite-plugin-pwa): precache list
  injected by `scripts/build-sw-precache.ts` — **must glob the generated content JSON**
  (`**/*.{js,css,html,png,webp,woff2,json}`) or offline play breaks on room entry
  (AAA 7.4). Cache-first for hashed assets, network-first for `index.html`; version
  bump = new cache name + delete old. Not registered in dev. No Background Sync
  (doesn't exist on iOS) — all persistence from the page, never the SW.
- Update flow: `updatefound` → "A new edition of the Manor has arrived — refresh?"
  toast; on accept `skipWaiting` + reload on `controllerchange`; never auto-reload
  mid-puzzle (AAA 7.6).
- Hash routing kept — deep links work on Pages with a single `index.html`, no 404 hack.

**iOS head/meta (index.html):** `viewport-fit=cover` viewport meta;
`apple-mobile-web-app-capable`; `black-translucent` status bar (top safe-area band is
decorative parchment only — 26.1-bar defense, AAA 7.8); 180×180 opaque
`apple-touch-icon`; full `apple-touch-startup-image` link set emitted by
`scripts/gen-pwa-assets.ts` (`pwa-asset-generator`), including dark variants (AAA 7.2).

**App shell (`ui/` + `app/platform/`):**
- Fixed shell: `html, body { position: fixed; overflow: hidden; height: 100% }`,
  `#app { height: 100vh; height: 100dvh }` — no page scroll ever (house rule + AAA 7.7).
  Internal panels scroll with `overscroll-behavior: contain`.
- `platform/viewport.ts`: VisualViewport listener → `--vv-height` CSS var so entry rows
  ride above the iOS keyboard (which does NOT resize the layout viewport — AAA 7.9);
  all text inputs ≥16px (kills focus auto-zoom).
- Touch hygiene globally: `touch-action: manipulation` on html; `touch-action: none` +
  `gesturestart` preventDefault on boards; `-webkit-tap-highlight-color: transparent`,
  `-webkit-touch-callout: none`, `user-select: none` (re-enabled only where copying is
  a feature); pressed states driven from `pointerdown` (AAA U.1, 7.11–7.13).
- `platform/persistence.ts`: save on every meaningful mutation; flush on
  `visibilitychange:hidden` + `pagehide` (never `beforeunload`); dual-write
  localStorage + IndexedDB mirror; `navigator.storage.persist()` at first save;
  every write try/caught with visible degradation (AAA 7.17–7.20). Save-code
  export/import retained — it is also the bridge across the Safari-tab vs
  installed-app storage-container split (AAA 7.19), which is surfaced in-game with an
  install prompt ("bring your journal with you").

## 10. Save schema v2 + migration

Same key `lexicon-loop-save-v2`; bump `version: 2`. Top-level shape:
`{ version: 2, profileName, day: DayState|null, manor: ManorState|null, ledger,
currencies, volume: VolumeState, journal: {seenNodeIds, flags, affinities, dailyTalked},
cabinet: {unlockedCardIds}, chronicles: {runHistoryV1?, dayRecords, stats},
earnedAchievementIds, seenPuzzleIds: Record<RoomPuzzleKind, string[]>,
settings: {+musicEnabled, +muteSwitchBypass} }`.

`app/migrations.ts`: `migrate(raw: unknown): SaveV2` — table of `vN→vN+1` steps. v1→v2:
**preserve** profileName, runHistory (verbatim under `chronicles.runHistoryV1`),
earnedAchievementIds, seenPuzzleIds (new kinds init `[]`), settings; **drop**
`activeRun*` (fork/diamond run — un-migratable, loses nothing meaningful); **park**
perk/loadout state under `chronicles.legacyPerks` pending AAA §10.1. Before overwriting,
copy the raw v1 blob to `lexicon-loop-save-v1-backup` once. `importSaveCode` also runs
`migrate()`. `tests/migrations.test.ts` uses a frozen real v1 fixture. **The wife's live
save is irreplaceable: the backup key + fixture test land before any schema-touching
change ships.**

## 11. Riskiest integration points (ranked)

1. **Store surgery.** Everything routes through one zustand store; eight agents will
   want to touch it. Mitigation: architect lands slice skeleton + typed interfaces in
   the foundation commit; agents implement only their slice file; `store.ts` shell
   frozen.
2. **Mode components → RoomHost rewiring.** The largest diff against working code.
   One mode at a time behind the adapter, existing engine tests as the safety net.
3. **Save migration.** See §10 — non-negotiable ordering.
4. **Step semantics × puzzle internals.** Hive entropy/threshold, Twistle targetCount,
   FW guess limits encode their own pressure; naive layering double-punishes. Resolved
   per adapter in §2 (weight-0 events, auto-abandon) — but each adapter's mapping is a
   review checkpoint against AAA §0.3.
5. **Base-path/SW flip.** Stale generated JSON after content updates; `index.html`
   stays network-first; SW never registered in dev; CI prefix check.
6. **Dialogue's condition surface** — the coupling magnet. `events.ts` + `DialogueQuery`
   snapshot frozen before A6/A7 start; `flags.md` naming convention published with the
   foundation commit.
7. **New content assets.** Rhyme needs CMUdict subset (build-time only — never ship
   3MB of phonetics); ladder needs a word-adjacency graph (cheap from enable1); Pantry
   needs hand-curated lists (authoring time). Schedule risks for A4/A5, not design
   risks.
8. **Deterministic drafting vs reroll/seen-tracking.** Solved by per-cell rng streams
   (§3); easy to get wrong — property-test it.
9. **iOS audio fragility.** All audio behind the R.4 rule (never load-bearing); the
   rebuild path (`graph.ts`) exists from day one, not retrofitted.

## 12. File-ownership partition (8 parallel agents, zero-conflict rules)

**Phase 0 — architect, serial, must merge first:** `engine/types.ts` (v2),
`engine/events.ts`, `engine/rooms/room-puzzle.ts` + empty `registry.ts`,
`app/slices/*.ts` interfaces + `store.ts` shell, `app/save.ts`/`migrations.ts` stubs
(+ v1 backup-key write), `App.tsx` routes with placeholder pages, the delete list
executed, `ui/rooms/RoomHost.tsx` skeleton, `ui/theme/tokens.css` (style-guide tokens),
`vite.config.ts` base change, `docs/flags.md`.

| Agent | Owns (exclusive) | Registry touchpoints |
|---|---|---|
| **A1 Manor** | `engine/manor/*`, `ui/blueprint/*`, `pages/ManorPage.tsx`, `tests/{grid,drafting}.test.ts`, `ui/blueprint/blueprint.css` | deck card ids |
| **A2 Economy/Day** | `engine/economy/*`, `engine/day.ts`, `app/slices/day.ts`, `ui/chrome/*`, `tests/{steps,day}.test.ts`, economy simulation (AAA 4.10) | consumes RoomEvent (frozen) |
| **A3 Anchor rooms** | `engine/rooms/adapters/{word-web,hive,twistle,forgotten-word}.ts`, `ui/rooms/anchor/*` (moved `modes/`), `tests/puzzles/anchors.test.ts` | 4 fenced lines in `rooms/registry.ts` + view registry |
| **A4 Micro batch 1** | `engine/puzzles/{anagram,ladder,cipher}.ts` + adapters + `ui/rooms/micro/{Anagram,Ladder,Cipher}View.tsx`, `content/generate-{anagram,ladder,cipher}.ts`, tests | 3 fenced registry lines |
| **A5 Micro batch 2** | same shape for `{crossword,rhyme,category}`, `content/lib/phonetics.ts`, `content/authored/categories.json` | 3 fenced registry lines |
| **A6 Dialogue** | `engine/dialogue/*`, `app/slices/dialogue.ts`, `ui/dialogue/*`, `content/authored/dialogue/*`, `content/validate-dialogue.ts`, tests | flag names per `flags.md` |
| **A7 Mystery** | `engine/{journal,volume}.ts`, `app/slices/journal.ts`, `ui/{journal,sanctum}/*`, `pages/{Journal,Sanctum}Page.tsx`, `content/authored/volumes/*`, `content/generate-volume.ts`, letters, tests | emits/consumes events only |
| **A8 Platform** | `app/music/*`, `app/pwa.ts`, `app/platform/*`, `public/{sw.js,manifest,icons}`, `scripts/*`, `app/migrations.ts` implementation + fixture test, `pages/ChroniclesPage.tsx` refresh, `package.json` scripts, index.html meta/splash set | none |

**Conflict rules:**
1. Shared files — `types.ts`, `events.ts`, `store.ts`, `App.tsx`, `index.css`,
   `ui/theme/tokens.css`, `package.json` — are architect-owned; agents request changes,
   never edit.
2. Registration is one-line inserts in per-domain registry files inside pre-assigned
   comment-fenced sections (order pre-assigned alphabetically by kind) — inserts never
   collide, auto-merges stay stable.
3. CSS is per-module files imported by the module; never appended to `index.css`.
4. Each agent adds only new test files; `tests/engine.test.ts` (the existing anchor
   suite) stays untouched and green throughout.
5. **Sequencing:** A3 starts a half-day ahead — it unblocks fastest and validates the
   RoomPuzzle contract; if the interface needs revision, better discovered from A3's
   port of working code than from six new games. A6 and A7 start only after
   `events.ts`/`DialogueQuery`/`flags.md` are frozen.

**Load-bearing existing signatures for A3** (all pure, all keep their unit tests):
`startTwistle(puzzle)`, `submitTwistleWord(...)`, `startHive(puzzle, {thresholdBonus})`,
`submitHiveWord(...)` (invalid-reason enum → maps to the AAA 1.6 toast taxonomy),
`startWordWeb`/`submitGroup`, `startForgottenWord(puzzle, level)`/`submitGuess`.
