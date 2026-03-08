/**
 * Shared TSL toon material logic.
 * Replaces GLSL @glsl/partials/toon.vert + toon.frag used by Boat, Crane, TriforceShards, Seabox.
 */
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
  cameraViewMatrix,
  smoothstep,
  dot,
  normalize,
  mix,
  select,
  step,
} from 'three/tsl'
import { Color, Vector3 } from 'three'
import EnvManager from '../managers/EnvManager'
import LoaderManager from '../managers/LoaderManager'

function fromLinear(linearRGB) {
  const higher = linearRGB.rgb.pow(1.0 / 2.4).mul(1.055).sub(0.055)
  const lower = linearRGB.rgb.mul(12.92)
  const t = step(float(0.0031308), linearRGB.rgb)
  return vec4(mix(lower, higher, t), linearRGB.a)
}

/**
 * Build toon shading: smoothstep shadow * coefShadow * 0.9 + ambient, optional sRGB.
 * Same formula as toon.frag. Exported for reuse (e.g. barrel, receiveShadowToon).
 *
 * - Default (Boat, etc.): local-space lighting — sunDirLocal from modelWorldMatrixInverse, dot(normalLocal, sunDirLocal).
 * - When positionNode is overridden or SkinnedMesh (Barrel, Link): pass positionWorldNode + normalWorldNode and we do
 *   world-space lighting so it stays camera-independent: dot(normalWorldNode, sunDirWorld).
 *
 * @param {object} [options.positionWorldNode] - Vertex-varying world position (required if normalWorldNode is set).
 * @param {object} [options.normalWorldNode] - Vertex-varying world normal. If set, use world-space lighting (like Link in receiveShadowToon).
 * @param {object} [options.normalViewNode] - View-space normal (e.g. from transformNormalToView(normalLocal)). If set, use view-space lighting: dot(normalView, sunDirView).
 * @param {object} [options.sunDirWorldNode] - Vertex-varying sun direction (world space). If unset and normalWorldNode is set, sun is treated as directional: normalize(uSunDir), no position — camera-independent.
 */
export function buildToonShadingNode({
  uSunDir,
  uAmbientColor,
  uCoefShadow,
  uSRGBSpace,
  smoothstepMax = 0.1,
  ambientMul = 1,
  positionWorldNode = null,
  normalLocalNode = null,
  normalWorldNode = null,
  normalViewNode = null,
  sunDirWorldNode = null,
}) {
  return Fn(() => {
    const rawDir = normalize(uSunDir)
    const worldPos = positionWorldNode != null ? positionWorldNode : positionWorld
    const sunDirFromPosition = normalize(uSunDir.sub(worldPos))
    const sunDirDirectional = vec3(rawDir.x, rawDir.y.negate(), rawDir.z.negate())
    const baseSunDir = normalWorldNode != null ? sunDirDirectional : sunDirFromPosition
    const sunDirWorld = sunDirWorldNode != null ? normalize(sunDirWorldNode) : baseSunDir
    const sunDirView = normalViewNode != null ? normalize(cameraViewMatrix.mul(vec4(rawDir, 0)).xyz) : null
    let shadow
    if (normalViewNode != null) {
      shadow = dot(normalize(normalViewNode), sunDirView)
    } else if (normalWorldNode != null) {
      shadow = dot(normalize(normalWorldNode), sunDirWorld)
    } else {
      shadow = dot(normalLocalNode != null ? normalLocalNode : normalLocal, normalize(modelWorldMatrixInverse.mul(vec4(sunDirWorld, 0)).xyz))
    }
    const toonShading = float(1)
      .mul(smoothstep(float(0.0), float(smoothstepMax), shadow))
      .mul(0.9)
      .mul(uCoefShadow)
      .add(uAmbientColor.r.mul(ambientMul))

    const linearShading = vec3(toonShading, toonShading, toonShading)
    const srgbShading = fromLinear(vec4(linearShading, 1.0)).rgb
    return select(uSRGBSpace.equal(1.0), srgbShading, linearShading)
  })
}

/**
 * Creates a TSL toon material (no shadow receiving).
 * Replaces toon.vert + toon.frag. Used by Boat, Crane body, Seabox.
 *
 * @param {THREE.Texture} [mapTexture] - Diffuse map; falls back to LoaderManager.defaultTexture if null/undefined.
 * @param {{ uSRGBSpace?: number, smoothstepMax?: number, ambientMul?: number }} [options]
 *   - uSRGBSpace: 0 = linear, 1 = sRGB shading (default 0)
 *   - smoothstepMax: toon edge (default 0.1, Triforce uses 0.8)
 *   - ambientMul: multiply ambient term (default 1, Triforce uses 0.5)
 * @returns {NodeMaterial}
 */
export function createToonMaterial(mapTexture, options = {}) {
  const {
    uSRGBSpace: uSRGBSpaceDefault = 0,
    smoothstepMax = 0.1,
    ambientMul = 1,
  } = options

  const mapTex = mapTexture ?? LoaderManager.defaultTexture
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(uSRGBSpaceDefault)

  const shadingNode = buildToonShadingNode({
    uSunDir,
    uAmbientColor,
    uCoefShadow,
    uSRGBSpace,
    smoothstepMax,
    ambientMul,
  })

  const colorFn = Fn(() => {
    const tex = texture(mapTex, uv())
    const finalShading = shadingNode()
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
 * Creates a toon material with custom base color (e.g. stripe gradient).
 * Used by Crane rope. Same toon shading as createToonMaterial.
 *
 * @param {() => import('three/tsl').Node} getBaseColorNode - Function returning a vec3 color node (e.g. () => mix(uColor1, uColor2, stripe))
 * @param {{ uSRGBSpace?: number, smoothstepMax?: number, ambientMul?: number }} [options]
 * @returns {NodeMaterial}
 */
export function createToonMaterialWithColor(getBaseColorNode, options = {}) {
  const {
    uSRGBSpace: uSRGBSpaceDefault = 0,
    smoothstepMax = 0.1,
    ambientMul = 1,
  } = options

  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(uSRGBSpaceDefault)

  const shadingNode = buildToonShadingNode({
    uSunDir,
    uAmbientColor,
    uCoefShadow,
    uSRGBSpace,
    smoothstepMax,
    ambientMul,
  })

  const colorFn = Fn(() => {
    const baseColor = getBaseColorNode()
    const finalShading = shadingNode()
    return vec4(baseColor.mul(finalShading), 1.0)
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
 * Creates a toon material with optional alpha from map and/or UV cut (e.g. islands.frag).
 * Used by Islands. smoothstepMax 0.5 matches islands.frag.
 *
 * @param {THREE.Texture} [mapTexture] - Diffuse map; falls back to LoaderManager.defaultTexture if null/undefined.
 * @param {{ smoothstepMax?: number, useAlphaMap?: boolean, useAlphaMapCutY?: boolean }} [options]
 *   - smoothstepMax: toon edge (default 0.5 for islands)
 *   - useAlphaMap: use texture alpha, transparent, alphaTest 0.05 (USE_ALPHAMAP)
 *   - useAlphaMapCutY: discard/mask when uv.y < 0.05 (USE_ALPHAMAP_CUTY)
 * @returns {NodeMaterial}
 */
export function createToonMaterialWithAlpha(mapTexture, options = {}) {
  const {
    smoothstepMax = 0.5,
    useAlphaMap = false,
    useAlphaMapCutY = false,
  } = options

  const mapTex = mapTexture ?? LoaderManager.defaultTexture
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(0)

  const shadingNode = buildToonShadingNode({
    uSunDir,
    uAmbientColor,
    uCoefShadow,
    uSRGBSpace,
    smoothstepMax,
    ambientMul: 1,
  })

  const colorFn = Fn(() => {
    const tex = texture(mapTex, uv())
    const finalShading = shadingNode()
    let alpha = float(1.0)
    if (useAlphaMap) alpha = tex.a
    if (useAlphaMapCutY) alpha = alpha.mul(step(float(0.05), uv().y))
    return vec4(tex.rgb.mul(finalShading), alpha)
  })

  const material = new NodeMaterial()
  material.name = 'toon'
  material.colorNode = colorFn()
  material.uSunDir = uSunDir
  material.uAmbientColor = uAmbientColor
  material.uCoefShadow = uCoefShadow
  if (useAlphaMap || useAlphaMapCutY) {
    material.transparent = true
    if (useAlphaMap) material.alphaTest = 0.05
  }
  return material
}
