# Legacy quarantine (not compiled — outside tsconfig include)

Working v2 (fork/diamond era) code preserved for the Manor pivot. Nothing in
here compiles or ships; it exists so agents can port from real, tested code.

- `modes/` — REMOVED (A3): the four mode components + HiveCore were ported to
  `src/ui/rooms/anchor/*` behind the RoomPuzzle adapter contract
  (ARCHITECTURE §2) and the originals deleted (recoverable from git).
- `components/GlyphTray.tsx`, `components/OutcomeModal.tsx` — glyph UI is
  quarantined pending AAA §10.1; OutcomeModal's victory juice is reference
  material for room celebration states.
- `pages/SanctumPage.v1.tsx` — the perk-loadout UI, parked until the glyph
  decision; if it returns, it parks under Chronicles (A8).
- `pages/HomePage.v1.tsx`, `pages/ChroniclesPage.v1.tsx` — reference for the
  rewritten pages.
- `app/store.v1.ts`, `app/save.v1.ts` — the pre-pivot store/save, kept as the
  authoritative reference for the v1 save shape A8's migration fixture must
  round-trip.

Deleted outright (per the ARCHITECTURE §1 delete list, recoverable from git):
`engine/map.ts`, `tests/map.test.ts`, `tests/store.test.ts`,
`pages/MapPage.tsx`, `pages/PlayPage.tsx` (incl. DefeatScreen),
`components/MindPoints.tsx`, `components/RunHeader.tsx`.
