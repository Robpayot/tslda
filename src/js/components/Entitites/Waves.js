import {
  InstancedBufferAttribute,
  Matrix4,
  PlaneGeometry,
  InstancedMesh,
  DoubleSide,
} from 'three'
import { NodeMaterial } from 'three/webgpu'

import {
  Fn,
  varying,
  uniform,
  float,
  vec2,
  vec4,
  sin,
  texture,
  uv,
  instanceIndex,
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
// import OceanHeightMap from '../Ocean/OceanHeightMap' // RenderTarget: uncomment when heightmap in vertex is supported

const NB_POINTS = 300
const RANGE = 1200
const SPRITE_SCALE = 7

// Set to true to force bright red quads (no texture/discard) to verify waves are in the scene
const WAVES_DEBUG_VISIBLE = true

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

    // Per-instance phase from instanceIndex (no custom InstancedBufferAttribute in shader - more reliable in WebGPU)
    const offsetNode = float(instanceIndex).mul(0.33)
    const speedNode = float(1).add(float(instanceIndex).mul(0.002))
    const vProgress = varying(
      sin(uTime.mul(0.1).mul(speedNode).add(offsetNode)),
      'vProgress'
    )
    const vProgressAlpha = varying(
      sin(uTime.mul(0.1).add(offsetNode)),
      'vProgressAlpha'
    )

    const colorFn = Fn(() => {
      if (WAVES_DEBUG_VISIBLE) {
        return vec4(1.0, 0.2, 0.2, 0.95)
      }
      const uvBase = uv()
      const alpha = float(1).sub(vProgressAlpha)
      const ratioUV = uRatioTexture.mul(float(0.5).add(vProgress.mul(0.5)))
      const uvY = uvBase.y.add(ratioUV.mul(0.5).sub(0.5)).div(ratioUV)
      const uvSampler = vec2(uvBase.x, uvY)
      const tex = texture(mapTexture, uvSampler)

      If(tex.r.lessThan(0.5), () => {
        Discard()
      })

      const finalAlpha = tex.a.mul(alpha).mul(uOpacity).mul(uGlobalOpacity)
      return vec4(tex.rgb, finalAlpha)
    })

    const material = new NodeMaterial()
    material.colorNode = colorFn()
    material.side = DoubleSide
    material.transparent = true
    material.depthWrite = false
    material.depthTest = true

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
    planeGeo.setAttribute('offset', new InstancedBufferAttribute(new Float32Array(offsets), 1))
    planeGeo.setAttribute('speed', new InstancedBufferAttribute(new Float32Array(speeds), 1))

    const mesh = new InstancedMesh(planeGeo, this.#material, NB_POINTS)
    const matrix = new Matrix4()

    for (let i = 0; i < NB_POINTS; i++) {
      matrix.identity()
      matrix.setPosition(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      matrix.scale(SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE)
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
