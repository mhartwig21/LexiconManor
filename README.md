# Lexicon Loop (v2)

A roguelike word-puzzle adventure — ground-up reimplementation of
[LexiconLoop](https://github.com/mhartwig21/LexiconLoop) as a local-first
static web app. Design reference and full rewrite plan:
`../LexiconLoop/docs/REIMPLEMENTATION_PLAN.md`.

## Architecture

- **No server.** Pure client-side SPA (Vite + React, added in Phase 2).
  Saves live in localStorage as one versioned object.
- **`src/engine/`** — pure TypeScript game rules, no React/DOM. All four
  modes (Word Web, Hive Builder, Twistle, Forgotten Word), run lifecycle,
  mind points, glyph/perk effect registry, achievements, chronicle stats.
  Deterministic via seeded RNG; fully unit-tested.
- **`content/`** — build-time puzzle generation. Generators validate their
  own output and fail the build on bad puzzles; the runtime only *selects*
  puzzles, never generates them.
- **`content/generated/`** — committed puzzle bundles the app ships with.

## Commands

```bash
npm test                    # engine tests + content bundle guards
npm run check               # typecheck
npm run content:dictionary  # rebuild dictionary (needs raw lists, see below)
npm run content:hive        # regenerate Hive Builder puzzles
npm run content:twistle     # regenerate Twistle grids
```

Raw word lists (gitignored) for regeneration:

```bash
curl -sL -o content/data/enable1.txt https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
curl -sL -o content/data/count_1w.txt https://norvig.com/ngrams/count_1w.txt
```

## Content status

| Mode | Pool | Source |
|---|---|---|
| Hive Builder | 324 puzzles, 4 difficulties | generated; pangram-guaranteed by construction |
| Twistle | 214 grids, 4 difficulties | generated; solver-verified targets |
| Word Web | 55 puzzles | imported from v1 (`content/import-legacy.ts`); expansion is Phase 6 |
| Forgotten Word | 10 entries | imported from v1 hand-written set; expansion + clarity variants are Phase 6 |

## Phase plan

1. ✅ Engine + content pipeline (this)
2. App shell + map + run loop with Word Web end-to-end
3. Remaining three modes + shared game shell
4. Glyphs, perks, achievements, chronicles/stats page
5. Juice & polish (animation, sound, mobile)
6. Content expansion + playtest tuning
