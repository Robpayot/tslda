import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  uv,
  texture,
  positionLocal,
  positionWorld,
  normalLocal,
  modelWorldMatrixInverse,
  smoothstep,
  dot,
  normalize,
} from 'three/tsl'
import { pnoise } from '../../../utils/pnoise.tsl.js'
import { Color, DoubleSide, Vector3 } from 'three'
import EnvManager from '../../../managers/EnvManager'

/**
 * Creates a TSL sail material with toon shading and wind effect.
 * Uses morphTargetInfluences from the mesh (positionLocal includes morphing).
 * Wind is applied on top of the morphed position.
 */
export function createSailMaterial(mapTexture) {
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uTime = uniform(0)
  const uVelocity = uniform(0)

  const positionFn = Fn(() => {
    const pos = positionLocal.toVar()
    const P = vec2(uTime, uTime)
    const rep = vec2(pos.y, 1.0)
    const noiseVal = pnoise(P, rep)
    const windScale = float(7).mul(float(1).add(uVelocity.mul(0.1)))
    const noise = noiseVal.mul(windScale)
    return vec3(pos.x, pos.y.add(noise), pos.z.add(noise))
  })

  // Match sail.frag: texture, toon shade RGB, alpha *= 0.96
  const colorFn = Fn(() => {
    const tex = texture(mapTexture, uv())
    const sunDirWorld = normalize(uSunDir.sub(positionWorld))
    const sunDirLocal = normalize(modelWorldMatrixInverse.mul(vec4(sunDirWorld, 0)).xyz)
    const shadow = dot(normalLocal, sunDirLocal)
    const toonShading = smoothstep(float(0.0), float(0.5), shadow)
      .mul(0.9)
      .mul(uCoefShadow)
      .add(uAmbientColor.r.mul(2))
    const shaded = vec3(toonShading, toonShading, toonShading)
    return vec4(tex.rgb.mul(shaded), 0.96)
  })

  const material = new NodeMaterial()
  material.transparent = true
  material.name = 'toon'
  material.map = mapTexture
  material.positionNode = positionFn()
  material.colorNode = colorFn()
  material.uSunDir = uSunDir
  material.uAmbientColor = uAmbientColor
  material.uCoefShadow = uCoefShadow
  material.uTime = uTime
  material.uVelocity = uVelocity

  return material
}
