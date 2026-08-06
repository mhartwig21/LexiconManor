/**
 * Volume content registry — OWNER: A7 (Mystery). The volumes half of the
 * per-domain content split (ARCHITECTURE §1, app/content/). Authored volume
 * files ship as static JSON (offline-authored, solver-verified by
 * tests/volume-solvability.test.ts) and are typed here as VolumeContent —
 * the engine stays pure and receives content by parameter.
 */

import type { VolumeContent } from '../../engine/volume';
import { getPools, lazyContent } from '../pools';

/** In play order. Volume 1 is hand-authored end-to-end; later volumes come
 *  from content/generate-volume.ts + hand-authored definition poems.
 *  Lazy view over the pools registry (AAA 9.6). */
const VOLUMES: VolumeContent[] = lazyContent<VolumeContent[]>(
  () => getPools().volumes as unknown as VolumeContent[],
);

export function getVolumeContent(volumeId: string): VolumeContent | null {
  return VOLUMES.find((v) => v.id === volumeId) ?? null;
}

/** The volume after this one, if authored — solving rolls the manor onto it. */
export function nextVolumeContent(volumeId: string): VolumeContent | null {
  const i = VOLUMES.findIndex((v) => v.id === volumeId);
  return i >= 0 ? (VOLUMES[i + 1] ?? null) : null;
}

export function allVolumes(): readonly VolumeContent[] {
  return VOLUMES;
}
