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
  cos,
  mod,
  smoothstep,
  distance,
  If,
  Discard,
} from 'three/tsl'
import { MathUtils } from 'three'
const { degToRad, randFloat } = MathUtils
import ControllerManager from '../../managers/ControllerManager'
import { gsap } from 'gsap'
import EnvManager from '../../managers/EnvManager'
import LoaderManager from '../../managers/LoaderManager'
import { BOAT_MODE } from '.'

const MAX_OPACITY = 0.8
const NB_PARTICLES = 2300
const SPRITE_SCALE = 0.4
const PI = Math.PI
const INIT_Z = 6

export default class ParticlesFront {
  #mesh
  #material
  #settings = {
    uDuration: 22.079601287841797,
    uForce: 0.0223926472,
    uCoefDelay: 8.086924171447755,
    uSpeed: 4.257499465942383,
    uCoefY: 2.274037380218506,
    uActive: 0,
  }
  jumpP = 0

  #debug
  #initZ = INIT_Z
  maxSpeed = 1

  constructor(parent, debug) {
    this.#debug = debug

    const positionArray = []
    const delayArray = []
    const sizeArray = []
    const angleArray = []

    for (let i = 0; i < NB_PARTICLES; i++) {
      delayArray.push(Math.random() + 1)
      sizeArray.push(randFloat(0.6, 1.5))
      positionArray.push(0, 0, 1.6)
      angleArray.push(degToRad(randFloat(5, 175)))
    }

    const planeGeo = new PlaneGeometry(1, 1)
    planeGeo.setAttribute(
      'instancePosition',
      new InstancedBufferAttribute(new Float32Array(positionArray), 3)
    )
    planeGeo.setAttribute(
      'delay',
      new InstancedBufferAttribute(new Float32Array(delayArray), 1)
    )
    planeGeo.setAttribute(
      'aSize',
      new InstancedBufferAttribute(new Float32Array(sizeArray), 1)
    )
    planeGeo.setAttribute(
      'angle',
      new InstancedBufferAttribute(new Float32Array(angleArray), 1)
    )

    // NOTE: In this project, `texture(...)` expects a real THREE.Texture (see Lightnings).
    // Use LoaderManager.getTexture() so we always have a valid fallback texture.
    const mapTexture = LoaderManager.getTexture('bubble')
    const uTime = uniform(100)
    const uDuration = uniform(this.#settings.uDuration)
    const uForce = uniform(this.#settings.uForce)
    const uCoefDelay = uniform(this.#settings.uCoefDelay)
    const uCoefY = uniform(this.#settings.uCoefY)
    const uActive = uniform(1)
    const uOpacity = uniform(MAX_OPACITY)

    const aPosition = attribute('instancePosition', 'vec3')
    const aDelay = attribute('delay', 'float')
    const aSize = attribute('aSize', 'float')
    const aAngle = attribute('angle', 'float')

    const material = new SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
    })

    material.positionNode = Fn(() => {
      const offset = aDelay.mul(uCoefDelay)
      const forceDir = uForce.mul(mod(uTime, uDuration.mul(offset)))
      const phase = forceDir.div(offset).mul(float(PI).div(uDuration).div(uForce))
      const animatedPos = vec3(
        aPosition.x.add(cos(aAngle).mul(forceDir)),
        aPosition.y.add(uCoefY.mul(sin(phase)).mul(aDelay)),
        aPosition.z.add(sin(aAngle).mul(forceDir))
      )
      return animatedPos.mul(uActive)
    })()

    material.scaleNode = aSize.mul(uActive).mul(SPRITE_SCALE)

    material.colorNode = Fn(() => {
      const uvCoord = uv()
      const dist = float(0.5).sub(distance(uvCoord, vec2(0.5)))
      const circleMask = smoothstep(float(0.0), float(0.1), dist)
      const texColor = texture(mapTexture, uvCoord)
      const finalAlpha = circleMask.mul(texColor.a).mul(uOpacity)

      If(finalAlpha.lessThan(0.05), () => {
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

    this.#mesh = new InstancedMesh(planeGeo, material, NB_PARTICLES)
    this.#material = this.#mesh.material
    this.#mesh.position.z = this.#initZ
    this.#mesh.position.y = 0
    parent.add(this.#mesh)

    this._createDebugFolder()
  }

  get mesh() {
    return this.#mesh
  }

  get material() {
    return this.#material
  }

  update({ delta, velocity }) {
    if (ControllerManager.boat.up > 0) {
      this.#mesh.position.z -= ControllerManager.boat.velocity * ControllerManager.boat.speedTextureOffset
      if (!this.startJump) {
        this.startJump = true
        this.finishJump = false
        this.tlJump?.kill()
        this.tlJumpFinish?.kill()
        this.tlJump = gsap.to(this, {
          jumpP: 1,
          duration: 0.6,
        })
      }
    } else if (this.startJump) {
      this.startJump = false
      if (!this.finishJump) {
        this.#mesh.position.z = this.#initZ
        this.finishJump = true
        this.tlJumpFinish?.kill()
        this.tlJump?.kill()
        this.tlJumpFinish = gsap.fromTo(
          this,
          { jumpP: 1 },
          { jumpP: 0, duration: 0.5 }
        )
      }
    }

    const progress = velocity * (1 - this.jumpP) * this.maxSpeed

    this.#material.uTime.value += (delta / 16) * this.#settings.uSpeed
    this.#material.uActive.value = progress
    this.#material.uOpacity.value = MAX_OPACITY * Math.min(1, EnvManager.settingsOcean.foam)
    this.#material.alphaTest = this.#material.uOpacity.value - 0.05
  }

  transitioningSpeed(mode) {
    if (mode === BOAT_MODE.HOOK) {
      gsap.to(this, { maxSpeed: 0.2, duration: 1.5 })
    } else {
      gsap.to(this, { maxSpeed: 1, duration: 1.5 })
    }
  }

  _createDebugFolder() {
    if (!this.#debug) return

    const settingsChangedHandler = () => {
      this.#material.uDuration.value = this.#settings.uDuration
      this.#material.uForce.value = this.#settings.uForce
      this.#material.uCoefDelay.value = this.#settings.uCoefDelay
      this.#material.uCoefY.value = this.#settings.uCoefY
    }

    const debug = this.#debug.addFolder({ title: 'Splash Front', expanded: false })

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
