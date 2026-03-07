import { Color } from 'three'
import OceanHeightMap from '../Ocean/OceanHeightMap'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import LoaderManager from '../../managers/LoaderManager'
import { createEntityToonMaterial } from '../../tsl-nodes/entityToon'
import { MathUtils } from 'three'
const { randInt } = MathUtils

import DATA_RUPEES from '../../data/rupees_score.json'
import { MODE } from '../../utils/constants'

export default class Rupees {
  #materials = []
  #avail = []
  #mesh
  #hitbox = 10
  #baseY
  #scale
  constructor(scene, mode) {
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
    this._createMaterials()

    this.#mesh = this._createMesh()
    // scene.add(this.#mesh)
  }

  get mesh() {
    return this.#mesh
  }

  get materials() {
    return this.#materials
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

    const colors = [
      new Color(0, 0.314, 0),
      new Color('#365ad3'),
      new Color('#bfc84e'),
      new Color('#f54c4b'),
      new Color('#8561ab'),
      new Color('#ed7f21'),
      new Color('#f0f0f0'),
    ]

    for (const color of colors) {
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

  add(rangeX, zIncr) {
    this.rangeX = rangeX
    this.zIncr = zIncr
    const mesh = this.#mesh.clone()
    mesh.rotation.y = randInt(0, 2 * Math.PI)
    mesh.hitbox = this.#hitbox

    mesh.geometry.computeVertexNormals() // fix normals bug from model

    mesh.initPos = mesh.position.clone()

    this.#avail.push(mesh)

    return mesh
  }

  getAvail({ i, z, slotX, mat = 0, mode, gridPos }) {
    const mesh = this.#avail[0]

    if (!mesh) return null

    if (mode === MODE.EXPLORE) {
      mesh.position.x = gridPos.x
      mesh.position.z = gridPos.y
    } else {
      const posXChoice = [(-this.rangeX * REPEAT_OCEAN) / 2.5, 0, (this.rangeX * REPEAT_OCEAN) / 2.5]
      mesh.slotX = slotX || randInt(0, 2)

      mesh.position.x = posXChoice[mesh.slotX]
      mesh.position.z = z || -i * this.zIncr - this.zIncr
    }

    mesh.rotation.y = randInt(0, 2 * Math.PI)

    mesh.material = this.#materials[mat]
    mesh.score = DATA_RUPEES[mat]

    mesh.initPos = mesh.position.clone()

    // remove from array
    this.#avail.shift()

    return mesh
  }

  free(mesh) {
    this.#avail.push(mesh)
  }
}
