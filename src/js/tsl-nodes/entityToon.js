/**
 * Entity TSL material: toon shading (barrel.frag-style) with optional ocean heightmap displacement.
 * Replaces GLSL @glsl/partials/toonHeightmap.vert + @glsl/game/barrel.frag (and variants: rupee.frag, toonWorld.vert, wall.vert).
 * Use for Barrels, Rupees, Mirador, Ship, ShipGrey, Walls.
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
  normalize,
  positionLocal,
  normalLocal,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  transformDirection,
  transpose,
} from 'three/tsl'
import { Color, Vector3 } from 'three'
import EnvManager from '../managers/EnvManager'
import { buildToonShadingNode } from './toon'

/**
 * Creates a TSL material for entities: toon shading (smoothstep 0–smoothstepMax) and optional
 * vertex Y displacement from the ocean heightmap. Works with Mesh and SkinnedMesh.
 *
 * @param {object} options
 * @param {THREE.Texture} [options.mapTexture] - Diffuse map (use for barrel, ship, walls, mirador)
 * @param {THREE.Color} [options.tintColor] - Solid tint color when no map (use for rupees)
 * @param {THREE.Texture} [options.heightMapTexture] - OceanHeightMap.heightMap.texture; if set, enables heightmap displacement
 * @param {number} [options.scaleOcean] - Default SCALE_OCEAN (3000)
 * @param {number} [options.smoothstepMax] - Toon shadow smoothstep max (barrel: 0.5, rupee: 0.8)
 * @param {number} [options.ambientMul] - Ambient multiplier (barrel: 1, rupee: 0.5)
 * @param {string} [options.name] - material.name
 * @returns {NodeMaterial}
 */
export function createEntityToonMaterial(options = {}) {
  const {
    mapTexture = null,
    tintColor = null,
    heightMapTexture = null,
    scaleOcean = 3000,
    smoothstepMax = 0.5,
    ambientMul = 1,
    name = 'entityToon',
  } = options

  if (!mapTexture && !tintColor) {
    throw new Error('entityToon: provide mapTexture or tintColor')
  }

  const uScaleOcean = uniform(scaleOcean)
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(0)
  const uTintColor = tintColor ? uniform(tintColor) : null

  const vNormalWorld = varying(vec3(0, 0, 0), 'vNormalWorld')

  const shadingNode = buildToonShadingNode({
    uSunDir,
    uAmbientColor,
    uCoefShadow,
    uSRGBSpace,
    smoothstepMax,
    ambientMul,
    normalWorldNode: vNormalWorld,
  })

  let positionNode = null
  if (heightMapTexture) {
    const positionNodeFn = Fn(() => {
      const wCenter = modelWorldMatrix.mul(vec4(0.0, 0.0, 0.0, 1.0))
      const uvGrid = vec2(
        float(0.5).add(wCenter.x.div(uScaleOcean)),
        float(0.5).add(wCenter.z.div(uScaleOcean))
      )
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
      const displacedLocal = positionLocal.add(localDisp.xyz)
      vNormalWorld.assign(normalize(transformDirection(normalLocal, transpose(modelWorldMatrixInverse))))
      return displacedLocal
    })
    positionNode = positionNodeFn()
  } else {
    const positionNodeFn = Fn(() => {
      vNormalWorld.assign(normalize(transformDirection(normalLocal, transpose(modelWorldMatrixInverse))))
      return positionLocal
    })
    positionNode = positionNodeFn()
  }

  const colorFn = Fn(() => {
    const baseColor = mapTexture
      ? texture(mapTexture, uv()).rgb
      : uTintColor.rgb
    const finalShading = shadingNode()
    return vec4(baseColor.mul(finalShading), 1.0)
  })

  const material = new NodeMaterial()
  material.name = name
  material.positionNode = positionNode
  material.colorNode = colorFn()
  material.uScaleOcean = uScaleOcean
  material.uSunDir = uSunDir
  material.uAmbientColor = uAmbientColor
  material.uCoefShadow = uCoefShadow
  if (uTintColor) material.uTintColor = uTintColor

  return material
}
