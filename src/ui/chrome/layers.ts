/**
 * THE LAYERING SCALE — OWNER: A2 (chrome). PUBLISHED for every UI module.
 *
 * WHY THIS FILE EXISTS (the defect it closes, AAA 11.5):
 * `.chr-header` (the fixed day bar) was `z-index: 40`. So was `.dlg` (the
 * dialogue overlay) and so was `.bp-modal` (the draft/cabinet sheet). At equal
 * z-index the painting order falls back to DOM order, and `<GameChrome />`
 * mounts AFTER the route <Switch> in App.tsx — so the header painted, and
 * hit-tested, ON TOP of every scene the player believed was modal. The
 * `.chr-retire` control (two taps and the day is over) sat in that band. A
 * player tapping near the top of a "modal" draft could end her own evening.
 *
 * Nobody wrote that down; three modules each picked "40" independently. The
 * numbers below are the scale, and they are the ONLY numbers any module may
 * use. Two rules:
 *
 *   1. Never write a bare z-index. Write `var(--z-<rung>, <fallback>)` with
 *      the fallback from this table, so the layer is correct today and tracks
 *      tokens.css the moment the architect lands the block (SHARED-FILE
 *      REQUESTS). This mirrors what the moment layer already does.
 *   2. A rung is a decision about WHAT MAY BE TAPPED, not just what is seen.
 *      Anything painted above an overlay must be non-interactive unless its
 *      whole reason to be there is to be tapped (the moment seal).
 *
 * THE RUNGS (bottom to top):
 *
 *   page     0     Route surfaces: .bp-page, .room-host, .jrn-page, .snc-page.
 *                  Each is `position: fixed` and therefore its own stacking
 *                  context — a modal mounted INSIDE a page can never out-paint
 *                  anything above it, which is why chrome sits above overlays
 *                  rather than the other way round.
 *   overlay  40    Full-screen modal scenes: .dlg (dialogue), .bp-modal
 *                  (draft + floorplan cabinet), .chr-scene (morning card,
 *                  night digest). While one of these is mounted the chrome
 *                  above goes inert — see OVERLAY_SELECTOR below.
 *   chrome   50    The persistent day bar. DELIBERATELY ABOVE THE OVERLAYS,
 *                  and documented as such per AAA 11.5: the day numeral, the
 *                  candle and the gem/key/bookmark chips stay READABLE through
 *                  a scene, because "can I afford one more room?" is the
 *                  question the whole game is asking and a conversation is
 *                  exactly when she is deciding. READABLE, NOT TAPPABLE: the
 *                  header takes `pointer-events: none` while any overlay is
 *                  up, and the retire control is not rendered at all.
 *   veil     55    The dusk veil (.chr-dusk). Above the bar because dusk falls
 *                  over the whole house; `pointer-events: none` by design
 *                  (AAA 4.12's walk-but-no-interact grace) bar its own skip.
 *   notice   60    The notice rail (.chr-notices). Must clear the overlays —
 *                  a payout line rendered behind a modal is a notice that did
 *                  not happen (AAA 11.11). `pointer-events: none` all the way
 *                  down, so it can never swallow a tap meant for the scene.
 *   moment   100   The campaign seal (src/ui/moment/*). Above everything in
 *                  the game, and TAPPABLE — it is the one layer whose job is
 *                  to be pressed. It clears the chrome band by geometry
 *                  (moment.css reads --chrome-h), not by luck.
 *   material 120   Grain + vignette (index.css). Pointer-transparent paper
 *            121   tooth over the whole app.
 *   platform 9999  System-level prompts (app/platform/platform.css): the
 *                  update toast and the rotate-your-phone screen. Nothing in
 *                  the game may cover these.
 *
 * Consumed by: ui/chrome/chrome.css, ui/dialogue/dialogue.css,
 * ui/blueprint/blueprint.css, ui/moment/moment.css.
 */

export const LAYERS = {
  page: 0,
  overlay: 40,
  chrome: 50,
  veil: 55,
  notice: 60,
  moment: 100,
  material: 120,
  platform: 9999,
} as const;

export type LayerName = keyof typeof LAYERS;

/** The CSS custom property each rung is read from (requested in tokens.css). */
export const LAYER_VARS: Record<LayerName, string> = {
  page: '--z-page',
  overlay: '--z-overlay',
  chrome: '--z-chrome',
  veil: '--z-veil',
  notice: '--z-notice',
  moment: '--z-moment',
  material: '--z-material',
  platform: '--z-platform',
};

/**
 * What counts as "a scene the player believes is modal".
 *
 * Deliberately a CSS selector rather than a store flag: these overlays are
 * mounted from local component state in five different files owned by four
 * different agents (ManorPage's draft + cabinet + parlor visit, JournalView's
 * letter aside, DayTransitions' morning card), so no single slice of the store
 * knows they are up. The DOM does. A new overlay opts in for free by carrying
 * `data-overlay` — that attribute is the contract for anything added later.
 *
 * ROUND 9: the contract's first real customer, and proof the escape hatch was
 * needed. The Sanctum's VICTORY CEREMONY (won-reveal / won-portrait / the
 * epilogue while the ceremony runs) renders `.snc-page`, a route surface, not
 * one of the three class names above — so both locks were bypassed and the
 * `.chr-retire` moon was live, mounted and hit-testable over the campaign's
 * one unrepeatable scene. Two taps ended the day mid-ceremony. SanctumView now
 * carries `data-overlay` on those three branches (and deliberately NOT on the
 * already-solved landing, which is an ordinary page with a BackLink).
 * A ceremony row in tests/modal-hit-test.mjs keeps it that way.
 */
export const OVERLAY_SELECTOR = '[data-overlay], .dlg, .bp-modal, .chr-scene';

/** Stamped on <html> while any overlay is mounted (see overlay-watch.ts). */
export const OVERLAY_ATTR = 'data-overlay-open';
