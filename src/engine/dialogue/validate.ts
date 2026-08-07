/**
 * Dialogue graph validator — OWNER: A6 (Dialogue). Pure functions; the build
 * CLI (content/validate-dialogue.ts) and the vitest suite both run this over
 * the real authored JSON.
 *
 * Enforced (AAA 5.5, 5.6, 5.11 + docs/flags.md):
 *  - ids: globally unique, prefixed "<character>.", kebab segments
 *  - triggers / condition kinds / portrait keys / speakers are known values
 *  - per-box character budget (fits the 390px text box, zero scroll)
 *  - choices <= 3, choice text budget
 *  - flags: grammar regex + allowed first-segment patterns; authored setFlags
 *    only ever set flags the character owns (met.<self> or <self>.*)
 *  - orphan rule: a condition's flag must have a setter (authored effect or a
 *    documented code-set flag) — build failure otherwise
 *  - goto targets exist, are chainOnly, in the same file; chainOnly nodes are
 *    reachable from >=1 goto; the goto graph has no cycles
 *  - `seen` conditions reference real node ids (cross-file allowed)
 *  - repeatable (once:false) nodes never grant affinity (farm guard)
 *  - Dewey: zero spoken lines forever — narration only, no choices, no flags
 *  - authoring floors per character at the AAA 5.6 shipping numbers
 *    (nodes / event-reactions / idle / total lines)
 *  - trigger mounts: every (character, trigger) pair used by authored nodes
 *    must be registered in TRIGGER_MOUNTS with a real mount site — an
 *    unmounted pair = dead content = build failure (AAA 5.5)
 *  - priority starvation: a `once` node that can never outrank a repeatable
 *    node on the same trigger is content that will never be seen (AAA 5.5)
 */

import type { CharacterId } from '../types';
import { CHARACTER_IDS } from '../types';
import type { GameEventType } from '../events';
import { ROOM_PUZZLE_KINDS } from '../rooms/room-puzzle';
import type {
  DialogueCondition, DialogueEffects, DialogueFile, DialogueNode,
} from './schema';
import {
  CONDITION_KINDS, MAX_CHOICES, MAX_CHOICE_CHARS, MAX_LINE_CHARS, PORTRAIT_EXPRESSIONS,
} from './schema';

// docs/flags.md grammar, verbatim.
export const FLAG_REGEX = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){1,2}$/;

const NODE_ID_REGEX = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;

const TRIGGERS = [
  'morning', 'parlor', 'idle', 'sanctum-idle', 'sanctum-after-guess', 'letter', 'night',
] as const;
type Trigger = (typeof TRIGGERS)[number];

/**
 * Trigger mount manifest (AAA 4.17 / 5.5), keyed PER CHARACTER.
 *
 * A trigger is only real content for a given character if some screen
 * actually mounts <DialogueScene character={c} slot={trigger}>. The old
 * manifest was keyed by trigger alone, which is why the Portrait shipped
 * twice with dead content: `parlor` was "mounted" (ManorPage mounts it for
 * Ellery/Posy/Fern) and `idle` was "mounted" (the selector retargets it), yet
 * NOTHING anywhere ever mounted a scene for `portrait` — so his entire
 * first-meeting chain, both arc beats and his testimony sat on the floor and
 * the validator waved them through. Every (character, trigger) pair used by
 * an authored node MUST have an entry here naming its mount site.
 *
 * `idle` is never mounted directly: the selector reaches it by pacing-valve
 * retarget and the never-silence fallback from a *valved* slot. So an `idle`
 * registration is only honest if that character also has a `morning` or
 * `parlor` mount — checked below, not trusted.
 */
export const TRIGGER_MOUNTS: Readonly<Record<CharacterId, Partial<Record<Trigger, string>>>> = {
  bramble: {
    morning: 'src/ui/chrome/DayTransitions.tsx (MorningCard → slot="morning")',
    idle: 'engine/dialogue/select.ts (valve retarget / fallback off the morning scene)',
  },
  ellery: {
    parlor: 'src/pages/ManorPage.tsx (PARLOR_CHARACTERS: reading-nook, drawing-room → slot="parlor")',
    idle: 'engine/dialogue/select.ts (valve retarget / fallback off the parlor visit)',
  },
  posy: {
    parlor: 'src/pages/ManorPage.tsx (PARLOR_CHARACTERS: post-room → slot="parlor")',
    idle: 'engine/dialogue/select.ts (valve retarget / fallback off the parlor visit)',
    letter:
      'src/ui/journal/JournalView.tsx (after letter-opened → slot="letter"; A6 shared-file request to A7)',
  },
  fern: {
    parlor: 'src/pages/ManorPage.tsx (PARLOR_CHARACTERS: greenhouse → slot="parlor")',
    idle: 'engine/dialogue/select.ts (valve retarget / fallback off the parlor visit)',
  },
  dewey: {
    parlor: 'src/pages/ManorPage.tsx (Dewey seam → slot="parlor")',
    idle: 'engine/dialogue/select.ts (valve retarget / fallback off the Dewey seam)',
  },
  portrait: {
    parlor:
      'src/ui/sanctum/SanctumView.tsx (idle phase → "Speak with the Portrait" → slot="parlor")',
    idle:
      'engine/dialogue/select.ts (valve retarget off the Sanctum audience)',
    'sanctum-idle':
      'src/ui/sanctum/SanctumView.tsx (door-screen families RENDERED via selectTaggedLine, never played — no valve spent, nothing marked seen: portrait.gate.* the insufficient-info bands AAA 4.16, portrait.arrive.* the arrival shades, portrait.stair.* read from below)',
    'sanctum-after-guess':
      'src/ui/sanctum/SanctumView.tsx (wrong/won-portrait phases → slot="sanctum-after-guess")',
  },
  // 'night' has no mount for anyone yet — authoring a night node fails the
  // build until a screen mounts it and registers here.
};

/** Slots a screen can mount directly; `idle` is only ever reached from one. */
const VALVED_TRIGGERS: readonly Trigger[] = ['morning', 'parlor'];

const EVENT_TYPES: readonly GameEventType[] = [
  'day-started', 'day-ended', 'room-drafted', 'room-solved', 'room-abandoned',
  'room-notable', 'fragment-found', 'fragment-interpreted', 'letter-opened',
  'sanctum-guess-wrong', 'volume-solved', 'affinity-rank-up', 'gift-given',
  'dialogue-seen', 'dewey-petted',
];

/**
 * Flags set from code, not from authored effects (docs/flags.md: `sys.*` are
 * code-set only; `vol.*` belong to A7's volume machine). Conditions may
 * reference these; authored setFlags may not contain them.
 */
export const CODE_SET_FLAGS: readonly string[] = [
  'sys.tutorial.first-draft',
  'sys.dewey.first-pet',
  'vol.volume-1.solved',
  // ui/sanctum/SanctumView.tsx writes this the first time she stands on the
  // Sanctum landing. Round 14: this used to be listed with the note "so
  // authored dialogue MAY condition on the climb… nothing does yet", and that
  // note survived three rounds — the biggest single event in the campaign
  // (AAA 4.10c: "a campaign event, not a Tuesday") went unremarked by the whole
  // cast. `bramble.recap.landing`, `ellery.react.landing` and
  // `fern.react.landing` condition on it now, and tests/dialogue-content.test.ts
  // asserts a reacting node is actually SELECTED for it (AAA 5.1).
  'vol.volume-1.landing-reached',
  // app/slices/dialogue.ts giveGift() sets sys.first-gift.<character>.
  ...CHARACTER_IDS.map((c) => `sys.first-gift.${c}`),
];

/**
 * Code-set flag FAMILIES — one flag per id, so they cannot be enumerated here.
 * None is referenced by an authored condition (they are viewed/unread
 * bookkeeping, read only by UI derivations), so the orphan rule never sees
 * them; they are named for docs/flags.md's benefit and asserted against the
 * frozen grammar by tests/moment.test.ts and tests/journal.test.ts.
 *
 *   vol.<volumeId>.viewed-<fragmentId>  journal slice, on display (AAA 11.20)
 *   sys.unread.backfilled               migrations.ts, once per save
 *   sys.keepsake.<keepsakeId>           ChroniclesPage, when the shelf is seen
 *   sys.plate.<cardId>                  ManorPage, when the cabinet is opened
 */
export const CODE_SET_FLAG_FAMILIES: readonly string[] = [
  'vol.<volumeId>.viewed-<fragmentId>',
  'sys.unread.backfilled',
  'sys.keepsake.<keepsakeId>',
  'sys.plate.<cardId>',
];

/**
 * Shipping authoring floors — the AAA 5.6 numbers, not a scaled-down round:
 * every major character ≥40 conversations / ≥150 lines, event-reaction bucket
 * ≥12. The Portrait runs leaner (Charon precedent); Dewey is narration-only.
 */
export interface AuthoringFloor {
  minNodes: number;
  minEventReact: number;   // priority in [600, 999]
  minIdle: number;
  minLines: number;        // total authored lines in the file (AAA 5.6 line lint)
}
export const FLOORS: Readonly<Record<CharacterId, AuthoringFloor>> = {
  bramble: { minNodes: 40, minEventReact: 12, minIdle: 4, minLines: 150 },
  ellery: { minNodes: 40, minEventReact: 12, minIdle: 4, minLines: 150 },
  posy: { minNodes: 40, minEventReact: 12, minIdle: 4, minLines: 150 },
  fern: { minNodes: 40, minEventReact: 12, minIdle: 4, minLines: 150 },
  portrait: { minNodes: 15, minEventReact: 5, minIdle: 2, minLines: 25 },  // Charon precedent
  dewey: { minNodes: 8, minEventReact: 2, minIdle: 3, minLines: 10 },
};

export interface ValidationIssue {
  file: CharacterId | string;
  nodeId?: string;
  message: string;
}

function flagPatternOk(flag: string): boolean {
  if (!FLAG_REGEX.test(flag)) return false;
  const first = flag.split('.')[0]!;
  return first === 'met' || first === 'sys' || first === 'vol' ||
    (CHARACTER_IDS as readonly string[]).includes(first);
}

/** Flags an authored file may set: met.<self> and <self>.* only. */
function authoredSetterOk(flag: string, character: CharacterId): boolean {
  return flag === `met.${character}` || flag.startsWith(`${character}.`);
}

function* walkConditions(conds: DialogueCondition[] | undefined): Generator<DialogueCondition> {
  for (const c of conds ?? []) {
    yield c;
    if (c.kind === 'not') yield* walkConditions([c.cond]);
  }
}

function* nodeEffects(node: DialogueNode): Generator<DialogueEffects> {
  if (node.effects) yield node.effects;
  for (const ch of node.choices ?? []) if (ch.effects) yield ch.effects;
}

/** Validate one file's local shape (ids, budgets, enums, per-file graph). */
export function validateDialogueFile(file: DialogueFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const c = file.character;
  const err = (message: string, nodeId?: string) => issues.push({ file: c, nodeId, message });

  if (!(CHARACTER_IDS as readonly string[]).includes(c)) {
    err(`unknown character id "${c}"`);
    return issues;
  }

  const ids = new Set<string>();
  const gotoTargets = new Set<string>();

  for (const node of file.nodes) {
    const id = node.id;
    if (!NODE_ID_REGEX.test(id)) err(`bad node id "${id}"`, id);
    if (!id.startsWith(`${c}.`)) err(`node id must be prefixed "${c}."`, id);
    if (ids.has(id)) err(`duplicate node id`, id);
    ids.add(id);

    if (!(TRIGGERS as readonly string[]).includes(node.trigger)) {
      err(`unknown trigger "${node.trigger}"`, id);
    } else if (!TRIGGER_MOUNTS[c]?.[node.trigger]) {
      err(`no screen mounts <DialogueScene character="${c}" slot="${node.trigger}"> — dead content (AAA 5.5); mount it and register the site in TRIGGER_MOUNTS.${c}`, id);
    }
    if (typeof node.priority !== 'number' || node.priority < 0) {
      err(`priority must be a number >= 0`, id);
    }
    if (typeof node.once !== 'boolean') err(`"once" must be a boolean`, id);

    if (!node.lines || node.lines.length === 0) err(`node has no lines`, id);
    for (const line of node.lines ?? []) {
      if (!(CHARACTER_IDS as readonly string[]).includes(line.speaker)) {
        err(`unknown speaker "${line.speaker}"`, id);
      }
      if (line.portrait && !(PORTRAIT_EXPRESSIONS as readonly string[]).includes(line.portrait)) {
        err(`unknown portrait expression "${line.portrait}"`, id);
      }
      if (line.text.length > MAX_LINE_CHARS) {
        err(`line exceeds ${MAX_LINE_CHARS} chars (${line.text.length}): "${line.text.slice(0, 40)}…"`, id);
      }
      if (line.text.trim().length === 0) err(`empty line text`, id);
      // Dewey has zero lines, forever (AAA 5.6): narration only, everywhere.
      if (line.speaker === 'dewey' && !line.narration) {
        err(`Dewey never speaks — line must be narration`, id);
      }
    }

    const choices = node.choices ?? [];
    if (choices.length > MAX_CHOICES) err(`more than ${MAX_CHOICES} choices`, id);
    if (choices.length === 1) err(`a single choice is a disguised Continue — use zero or 2+`, id);
    for (const ch of choices) {
      if (ch.text.length > MAX_CHOICE_CHARS) {
        err(`choice text exceeds ${MAX_CHOICE_CHARS} chars: "${ch.text}"`, id);
      }
      if (ch.goto) gotoTargets.add(ch.goto);
    }

    for (const cond of walkConditions(node.conditions)) {
      if (!(CONDITION_KINDS as readonly string[]).includes(cond.kind)) {
        err(`unknown condition kind "${(cond as { kind: string }).kind}"`, id);
      }
      if (cond.kind === 'flag' && !flagPatternOk(cond.flag)) {
        err(`condition flag "${cond.flag}" violates docs/flags.md`, id);
      }
      if ((cond.kind === 'event' || cond.kind === 'counter') &&
          !EVENT_TYPES.includes(cond.event)) {
        err(`unknown event type "${cond.event}" in condition`, id);
      }
      if (cond.kind === 'affinity' && !(CHARACTER_IDS as readonly string[]).includes(cond.character)) {
        err(`unknown character "${cond.character}" in affinity condition`, id);
      }
    }

    for (const eff of nodeEffects(node)) {
      for (const flag of eff.setFlags ?? []) {
        if (!flagPatternOk(flag)) err(`setFlags "${flag}" violates docs/flags.md`, id);
        else if (!authoredSetterOk(flag, c)) {
          err(`setFlags "${flag}" — ${c} may only set met.${c} or ${c}.* flags`, id);
        }
      }
      if (!node.once && eff.affinity && Object.keys(eff.affinity).length > 0) {
        err(`repeatable node grants affinity — farmable, forbidden`, id);
      }
      for (const [who] of Object.entries(eff.affinity ?? {})) {
        if (!(CHARACTER_IDS as readonly string[]).includes(who)) {
          err(`affinity effect for unknown character "${who}"`, id);
        }
      }
    }

    if (c === 'dewey') {
      if (choices.length > 0) err(`Dewey offers no choices — presence only`, id);
      for (const eff of nodeEffects(node)) {
        if (eff.setFlags?.length || eff.affinity || eff.interpretFragment) {
          err(`Dewey nodes carry no effects (flags for dewey are sys.*, code-set)`, id);
        }
      }
    }
  }

  // goto graph: targets exist, are chainOnly; chainOnly nodes are reachable.
  const byId = new Map(file.nodes.map((n) => [n.id, n]));
  for (const node of file.nodes) {
    for (const ch of node.choices ?? []) {
      if (!ch.goto) continue;
      const target = byId.get(ch.goto);
      if (!target) err(`goto "${ch.goto}" does not exist in ${c}.json`, node.id);
      else if (!target.chainOnly) err(`goto "${ch.goto}" must be chainOnly`, node.id);
    }
  }
  for (const node of file.nodes) {
    if (node.chainOnly && !gotoTargets.has(node.id)) {
      err(`chainOnly node is unreachable (no goto points at it)`, node.id);
    }
  }
  // Cycle walk over goto edges (a cycle would trap the scene player).
  const visiting = new Set<string>();
  const done = new Set<string>();
  const dfs = (id: string): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      err(`goto cycle through "${id}"`, id);
      return;
    }
    visiting.add(id);
    for (const ch of byId.get(id)?.choices ?? []) if (ch.goto) dfs(ch.goto);
    visiting.delete(id);
    done.add(id);
  };
  for (const node of file.nodes) dfs(node.id);

  // An `idle` registration is only honest if the character also has a valved
  // mount — the selector never reaches idle except by retargeting one.
  const mounts = TRIGGER_MOUNTS[c] ?? {};
  if (mounts.idle && !VALVED_TRIGGERS.some((t) => mounts[t])) {
    err(`TRIGGER_MOUNTS.${c} registers "idle" but ${c} has no morning/parlor mount to retarget from — idle is unreachable`);
  }

  // Priority starvation (AAA 5.5): a once-only node that some repeatable node
  // on the same trigger always outranks is content that will never be seen.
  // This is what buried portrait.guess.thaw/thaw-2 — the whole failure-as-
  // content arc — under four rotating closeness lines for a whole volume.
  const selectable = file.nodes.filter((n) => !n.chainOnly);
  for (const n of selectable) {
    if (!n.once) continue;
    for (const r of selectable) {
      if (r.once || r.trigger !== n.trigger || r.priority <= n.priority) continue;
      if (provablyDisjoint(n.conditions, r.conditions)) continue;
      // A repeatable gated on an event N does not itself require is only
      // *episodically* eligible (the Portrait's gift thank-you outranks his
      // testimony beat, but only on a day you gifted him — the next quiet day
      // it plays). Only a rival that rides the same event gates as N — or no
      // gate at all — can starve it for the whole volume.
      if (requiresExtraEvent(r, n)) continue;
      err(`starved by repeatable "${r.id}" (priority ${r.priority} > ${n.priority}, same trigger, conditions overlap) — a once-only node that can never win is unseeable content (AAA 5.5)`, n.id);
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Condition disjointness — deliberately conservative
// ---------------------------------------------------------------------------

interface Atom { cond: Exclude<DialogueCondition, { kind: 'not' }>; negated: boolean }

/** Event types a node positively requires on the recent stream. */
function requiredEvents(node: DialogueNode): Set<GameEventType> {
  const out = new Set<GameEventType>();
  for (const a of atoms(node.conditions)) {
    if (!a.negated && a.cond.kind === 'event') out.add(a.cond.event);
  }
  return out;
}

/** Does `rival` ride an event gate that `node` does not also require? */
function requiresExtraEvent(rival: DialogueNode, node: DialogueNode): boolean {
  const mine = requiredEvents(node);
  for (const e of requiredEvents(rival)) if (!mine.has(e)) return true;
  return false;
}

function atoms(conds: DialogueCondition[] | undefined): Atom[] {
  const out: Atom[] = [];
  for (const c of conds ?? []) {
    if (c.kind === 'not') {
      if (c.cond.kind !== 'not') out.push({ cond: c.cond, negated: true });
    } else {
      out.push({ cond: c, negated: false });
    }
  }
  return out;
}

/** Band-condition subject key, or null if this atom is not a band. */
function bandKey(c: Atom['cond']): string | null {
  switch (c.kind) {
    case 'fragmentCount': return 'fragmentCount';
    case 'fragmentsLegible': return 'fragmentsLegible';
    case 'day': return 'day';
    case 'affinity': return `affinity:${c.character}`;
    case 'counter': return `counter:${c.event}`;
    default: return null;
  }
}

function bandsExclusive(
  a: { gte?: number; lte?: number },
  b: { gte?: number; lte?: number },
): boolean {
  if (a.gte !== undefined && b.lte !== undefined && a.gte > b.lte) return true;
  if (b.gte !== undefined && a.lte !== undefined && b.gte > a.lte) return true;
  return false;
}

function sameShape(x: unknown, y: unknown): boolean {
  return JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
}

/** True only when the two atoms demonstrably cannot both hold at once. */
function atomsContradict(a: Atom, b: Atom): boolean {
  const ac = a.cond;
  const bc = b.cond;
  if (ac.kind !== bc.kind) return false;

  // X vs not-X on the same subject.
  if (a.negated !== b.negated) {
    if (ac.kind === 'flag' && bc.kind === 'flag') return ac.flag === bc.flag;
    if (ac.kind === 'seen' && bc.kind === 'seen') return ac.node === bc.node;
    if (ac.kind === 'volume' && bc.kind === 'volume') return ac.id === bc.id;
    if (ac.kind === 'event' && bc.kind === 'event') {
      return ac.event === bc.event && sameShape(ac.where, bc.where) && sameShape(ac.whereGte, bc.whereGte);
    }
    return false;
  }
  if (a.negated) return false;   // two negations can always both hold

  // Two different volumes can never be current at once.
  if (ac.kind === 'volume' && bc.kind === 'volume') return ac.id !== bc.id;

  // Non-overlapping numeric bands on the same subject.
  const key = bandKey(ac);
  if (key !== null && key === bandKey(bc)) {
    return bandsExclusive(
      ac as { gte?: number; lte?: number },
      bc as { gte?: number; lte?: number },
    );
  }

  // Same event type, `where` clauses that disagree on a shared path. (One
  // wrong guess a day, one gift per character per day — the payload of the
  // matching event cannot be two values at once.)
  if (ac.kind === 'event' && bc.kind === 'event' && ac.event === bc.event) {
    for (const [path, want] of Object.entries(ac.where ?? {})) {
      const other = bc.where?.[path];
      if (other !== undefined && other !== want) return true;
    }
  }
  return false;
}

/**
 * Can these two condition sets be proven never to hold in the same query?
 * Conservative by design: "not provably disjoint" is the failing side of the
 * starvation guard, so a missed contradiction costs an author one explicit
 * priority bump, while a wrongly-claimed one would let dead content ship.
 */
export function provablyDisjoint(
  a: DialogueCondition[] | undefined,
  b: DialogueCondition[] | undefined,
): boolean {
  const as = atoms(a);
  const bs = atoms(b);
  for (const x of as) for (const y of bs) if (atomsContradict(x, y)) return true;
  return false;
}

/** Cross-file checks: global id uniqueness, flag orphans, seen refs, floors. */
export function validateDialogueSet(files: DialogueFile[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const f of files) issues.push(...validateDialogueFile(f));

  const allIds = new Set<string>();
  for (const f of files) {
    for (const n of f.nodes) {
      if (allIds.has(n.id)) issues.push({ file: f.character, nodeId: n.id, message: 'node id collides across files' });
      allIds.add(n.id);
    }
  }

  // Every settable flag: authored setFlags + documented code-set flags.
  const settable = new Set<string>(CODE_SET_FLAGS);
  for (const f of files) {
    for (const n of f.nodes) {
      for (const eff of [n.effects, ...(n.choices ?? []).map((ch) => ch.effects)]) {
        for (const flag of eff?.setFlags ?? []) settable.add(flag);
      }
    }
  }

  for (const f of files) {
    for (const n of f.nodes) {
      for (const cond of walkConditions(n.conditions)) {
        if (cond.kind === 'flag' && !settable.has(cond.flag)) {
          issues.push({
            file: f.character, nodeId: n.id,
            message: `orphan flag "${cond.flag}" — nothing sets it (AAA 5.5)`,
          });
        }
        if (cond.kind === 'seen' && !allIds.has(cond.node)) {
          issues.push({
            file: f.character, nodeId: n.id,
            message: `seen condition references unknown node "${cond.node}"`,
          });
        }
      }
    }
  }

  // Authoring floors.
  for (const f of files) {
    const floor = FLOORS[f.character];
    if (!floor) continue;
    const selectable = f.nodes.filter((n) => !n.chainOnly);
    const eventReact = selectable.filter((n) => n.priority >= 600 && n.priority < 1000);
    const idle = selectable.filter((n) => n.trigger === 'idle');
    if (f.nodes.length < floor.minNodes) {
      issues.push({ file: f.character, message: `authoring floor: ${f.nodes.length} nodes < ${floor.minNodes}` });
    }
    if (eventReact.length < floor.minEventReact) {
      issues.push({ file: f.character, message: `authoring floor: ${eventReact.length} event-reaction nodes < ${floor.minEventReact}` });
    }
    if (idle.length < floor.minIdle) {
      issues.push({ file: f.character, message: `authoring floor: ${idle.length} idle nodes < ${floor.minIdle}` });
    }
    const lineCount = f.nodes.reduce((n, x) => n + (x.lines?.length ?? 0), 0);
    if (lineCount < floor.minLines) {
      issues.push({ file: f.character, message: `authoring floor: ${lineCount} lines < ${floor.minLines} (AAA 5.6)` });
    }
  }

  // The Hypnos slot (AAA 5.2): Bramble ships >=12 distinct reactions
  // conditioned on how the previous day ended — including one bespoke
  // dry-room morning line per room archetype in the registry, so the system
  // keeps seeing the player in every room, not just the four anchors.
  const bramble = files.find((f) => f.character === 'bramble');
  if (bramble) {
    const dayEndReacts = bramble.nodes.filter((n) =>
      [...walkConditions(n.conditions)].some((c) => c.kind === 'event' && c.event === 'day-ended'));
    if (dayEndReacts.length < 12) {
      issues.push({ file: 'bramble', message: `Hypnos floor: ${dayEndReacts.length} day-ended reactions < 12 (AAA 5.2)` });
    }
    for (const kind of ROOM_PUZZLE_KINDS) {
      const covered = dayEndReacts.some((n) =>
        [...walkConditions(n.conditions)].some((c) =>
          c.kind === 'event' && c.event === 'room-abandoned' && c.where?.['kind'] === kind));
      if (!covered) {
        issues.push({
          file: 'bramble',
          message: `Hypnos coverage: no dry-room day-end reaction for room kind "${kind}" (AAA 5.2)`,
        });
      }
    }
  }

  return issues;
}
