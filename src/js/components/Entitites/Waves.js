import {
  InstancedBufferAttribute,
  Matrix4,
  PlaneGeometry,
  InstancedMesh,
  DoubleSide,
  Vector3,
} from 'three'
import { NodeMaterial } from 'three/webgpu'

import {
  Fn,
  varying,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  sin,
  texture,
  uv,
  instanceIndex,
  positionLocal,
  positionWorld,
  If,
  Discard,
} from 'three/tsl'
import { MathUtils } from 'three'
const { randFloatSpread, randFloat } = MathUtils
import LoaderManager from '../../managers/LoaderManager'
import { gsap } from 'gsap'
import GridManager from '../../managers/GridManager'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import EnvManager from '../../managers/EnvManager'
import OceanHeightMap from '../Ocean/OceanHeightMap'

const NB_POINTS = 300
const RANGE = 1200
const SPRITE_SCALE = 15

export default class Waves {
  #geo
  #mesh
  #material
  constructor() {
    this.#material = this._createMaterial()
    this.#mesh = this._createMesh()

    this.tlReset = new gsap.timeline({ repeat: -1, repeatDelay: 5 })
    this.tlReset.to(this.material.uOpacity, {
      value: 0,
      duration: 0.8,
    })
    this.tlReset.add(() => {
      this.mesh.initPos.x = GridManager.offsetUV.x * (SCALE_OCEAN / REPEAT_OCEAN)
      this.mesh.initPos.z = -GridManager.offsetUV.y * (SCALE_OCEAN / REPEAT_OCEAN)
    })
    this.tlReset.to(this.material.uOpacity, {
      value: 1,
      duration: 0.8,
    })
  }

  get mesh() {
    return this.#mesh
  }

  get material() {
    return this.#material
  }

  _createMaterial() {
    const waveAsset = LoaderManager.get('wave')
    const mapTexture = LoaderManager.getTexture('wave')
    const texSource = waveAsset?.texture?.source?.data
    const textureH = texSource?.naturalHeight ?? 1
    const textureW = texSource?.naturalWidth ?? 1
    if (waveAsset?.texture) waveAsset.texture.flipY = false

    const uTime = uniform(0)
    const uRatioTexture = uniform(textureH / textureW)
    const uOpacity = uniform(1)
    const uGlobalOpacity = uniform(EnvManager.settingsOcean.alphaWaves)
    const uScaleOcean = uniform(SCALE_OCEAN)

    const heightMapTex = OceanHeightMap.heightMap?.texture ?? LoaderManager.defaultTexture

    // Vertex: heightmap Y displacement
    // Original GLSL modifies gl_Position.y (clip space after projection).
    // In TSL positionNode works in local space (before instance matrix).
    // The instance matrix scales by SPRITE_SCALE, so local displacement is amplified.
    // We replicate the original formula and divide by SPRITE_SCALE to compensate.
    const positionNodeFn = Fn(() => {
      const wPos = positionWorld
      const uvGrid = vec2(
        float(0.5).add(wPos.x.div(uScaleOcean)),
        float(0.5).sub(wPos.z.div(uScaleOcean))
      )
      const offs = float(0.01)
      const hm0 = texture(heightMapTex, uvGrid)
      const hm1A = texture(heightMapTex, vec2(uvGrid.x.add(offs), uvGrid.y))
      const hm1B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.add(offs)))
      const hm2A = texture(heightMapTex, vec2(uvGrid.x.sub(offs), uvGrid.y))
      const hm2B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.sub(offs)))
      const avgH = hm0.r.add(hm1A.r).add(hm1B.r).add(hm2A.r).add(hm2B.r).div(5.0)
      // Original: (avgH - 0.5) * 2 * (b * 100) * 2 in clip space
      const disp = avgH.sub(0.5).mul(2.0).mul(hm0.b.mul(100.0)).mul(2.0).div(float(SPRITE_SCALE))
      return positionLocal.add(vec3(0, disp, 0))
    })

    // Per-instance animation phase derived from instanceIndex
    const idx = float(instanceIndex)
    const offsetVal = idx.mul(0.33)
    const speedVal = float(1).add(idx.mul(0.002))
    const vProgress = varying(sin(uTime.mul(0.1).mul(speedVal).add(offsetVal)), 'vProgress')
    const vProgressAlpha = varying(sin(uTime.mul(0.1).add(offsetVal)), 'vProgressAlpha')

    // Fragment: sample wave texture with UV manipulation, discard dark pixels
    const colorFn = Fn(() => {
      const uvBase = uv()
      const alpha = float(1).sub(vProgressAlpha)
      const ratioUV = uRatioTexture.mul(float(0.5).add(vProgress.mul(0.5)))
      // Original: uv.y += ratioUV / 2 - 0.5;  uv.y /= ratioUV;
      const uvY = uvBase.y.add(ratioUV.div(2.0).sub(0.5)).div(ratioUV)
      const uvSampler = vec2(uvBase.x, uvY)
      const tex = texture(mapTexture, uvSampler)

      If(tex.r.lessThan(0.5), () => {
        Discard()
      })

      return vec4(tex.rgb, tex.a.mul(alpha).mul(uOpacity).mul(uGlobalOpacity))
    })

    const material = new NodeMaterial()
    material.positionNode = positionNodeFn()
    material.colorNode = colorFn()
    material.side = DoubleSide
    material.transparent = true
    material.depthWrite = false

    material.uTime = uTime
    material.uRatioTexture = uRatioTexture
    material.uOpacity = uOpacity
    material.uGlobalOpacity = uGlobalOpacity

    return material
  }

  _createMesh() {
    const positions = []
    const offsets = []
    const speeds = []

    for (let i = 0; i < NB_POINTS; i++) {
      positions.push(randFloatSpread(RANGE), 0, randFloatSpread(RANGE))
      offsets.push(randFloat(0, 100))
      speeds.push(randFloat(1, 1.5))
    }

    const planeGeo = new PlaneGeometry(1, 1)
    planeGeo.rotateX(-Math.PI / 2) // Lay flat in XZ plane, normal pointing up
    planeGeo.setAttribute('offset', new InstancedBufferAttribute(new Float32Array(offsets), 1))
    planeGeo.setAttribute('speed', new InstancedBufferAttribute(new Float32Array(speeds), 1))

    const mesh = new InstancedMesh(planeGeo, this.#material, NB_POINTS)
    const matrix = new Matrix4()

    for (let i = 0; i < NB_POINTS; i++) {
      matrix.identity()
      matrix.setPosition(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      matrix.scale(new Vector3(SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE))
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    mesh.position.y = 4
    mesh.initPos = mesh.position.clone()
    mesh.visible = true
    mesh.renderOrder = 5
    mesh.frustumCulled = false

    return mesh
  }
}
