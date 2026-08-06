/**
 * BlueprintSheet — OWNER: A1 (Manor).
 *
 * The parchment blueprint IS the game's main view (MANOR_DESIGN §3): a 5×7
 * inked floorplan, one scalable SVG unit (zero layout shift), strictly 2D.
 * Rooms are drawn as wall paths with true door gaps; dead doors read as
 * bricked-in dashes; draftable doors carry a gilt handle (saturated color on
 * interactables only, AAA 6.5). The player is a small ink token that glides
 * ≤240ms between cells (transform-only, AAA U.3).
 *
 * Interactions (all tap targets ≥ one full cell ≈ 64+px, AAA 6.19):
 *   - tap a connected neighbour room  → onMove
 *   - tap an empty cell behind a door → onOpenDraft  (ghost room affordance)
 *   - tap the room you stand in       → onEnterRoom  (unsolved puzzle rooms)
 *   - tap the Sanctum from its landing→ onSanctum
 */

import type { PointerEvent, ReactNode } from 'react';
import type { Cell, Dir, ManorState, PlacedRoom } from '../../engine/types';
import { MANOR_COLS, MANOR_ROWS, SANCTUM_CELL } from '../../engine/types';
import {
  cellKey, deadDoors, deweyCell, doorsConnect, draftTargets, ENTRANCE_CARD_ID,
  roomAt, sameCell, walkableNeighbors,
} from '../../engine/manor/grid';
import { ROOM_KIND_GLYPH_PATHS } from './CategoryGlyph';

const CELL = 64;
const MX = 26;          // left margin: rank-pressure pips live here
const MT = 34;          // top margin: plot border + Fell-caps title block
const MB = 22;          // bottom margin: plot border + scale mark
const VIEW_W = MX + MANOR_COLS * CELL + 12;
const VIEW_H = MT + MANOR_ROWS * CELL + MB;
const INSET = 3;        // room wall inset inside its cell
const GAP = 20;         // door gap width
const JAMB = 3;         // door jamb tick length

const px = (col: number) => MX + col * CELL;
const py = (row: number) => MT + (MANOR_ROWS - 1 - row) * CELL;

/** Pressed-state from pointerdown, one frame, no :active reliance (AAA U.1). */
function press(e: PointerEvent<Element>) {
  e.currentTarget.setAttribute('data-pressed', '');
}
function release(e: PointerEvent<Element>) {
  e.currentTarget.removeAttribute('data-pressed');
}
const pressProps = {
  onPointerDown: press, onPointerUp: release, onPointerLeave: release, onPointerCancel: release,
};

/** Wall path for a room: solid sides, true gaps where doors are. */
function wallPath(x: number, y: number, doors: readonly Dir[]): string {
  const L = x + INSET, R = x + CELL - INSET, T = y + INSET, B = y + CELL - INSET;
  const midX = x + CELL / 2, midY = y + CELL / 2;
  const seg = (a: string) => a;
  const parts: string[] = [];
  // N (top edge on screen)
  parts.push(doors.includes('N')
    ? seg(`M${L} ${T}H${midX - GAP / 2}M${midX + GAP / 2} ${T}H${R}`)
    : seg(`M${L} ${T}H${R}`));
  // S
  parts.push(doors.includes('S')
    ? seg(`M${L} ${B}H${midX - GAP / 2}M${midX + GAP / 2} ${B}H${R}`)
    : seg(`M${L} ${B}H${R}`));
  // W
  parts.push(doors.includes('W')
    ? seg(`M${L} ${T}V${midY - GAP / 2}M${L} ${midY + GAP / 2}V${B}`)
    : seg(`M${L} ${T}V${B}`));
  // E
  parts.push(doors.includes('E')
    ? seg(`M${R} ${T}V${midY - GAP / 2}M${R} ${midY + GAP / 2}V${B}`)
    : seg(`M${R} ${T}V${B}`));
  return parts.join('');
}

/** Jamb ticks flanking each door gap — the hand-inked detail. */
function jambPath(x: number, y: number, doors: readonly Dir[]): string {
  const T = y + INSET, B = y + CELL - INSET, L = x + INSET, R = x + CELL - INSET;
  const midX = x + CELL / 2, midY = y + CELL / 2;
  const p: string[] = [];
  for (const d of doors) {
    if (d === 'N') p.push(`M${midX - GAP / 2} ${T}v${JAMB}M${midX + GAP / 2} ${T}v${JAMB}`);
    if (d === 'S') p.push(`M${midX - GAP / 2} ${B}v${-JAMB}M${midX + GAP / 2} ${B}v${-JAMB}`);
    if (d === 'W') p.push(`M${L} ${midY - GAP / 2}h${JAMB}M${L} ${midY + GAP / 2}h${JAMB}`);
    if (d === 'E') p.push(`M${R} ${midY - GAP / 2}h${-JAMB}M${R} ${midY + GAP / 2}h${-JAMB}`);
  }
  return p.join('');
}

/** Center point of a door gap on a given side. */
function doorPoint(x: number, y: number, d: Dir): { x: number; y: number } {
  const midX = x + CELL / 2, midY = y + CELL / 2;
  if (d === 'N') return { x: midX, y: y + INSET };
  if (d === 'S') return { x: midX, y: y + CELL - INSET };
  if (d === 'W') return { x: x + INSET, y: midY };
  return { x: x + CELL - INSET, y: midY };
}

/** Dashed bar sealing a dead door (outer wall / blank neighbour wall). */
function deadDoorBar(x: number, y: number, d: Dir): string {
  const p = doorPoint(x, y, d);
  return d === 'N' || d === 'S'
    ? `M${p.x - GAP / 2} ${p.y}h${GAP}`
    : `M${p.x} ${p.y - GAP / 2}v${GAP}`;
}

/** Faint drafting-paper crosses at every grid intersection. */
function graphCrosses(): string {
  const p: string[] = [];
  for (let c = 0; c <= MANOR_COLS; c++) {
    for (let r = 0; r <= MANOR_ROWS; r++) {
      const x = MX + c * CELL, y = MT + r * CELL;
      p.push(`M${x - 2.5} ${y}h5M${x} ${y - 2.5}v5`);
    }
  }
  return p.join('');
}

const CAT_CLASS: Record<PlacedRoom['kind'] | 'puzzle', string> = {
  'parlor': 'bp-cat--parlor', 'utility': 'bp-cat--utility', 'mystery': 'bp-cat--mystery',
  'puzzle': 'bp-cat--puzzle',
  'word-web': 'bp-cat--puzzle', 'hive': 'bp-cat--puzzle', 'twistle': 'bp-cat--puzzle',
  'forgotten-word': 'bp-cat--puzzle', 'anagram': 'bp-cat--puzzle', 'ladder': 'bp-cat--puzzle',
  'cipher': 'bp-cat--puzzle', 'crossword': 'bp-cat--puzzle', 'rhyme': 'bp-cat--puzzle',
  'category': 'bp-cat--puzzle',
};

function categoryOf(room: PlacedRoom): 'puzzle' | 'parlor' | 'utility' | 'mystery' {
  return room.kind === 'parlor' || room.kind === 'utility' || room.kind === 'mystery'
    ? room.kind
    : 'puzzle';
}

export interface BlueprintSheetProps {
  manor: ManorState;
  /** Enterable right now: an unsolved puzzle room under the player's feet. */
  canEnterCurrent: boolean;
  interactive: boolean;
  onMove(cell: Cell): void;
  onOpenDraft(atDoor: Dir): void;
  onEnterRoom(): void;
  onSanctum(): void;
}

export default function BlueprintSheet({
  manor, canEnterCurrent, interactive, onMove, onOpenDraft, onEnterRoom, onSanctum,
}: BlueprintSheetProps) {
  const rooms = Object.values(manor.rooms);
  const player = manor.playerCell;
  const walkable = interactive ? walkableNeighbors(manor) : [];
  const targets = interactive ? draftTargets(manor) : [];
  const den = deweyCell(manor.daySeed);
  const deweyHome = roomAt(manor, den);
  const sanctumReachable = interactive &&
    sameCell(player, { col: SANCTUM_CELL.col, row: SANCTUM_CELL.row - 1 }) &&
    doorsConnect(manor, player, 'N');

  const roomNodes: ReactNode[] = rooms.map((room) => {
    const x = px(room.cell.col), y = py(room.cell.row);
    const cat = categoryOf(room);
    const dead = deadDoors(room, manor);
    const isSanctum = sameCell(room.cell, SANCTUM_CELL);
    const key = cellKey(room.cell);
    return (
      <g key={key} className={`bp-room ${CAT_CLASS[cat]}`}>
        <rect
          className="bp-room__floor"
          x={x + INSET} y={y + INSET} width={CELL - 2 * INSET} height={CELL - 2 * INSET}
          rx={2}
        />
        <path className="bp-room__walls" d={wallPath(x, y, room.doors)} />
        <path className="bp-room__jambs" d={jambPath(x, y, room.doors)} />
        {dead.length > 0 && (
          <path className="bp-room__dead" d={dead.map((d) => deadDoorBar(x, y, d)).join('')} />
        )}
        <g
          className={`bp-room__glyph${room.solved ? ' bp-room__glyph--solved' : ''}`}
          transform={`translate(${x + CELL / 2 - 11} ${y + CELL / 2 - 11}) scale(0.92)`}
        >
          {/* per-kind silhouette: WHICH room, not just its category (AAA 6.3) */}
          {ROOM_KIND_GLYPH_PATHS[room.kind]}
        </g>
        {room.solved && !isSanctum && room.cardId !== ENTRANCE_CARD_ID && (
          <g className="bp-room__tick" transform={`translate(${x + CELL - 15} ${y + 8})`}>
            <path d="M0 3.5 2.6 6 7 0.5" />
          </g>
        )}
        {isSanctum && (
          <g className="bp-seal" transform={`translate(${x + CELL / 2} ${y + CELL - INSET})`}>
            <circle r={5.2} />
            <circle r={2.4} className="bp-seal__inner" />
          </g>
        )}
        {deweyHome && sameCell(room.cell, den) && (
          <g className="bp-dewey" transform={`translate(${x + 9} ${y + CELL - 20})`}>
            {/* a small cat, loafed */}
            <path d="M1 9c0-3 2-5 5-5s5 2 5 5v1H1Z" />
            <path d="M2.5 4.6 2 2l2.2 1.6M9.5 4.6 10 2 7.8 3.6" />
          </g>
        )}
      </g>
    );
  });

  return (
    <svg
      className="bp-sheet"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      aria-label="The manor blueprint"
    >
      {/* Sheet furniture (AAA 6.13): the drawing is a surveyor's plot, not a
          floating grid — plot border with corner ticks, Fell-caps title block
          in the reserved top margin, scale mark in the bottom margin. All
          static ink; inside the viewBox so it survives preserveAspectRatio. */}
      <defs>
        <pattern
          id="bp-hatch"
          width={6}
          height={6}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line className="bp-hatch__line" x1={0.5} y1={0} x2={0.5} y2={6} />
        </pattern>
      </defs>
      <g className="bp-furniture" aria-hidden="true">
        <rect className="bp-plot" x={4} y={4} width={VIEW_W - 8} height={VIEW_H - 8} />
        <path
          className="bp-plot__ticks"
          d={[
            `M4 12V4h8`, `M${VIEW_W - 12} 4h8v8`,
            `M${VIEW_W - 4} ${VIEW_H - 12}v8h-8`, `M12 ${VIEW_H - 4}H4v-8`,
          ].join('')}
        />
        <text className="bp-plot__title" x={VIEW_W / 2} y={21}>
          LEXICON MANOR&thinsp;&mdash;&thinsp;GROUNDS
        </text>
        {/* scale mark: one bar = one room */}
        <g className="bp-scale" transform={`translate(${MX} ${VIEW_H - 12})`}>
          <rect x={0} y={0} width={CELL / 4} height={3} className="bp-scale__seg bp-scale__seg--fill" />
          <rect x={CELL / 4} y={0} width={CELL / 4} height={3} className="bp-scale__seg" />
          <rect x={CELL / 2} y={0} width={CELL / 4} height={3} className="bp-scale__seg bp-scale__seg--fill" />
          <rect x={(3 * CELL) / 4} y={0} width={CELL / 4} height={3} className="bp-scale__seg" />
          <text className="bp-scale__label" x={CELL + 8} y={3.4}>ONE ROOM</text>
        </g>
      </g>

      {/* rank pressure: the higher floors are visibly graver (MANOR_DESIGN §3) */}
      <rect className="bp-band bp-band--t2" x={MX - 3} y={py(4)} width={MANOR_COLS * CELL + 6} height={2 * CELL} />
      <rect className="bp-band bp-band--t3" x={MX - 3} y={py(6)} width={MANOR_COLS * CELL + 6} height={2 * CELL} />
      {/* hatched deepening of the locked/graver bands, layered under the rooms */}
      <rect className="bp-band--hatch bp-band--hatch-t2" fill="url(#bp-hatch)" x={MX - 3} y={py(4)} width={MANOR_COLS * CELL + 6} height={2 * CELL} />
      <rect className="bp-band--hatch bp-band--hatch-t3" fill="url(#bp-hatch)" x={MX - 3} y={py(6)} width={MANOR_COLS * CELL + 6} height={2 * CELL} />
      <path className="bp-graph" d={graphCrosses()} />

      {/* tier pips in the left margin: one, two, three diamonds by band */}
      {[{ rows: [0, 2], n: 1 }, { rows: [3, 4], n: 2 }, { rows: [5, 6], n: 3 }].map(({ rows, n }) => {
        const cy = (py(rows[1]!) + py(rows[0]!) + CELL) / 2;
        return (
          <g key={n} className="bp-tierpips">
            {Array.from({ length: n }, (_, i) => {
              const dy = cy + (i - (n - 1) / 2) * 11;
              return <path key={i} d={`M${MX - 14} ${dy - 3.4}l3.4 3.4-3.4 3.4-3.4-3.4Z`} />;
            })}
          </g>
        );
      })}

      {/* porch steps beneath the Entrance Hall */}
      <path
        className="bp-porch"
        d={`M${px(2) + 16} ${py(0) + CELL + 2}h32M${px(2) + 22} ${py(0) + CELL + 6}h20`}
      />

      {roomNodes}

      {/* ghost rooms behind draftable doors */}
      {targets.map(({ dir, cell }) => {
        const x = px(cell.col), y = py(cell.row);
        const from = doorPoint(px(player.col), py(player.row), dir);
        return (
          <g
            key={`draft-${cellKey(cell)}`}
            className="bp-hit bp-ghost"
            role="button"
            aria-label="Draft a room here"
            {...pressProps}
            onClick={() => onOpenDraft(dir)}
          >
            <rect className="bp-hit__zone" x={x} y={y} width={CELL} height={CELL} />
            <rect
              className="bp-ghost__outline"
              x={x + 7} y={y + 7} width={CELL - 14} height={CELL - 14} rx={3}
            />
            <circle className="bp-ghost__handle" cx={from.x} cy={from.y} r={3.6} />
          </g>
        );
      })}

      {/* walkable neighbours */}
      {walkable.map((cell) => {
        const isSanctum = sameCell(cell, SANCTUM_CELL);
        if (isSanctum) return null; // the Sanctum is entered via its own vow below
        const x = px(cell.col), y = py(cell.row);
        return (
          <g
            key={`walk-${cellKey(cell)}`}
            className="bp-hit bp-walk"
            role="button"
            aria-label={`Walk ${cellKey(cell)}`}
            {...pressProps}
            onClick={() => onMove(cell)}
          >
            <rect className="bp-hit__zone" x={x} y={y} width={CELL} height={CELL} />
            <rect className="bp-walk__wash" x={x + INSET + 1} y={y + INSET + 1} width={CELL - 2 * INSET - 2} height={CELL - 2 * INSET - 2} rx={2} />
          </g>
        );
      })}

      {/* the Sanctum, tappable only from its landing */}
      {sanctumReachable && (
        <g
          className="bp-hit bp-sanctumhit"
          role="button"
          aria-label="Approach the Sanctum"
          {...pressProps}
          onClick={onSanctum}
        >
          <rect className="bp-hit__zone" x={px(SANCTUM_CELL.col)} y={py(SANCTUM_CELL.row)} width={CELL} height={CELL} />
          <rect className="bp-walk__wash" x={px(SANCTUM_CELL.col) + INSET + 1} y={py(SANCTUM_CELL.row) + INSET + 1} width={CELL - 2 * INSET - 2} height={CELL - 2 * INSET - 2} rx={2} />
        </g>
      )}

      {/* the current room, tappable when its puzzle waits */}
      {canEnterCurrent && (
        <g
          className="bp-hit bp-enter"
          role="button"
          aria-label="Enter this room"
          {...pressProps}
          onClick={onEnterRoom}
        >
          <rect className="bp-hit__zone" x={px(player.col)} y={py(player.row)} width={CELL} height={CELL} />
        </g>
      )}

      {/* the player token — glides on transform only */}
      <g
        className="bp-token"
        style={{ transform: `translate(${px(player.col) + CELL / 2}px, ${py(player.row) + CELL / 2}px)` }}
      >
        <circle className="bp-token__ring" r={8.5} />
        <circle className="bp-token__dot" r={3.2} />
      </g>
    </svg>
  );
}
