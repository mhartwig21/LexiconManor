/**
 * The Lexicographer's portrait — OWNER: A7. Code-drawn SVG in the manor's
 * ink-on-parchment idiom (strokes only, currentColor for ink so both themes
 * work, gilt frame from tokens). Base states: stern (the volume in progress)
 * and softened (after the word is spoken) — the portrait itself is the
 * progression reward (BENCHMARKS §5). An optional dialogue-node `expression`
 * key overrides the base features so the frame acts alongside his authored
 * reaction lines (stern/curious/wistful/warm…, AAA 4.17).
 */

import type { PortraitExpression } from '../../engine/dialogue/schema';

export default function PortraitFrame({
  soft,
  expression,
}: {
  soft: boolean;
  expression?: PortraitExpression;
}) {
  const mood: PortraitExpression = expression ?? (soft ? 'warm' : 'stern');
  /** Closed, kindly crescents vs level etched dashes. */
  const softEyes = mood === 'warm' || mood === 'wistful' || mood === 'amused';
  /** Knitted (stern/concerned), one arched (curious), or lifted (the rest). */
  const brows: 'knit' | 'arch' | 'lift' =
    mood === 'stern' || mood === 'concerned' ? 'knit' : mood === 'curious' ? 'arch' : 'lift';
  /** Full smile, the ghost of one, or the pressed line. */
  const mouth: 'smile' | 'ghost' | 'pressed' =
    mood === 'warm' || mood === 'amused' ? 'smile'
    : mood === 'wistful' || mood === 'curious' ? 'ghost'
    : 'pressed';
  return (
    <svg
      className="snc-portrait"
      viewBox="0 0 240 300"
      role="img"
      aria-label={`The Lexicographer, ${soft ? 'softened' : 'stern'}${expression ? ` — ${expression}` : ''}`}
    >
      {/* Candle-warmth behind the canvas once the word is home. */}
      {soft && <ellipse cx="120" cy="140" rx="95" ry="120" fill="var(--gilt)" opacity="0.13" />}

      {/* Frame: double gilt oval with corner flourishes. */}
      <ellipse cx="120" cy="150" rx="106" ry="140" fill="none" stroke="var(--gilt)" strokeWidth="5" opacity="0.85" />
      <ellipse cx="120" cy="150" rx="97" ry="130" fill="none" stroke="var(--gilt)" strokeWidth="1.6" opacity="0.6" />

      <g stroke="currentColor" fill="none" strokeLinecap="round">
        {/* Shoulders and high collar */}
        <path d="M50 268 C 62 218, 90 202, 120 202 C 150 202, 178 218, 190 268" strokeWidth="3" />
        <path d="M104 206 L 112 190 M136 206 L 128 190" strokeWidth="2" />
        <path d="M112 190 C 116 196, 124 196, 128 190" strokeWidth="2" />
        {/* Cravat */}
        <path d="M116 204 C 118 214, 122 214, 124 204" strokeWidth="1.2" opacity="0.7" />

        {/* Head */}
        <path d="M88 132 C 86 96, 100 76, 120 76 C 140 76, 154 96, 152 132 C 150 158, 138 176, 120 176 C 102 176, 90 158, 88 132 Z" strokeWidth="3" />
        {/* Receding hair, a little wild at the sides */}
        <path d="M88 118 C 92 100, 102 88, 120 86 M152 118 C 148 100, 138 88, 120 86" strokeWidth="2" opacity="0.8" />
        <path d="M84 128 C 78 122, 78 112, 82 106 M156 128 C 162 122, 162 112, 158 106" strokeWidth="1.4" opacity="0.6" />

        {/* Spectacles — two circles and a bridge; his one glint of light */}
        <circle cx="105" cy="126" r="11" strokeWidth="2" />
        <circle cx="135" cy="126" r="11" strokeWidth="2" />
        <path d="M116 126 L 124 126" strokeWidth="2" />
        <path d="M94 124 L 88 120 M146 124 L 152 120" strokeWidth="1.4" />
        {/* Eyes behind the glass: level etched dashes vs closed crescents */}
        {softEyes ? (
          <>
            <path d="M100 128 C 103 131, 107 131, 110 128" strokeWidth="1.8" />
            <path d="M130 128 C 133 131, 137 131, 140 128" strokeWidth="1.8" />
          </>
        ) : (
          <>
            <path d="M101 127 L 109 127" strokeWidth="2.2" />
            <path d="M131 127 L 139 127" strokeWidth="2.2" />
          </>
        )}
        {/* Brows: knitted, one arched (curiosity), or lifted */}
        {brows === 'knit' ? (
          <>
            <path d="M98 112 C 103 114, 108 115, 112 117" strokeWidth="2.4" />
            <path d="M128 117 C 132 115, 137 114, 142 112" strokeWidth="2.4" />
          </>
        ) : brows === 'arch' ? (
          <>
            <path d="M98 114 C 102 112, 108 111, 112 113" strokeWidth="2" />
            <path d="M128 110 C 132 106, 138 106, 142 110" strokeWidth="2.2" />
          </>
        ) : (
          <>
            <path d="M98 114 C 102 111, 108 110, 112 112" strokeWidth="2" />
            <path d="M128 112 C 132 110, 138 111, 142 114" strokeWidth="2" />
          </>
        )}

        {/* Nose */}
        <path d="M120 130 C 118 138, 117 144, 116 148 C 118 150, 122 150, 124 148" strokeWidth="1.8" />
        {/* Mouth: the pressed line, its ghost of a curve, or the smile */}
        {mouth === 'smile' ? (
          <path d="M108 160 C 114 165, 126 165, 132 159" strokeWidth="2.2" />
        ) : mouth === 'ghost' ? (
          <path d="M108 161 C 114 163, 126 163, 132 160" strokeWidth="2.2" />
        ) : (
          <path d="M109 161 C 116 160, 124 160, 131 161" strokeWidth="2.2" />
        )}
        {/* A little hatching under the cheekbones — the etching idiom */}
        <path d="M94 142 L 99 145 M95 148 L 100 151" strokeWidth="0.9" opacity="0.45" />
        <path d="M146 142 L 141 145 M145 148 L 140 151" strokeWidth="0.9" opacity="0.45" />
      </g>

      {/* Nameplate.
          Round-4 pinned the engraving inside the brass with `textLength`, which
          stopped the overrun but left the plate 156 units wide carrying 8.6-unit
          type — and the frame renders ~180 CSS px wide (capped on the short axis
          for 375x667), so that is a 6.4px engraving with ~7px of air at each end.
          At phone size it reads as a dirty band touching both ends of its own
          plate, which is exactly what a reader reports as "overruns on both
          sides". Two changes fix the proportion rather than the arithmetic:

          1. The plate is no longer squeezed to fit inside the inner gilt oval.
             At y≈288 the oval (cy 150, ry 130) has already closed — its lowest
             point is y=280 — so the plate sits entirely below both ellipses and
             may run the full width of the frame. 208 units (16..224) matches the
             outer oval's span, which is how a real museum plate is hung.
          2. The engraving grows to 13 units (~9.7 CSS px at the shipped frame
             size, half again the old smudge) and `textLength` becomes a TRACKING
             budget rather than a squeeze: `lengthAdjust="spacing"` moves the
             letters apart without distorting the glyphs, so the name gets the
             wide engraved spacing the idiom wants AND is still guaranteed to
             land inside 186 units — 11 units of brass clear at each end —
             whatever face the display stack resolves to. */}
      <rect x="16" y="276" width="208" height="20" rx="3" fill="none" stroke="var(--gilt)" strokeWidth="1.2" opacity="0.7" />
      <text
        x="120"
        y="289.5"
        textAnchor="middle"
        fontSize="13"
        textLength="172"
        lengthAdjust="spacing"
        fill="currentColor"
        opacity="0.85"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        THE LEXICOGRAPHER
      </text>
    </svg>
  );
}
