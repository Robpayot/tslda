import { Color, InstancedMesh, MathUtils, Matrix4, Object3D } from 'three'
import { StorageInstancedBufferAttribute } from 'three/webgpu'
import OceanHeightMap from '../Ocean/OceanHeightMap'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import LoaderManager from '../../managers/LoaderManager'
import { createEntityToonMaterial } from '../../tsl-nodes/entityToon'
const { randInt } = MathUtils

import DATA_RUPEES from '../../data/rupees_score.json'
import { MODE } from '../../utils/constants'

const RUPEE_COLORS = [
  new Color(0, 0.314, 0),
  new Color('#365ad3'),
  new Color('#bfc84e'),
  new Color('#f54c4b'),
  new Color('#8561ab'),
  new Color('#ed7f21'),
  new Color('#f0f0f0'),
]

export default class Rupees {
  #materials = []
  #avail = []
  #mesh // non-EXPLORE: template mesh for clone-based pool
  #iMesh // EXPLORE: single InstancedMesh
  #hitbox = 10
  #baseY
  #scale
  #mode
  #capacity = 500

  constructor(scene, mode) {
    this.#mode = mode
    if (mode === 'treasure') {
      this.#baseY = 2
      this.#scale = 0.014
    } else if (mode === MODE.EXPLORE) {
      this.#baseY = 7
      this.#hitbox = 10
      this.#scale = 0.16
    } else {
      this.#baseY = 14
      this.#scale = 0.2
    }

    // Always create materials and template mesh — BarrelRupees clones rupee.mesh
    // regardless of mode, so #mesh must always be a real Three.js Object3D.
    this._createMaterials()
    this.#mesh = this._createMesh()

    if (mode === MODE.EXPLORE) {
      this.#iMesh = this._createInstancedMesh(scene)
    }
  }

  get mesh() {
    return this.#mesh
  }

  get materials() {
    if (this.#mode === MODE.EXPLORE && this.#iMesh) {
      return [...this.#materials, this.#iMesh.material]
    }
    return this.#materials
  }

  get capacity() {
    return this.#capacity
  }

  set avail(val) {
    this.#avail = val
  }

  _createMaterials() {
    const heightMapTexture = OceanHeightMap.heightMap?.texture
    const opts = {
      heightMapTexture,
      scaleOcean: SCALE_OCEAN,
      smoothstepMax: 0.8,
      ambientMul: 0.5,
      name: 'rupee',
    }

    for (const color of RUPEE_COLORS) {
      this.#materials.push(createEntityToonMaterial({ ...opts, tintColor: color }))
    }
  }

  _createMesh() {
    const gltf = LoaderManager.get('rupee').gltf
    const rupeeMesh = gltf.scene.getObjectByName('rupee').clone()
    rupeeMesh.name = 'rupee'

    const s = this.#scale
    rupeeMesh.material = this.#materials[0]
    rupeeMesh.position.y = this.#baseY
    rupeeMesh.scale.set(s, s, s)

    rupeeMesh.initPos = rupeeMesh.position.clone()

    rupeeMesh.visible = false
    rupeeMesh.canVisible = false

    return rupeeMesh
  }

  _createInstancedMesh(scene) {
    const gltf = LoaderManager.get('rupee').gltf
    const rupeeMesh = gltf.scene.getObjectByName('rupee').clone()

    const geo = rupeeMesh.geometry.clone()
    const s = this.#scale
    geo.applyMatrix4(new Matrix4().makeScale(s, s, s))
    geo.computeVertexNormals()

    const material = createEntityToonMaterial({
      useInstanceColor: true,
      heightMapTexture: OceanHeightMap.heightMap?.texture,
      scaleOcean: SCALE_OCEAN,
      smoothstepMax: 0.8,
      ambientMul: 0.5,
      name: 'rupee',
      isInstanced: true,
    })

    const iMesh = new InstancedMesh(geo, material, this.#capacity)
    iMesh.name = 'rupee'
    iMesh.instanceMatrix = new StorageInstancedBufferAttribute(iMesh.instanceMatrix.array, 16)
    iMesh.frustumCulled = false

    const hideDummy = new Object3D()
    hideDummy.position.set(0, -9999, 0)
    hideDummy.updateMatrix()
    for (let i = 0; i < this.#capacity; i++) {
      iMesh.setMatrixAt(i, hideDummy.matrix)
      iMesh.setColorAt(i, RUPEE_COLORS[0])
    }
    iMesh.instanceMatrix.needsUpdate = true
    iMesh.instanceColor.needsUpdate = true

    scene.add(iMesh)
    return iMesh
  }

  _createAbstract(instanceId) {
    const iMesh = this.#iMesh
    const baseY = this.#baseY
    const dummy = new Object3D()
    dummy.position.set(0, -9999, 0)
    dummy.updateMatrix()

    return {
      dummy,
      instanceId,
      name: 'rupee',
      get position() {
        return dummy.position
      },
      get rotation() {
        return dummy.rotation
      },
      initPos: { x: 0, y: baseY, z: 0 },
      visible: false,
      canVisible: false,
      collision: false,
      hitbox: this.#hitbox,
      score: 0,
      _syncMatrix() {
        dummy.updateMatrix()
        iMesh.setMatrixAt(instanceId, dummy.matrix)
        iMesh.instanceMatrix.needsUpdate = true
      },
      _setColor(color) {
        iMesh.setColorAt(instanceId, color)
        if (iMesh.instanceColor) iMesh.instanceColor.needsUpdate = true
      },
    }
  }

  add(rangeX, zIncr) {
    this.rangeX = rangeX
    this.zIncr = zIncr

    if (this.#mode === MODE.EXPLORE) {
      const instanceId = this.#avail.length
      const abstract = this._createAbstract(instanceId)
      this.#avail.push(abstract)
      return abstract
    }

    const mesh = this.#mesh.clone()
    mesh.rotation.y = randInt(0, 2 * Math.PI)
    mesh.hitbox = this.#hitbox
    mesh.geometry.computeVertexNormals()
    mesh.initPos = mesh.position.clone()
    this.#avail.push(mesh)
    return mesh
  }

  getAvail({ i, z, slotX, mat = 0, mode, gridPos }) {
    if (mode === MODE.EXPLORE) {
      const abstract = this.#avail[0]
      if (!abstract) return null

      abstract.dummy.position.set(gridPos.x, this.#baseY, gridPos.y)
      abstract.dummy.rotation.y = randInt(0, 2 * Math.PI)
      abstract.initPos.x = gridPos.x
      abstract.initPos.y = this.#baseY
      abstract.initPos.z = gridPos.y
      abstract.score = DATA_RUPEES[mat]
      abstract._setColor(RUPEE_COLORS[mat])
      abstract._syncMatrix()

      this.#avail.shift()
      return abstract
    }

    const mesh = this.#avail[0]
    if (!mesh) return null

    const posXChoice = [(-this.rangeX * REPEAT_OCEAN) / 2.5, 0, (this.rangeX * REPEAT_OCEAN) / 2.5]
    mesh.slotX = slotX || randInt(0, 2)
    mesh.position.x = posXChoice[mesh.slotX]
    mesh.position.z = z || -i * this.zIncr - this.zIncr
    mesh.rotation.y = randInt(0, 2 * Math.PI)
    mesh.material = this.#materials[mat]
    mesh.score = DATA_RUPEES[mat]
    mesh.initPos = mesh.position.clone()
    this.#avail.shift()
    return mesh
  }

  free(abstract) {
    if (this.#mode === MODE.EXPLORE) {
      abstract.dummy.position.set(0, -9999, 0)
      abstract._syncMatrix()
      this.#avail.push(abstract)
      return
    }
    this.#avail.push(abstract)
  }
}
