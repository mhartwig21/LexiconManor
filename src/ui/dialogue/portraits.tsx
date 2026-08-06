/**
 * Character portraits — OWNER: A6 (Dialogue).
 *
 * Code-drawn SVG busts in the etched/hedcut direction (BENCHMARKS §6):
 * authored at 240×300, stroke-only in `currentColor` so the same art flips to
 * pale-on-dark strokes in the candlelit theme (AAA 6.4). Static, speaker-only
 * (AAA 5.10); expressions swap brow/mouth paths — 7 states per face for the
 * price of two path lookups (portrait-as-progression comes later, AAA 5.12).
 */

import type { JSX } from 'react';
import type { CharacterId } from '../../engine/types';
import type { PortraitExpression } from '../../engine/dialogue/schema';

const STROKE = 3;
const THIN = 1.6;

/** Brow tilt in degrees (positive = inner ends pulled down → sterner). */
const BROW_TILT: Record<PortraitExpression, number> = {
  neutral: 0, warm: -4, amused: -7, wistful: 3, stern: 12, concerned: 9, curious: -12,
};

/** Mouth path, local coords centered on (0,0), ~36 wide. */
const MOUTH: Record<PortraitExpression, string> = {
  neutral: 'M -15 0 H 15',
  warm: 'M -16 -2 Q 0 10 16 -2',
  amused: 'M -16 2 Q 2 12 16 -4',
  wistful: 'M -14 1 Q 0 6 14 -1',
  stern: 'M -15 3 Q 0 -5 15 3',
  concerned: 'M -12 3 Q 0 -2 12 3',
  curious: 'M -9 0 Q 0 8 9 0',
};

interface FaceProps {
  cx: number;
  cy: number;
  expr: PortraitExpression;
  scale?: number;
}

/** Eyes + brows + mouth, shared by every human face. */
function Face({ cx, cy, expr, scale = 1 }: FaceProps) {
  const tilt = BROW_TILT[expr];
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`} strokeWidth={STROKE} fill="none">
      {/* eyes */}
      <circle cx={-22} cy={0} r={3.4} fill="currentColor" stroke="none" />
      <circle cx={22} cy={0} r={3.4} fill="currentColor" stroke="none" />
      {/* brows */}
      <path d="M -34 -14 Q -22 -19 -10 -14" transform={`rotate(${-tilt} -22 -14)`} />
      <path d="M 10 -14 Q 22 -19 34 -14" transform={`rotate(${tilt} 22 -14)`} />
      {/* nose */}
      <path d="M 0 2 Q -4 12 2 16" strokeWidth={THIN} />
      {/* mouth */}
      <g transform="translate(0 34)">
        <path d={MOUTH[expr]} />
      </g>
    </g>
  );
}

function Hatch({ d }: { d: string }) {
  return <path d={d} strokeWidth={THIN} opacity={0.45} fill="none" />;
}

interface PortraitProps {
  expression?: PortraitExpression;
}

function BramblePortrait({ expression = 'neutral' }: PortraitProps) {
  return (
    <g stroke="currentColor" fill="none" strokeWidth={STROKE} strokeLinecap="round">
      {/* shoulders + collar */}
      <path d="M 40 300 Q 44 232 84 216 L 120 206 L 156 216 Q 196 232 200 300" />
      <path d="M 96 214 L 120 240 L 144 214" />
      <circle cx={120} cy={244} r={7} strokeWidth={THIN} /> {/* brooch */}
      <Hatch d="M 58 258 q 10 -14 22 -20 M 52 278 q 12 -16 26 -24 M 170 250 q 8 8 12 20" />
      {/* head */}
      <ellipse cx={120} cy={140} rx={54} ry={62} />
      {/* hair: parted, swept into a bun */}
      <path d="M 66 130 Q 62 66 120 62 Q 178 66 174 130 Q 168 96 120 92 Q 72 96 66 130" />
      <circle cx={120} cy={58} r={18} />
      <Hatch d="M 106 66 q 14 -6 28 0 M 78 100 q 10 -16 26 -20 M 162 100 q -10 -16 -26 -20" />
      {/* spectacles */}
      <circle cx={98} cy={140} r={15} strokeWidth={THIN} />
      <circle cx={142} cy={140} r={15} strokeWidth={THIN} />
      <path d="M 113 140 H 127 M 83 138 L 70 132 M 157 138 L 170 132" strokeWidth={THIN} />
      <Face cx={120} cy={140} expr={expression} />
    </g>
  );
}

function ElleryPortrait({ expression = 'neutral' }: PortraitProps) {
  return (
    <g stroke="currentColor" fill="none" strokeWidth={STROKE} strokeLinecap="round" opacity={0.82}>
      {/* trailing wisp instead of a hem — she is, after all, late */}
      <path d="M 52 300 Q 60 258 84 226 L 120 212 L 156 226 Q 180 258 168 284 Q 158 300 170 300" />
      <path d="M 84 268 Q 96 284 88 300" strokeWidth={THIN} opacity={0.6} />
      {/* book held at the chest */}
      <path d="M 96 252 L 120 244 L 144 252 L 144 282 L 120 274 L 96 282 Z" strokeWidth={THIN} />
      <path d="M 120 244 V 274" strokeWidth={THIN} />
      {/* head, long loose waves */}
      <ellipse cx={120} cy={138} rx={52} ry={60} />
      <path d="M 68 128 Q 62 64 120 60 Q 178 64 172 128 Q 176 178 164 206 M 68 128 Q 64 178 76 206" />
      <Hatch d="M 76 92 q 12 -18 32 -22 M 164 92 q -12 -18 -32 -22 M 70 160 q 4 20 8 32 M 170 160 q -4 20 -8 32" />
      {/* small reading glasses on a chain */}
      <circle cx={100} cy={140} r={12} strokeWidth={THIN} />
      <circle cx={140} cy={140} r={12} strokeWidth={THIN} />
      <path d="M 112 140 H 128 M 88 144 Q 76 168 84 196 M 152 144 Q 164 168 156 196" strokeWidth={THIN} />
      <Face cx={120} cy={138} expr={expression} scale={0.94} />
    </g>
  );
}

function PosyPortrait({ expression = 'neutral' }: PortraitProps) {
  return (
    <g stroke="currentColor" fill="none" strokeWidth={STROKE} strokeLinecap="round">
      {/* shoulders + satchel strap */}
      <path d="M 42 300 Q 48 236 88 220 L 120 210 L 152 220 Q 192 236 198 300" />
      <path d="M 90 224 L 176 292" strokeWidth={STROKE} />
      <Hatch d="M 60 262 q 10 -12 20 -18 M 168 258 q 8 10 12 22" />
      {/* an envelope tucked at the chest */}
      <path d="M 98 254 h 44 v 28 h -44 Z M 98 254 l 22 14 l 22 -14" strokeWidth={THIN} />
      {/* head + curls */}
      <ellipse cx={120} cy={142} rx={52} ry={58} />
      <path d="M 70 128 Q 70 76 120 72 Q 170 76 170 128" />
      <circle cx={74} cy={136} r={9} strokeWidth={THIN} />
      <circle cx={166} cy={136} r={9} strokeWidth={THIN} />
      <circle cx={82} cy={112} r={9} strokeWidth={THIN} />
      <circle cx={158} cy={112} r={9} strokeWidth={THIN} />
      {/* postmistress cap, badge front */}
      <path d="M 66 96 Q 74 58 120 54 Q 166 58 174 96 Q 146 84 120 84 Q 94 84 66 96" />
      <path d="M 96 62 H 144" strokeWidth={THIN} />
      <circle cx={120} cy={72} r={7} strokeWidth={THIN} />
      <Face cx={120} cy={142} expr={expression} />
    </g>
  );
}

function FernPortrait({ expression = 'neutral' }: PortraitProps) {
  return (
    <g stroke="currentColor" fill="none" strokeWidth={STROKE} strokeLinecap="round">
      {/* shoulders, one overall strap */}
      <path d="M 44 300 Q 50 238 88 222 L 120 212 L 152 222 Q 190 238 196 300" />
      <path d="M 96 226 L 100 300 M 96 244 H 76" strokeWidth={THIN} />
      <circle cx={98} cy={252} r={4} strokeWidth={THIN} />
      <Hatch d="M 160 252 q 10 12 14 26 M 58 262 q 8 -10 16 -16" />
      {/* head, short practical hair */}
      <ellipse cx={120} cy={144} rx={51} ry={57} />
      <path d="M 70 132 Q 70 84 120 80 Q 170 84 170 132 Q 160 108 120 106 Q 80 108 70 132" />
      {/* wide-brimmed hat */}
      <path d="M 40 102 Q 76 88 120 88 Q 164 88 200 102 Q 168 110 120 110 Q 72 110 40 102" />
      <path d="M 78 92 Q 84 56 120 52 Q 156 56 162 92" />
      <Hatch d="M 96 62 q 22 -8 46 2 M 52 100 q 30 -8 60 -8" />
      {/* sprig behind the ear */}
      <path d="M 176 148 q 14 -10 12 -26 M 182 140 q 8 -2 12 -10 M 180 132 q -2 -10 4 -16" strokeWidth={THIN} />
      <Face cx={120} cy={146} expr={expression} />
    </g>
  );
}

function PortraitPortrait({ expression = 'neutral' }: PortraitProps) {
  return (
    <g stroke="currentColor" fill="none" strokeWidth={STROKE} strokeLinecap="round">
      {/* the gilt frame — he never leaves it */}
      <rect x={18} y={12} width={204} height={276} rx={6} />
      <rect x={30} y={24} width={180} height={252} rx={3} strokeWidth={THIN} />
      <path d="M 18 12 q 10 -8 20 0 M 222 12 q -10 -8 -20 0 M 108 12 q 12 -10 24 0" strokeWidth={THIN} />
      {/* shoulders, high cravat */}
      <path d="M 56 276 Q 62 226 94 212 L 120 204 L 146 212 Q 178 226 184 276" />
      <path d="M 104 212 Q 120 228 136 212 M 112 224 L 120 240 L 128 224" strokeWidth={THIN} />
      <Hatch d="M 70 250 q 8 -12 18 -18 M 170 246 q 6 10 10 24" />
      {/* gaunt head, swept-back hair, side whiskers */}
      <ellipse cx={120} cy={136} rx={48} ry={58} />
      <path d="M 74 120 Q 74 66 120 62 Q 166 66 166 120 Q 156 92 120 90 Q 84 92 74 120" />
      <path d="M 76 140 Q 70 168 82 186 M 164 140 Q 170 168 158 186" strokeWidth={THIN} />
      <Hatch d="M 84 176 q 6 6 12 8 M 156 176 q -6 6 -12 8 M 100 74 q 18 -8 40 0" />
      <Face cx={120} cy={138} expr={expression} scale={0.92} />
    </g>
  );
}

function DeweyPortrait(_: PortraitProps) {
  return (
    <g stroke="currentColor" fill="none" strokeWidth={STROKE} strokeLinecap="round">
      {/* total loaf */}
      <path d="M 40 262 Q 36 208 78 196 Q 66 236 84 252 Q 120 262 156 252 Q 174 236 162 196 Q 204 208 200 262 Q 202 284 178 288 L 62 288 Q 38 284 40 262" />
      <Hatch d="M 70 246 q 14 8 30 10 M 168 244 q -10 8 -24 10 M 96 270 h 48" />
      {/* head */}
      <ellipse cx={120} cy={144} rx={58} ry={50} />
      {/* ears */}
      <path d="M 72 116 L 62 74 L 98 96 M 168 116 L 178 74 L 142 96" />
      {/* stripes */}
      <Hatch d="M 104 96 v 14 M 120 92 v 16 M 136 96 v 14 M 66 138 h 12 M 162 138 h 12" />
      {/* eyes: judicial half-lids */}
      <path d="M 92 142 q 8 6 18 0 M 130 142 q 8 6 18 0" />
      {/* nose + muzzle + whiskers */}
      <path d="M 116 158 L 124 158 L 120 164 Z" fill="currentColor" stroke="none" />
      <path d="M 120 164 Q 112 174 102 170 M 120 164 Q 128 174 138 170" strokeWidth={THIN} />
      <path d="M 84 158 L 52 152 M 84 166 L 54 168 M 156 158 L 188 152 M 156 166 L 186 168" strokeWidth={THIN} opacity={0.6} />
    </g>
  );
}

const PORTRAITS: Record<CharacterId, (p: PortraitProps) => JSX.Element> = {
  bramble: BramblePortrait,
  ellery: ElleryPortrait,
  posy: PosyPortrait,
  fern: FernPortrait,
  dewey: DeweyPortrait,
  portrait: PortraitPortrait,
};

export interface CharacterPortraitProps {
  character: CharacterId;
  expression?: PortraitExpression;
  /** Dimmed while narration plays over the scene. */
  dimmed?: boolean;
}

export default function CharacterPortrait({ character, expression, dimmed }: CharacterPortraitProps) {
  const Art = PORTRAITS[character];
  return (
    <svg
      viewBox="0 0 240 300"
      className={`dlg-portrait__art${dimmed ? ' dlg-portrait__art--dim' : ''}`}
      role="img"
      aria-label={character}
    >
      <Art expression={expression} />
    </svg>
  );
}
