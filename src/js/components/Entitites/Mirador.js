import { REPEAT_OCEAN } from '../Ocean'
import LoaderManager from '../../managers/LoaderManager'
import { createEntityToonMaterial } from '../../tsl-nodes/entityToon'
import { MathUtils } from 'three'
const { randInt } = MathUtils
import { MODE } from '../../utils/constants'

export default class Mirador {
  #avail = []
  #mesh
  #hitbox = 16
  #scale = 0.2
  constructor(scene, mode) {
    if (mode === MODE.EXPLORE) {
      this.#scale = 5
    } else {
      this.#scale = 0.2
    }

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
    const gltf = LoaderManager.get('mirador').gltf
    const mirador = gltf.scene.getObjectByName('mirador').clone()

    const s = this.#scale
    mirador.scale.set(s, s, s)
    mirador.position.y = -30
    mirador.name = 'mirador'

    mirador.material = createEntityToonMaterial({
      mapTexture: mirador.material.map,
      name: 'mirador',
    })

    mirador.visible = false

    return mirador
  }

  add(rangeX, rangeXMarge, zIncr = 0) {
    this.rangeX = rangeX
    this.rangeXMarge = rangeXMarge
    this.zIncr = zIncr

    const mesh = this.#mesh.clone()
    mesh.hitbox = this.#hitbox

    this.#avail.push(mesh)

    return mesh
  }

  getAvail({ i, z, slotX, mode, gridPos }) {
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

    mesh.initPos = mesh.position.clone()
    // remove from array
    this.#avail.shift()

    return mesh
  }

  free(mesh) {
    this.#avail.push(mesh)
  }
}
