import {
  InstancedBufferAttribute,
  Matrix4,
  PlaneGeometry,
  InstancedMesh,
  DoubleSide,
  Vector3,
  Quaternion,
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
  positionLocal,
  modelWorldMatrix,
  modelWorldMatrixInverse,
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

const _scale = new Vector3(SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE)
const _mat4 = new Matrix4()
const _pos = new Vector3()
const _quat = new Quaternion()
const _camPos = new Vector3()
const _up = new Vector3(0, 1, 0)

export default class Waves {
  #geo
  #mesh
  #material
  #positions = [] // flat array of initial XYZ per instance
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

    const heightMapTex = OceanHeightMap.heightMap?.texture
    const uScaleOcean = uniform(SCALE_OCEAN)
    const uTime = uniform(0)
    const uRatioTexture = uniform(textureH / textureW)
    const uOpacity = uniform(1)
    const uGlobalOpacity = uniform(EnvManager.settingsOcean.alphaWaves)

    // Per-instance animation phase derived from instanceIndex
    const idx = float(instanceIndex)
    const offsetVal = idx.mul(0.33)
    const speedVal = float(1).add(idx.mul(0.002))
    const vProgress = varying(sin(uTime.mul(0.1).mul(speedVal).add(offsetVal)), 'vProgress')
    const vProgressAlpha = varying(sin(uTime.mul(0.1).add(offsetVal)), 'vProgressAlpha')

    // Vertex: sample OceanHeightMap texture at world X,Z to get live Y displacement
    const positionNodeFn = Fn(() => {
      const pos = positionLocal
      // World position via instance + mesh matrix (before this node modifies it)
      const wPos = modelWorldMatrix.mul(vec4(pos, 1.0))

      // Map world X,Z → heightmap UV (same as original GLSL)
      const uvGrid = vec2(
        float(0.5).add(wPos.x.div(uScaleOcean)),
        float(0.5).sub(wPos.z.div(uScaleOcean)),
      )

      // 5-tap cross average to reduce flicker (same as original)
      const off = float(0.01)
      const hmC  = texture(heightMapTex, uvGrid)
      const hm1A = texture(heightMapTex, vec2(uvGrid.x.add(off), uvGrid.y))
      const hm1B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.add(off)))
      const hm2A = texture(heightMapTex, vec2(uvGrid.x.sub(off), uvGrid.y))
      const hm2B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.sub(off)))

      const avgH = hmC.r.add(hm1A.r).add(hm1B.r).add(hm2A.r).add(hm2B.r).div(5.0)

      // Original GLSL: gl_Position.y += (avgH - 0.5) * 2 * (B * 100) * 2
      // B channel = uYStrength / 100, so (B*100) = uYStrength
      const disp = avgH.sub(0.5).mul(2.0).mul(hmC.b.mul(100.0)).mul(2.0)

      // disp is world-space Y; transform to instance-local space
      // (billboard rotation means local Y ≠ world Y)
      const worldDispVec = vec4(0.0, disp, 0.0, 0.0)
      const localDisp = modelWorldMatrixInverse.mul(worldDispVec)

      return pos.add(localDisp.xyz)
    })

    // Fragment: sample wave texture with UV manipulation, discard dark pixels
    const colorFn = Fn(() => {
      const uvBase = uv()
      const flippedY = float(1).sub(uvBase.y)
      const alpha = float(1).sub(vProgressAlpha)
      const ratioUV = uRatioTexture.mul(float(0.5).add(vProgress.mul(0.5)))
      const uvY = flippedY.add(ratioUV.div(2.0).sub(0.5)).div(ratioUV)
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

  billboardToCamera(camera) {
    camera.getWorldPosition(_camPos)
    const mesh = this.#mesh
    const meshPos = mesh.position
    const camLocal = _camPos.sub(meshPos)

    for (let i = 0; i < NB_POINTS; i++) {
      _pos.set(this.#positions[i * 3], this.#positions[i * 3 + 1], this.#positions[i * 3 + 2])

      _mat4.lookAt(camLocal, _pos, _up)
      _quat.setFromRotationMatrix(_mat4)
      _mat4.compose(_pos, _quat, _scale)
      mesh.setMatrixAt(i, _mat4)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  _createMesh() {
    const offsets = []
    const speeds = []

    for (let i = 0; i < NB_POINTS; i++) {
      this.#positions.push(randFloatSpread(RANGE), 0, randFloatSpread(RANGE))
      offsets.push(randFloat(0, 100))
      speeds.push(randFloat(1, 1.5))
    }

    const planeGeo = new PlaneGeometry(1, 1) // XY plane — billboard rotation will face it toward camera
    planeGeo.setAttribute('offset', new InstancedBufferAttribute(new Float32Array(offsets), 1))
    planeGeo.setAttribute('speed', new InstancedBufferAttribute(new Float32Array(speeds), 1))

    const mesh = new InstancedMesh(planeGeo, this.#material, NB_POINTS)

    for (let i = 0; i < NB_POINTS; i++) {
      _mat4.identity()
      _mat4.setPosition(this.#positions[i * 3], this.#positions[i * 3 + 1], this.#positions[i * 3 + 2])
      _mat4.scale(_scale)
      mesh.setMatrixAt(i, _mat4)
    }
    mesh.instanceMatrix.needsUpdate = true

    mesh.position.y = 4
    mesh.initPos = mesh.position.clone()
    mesh.frustumCulled = false

    return mesh
  }
}
