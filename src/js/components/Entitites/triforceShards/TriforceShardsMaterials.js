import { createToonMaterial } from '../../../tsl-nodes/toon'

/**
 * Triforce shard toon material.
 * Reuses shared toon from tsl-nodes/toon.js with Triforce variant: smoothstep(0, 0.8), ambient * 0.5.
 */
export function createTriforceShardMaterial(mapTexture) {
  return createToonMaterial(mapTexture, {
    smoothstepMax: 0.8,
    ambientMul: 0.5,
  })
}
