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
 *  - authoring floors per character (round-1 volumes; raised later)
 */

import type { CharacterId } from '../types';
import { CHARACTER_IDS } from '../types';
import type { GameEventType } from '../events';
import type {
  DialogueCondition, DialogueEffects, DialogueFile, DialogueNode,
} from './schema';
import {
  CONDITION_KINDS, MAX_CHOICES, MAX_CHOICE_CHARS, MAX_LINE_CHARS, PORTRAIT_EXPRESSIONS,
} from './schema';

// docs/flags.md grammar, verbatim.
export const FLAG_REGEX = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){1,2}$/;

const NODE_ID_REGEX = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;

const TRIGGERS = ['morning', 'parlor', 'idle', 'sanctum-after-guess', 'letter', 'night'] as const;

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
  // app/slices/dialogue.ts giveGift() sets sys.first-gift.<character>.
  ...CHARACTER_IDS.map((c) => `sys.first-gift.${c}`),
];

/** Round-1 authoring floors (BENCHMARKS §5 scaled to this content round). */
export interface AuthoringFloor {
  minNodes: number;
  minEventReact: number;   // priority in [600, 999]
  minIdle: number;
}
export const FLOORS: Readonly<Record<CharacterId, AuthoringFloor>> = {
  bramble: { minNodes: 28, minEventReact: 8, minIdle: 4 },
  ellery: { minNodes: 28, minEventReact: 8, minIdle: 4 },
  posy: { minNodes: 28, minEventReact: 8, minIdle: 4 },
  fern: { minNodes: 28, minEventReact: 8, minIdle: 4 },
  portrait: { minNodes: 15, minEventReact: 5, minIdle: 2 },  // Charon precedent
  dewey: { minNodes: 8, minEventReact: 2, minIdle: 3 },
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

  return issues;
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
  }

  // The Hypnos slot (AAA 5.2): Bramble ships >=12 distinct reactions
  // conditioned on how the previous day ended.
  const bramble = files.find((f) => f.character === 'bramble');
  if (bramble) {
    const dayEndReacts = bramble.nodes.filter((n) =>
      [...walkConditions(n.conditions)].some((c) => c.kind === 'event' && c.event === 'day-ended'));
    if (dayEndReacts.length < 12) {
      issues.push({ file: 'bramble', message: `Hypnos floor: ${dayEndReacts.length} day-ended reactions < 12 (AAA 5.2)` });
    }
  }

  return issues;
}
