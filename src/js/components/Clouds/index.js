import { Color, NodeMaterial, Object3D, Vector2, Vector3 } from 'three'
import { Fn, uniform, float, vec2, vec4, uv, sin, smoothstep, texture } from 'three/tsl'
import LongCloud from './LongCloud'
import LoaderManager from '../../managers/LoaderManager'
import { MathUtils } from 'three'
const { randFloat, randInt } = MathUtils
import SmallCloud from './SmallCloud'
import EnvManager from '../../managers/EnvManager'

const ASSETS_LONG = [{ map: 'long-cloud-1' }, { map: 'long-cloud-2' }]
const ASSETS_BACK = [{ map: 'long-cloud-back-1' }, { map: 'long-cloud-back-2' }]
const ASSETS_SMALL = [{ map: 'small-cloud-1' }, { map: 'small-cloud-2' }, { map: 'small-cloud-3' }]

// set up cloud
const SCALE_RATIO = 2
const SCALE_Y = 3.5
const SCALE_SMALL = 1.5
const RADIUS_SMALL = 1400 * SCALE_SMALL
const Y_SMALL = 200

export default class Clouds extends Object3D {
  #scene
  #debug
  #settings = {
    nbClouds: 21,
    nbBackClouds: 7,
    nbSmallClouds: 9,
    radius: 1400 * SCALE_Y,
    light: 0.3,
    y: 150 * SCALE_Y,
  }
  #clouds
  #materials = {}
  #materialsArr = []
  constructor({ debug, scene }) {
    super()

    this.#debug = debug
    this.#scene = scene

    this.#materials = this._createMaterials()

    for (const key in this.#materials) {
      this.#materialsArr.push(this.#materials[key])
    }

    this.#clouds = this._createClouds()

    this._createDebugFolder()

    this.renderOrder = 20
  }

  _createMaterials() {
    const materials = {}
    const w0 = 0.1964825501511404
    const w1 = 0.2969069646728344
    const w2 = 0.09447039785044732
    const w3 = 0.010381362401148057
    const off1 = 1.411764705882353
    const off2 = 3.2941176470588234
    const off3 = 5.176470588235294

    // Long
    for (let i = 0; i < ASSETS_LONG.length; i++) {
      const texName = ASSETS_LONG[i]
      const tex = LoaderManager.getTexture(texName.map)
      const texW = tex.source?.data?.width ?? 1
      const texH = tex.source?.data?.height ?? 1

      const uLight = uniform(this.#settings.light)
      const uTime = uniform(0)
      const uGlobalOpacity = uniform(EnvManager.settings.alphaClouds)
      const uSmoothBlue = uniform(new Vector2(0.4, 0.75))
      const uTextureSizeX = uniform(texW)
      const uTextureSizeY = uniform(texH)

      const colorFn = Fn(() => {
        const uvBase = uv()
        const uvDistorted = uvBase.add(vec2(float(0.12).mul(sin(uvBase.y.mul(2.0).add(uTime.mul(0.5)))).div(6.0), 0))
        const res = vec2(uTextureSizeX, uTextureSizeY)
        const dir = vec2(5.0, 2.0)
        const o1 = vec2(off1, off1).mul(dir)
        const o2 = vec2(off2, off2).mul(dir)
        const o3 = vec2(off3, off3).mul(dir)
        const t0 = texture(tex, uvDistorted).mul(w0)
        const t1a = texture(tex, uvDistorted.add(o1.div(res))).mul(w1)
        const t1b = texture(tex, uvDistorted.sub(o1.div(res))).mul(w1)
        const t2a = texture(tex, uvDistorted.add(o2.div(res))).mul(w2)
        const t2b = texture(tex, uvDistorted.sub(o2.div(res))).mul(w2)
        const t3a = texture(tex, uvDistorted.add(o3.div(res))).mul(w3)
        const t3b = texture(tex, uvDistorted.sub(o3.div(res))).mul(w3)
        const texBlur = t0.add(t1a).add(t1b).add(t2a).add(t2b).add(t3a).add(t3b)
        const alpha = smoothstep(uSmoothBlue.x, uSmoothBlue.y, texBlur.b).mul(0.85)
        return vec4(texBlur.rgb.add(uLight), alpha.mul(uGlobalOpacity))
      })

      const mat = new NodeMaterial()
      mat.colorNode = colorFn()
      mat.transparent = true
      mat.depthWrite = false
      mat.uTime = uTime
      mat.uGlobalOpacity = uGlobalOpacity
      materials[texName.map] = mat
    }

    // Long Back
    for (let i = 0; i < ASSETS_BACK.length; i++) {
      const texName = ASSETS_BACK[i]
      const mapTex = LoaderManager.getTexture(texName.map)

      const uLight = uniform(this.#settings.light)
      const uTime = uniform(0)
      const uGlobalOpacity = uniform(EnvManager.settings.alphaClouds)

      const colorFn = Fn(() => {
        const uvBase = uv()
        const uvDistorted = uvBase.add(vec2(float(0.12).mul(sin(uvBase.y.mul(2.0).add(uTime.mul(0.5)))).div(6.0), 0))
        const texSample = texture(mapTex, uvDistorted)
        return vec4(texSample.rgb.add(uLight), texSample.a.mul(0.9).mul(uGlobalOpacity))
      })

      const mat = new NodeMaterial()
      mat.colorNode = colorFn()
      mat.transparent = true
      mat.depthWrite = false
      mat.uTime = uTime
      mat.uGlobalOpacity = uGlobalOpacity
      materials[texName.map] = mat
    }

    return materials
  }

  _createClouds() {
    const clouds = []
    const total = this.#settings.nbClouds

    const divAngle = (Math.PI * 2) / total
    const radius = this.#settings.radius

    const DIR = [-1, 1]

    let countOrder

    const divAngleBack = (Math.PI * 2) / this.#settings.nbBackClouds

    // LONG BACK
    for (let i = 0; i < this.#settings.nbBackClouds; i++) {
      let cloudRadius = radius + 150 + randInt(-120, 120)
      let offsetAngle = randFloat(-0.1, 0.1)
      const currentAngle = divAngleBack * i + offsetAngle
      const x = cloudRadius * Math.cos(currentAngle)
      const z = cloudRadius * Math.sin(currentAngle)

      const y = this.#settings.y + randFloat(-4, 100) * SCALE_Y

      const numTex = randInt(0, ASSETS_BACK.length - 1)

      let material = this.#materials[ASSETS_BACK[numTex].map]

      const dir = DIR[randInt(0, 1)]

      const speed = randFloat(1, 2) * SCALE_RATIO

      const cloud = new LongCloud({
        position: new Vector3(x, y, z),
        material,
        index: countOrder,
        dir,
        speed,
        currentAngle,
        radius: cloudRadius,
      })

      const s = randFloat(4, 5.5) * SCALE_RATIO

      const sx = s * randFloat(1.5, 2) * SCALE_RATIO
      const sy = s * randFloat(1, 1.5) * SCALE_RATIO
      cloud.scale.set(sx, sy, s)

      this.add(cloud)

      countOrder++

      clouds.push(cloud)
    }

    // LONG

    for (let i = 0; i < total; i++) {
      let cloudRadius = radius + randInt(-120, 120)
      let offsetAngle = randFloat(-0.1, 0.1)
      const currentAngle = divAngle * i + offsetAngle
      const x = cloudRadius * Math.cos(currentAngle)
      const z = cloudRadius * Math.sin(currentAngle)

      const y = this.#settings.y + randFloat(-8, 200) * SCALE_Y

      const numTex = randInt(0, ASSETS_LONG.length - 1)

      let material = this.#materials[ASSETS_LONG[numTex].map]

      const dir = DIR[randInt(0, 1)]

      const speed = randFloat(1, 2) * SCALE_RATIO

      const cloud = new LongCloud({
        position: new Vector3(x, y, z),
        material,
        index: countOrder,
        dir,
        speed,
        currentAngle,
        radius: cloudRadius,
      })

      const s = randFloat(2, 2.5) * SCALE_RATIO

      const sx = s * randFloat(1.5, 2) * SCALE_RATIO
      const sy = s * randFloat(1, 1.5) * SCALE_RATIO
      cloud.scale.set(sx, sy, s)

      this.add(cloud)

      clouds.push(cloud)

      countOrder++
    }

    // SMALL
    for (let i = 0; i < total; i++) {
      let cloudRadius = RADIUS_SMALL + randInt(-500, -300)
      let offsetAngle = randFloat(-0.1, 0.1)
      const currentAngle = divAngle * i + offsetAngle
      const x = cloudRadius * Math.cos(currentAngle)
      const z = cloudRadius * Math.sin(currentAngle)

      const y = Y_SMALL + randFloat(120, 300) * SCALE_SMALL

      const numTex = randInt(0, ASSETS_SMALL.length - 1)

      const dir = DIR[randInt(0, 1)]

      const speed = randFloat(1, 2) * SCALE_RATIO

      const texName = ASSETS_SMALL[numTex]
      const mapTex = LoaderManager.getTexture(texName.map)

      const uLight = uniform(0.1)
      const uTime = uniform(0)
      const uOpacity = uniform(1)
      const uGlobalOpacity = uniform(EnvManager.settings.alphaClouds)

      const colorFn = Fn(() => {
        const uvBase = uv()
        const uvDistorted = uvBase.add(vec2(float(0.12).mul(sin(uvBase.y.mul(2.0).add(uTime.mul(0.5)))).div(6.0), 0))
        const texSample = texture(mapTex, uvDistorted)
        return vec4(texSample.rgb.add(uLight), texSample.a.mul(0.9).mul(uOpacity).mul(uGlobalOpacity))
      })

      const material = new NodeMaterial()
      material.colorNode = colorFn()
      material.transparent = true
      material.depthWrite = false
      material.uTime = uTime
      material.uOpacity = uOpacity
      material.uGlobalOpacity = uGlobalOpacity

      const cloud = new SmallCloud({
        position: new Vector3(x, y, z),
        material,
        index: countOrder,
        dir,
        speed,
        currentAngle,
        radius: cloudRadius,
        delay: randFloat(0, 30),
      })

      const s = randFloat(4, 6) * SCALE_SMALL

      const sx = s * randFloat(1.5, 2) * SCALE_SMALL
      const sy = s * randFloat(1, 1.5) * SCALE_SMALL
      cloud.scale.set(sx, sy, s)

      this.add(cloud)

      clouds.push(cloud)

      countOrder++
    }

    return clouds
  }

  _createMesh() {
    // const mesh = new Mesh(GEOMETRY, this.#material)
    // this.add(mesh)
  }

  /**
   * Update
   */
  update({ time, delta }) {
    for (let i = 0; i < this.#clouds.length; i++) {
      const cloud = this.#clouds[i]
      cloud.update({ time, delta })

      if (cloud.mainMaterial.uGlobalOpacity) {
        cloud.mainMaterial.uGlobalOpacity.value = EnvManager.settings.alphaClouds
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
      // this.#material.uniforms.color.value = new Color(this.#settings.color)
      this.#scene.background = new Color(this.#settings.color)
    }

    const debug = this.#debug.addFolder({ title: 'Sky', expanded: true })

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
