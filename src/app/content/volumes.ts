/**
 * Volume content registry — OWNER: A7 (Mystery). The volumes half of the
 * per-domain content split (ARCHITECTURE §1, app/content/). Authored volume
 * files ship as static JSON (offline-authored, solver-verified by
 * tests/volume-solvability.test.ts) and are typed here as VolumeContent —
 * the engine stays pure and receives content by parameter.
 */

import type { VolumeContent, VolumePlate, VolumePlateTable } from '../../engine/volume';
import { getPools, lazyContent, poolsReady } from '../pools';

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

/**
 * THE PLATE (round 47) — the precomputed field size for every set of engravings
 * this volume can have made out. `null` before the content chunk lands or for a
 * volume with no plate, and the journal simply says nothing rather than
 * printing a number it cannot stand behind.
 */
export function getVolumePlate(volumeId: string): VolumePlate | null {
  if (!poolsReady()) return null;
  const table = getPools().volumePlates as VolumePlateTable | undefined;
  return table?.[volumeId] ?? null;
}
