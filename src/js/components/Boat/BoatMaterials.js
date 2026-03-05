import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
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
import { Color, Vector3 } from 'three'
import EnvManager from '../../managers/EnvManager'
import LoaderManager from '../../managers/LoaderManager'
import Settings from '../../utils/Settings'

const BIT_SHIFT = vec4(
  1.0 / (256.0 * 256.0 * 256.0),
  1.0 / (256.0 * 256.0),
  1.0 / 256.0,
  1.0,
)

function unpackRGBAToDepth(color) {
  return dot(color, BIT_SHIFT)
}

function fromLinear(linearRGB) {
  const higher = linearRGB.rgb.pow(1.0 / 2.4).mul(1.055).sub(0.055)
  const lower = linearRGB.rgb.mul(12.92)
  const t = step(float(0.0031308), linearRGB.rgb)
  return vec4(mix(lower, higher, t), linearRGB.a)
}

/**
 * Creates a TSL toon material (no shadow receiving).
 */
export function createToonMaterial(mapTexture) {
  // Pass reference so EnvManager updates are reflected (original used sunDir: { value: EnvManager.sunDir.position })
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(0)

  const colorFn = Fn(() => {
    const tex = texture(mapTexture, uv())
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
 * Creates a TSL toon material with shadow receiving (for boat-body).
 */
export function createReceiveShadowMaterial(mapTexture) {
  // Pass reference so EnvManager updates are reflected (original used sunDir: { value: EnvManager.sunDir.position })
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(0)

  const depthMapTex = Settings.castShadows && EnvManager.sunShadowMap?.map?.texture
    ? EnvManager.sunShadowMap.map.texture
    : LoaderManager.defaultTexture

  const shadowCam = EnvManager.sunShadowMap?.camera
  const uShadowCameraP = uniform(shadowCam?.projectionMatrix)
  const uShadowCameraV = uniform(shadowCam?.matrixWorldInverse)

  const colorFn = Fn(() => {
    const tex = texture(mapTexture, uv())
    const sunDirWorld = normalize(uSunDir.sub(positionWorld))
    const sunDirLocal = normalize(modelWorldMatrixInverse.mul(vec4(sunDirWorld, 0)).xyz)
    const shadow = dot(normalLocal, sunDirLocal)

    let receivedShadow = float(1.0)
    if (Settings.castShadows && shadowCam) {
      const shadowCoord4 = uShadowCameraP.mul(uShadowCameraV).mul(vec4(positionWorld, 1.0))
      const shadowCoord = shadowCoord4.xyz.div(shadowCoord4.w).mul(0.5).add(0.5)

      const depthShadowCoord = shadowCoord.z
      const depthMapSample = texture(depthMapTex, shadowCoord.xy)
      const depthDepthMap = unpackRGBAToDepth(depthMapSample)

      const bias = float(0.01)
      const shadowFactor = step(depthShadowCoord.sub(bias), depthDepthMap)

      const inFrustum = shadowCoord.x
        .greaterThanEqual(0.0)
        .and(shadowCoord.x.lessThanEqual(1.0))
        .and(shadowCoord.y.greaterThanEqual(0.0))
        .and(shadowCoord.y.lessThanEqual(1.0))
        .and(shadowCoord.z.lessThanEqual(1.0))
      const clampedFactor = select(inFrustum, shadowFactor, float(1.0))

      const shadowDarkness = float(0.5)
      receivedShadow = mix(float(1.0).sub(shadowDarkness), float(1.0), clampedFactor)
    }

    const toonShading = float(1)
      .mul(smoothstep(float(0.0), float(0.1), shadow))
      .mul(0.9)
      .mul(uCoefShadow)
      .add(uAmbientColor.r)
      .mul(receivedShadow)

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
