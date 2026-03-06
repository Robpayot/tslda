import {
  InstancedBufferAttribute,
  PlaneGeometry,
  InstancedMesh,
} from 'three'
import { SpriteNodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  texture,
  uv,
  attribute,
  sin,
  mod,
  smoothstep,
  distance,
  If,
  Discard,
} from 'three/tsl'
import { MathUtils } from 'three'
const { randFloat } = MathUtils
import ControllerManager from '../../managers/ControllerManager'
import EnvManager from '../../managers/EnvManager'
import LoaderManager from '../../managers/LoaderManager'

const MAX_OPACITY = 0.4
const SPRITE_SCALE = 0.15
const PI = Math.PI

export default class ParticlesSide {
  #mesh
  #material
  #settings = {
    uDuration: 13.812566757202148,
    uForce: 0.0153018208,
    uCoefDelay: 1,
    uSpeed: 0.4844324875,
    uCoefY: 0.28125667572021484,
    uActive: 0,
  }

  #debug
  constructor(parent, debug) {
    this.#debug = debug

    const particlesEdgeMesh = parent.getObjectByName('particles-boat')
    const geoParticles = particlesEdgeMesh.geometry.clone()

    const count = geoParticles.attributes.position.count
    const posAttr = geoParticles.attributes.position
    const positionArray = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positionArray[i * 3] = posAttr.getX(i)
      positionArray[i * 3 + 1] = posAttr.getY(i)
      positionArray[i * 3 + 2] = posAttr.getZ(i)
    }

    const delayArray = new Float32Array(count)
    const sizeArray = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      delayArray[i] = Math.random() + 1
      sizeArray[i] = randFloat(0.2, 0.8)
    }

    const planeGeo = new PlaneGeometry(1, 1)
    planeGeo.setAttribute(
      'instancePosition',
      new InstancedBufferAttribute(positionArray, 3)
    )
    planeGeo.setAttribute(
      'delay',
      new InstancedBufferAttribute(delayArray, 1)
    )
    planeGeo.setAttribute(
      'aSize',
      new InstancedBufferAttribute(sizeArray, 1)
    )

    // NOTE: In this project, `texture(...)` expects a real THREE.Texture (see Lightnings).
    // Use LoaderManager.getTexture() so we always have a valid fallback texture.
    const mapTexture = LoaderManager.getTexture('bubble')
    const uTime = uniform(100)
    const uDuration = uniform(this.#settings.uDuration)
    const uForce = uniform(this.#settings.uForce)
    const uCoefDelay = uniform(this.#settings.uCoefDelay)
    const uCoefY = uniform(this.#settings.uCoefY)
    const uActive = uniform(0)
    const uOpacity = uniform(MAX_OPACITY)

    const aPosition = attribute('instancePosition', 'vec3')
    const aDelay = attribute('delay', 'float')
    const aSize = attribute('aSize', 'float')

    const material = new SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      alphaTest: 0.3,
    })

    material.positionNode = Fn(() => {
      const offset = aDelay.mul(uCoefDelay)
      const forceDir = uForce.mul(mod(uTime, uDuration.mul(offset)))
      const phase = forceDir.div(offset).mul(float(PI).div(uDuration).div(uForce))
      const animatedPos = vec3(
        aPosition.x.add(aPosition.x.mul(forceDir)),
        aPosition.y.add(uCoefY.mul(sin(phase))),
        aPosition.z.add(aPosition.z.mul(forceDir))
      )
      return animatedPos
    })()

    material.scaleNode = aSize.mul(uActive).mul(SPRITE_SCALE)

    material.colorNode = Fn(() => {
      const uvCoord = uv()
      const dist = float(0.5).sub(distance(uvCoord, vec2(0.5)))
      const circleMask = smoothstep(float(0.0), float(0.1), dist)
      const texColor = texture(mapTexture, uvCoord)
      const finalAlpha = circleMask.mul(texColor.a).mul(uOpacity)

      If(finalAlpha.lessThan(0.3), () => {
        Discard()
      })

      return vec4(texColor.rgb, finalAlpha)
    })()

    material.uTime = uTime
    material.uActive = uActive
    material.uOpacity = uOpacity
    material.uDuration = uDuration
    material.uForce = uForce
    material.uCoefDelay = uCoefDelay
    material.uCoefY = uCoefY

    this.#mesh = new InstancedMesh(planeGeo, material, count)
    this.#material = this.#mesh.material
    parent.remove(particlesEdgeMesh)
    parent.add(this.#mesh)

    this._createDebugFolder()
  }

  get mesh() {
    return this.#mesh
  }

  get material() {
    return this.#material
  }

  update({ delta, turnForce, velocity }) {
    const mat = this.material
    mat.uTime.value += (delta / 16) * this.#settings.uSpeed
    mat.uOpacity.value = Math.min(
      2 * turnForce + velocity,
      MAX_OPACITY * Math.min(1, EnvManager.settingsOcean.foam)
    )
    mat.uActive.value = Math.min(3 * turnForce + velocity, 1)
    mat.alphaTest = mat.uOpacity.value - 0.05

    if (ControllerManager.boat.up > 0) {
      mat.uOpacity.value = 0
    }
  }

  _createDebugFolder() {
    if (!this.#debug) return

    const settingsChangedHandler = () => {
      this.material.uDuration.value = this.#settings.uDuration
      this.material.uForce.value = this.#settings.uForce
      this.material.uCoefDelay.value = this.#settings.uCoefDelay
      this.material.uCoefY.value = this.#settings.uCoefY
      this.material.uOpacity.value = 0.5 * this.#settings.uActive
    }

    const debug = this.#debug.addFolder({ title: 'Splash Side', expanded: false })

    debug.addInput(this.#settings, 'uDuration').on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'uForce').on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'uCoefDelay').on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'uCoefY').on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'uActive', { min: 0, max: 1 }).on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'uSpeed')

    const btn = debug.addButton({
      title: 'Copy settings',
      label: 'copy',
    })

    btn.on('click', () => {
      navigator.clipboard.writeText(JSON.stringify(this.#settings))
      console.log('copied to clipboard', this.#settings)
    })

    return debug
  }
}
