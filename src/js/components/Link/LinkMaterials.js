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
  positionWorld,
  normalLocal,
  modelWorldMatrixInverse,
  smoothstep,
  dot,
  normalize,
  mix,
  select,
  step,
} from 'three/tsl'
import { Color, Vector2, Vector3 } from 'three'
import EnvManager from '../../managers/EnvManager'
import LoaderManager from '../../managers/LoaderManager'
import { createReceiveShadowMaterial } from '../../tsl-nodes/receiveShadowToon'

function fromLinear(linearRGB) {
  const higher = linearRGB.rgb
    .pow(1.0 / 2.4)
    .mul(1.055)
    .sub(0.055)
  const lower = linearRGB.rgb.mul(12.92)
  const t = step(float(0.0031308), linearRGB.rgb)
  return vec4(mix(lower, higher, t), linearRGB.a)
}

/**
 * Toon material. Pass a real THREE.Texture (skill: no texture(uniform)).
 * To swap map, replace material with createLinkToonMaterial(newTexture).
 */
export function createLinkToonMaterial(mapTexture) {
  const mapTex = mapTexture ?? LoaderManager.defaultTexture
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(0)

  const colorFn = Fn(() => {
    const tex = texture(mapTex, uv())
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

    return vec4(tex.rgb.mul(finalShading), 1.0)
  })

  const material = new NodeMaterial()
  material.name = 'toon'
  material.colorNode = colorFn()
  material.uSunDir = uSunDir
  material.uAmbientColor = uAmbientColor
  material.uCoefShadow = uCoefShadow
  material.uSRGBSpace = uSRGBSpace

  return material
}

/**
 * Toon + receive shadow. Pass a real THREE.Texture.
 * To swap map, replace material with createLinkReceiveShadowMaterial(newTexture).
 * Reuses shared receiveShadow logic (see tsl-nodes/receiveShadowToon.js).
 * Uses same model-space lighting as Boat/Crane (normalLocal + sunDirLocal) so normals match.
 */
export function createLinkReceiveShadowMaterial(mapTexture) {
  return createReceiveShadowMaterial(mapTexture ?? LoaderManager.defaultTexture)
}

/**
 * Pupil material: UV transform (uDir, uScale, uFlip), mask alpha, toon.
 * Pass real THREE.Texture for map and mask. To swap, replace material with createPupilMaterial(newMap, newMask).
 */
export function createPupilMaterial(mapTexture, maskTexture) {
  const mapTex = mapTexture ?? LoaderManager.defaultTexture
  const maskTex = maskTexture ?? LoaderManager.defaultTexture
  const uDir = uniform(new Vector2(0, 0))
  const uScale = uniform(1.05)
  const uFlip = uniform(-1)

  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)

  const colorFn = Fn(() => {
    const mask = texture(maskTex, uv())
    const uvBase = uv()
    const uvOffset = vec2(uDir.x.mul(uFlip), uDir.y)
    const uvTransformed = uvBase.add(uvOffset).sub(0.5).div(uScale).add(0.5)
    const tex = texture(mapTex, uvTransformed)
    const alpha = tex.a.mul(smoothstep(float(0.0), float(0.4), mask.r))

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

    return vec4(tex.rgb.mul(srgbShading), alpha)
  })

  const material = new NodeMaterial()
  material.name = 'toon'
  material.transparent = true
  material.colorNode = colorFn()
  material.uDir = uDir
  material.uScale = uScale
  material.uFlip = uFlip
  material.uSunDir = uSunDir
  material.uAmbientColor = uAmbientColor
  material.uCoefShadow = uCoefShadow

  return material
}

/**
 * Simple transparent material. Pass a real THREE.Texture.
 * To swap map, replace material with createLinkBasicMaterial(newTexture).
 */
export function createLinkBasicMaterial(mapTexture) {
  const mapTex = mapTexture ?? LoaderManager.defaultTexture

  const colorFn = Fn(() => {
    const tex = texture(mapTex, uv())
    return vec4(tex.rgb, tex.a)
  })

  const material = new NodeMaterial()
  material.transparent = true
  material.colorNode = colorFn()

  return material
}
