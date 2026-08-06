/**
 * Category glyphs — OWNER: A1 (Manor).
 *
 * Every room-card category is double-encoded: hue (tokens.css --cat-*) AND a
 * distinct silhouette, so a grayscale screenshot stays fully playable
 * (AAA 6.3). Shapes chosen for silhouette contrast:
 *   puzzle  = open book   (rectangular)
 *   parlor  = teacup      (round)
 *   utility = leaf        (pointed)
 *   mystery = crescent    (curved)
 *
 * `CATEGORY_GLYPH_PATHS` are raw SVG nodes (24×24 authoring box, stroke =
 * currentColor) for embedding straight into the blueprint sheet; the
 * `CategoryGlyph` component wraps them for HTML contexts (draft cards).
 */

import type { ReactNode } from 'react';
import type { RoomCategory } from '../../engine/types';

export const CATEGORY_LABELS: Record<RoomCategory, string> = {
  puzzle: 'Puzzle room',
  parlor: 'Parlor',
  utility: 'Utility room',
  mystery: 'Mystery room',
};

export const CATEGORY_GLYPH_PATHS: Record<RoomCategory, ReactNode> = {
  puzzle: (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5C7 4 10 4 12 5.6 14 4 17 4 20.5 5.5V18c-3.5-1.5-6.5-1.5-8.5 0-2-1.5-5-1.5-8.5 0Z" />
      <path d="M12 5.6V18" />
    </g>
  ),
  parlor: (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 8.5h11.5v4a5.75 5.75 0 0 1-11.5 0Z" />
      <path d="M16 9.8h1.8a2.4 2.4 0 0 1 0 4.8h-2" />
      <path d="M4 20h13" />
    </g>
  ),
  utility: (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c5.5 4 6.5 11-.001 17C5.5 14 6.5 7 12 3Z" />
      <path d="M12 20v-8" />
    </g>
  ),
  mystery: (
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M14.5 3.5a9 9 0 1 0 5 16.4A9.7 9.7 0 0 1 14.5 3.5Z"
        fill="currentColor"
        fillOpacity="0.22"
      />
      <circle cx="17.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
    </g>
  ),
};

export function CategoryGlyph({
  category,
  size = 24,
  className,
}: {
  category: RoomCategory;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={CATEGORY_LABELS[category]}
      style={{ display: 'block' }}
    >
      {CATEGORY_GLYPH_PATHS[category]}
    </svg>
  );
}
