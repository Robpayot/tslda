import {
  uniform,
  float,
  uv,
  mix,
  step,
  fract,
} from 'three/tsl'
import { Color } from 'three'
import { createToonMaterialWithColor } from '../../../tsl-nodes/toon'

/**
 * Rope material: stripe gradient (color1/color2 from UV.y) + toon shading.
 * Reuses shared toon from tsl-nodes/toon.js (same as toon.vert + toon.frag).
 */
export function createRopeMaterial() {
  const uColor1 = uniform(new Color('#eabf5f'))
  const uColor2 = uniform(new Color('#c68221'))

  const material = createToonMaterialWithColor(() => {
    const vY = fract(uv().y.mul(60.0))
    const stripe = step(vY, float(0.18))
    return mix(uColor1, uColor2, stripe)
  }, {})

  material.uColor1 = uColor1
  material.uColor2 = uColor2
  return material
}
