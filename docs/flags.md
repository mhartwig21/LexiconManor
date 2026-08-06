# Dialogue flag naming — FROZEN (architect-owned)

The flag namespace is the coupling surface between dialogue (A6), the mystery
(A7), and everything that reacts to story state. This scheme is frozen with the
foundation commit (ARCHITECTURE §5, §11.6). `content/validate-dialogue.ts`
rejects any authored flag that does not match it.

## Grammar

```
flag        := segment "." segment ("." segment)?     ; 2 or 3 segments
segment     := [a-z0-9][a-z0-9-]*                     ; lowercase kebab, no dots
```

Regex enforced by the validator: `^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){1,2}$`

Flags are **write-once booleans**: they are set, never unset, never counted.
Anything that needs counting uses the event-counter surface
(`DialogueQuery.counters`, fed by `engine/events.ts`) — not flags.

## Patterns (the only allowed first segments)

| Pattern | Meaning | Examples |
|---|---|---|
| `met.<character>` | First-meeting completed | `met.ellery`, `met.bramble` |
| `<character>.<topic>` | A story beat with that character | `ellery.read-together`, `fern.first-seed` |
| `<character>.<topic>.<step>` | A step in a chain (steps: `1`,`2`,… or a short kebab word) | `ellery.fragment-react.2`, `posy.riddle-letter.done` |
| `<character>.quest<N>.<step>` | Favor-quest chains (locked affinity ranks, AAA 5.8) | `ellery.quest1.started`, `ellery.quest1.done` |
| `sys.<topic>[.<step>]` | Engine/tutorial state, set by code not dialogue | `sys.tutorial.first-draft`, `sys.install-prompt.seen` |
| `vol.<volumeId>[.<topic>]` | Volume-scoped story beats (persist after the volume closes) | `vol.volume-1.solved`, `vol.volume-1.portrait-softened` |

`<character>` is always one of the frozen `CharacterId` values:
`bramble` · `ellery` · `posy` · `fern` · `dewey` · `portrait`.
(Dewey has no dialogue, forever — `dewey` appears only in `sys.`/code-set flags
such as `sys.dewey.first-pet`.)

## Rules

1. **Ownership**: flags starting with a character name belong to A6's authored
   JSON. `sys.*` flags are set only from code. `vol.*` flags are set by A7's
   volume machine (or by dialogue effects A7 has signed off on).
2. **No renames.** A shipped flag name is permanent — saves carry it forever.
   Misnamed? Author a new flag and leave the old one orphaned; never reuse a
   name with a different meaning.
3. **Conditions may reference any flag**, cross-character included
   (Bramble may condition on `ellery.quest1.done`). Ownership governs who
   *sets* a flag, not who reads it.
4. **The valve flags are not flags.** Daily talked/gifted bookkeeping lives in
   `journal.dailyTalked`/`dailyGifted` (reset at night) — never model per-day
   state as write-once flags.
5. The validator walks the full flag graph: a condition referencing a flag no
   authored effect (or documented `sys.`/`vol.` setter) can set is a build
   failure (orphan rule, AAA 5.5).

## Reserved today

- `sys.tutorial.first-draft` — set when the scripted day-1 draft completes.
- `sys.dewey.first-pet` — set the first time the cat is petted.
- `sys.first-gift.<character>` — set by `app/slices/dialogue.ts giveGift()`.
- `vol.volume-1.solved` — set by the volume machine on the winning guess.
- `vol.volume-1.landing-reached` — set by the Sanctum screen the first time she
  stands on the landing. Listed in `CODE_SET_FLAGS`, so authored dialogue may
  condition on the climb.

### Viewed / unread bookkeeping (code-set families, round 6)

These are per-id families, so they cannot be enumerated in `CODE_SET_FLAGS`.
None is referenced by an authored condition — they are read only by UI
derivations — so the orphan rule never sees them. They exist because AAA 11.20
requires a marker to clear on **viewing**, which is persistent state, and never
on `recentEvents`, which dusk prunes.

| Flag | Set by | When |
|---|---|---|
| `vol.<volumeId>.viewed-<fragmentId>` | `app/slices/journal.ts` | the fragment is actually displayed on a journal tab |
| `sys.unread.backfilled` | `app/slices/migrations.ts` | once, on the first load of a save written before viewed-flags existed |
| `sys.keepsake.<keepsakeId>` | `pages/ChroniclesPage.tsx` | the keepsake shelf is scrolled into view |
| `sys.plate.<cardId>` | `pages/ManorPage.tsx` | the Floorplan Cabinet is opened |

Both `posy.quest1.done` and `posy.deputy` (authored, existing) additionally gate
Floorplan Cabinet cards via `engine/manor/deck.ts` `unlockedBy` — the gate is the
story flag itself, so it cannot drift from the conversation that fills it.

All five match the frozen grammar above (`viewed-v1-e1` is one kebab segment).
