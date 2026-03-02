import { BackSide, Color, NodeMaterial, Object3D } from 'three'
import { Fn, uniform, float, vec4, uv, mix, pow } from 'three/tsl'
import LoaderManager from '@/js/managers/LoaderManager'
import EnvManager from '../../managers/EnvManager'

export default class Horizon extends Object3D {
  #material
  #debug
  #settings = {
    scaleY: 13,
    scaleXZ: 16.259999999999998,
    color1: EnvManager.settings.sky,
    color2: EnvManager.settings.sky2,
  }

  uColor1 = uniform(new Color(this.#settings.color1))
  uColor2 = uniform(new Color(this.#settings.color2))

  constructor({ debug }) {
    super()

    this.#debug = debug

    this._createMaterial()
    this._createMesh()
    this._createDebugFolder()
  }

  _createMaterial() {
    const mat = new NodeMaterial()
    mat.side = BackSide
    mat.depthTest = false

    const uColor1 = this.uColor1
    const uColor2 = this.uColor2

    const fragmentFn = Fn(() => {
      const vUv = uv()
      const power = pow(float(1.0).sub(vUv.x), 4.0)
      const color = mix(uColor1, uColor2, power)
      return vec4(color, 1.0)
    })

    mat.fragmentNode = fragmentFn()
    this.#material = mat
  }

  _createMesh() {
    const gltf = LoaderManager.get('horizon').gltf
    const scene = gltf.scene.clone()
    const mesh = scene.getObjectByName('Horizon')
    mesh.material = this.#material

    const geo = mesh.geometry
    geo.computeBoundingBox()
    const bb = geo.boundingBox
    geo.translate(0, bb.max.y, 0)

    this.scale.set(this.#settings.scaleXZ, this.#settings.scaleY, this.#settings.scaleXZ)
    mesh.renderOrder = -1
    this.renderOrder = -1
    this.add(mesh)
  }

  update({ time, delta }) {
    this.uColor1.value = new Color(EnvManager.settings.sky)
    this.uColor2.value = new Color(EnvManager.settings.sky2)
  }

  resize({ width, height }) {}

  _createDebugFolder() {
    if (!this.#debug) return

    const settingsChangedHandler = () => {
      this.scale.set(this.#settings.scaleXZ, this.#settings.scaleY, this.#settings.scaleXZ)
    }

    const debug = this.#debug.addFolder({ title: 'Horizon', expanded: false })
    debug.addInput(this.#settings, 'scaleY').on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'scaleXZ', { step: 0.01 }).on('change', settingsChangedHandler)

    const btn = debug.addButton({ title: 'Copy settings', label: 'copy' })
    btn.on('click', () => {
      navigator.clipboard.writeText(JSON.stringify(this.#settings))
      console.log('copied to clipboard', this.#settings)
    })
    return debug
  }
}
