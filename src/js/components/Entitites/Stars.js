import {
  InstancedMesh,
  PlaneGeometry,
  Matrix4,
  Vector3,
  Quaternion,
  DoubleSide,
  InstancedBufferAttribute,
} from 'three'
import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
  vec2,
  vec4,
  uv,
  attribute,
  varying,
  sin,
  smoothstep,
  distance,
  If,
  Discard,
} from 'three/tsl'
import { MathUtils } from 'three'
const { degToRad, randFloat } = MathUtils
import EnvManager from '../../managers/EnvManager'

const NB_POINTS = 1000
// Original gl_PointSize = 50 * (100 / -mvPosition.z), K = 5000
// Conversion C = 1/3000 → base ≈ 2. Use 4 for slightly bigger.
const SPRITE_SCALE = 4

const _scale = new Vector3(SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE)
const _mat4 = new Matrix4()
const _pos = new Vector3()
const _quat = new Quaternion()
const _camPos = new Vector3()
const _up = new Vector3(0, 1, 0)

export default class Stars {
  #mesh
  #material
  #positions = []
  constructor() {
    this.#material = this._createMaterial()
    this.#mesh = this._createMesh()
  }

  get mesh() {
    return this.#mesh
  }

  get material() {
    return this.#material
  }

  _createMaterial() {
    const uTime = uniform(0)
    const uGlobalOpacity = uniform(EnvManager.settings.alphaStars)

    const offsetAttr = attribute('offset', 'float')

    // Original: vProgressAlpha = sin(uTime * 0.01 + offset)
    const vProgressAlpha = varying(sin(uTime.mul(0.01).add(offsetAttr)), 'vProgressAlpha')

    const colorFn = Fn(() => {
      // Individual opacity oscillation: subtle pulse 0.7–1.0 per star (offset gives phase)
      const alpha = float(0.85).sub(vProgressAlpha.mul(0.15))

      // Original: circle(uv, 0.1) = smoothstep(0, 0.1, 0.5 - distance(uv, vec2(0.5)))
      const uvCoord = uv()
      const dist = float(0.5).sub(distance(uvCoord, vec2(0.5)))
      const circleMask = smoothstep(float(0.0), float(0.1), dist)

      // Original order: gl_FragColor.a = circle; gl_FragColor.a *= alpha; gl_FragColor.a *= globalOpacity
      const finalAlpha = circleMask.mul(alpha).mul(uGlobalOpacity)

      If(finalAlpha.lessThan(0.5), () => {
        Discard()
      })

      return vec4(1.0, 1.0, 1.0, finalAlpha)
    })

    const material = new NodeMaterial()
    material.colorNode = colorFn()
    material.side = DoubleSide
    material.transparent = true
    material.depthWrite = false

    material.uTime = uTime
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
    const radius = 1600
    const offsets = []

    for (let i = 0; i < NB_POINTS; i++) {
      const phi = Math.random() * Math.PI * 2
      const theta = (Math.random() * Math.PI) / 2

      const x = radius * Math.sin(theta) * Math.cos(phi)
      const y = radius * Math.sin(theta) * Math.sin(phi)
      const z = radius * Math.cos(theta)

      const rotationAngle = degToRad(-90)
      const rotatedY = y * Math.cos(rotationAngle) - z * Math.sin(rotationAngle)
      const rotatedZ = y * Math.sin(rotationAngle) + z * Math.cos(rotationAngle)

      this.#positions.push(x, rotatedY, rotatedZ)
      offsets.push(randFloat(0, 100))
    }

    const planeGeo = new PlaneGeometry(1, 1)
    planeGeo.setAttribute('offset', new InstancedBufferAttribute(new Float32Array(offsets), 1))
    const mesh = new InstancedMesh(planeGeo, this.#material, NB_POINTS)

    for (let i = 0; i < NB_POINTS; i++) {
      _mat4.identity()
      _mat4.setPosition(this.#positions[i * 3], this.#positions[i * 3 + 1], this.#positions[i * 3 + 2])
      _mat4.scale(_scale)
      mesh.setMatrixAt(i, _mat4)
    }
    mesh.instanceMatrix.needsUpdate = true

    mesh.position.y = 1
    mesh.initPos = mesh.position.clone()
    mesh.renderOrder = -1
    mesh.frustumCulled = false

    return mesh
  }
}
