import {
  HalfFloatType,
  Mesh,
  NearestFilter,
  NodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three'
import { Fn, uniform, float, vec3, vec4, positionLocal, uv } from 'three/tsl'
import Debugger from '@/js/managers/Debugger'
import { calculateSurface } from '@/js/tsl/nodes'
import { SCALE_OCEAN } from '.'
import Settings from '../../utils/Settings'

class OceanHeightmap {
  #camera
  #scene
  #settings = {
    heightMapCoef: 0.04,
  }
  #heightMap
  #material

  uTimeWave = uniform(0)
  uYScale = uniform(0)
  uYStrength = uniform(0)
  uDirTex = uniform(new Vector2(0, 0))
  uHeightMapCoef = uniform(this.#settings.heightMapCoef)

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

    this.#camera.position.z = 1
    this.#camera.lookAt(new Vector3(0, 0, 0))

    const mapSize = Settings.textureSize

    const pars = {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      format: RGBAFormat,
      type: HalfFloatType,
    }

    const renderTarget = new WebGLRenderTarget(mapSize, mapSize, pars)

    const uTimeWave = this.uTimeWave
    const uYScale = this.uYScale
    const uYStrength = this.uYStrength
    const uDirTex = this.uDirTex

    const mat = new NodeMaterial()

    const vertexFn = Fn(() => {
      const pos = positionLocal.toVar()
      const waveDirCoef = float(0.02)
      const dirWave = uDirTex.mul(waveDirCoef)

      const depth = pos.z.toVar()
      depth.addAssign(uYStrength.mul(calculateSurface(pos.x.add(dirWave.x), pos.y.add(dirWave.y), uYScale, uTimeWave)))
      depth.subAssign(uYStrength.mul(calculateSurface(float(0).add(dirWave.x), float(0).add(dirWave.y), uYScale, uTimeWave)))

      const circle = float(pos.x.mul(pos.x).add(pos.y.mul(pos.y))).sqrt()
      depth.mulAssign(float(0.5).sub(circle))

      return pos
    })

    const fragmentFn = Fn(() => {
      const pos = positionLocal.toVar()
      const waveDirCoef = float(0.02)
      const dirWave = uDirTex.mul(waveDirCoef)

      const depth = pos.z.toVar()
      depth.addAssign(uYStrength.mul(calculateSurface(pos.x.add(dirWave.x), pos.y.add(dirWave.y), uYScale, uTimeWave)))
      depth.subAssign(uYStrength.mul(calculateSurface(float(0).add(dirWave.x), float(0).add(dirWave.y), uYScale, uTimeWave)))

      const circle = float(pos.x.mul(pos.x).add(pos.y.mul(pos.y))).sqrt()
      depth.mulAssign(float(0.5).sub(circle))

      const vDepth = depth.add(uYStrength).div(float(2.0)).div(uYStrength)
      const vDepthAvg = vDepth
      const vYStrength = uYStrength.div(100.0)

      return vec4(vec3(vDepth, vDepthAvg, vYStrength), 1.0)
    })

    mat.positionNode = vertexFn()
    mat.fragmentNode = fragmentFn()

    this.#material = mat
    return renderTarget
  }

  init(scene) {
    this.#heightMap = this._createHeightMap()

    this.#scene = new Scene()
    this._createDebugFolder()

    const mesh = new Mesh(new PlaneGeometry(1, 1, 200, 200), this.#material)
    mesh.position.y = 0
    mesh.scale.set(SCALE_OCEAN, SCALE_OCEAN, 1)
    this.#scene.add(mesh)
  }

  _createDebugFolder() {
    if (!Debugger) return

    const settingsChangedHandler = () => {
      this.uHeightMapCoef.value = this.#settings.heightMapCoef
    }

    const debugFolder = Debugger.addFolder({ title: `Ocean heightmap`, expanded: true })

    debugFolder.addInput(this.#settings, 'heightMapCoef').on('change', settingsChangedHandler)

    const btn = debugFolder.addButton({
      title: 'Copy settings',
      label: 'copy',
    })

    btn.on('click', () => {
      navigator.clipboard.writeText(JSON.stringify(this.#settings))
      console.log('copied to clipboard', this.#settings)
    })
    return debugFolder
  }
}

export default new OceanHeightmap()
