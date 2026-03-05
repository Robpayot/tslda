import { Matrix4, PlaneGeometry, InstancedMesh, DoubleSide, Vector3 } from 'three'
import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  uniform,
  float,
  vec2,
  vec4,
  texture,
  uv,
  instanceIndex,
  smoothstep,
  select,
} from 'three/tsl'
import LoaderManager from '../../managers/LoaderManager'
import { MathUtils } from 'three'
const { randFloat } = MathUtils
import { gsap } from 'gsap'
import GridManager from '../../managers/GridManager'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import EnvManager from '../../managers/EnvManager'

const NB_POINTS = 10
const RANGE_MAX = 3000
const RANGE_MIN = 2500
const SPRITE_SCALE = 40

export default class Lightnings {
  #mesh
  #material
  constructor() {
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

    const colorFn = Fn(() => {
      const uvBase = uv()

      // Per-instance values from instanceIndex (replaces per-vertex attributes)
      const idx = float(instanceIndex)
      const offsetVal = idx.mul(10.0)
      const scaleVal = idx.mul(0.04)

      // vProgressAlpha equivalent: sin(uTime * 0.2 + offset) * 2
      const progressAlpha = idx.mul(10.0).add(uTime.mul(0.2)).sin().mul(2.0)
      const alpha = float(1).sub(progressAlpha)

      const ratioUV = uRatioTexture

      // UV manipulation matching original GLSL
      const uvY = uvBase.y.mul(float(1).sub(scaleVal))
      const uvX = uvBase.x.mul(ratioUV)

      // Mirror X if offset > 50 (half the instances get flipped)
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

    const material = new NodeMaterial()
    material.colorNode = colorFn()
    material.side = DoubleSide
    material.transparent = true
    material.depthWrite = false

    material.uTime = uTime
    material.uRatioTexture = uRatioTexture
    material.uOpacity = uOpacity
    material.uGlobalOpacity = uGlobalOpacity

    return material
  }

  _createMesh() {
    let angle = 0
    const planeGeo = new PlaneGeometry(1, 1)
    const mesh = new InstancedMesh(planeGeo, this.#material, NB_POINTS)
    const matrix = new Matrix4()

    for (let i = 0; i < NB_POINTS; i++) {
      const radius = randFloat(RANGE_MIN, RANGE_MAX)
      angle += 0.4
      const x = radius * Math.cos(angle)
      const z = radius * Math.sin(angle)

      matrix.identity()
      matrix.setPosition(x, 0, z)
      matrix.scale(new Vector3(SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE))
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    mesh.position.y = randFloat(60, 100)
    mesh.initPos = mesh.position.clone()
    mesh.frustumCulled = false

    return mesh
  }
}
