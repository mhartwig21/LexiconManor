/**
 * Room glyphs — OWNER: A1 (Manor).
 *
 * Two layers of double-encoding, both grayscale-safe (AAA 6.3):
 *
 * 1. CATEGORY — hue (tokens.css --cat-*) AND a family silhouette:
 *      puzzle  = open book   (rectangular)
 *      parlor  = teacup      (round)
 *      utility = leaf        (pointed)
 *      mystery = crescent    (curved)
 *
 * 2. PUZZLE KIND — every one of the six word-game kinds carries its OWN
 *    silhouette (BENCHMARKS §6: room identity legible from the sheet alone;
 *    AAA 4.7 'draft the inconvenient room early' needs at-a-glance
 *    composition). The category hue stays; the shape says WHICH room:
 *      hive           = hexagon cell
 *      word-web       = node web (center + spokes)
 *      forgotten-word = quill over a gapped baseline
 *      cipher         = key
 *      crossword      = 3×3 grid, one square inked
 *      twistle        = traced winding path
 *
 * `ROOM_KIND_GLYPH_PATHS` are raw SVG nodes (24×24 authoring box, stroke =
 * currentColor) for embedding straight into the blueprint sheet; the
 * `RoomGlyph` component wraps them for HTML contexts (draft/cabinet cards).
 */

import type { ReactNode } from 'react';
import type { RoomCategory } from '../../engine/types';
import type { RoomPuzzleKind } from '../../engine/rooms/room-puzzle';

export const CATEGORY_LABELS: Record<RoomCategory, string> = {
  puzzle: 'Puzzle room',
  parlor: 'Parlor',
  utility: 'Utility room',
  mystery: 'Mystery room',
};

export const PUZZLE_KIND_LABELS: Record<RoomPuzzleKind, string> = {
  'word-web': 'Word-web room',
  'hive': 'Hive room',
  'twistle': 'Twistle room',
  'forgotten-word': 'Forgotten-word room',
  'cipher': 'Cipher room',
  'crossword': 'Crossword room',
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

/**
 * One distinct silhouette per word-game kind. Authored for contrast at 22px
 * AND in grayscale: hexagon / rails / dotted web / diagonal quill / key /
 * inked grid / shelf spines / notes / winding path / tilted tiles.
 */
export const PUZZLE_KIND_GLYPH_PATHS: Record<RoomPuzzleKind, ReactNode> = {
  // hexagon cell (the hive)
  'hive': (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.4 19.2 7.6v8.8L12 20.6 4.8 16.4V7.6Z" />
      <path d="M12 8.6l3.1 1.8v3.4L12 15.6l-3.1-1.8v-3.4Z" strokeWidth="1.3" />
    </g>
  ),
  // node web: center + spokes to four corners-of-diamond nodes
  'word-web': (
    <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M12 12 12 5.4M12 12l6.3 2.2M12 12l-6.3 2.2M12 12l3.9 6.1M12 12l-3.9 6.1" fill="none" />
      <path d="M12 5.4l6.3 8.8M12 5.4l-6.3 8.8M5.7 14.2l2.4 3.9M18.3 14.2l-2.4 3.9M8.1 18.1h7.8" fill="none" strokeWidth="0.9" opacity="0.7" />
      <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5.4" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18.3" cy="14.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="5.7" cy="14.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.9" cy="18.1" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8.1" cy="18.1" r="1.5" fill="currentColor" stroke="none" />
    </g>
  ),
  // quill over a baseline with a missing-word gap (the definition)
  'forgotten-word': (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 3.8c-4.6.7-8 3-10.1 6.9l1.9 1.9C14.7 10.5 17 7 19 3.8Z" />
      <path d="M8.9 12.6 5.6 17.4" />
      <path d="M4 20.4h5.2M13 20.4h7" strokeWidth="1.4" />
    </g>
  ),
  // key (the cipher)
  'cipher': (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3.9" />
      <path d="M10.8 10.8 19.6 19.6M16.4 16.4l2.7-2.7M13.5 13.5l2.1-2.1" />
    </g>
  ),
  // 3×3 grid, corner square inked (the crossword)
  'crossword': (
    <g stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="4.8" y="4.8" width="14.4" height="14.4" rx="1" fill="none" />
      <path d="M4.8 9.6h14.4M4.8 14.4h14.4M9.6 4.8v14.4M14.4 4.8v14.4" strokeWidth="1.1" fill="none" />
      <path d="M14.4 4.8h4.6a.4.4 0 0 1 .2.3v4.5h-4.8Z" fill="currentColor" stroke="none" />
    </g>
  ),
  // traced winding path, start dot to arrowhead (trace the word)
  'twistle': (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.6" cy="5.4" r="1.9" fill="currentColor" stroke="none" />
      <path d="M5.6 7.6c0 3.8 5 2.4 6.6 5 1.4 2.2 4.6 1.9 5.6 5.3" />
      <path d="M15.2 16.4l2.6 1.5-1.4 2.6" />
    </g>
  ),
};

/**
 * Every PlacedRoom.kind → its glyph: the six puzzle kinds plus the three
 * specialist categories ('puzzle' itself keeps the open book as a fallback
 * for kind-less contexts).
 */
export const ROOM_KIND_GLYPH_PATHS: Record<RoomPuzzleKind | RoomCategory, ReactNode> = {
  ...CATEGORY_GLYPH_PATHS,
  ...PUZZLE_KIND_GLYPH_PATHS,
};

/**
 * HTML wrapper for draft/cabinet card faces. Given a puzzleKind it draws that
 * room's own silhouette; otherwise the category family shape.
 */
export function RoomGlyph({
  category,
  puzzleKind,
  size = 24,
  className,
}: {
  category: RoomCategory;
  puzzleKind?: RoomPuzzleKind;
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
      aria-label={puzzleKind ? PUZZLE_KIND_LABELS[puzzleKind] : CATEGORY_LABELS[category]}
      style={{ display: 'block' }}
    >
      {puzzleKind ? PUZZLE_KIND_GLYPH_PATHS[puzzleKind] : CATEGORY_GLYPH_PATHS[category]}
    </svg>
  );
}

/** Back-compat alias: category-only contexts. */
export function CategoryGlyph(props: {
  category: RoomCategory;
  size?: number;
  className?: string;
}) {
  return <RoomGlyph {...props} />;
}
