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
  smoothstep,
  distance,
  If,
  Discard,
} from 'three/tsl'
import { MathUtils } from 'three'
const { degToRad, randFloat, lerp } = MathUtils
import ControllerManager from '../../managers/ControllerManager'
import EnvManager from '../../managers/EnvManager'
import LoaderManager from '../../managers/LoaderManager'
import SoundManager, { SOUNDS_CONST } from '../../managers/SoundManager'
import { MODE } from '../../utils/constants'
import ModeManager from '../../managers/ModeManager'

const MAX_OPACITY = 0.6
const NB_PARTICLES = 500
const GRAVITY = 0.5
const MAX_GRAVITY_LOW = -4
const SPRITE_SCALE = 0.4
const INIT_Z = 7
const INIT_Y = -1

export default class ParticlesJump {
  #mesh
  #material
  #settings = {
    uDuration: 22.079601287841797,
    uForce: 0.01602332919157715,
    uCoefDelay: 8.086924171447755,
    uSpeed: 4.257499465942383,
    uCoefY: 2.737105579376221,
    uActive: 0,
  }
  jumpP = 0

  #debug
  #initZ = INIT_Z
  #initY = INIT_Y
  #targetUp = 0
  #up = 0

  constructor(parent, debug) {
    this.#debug = debug

    const range = 5
    const positionArray = []
    const delayArray = []
    const sizeArray = []
    const angleArray = []

    for (let i = 0; i < NB_PARTICLES; i++) {
      delayArray.push(Math.random() + 1)
      sizeArray.push(randFloat(0.6, 1.5))

      const angle = randFloat(0, 360)
      const radius = randFloat(0, range)
      positionArray.push(
        Math.cos(degToRad(angle)) * radius,
        this.#initY,
        Math.sin(degToRad(angle)) * radius
      )
      angleArray.push(degToRad(randFloat(0, 360)))
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
    const uDuration = uniform(this.#settings.uDuration)
    const uForce = uniform(this.#settings.uForce)
    const uCoefDelay = uniform(this.#settings.uCoefDelay)
    const uCoefY = uniform(this.#settings.uCoefY)
    const uActive = uniform(this.#settings.uActive)
    const uProgress = uniform(0)
    const uOpacity = uniform(MAX_OPACITY)

    const aPosition = attribute('instancePosition', 'vec3')
    const aDelay = attribute('delay', 'float')
    const aSize = attribute('aSize', 'float')

    const material = new SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      alphaTest: 0.5,
    })

    material.positionNode = Fn(() => {
      const animatedPos = vec3(
        aPosition.x,
        aPosition.y.add(aDelay.mul(uProgress)),
        aPosition.z
      )
      return animatedPos
    })()

    material.scaleNode = aSize.mul(SPRITE_SCALE)

    material.colorNode = Fn(() => {
      const uvCoord = uv()
      const dist = float(0.5).sub(distance(uvCoord, vec2(0.5)))
      const circleMask = smoothstep(float(0.0), float(0.1), dist)
      const texColor = texture(mapTexture, uvCoord)
      const finalAlpha = circleMask.mul(texColor.a).mul(uOpacity)

      // uOpacity max is 0.6, so discard must be much lower than 0.5
      If(finalAlpha.lessThan(0.02), () => {
        Discard()
      })

      return vec4(texColor.rgb, finalAlpha)
    })()

    // Expose uniforms for updates/debug (even if not all are used here)
    material.uDuration = uDuration
    material.uForce = uForce
    material.uCoefDelay = uCoefDelay
    material.uCoefY = uCoefY
    material.uActive = uActive
    material.uProgress = uProgress
    material.uOpacity = uOpacity

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

  update() {
    if (ControllerManager.boat.up > 0) {
      this.progress = 0
      if (!this.startJump) {
        this.startJump = true
        this.finishJump = false
      }
    } else if (this.startJump) {
      this.startJump = false
      this.go = true

      if (!this.finishJump) {
        this.#mesh.position.z = this.#initZ
        this.finishJump = true
        if (ModeManager.state === MODE.EXPLORE) {
          SoundManager.play(SOUNDS_CONST.DROP_WATER)
        }

        if (this.#up >= MAX_GRAVITY_LOW) {
          this.#up = -1
          this.#targetUp = 14.5
        }
      }
    }

    if (this.go) {
      this.#mesh.position.z -= ControllerManager.boat.velocity * ControllerManager.boat.speedTextureOffset
    }

    this.#up = Math.max(MAX_GRAVITY_LOW, lerp(this.#up, this.#targetUp, 0.05))
    this.#targetUp -= GRAVITY

    if (this.#up === MAX_GRAVITY_LOW) {
      this.#mesh.visible = false
    } else {
      this.#mesh.visible = true
    }

    this.#material.uProgress.value = this.#up
    this.#material.uOpacity.value = MAX_OPACITY * Math.min(1, EnvManager.settingsOcean.foam)
    this.#material.alphaTest = this.#material.uOpacity.value - 0.05
  }

  _createDebugFolder() {
    if (!this.#debug) return

    const settingsChangedHandler = () => {
      this.#material.uDuration.value = this.#settings.uDuration
      this.#material.uForce.value = this.#settings.uForce
      this.#material.uCoefDelay.value = this.#settings.uCoefDelay
      this.#material.uCoefY.value = this.#settings.uCoefY
    }

    const debug = this.#debug.addFolder({ title: 'Splash Jump', expanded: false })

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
