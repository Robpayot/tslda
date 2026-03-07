import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
  vec3,
  vec4,
  uv,
  positionWorld,
  normalLocal,
  modelWorldMatrixInverse,
  smoothstep,
  dot,
  normalize,
  mix,
  select,
  step,
  fract,
} from 'three/tsl'
import { Color, Vector3 } from 'three'
import EnvManager from '../../../managers/EnvManager'

function fromLinear(linearRGB) {
  const higher = linearRGB.rgb.pow(1.0 / 2.4).mul(1.055).sub(0.055)
  const lower = linearRGB.rgb.mul(12.92)
  const t = step(float(0.0031308), linearRGB.rgb)
  return vec4(mix(lower, higher, t), linearRGB.a)
}

/**
 * Rope material: stripe gradient (color1/color2 from UV.y) + toon shading.
 * Matches original rope.frag + toon.vert logic.
 */
export function createRopeMaterial() {
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(0)
  const uColor1 = uniform(new Color('#eabf5f'))
  const uColor2 = uniform(new Color('#c68221'))

  const colorFn = Fn(() => {
    const vY = fract(uv().y.mul(60.0))
    const stripe = step(vY, float(0.18))
    const color = mix(uColor1, uColor2, stripe)

    const sunDirWorld = normalize(uSunDir.sub(positionWorld))
    const sunDirLocal = normalize(modelWorldMatrixInverse.mul(vec4(sunDirWorld, 0)).xyz)
    const shadow = dot(normalLocal, sunDirLocal)
    const toonShading = float(1)
      .mul(smoothstep(float(0.0), float(0.1), shadow))
      .mul(0.9)
      .mul(uCoefShadow)
      .add(uAmbientColor.r)

    const linearShading = vec3(toonShading, toonShading, toonShading)
    const srgbShading = fromLinear(vec4(linearShading, 1.0)).rgb
    const finalShading = select(uSRGBSpace.equal(1.0), srgbShading, linearShading)

    return vec4(color.mul(finalShading), 1.0)
  })

  const material = new NodeMaterial()
  material.name = 'toon'
  material.colorNode = colorFn()
  material.uSunDir = uSunDir
  material.uAmbientColor = uAmbientColor
  material.uCoefShadow = uCoefShadow
  material.uSRGBSpace = uSRGBSpace
  material.uColor1 = uColor1
  material.uColor2 = uColor2

  return material
}
