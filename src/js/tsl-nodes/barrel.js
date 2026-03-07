/**
 * Barrel TSL material: toon shading + ocean heightmap vertex displacement.
 * Replaces GLSL @glsl/partials/toonHeightmap.vert + @glsl/game/barrel.frag.
 * Barrels follow the ocean surface by sampling OceanHeightMap in the vertex shader.
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
 * Creates a TSL material for barrels: toon shading (smoothstep 0–0.5) and
 * vertex Y displacement from the ocean heightmap so barrels sit on the waves.
 * Works with both Mesh and SkinnedMesh (positionLocal is skinned when applicable).
 *
 * @param {THREE.Texture} mapTexture - Diffuse map for the barrel
 * @param {THREE.Texture} heightMapTexture - OceanHeightMap.heightMap.texture
 * @param {{ scaleOcean?: number }} [options] - scaleOcean defaults to SCALE_OCEAN (3000)
 * @returns {NodeMaterial}
 */
export function createBarrelMaterial(mapTexture, heightMapTexture, options = {}) {
  const scaleOcean = options.scaleOcean ?? 3000

  const uScaleOcean = uniform(scaleOcean)
  const uSunDir = uniform(EnvManager.sunDir?.position ?? new Vector3(0, 10, 0))
  const uAmbientColor = uniform(EnvManager.ambientLight?.color ?? new Color(0xffffff))
  const uCoefShadow = uniform(EnvManager.settings?.coefShadow ?? 1)
  const uSRGBSpace = uniform(0)

  // World-space lighting. Sun is directional (normalize(uSunDir)), no position — same direction everywhere, camera-independent.
  const vNormalWorld = varying(vec3(0, 0, 0), 'vNormalWorld')

  const shadingNode = buildToonShadingNode({
    uSunDir,
    uAmbientColor,
    uCoefShadow,
    uSRGBSpace,
    smoothstepMax: 0.5,
    ambientMul: 1,
    normalWorldNode: vNormalWorld,
  })

  // World → heightmap UV. WebGPU render target has top-left origin (WebGL has bottom-left), so flip V when sampling.
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
    // vDepth = (depth + yStrength)/(2*yStrength) => depth = (avgH - 0.5) * 2 * yStrength; hmC.b = yStrength/100
    const disp = avgH.sub(0.5).mul(2.0).mul(hmC.b.mul(100.0))

    const worldDispVec = vec4(0.0, disp, 0.0, 0.0)
    const localDisp = modelWorldMatrixInverse.mul(worldDispVec)
    const displacedLocal = positionLocal.add(localDisp.xyz)

    vNormalWorld.assign(normalize(transformDirection(normalLocal, transpose(modelWorldMatrixInverse))))

    return displacedLocal
  })

  const colorFn = Fn(() => {
    const tex = texture(mapTexture, uv())
    const finalShading = shadingNode()
    return vec4(tex.rgb.mul(finalShading), 1.0)
  })

  const material = new NodeMaterial()
  material.name = 'barrel'
  material.positionNode = positionNodeFn()
  material.colorNode = colorFn()
  material.uScaleOcean = uScaleOcean
  material.uSunDir = uSunDir
  material.uAmbientColor = uAmbientColor
  material.uCoefShadow = uCoefShadow

  return material
}
