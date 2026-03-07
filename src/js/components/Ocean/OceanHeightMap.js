import {
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  Vector2,
  WebGLRenderTarget,
} from 'three'
import {
  Fn, uniform, varying,
  float, vec2, vec4,
  positionLocal,
  distance, sin,
} from 'three/tsl'
import { MathUtils } from 'three'
import Debugger from '@/js/managers/Debugger'
import { SCALE_OCEAN } from '.'
import Settings from '../../utils/Settings'

const { degToRad } = MathUtils

class OceanHeightmap {
  #camera
  #scene
  #mainScene = null
  #debugPlaneMesh = null
  #settings = {
    heightMapCoef: 0.04,
  }
  #heightMap
  #material
  debugOceanHeightmap = false
  constructor() {}

  get heightMap() {
    return this.#heightMap
  }

  get material() {
    return this.#material
  }

  get scene() {
    return this.#scene
  }

  get camera() {
    return this.#camera
  }

  _createHeightMap() {
    const frustumSize = 3000

    this.#camera = new OrthographicCamera(
      -frustumSize / 2,
      frustumSize / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      frustumSize
    )

    this.#camera.position.set(0, 1, 0)
    this.#camera.lookAt(0, 0, 0)
    this.#camera.up.set(0, 0, -1)

    const mapSize = Settings.textureSize

    const pars = {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      format: RGBAFormat,
      type: HalfFloatType,
    }

    // WebGLRenderTarget works with both WebGL and WebGPU (WebGPURenderer accepts it).
    const texture = new WebGLRenderTarget(mapSize, mapSize, pars)

    // Uniforms (stored on instance for debug / external updates)
    this.uTimeWave = uniform(0)
    this.uYScale = uniform(0)
    this.uYStrength = uniform(0)
    this.uDirTex = uniform(new Vector2(0, 0))
    this.uHeightMapCoef = uniform(this.#settings.heightMapCoef)

    const waveDirCoef = 0.02

    const vDepth = varying(float(0), 'vDepth')
    const vDepthAvg = varying(float(0), 'vDepthAvg')
    const vYStrength = varying(float(0), 'vYStrength')

    const positionFn = Fn(() => {
      const pos = positionLocal
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

      const dirWave = uDirTex.mul(float(waveDirCoef))
      const circle = distance(vec2(pos.x, pos.y), vec2(0, 0))
      const depth = pos.z
        .add(uYStrength.mul(calculateSurface(pos.x.add(dirWave.x), pos.y.add(dirWave.y))))
        .sub(uYStrength.mul(calculateSurface(float(0).add(dirWave.x), float(0).add(dirWave.y))))
        .mul(float(0.5).sub(circle))

      vDepth.assign(depth.add(uYStrength).div(2.0).div(uYStrength))
      vDepthAvg.assign(depth.add(uYStrength).div(2.0).div(uYStrength))
      vYStrength.assign(uYStrength.div(100.0))

      return positionLocal
    })

    const colorFn = Fn(() => vec4(vDepth, vDepthAvg, vYStrength, 1.0))

    this.#material = new NodeMaterial()
    this.#material.positionNode = positionFn()
    this.#material.colorNode = colorFn()

    return texture
  }

  init(mainScene) {
    this.#heightMap = this._createHeightMap()
    this.#mainScene = mainScene

    this.#scene = new Scene()
    this._createDebugFolder()

    const mesh = new Mesh(new PlaneGeometry(1, 1, 200, 200), this.#material)
    mesh.position.y = 0
    mesh.rotateX(degToRad(-90))
    mesh.scale.set(SCALE_OCEAN, SCALE_OCEAN, 1)
    this.#scene.add(mesh)
  }

  _createDebugPlane() {
    if (this.#debugPlaneMesh) return this.#debugPlaneMesh
    const size = 4
    const geo = new PlaneGeometry(size, size)
    const mat = new MeshBasicMaterial({
      map: this.#heightMap.texture,
      depthTest: true,
      depthWrite: true,
    })
    this.#debugPlaneMesh = new Mesh(geo, mat)
    this.#debugPlaneMesh.position.set(0, 10, 0)
    const scale = 10
    this.#debugPlaneMesh.scale.set(scale, scale, scale)
    this.#debugPlaneMesh.renderOrder = 9999
    this.#debugPlaneMesh.name = 'OceanHeightMapDebugPlane'
    return this.#debugPlaneMesh
  }

  _setDebugOceanHeightmapVisible(visible) {
    this.debugOceanHeightmap = visible
    if (!this.#mainScene) return
    if (visible) {
      this._createDebugPlane()
      if (!this.#debugPlaneMesh.parent) {
        this.#mainScene.add(this.#debugPlaneMesh)
      }
      this.#debugPlaneMesh.visible = true
      this.#debugPlaneMesh.material.map = this.#heightMap.texture
    } else if (this.#debugPlaneMesh) {
      this.#debugPlaneMesh.visible = false
    }
  }

  /**
   * Debug
   */
  _createDebugFolder() {
    if (!Debugger) return

    const settingsChangedHandler = () => {
      this.uHeightMapCoef.value = this.#settings.heightMapCoef
    }

    const debugFolder = Debugger.addFolder({ title: `Ocean heightmap`, expanded: true })

    debugFolder.addInput(this, 'debugOceanHeightmap', { label: 'Show heightmap on scene' }).on('change', (ev) => {
      this._setDebugOceanHeightmapVisible(ev.value)
    })

    debugFolder.addInput(this.#settings, 'heightMapCoef').on('change', settingsChangedHandler)

    const btn = debugFolder.addButton({
      title: 'Copy settings',
      label: 'copy', // optional
    })

    btn.on('click', () => {
      navigator.clipboard.writeText(JSON.stringify(this.#settings))
      console.log('copied to clipboard', this.#settings)
    })
    return debugFolder
  }
}

export default new OceanHeightmap()
