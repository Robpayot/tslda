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
  vec2,
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
import { Color, Vector2, Vector3 } from 'three'
import EnvManager from '../managers/EnvManager'
import LoaderManager from '../managers/LoaderManager'
import Settings from '../utils/Settings'

/** Texel size for PCF; fallback if shadow map not ready */
const SHADOW_MAP_TEXEL_SIZE = 1 / 512

/**
 * Shared receive-shadow node (same logic as Ocean): boat-only shadow map, raw depth in .r,
 * clear<0.001→lit, depthInRange 0.02–0.98, Y flip, 2×2 PCF.
 * @param {{ depthMapTex, uShadowCameraP, uShadowCameraV, uShadowMapTexelSize? }} params
 * @returns {import('three/tsl').ShaderNode<float>} receivedShadow (1=lit, 0.5=shadow)
 */
export function createReceiveShadowNode(params) {
  const {
    depthMapTex,
    uShadowCameraP,
    uShadowCameraV,
    uShadowMapTexelSize = float(SHADOW_MAP_TEXEL_SIZE),
  } = params
  return Fn(() => {
    const shadowCoord4 = uShadowCameraP.mul(uShadowCameraV).mul(vec4(positionWorld, 1.0))
    const shadowCoord = shadowCoord4.xyz.div(shadowCoord4.w).mul(0.5).add(0.5)
    const depthShadowCoord = shadowCoord.z
    const baseUv = vec2(shadowCoord.x, float(1).sub(shadowCoord.y))
    const bias = float(0.01)
    const depthBias = depthShadowCoord.sub(bias)
    const o = uShadowMapTexelSize
    const d0 = texture(depthMapTex, baseUv).r
    const d1 = texture(depthMapTex, baseUv.add(vec2(o, 0))).r
    const d2 = texture(depthMapTex, baseUv.add(vec2(0, o))).r
    const d3 = texture(depthMapTex, baseUv.add(vec2(o, o))).r
    const s0 = select(d0.lessThan(0.001), float(1), step(depthBias, d0))
    const s1 = select(d1.lessThan(0.001), float(1), step(depthBias, d1))
    const s2 = select(d2.lessThan(0.001), float(1), step(depthBias, d2))
    const s3 = select(d3.lessThan(0.001), float(1), step(depthBias, d3))
    const shadowFactor = s0.add(s1).add(s2).add(s3).div(4)
    const inFrustum = shadowCoord.x
      .greaterThanEqual(0)
      .and(shadowCoord.x.lessThanEqual(1))
      .and(shadowCoord.y.greaterThanEqual(0))
      .and(shadowCoord.y.lessThanEqual(1))
      .and(shadowCoord.z.lessThanEqual(1))
    const depthInRange = depthShadowCoord.greaterThan(0.02).and(depthShadowCoord.lessThan(0.98))
    const shadowFactorClamped = select(inFrustum.and(depthInRange), shadowFactor, float(1))
    const shadowDarkness = float(0.5)
    return mix(float(1).sub(shadowDarkness), float(1), shadowFactorClamped)
  })()
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
 * Pupil material: same receive shadow as boat/face, with UV transform (uDir, uScale, uFlip) and mask alpha.
 * Pass map texture, mask texture, and optionally the mesh (for skinned normals). Set texture.colorSpace = SRGBColorSpace on pupil textures so they decode like GLB.
 *
 * @param {THREE.Texture} [mapTexture]
 * @param {THREE.Texture} [maskTexture]
 * @param {THREE.Mesh|THREE.SkinnedMesh|null} [mesh]
 * @returns {NodeMaterial}
 */
export function createPupilReceiveShadowMaterial(mapTexture, maskTexture, mesh = null) {
  const mapTex = mapTexture ?? LoaderManager.defaultTexture
  const maskTex = maskTexture ?? LoaderManager.defaultTexture
  const isSkinned = mesh != null && mesh.type === 'SkinnedMesh'
  return createReceiveShadowMaterialInternal(mapTex, {
    skinnedMesh: isSkinned ? mesh : null,
    maskTexture: maskTex,
    uvTransform: true,
  })
}

function createReceiveShadowMaterialInternal(mapTex, options) {
  const { skinnedMesh = null, sRGBShading = false, maskTexture = null, uvTransform = false } = options
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(sRGBShading ? 1 : 0)

  const uDir = uvTransform ? uniform(new Vector2(0, 0)) : null
  const uScale = uvTransform ? uniform(1.05) : null
  const uFlip = uvTransform ? uniform(-1) : null

  // Sail-only shadow map: boat-body and Link sample this so they never see their own depth.
  const depthMapTex =
    Settings.castShadows && EnvManager.sunShadowMapSailOnly?.texture
      ? EnvManager.sunShadowMapSailOnly.texture
      : LoaderManager.defaultTexture

  const shadowCam = EnvManager.sunShadowMap?.camera
  const uShadowCameraP = uniform(shadowCam?.projectionMatrix)
  const uShadowCameraV = uniform(shadowCam?.matrixWorldInverse)
  const mapW = EnvManager.sunShadowMap?.map?.width ?? 512
  const uShadowMapTexelSize = float(1 / mapW)

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
    const uvBase = uv()
    const uvTransformed =
      uvTransform && uDir && uScale && uFlip
        ? uvBase.add(vec2(uDir.x.mul(uFlip), uDir.y)).sub(0.5).div(uScale).add(0.5)
        : uvBase
    const tex = texture(mapTex, uvTransformed)

    const receivedShadow =
      Settings.castShadows && shadowCam
        ? createReceiveShadowNode({ depthMapTex, uShadowCameraP, uShadowCameraV, uShadowMapTexelSize })
        : float(1.0)

    const rawDir = normalize(uSunDir)
    const sunDirView = normalize(cameraViewMatrix.mul(vec4(rawDir, 0)).xyz)
    const shadow = dot(normalize(normalViewNode), sunDirView)

    const toonShading = float(1)
      .mul(smoothstep(float(0.0), float(0.1), shadow))
      .mul(0.9)
      .mul(uCoefShadow)
      .add(uAmbientColor.r)
      .mul(receivedShadow)

    if (maskTexture) {
      const mask = texture(maskTexture, uvBase)
      const alpha = tex.a.mul(smoothstep(float(0.0), float(0.4), mask.r))
      return vec4(tex.rgb.mul(toonShading), alpha)
    }
    return vec4(tex.rgb.mul(toonShading), 1.0)
  })

  const material = new NodeMaterial()
  material.name = 'toon'
  material.positionNode = positionNodeFn()
  material.normalNode = normalViewNode
  material.colorNode = colorFn()
  material.uSunDir = uSunDir
  material.uAmbientColor = uAmbientColor
  material.uCoefShadow = uCoefShadow
  material.uSRGBSpace = uSRGBSpace
  material.uShadowCameraP = uShadowCameraP
  material.uShadowCameraV = uShadowCameraV
  if (maskTexture) {
    material.transparent = true
    material.uDir = uDir
    material.uScale = uScale
    material.uFlip = uFlip
  }

  return material
}
