/**
 * Dialogue data schema — OWNER: A6 (Dialogue).
 *
 * One JSON file per character in content/authored/dialogue/, validated at
 * build time by content/validate-dialogue.ts. Selection over these shapes is
 * a pure function of the frozen DialogueQuery snapshot (engine/events.ts) —
 * Hades salience rules, not branching trees (BENCHMARKS §5).
 *
 * Priority bands (ARCHITECTURE §5):
 *   forced / first-meeting 1000 > event-reaction 700 > milestone/arc 500
 *   > general 100 > idle 0.
 */

import type { CharacterId } from '../types';
import type { DialogueTrigger, GameEventType } from '../events';

export const PRIORITY = {
  forced: 1000,
  eventReact: 700,
  arc: 500,
  general: 100,
  idle: 0,
} as const;

/** Portrait expression keys — every character's art ships these variants. */
export const PORTRAIT_EXPRESSIONS = [
  'neutral', 'warm', 'amused', 'wistful', 'stern', 'concerned', 'curious',
] as const;
export type PortraitExpression = (typeof PORTRAIT_EXPRESSIONS)[number];

/** AAA 5.11 — longest authored line must fit the box at 390px, no scroll. */
export const MAX_LINE_CHARS = 220;
export const MAX_CHOICE_CHARS = 48;
export const MAX_CHOICES = 3;

// ---------------------------------------------------------------------------
// Conditions — evaluated against DialogueQuery by conditions.ts
// ---------------------------------------------------------------------------

export type DialogueCondition =
  /** Write-once flag set (names per docs/flags.md). */
  | { kind: 'flag'; flag: string }
  /** Affinity band for a character. */
  | { kind: 'affinity'; character: CharacterId; gte?: number; lte?: number }
  /**
   * A matching event on the recent (day-stamped) stream. `withinDays: 0` =
   * today only; `1` (default) = today or yesterday. `where` shallow-matches
   * event payload fields (dot paths reach nested, e.g. "closeness.repeat");
   * `whereGte` does >= on numeric paths.
   */
  | {
      kind: 'event';
      event: GameEventType;
      withinDays?: number;
      where?: Record<string, unknown>;
      whereGte?: Record<string, number>;
    }
  /** Lifetime event counter (persists forever). */
  | { kind: 'counter'; event: GameEventType; gte?: number; lte?: number }
  /** Fragments found this volume. */
  | { kind: 'fragmentCount'; gte?: number; lte?: number }
  /** In-game day number. */
  | { kind: 'day'; gte?: number; lte?: number }
  /** Another node has been seen (arc chains are seen-linked, Hades-style). */
  | { kind: 'seen'; node: string }
  /** Current volume gate. */
  | { kind: 'volume'; id: string }
  /** Negation wrapper. */
  | { kind: 'not'; cond: DialogueCondition };

export const CONDITION_KINDS = [
  'flag', 'affinity', 'event', 'counter', 'fragmentCount', 'day', 'seen', 'volume', 'not',
] as const;

// ---------------------------------------------------------------------------
// Effects, lines, choices, nodes
// ---------------------------------------------------------------------------

export interface DialogueEffects {
  /** Affinity deltas (conversation warmth — gifts flow through giveGift). */
  affinity?: Partial<Record<CharacterId, number>>;
  /** Write-once flags to set, per docs/flags.md. */
  setFlags?: string[];
  /**
   * Ellery's service: interpret a found fragment. A concrete fragment id, or
   * 'next' = the first found-but-uninterpreted fragment at apply time.
   */
  interpretFragment?: string;
}

export interface DialogueLine {
  speaker: CharacterId;
  portrait?: PortraitExpression;
  text: string;
  /**
   * Narration (italic stage direction, no quoted speech). Dewey's entire
   * presence is narration — he has zero lines, forever (AAA 5.6).
   */
  narration?: boolean;
}

export interface DialogueChoice {
  text: string;
  /** Continue into a chainOnly node in the same file. */
  goto?: string;
  effects?: DialogueEffects;
}

export interface DialogueNode {
  id: string;                       // must start "<character>."
  trigger: DialogueTrigger;
  priority: number;
  /** true = seen forever, drops out of eligibility. false = repeatable pool. */
  once: boolean;
  /**
   * Blocks reselection while a 'dialogue-seen' for this node is on the recent
   * stream within N days. (Stream clears at dusk, so this is a same-day valve
   * in practice — repeatable pools also auto-rotate; see select.ts.)
   */
  cooldownDays?: number;
  conditions?: DialogueCondition[];
  lines: DialogueLine[];
  choices?: DialogueChoice[];
  effects?: DialogueEffects;
  /** Reachable only via goto — never selected directly. */
  chainOnly?: boolean;
  /** One-line journal summary logged when seen/skipped (AAA 5.10). */
  summary?: string;
}

export interface DialogueFile {
  character: CharacterId;
  nodes: DialogueNode[];
}

/**
 * A substantive conversation (vs. an idle line) — seeing one spends the
 * one-per-character-per-day pacing valve (AAA 5.9).
 */
export function isSubstantive(node: DialogueNode): boolean {
  return node.trigger !== 'idle';
}
