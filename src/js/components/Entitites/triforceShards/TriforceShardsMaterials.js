import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
  vec4,
  uv,
  texture,
  positionWorld,
  normalLocal,
  modelWorldMatrixInverse,
  smoothstep,
  dot,
  normalize,
} from 'three/tsl'
import { Color, Vector3 } from 'three'
import EnvManager from '../../../managers/EnvManager'

/**
 * Triforce shard toon material.
 * Matches game/triforce.frag: smoothstep(0, 0.8, shadow), ambientColor.r * 0.5.
 */
export function createTriforceShardMaterial(mapTexture) {
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)

  const colorFn = Fn(() => {
    const tex = texture(mapTexture, uv())
    const sunDirWorld = normalize(uSunDir.sub(positionWorld))
    const sunDirLocal = normalize(modelWorldMatrixInverse.mul(vec4(sunDirWorld, 0)).xyz)
    const shadow = dot(normalLocal, sunDirLocal)
    const toonShading = smoothstep(float(0.0), float(0.8), shadow)
      .mul(0.9)
      .mul(uCoefShadow)
      .add(uAmbientColor.r.mul(0.5))

    return vec4(tex.rgb.mul(toonShading), 1.0)
  })

  const material = new NodeMaterial()
  material.name = 'toon'
  material.colorNode = colorFn()

  return material
}
