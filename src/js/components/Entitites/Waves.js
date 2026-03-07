import {
  InstancedBufferAttribute,
  PlaneGeometry,
  InstancedMesh,
  Vector3,
} from 'three'
import { SpriteNodeMaterial } from 'three/webgpu'
import {
  Fn,
  varying,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  sin,
  texture,
  uv,
  attribute,
  If,
  Discard,
} from 'three/tsl'
import { MathUtils } from 'three'
const { randFloatSpread, randFloat } = MathUtils
import { gsap } from 'gsap'
import GridManager from '../../managers/GridManager'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import EnvManager from '../../managers/EnvManager'
import LoaderManager from '../../managers/LoaderManager'
import OceanHeightMap from '../Ocean/OceanHeightMap'

const NB_POINTS = 300
const RANGE = 1200
const SPRITE_SCALE = 25

export default class Waves {
  #mesh
  #material
  constructor() {
    this.#mesh = this._createMesh()
    this.#material = this.#mesh.material

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

  /** No-op: SpriteNodeMaterial handles billboarding. Kept for ExploreManager API. */
  billboardToCamera() {}

  _createMesh() {
    const positionArray = []
    const offsets = []
    const speeds = []

    for (let i = 0; i < NB_POINTS; i++) {
      positionArray.push(randFloatSpread(RANGE), 0, randFloatSpread(RANGE))
      offsets.push(randFloat(0, 100))
      speeds.push(randFloat(1, 1.5))
    }

    const count = NB_POINTS
    const planeGeo = new PlaneGeometry(1, 1)
    planeGeo.setAttribute(
      'instancePosition',
      new InstancedBufferAttribute(new Float32Array(positionArray), 3)
    )
    planeGeo.setAttribute(
      'offset',
      new InstancedBufferAttribute(new Float32Array(offsets), 1)
    )
    planeGeo.setAttribute(
      'speed',
      new InstancedBufferAttribute(new Float32Array(speeds), 1)
    )

    const waveAsset = LoaderManager.get('wave')
    const mapTexture = LoaderManager.getTexture('wave')
    const texSource = waveAsset?.texture?.source?.data
    const textureH = texSource?.naturalHeight ?? 1
    const textureW = texSource?.naturalWidth ?? 1
    if (waveAsset?.texture) waveAsset.texture.flipY = false

    const heightMapTex = OceanHeightMap.heightMap?.texture
    const uScaleOcean = uniform(SCALE_OCEAN)
    const uTime = uniform(0)
    const uRatioTexture = uniform(textureH / textureW)
    const uOpacity = uniform(1)
    const uGlobalOpacity = uniform(EnvManager.settingsOcean.alphaWaves)
    const uMeshPosition = uniform(new Vector3(0, 4, 0))

    const aPosition = attribute('instancePosition', 'vec3')
    const aOffset = attribute('offset', 'float')
    const aSpeed = attribute('speed', 'float')

    const material = new SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
    })

    material.scaleNode = float(SPRITE_SCALE)

    // Position: instance position + Y displacement from ocean heightmap at world XZ
    const positionNodeFn = Fn(() => {
      const worldX = uMeshPosition.x.add(aPosition.x)
      const worldZ = uMeshPosition.z.add(aPosition.z)
      const uvGrid = vec2(
        float(0.5).add(worldX.div(uScaleOcean)),
        float(0.5).add(worldZ.div(uScaleOcean))
      )
      const off = float(0.01)
      const hmC = texture(heightMapTex, uvGrid)
      const hm1A = texture(heightMapTex, vec2(uvGrid.x.add(off), uvGrid.y))
      const hm1B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.add(off)))
      const hm2A = texture(heightMapTex, vec2(uvGrid.x.sub(off), uvGrid.y))
      const hm2B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.sub(off)))
      const avgH = hmC.r.add(hm1A.r).add(hm1B.r).add(hm2A.r).add(hm2B.r).div(5.0)
      const disp = avgH.sub(0.5).mul(2.0).mul(hmC.b.mul(100.0))
      return aPosition.add(vec3(0.0, disp, 0.0))
    })
    material.positionNode = positionNodeFn()

    const vProgress = varying(
      sin(uTime.mul(0.1).mul(aSpeed).add(aOffset.mul(0.33))),
      'vProgress'
    )
    const vProgressAlpha = varying(
      sin(uTime.mul(0.1).add(aOffset)),
      'vProgressAlpha'
    )

    const colorFn = Fn(() => {
      const uvBase = uv()
      const flippedY = float(1).sub(uvBase.y)
      const alpha = float(1).sub(vProgressAlpha)
      const ratioUV = uRatioTexture.mul(float(0.5).add(vProgress.mul(0.5)))
      const uvY = flippedY.add(ratioUV.div(2.0).sub(0.5)).div(ratioUV)
      const uvSampler = vec2(uvBase.x, uvY)
      const tex = texture(mapTexture, uvSampler)

      If(tex.r.lessThan(0.5), () => {
        Discard()
      })

      return vec4(tex.rgb, tex.a.mul(alpha).mul(uOpacity).mul(uGlobalOpacity))
    })
    material.colorNode = colorFn()

    material.uTime = uTime
    material.uRatioTexture = uRatioTexture
    material.uOpacity = uOpacity
    material.uGlobalOpacity = uGlobalOpacity
    material.uMeshPosition = uMeshPosition
    material.uScaleOcean = uScaleOcean

    const mesh = new InstancedMesh(planeGeo, material, count)

    mesh.position.y = 4
    mesh.initPos = mesh.position.clone()
    mesh.frustumCulled = false

    return mesh
  }
}
