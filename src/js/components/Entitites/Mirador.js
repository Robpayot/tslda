import { DynamicDrawUsage, InstancedMesh, Matrix4, MathUtils, Object3D } from 'three'
import { REPEAT_OCEAN } from '../Ocean'
import LoaderManager from '../../managers/LoaderManager'
import { createEntityToonMaterial } from '../../tsl-nodes/entityToon'
const { randInt } = MathUtils
import { MODE } from '../../utils/constants'

const CAPACITY = 10000
const INIT_Y = -30 // miradors sit below the ocean surface

export default class Mirador {
  #avail = []
  #mesh // non-EXPLORE: template mesh for clone-based pool
  #iMesh // EXPLORE: single InstancedMesh for all miradors
  #hitbox = 16
  #scale = 0.2
  #mode

  constructor(scene, mode) {
    this.#mode = mode
    this.#scale = mode === MODE.EXPLORE ? 5 : 0.2

    if (mode === MODE.EXPLORE) {
      this.#iMesh = this._createInstancedMesh(scene)
    } else {
      this.#mesh = this._createMeshMat()
    }
  }

  get mesh() {
    return this.#mode === MODE.EXPLORE ? this.#iMesh : this.#mesh
  }

  set avail(val) {
    this.#avail = val
  }

  _createMeshMat() {
    const gltf = LoaderManager.get('mirador').gltf
    const mirador = gltf.scene.getObjectByName('mirador').clone()

    const s = this.#scale
    mirador.scale.set(s, s, s)
    mirador.position.y = INIT_Y
    mirador.name = 'mirador'

    mirador.material = createEntityToonMaterial({
      mapTexture: mirador.material.map,
      name: 'mirador',
    })

    mirador.visible = false
    return mirador
  }

  _createInstancedMesh(scene) {
    const gltf = LoaderManager.get('mirador').gltf
    const mirador = gltf.scene.getObjectByName('mirador').clone()

    // Bake scale into the geometry so the InstancedMesh itself stays at scale=1.
    // If we set iMesh.scale = (5,5,5) instead, instance positions would also be
    // scaled (world = iMesh.matrix * instanceMatrix * vertex), misplacing them.
    const geo = mirador.geometry.clone()
    const s = this.#scale
    geo.applyMatrix4(new Matrix4().makeScale(s, s, s))
    geo.computeVertexNormals()

    const material = createEntityToonMaterial({
      mapTexture: mirador.material.map,
      name: 'mirador',
    })

    const iMesh = new InstancedMesh(geo, material, CAPACITY)
    iMesh.name = 'mirador'
    iMesh.instanceMatrix.setUsage(DynamicDrawUsage)

    // Hide every slot initially by placing the dummy far below the scene
    const hideDummy = new Object3D()
    hideDummy.position.set(0, -9999, 0)
    hideDummy.updateMatrix()
    for (let i = 0; i < CAPACITY; i++) {
      iMesh.setMatrixAt(i, hideDummy.matrix)
    }
    iMesh.instanceMatrix.needsUpdate = true

    scene.add(iMesh)
    return iMesh
  }

  // Build a lightweight abstract that wraps a dummy Object3D.
  // abstract.position returns dummy.position directly (same Vector3 reference),
  // so ExploreManager's `object.position.x = ...` mutates the dummy in-place.
  // Call abstract._syncMatrix() after any position/rotation change to push the
  // updated transform to the InstancedMesh.
  _createAbstract(instanceId) {
    const iMesh = this.#iMesh
    const dummy = new Object3D()
    dummy.position.set(0, -9999, 0)
    dummy.updateMatrix()

    const abstract = {
      dummy,
      instanceId,
      name: 'mirador',
      // position is the dummy's Vector3 — mutations go straight to the dummy
      get position() {
        return dummy.position
      },
      initPos: { x: 0, y: INIT_Y, z: 0 },
      visible: false,
      canVisible: false,
      collision: false,
      hitbox: this.#hitbox,
      _syncMatrix() {
        dummy.updateMatrix()
        iMesh.setMatrixAt(instanceId, dummy.matrix)
        iMesh.instanceMatrix.needsUpdate = true
      },
    }
    return abstract
  }

  add(rangeX, rangeXMarge, zIncr = 0) {
    this.rangeX = rangeX
    this.rangeXMarge = rangeXMarge
    this.zIncr = zIncr

    if (this.#mode === MODE.EXPLORE) {
      // Build abstract pool; InstancedMesh is already in the scene from the constructor
      const instanceId = this.#avail.length
      const abstract = this._createAbstract(instanceId)
      this.#avail.push(abstract)
      return abstract
    }

    // non-EXPLORE: clone-based (unchanged)
    const mesh = this.#mesh.clone()
    mesh.hitbox = this.#hitbox
    this.#avail.push(mesh)
    return mesh
  }

  getAvail({ i, z, slotX, mode, gridPos }) {
    if (mode === MODE.EXPLORE) {
      const abstract = this.#avail[0]
      if (!abstract) return null

      abstract.dummy.position.set(gridPos.x, INIT_Y, gridPos.y)
      abstract.initPos.x = gridPos.x
      abstract.initPos.y = INIT_Y
      abstract.initPos.z = gridPos.y
      abstract._syncMatrix()

      this.#avail.shift()
      return abstract
    }

    // non-EXPLORE: clone-based (unchanged)
    const mesh = this.#avail[0]
    if (!mesh) return null

    const posXChoice = [(-this.rangeX * REPEAT_OCEAN) / 2.5, 0, (this.rangeX * REPEAT_OCEAN) / 2.5]
    mesh.slotX = slotX || randInt(0, 2)
    mesh.position.x = posXChoice[mesh.slotX]
    mesh.position.z = z || -i * this.zIncr - this.zIncr
    mesh.initPos = mesh.position.clone()
    this.#avail.shift()
    return mesh
  }

  free(abstract) {
    if (this.#mode === MODE.EXPLORE) {
      // Move the dummy far out of view — this is the Items.js hiding pattern
      abstract.dummy.position.set(0, -9999, 0)
      abstract._syncMatrix()
      this.#avail.push(abstract)
      return
    }
    this.#avail.push(abstract)
  }
}
