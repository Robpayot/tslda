import OceanHeightMap from '../Ocean/OceanHeightMap'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import LoaderManager from '../../managers/LoaderManager'
import { createEntityToonMaterial } from '../../tsl-nodes/entityToon'
import { MathUtils } from 'three'
const { degToRad, randInt } = MathUtils
import { MODE } from '../../utils/constants'
import gsap from 'gsap'

export default class ShipGrey {
  #avail = []
  #mesh
  #hitbox = 35
  #hitboxTarget = 400
  constructor(scene, mode) {
    this.mode = mode
    this.#mesh = this._createMeshMat()

    if (this.mode === MODE.GAME) {
      this.#hitbox = 16
    }

    // scene.add(this.#mesh)
  }

  get mesh() {
    return this.#mesh
  }

  set avail(val) {
    this.#avail = val
  }

  _createMeshMat() {
    const gltf = LoaderManager.get('ship_grey').gltf
    const shipGroup = gltf.scene.getObjectByName('ship_grey').clone()

    let s = 0.2
    if (this.mode === MODE.GAME) {
      s = 0.18
      shipGroup.rotation.y = degToRad(-90)
    }

    shipGroup.scale.set(s, s, s)
    // shipGroup.position.y = -11
    shipGroup.name = 'ship_grey'

    shipGroup.material = createEntityToonMaterial({
      mapTexture: shipGroup.material.map,
      heightMapTexture: OceanHeightMap.heightMap.texture,
      scaleOcean: SCALE_OCEAN,
      name: 'ship_grey',
    })

    shipGroup.geometry.computeVertexNormals()

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
    mesh.hitboxTarget = this.#hitboxTarget

    this.#avail.push(mesh)

    return mesh
  }

  getAvail({ i, z, slotX, mode, gridPos }) {
    const mesh = this.#avail[0]

    if (!mesh) return null

    if (mode === MODE.EXPLORE) {
      mesh.position.x = gridPos.x
      mesh.position.z = gridPos.y
      mesh.rotation.y = randInt(-Math.PI, Math.PI)
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

  targetPlayer(mesh, playerX, playerZ) {
    if (!mesh.isTargeting) {
      mesh.isTargeting = true
      const tl = new gsap.timeline()

      // calculate angle rotation — always take the shortest path
      const rota = Math.atan2(0 - mesh.position.z, 0 + mesh.position.x) % (2 * Math.PI)
      const target = rota + degToRad(-180)
      const current = mesh.rotation.y
      let delta = target - current
      delta = ((delta % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI

      tl.to(mesh.rotation, {
        y: current + delta,
        duration: 1,
      })

      tl.to(mesh.initPos, {
        x: playerX,
        z: -playerZ,
        duration: 4,
      })

      tl.add(() => {
        mesh.isTargeting = false
      }, '+=3')
    }
  }
}
