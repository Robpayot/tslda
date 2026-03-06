import {
  InstancedMesh,
  PlaneGeometry,
  InstancedBufferAttribute,
} from 'three'
import { SpriteNodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
  vec2,
  vec4,
  texture,
  uv,
  attribute,
  instanceIndex,
  smoothstep,
  select,
  hash,
} from 'three/tsl'
import { MathUtils } from 'three'
const { randFloat } = MathUtils
import { gsap } from 'gsap'
import GridManager from '../../managers/GridManager'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import EnvManager from '../../managers/EnvManager'
import LoaderManager from '../../managers/LoaderManager'

const NB_POINTS = 10
const RANGE_MAX = 3000
const RANGE_MIN = 2500
const SPRITE_SCALE = 266

export default class Lightnings {
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
    let angle = 0
    const positionArray = []

    for (let i = 0; i < NB_POINTS; i++) {
      const radius = randFloat(RANGE_MIN, RANGE_MAX)
      angle += 0.4
      const x = radius * Math.cos(angle)
      const z = radius * Math.sin(angle)
      positionArray.push(x, 0, z)
    }

    const count = NB_POINTS
    const planeGeo = new PlaneGeometry(1, 1)
    planeGeo.setAttribute(
      'instancePosition',
      new InstancedBufferAttribute(new Float32Array(positionArray), 3)
    )

    const lightningAsset = LoaderManager.get('lightning')
    const mapTexture = LoaderManager.getTexture('lightning')
    const texSource = lightningAsset?.texture?.source?.data
    const textureW = texSource?.naturalWidth ?? 1
    const textureH = texSource?.naturalHeight ?? 1
    if (lightningAsset?.texture) lightningAsset.texture.flipY = false

    const uTime = uniform(0)
    const uRatioTexture = uniform(textureH / textureW)
    const uOpacity = uniform(1)
    const uGlobalOpacity = uniform(EnvManager.settingsOcean.alphaLightnings)

    const aPosition = attribute('instancePosition', 'vec3')

    const material = new SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
    })

    material.scaleNode = float(SPRITE_SCALE)
    material.positionNode = aPosition

    const colorFn = Fn(() => {
      const uvBase = uv()
      const flippedY = float(1).sub(uvBase.y)

      const idx = float(instanceIndex)
      const offsetVal = hash(idx).mul(100.0)
      const speedVal = hash(idx.add(100.0)).mul(0.5).add(1.0)
      const scaleVal = hash(idx.add(200.0)).mul(0.5)

      const progressAlpha = uTime.mul(0.2).mul(speedVal).add(offsetVal).sin().mul(2.0)
      const alpha = float(1).sub(progressAlpha)

      const ratioUV = uRatioTexture
      const uvY = flippedY.mul(float(1).sub(scaleVal))
      const uvX = uvBase.x.mul(ratioUV)
      const flipped = select(offsetVal.greaterThan(50.0), ratioUV.sub(uvX), uvX)
      const uvSampler = vec2(flipped, uvY)

      const tex = texture(mapTexture, uvSampler)

      const finalAlpha = tex.a
        .mul(alpha)
        .mul(smoothstep(float(0.4), float(1.0), tex.r))
        .mul(uOpacity)
        .mul(uGlobalOpacity)

      return vec4(tex.rgb, finalAlpha)
    })
    material.colorNode = colorFn()

    material.uTime = uTime
    material.uRatioTexture = uRatioTexture
    material.uOpacity = uOpacity
    material.uGlobalOpacity = uGlobalOpacity

    const mesh = new InstancedMesh(planeGeo, material, count)

    mesh.position.y = randFloat(60, 100)
    mesh.initPos = mesh.position.clone()
    mesh.frustumCulled = false

    return mesh
  }
}
