import { Color, Mesh, NodeMaterial, Object3D, PlaneGeometry, RepeatWrapping } from 'three'
import { MathUtils } from 'three'
const { degToRad } = MathUtils
import {
  Fn, uniform, varying, texture,
  float, vec2, vec3, vec4,
  positionLocal, normalLocal, uv,
  modelViewMatrix, modelWorldMatrix,
  sin, cos, abs, pow, step, smoothstep, mix, clamp, fract, distance,
  If,
} from 'three/tsl'
import LoaderManager from '@/js/managers/LoaderManager'
import ControllerManager from '@/js/managers/ControllerManager'
import { gsap } from 'gsap'
import EnvManager from '../../managers/EnvManager'
import GridManager from '../../managers/GridManager'
import OceanHeightMap from './OceanHeightMap'
import Settings from '../../utils/Settings'
import ModeManager from '../../managers/ModeManager'
import { MODE } from '../../utils/constants'
import GameManager from '../../managers/GameManager'
import { calculateSurface, frustumTest, unpackRGBAToDepth, applyFog, rotateUV } from '../../tsl/nodes'
import { uShadowDepthMap, uShadowCameraP, uShadowCameraV } from '../../tsl/sharedUniforms'

export const SCALE_OCEAN = 3000
export const SEGMENTS_OCEAN = 200
export const REPEAT_OCEAN = 70
export const Y_STRENGTH_OCEAN = 23.34
const GEOMETRY = new PlaneGeometry(1, 1, SEGMENTS_OCEAN, SEGMENTS_OCEAN)

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

  // Ocean uniforms
  uRepeat = uniform(EnvManager.settingsOcean.repeat)
  uTimeWave = uniform(0)
  uYScale = uniform(EnvManager.settingsOcean.yScale)
  uYStrength = uniform(EnvManager.settingsOcean.yStrength)
  uDirTex = uniform(ControllerManager.joystick)
  uTimeTex = uniform(0)
  uColor = uniform(new Color(this.#settings.color))
  uAlphaTex = uniform(EnvManager.settingsOcean.alphaTex)
  uAlphaTex2 = uniform(EnvManager.settingsOcean.alphaTex2)
  uTrailRotation = uniform(this.#settings.trailRotation)
  uTrailProgress = uniform(this.#settings.trailProgress)
  uTrailTurn = uniform(this.#settings.trailTurn)
  uTrailOpacity = uniform(0)
  uTrailJumpOffset = uniform(0)
  uTrailJumpOpacity = uniform(1)
  uFogColor = uniform(new Color(this.#settings.fogColor))
  uFogDensity = uniform(this.#settings.fogDensity)

  // Extend uniforms
  uExtendColor = uniform(new Color(this.#settings.color))
  uExtendFogColor = uniform(new Color(this.#settings.fogColor))
  uExtendFogDensity = uniform(this.#settings.fogDensity)

  constructor({ debug, scene }) {
    super()

    this.#debug = debug

    this._createMaterial()
    this.#mesh = this._createMesh()
    this._createDebugFolder()

    OceanHeightMap.init(scene)

    this._createExtend(scene)
  }

  get mesh() {
    return this.#mesh
  }

  get mainMaterial() {
    return this.#material
  }

  _createMaterial() {
    const tex = LoaderManager.get('ocean-tile').texture
    tex.wrapS = tex.wrapT = RepeatWrapping
    const trailTex = LoaderManager.get('trail').texture
    trailTex.wrapS = trailTex.wrapT = RepeatWrapping

    const uMap = uniform(tex)
    const uTrailMap = uniform(trailTex)
    const uRepeat = this.uRepeat
    const uTimeWave = this.uTimeWave
    const uYScale = this.uYScale
    const uYStrength = this.uYStrength
    const uDirTex = this.uDirTex
    const uTimeTex = this.uTimeTex
    const uColor = this.uColor
    const uAlphaTex = this.uAlphaTex
    const uAlphaTex2 = this.uAlphaTex2
    const uTrailRotation = this.uTrailRotation
    const uTrailProgress = this.uTrailProgress
    const uTrailTurn = this.uTrailTurn
    const uTrailOpacity = this.uTrailOpacity
    const uTrailJumpOffset = this.uTrailJumpOffset
    const uTrailJumpOpacity = this.uTrailJumpOpacity
    const uFogColor = this.uFogColor
    const uFogDensity = this.uFogDensity
    const useShadows = Settings.castShadows

    const vFogDepth = varying(float(0), 'vOceanFogDepth')
    const vDepth = varying(float(0), 'vOceanDepth')
    const vShadowCoord = varying(vec4(0), 'vOceanShadowCoord')
    const vUvOcean = varying(vec2(0), 'vOceanUv')
    const vUvTrail = varying(vec2(0), 'vOceanUvTrail')

    const mat = new NodeMaterial()

    const waveDirCoef = float(0.02)
    const depthFog = float(1000.0)
    const repeatTrail = float(190.52)

    const vertexFn = Fn(() => {
      const pos = positionLocal.toVar()
      const uvCoord = uv()
      vUvOcean.assign(uvCoord.mul(uRepeat))
      vUvTrail.assign(vec2(uvCoord.x.sub(0.5).add(float(1.0).div(repeatTrail).div(2.0)), uvCoord.y.sub(0.5).add(float(1.0).div(repeatTrail).div(2.0))).mul(repeatTrail))

      const dirWave = uDirTex.mul(waveDirCoef)
      const waveZ = uYStrength.mul(calculateSurface(pos.x.add(dirWave.x), pos.y.add(dirWave.y), uYScale, uTimeWave))
        .sub(uYStrength.mul(calculateSurface(float(0).add(dirWave.x), float(0).add(dirWave.y), uYScale, uTimeWave)))
      const circle = float(pos.x.mul(pos.x).add(pos.y.mul(pos.y))).sqrt()
      pos.z.addAssign(waveZ.mul(float(0.5).sub(circle)))

      const mvPos = modelViewMatrix.mul(vec4(pos, 1.0))
      vDepth.assign(clamp(mvPos.z.negate().div(depthFog), 0.0, 1.0))
      vFogDepth.assign(mvPos.z.negate())

      if (useShadows) {
        vShadowCoord.assign(uShadowCameraP.mul(uShadowCameraV).mul(modelWorldMatrix).mul(vec4(positionLocal, 1.0)))
      }

      return pos
    })

    const fragmentFn = Fn(() => {
      const uvOcean = vUvOcean.add(uDirTex)
      const uvX = uvOcean.x.toVar()
      const uvY = uvOcean.y.toVar()
      uvY.addAssign(float(0.01).mul(sin(uvX.mul(3.5).add(uTimeTex.mul(0.35))).add(sin(uvX.mul(4.8).add(uTimeTex.mul(1.05)))).add(sin(uvX.mul(7.3).add(uTimeTex.mul(0.45)))).div(3.0)))
      uvX.addAssign(float(0.12).mul(sin(uvY.mul(4.0).add(uTimeTex.mul(0.5))).add(sin(uvY.mul(6.8).add(uTimeTex.mul(0.75)))).add(sin(uvY.mul(11.3).add(uTimeTex.mul(0.2)))).div(3.0)))
      uvY.addAssign(float(0.12).mul(sin(uvX.mul(4.2).add(uTimeTex.mul(0.64))).add(sin(uvX.mul(6.3).add(uTimeTex.mul(1.65)))).add(sin(uvX.mul(8.2).add(uTimeTex.mul(0.45)))).div(3.0)))

      const distortedUv = vec2(uvX, uvY)
      const texSample = texture(uMap, distortedUv)
      const texOffset = texture(uMap, distortedUv.add(vec2(0.3)))
      const texColor = texSample.rgb.mul(uAlphaTex).add(uColor).sub(texOffset.a.mul(uAlphaTex2).mul(uAlphaTex))
      const oceanRGB = mix(texColor, uColor, vDepth)

      const uvOrigin = vUvOcean.div(uRepeat)
      const circleAlpha = smoothstep(0.5, 0.505, float(1.0).sub(distance(uvOrigin, vec2(0.5))))

      // Trail
      const trailDistorted = rotateUV(vUvTrail, uTrailRotation, float(0.5))
      const trailTexOffsetVal = uTrailProgress.mul(repeatTrail)
      const distortionView = distance(vec2(0.5), vUvTrail)
      const trailDX = trailDistorted.x.sub(0.5).toVar()
      const trailDY = trailDistorted.y.sub(0.5).sub(trailTexOffsetVal).add(uTrailJumpOffset).toVar()
      const nbTrailVisible = float(4.0)
      const trailPosYOffset = float(0.5)
      const yCoef = trailDY.sub(trailTexOffsetVal).div(nbTrailVisible).sub(trailPosYOffset).toVar()

      // Modify trail UVs conditionally
      const trailDXMod = trailDX.div(yCoef).sub(float(1.0).mul(yCoef.div(repeatTrail).sub(0.5)))
      const trailDXFinal = trailDXMod.add(abs(pow(yCoef.add(trailPosYOffset).sub(0.2), 3.0)).mul(uTrailTurn).mul(float(1.0).div(uTrailOpacity.add(0.1))).mul(3.0))

      const trailUV = vec2(trailDXFinal, trailDY)
      const trailSample = texture(uTrailMap, trailUV).mul(clamp(uAlphaTex.mul(20.0), 0.0, 1.0))
      const trailRGB = trailSample.rgb.mul(smoothstep(0.1, 0.3, trailSample.r))

      const hiddenTrail = step(0.0, trailDY.negate().add(trailTexOffsetVal))
        .mul(smoothstep(nbTrailVisible.negate().mul(uTrailOpacity), nbTrailVisible.negate().mul(uTrailOpacity).add(3.0), trailDY.sub(trailTexOffsetVal)))
        .mul(step(0.0, float(1.0).sub(trailUV.x)))
        .mul(step(0.0, trailUV.x))
      const trailA = trailSample.a.mul(hiddenTrail).mul(uTrailOpacity).mul(uTrailJumpOpacity)

      const finalRGB = oceanRGB.mul(float(1.0).sub(trailA)).add(mix(trailRGB, oceanRGB, 0.1).mul(trailA))

      // Shadows
      const result = finalRGB.toVar()
      if (useShadows) {
        const sc = vShadowCoord.xyz.div(vShadowCoord.w).mul(0.5).add(0.5)
        const depthSC = sc.z
        const depthDM = unpackRGBAToDepth(texture(uShadowDepthMap, sc.xy))
        const shadowBias = float(0.01)
        const sf = step(depthSC.sub(shadowBias), depthDM)
        const testedSF = frustumTest(sc, sf)
        const shadowVal = mix(float(0.5), float(1.0), testedSF)
        result.mulAssign(shadowVal)
      }

      // Fog
      result.assign(applyFog(result, uFogColor, uFogDensity, vFogDepth))

      return vec4(result, 1.0)
    })

    mat.positionNode = vertexFn()
    mat.fragmentNode = fragmentFn()
    this.#material = mat
  }

  _createExtend(scene) {
    const uColor = this.uExtendColor
    const uFogColor = this.uExtendFogColor
    const uFogDensity = this.uExtendFogDensity

    const vFogDepthE = varying(float(0), 'vExtFogDepth')

    const mat = new NodeMaterial()

    const vertexFn = Fn(() => {
      const pos = positionLocal.toVar()
      vFogDepthE.assign(modelViewMatrix.mul(vec4(pos, 1.0)).z.negate())
      return pos
    })

    const fragmentFn = Fn(() => {
      const vUv = uv()
      const circle = distance(vUv, vec2(0.5))
      const result = uColor.toVar()
      result.assign(applyFog(result, uFogColor, uFogDensity, vFogDepthE))
      // discard inner circle
      const alpha = step(0.12, circle)
      return vec4(result, alpha)
    })

    mat.positionNode = vertexFn()
    mat.fragmentNode = fragmentFn()
    mat.transparent = true

    const geo = new PlaneGeometry(SCALE_OCEAN * 3.5, SCALE_OCEAN * 3.5, 1, 1)
    const meshT = new Mesh(geo, mat)
    meshT.position.y = 0
    meshT.rotateX(degToRad(-90))
    scene.add(meshT)
    this.meshExtend = meshT
  }

  _createMesh() {
    const mesh = new Mesh(GEOMETRY, this.#material)
    mesh.scale.set(this.#scale, this.#scale, 1)
    mesh.rotateX(degToRad(-90))
    mesh.renderOrder = 1
    this.add(mesh)
    return mesh
  }

  update({ time, delta }) {
    const { yScale, yStrength, color, speedWave, speedTex, alphaTex, alphaTex2, fogColor, fogDensity } = EnvManager.settingsOcean

    OceanHeightMap.uTimeWave.value = this.uTimeWave.value
    OceanHeightMap.uDirTex.value = this.uDirTex.value = GridManager.offsetUV
    OceanHeightMap.uYScale.value = this.uYScale.value = yScale
    OceanHeightMap.uYStrength.value = this.uYStrength.value = yStrength

    this.uColor.value = new Color(color)
    this.uExtendColor.value = new Color(color)
    this.uAlphaTex.value = alphaTex
    this.uAlphaTex2.value = alphaTex2
    this.uFogColor.value = new Color(fogColor)
    this.uFogDensity.value = fogDensity
    this.uExtendFogColor.value = new Color(fogColor)
    this.uExtendFogDensity.value = fogDensity

    this.uTimeWave.value += (delta / 16) * speedWave
    this.uTimeTex.value += (delta / 16) * speedTex * (1 + ControllerManager.boat.velocityP)

    this.uTrailRotation.value = ControllerManager.boat.angleDir
    this.uTrailTurn.value = ControllerManager.boat.turnForce

    if (this.canTrailOpacity) {
      this.uTrailOpacity.value = ControllerManager.boat.velocityP
    }

    if (this.canTrailProgress) {
      if (!(ModeManager.state === MODE.GAME_STARTED && GameManager.paused)) {
        this.uTrailProgress.value += ControllerManager.boat.velocity * 0.016
      }
    }

    if (ControllerManager.boat.up > 0) {
      this.uTrailJumpOffset.value -= ControllerManager.boat.velocity * 1.2
      if (!this.startJump) {
        this.startJump = true
        this.finishJump = false
        this.canTrailOpacity = true
        this.canTrailProgress = false
        this.tlJump?.kill()
        this.tlJumpFinish?.kill()
        this.tlJump = gsap.to(this.uTrailJumpOpacity, { value: 0, duration: 0.15 })
      }
    } else if (this.startJump) {
      this.startJump = false
      if (!this.finishJump) {
        this.canTrailProgress = true
        this.uTrailJumpOffset.value = 0
        this.uTrailJumpOpacity.value = 1
        this.finishJump = true
        this.canTrailOpacity = false
        this.tlJumpFinish?.kill()
        this.tlJump?.kill()
        if (ControllerManager.boat.velocityP > 0.5) {
          this.tlJumpFinish = gsap.fromTo(
            this.uTrailOpacity,
            { value: 0 },
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

  _createDebugFolder() {
    if (!this.#debug) return

    const settingsChangedHandler = () => {
      this.uFogDensity.value = this.#settings.fogDensity
      this.uFogColor.value = new Color(this.#settings.fogColor)
      this.uExtendFogDensity.value = this.#settings.fogDensity
      this.uExtendFogColor.value = new Color(this.#settings.fogColor)
    }

    const debug = this.#debug.addFolder({ title: 'Ocean', expanded: true })
    debug.addInput(this.#settings, 'fogDensity', { step: 0.00001 }).on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'fogColor').on('change', settingsChangedHandler)

    const btn = debug.addButton({ title: 'Copy settings', label: 'copy' })
    btn.on('click', () => {
      navigator.clipboard.writeText(JSON.stringify(this.#settings))
      console.log('copied to clipboard', this.#settings)
    })
    return debug
  }
}
