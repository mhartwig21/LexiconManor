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
import { cardById } from '../manor/deck';
import { leadCardId } from '../leads';
import { NIGHT_TALLY_LABELS } from '../day';
import { beatVisualLines, nightBeatLineBudget, NIGHT_FIT } from './night-fit';

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
    idle: 'engine/dialogue/select.ts (valve retarget / fallback off the morning scene; ui/dialogue/DialogueScene.tsx quotes the ask-menu family from every closing panel)',
    /**
     * ROUND 24 — SOMEBODY SAYS GOODNIGHT (REVIEW_AA §5.11).
     *
     * This entry read "'night' has no mount for anyone yet" for twenty-three
     * rounds, and the comment was the finding: the engine declared a `night`
     * trigger, the validator refused to let anyone author for it, and the
     * screen the player ends EVERY day on printed one of three hard-coded
     * strings picked by end-cause alone. She was handed a person at breakfast
     * and a receipt at bedtime. The digest now quotes Bramble's night family
     * in place (`selectTaggedLine`-shaped, the AAA 4.16 precedent: no valve
     * spent, the scene stays a scene) and marks the chosen node seen so the
     * once-only beats retire.
     */
    night: 'src/ui/chrome/DayTransitions.tsx (NightDigest → buildDialogueQuery(bramble, \'night\') → selectTaggedLine over bramble.night.*)',
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

/** Every condition a node can be gated by — its own, and its choices' (§5.11). */
function nodeConditions(node: DialogueNode): DialogueCondition[] {
  return [...(node.conditions ?? []), ...(node.choices ?? []).flatMap((ch) => ch.conditions ?? [])];
}

function* nodeEffects(node: DialogueNode): Generator<DialogueEffects> {
  if (node.effects) yield node.effects;
  for (const ch of node.choices ?? []) if (ch.effects) yield ch.effects;
}

/**
 * ═══ WHAT A LEAD MAY BE (round 54, docs/LEADS.md) ══════════════════════════
 *
 * A lead is a PERSON telling you about a PLACE. The owner's ruling names three
 * things it must not become, and each has already happened here once:
 *
 *   · a payout figure, a rate or a mechanic — round 46's `+1 page` on the
 *     draft card, overruled on sight. So a lead line may carry no numeral and
 *     none of the words the REWARD is made of: the moment a character says
 *     "page" she is quoting the rulebook, not the house.
 *   · an interface nudge in the house voice — "the same announcement wearing a
 *     costume". So a lead may only live on a trigger a CONVERSATION is mounted
 *     on, and it is `chainOnly`: it is a TAIL on a scene somebody is already
 *     having, never a surface's own line. The rendered families
 *     (`selectTaggedLine`: the night digest, the Sanctum door, the whereabouts
 *     aside) are the costume, and they are shut out by construction rather than
 *     by care.
 *   · a repeatable tip that becomes a checklist. So every lead is `once`.
 *
 * And the room it names must be one the ground floor can actually deal her:
 * a lead to a `tierRange: [3, 3]` room is a character sending her somewhere the
 * deck cannot put her tonight, which is the honesty rule failing at the
 * geometry instead of at the ledger.
 */
const LEAD_FORBIDDEN_WORDS = [
  'page', 'pages', 'fragment', 'fragments', 'clue', 'clues',
  'step', 'steps', 'gem', 'gems', 'key', 'keys', 'reward', 'rewards',
];
const LEAD_FORBIDDEN_RE = new RegExp(`\\b(${LEAD_FORBIDDEN_WORDS.join('|')})\\b`, 'i');

export function leadProblems(node: DialogueNode): string[] {
  const card = leadCardId(node.id);
  if (card === null) return [];
  const out: string[] = [];
  const def = cardById(card);
  if (!def) {
    out.push(`lead names "${card}", which is not a card in the deck`);
  } else if (def.category !== 'puzzle' || !def.puzzleKind) {
    out.push(`lead names "${card}", which pays no page when it is solved — a lead must be honest`);
  } else if (def.tierRange[0] > 1) {
    out.push(`lead names "${card}", which the ground floor cannot draw (tierRange ${def.tierRange.join('–')}) — she cannot go where she is sent`);
  }
  if (!node.once) out.push(`a lead must be "once" — a repeated lead is a checklist, not a rumour`);
  if (!(VALVED_TRIGGERS as readonly string[]).includes(node.trigger)) {
    out.push(`a lead must be spoken in a conversation (${VALVED_TRIGGERS.join('/')}), not rendered by a surface — trigger is "${node.trigger}"`);
  }
  if (!node.chainOnly) {
    out.push(`a lead must be chainOnly — it is a tail on a conversation, never the conversation (see selectLead)`);
  }
  for (const line of node.lines ?? []) {
    if (/\d/.test(line.text)) {
      out.push(`lead line carries a numeral — a lead names a place, never a payout: "${line.text.slice(0, 40)}…"`);
    }
    const hit = LEAD_FORBIDDEN_RE.exec(line.text);
    if (hit) {
      out.push(`lead line says "${hit[1]}" — that is the rulebook’s word, not the house’s: "${line.text.slice(0, 40)}…"`);
    }
  }
  return out;
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
  /** Every `gotoPrefix` any choice in this file names (REVIEW_AA §5.11). */
  const gotoPrefixes = new Set<string>();
  /** Members of a prefix family, by prefix — filled after the id sweep. */
  const familyOf = (prefix: string): DialogueNode[] =>
    file.nodes.filter((n) => n.id.startsWith(prefix));

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

    /* ── LEADS (round 54, docs/LEADS.md) ─────────────────────────────────
       Four rules, and every one of them has a precedent in this repo. The
       honesty half — "the room she is sent to must be able to pay" — is
       enforced at play time by `withHonestLeads` (engine/leads.ts), because
       it is a fact about tonight; these are the facts about the AUTHORING,
       which is where a build failure is cheaper than a character being wrong
       in front of the player. */
    for (const problem of leadProblems(node)) err(problem, id);

    const choices = node.choices ?? [];
    if (choices.length > MAX_CHOICES) err(`more than ${MAX_CHOICES} choices`, id);
    if (choices.length === 1) err(`a single choice is a disguised Continue — use zero or 2+`, id);
    for (const ch of choices) {
      if (ch.text.length > MAX_CHOICE_CHARS) {
        err(`choice text exceeds ${MAX_CHOICE_CHARS} chars: "${ch.text}"`, id);
      }
      if (ch.goto && ch.gotoPrefix) {
        err(`choice "${ch.text}" names both goto and gotoPrefix — one destination, or none`, id);
      }
      if (ch.goto) gotoTargets.add(ch.goto);
      if (ch.gotoPrefix) {
        gotoPrefixes.add(ch.gotoPrefix);
        const family = familyOf(ch.gotoPrefix).filter((n) => n.chainOnly);
        if (family.length === 0) {
          err(`gotoPrefix "${ch.gotoPrefix}" matches no chainOnly node in ${c}.json — the verb leads nowhere`, id);
        }
      }
    }

    /**
     * ── A MENU THAT CANNOT EMPTY (REVIEW_AA §5.11) ─────────────────────────
     *
     * The review's count — 20 choices, all of them spent inside the first
     * week — is a structural property, not an authoring accident: every verb
     * hung off a `once` node, so the verb retired with it. A REPEATABLE node
     * that offers choices is making a standing promise, and the only way to
     * keep it is to carry at least one verb that can never be exhausted: no
     * conditions, and either no destination at all or one that can play
     * again. Without this the ask-menu quietly becomes a Continue button in
     * week three and nothing goes red.
     */
    if (!node.once && choices.length > 0) {
      const evergreen = choices.some((ch) => {
        if (ch.conditions?.length) return false;
        if (ch.goto) return file.nodes.find((n) => n.id === ch.goto)?.once === false;
        if (ch.gotoPrefix) return familyOf(ch.gotoPrefix).some((n) => n.chainOnly && !n.once);
        return true;
      });
      if (!evergreen) {
        err(`repeatable node offers only exhaustible choices — the menu empties and becomes a Continue button (REVIEW_AA §5.11)`, id);
      }
    }

    for (const cond of walkConditions(nodeConditions(node))) {
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
    const reachedByPrefix = [...gotoPrefixes].some((p) => node.id.startsWith(p));
    // A LEAD is chainOnly with no goto pointing at it, deliberately: its parent
    // is whatever conversation she happened to be having, and `selectLead`
    // reaches it the way `selectTaggedLine` reaches the Portrait's door
    // families — by id, at a mount site, not by an authored edge. The rule it
    // is exempt from is "no orphaned chain members"; the rule that replaces it
    // is `leadProblems`, which is stricter (it checks the ROOM as well).
    if (node.chainOnly && !gotoTargets.has(node.id) && !reachedByPrefix
        && leadCardId(node.id) === null) {
      err(`chainOnly node is unreachable (no goto or gotoPrefix points at it)`, node.id);
    }
  }
  // Cycle walk over goto edges (a cycle would trap the scene player). A
  // `gotoPrefix` edge is followed to every member of the family, because any
  // member may be the one selection lands on.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const dfs = (id: string): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      err(`goto cycle through "${id}"`, id);
      return;
    }
    visiting.add(id);
    for (const ch of byId.get(id)?.choices ?? []) {
      if (ch.goto) dfs(ch.goto);
      if (ch.gotoPrefix) for (const n of familyOf(ch.gotoPrefix)) dfs(n.id);
    }
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

/**
 * ── THE NIGHT'S OWN FLOORS (REVIEW_AA §5.11, re-derived round 25) ───────────
 *
 * The night is not a conversation — it is the last thing she reads before the
 * phone goes down, printed INSIDE the digest under the tally. So it is held to
 * numbers the morning is not: how many beats exist at all, and how much of the
 * glass any one of them may take. The owner hates scrollbars; a goodnight one
 * line too long pushes the "To tomorrow" button off the bottom of the scene,
 * and no screenshot would ever show it.
 *
 * `maxChars: 150` was the round-24 stand-in for that, and it was a guess: it
 * is a per-LINE cap with no relationship to the glass, so two 150-char lines
 * (300 characters, nine rendered lines) passed it, and the shipped worst case
 * — 209 characters over two lines — overflowed 375x667 by 84px WITH it
 * passing. The cap stays as a sanity rail on any single line, but the real
 * gate is now `maxVisualLines`, derived from the measured scene in
 * `night-fit.ts` and re-derived whenever the tally grows a row.
 */
export const NIGHT_FLOOR = {
  /** Beats in the pool. The morning ships 6 rotating lines + a conversation. */
  minNodes: 20,
  /** …of which this many must be conditioned on what the day contained. */
  minReactive: 14,
  /** Paragraphs per beat, and a rail on any one of them. */
  maxLines: 2,
  maxChars: 150,
  /**
   * RENDERED lines the beat may occupy, on the fullest night, at 375x667.
   * Derived, not chosen — see engine/dialogue/night-fit.ts.
   */
  maxVisualLines: nightBeatLineBudget(),
  /**
   * THE EMPTY-DAY POOL (round 25). 27 of the 30 beats round 24 shipped were
   * conditioned on the day containing something, so the evenings that contain
   * nothing — she came home early, or spent the day walking into locked doors
   * — fell through to whatever was left. Driven live: five consecutive
   * immediate-retire nights printed three strings, night 4 repeating night 1
   * verbatim; and once Mrs. Bramble's affinity reached 5 a single beat
   * (`bramble.night.warm`, priority 110) outranked the whole flat pool and
   * became the ONLY goodnight in the game, every night, forever. That is the
   * exact defect round 24 existed to fix, surviving in the corner it did not
   * drive. The pool the selector can actually deal on a day with nothing on
   * its event stream is now asserted, per end-cause, in
   * tests/night-and-choices.test.ts.
   */
  minEmptyDayPool: 4,
} as const;

/** Characters who must keep a standing verb menu (REVIEW_AA §5.11). */
export const ASK_MENU_CHARACTERS: readonly CharacterId[] = [
  'bramble', 'ellery', 'posy', 'fern', 'portrait',
];

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
      for (const cond of walkConditions(nodeConditions(n))) {
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

    // ── The night, held to its own floors (REVIEW_AA §5.11) ────────────────
    const night = bramble.nodes.filter((n) => n.trigger === 'night' && !n.chainOnly);
    if (night.length < NIGHT_FLOOR.minNodes) {
      issues.push({ file: 'bramble', message: `night floor: ${night.length} beats < ${NIGHT_FLOOR.minNodes} — the day ends in a receipt again (REVIEW_AA §5.11)` });
    }
    const reactive = night.filter((n) => (n.conditions ?? []).length > 0);
    if (reactive.length < NIGHT_FLOOR.minReactive) {
      issues.push({ file: 'bramble', message: `night floor: ${reactive.length} beats conditioned on the day < ${NIGHT_FLOOR.minReactive} — a night that does not remember is a loading screen` });
    }
    // Never silence at bedtime, and never a fallback into the daytime idle
    // pool: at least one beat must be eligible with nothing whatever on the
    // stream (the selector's own fallback would print a mid-morning line).
    if (night.length > 0 && !night.some((n) => (n.conditions ?? []).length === 0 && !n.once)) {
      issues.push({ file: 'bramble', message: 'night floor: no unconditioned repeatable beat — some night, the digest would have nothing to say' });
    }
    for (const n of night) {
      if (n.lines.length > NIGHT_FLOOR.maxLines) {
        issues.push({ file: 'bramble', nodeId: n.id, message: `night beat has ${n.lines.length} paragraphs > ${NIGHT_FLOOR.maxLines} — it will not fit the digest at 375×667` });
      }
      // The fit gate proper: how many RENDERED lines this beat takes against
      // what the fullest night leaves it (engine/dialogue/night-fit.ts).
      const drawn = beatVisualLines(n.lines);
      if (drawn > NIGHT_FLOOR.maxVisualLines) {
        issues.push({
          file: 'bramble', nodeId: n.id,
          message: `night beat wraps to ${drawn} lines > ${NIGHT_FLOOR.maxVisualLines} — on the fullest night (${NIGHT_TALLY_LABELS.length} tally rows and the climb line) that is ${Math.round((drawn - NIGHT_FLOOR.maxVisualLines) * NIGHT_FIT.linePx)}px off the bottom of a 375×667 screen`,
        });
      }
      for (const l of n.lines) {
        if (l.text.length > NIGHT_FLOOR.maxChars) {
          issues.push({ file: 'bramble', nodeId: n.id, message: `night line is ${l.text.length} chars > ${NIGHT_FLOOR.maxChars} — the digest is not a dialogue box` });
        }
      }
      if (n.choices?.length) {
        issues.push({ file: 'bramble', nodeId: n.id, message: 'night beats carry no choices — the digest has no choice row to render them in' });
      }
    }
  }

  // ── The standing verb menu (REVIEW_AA §5.11) ─────────────────────────────
  // Every conversation's closing panel quotes `<character>.ask.menu`. A
  // character without one ends every conversation on a single button forever,
  // which is the shape the review counted.
  for (const c of ASK_MENU_CHARACTERS) {
    const f = files.find((x) => x.character === c);
    if (!f) continue;
    const menu = f.nodes.find((n) => n.id === `${c}.ask.menu`);
    if (!menu) {
      issues.push({ file: c, message: `no ${c}.ask.menu — the closing panel has no verb to offer (REVIEW_AA §5.11)` });
      continue;
    }
    if (menu.once) {
      issues.push({ file: c, nodeId: menu.id, message: 'the ask menu must be repeatable — a once menu is the 20-choices census all over again' });
    }
    if ((menu.choices ?? []).length < 2) {
      issues.push({ file: c, nodeId: menu.id, message: 'the ask menu offers fewer than 2 verbs' });
    }
  }

  return issues;
}
