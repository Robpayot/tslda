import { Float32BufferAttribute, Points } from 'three'
import { NodeMaterial } from 'three/webgpu'
import { BufferGeometry } from 'three'

import {
  Fn,
  attribute,
  varying,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  sin,
  texture,
  uv,
  positionLocal,
  positionView,
  If,
  Discard,
} from 'three/tsl'
import { MathUtils } from 'three'
const { randFloatSpread, randFloat } = MathUtils
import LoaderManager from '../../managers/LoaderManager'
import { gsap } from 'gsap'
import GridManager from '../../managers/GridManager'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import EnvManager from '../../managers/EnvManager'
// import OceanHeightMap from '../Ocean/OceanHeightMap' // RenderTarget: uncomment when heightmap in vertex is supported

const NB_POINTS = 300
const RANGE = 1200
export default class Waves {
  #geo
  #mesh
  #material
  #index
  constructor() {
    this.#geo
    this.#material = this._createMaterial()
    this.#mesh = this._createMesh()

    this.tlReset = new gsap.timeline({ repeat: -1, repeatDelay: 5 })
    this.tlReset.to(this.material.uOpacity, {
      value: 0,
      duration: 0.8,
    })
    this.tlReset.add(() => {
      this.mesh.initPos.x = GridManager.offsetUV.x * (SCALE_OCEAN / REPEAT_OCEAN)
      this.mesh.initPos.z = -GridManager.offsetUV.y * (SCALE_OCEAN / REPEAT_OCEAN)
    })
    this.tlReset.to(this.material.uOpacity, {
      value: 1,
      duration: 0.8,
    })
  }

  get mesh() {
    return this.#mesh
  }

  get material() {
    return this.#material
  }

  _createMaterial() {
    const waveAsset = LoaderManager.get('wave')
    const mapTexture = LoaderManager.getTexture('wave')
    const texSource = waveAsset?.texture?.source?.data
    const textureW = texSource?.naturalWidth ?? 1
    const textureH = texSource?.naturalHeight ?? 1
    if (waveAsset?.texture) waveAsset.texture.flipY = false

    const uTime = uniform(0)
    const uSize = uniform(450)
    const uRatioTexture = uniform(textureH / textureW)
    const uOpacity = uniform(1)
    const uGlobalOpacity = uniform(EnvManager.settingsOcean.alphaWaves)

    const offsetAttr = attribute('offset', 'float')
    const speedAttr = attribute('speed', 'float')

    const vProgress = varying(
      sin(uTime.mul(0.1).mul(speedAttr).add(offsetAttr)),
      'vProgress'
    )
    const vProgressAlpha = varying(
      sin(uTime.mul(0.1).add(offsetAttr)),
      'vProgressAlpha'
    )

    // Vertex: optional heightmap displacement (commented – RenderTarget; uncomment when supported)
    // const heightMapTex = OceanHeightMap.heightMap?.texture
    // const uvGrid = vec2(0.5.add(positionWorld.x.div(scaleOcean)), 0.5.sub(positionWorld.z.div(scaleOcean)))
    // const heightMapPos = texture(heightMapTex, uvGrid)
    // ... 5-tap average and gl_Position.y += (avgH - 0.5) * 2. * (heightMapPos.b * 100.) * 2.
    const displacement = float(0)
    const positionNodeFn = Fn(() => positionLocal.add(vec3(float(0), displacement, float(0))))

    const sizeNodeFn = Fn(() => {
      const base = float(100).div(positionView.z.negate())
      return uSize.mul(float(1).add(vProgress.mul(0.2))).mul(base)
    })

    const colorFn = Fn(() => {
      // pointUV (gl_PointCoord) is WebGL-only; WebGPU uses uv() for Points
      const uvBase = uv()
      const alpha = float(1).sub(vProgressAlpha)
      const ratioUV = uRatioTexture.mul(float(0.5).add(vProgress.mul(0.5)))
      const uvY = uvBase.y.add(ratioUV.mul(0.5).sub(0.5)).div(ratioUV)
      const uvSampler = vec2(uvBase.x, uvY)
      const tex = texture(mapTexture, uvSampler)

      If(tex.r.lessThan(0.5), () => {
        Discard()
      })

      const finalAlpha = tex.a.mul(alpha).mul(uOpacity).mul(uGlobalOpacity)
      return vec4(tex.rgb, finalAlpha)
    })

    const material = new NodeMaterial()
    material.positionNode = positionNodeFn()
    material.sizeNode = sizeNodeFn()
    material.colorNode = colorFn()
    material.transparent = true

    material.uTime = uTime
    material.uSize = uSize
    material.uRatioTexture = uRatioTexture
    material.uOpacity = uOpacity
    material.uGlobalOpacity = uGlobalOpacity

    return material
  }

  _createMesh() {
    const vertices = []
    const offsets = []
    const speeds = []

    for (let i = 0; i < NB_POINTS; i++) {
      const x = randFloatSpread(RANGE)
      const y = 0
      const z = randFloatSpread(RANGE)

      vertices.push(x, y, z)

      const offset = randFloat(0, 100)
      offsets.push(offset)

      const speed = randFloat(1, 1.5)
      speeds.push(speed)
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('offset', new Float32BufferAttribute(offsets, 1))
    geometry.setAttribute('speed', new Float32BufferAttribute(speeds, 1))
    let mesh = new Points(geometry, this.#material)
    mesh.position.y = 4

    mesh.initPos = mesh.position.clone()

    return mesh
  }
}
