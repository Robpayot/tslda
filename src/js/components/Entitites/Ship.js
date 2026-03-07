import OceanHeightMap from '../Ocean/OceanHeightMap'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import LoaderManager from '../../managers/LoaderManager'
import { createEntityToonMaterial } from '../../tsl-nodes/entityToon'
import { MathUtils } from 'three'
const { degToRad, randInt } = MathUtils

export default class Ship {
  #avail = []
  #mesh
  #hitbox = 16
  constructor(scene) {
    this.#mesh = this._createMeshMat()

    // scene.add(this.#mesh)
  }

  get mesh() {
    return this.#mesh
  }

  set avail(val) {
    this.#avail = val
  }

  _createMeshMat() {
    const gltf = LoaderManager.get('ship').gltf
    const shipGroup = gltf.scene

    const s = 0.31
    shipGroup.scale.set(s, s, s)
    shipGroup.rotation.y = degToRad(90)
    // shipGroup.position.y = -11
    shipGroup.name = 'ship'

    const mesh1 = shipGroup.children[0]
    mesh1.material = createEntityToonMaterial({
      mapTexture: mesh1.material.map,
      heightMapTexture: OceanHeightMap.heightMap.texture,
      scaleOcean: SCALE_OCEAN,
      name: 'ship',
    })
    mesh1.geometry.computeVertexNormals()

    const mesh2 = shipGroup.children[1]
    mesh2.material = createEntityToonMaterial({
      mapTexture: mesh2.material.map,
      heightMapTexture: OceanHeightMap.heightMap.texture,
      scaleOcean: SCALE_OCEAN,
      name: 'ship',
    })
    mesh2.geometry.computeVertexNormals()

    shipGroup.visible = false
    shipGroup.canVisible = false

    return shipGroup
  }

  add(rangeX, rangeXMarge, zIncr) {
    this.rangeX = rangeX
    this.rangeXMarge = rangeXMarge
    this.zIncr = zIncr

    const mesh = this.#mesh.clone()
    mesh.hitbox = this.#hitbox

    this.#avail.push(mesh)

    return mesh
  }

  getAvail({ i, z, slotX }) {
    const mesh = this.#avail[0]

    if (!mesh) return null

    const posXChoice = [(-this.rangeX * REPEAT_OCEAN) / 2.5, 0, (this.rangeX * REPEAT_OCEAN) / 2.5]
    mesh.slotX = slotX || randInt(0, 2)

    mesh.position.x = posXChoice[mesh.slotX]
    mesh.position.z = z || -i * this.zIncr - this.zIncr

    mesh.initPos = mesh.position.clone()
    // remove from array
    this.#avail.shift()

    return mesh
  }

  free(mesh) {
    this.#avail.push(mesh)
  }
}
