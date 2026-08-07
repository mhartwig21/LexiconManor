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
 *
 * PRICES (AAA 4.6 / 4.9 / 4.10): movement is priced per row (−1 on the ground
 * floor rising to −5 up top) and that is the whole push-your-luck decision, so
 * the sheet says so BEFORE the tap, never only after the charge. The left
 * margin carries a rate card — one −N per row beside the tier pips — and every
 * walk/ghost target onto a differently-priced storey wears its own −N and
 * names it in its accessible label ("Walk to the second landing — 3 steps").
 * All of it is read from `moveAt` via ./pricing.ts, so the ink and the ledger
 * cannot drift apart.
 *
 * PADLOCKS (AAA 4.6 / 4.10d): doors into the upper storeys can be locked
 * (engine/manor/locks.ts). The sheet draws a small brass padlock on every gate
 * she can already see — the frontier and any storey already open to her — so
 * she reads the gate BEFORE spending a step toward it. The lock's two states
 * are carried by SHAPE first (shut shackle vs. shackle swung open), never by
 * hue alone: with a key in her pocket the padlock lifts and takes the gilt
 * that every other interactable on this sheet wears; without one it stays
 * shut in quiet ink and the door's gilt handle is not drawn at all, because
 * there is nothing there to invite her. Tapping a shut one nudges it rather
 * than charging her a step (the slice refuses free — see openDraft).
 */

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import type { Cell, Dir, ManorState, PlacedRoom } from '../../engine/types';
import { MANOR_COLS, MANOR_ROWS, SANCTUM_CELL } from '../../engine/types';
import {
  cellKey, deadDoors, deweyCell, doorsConnect, draftTargets, ENTRANCE_CARD_ID,
  roomAt, sameCell, sanctumStanding, walkableNeighbors, SANCTUM_DOOR_CELL,
} from '../../engine/manor/grid';
import { isDoorLocked, visibleLocks, KEY_COST, type LockView } from '../../engine/manor/locks';
import { useManorStore } from '../../app/store';
import { lockViewFor } from '../../app/slices/manor';
import { ROOM_KIND_GLYPH_PATHS } from './CategoryGlyph';
import {
  draftLabel, draftStamp, landingRefusalAnnouncement, landingRefusalLine,
  lockedDraftLabel, lockedRefusalAnnouncement, lockedRefusalLine,
  priceStamp, stampsDraftPrice, stampsPrice, walkLabel, LANDING_SEALED_LABEL,
} from './pricing';

const CELL = 64;
const MX = 40;          // left margin: the per-row step price + rank-pressure pips
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

/**
 * A small inked brass padlock, drawn at the centre of a locked cell.
 *
 * Legibility budget: the sheet's viewBox is 358 units wide, so on a 390px
 * phone one unit ≈ 1.09 CSS px — this lock is ~19×23px there, with ~1.7px
 * strokes. Colourblind-safe by construction: `ready` changes the SHAPE (the
 * shackle swings open and the body's keyhole fills) as well as the hue, and
 * the two states also differ in stroke weight.
 */
function Padlock({ x, y, ready }: { x: number; y: number; ready: boolean }) {
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const shackle = ready
    // swung open: the right leg lifts clear of the case
    ? `M${cx - 5.4} ${cy - 2.2}V${cy - 6.6}A5.4 5.4 0 0 1 ${cx + 4.4} ${cy - 9.6}`
    // shut: a plain staple through the case
    : `M${cx - 5.4} ${cy - 2.2}V${cy - 6.6}A5.4 5.4 0 0 1 ${cx + 5.4} ${cy - 6.6}V${cy - 2.2}`;
  return (
    <g className={`bp-padlock${ready ? ' bp-padlock--ready' : ''}`} aria-hidden="true">
      <path className="bp-padlock__shackle" d={shackle} />
      <rect
        className="bp-padlock__case"
        x={cx - 8.6} y={cy - 2.2} width={17.2} height={12.8} rx={2.2}
      />
      <circle className="bp-padlock__hole" cx={cx} cy={cy + 3} r={1.9} />
      <path className="bp-padlock__slot" d={`M${cx} ${cy + 4.4}v3`} />
    </g>
  );
}

const CAT_CLASS: Record<PlacedRoom['kind'] | 'puzzle', string> = {
  'parlor': 'bp-cat--parlor', 'utility': 'bp-cat--utility', 'mystery': 'bp-cat--mystery',
  'puzzle': 'bp-cat--puzzle',
  'word-web': 'bp-cat--puzzle', 'hive': 'bp-cat--puzzle', 'twistle': 'bp-cat--puzzle',
  'forgotten-word': 'bp-cat--puzzle', 'cipher': 'bp-cat--puzzle', 'crossword': 'bp-cat--puzzle',
  'sudoku': 'bp-cat--puzzle',
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
  /**
   * Keys in her pocket — decides whether a padlock reads as shut or as ready
   * to open. Optional: it defaults to the live store, so the sheet is honest
   * about the gates even where the page has not been re-wired.
   */
  keys?: number;
  onMove(cell: Cell): void;
  onOpenDraft(atDoor: Dir): void;
  onEnterRoom(): void;
  onSanctum(): void;
}

export default function BlueprintSheet({
  manor, canEnterCurrent, interactive, keys: keysProp,
  onMove, onOpenDraft, onEnterRoom, onSanctum,
}: BlueprintSheetProps) {
  const liveKeys = useManorStore((s) => s.currencies.keys);
  /**
   * ROUND 19 (REVIEW_AA §5.2): the sheet draws the padlocks the SLICE would
   * charge for. `lockViewFor` — one derivation, the round-17 answer to the
   * round-13 `atSanctumDoor` lesson — was passed to nobody, so once she had
   * named the word down the tube the draft gate opened (see slices/manor.ts)
   * while this sheet went on drawing brass over every door above row 3.
   */
  // Selected as a PRIMITIVE and re-wrapped here. `useManorStore(lockViewFor)`
  // returns a fresh object every call, which zustand's `getSnapshot` sees as
  // a new value on every render — measured live as "Maximum update depth
  // exceeded" and a blank app. The store must yield comparable values; the
  // object shape belongs to the caller.
  const heldOpen = useManorStore((s) => lockViewFor(s).heldOpen === true);
  const lockView: LockView = { heldOpen };
  const keys = keysProp ?? liveKeys;
  /**
   * A padlock she just tried without a key: it shrugs, nothing is charged —
   * AND IT SAYS SO (AAA 4.16, round-6 fix). The refusal used to be a 420ms
   * wiggle and total silence, which is both the silence 4.16 forbids and, to
   * a first-time player, indistinguishable from a mis-tap. `line` is the
   * house's brief answer, drawn on the sheet beside the lock; `spoken` is the
   * fuller live-region restatement for anyone who cannot see the brass at all.
   */
  const [refused, setRefused] = useState<
    { key: string; row: number; line: string; spoken: string } | null
  >(null);
  const refuseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Consecutive taps per door, so a second try is answered, never parroted. */
  const refuseCount = useRef(new Map<string, number>());
  useEffect(() => () => { if (refuseTimer.current) clearTimeout(refuseTimer.current); }, []);
  const showRefusal = (key: string, row: number, line: string, spoken: string) => {
    setRefused({ key, row, line, spoken });
    if (refuseTimer.current) clearTimeout(refuseTimer.current);
    // Long enough to read a short line without becoming furniture. The lock's
    // own shrug is 420ms; the words outlast it deliberately (AAA 11.13 —
    // transience is capped by attention, and this one fires on the very
    // surface she is looking at).
    refuseTimer.current = setTimeout(() => setRefused(null), 2600);
  };
  /** The padlock's answer: brass, a key, and nothing charged. */
  const refuse = (key: string, row: number) => {
    const attempt = refuseCount.current.get(key) ?? 0;
    refuseCount.current.set(key, attempt + 1);
    showRefusal(
      key, row, lockedRefusalLine(attempt), lockedRefusalAnnouncement(attempt, row, KEY_COST),
    );
  };
  /**
   * THE LANDING'S ANSWER (round-13 blocker). She is on (2,5) and the plan she
   * drafted here drew no north door. Before this the Sanctum simply had no hit
   * target and the sheet said nothing at all, while `/sanctum` and the journal
   * both told her to climb to the landing she was standing on. Same channel as
   * the padlock, one storey up, and the same price: nothing.
   */
  const refuseLanding = () => {
    const key = 'sanctum-landing';
    const attempt = refuseCount.current.get(key) ?? 0;
    refuseCount.current.set(key, attempt + 1);
    showRefusal(
      key, SANCTUM_DOOR_CELL.row, landingRefusalLine(attempt),
      landingRefusalAnnouncement(attempt),
    );
  };

  const rooms = Object.values(manor.rooms);
  const player = manor.playerCell;
  const walkable = interactive ? walkableNeighbors(manor) : [];
  const targets = interactive ? draftTargets(manor) : [];
  // Padlocks are information, not interaction: they are drawn whether or not
  // the sheet is currently live (during a draft, at dusk, mid-scene).
  const padlocks = visibleLocks(manor, lockView);
  const den = deweyCell(manor.daySeed);
  const deweyHome = roomAt(manor, den);
  // The one predicate, shared (engine/manor/grid.ts). It used to be written out
  // here and nowhere else, so the journal and the Sanctum screen each had their
  // own idea of "reached the door" — which was none at all (AAA 4.10e, round-7
  // blocker).
  //
  // ROUND 13: three-valued, because the boolean only ever spoke two of its
  // three meanings. `landing-sealed` — she is ON the landing and the room she
  // drafted there drew no north door — used to render as NOTHING AT ALL: no
  // hit target, no ink, no words, on the single most expensive arrival in the
  // campaign. It is now a real control that refuses out loud (AAA 4.16), and
  // the blank wall is drawn as the bricked seam it is.
  const standing = interactive ? sanctumStanding(manor) : 'away';
  const sanctumReachable = standing === 'at-door';
  const landingSealed = standing === 'landing-sealed';

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
    <>
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
              return <path key={i} d={`M${MX - 12} ${dy - 3.4}l3.4 3.4-3.4 3.4-3.4-3.4Z`} />;
            })}
          </g>
        );
      })}

      {/* THE PRICE OF THE STOREY (AAA 4.6/4.10). The tier pips say "graver";
          these say what graver COSTS. One −N per row, read straight from
          `moveAt(row)` so the margin and the ledger cannot drift apart — the
          surveyor's rate card, in the surveyor's margin. */}
      <g className="bp-rowprice" aria-hidden="true">
        {Array.from({ length: MANOR_ROWS }, (_, row) => (
          <text key={row} className="bp-rowprice__n" x={MX - 22} y={py(row) + CELL / 2 + 3.4}>
            {priceStamp(row)}
          </text>
        ))}
      </g>

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
        const key = cellKey(cell);
        const locked = isDoorLocked(manor, cell, lockView);
        const canPay = !locked || keys >= KEY_COST;
        return (
          <g
            key={`draft-${key}`}
            className={`bp-hit bp-ghost${locked ? ' bp-ghost--locked' : ''}${canPay ? '' : ' bp-ghost--shut'}`}
            role="button"
            /**
             * NO `aria-disabled` (round-6 fix). It used to be set to true on a
             * keyless padlock, which told assistive tech the control was inert
             * — while a real finger got a shrug, a line of house voice and a
             * live-region announcement. ARIA that contradicts behaviour is
             * worse than absent ARIA: it invites AT to skip a control that
             * *does* respond, so the one player who most needs the gate
             * explained is the one told there is nothing here. The control is
             * genuinely actionable in both states; the LABEL is what carries
             * the difference (`lockedDraftLabel` names the padlock, the key
             * cost and the price once it opens), and the refusal answers in
             * `.bp-refusal`'s live region.
             */
            aria-label={
              locked
                ? lockedDraftLabel(player.row, cell.row, KEY_COST, canPay)
                : draftLabel(player.row, cell.row)
            }
            {...pressProps}
            onClick={() => (canPay ? onOpenDraft(dir) : refuse(key, cell.row))}
          >
            <rect className="bp-hit__zone" x={x} y={y} width={CELL} height={CELL} />
            <rect
              className="bp-ghost__outline"
              x={x + 7} y={y + 7} width={CELL - 14} height={CELL - 14} rx={3}
            />
            {/* the gilt handle is the "this opens" promise — never drawn on a
                door she cannot open today (no false affordance, AAA 6.5) */}
            {canPay && <circle className="bp-ghost__handle" cx={from.x} cy={from.y} r={3.6} />}
            {/* what stepping through this door costs IN ALL, stamped before
                the tap — drawn only when it differs from the floor she is on,
                because a price stamped on everything stops being read. */}
            {stampsDraftPrice(player.row, cell.row) && (
              <text className="bp-price bp-price--ghost" x={x + CELL - 9} y={y + CELL - 8}>
                {draftStamp(player.row, cell.row)}
              </text>
            )}
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
            aria-label={walkLabel(cell.row)}
            {...pressProps}
            onClick={() => onMove(cell)}
          >
            <rect className="bp-hit__zone" x={x} y={y} width={CELL} height={CELL} />
            <rect className="bp-walk__wash" x={x + INSET + 1} y={y + INSET + 1} width={CELL - 2 * INSET - 2} height={CELL - 2 * INSET - 2} rx={2} />
            {stampsPrice(player.row, cell.row) && (
              <text className="bp-price bp-price--walk" x={x + CELL - 9} y={y + CELL - 8}>
                {priceStamp(cell.row)}
              </text>
            )}
          </g>
        );
      })}

      {/* THE SEALED SEAM (round-13 blocker, AAA 4.6/4.16). The landing room
          drew no north door, so the wall between her and the Sanctum is blank
          plaster — the one fact the whole game never drew. Same bricked-dash
          ink as every other dead door on the sheet (`bp-room__dead`), laid on
          the shared wall so it reads as one seam with the Sanctum's own dead
          south door above it. Inert to pointers: the tap belongs to the hit
          layer below. */}
      {landingSealed && (
        <path
          className="bp-room__dead bp-sealedseam"
          aria-hidden="true"
          d={deadDoorBar(px(SANCTUM_DOOR_CELL.col), py(SANCTUM_DOOR_CELL.row), 'N')}
        />
      )}

      {/* The Sanctum, tappable from its landing — and, since round 13, tappable
          from the landing that does NOT open onto it, because a control that
          silently vanishes is indistinguishable from a bug on the arrival she
          spent 22+ steps to make. It refuses in words instead (AAA 4.16), the
          same way a keyless padlock does, and charges exactly as much: nothing. */}
      {(sanctumReachable || landingSealed) && (
        <g
          className={`bp-hit bp-sanctumhit${landingSealed ? ' bp-sanctumhit--sealed' : ''}`}
          role="button"
          aria-label={sanctumReachable ? 'Approach the Sanctum' : LANDING_SEALED_LABEL}
          {...pressProps}
          onClick={() => (sanctumReachable ? onSanctum() : refuseLanding())}
        >
          <rect className="bp-hit__zone" x={px(SANCTUM_CELL.col)} y={py(SANCTUM_CELL.row)} width={CELL} height={CELL} />
          {sanctumReachable && (
            <rect className="bp-walk__wash" x={px(SANCTUM_CELL.col) + INSET + 1} y={py(SANCTUM_CELL.row) + INSET + 1} width={CELL - 2 * INSET - 2} height={CELL - 2 * INSET - 2} rx={2} />
          )}
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

      {/* PADLOCKS — every gate she can already see (AAA 4.6: never spend a
          step toward a door you could not read). Drawn above the hit layers,
          inert to pointers so the cell underneath stays one full tap target. */}
      <g className="bp-padlocks">
        {padlocks.map(({ cell }) => {
          const key = cellKey(cell);
          return (
            <g
              key={`lock-${key}`}
              className={refused?.key === key ? 'bp-padlock-slot bp-padlock-slot--refused' : 'bp-padlock-slot'}
            >
              <Padlock x={px(cell.col)} y={py(cell.row)} ready={keys >= KEY_COST} />
            </g>
          );
        })}
      </g>

      {/* THE PADLOCK'S ANSWER (AAA 4.16 — never silence at a gate).
          A surveyor's pencilled note on the storey she just tried: the lock
          shrugs AND says why, in a line she can read from arm's length. Drawn
          on the sheet rather than in the chrome so it lands where her eye
          already is (AAA 11.11), pointer-transparent so it never eats the tap
          she makes next, and paired with a live region because a screen-reader
          user cannot see the brass at all. Flavour-class: it persists nothing,
          because nothing happened — no step, no key, no state (11.14 keeps it
          visually distinct from anything that awards). */}
      {refused && (
        <g className="bp-refusal" aria-hidden="true">
          <rect
            className="bp-refusal__ground"
            x={MX - 2} y={py(refused.row) + CELL - 5} width={MANOR_COLS * CELL + 4} height={25} rx={3}
          />
          <text className="bp-refusal__line" x={MX + (MANOR_COLS * CELL) / 2} y={py(refused.row) + CELL + 12}>
            {refused.line}
          </text>
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
    {/* The refusal, spoken. Separate from the drawn line because the two have
        different jobs: the pencilled note on the plan is terse, the
        announcement restates the whole gate — a screen-reader user never sees
        the brass padlock glyph, so "shut fast" alone would tell her nothing.
        `role="status"` + polite: it waits its turn and never interrupts.
        Visually hidden and out of flow (`.bp-sr`), so it cannot shift a pixel
        of the sheet (AAA 1.5). */}
    <p className="bp-sr" role="status" aria-live="polite" aria-atomic="true">
      {refused?.spoken ?? ''}
    </p>
    </>
  );
}
