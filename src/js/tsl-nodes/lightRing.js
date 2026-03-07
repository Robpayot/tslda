/**
 * LightRing TSL materials: heightmap displacement + additive color with noise-based alpha.
 * Replaces GLSL @glsl/partials/basicHeightmap.vert + @glsl/game/lightRing.frag and lightColumn.frag.
 */
import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
  vec2,
  vec4,
  uv,
  texture,
  positionLocal,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  smoothstep,
  max,
} from 'three/tsl'
import { AdditiveBlending, Color, DoubleSide } from 'three'
import { pnoise } from '../utils/pnoise.tsl.js'

const SPEED = 0.03
const NOISE_PERIOD = 100

function createHeightmapPositionNode(heightMapTexture, uScaleOcean) {
  return Fn(() => {
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
    return positionLocal.add(localDisp.xyz)
  })
}

/**
 * Ring: alpha = (0.5 + noise) * (edges * 0.7), edges = 1 - abs((uv.y - 0.5) * 2)
 */
export function createLightRingMaterial(color, heightMapTexture, scaleOcean = 3000) {
  const uScaleOcean = uniform(scaleOcean)
  const uColor = uniform(color instanceof Color ? color : new Color(color))
  const uTime = uniform(0)

  const rep = vec2(NOISE_PERIOD, NOISE_PERIOD)

  const positionNode = createHeightmapPositionNode(heightMapTexture, uScaleOcean)()

  const colorFn = Fn(() => {
    const uvBase = uv()
    const t = uTime.mul(SPEED)
    const P1 = vec2(uvBase.x.sub(0.5).mul(2.0).abs().add(t), uvBase.y)
    const n1 = pnoise(P1, rep)
    const n2 = max(float(0), pnoise(vec2(P1.x.add(0.5), P1.y.add(t.mul(2.0))), rep))
    const n3 = max(float(0), pnoise(vec2(P1.x.add(1.0), P1.y), rep))
    const noise = n1.add(n2).add(n3).mul(0.5).add(0.5)
    const edges = float(1).sub(uvBase.y.sub(0.5).mul(2.0).abs())
    const alpha = noise.mul(edges).mul(0.7)
    return vec4(uColor.rgb, alpha)
  })

  const material = new NodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  })
  material.name = 'lightRing'
  material.positionNode = positionNode
  material.colorNode = colorFn()
  material.uTime = uTime
  material.uColor = uColor
  material.uScaleOcean = uScaleOcean

  return material
}

/**
 * Column: alpha = (0.5 + noise) * (edges * 0.7) * bottom, edges = 1 - uv.y, bottom = smoothstep(0, 0.2, uv.y)
 */
export function createLightColumnMaterial(color, heightMapTexture, scaleOcean = 3000) {
  const uScaleOcean = uniform(scaleOcean)
  const uColor = uniform(color instanceof Color ? color : new Color(color))
  const uTime = uniform(0)

  const rep = vec2(NOISE_PERIOD, NOISE_PERIOD)

  const positionNode = createHeightmapPositionNode(heightMapTexture, uScaleOcean)()

  const colorFn = Fn(() => {
    const uvBase = uv()
    const t = uTime.mul(SPEED)
    const P1 = vec2(uvBase.x.sub(0.5).mul(2.0).abs().add(t), uvBase.y)
    const n1 = pnoise(P1, rep)
    const n2 = max(float(0), pnoise(vec2(P1.x.add(0.5), P1.y.add(t.mul(2.0))), rep))
    const noise = n1.add(n2).mul(0.5).add(0.5)
    const edges = float(1).sub(uvBase.y)
    const bottom = smoothstep(float(0), float(0.2), uvBase.y)
    const alpha = noise.mul(edges).mul(0.7).mul(bottom)
    return vec4(uColor.rgb, alpha)
  })

  const material = new NodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  })
  material.name = 'lightColumn'
  material.positionNode = positionNode
  material.colorNode = colorFn()
  material.uTime = uTime
  material.uColor = uColor
  material.uScaleOcean = uScaleOcean

  return material
}
