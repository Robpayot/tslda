/**
 * Entity TSL material: toon shading (barrel.frag-style) with optional ocean heightmap displacement.
 * Replaces GLSL @glsl/partials/toonHeightmap.vert + @glsl/game/barrel.frag (and variants: rupee.frag, toonWorld.vert, wall.vert).
 * Use for Barrels, Rupees, Mirador, Ship, ShipGrey, Walls.
 *
 * For InstancedMesh (EXPLORE mode):
 *   1. createEntityToonMaterial({ ..., isInstanced: true })
 *   2. new InstancedMesh(geo, material, count)
 *   (no finalizeInstancedMaterial needed — positionNode uses builder.object at shader compile time)
 */
import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  varying,
  attribute,
  float,
  vec2,
  vec3,
  vec4,
  uv,
  texture,
  positionLocal,
  normalLocal,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  transformNormalToView,
  mat3,
  storage,
  instanceIndex,
} from 'three/tsl'
import { Color, Vector3 } from 'three'
import EnvManager from '../managers/EnvManager'
import { buildToonShadingNode } from './toon'

// ---------------------------------------------------------------------------
// Main material factory
// ---------------------------------------------------------------------------

/**
 * Creates a TSL material for entities: toon shading (smoothstep 0–smoothstepMax) and optional
 * vertex Y displacement from the ocean heightmap. Works with Mesh and SkinnedMesh.
 *
 * For InstancedMesh, pass isInstanced: true, then call finalizeInstancedMaterial(material, mesh)
 * after creating the InstancedMesh (getInstanceMatrixNode needs mesh.instanceMatrix).
 *
 * @param {object} options
 * @param {THREE.Texture} [options.mapTexture] - Diffuse map (use for barrel, ship, walls, mirador)
 * @param {THREE.Color} [options.tintColor] - Solid tint color when no map (use for rupees)
 * @param {THREE.Texture} [options.heightMapTexture] - OceanHeightMap.heightMap.texture; if set, enables heightmap displacement
 * @param {number} [options.scaleOcean] - Default SCALE_OCEAN (3000)
 * @param {number} [options.smoothstepMax] - Toon shadow smoothstep max (barrel: 0.5, rupee: 0.8)
 * @param {number} [options.ambientMul] - Ambient multiplier (barrel: 1, rupee: 0.5)
 * @param {string} [options.name] - material.name
 * @param {boolean} [options.isInstanced] - Set true for InstancedMesh; positionNode uses builder.object at compile time
 * @returns {NodeMaterial}
 */
export function createEntityToonMaterial(options = {}) {
  const {
    mapTexture = null,
    tintColor = null,
    useInstanceColor = false,
    heightMapTexture = null,
    scaleOcean = 3000,
    smoothstepMax = 0.5,
    ambientMul = 1,
    name = 'entityToon',
    isInstanced = false,
  } = options

  if (!mapTexture && !tintColor && !useInstanceColor) {
    throw new Error('entityToon: provide mapTexture, tintColor, or useInstanceColor')
  }

  // vNormalLocal is assigned in the vertex shader (positionNode or vertexNode) and consumed
  // in normalNode. Same pattern as Items.js in mcdonal-runner.
  const vNormalLocal = varying(vec3(0, 1, 0), `vNormalLocal_${name}`)
  const normalViewNode = transformNormalToView(vNormalLocal)

  const uScaleOcean = uniform(scaleOcean)
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(0)
  const uTintColor = tintColor ? uniform(tintColor) : null

  const shadingNode = buildToonShadingNode({
    uSunDir,
    uAmbientColor,
    uCoefShadow,
    uSRGBSpace,
    smoothstepMax,
    ambientMul,
    normalViewNode,
  })

  const material = new NodeMaterial()
  material.name = name
  material.uScaleOcean = uScaleOcean
  material.uSunDir = uSunDir
  material.uAmbientColor = uAmbientColor
  material.uCoefShadow = uCoefShadow
  if (uTintColor) material.uTintColor = uTintColor

  // nodes

  material.colorNode = customColorNode(mapTexture, uTintColor, shadingNode, useInstanceColor)
  material.normalNode = normalViewNode

  if (isInstanced) {
    // positionNode uses builder.object at shader compile time — no separate finalize call needed.
    // In the positionNode sub-build context, normalLocal is the raw geometry normal (InstanceNode's
    // transform is not visible there), so we manually apply the instance matrix to it here.
    material.positionNode = customInstancedPositionNode(heightMapTexture, uScaleOcean, vNormalLocal)
  } else {
    material.positionNode = customPositionNode(heightMapTexture, uScaleOcean, vNormalLocal)
  }

  return material
}

const customColorNode = (mapTexture, uTintColor, shadingNode, useInstanceColor) =>
  Fn(() => {
    let baseColor
    if (useInstanceColor) baseColor = attribute('iColor', 'vec4').rgb
    else if (mapTexture) baseColor = texture(mapTexture, uv()).rgb
    else baseColor = uTintColor.rgb
    const finalShading = shadingNode()
    return vec4(baseColor.mul(finalShading), 1.0)
  })()

const customPositionNode = (heightMapTexture, uScaleOcean, vNormalLocal) =>
  Fn(() => {
    vNormalLocal.assign(normalLocal)

    if (!heightMapTexture) return positionLocal

    // Ocean heightmap logic
    const wCenter = modelWorldMatrix.mul(vec4(0.0, 0.0, 0.0, 1.0))
    const uvGrid = vec2(float(0.5).add(wCenter.x.div(uScaleOcean)), float(0.5).add(wCenter.z.div(uScaleOcean)))
    const off = float(0.01)
    const hmC = texture(heightMapTexture, uvGrid)
    const hm1A = texture(heightMapTexture, vec2(uvGrid.x.add(off), uvGrid.y))
    const hm1B = texture(heightMapTexture, vec2(uvGrid.x, uvGrid.y.add(off)))
    const hm2A = texture(heightMapTexture, vec2(uvGrid.x.sub(off), uvGrid.y))
    const hm2B = texture(heightMapTexture, vec2(uvGrid.x, uvGrid.y.sub(off)))
    const avgH = hmC.r.add(hm1A.r).add(hm1B.r).add(hm2A.r).add(hm2B.r).div(5.0)
    const disp = avgH.sub(0.5).mul(2.0).mul(hmC.b.mul(100.0))
    const worldDispVec = vec4(0.0, disp, 0.0, 0.0)
    const localDisp = modelWorldMatrixInverse.mul(worldDispVec)
    return positionLocal.add(localDisp.xyz)
  })()

const customInstancedPositionNode = (heightMapTexture, uScaleOcean, vNormalLocal) =>
  Fn((builder) => {
    const instanceMatrixNode = storage(builder.object.instanceMatrix, 'mat4', Math.max(builder.object.count, 1)).element(instanceIndex)

    if (builder.hasGeometryAttribute('normal')) {
      const instanceNormal = transformNormal(normalLocal, instanceMatrixNode)
      normalLocal.assign(instanceNormal)
      vNormalLocal.assign(normalLocal)
    }

    if (!heightMapTexture) return positionLocal

    // Instance origin in world space for heightmap UV sampling
    const instanceOrigin = instanceMatrixNode.mul(vec4(0.0, 0.0, 0.0, 1.0))
    const worldCenter = modelWorldMatrix.mul(instanceOrigin)
    // Ocean heightmap logic

    const uvGrid = vec2(float(0.5).add(worldCenter.x.div(uScaleOcean)), float(0.5).add(worldCenter.z.div(uScaleOcean)))
    const off = float(0.01)
    const hmC = texture(heightMapTexture, uvGrid)
    const hm1A = texture(heightMapTexture, vec2(uvGrid.x.add(off), uvGrid.y))
    const hm1B = texture(heightMapTexture, vec2(uvGrid.x, uvGrid.y.add(off)))
    const hm2A = texture(heightMapTexture, vec2(uvGrid.x.sub(off), uvGrid.y))
    const hm2B = texture(heightMapTexture, vec2(uvGrid.x, uvGrid.y.sub(off)))
    const avgH = hmC.r.add(hm1A.r).add(hm1B.r).add(hm2A.r).add(hm2B.r).div(5.0)
    const disp = avgH.sub(0.5).mul(2.0).mul(hmC.b.mul(100.0))
    const worldDispVec = vec4(0.0, disp, 0.0, 0.0)
    const localDisp = modelWorldMatrixInverse.mul(worldDispVec)
    return positionLocal.add(localDisp.xyz)
  })()

// From Threejs
export const transformNormal = /*@__PURE__*/ Fn(([normal, matrix = modelWorldMatrix]) => {
  const m = mat3(matrix)

  const transformedNormal = normal.div(vec3(m[0].dot(m[0]), m[1].dot(m[1]), m[2].dot(m[2])))

  return m.mul(transformedNormal).xyz
})
