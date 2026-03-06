import {
  InstancedMesh,
  PlaneGeometry,
  InstancedBufferAttribute,
} from 'three'
import { SpriteNodeMaterial } from 'three/webgpu'
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
const SPRITE_SCALE = 4

export default class Stars {
  #mesh
  #material
  constructor() {
    this.#mesh = this._createMesh()
    this.#material = this.#mesh.material
  }

  get mesh() {
    return this.#mesh
  }

  get material() {
    return this.#material
  }

  /** No-op: SpriteNodeMaterial handles billboarding. Kept for ExploreManager API. */
  billboardToCamera() {}

  _createMesh() {
    const radius = 1600
    const positionArray = []
    const offsetArray = []

    for (let i = 0; i < NB_POINTS; i++) {
      const phi = Math.random() * Math.PI * 2
      const theta = (Math.random() * Math.PI) / 2

      const x = radius * Math.sin(theta) * Math.cos(phi)
      const y = radius * Math.sin(theta) * Math.sin(phi)
      const z = radius * Math.cos(theta)

      const rotationAngle = degToRad(-90)
      const rotatedY = y * Math.cos(rotationAngle) - z * Math.sin(rotationAngle)
      const rotatedZ = y * Math.sin(rotationAngle) + z * Math.cos(rotationAngle)

      positionArray.push(x, rotatedY, rotatedZ)
      offsetArray.push(randFloat(0, 100))
    }

    const count = NB_POINTS
    const planeGeo = new PlaneGeometry(1, 1)
    planeGeo.setAttribute(
      'instancePosition',
      new InstancedBufferAttribute(new Float32Array(positionArray), 3)
    )
    planeGeo.setAttribute(
      'offset',
      new InstancedBufferAttribute(new Float32Array(offsetArray), 1)
    )

    const aPosition = attribute('instancePosition', 'vec3')
    const aOffset = attribute('offset', 'float')

    const uTime = uniform(0)
    const uGlobalOpacity = uniform(EnvManager.settings.alphaStars)

    const material = new SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
    })

    // Scale: constant size per star
    material.scaleNode = float(SPRITE_SCALE)

    // Position: from instanced attribute
    material.positionNode = aPosition

    // Fragment: keep exact current look (circle mask, alpha pulse, global opacity)
    const vProgressAlpha = varying(
      sin(uTime.mul(0.01).add(aOffset)),
      'vProgressAlpha'
    )
    const colorFn = Fn(() => {
      const alpha = float(0.85).sub(vProgressAlpha.mul(0.15))
      const uvCoord = uv()
      const dist = float(0.5).sub(distance(uvCoord, vec2(0.5)))
      const circleMask = smoothstep(float(0.0), float(0.1), dist)
      const finalAlpha = circleMask.mul(alpha).mul(uGlobalOpacity)

      If(finalAlpha.lessThan(0.5), () => {
        Discard()
      })

      return vec4(1.0, 1.0, 1.0, finalAlpha)
    })
    material.colorNode = colorFn()

    material.uTime = uTime
    material.uGlobalOpacity = uGlobalOpacity

    const mesh = new InstancedMesh(planeGeo, material, count)

    mesh.position.y = 1
    mesh.initPos = mesh.position.clone()
    mesh.renderOrder = -1
    mesh.frustumCulled = false

    return mesh
  }
}
