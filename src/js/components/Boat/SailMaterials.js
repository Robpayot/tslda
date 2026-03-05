import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
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
  sin,
  cos,
} from 'three/tsl'
import { Color, Vector3 } from 'three'
import EnvManager from '../../managers/EnvManager'

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
    const windScale = float(7).mul(float(1).add(uVelocity.mul(0.1)))
    const windNoise = sin(uTime.add(pos.y.mul(0.5)))
      .add(sin(uTime.mul(1.3).add(pos.y.mul(0.8))))
      .add(cos(uTime.mul(0.7).add(pos.y.mul(0.3))))
    const noise = windNoise.mul(windScale)
    pos.y.addAssign(noise)
    pos.z.addAssign(noise)
    return pos
  })

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
    return vec4(tex.rgb.mul(shaded), tex.a.mul(0.96))
  })

  const material = new NodeMaterial()
  material.name = 'toon'
  material.positionNode = positionFn()
  material.colorNode = colorFn()
  material.transparent = true
  material.depthWrite = false
  material.uSunDir = uSunDir
  material.uAmbientColor = uAmbientColor
  material.uCoefShadow = uCoefShadow
  material.uTime = uTime
  material.uVelocity = uVelocity

  return material
}
