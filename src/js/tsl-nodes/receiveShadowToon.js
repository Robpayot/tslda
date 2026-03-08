/**
 * Shared TSL node logic for receive-shadow toon materials.
 * Replaces the former GLSL shadows/receiveShadow.vert + receiveShadow.frag used by both Boat and Link.
 */
import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  varying,
  float,
  vec3,
  vec4,
  uv,
  texture,
  positionLocal,
  positionWorld,
  normalLocal,
  normalGeometry,
  cameraViewMatrix,
  smoothstep,
  dot,
  normalize,
  mix,
  select,
  step,
  skinning,
  transformNormalToView,
} from 'three/tsl'
import { Color, Vector3 } from 'three'
import EnvManager from '../managers/EnvManager'
import LoaderManager from '../managers/LoaderManager'
import Settings from '../utils/Settings'

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
 * Creates a TSL toon material with shadow receiving.
 * Shared by Boat and Link (same as former receiveShadow.vert + receiveShadow.frag).
 * Pass a real THREE.Texture; to swap at runtime, replace the material with a new one.
 *
 * @param {THREE.Texture} [mapTexture] - Diffuse map; falls back to LoaderManager.defaultTexture if null/undefined.
 * @param {{ skinnedMesh?: THREE.SkinnedMesh }} [options]
 *   - skinnedMesh: when set (e.g. Link body part), we pass the skinned normal via varying; otherwise we use normalLocal. Both use view-space lighting (varying + transformNormalToView), same as entityToon.
 * @returns {NodeMaterial}
 */
export function createReceiveShadowMaterial(mapTexture, options = {}) {
  const { skinnedMesh = null } = options
  const mapTex = mapTexture ?? LoaderManager.defaultTexture
  return createReceiveShadowMaterialInternal(mapTex, { skinnedMesh, sRGBShading: false })
}

/**
 * Mouth material: receiveShadow.vert vertex + mouth.frag color logic.
 * Same as receive shadow (shadow coords, view-space normal, toon) but explicitly matches @glsl/link/mouth.frag:
 * base = texture(map, uv), toonshading = smoothstep(0,0.1,shadow)*0.9*coefShadow + ambient.r, *= receivedShadow, fromLinear;
 * output = vec4(base.rgb * toonshading.rgb, 1.0). Shading in sRGB (mouth.frag: "need to convert shadow only to SRGB").
 * Pass skinnedMesh (e.g. link-mouth) so normals are skinned (receiveShadow.vert USE_BONES path).
 *
 * @param {THREE.Texture} [mapTexture]
 * @param {THREE.SkinnedMesh} [skinnedMesh] - Mouth mesh so normals are skinned.
 * @returns {NodeMaterial}
 */
export function createMouthReceiveShadowMaterial(mapTexture, skinnedMesh = null) {
  const mapTex = mapTexture ?? LoaderManager.defaultTexture
  return createReceiveShadowMaterialInternal(mapTex, { skinnedMesh, sRGBShading: true })
}

function createReceiveShadowMaterialInternal(mapTex, options) {
  const { skinnedMesh = null, sRGBShading = false } = options
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(sRGBShading ? 1 : 0)

  const depthMapTex =
    Settings.castShadows && EnvManager.sunShadowMap?.map?.texture
      ? EnvManager.sunShadowMap.map.texture
      : LoaderManager.defaultTexture

  const shadowCam = EnvManager.sunShadowMap?.camera
  const uShadowCameraP = uniform(shadowCam?.projectionMatrix)
  const uShadowCameraV = uniform(shadowCam?.matrixWorldInverse)

  // Fix normals: varying + transformNormalToView (same pattern as entityToon). View-space lighting so sun is consistent.
  const vNormalLocal = varying(vec3(0, 1, 0), 'vNormalLocal_receiveShadow')
  const skinningNode = skinnedMesh ? skinning(skinnedMesh) : null
  const vNormalSkinned = skinningNode ? varying(vec3(0, 1, 0), 'vNormalSkinned') : null
  const positionNodeFn = skinningNode
    ? Fn(() => {
        const boneMatrices = skinningNode.boneMatricesNode
        const { skinNormal } = skinningNode.getSkinnedNormalAndTangent(boneMatrices, normalGeometry)
        vNormalSkinned.assign(normalize(skinNormal))
        return positionLocal
      })
    : Fn(() => {
        vNormalLocal.assign(normalLocal)
        return positionLocal
      })

  const normalViewNode = skinningNode != null ? transformNormalToView(vNormalSkinned) : transformNormalToView(vNormalLocal)

  const colorFn = Fn(() => {
    const tex = texture(mapTex, uv())

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

    const rawDir = normalize(uSunDir)
    const sunDirView = normalize(cameraViewMatrix.mul(vec4(rawDir, 0)).xyz)
    const shadow = dot(normalize(normalViewNode), sunDirView)

    const toonShading = float(1)
      .mul(smoothstep(float(0.0), float(0.1), shadow))
      .mul(0.9)
      .mul(uCoefShadow)
      .add(uAmbientColor.r)
      .mul(receivedShadow)

    const linearShading = vec4(toonShading, toonShading, toonShading, 1.0)
    const srgbShading = fromLinear(linearShading).rgb
    const finalShading = select(uSRGBSpace.equal(1.0), srgbShading, linearShading.rgb)

    // mouth.frag: base (raw) * toonshading (fromLinear). Mouth textures use LinearSRGBColorSpace so sampler returns raw (no decode); use tex directly * srgbShading.
    if (sRGBShading) {
      return vec4(tex.rgb.mul(srgbShading), 1.0)
    }
    return vec4(tex.rgb.mul(finalShading), 1.0)
  })

  const material = new NodeMaterial()
  material.name = 'toon'
  material.positionNode = positionNodeFn()
  material.normalNode = normalViewNode
  material.colorNode = colorFn()
  material.uSunDir = uSunDir
  material.uAmbientColor = uAmbientColor
  material.uCoefShadow = uCoefShadow
  // material.uSRGBSpace = uSRGBSpace
  material.uShadowCameraP = uShadowCameraP
  material.uShadowCameraV = uShadowCameraV

  return material
}
