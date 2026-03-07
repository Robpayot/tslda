import { Color, Mesh, NodeMaterial, Object3D, PlaneGeometry, RepeatWrapping } from 'three'
import { MathUtils } from 'three'
const { degToRad } = MathUtils
import {
  Fn,
  uniform,
  varying,
  float,
  vec2,
  vec3,
  vec4,
  uv,
  positionLocal,
  modelViewMatrix,
  distance,
  step,
  exp,
  mix,
  sin,
  cos,
  smoothstep,
  min,
  abs,
  pow,
  texture,
  select,
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

export const SCALE_OCEAN = 3000
export const SEGMENTS_OCEAN = 200
export const REPEAT_OCEAN = 70
export const Y_STRENGTH_OCEAN = 23.34
const GEOMETRY = new PlaneGeometry(1, 1, SEGMENTS_OCEAN, SEGMENTS_OCEAN) // 200, 200

export default class Ocean extends Object3D {
  #material
  #debug
  #debugHeightMapPlane
  #settings = {
    color: EnvManager.settingsOcean.color,
    trailRotation: 1,
    trailProgress: 0,
    trailTurn: 0,
    fogColor: '#6abbe9',
    fogDensity: 0.0009,
  }
  #scale = SCALE_OCEAN
  #mesh
  canTrailOpacity = true
  canTrailProgress = true
  constructor({ debug, scene }) {
    super()

    this.#debug = debug

    this._createMaterial()
    this.#mesh = this._createMesh()

    this._createDebugFolder()

    OceanHeightMap.init(scene)

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

    // // Debug plane to visualize OceanHeightMap live (centered in scene, above water) — TSL
    // const debugHeightMapMat = this._createDebugHeightMapMaterial()
    // this.#debugHeightMapPlane = new Mesh(new PlaneGeometry(1, 1), debugHeightMapMat)
    // this.#debugHeightMapPlane.scale.set(50, 50, 1)
    // this.#debugHeightMapPlane.position.set(0, 30, 0)
    // this.#debugHeightMapPlane.visible = !!this.#debug
    // this._debugHeightMapVisible = { showHeightMap: !!this.#debug }
    // this.add(this.#debugHeightMapPlane)
  }

  _createDebugHeightMapMaterial() {
    const heightMapTex = OceanHeightMap.heightMap?.texture
    if (!heightMapTex) {
      const fallback = new NodeMaterial()
      fallback.colorNode = vec4(0.2, 0.2, 0.2, 1)
      return fallback
    }
    const mat = new NodeMaterial()
    mat.colorNode = Fn(() => vec4(texture(heightMapTex, uv()).rgb, 1))()
    return mat
  }

  get mesh() {
    return this.#mesh
  }

  _createMaterial() {
    const mapTexture = LoaderManager.getTexture('ocean-tile')
    const trailMapTexture = LoaderManager.getTexture('trail')
    mapTexture.wrapS = mapTexture.wrapT = RepeatWrapping
    trailMapTexture.wrapS = trailMapTexture.wrapT = RepeatWrapping

    // EnvManager.sunShadowMap – commented out for now
    // const sunShadowMap = EnvManager.sunShadowMap

    // Uniforms (stored on instance for update() and debug)
    this.uMap = uniform(mapTexture)
    this.uTrailMap = uniform(trailMapTexture)
    this.uColor = uniform(new Color(this.#settings.color))
    this.uRepeat = uniform(EnvManager.settingsOcean.repeat)
    this.uTimeTex = uniform(0)
    this.uDirTex = uniform(ControllerManager.joystick)
    this.uTimeWave = uniform(0)
    this.uYScale = uniform(EnvManager.settingsOcean.yScale)
    this.uYStrength = uniform(EnvManager.settingsOcean.yStrength)
    this.uAlphaTex = uniform(EnvManager.settingsOcean.alphaTex)
    this.uAlphaTex2 = uniform(EnvManager.settingsOcean.alphaTex2)
    this.uTrailRotation = uniform(this.#settings.trailRotation)
    this.uTrailProgress = uniform(this.#settings.trailProgress)
    this.uTrailTurn = uniform(this.#settings.trailTurn)
    this.uTrailOpacity = uniform(0)
    this.uTrailJumpOffset = uniform(0)
    this.uTrailJumpOpacity = uniform(1)
    this.uFogColor = uniform(new Color(this.#settings.fogColor))
    this.uFogDensity = uniform(this.#settings.fogDensity)
    // EnvManager.sunShadowMap – commented out
    // if (sunShadowMap) {
    //   this.uDepthMap = uniform(sunShadowMap.map.texture)
    //   this.uShadowCameraP = uniform(sunShadowMap.camera.projectionMatrix)
    //   this.uShadowCameraV = uniform(sunShadowMap.camera.matrixWorldInverse)
    // }

    const waveDirCoef = 0.02
    const repeatTrail = 190.52
    const depthFog = 1000.0
    const center = vec2(0.5, 0.5)
    const nbTrailVisible = 4.0

    const vUv = varying(vec2(0, 0), 'vUv')
    const vDepth = varying(float(0), 'vDepth')
    const vFogDepth = varying(float(0), 'vFogDepth')
    const vUvTrail = varying(vec2(0, 0), 'vUvTrail')
    const vRepeatTrail = varying(float(0), 'vRepeatTrail')
    // EnvManager.sunShadowMap – commented out
    // const vNormal = varying(vec3(0, 0, 0), 'vNormal')
    // const vShadowCoord = varying(vec4(0, 0, 0, 0), 'vShadowCoord')

    const positionFn = Fn(() => {
      const pos = positionLocal.toVar()
      const uRepeat = this.uRepeat
      const uTimeWave = this.uTimeWave
      const uYScale = this.uYScale
      const uYStrength = this.uYStrength
      const uDirTex = this.uDirTex

      const calculateSurface = (x, z) => {
        const y1 = sin(x.mul(1.0).div(uYScale).add(uTimeWave.mul(1.0)))
          .add(sin(x.mul(2.3).div(uYScale).add(uTimeWave.mul(1.5))))
          .add(sin(x.mul(3.3).div(uYScale).add(uTimeWave.mul(0.4))))
        const y2 = sin(z.mul(0.2).div(uYScale).add(uTimeWave.mul(1.8)))
          .add(sin(z.mul(1.8).div(uYScale).add(uTimeWave.mul(1.8))))
          .add(sin(z.mul(2.8).div(uYScale).add(uTimeWave.mul(0.8))))
        return y1.div(3.0).add(y2.div(3.0))
      }

      vUv.assign(uv().mul(uRepeat))
      vRepeatTrail.assign(float(repeatTrail))
      vUvTrail.assign(
        uv()
          .sub(vec2(0.5, 0.5))
          .add(vec2(1.0 / repeatTrail / 2.0, 1.0 / repeatTrail / 2.0))
          .mul(float(repeatTrail))
      )

      const dirWave = uDirTex.mul(float(waveDirCoef))
      const surf = uYStrength.mul(
        calculateSurface(pos.x.add(dirWave.x), pos.y.add(dirWave.y)).sub(
          calculateSurface(float(0).add(dirWave.x), float(0).add(dirWave.y))
        )
      )
      pos.z.addAssign(surf)

      const circle = distance(vec2(pos.x, pos.y), vec2(0, 0))
      pos.z.mulAssign(float(0.5).sub(circle))

      const mvPosition = modelViewMatrix.mul(vec4(pos, 1.0))
      vDepth.assign(mvPosition.z.negate().div(depthFog).clamp(0.0, 1.0))
      vFogDepth.assign(mvPosition.z.negate())

      // EnvManager.sunShadowMap – commented out
      // vNormal.assign(normalLocal)
      // if (sunShadowMap && this.uShadowCameraP) {
      //   vShadowCoord.assign(
      //     this.uShadowCameraP.mul(this.uShadowCameraV).mul(modelMatrix).mul(vec4(positionLocal, 1.0))
      //   )
      // } else {
      //   vShadowCoord.assign(vec4(0, 0, 0, 1))
      // }

      return pos
    })

    const colorFn = Fn(() => {
      const vUvFrag = vUv.add(this.uDirTex)
      const timeTex = this.uTimeTex
      const uvDistorted = vUvFrag.toVar()
      uvDistorted.y.addAssign(
        float(0.01)
          .mul(
            sin(uvDistorted.x.mul(3.5).add(timeTex.mul(0.35)))
              .add(sin(uvDistorted.x.mul(4.8).add(timeTex.mul(1.05))))
              .add(sin(uvDistorted.x.mul(7.3).add(timeTex.mul(0.45))))
          )
          .div(3.0)
      )
      uvDistorted.x.addAssign(
        float(0.12)
          .mul(
            sin(uvDistorted.y.mul(4.0).add(timeTex.mul(0.5)))
              .add(sin(uvDistorted.y.mul(6.8).add(timeTex.mul(0.75))))
              .add(sin(uvDistorted.y.mul(11.3).add(timeTex.mul(0.2))))
          )
          .div(3.0)
      )
      uvDistorted.y.addAssign(
        float(0.12)
          .mul(
            sin(uvDistorted.x.mul(4.2).add(timeTex.mul(0.64)))
              .add(sin(uvDistorted.x.mul(6.3).add(timeTex.mul(1.65))))
              .add(sin(uvDistorted.x.mul(8.2).add(timeTex.mul(0.45))))
          )
          .div(3.0)
      )

      const tex = texture(mapTexture, uvDistorted)
      const texOffset = texture(mapTexture, uvDistorted.add(vec2(0.3, 0)))
      const alphaTex = this.uAlphaTex
      const alphaTex2 = this.uAlphaTex2
      const color = this.uColor
      let texColor = tex.rgb.mul(alphaTex).add(vec3(color)).sub(texOffset.a.mul(alphaTex2).mul(alphaTex))
      texColor = mix(texColor, vec3(color), vDepth)

      const uvOrigin = vUv.div(this.uRepeat)
      const circleFrag = distance(uvOrigin, center)
      const alpha = smoothstep(float(0.5), float(0.505), float(1).sub(circleFrag))
      const oceanTex = vec4(texColor, alpha)

      const rotateUV = (uvVec, rotation, mid) =>
        vec2(
          cos(rotation)
            .mul(uvVec.x.sub(mid))
            .add(sin(rotation).mul(uvVec.y.sub(mid)))
            .add(mid),
          cos(rotation)
            .mul(uvVec.y.sub(mid))
            .sub(sin(rotation).mul(uvVec.x.sub(mid)))
            .add(mid)
        )

      const distortUVTrail = rotateUV(vec2(vUvTrail.x, vUvTrail.y), this.uTrailRotation, float(0.5))
      const trailTexOffset = this.uTrailProgress.mul(vRepeatTrail)
      const distortionView = distance(vec2(0.5, 0.5), vUvTrail)

      const trailOff = distortUVTrail
        .sub(vec2(0.5, 0.5))
        .sub(vec2(0, 0.5).sub(trailTexOffset).add(this.uTrailJumpOffset))
      const trailPosYOffset = 0.5
      const yCoef = trailOff.y.sub(trailTexOffset).div(nbTrailVisible).sub(float(trailPosYOffset))
      const trailX = trailOff.x
        .div(yCoef)
        .sub(float(1).mul(yCoef.div(vRepeatTrail).sub(0.5)))
        .add(
          abs(pow(yCoef.add(float(trailPosYOffset).sub(0.2)), 3.0))
            .mul(this.uTrailTurn)
            .mul(float(1).div(this.uTrailOpacity.add(0.1)))
            .mul(3.0)
        )
      const transformedTrailUV = vec2(trailX, trailOff.y)
      const distortUVTrailFinal = select(distortionView.greaterThan(float(0.05)), transformedTrailUV, distortUVTrail)

      let trailTex = texture(trailMapTexture, distortUVTrailFinal).mul(min(alphaTex.mul(20), float(1)))
      trailTex = vec4(trailTex.xyz.mul(smoothstep(float(0.1), float(0.3), trailTex.r)), trailTex.a)
      const hiddenTrailPart = step(float(0), distortUVTrailFinal.y.negate().add(trailTexOffset))
        .mul(
          smoothstep(
            float(-nbTrailVisible).mul(this.uTrailOpacity),
            float(-nbTrailVisible).mul(this.uTrailOpacity).add(3.0),
            distortUVTrailFinal.y.sub(trailTexOffset)
          )
        )
        .mul(step(float(0), float(1).sub(distortUVTrailFinal.x)))
        .mul(step(float(0), distortUVTrailFinal.x))
      trailTex = vec4(trailTex.xyz, trailTex.a.mul(hiddenTrailPart).mul(this.uTrailOpacity).mul(this.uTrailJumpOpacity))

      const finalColor = oceanTex.xyz
        .mul(float(1).sub(trailTex.a))
        .add(mix(trailTex.xyz, oceanTex.xyz, float(0.1)).mul(trailTex.a))
        .toVar()

      // EnvManager.sunShadowMap – commented out
      // if (sunShadowMap && this.uDepthMap && Settings.castShadows) {
      //   const shadowCoord = vShadowCoord.xyz.div(vShadowCoord.w).mul(0.5).add(0.5)
      //   const depthMapUv = shadowCoord.xy
      //   const depthVec = texture(this.uDepthMap, depthMapUv)
      //   const unpackScale = vec4(
      //     1.0 / 256.0,
      //     1.0 / 65025.0,
      //     1.0 / 65025.0 / 256.0,
      //     1.0 / 65025.0 / 65025.0
      //   )
      //   const depthFromMap = dot(depthVec, unpackScale)
      //   const depthShadowCoord = shadowCoord.z
      //   const bias = 0.01
      //   let shadowFactor = step(depthShadowCoord.sub(bias), depthFromMap)
      //   const inFrustum = shadowCoord.x
      //     .greaterThanEqual(0)
      //     .and(shadowCoord.x.lessThanEqual(1))
      //     .and(shadowCoord.y.greaterThanEqual(0))
      //     .and(shadowCoord.y.lessThanEqual(1))
      //   const inZ = shadowCoord.z.lessThanEqual(1)
      //   shadowFactor = select(inFrustum.and(inZ), shadowFactor, float(1))
      //   const shadowDarkness = 0.5
      //   const shadow = mix(float(1).sub(shadowDarkness), float(1), shadowFactor)
      //   finalColor.assign(finalColor.mul(shadow))
      // }

      const fogFactor = float(1).sub(exp(this.uFogDensity.mul(this.uFogDensity).mul(vFogDepth).mul(vFogDepth).negate()))
      finalColor.assign(mix(finalColor, vec3(this.uFogColor), fogFactor))

      return vec4(finalColor, 1.0)
    })

    this.#material = new NodeMaterial()
    this.#material.positionNode = positionFn()
    this.#material.colorNode = colorFn()
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
      const fogFactor = float(1).sub(
        exp(uExtFogDensity.negate().mul(uExtFogDensity).mul(vExtFogDepth).mul(vExtFogDepth))
      )
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
    const { yScale, yStrength, color, speedWave, speedTex, alphaTex, alphaTex2, fogColor, fogDensity } =
      EnvManager.settingsOcean

    OceanHeightMap.uTimeWave.value = this.uTimeWave.value
    // Same dirTex as ocean so heightmap wave phase matches → barrels stay in sync (WebGL did this too)
    OceanHeightMap.uDirTex.value.copy(GridManager.offsetUV)
    this.uDirTex.value = GridManager.offsetUV
    OceanHeightMap.uYScale.value = yScale
    OceanHeightMap.uYStrength.value = yStrength
    // Env
    this.uColor.value = new Color(color)
    this.uExtColor.value = new Color(color)
    this.uAlphaTex.value = alphaTex
    this.uAlphaTex2.value = alphaTex2
    this.uFogColor.value = new Color(fogColor)
    this.uFogDensity.value = fogDensity
    this.uExtFogColor.value = new Color(fogColor)
    this.uExtFogDensity.value = fogDensity

    // texture
    this.uTimeWave.value += (delta / 16) * speedWave
    this.uTimeTex.value += (delta / 16) * speedTex * (1 + ControllerManager.boat.velocityP)
    // to do also update other uniforms based on EnvManager
    // TODO: compense by camera direction

    // Texture trail
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

    // Jump
    if (ControllerManager.boat.up > 0) {
      this.uTrailJumpOffset.value -= ControllerManager.boat.velocity * 1.2
      if (!this.startJump) {
        this.startJump = true
        this.finishJump = false
        this.canTrailOpacity = true
        this.canTrailProgress = false
        this.tlJump?.kill()
        this.tlJumpFinish?.kill()
        this.tlJump = gsap.to(this.uTrailJumpOpacity, {
          value: 0,
          duration: 0.15,
        })
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
      this.uFogDensity.value = this.#settings.fogDensity
      this.uFogColor.value = new Color(this.#settings.fogColor)
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
