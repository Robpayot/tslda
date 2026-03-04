import { BackSide, Color, NodeMaterial, Object3D } from 'three'
import { Fn, uniform, float, vec3, vec4, uv, mix, pow } from 'three/tsl'
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
  #scale = 15
  constructor({ debug }) {
    super()


    this.#debug = debug

    this._createMaterial()
    this._createMesh()

    this._createDebugFolder()
  }

  _createMaterial() {
    this.uColor1 = uniform(new Color(this.#settings.color1))
    this.uColor2 = uniform(new Color(this.#settings.color2))

    const colorFn = Fn(() => {
      const power = pow(float(1).sub(uv().x), 4.0)
      const color = mix(vec3(this.uColor1), vec3(this.uColor2), power)
      return vec4(color, 1.0)
    })

    this.#material = new NodeMaterial()
    this.#material.colorNode = colorFn()
    this.#material.side = BackSide
    this.#material.depthTest = false
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

    // mesh.scale.set(2, 1, 2)

    this.add(mesh)
  }

  /**
   * Update
   */
  update({ time, delta }) {
    this.uColor1.value = new Color(EnvManager.settings.sky)
    this.uColor2.value = new Color(EnvManager.settings.sky2)
  }

  resize({ width, height }) {}

  /**
   * Debug
   */
  _createDebugFolder() {
    if (!this.#debug) return

    const settingsChangedHandler = () => {
      this.scale.set(this.#settings.scaleXZ, this.#settings.scaleY, this.#settings.scaleXZ)
    }

    const debug = this.#debug.addFolder({ title: 'Horizon', expanded: false })

    debug.addInput(this.#settings, 'scaleY').on('change', settingsChangedHandler)
    debug.addInput(this.#settings, 'scaleXZ', { step: 0.01 }).on('change', settingsChangedHandler)

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
