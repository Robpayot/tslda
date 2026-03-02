import { Color, Mesh, MeshBasicMaterial, NodeMaterial, Object3D, PlaneGeometry, RepeatWrapping, ShaderMaterial } from 'three'
import { MathUtils } from 'three'
const { degToRad } = MathUtils
import {
  Fn, uniform, varying,
  float, vec2, vec3, vec4,
  uv, positionLocal, modelViewMatrix,
  distance, step, exp, mix,
} from 'three/tsl'
import LoaderManager from '@/js/managers/LoaderManager'
import ControllerManager from '@/js/managers/ControllerManager'

import vertexShader from '@glsl/ocean/main.vert'
import fragmentShader from '@glsl/ocean/main.frag'
import { gsap } from 'gsap'
import EnvManager from '../../managers/EnvManager'
import GridManager from '../../managers/GridManager'
import OceanHeightMap from './OceanHeightMap'
import Settings from '../../utils/Settings'
import ModeManager from '../../managers/ModeManager'
import { MODE } from '../../utils/constants'
import GameManager from '../../managers/GameManager'

export const SCALE_OCEAN = 3000
export const SEGMENTS_OCEAN = 200
export const REPEAT_OCEAN = 70
export const Y_STRENGTH_OCEAN = 23.34
const GEOMETRY = new PlaneGeometry(1, 1, SEGMENTS_OCEAN, SEGMENTS_OCEAN) // 200, 200

//

export default class Ocean extends Object3D {
  #material
  #debug
  #settings = {
    color: EnvManager.settingsOcean.color,
    trailRotation: 1,
    trailProgress: 0,
    trailTurn: 0,
    fogColor: '#6abbe9',
    fogDensity: 0.00090,
  }
  #scale = SCALE_OCEAN
  #mesh
  canTrailOpacity = true
  canTrailProgress = true
  constructor({ debug, scene }) {
    super()

    this.#debug = debug

    // this._createMaterial()
    // this.#mesh = this._createMesh()

    this._createDebugFolder()

    // OceanHeightMap.init(scene)

    // extend
    this.uExtColor = uniform(new Color(this.#settings.color))
    this.uExtFogColor = uniform(new Color(this.#settings.fogColor))
    this.uExtFogDensity = uniform(this.#settings.fogDensity)

    const extMat = this._createExtendMaterial()
    const geo = new PlaneGeometry(SCALE_OCEAN * 3.5, SCALE_OCEAN * 3.5, 1, 1)

    const meshT = new Mesh(geo, extMat)
    meshT.position.y = 0
    meshT.rotateX(degToRad(-90))
    scene.add(meshT)

    this.meshExtend = meshT
  }

  get mesh() {
    return this.#mesh
  }

  _createMaterial() {
    const texture = LoaderManager.get('ocean-tile').texture

    texture.wrapS = texture.wrapT = RepeatWrapping

    const textureTrail = LoaderManager.get('trail').texture

    textureTrail.wrapS = textureTrail.wrapT = RepeatWrapping

    this.#material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        map: { value: texture },
        trailMap: { value: textureTrail },
        color: { value: new Color(this.#settings.color) },
        repeat: { value: EnvManager.settingsOcean.repeat },
        timeTex: { value: 0 },
        dirTex: { value: ControllerManager.joystick },
        timeWave: { value: 0 },
        yScale: { value: EnvManager.settingsOcean.yScale },
        yStrength: { value: EnvManager.settingsOcean.yStrength },
        alphaTex: { value: EnvManager.settingsOcean.alphaTex },
        alphaTex2: { value: EnvManager.settingsOcean.alphaTex2 },
        trailRotation: { value: this.#settings.trailRotation },
        trailProgress: { value: this.#settings.trailProgress },
        trailTurn: { value: this.#settings.trailTurn },
        trailOpacity: { value: 0 },
        trailJumpOffset: { value: 0 },
        trailJumpOpacity: { value: 1 },
        // shadows
        uDepthMap: {
          value: EnvManager.sunShadowMap.map.texture,
        },
        uShadowCameraP: {
          value: EnvManager.sunShadowMap.camera.projectionMatrix,
        },
        uShadowCameraV: {
          value: EnvManager.sunShadowMap.camera.matrixWorldInverse,
        },
        // heightMap: { value: OceanHeightMap.heightMap.texture },
        // fog
        fogColor: {
          value: new Color(this.#settings.fogColor),
        },
        fogDensity: {
          value: this.#settings.fogDensity,
        },
      },
      defines: {
        USE_SHADOWS: Settings.castShadows,
      },
      // visible: false
      // transparent: true,
      // wireframe: true
    })
  }

  get mainMaterial() {
    return this.#material
  }

  _createMesh() {
    const mesh = new Mesh(GEOMETRY, this.#material)

    mesh.scale.set(this.#scale, this.#scale, 1)

    mesh.rotateX(degToRad(-90))
    mesh.renderOrder = 1

    this.add(mesh)
    // mesh.visible = false

    return mesh
  }

  _createExtendMaterial() {
    const { uExtColor, uExtFogColor, uExtFogDensity } = this

    const vExtFogDepth = varying(float(0), 'vExtFogD')

    const positionFn = Fn(() => {
      const pos = positionLocal.toVar()
      const mvPos = modelViewMatrix.mul(vec4(pos, 1.0))
      vExtFogDepth.assign(mvPos.z.negate())
      return pos
    })

    const fragmentFn = Fn(() => {
      const vUv = uv()
      const circle = distance(vUv, vec2(0.5))
      const alpha = step(0.12, circle)

      const col = vec3(uExtColor).toVar()
      const fogFactor = float(1).sub(exp(uExtFogDensity.negate().mul(uExtFogDensity).mul(vExtFogDepth).mul(vExtFogDepth)))
      col.assign(mix(col, vec3(uExtFogColor), fogFactor))

      return vec4(col, alpha)
    })

    const mat = new NodeMaterial()
    mat.positionNode = positionFn()
    mat.fragmentNode = fragmentFn()
    mat.transparent = true
    return mat
  }

  /**
   * Update
   */
  update({ time, delta }) {
    return
    const { yScale, yStrength, color, speedWave, speedTex, alphaTex, alphaTex2, fogColor, fogDensity } = EnvManager.settingsOcean

    // OceanHeightMap.material.uniforms.timeWave.value = this.#material.uniforms.timeWave.value
    // OceanHeightMap.material.uniforms.dirTex.value = this.#material.uniforms.dirTex.value = GridManager.offsetUV
    // OceanHeightMap.material.uniforms.yScale.value = this.#material.uniforms.yScale.value = yScale
    // OceanHeightMap.material.uniforms.yStrength.value = this.#material.uniforms.yStrength.value = yStrength
    // Env
    this.#material.uniforms.color.value = new Color(color)
    this.meshExtend.material.uniforms.color.value = new Color(color)
    this.#material.uniforms.alphaTex.value = alphaTex
    this.#material.uniforms.alphaTex2.value = alphaTex2
    this.#material.uniforms.fogColor.value = new Color(fogColor)
    this.#material.uniforms.fogDensity.value = fogDensity
    this.meshExtend.material.uniforms.fogColor.value = new Color(fogColor)
    this.meshExtend.material.uniforms.fogDensity.value = fogDensity

    // texture
    this.#material.uniforms.timeWave.value += (delta / 16) * speedWave
    this.#material.uniforms.timeTex.value += (delta / 16) * speedTex * (1 + ControllerManager.boat.velocityP)
    // to do also update other uniforms based on EnvManager
    // TODO: compense by camera direction

    // Texture trail
    this.#material.uniforms.trailRotation.value = ControllerManager.boat.angleDir
    this.#material.uniforms.trailTurn.value = ControllerManager.boat.turnForce

    if (this.canTrailOpacity) {
      this.#material.uniforms.trailOpacity.value = ControllerManager.boat.velocityP
    }

    if (this.canTrailProgress) {
      if (!(ModeManager.state === MODE.GAME_STARTED && GameManager.paused)) {
        this.#material.uniforms.trailProgress.value += ControllerManager.boat.velocity * 0.016
      }
    }

    // Jump
    if (ControllerManager.boat.up > 0) {
      this.#material.uniforms.trailJumpOffset.value -= ControllerManager.boat.velocity * 1.2
      if (!this.startJump) {
        this.startJump = true
        this.finishJump = false
        this.canTrailOpacity = true
        this.canTrailProgress = false
        this.tlJump?.kill()
        this.tlJumpFinish?.kill()
        this.tlJump = gsap.to(this.#material.uniforms.trailJumpOpacity, {
          value: 0,
          duration: 0.15,
        })
      }
    } else if (this.startJump) {
      this.startJump = false
      if (!this.finishJump) {
        this.canTrailProgress = true
        this.#material.uniforms.trailJumpOffset.value = 0
        this.#material.uniforms.trailJumpOpacity.value = 1
        this.finishJump = true
        this.canTrailOpacity = false
        this.tlJumpFinish?.kill()
        this.tlJump?.kill()
        if (ControllerManager.boat.velocityP > 0.5) {
          this.tlJumpFinish = gsap.fromTo(
            this.#material.uniforms.trailOpacity,
            {
              value: 0,
            },
            {
              value: 1,
              duration: 2,
              onComplete: () => {
                this.canTrailOpacity = true
              },
            }
          )
        }
      }
    }
  }

  resize({ width, height }) {}

  /**
   * Debug
   */
  _createDebugFolder() {
    if (!this.#debug) return

    const settingsChangedHandler = () => {
      if (this.#material?.uniforms) {
        this.#material.uniforms.fogDensity.value = this.#settings.fogDensity
        this.#material.uniforms.fogColor.value = new Color(this.#settings.fogColor)
      }
      this.uExtFogDensity.value = this.#settings.fogDensity
      this.uExtFogColor.value = new Color(this.#settings.fogColor)
    }

    const debug = this.#debug.addFolder({ title: 'Ocean', expanded: true })

    debug.addInput(this.#settings, 'fogDensity', { step: 0.00001 }).on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'fogColor').on('change', settingsChangedHandler)

    const btn = debug.addButton({
      title: 'Copy settings',
      label: 'copy', // optional
    })

    btn.on('click', () => {
      navigator.clipboard.writeText(JSON.stringify(this.#settings))
      console.log('copied to clipboard', this.#settings)
    })

    return debug
  }
}
