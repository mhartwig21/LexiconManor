import type { GameMode, RunState } from './types';
import { createRng, pick, shuffle, type Rng } from './rng';

/**
 * Level map generation — layered DAGs, deterministic from (seed, level).
 * Maps are never stored; they regenerate identically from the run seed,
 * so save files only need completedNodeIds.
 *
 * Layouts (ported from the original):
 *   level 1 "fork":    branching paths that converge on the boss
 *   level 2 "diamond": narrow -> wide -> narrow
 *   level 3+ "web":    wide layers with cross-links
 */

export interface MapNode {
  id: string;
  kind: 'start' | 'regular' | 'mystery' | 'boss';
  /** Puzzle mode; for mystery nodes the UI hides this until unlocked. */
  mode: GameMode;
  layer: number; // 0 = start
  /** Vertical slot within the layer, for rendering. */
  slot: number;
  slotCount: number; // total slots in this layer
}

export interface LevelMap {
  level: number;
  nodes: MapNode[];
  /** Directed edges parent -> child, both node ids. */
  edges: [string, string][];
  startId: string;
  bossId: string;
}

/** Layer widths per layout (between start and boss). */
function layerWidths(level: number, rng: Rng): number[] {
  if (level === 1) return [2, 3, 2, 2]; // fork
  if (level === 2) return [2, 3, 3, 2]; // diamond
  // web: wider and denser
  return [3, shuffle(rng, [3, 4])[0]!, 3, 2];
}

export function generateLevelMap(opts: {
  seed: number;
  level: number;
  /** Modes available for regular nodes. */
  availableModes: GameMode[];
  /** Boss mode; independent of availableModes (bosses can be exclusive). */
  bossMode?: GameMode;
}): LevelMap {
  const rng = createRng(opts.seed * 31 + opts.level);
  const widths = layerWidths(opts.level, rng);
  const nodes: MapNode[] = [];
  const edges: [string, string][] = [];
  const id = (layer: number, slot: number) => `L${opts.level}-${layer}-${slot}`;

  // Start node.
  const startId = id(0, 0);
  nodes.push({ id: startId, kind: 'start', mode: 'word-web', layer: 0, slot: 0, slotCount: 1 });

  // Middle layers: regular nodes with modes dealt round-robin from a
  // shuffled deck so every available mode appears evenly.
  const modeDeck = shuffle(rng, opts.availableModes);
  let dealt = 0;
  const layers: string[][] = [[startId]];
  widths.forEach((width, i) => {
    const layer = i + 1;
    const ids: string[] = [];
    for (let slot = 0; slot < width; slot++) {
      const nodeId = id(layer, slot);
      ids.push(nodeId);
      nodes.push({
        id: nodeId,
        kind: 'regular',
        mode: modeDeck[dealt++ % modeDeck.length]!,
        layer,
        slot,
        slotCount: width,
      });
    }
    layers.push(ids);
  });

  // Boss layer.
  const bossLayer = widths.length + 1;
  const bossId = id(bossLayer, 0);
  const bossMode = opts.bossMode ?? pick(rng, opts.availableModes);
  nodes.push({ id: bossId, kind: 'boss', mode: bossMode, layer: bossLayer, slot: 0, slotCount: 1 });
  layers.push([bossId]);

  // A few mystery nodes deep in the map (never adjacent to start).
  const mysteryCandidates = nodes.filter((n) => n.kind === 'regular' && n.layer >= 2);
  for (const n of shuffle(rng, mysteryCandidates).slice(0, opts.level >= 2 ? 2 : 1)) {
    n.kind = 'mystery';
  }

  // Edges: every node gets at least one parent in the previous layer, and
  // every parent gets at least one child; extra links add path variety.
  for (let i = 1; i < layers.length; i++) {
    const parents = layers[i - 1]!;
    const children = layers[i]!;
    const childless = new Set(parents);
    for (const [ci, child] of children.entries()) {
      // Connect to the "nearest" parent by relative position, keeps layout sane.
      const pi = Math.min(parents.length - 1, Math.round((ci / Math.max(1, children.length - 1)) * (parents.length - 1)) || 0);
      const parent = parents[pi]!;
      edges.push([parent, child]);
      childless.delete(parent);
      // Occasional second parent for path variety.
      if (parents.length > 1 && rng() < 0.35) {
        const other = pick(rng, parents.filter((p) => p !== parent));
        edges.push([other, child]);
        childless.delete(other);
      }
    }
    for (const orphan of childless) {
      edges.push([orphan, pick(rng, children)]);
    }
  }

  return { level: opts.level, nodes, edges, startId, bossId };
}

// ---------------------------------------------------------------------------
// Unlock / progression queries
// ---------------------------------------------------------------------------

/** The start node counts as completed the moment the level begins. */
export function isNodeCompleted(map: LevelMap, run: Pick<RunState, 'completedNodeIds'>, nodeId: string): boolean {
  return nodeId === map.startId || run.completedNodeIds.includes(nodeId);
}

export function isNodeUnlocked(map: LevelMap, run: Pick<RunState, 'completedNodeIds'>, nodeId: string): boolean {
  if (nodeId === map.startId) return true;
  return map.edges.some(([parent, child]) => child === nodeId && isNodeCompleted(map, run, parent));
}

/** Nodes the player can enter right now (unlocked and not yet completed). */
export function playableNodes(map: LevelMap, run: Pick<RunState, 'completedNodeIds'>): MapNode[] {
  return map.nodes.filter(
    (n) => n.id !== map.startId && !isNodeCompleted(map, run, n.id) && isNodeUnlocked(map, run, n.id),
  );
}

/** True when every path forward is exhausted (defensive; shouldn't happen). */
export function isStuck(map: LevelMap, run: Pick<RunState, 'completedNodeIds'>): boolean {
  return playableNodes(map, run).length === 0 && !isNodeCompleted(map, run, map.bossId);
}
