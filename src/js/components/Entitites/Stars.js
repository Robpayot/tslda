import { Float32BufferAttribute, Points, BufferGeometry } from 'three'
import { PointsNodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
  vec4,
  attribute,
  varying,
  sin,
  positionView,
  If,
  Discard,
} from 'three/tsl'
import { MathUtils } from 'three'
const { degToRad, randFloat } = MathUtils
import EnvManager from '../../managers/EnvManager'

const NB_POINTS = 1000

export default class Stars {
  #mesh
  #material
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
    const uSize = uniform(150)
    const uTime = uniform(0)
    const uGlobalOpacity = uniform(EnvManager.settings.alphaStars)

    const offsetAttr = attribute('offset', 'float')

    // Original: vProgressAlpha = sin(uTime * 0.01 + offset)
    const vProgressAlpha = varying(sin(uTime.mul(0.01).add(offsetAttr)), 'vProgressAlpha')

    // Original: gl_PointSize = uSize * (100 / -mvPosition.z)
    const sizeFn = Fn(() => uSize.mul(float(100).div(positionView.z.negate())))

    // Fragment: white dots with twinkling alpha
    // (circle mask removed — pointUV/uv() not reliable in WebGPU PointsNodeMaterial,
    //  and at 3-5px the circle vs square difference is invisible)
    const colorFn = Fn(() => {
      const alpha = float(1).sub(vProgressAlpha)
      const finalAlpha = alpha.mul(uGlobalOpacity)

      If(finalAlpha.lessThan(0.5), () => {
        Discard()
      })

      return vec4(1.0, 1.0, 1.0, finalAlpha)
    })

    const material = new PointsNodeMaterial()
    material.sizeNode = sizeFn()
    material.colorNode = colorFn()
    material.depthTest = false
    material.sizeAttenuation = false

    material.uTime = uTime
    material.uGlobalOpacity = uGlobalOpacity

    return material
  }

  _createMesh() {
    const vertices = []
    const offsets = []
    const speeds = []

    const radius = 1600

    for (let i = 0; i < NB_POINTS; i++) {
      const phi = Math.random() * Math.PI * 2
      const theta = (Math.random() * Math.PI) / 2

      const x = radius * Math.sin(theta) * Math.cos(phi)
      const y = radius * Math.sin(theta) * Math.sin(phi)
      const z = radius * Math.cos(theta)

      const rotationAngle = degToRad(-90)
      const rotatedY = y * Math.cos(rotationAngle) - z * Math.sin(rotationAngle)
      const rotatedZ = y * Math.sin(rotationAngle) + z * Math.cos(rotationAngle)

      vertices.push(x, rotatedY, rotatedZ)

      offsets.push(randFloat(0, 100))
      speeds.push(randFloat(0.5, 1))
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('offset', new Float32BufferAttribute(offsets, 1))
    geometry.setAttribute('speed', new Float32BufferAttribute(speeds, 1))

    const mesh = new Points(geometry, this.#material)
    mesh.position.y = 1
    mesh.initPos = mesh.position.clone()
    mesh.renderOrder = -1

    return mesh
  }
}
