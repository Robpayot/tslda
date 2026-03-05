import { Matrix4, PlaneGeometry, InstancedMesh, DoubleSide, Vector3, Quaternion } from 'three'
import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
  vec2,
  vec4,
  texture,
  uv,
  instanceIndex,
  smoothstep,
  select,
  hash,
} from 'three/tsl'
import LoaderManager from '../../managers/LoaderManager'
import { MathUtils } from 'three'
const { randFloat } = MathUtils
import { gsap } from 'gsap'
import GridManager from '../../managers/GridManager'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import EnvManager from '../../managers/EnvManager'

const NB_POINTS = 10
const RANGE_MAX = 3000
const RANGE_MIN = 2500
// Original gl_PointSize = 1000 * (400 / -mvPosition.z), K = 400000
// Conversion factor C = 1/3000 → base 133. Scaled 2x to match stars.
const SPRITE_SCALE = 266

const _scale = new Vector3(SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE)
const _mat4 = new Matrix4()
const _pos = new Vector3()
const _quat = new Quaternion()
const _camPos = new Vector3()
const _up = new Vector3(0, 1, 0)

export default class Lightnings {
  #mesh
  #material
  #positions = []
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
    const lightningAsset = LoaderManager.get('lightning')
    const mapTexture = LoaderManager.getTexture('lightning')
    const texSource = lightningAsset?.texture?.source?.data
    const textureW = texSource?.naturalWidth ?? 1
    const textureH = texSource?.naturalHeight ?? 1
    if (lightningAsset?.texture) lightningAsset.texture.flipY = false

    const uTime = uniform(0)
    const uRatioTexture = uniform(textureH / textureW)
    const uOpacity = uniform(1)
    const uGlobalOpacity = uniform(EnvManager.settingsOcean.alphaLightnings)

    const colorFn = Fn(() => {
      const uvBase = uv()
      const flippedY = float(1).sub(uvBase.y)

      // Per-instance pseudo-random values matching original attribute ranges
      const idx = float(instanceIndex)
      const offsetVal = hash(idx).mul(100.0)                       // [0, 100] like randFloat(0, 100)
      const speedVal = hash(idx.add(100.0)).mul(0.5).add(1.0)     // [1, 1.5] like randFloat(1, 1.5)
      const scaleVal = hash(idx.add(200.0)).mul(0.5)              // [0, 0.5] like randFloat(0, 0.5)

      // Original: vProgressAlpha = sin(uTime * 0.2 + offset) * 2
      const progressAlpha = uTime.mul(0.2).mul(speedVal).add(offsetVal).sin().mul(2.0)
      const alpha = float(1).sub(progressAlpha)

      const ratioUV = uRatioTexture

      // Original: uv.y *= (1. - vScale);  uv.x *= ratioUV;
      const uvY = flippedY.mul(float(1).sub(scaleVal))
      const uvX = uvBase.x.mul(ratioUV)

      // Mirror X if offset > 50 (roughly half the instances)
      const flipped = select(offsetVal.greaterThan(50.0), ratioUV.sub(uvX), uvX)
      const uvSampler = vec2(flipped, uvY)

      const tex = texture(mapTexture, uvSampler)

      const finalAlpha = tex.a
        .mul(alpha)
        .mul(smoothstep(float(0.4), float(1.0), tex.r))
        .mul(uOpacity)
        .mul(uGlobalOpacity)

      return vec4(tex.rgb, finalAlpha)
    })

    const material = new NodeMaterial()
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
    let angle = 0
    const planeGeo = new PlaneGeometry(1, 1)
    const mesh = new InstancedMesh(planeGeo, this.#material, NB_POINTS)

    for (let i = 0; i < NB_POINTS; i++) {
      const radius = randFloat(RANGE_MIN, RANGE_MAX)
      angle += 0.4
      const x = radius * Math.cos(angle)
      const z = radius * Math.sin(angle)

      this.#positions.push(x, 0, z)

      _mat4.identity()
      _mat4.setPosition(x, 0, z)
      _mat4.scale(_scale)
      mesh.setMatrixAt(i, _mat4)
    }
    mesh.instanceMatrix.needsUpdate = true

    mesh.position.y = randFloat(60, 100)
    mesh.initPos = mesh.position.clone()
    mesh.frustumCulled = false

    return mesh
  }
}
