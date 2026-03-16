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
  normalLocal,
  normalGeometry,
  cameraViewMatrix,
  smoothstep,
  dot,
  normalize,
  transformNormalToView,
  skinning,
} from 'three/tsl'
import { Color, Vector3 } from 'three'
import EnvManager from '../../managers/EnvManager'
import LoaderManager from '../../managers/LoaderManager'
import { createReceiveShadowMaterial, createPupilReceiveShadowMaterial } from '../../tsl-nodes/receiveShadowToon'

/**
 * Toon material. Pass a real THREE.Texture and optionally the mesh (required for SkinnedMesh so normals are skinned).
 * Uses view-space lighting, same approach as createReceiveShadowMaterialInternal.
 * To swap map, replace material with createLinkToonMaterial(newTexture, mesh).
 */
export function createLinkToonMaterial(mapTexture, mesh = null) {
  const mapTex = mapTexture ?? LoaderManager.defaultTexture
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(0)

  const isSkinned = mesh != null && mesh.type === 'SkinnedMesh'
  const vNormalLocal = varying(vec3(0, 1, 0), 'vNormalLocal_toon')
  const skinningNode = isSkinned ? skinning(mesh) : null
  const vNormalSkinned = skinningNode ? varying(vec3(0, 1, 0), 'vNormalSkinned_toon') : null

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
    const rawDir = normalize(uSunDir)
    const sunDirView = normalize(cameraViewMatrix.mul(vec4(rawDir, 0)).xyz)
    const shadow = dot(normalize(normalViewNode), sunDirView)
    const toonShading = float(1)
      .mul(smoothstep(float(0.0), float(0.1), shadow))
      .mul(0.9)
      .mul(uCoefShadow)
      .add(uAmbientColor.r)

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

  return material
}

/**
 * Toon + receive shadow. Pass a real THREE.Texture and optionally the mesh (required for SkinnedMesh so normals are skinned like receiveShadow.vert).
 * To swap map, replace material with createLinkReceiveShadowMaterial(newTexture, mesh).
 */
export function createLinkReceiveShadowMaterial(mapTexture, mesh = null) {
  const isSkinned = mesh != null && mesh.type === 'SkinnedMesh'
  return createReceiveShadowMaterial(mapTexture ?? LoaderManager.defaultTexture, {
    skinnedMesh: isSkinned ? mesh : null,
  })
}

/**
 * Mouth: same receive shadow as boat/face. Pass the mouth mesh so normals are skinned. To swap texture, replace material with createLinkMouthMaterial(newTexture, mouthMesh).
 */
export function createLinkMouthMaterial(mapTexture, mouthMesh = null) {
  return createLinkReceiveShadowMaterial(mapTexture ?? LoaderManager.defaultTexture, mouthMesh)
}

/**
 * Pupil material: same receive shadow as boat/face, with UV transform (uDir, uScale, uFlip) and mask alpha.
 * Pass map, mask, and optionally mesh. Set texture.colorSpace = SRGBColorSpace on pupil textures. To swap, replace material with createPupilMaterial(newMap, newMask, mesh).
 */
export function createPupilMaterial(mapTexture, maskTexture, mesh = null) {
  return createPupilReceiveShadowMaterial(
    mapTexture ?? LoaderManager.defaultTexture,
    maskTexture ?? LoaderManager.defaultTexture,
    mesh,
  )
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
