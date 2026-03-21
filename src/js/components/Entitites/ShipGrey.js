import { InstancedMesh, Matrix4, MathUtils, Object3D } from 'three'
import { StorageInstancedBufferAttribute } from 'three/webgpu'
import OceanHeightMap from '../Ocean/OceanHeightMap'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import LoaderManager from '../../managers/LoaderManager'
import { createEntityToonMaterial } from '../../tsl-nodes/entityToon'
const { degToRad, randInt } = MathUtils
import { MODE } from '../../utils/constants'
import gsap from 'gsap'

export default class ShipGrey {
  #avail = []
  #mesh // non-EXPLORE: template mesh for clone-based pool
  #iMesh // EXPLORE: single InstancedMesh for all ships
  #hitbox = 35
  #hitboxTarget = 400
  #mode
  #capacity = 200

  constructor(scene, mode) {
    this.#mode = mode

    if (mode === MODE.GAME) {
      this.#hitbox = 16
    }

    if (mode === MODE.EXPLORE) {
      this.#iMesh = this._createInstancedMesh(scene)
    } else {
      this.#mesh = this._createMeshMat()
    }
  }

  get mesh() {
    return this.#mode === MODE.EXPLORE ? this.#iMesh : this.#mesh
  }

  get capacity() {
    return this.#capacity
  }

  set avail(val) {
    this.#avail = val
  }

  _createMeshMat() {
    const gltf = LoaderManager.get('ship_grey').gltf
    const shipGroup = gltf.scene.getObjectByName('ship_grey').clone()

    let s = 0.2
    if (this.#mode === MODE.GAME) {
      s = 0.18
      shipGroup.rotation.y = degToRad(-90)
    }

    shipGroup.scale.set(s, s, s)
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

  _createInstancedMesh(scene) {
    const gltf = LoaderManager.get('ship_grey').gltf
    const shipGroup = gltf.scene.getObjectByName('ship_grey').clone()

    // Bake scale into geometry so instance world-space positions aren't affected
    // (iMesh.matrixWorld * instanceMatrix * vertex — scale on iMesh would also scale positions)
    const geo = shipGroup.geometry.clone()
    geo.applyMatrix4(new Matrix4().makeScale(0.2, 0.2, 0.2))
    geo.computeVertexNormals()

    const material = createEntityToonMaterial({
      mapTexture: shipGroup.material.map,
      heightMapTexture: OceanHeightMap.heightMap.texture,
      scaleOcean: SCALE_OCEAN,
      name: 'ship_grey',
      isInstanced: true,
    })

    const iMesh = new InstancedMesh(geo, material, this.#capacity)
    iMesh.name = 'ship_grey'
    iMesh.instanceMatrix = new StorageInstancedBufferAttribute(iMesh.instanceMatrix.array, 16)
    iMesh.frustumCulled = false

    const hideDummy = new Object3D()
    hideDummy.position.set(0, -9999, 0)
    hideDummy.updateMatrix()
    for (let i = 0; i < this.#capacity; i++) {
      iMesh.setMatrixAt(i, hideDummy.matrix)
    }
    iMesh.instanceMatrix.needsUpdate = true

    scene.add(iMesh)
    return iMesh
  }

  // abstract.position / abstract.rotation return dummy's Vector3 / Euler directly,
  // so ExploreManager's `object.position.x = ...` and GSAP tweens on `mesh.rotation`
  // both mutate the dummy in-place. _syncMatrix() pushes the updated transform to the mesh.
  _createAbstract(instanceId) {
    const iMesh = this.#iMesh
    const dummy = new Object3D()
    dummy.position.set(0, -9999, 0)
    dummy.updateMatrix()

    const abstract = {
      dummy,
      instanceId,
      name: 'ship_grey',
      get position() {
        return dummy.position
      },
      get rotation() {
        return dummy.rotation
      },
      initPos: { x: 0, y: 0, z: 0 },
      visible: false,
      canVisible: false,
      collision: false,
      hitbox: this.#hitbox,
      hitboxTarget: this.#hitboxTarget,
      isTargeting: false,
      _syncMatrix() {
        dummy.updateMatrix()
        iMesh.setMatrixAt(instanceId, dummy.matrix)
        iMesh.instanceMatrix.needsUpdate = true
      },
    }
    return abstract
  }

  add(rangeX, rangeXMarge, zIncr) {
    this.rangeX = rangeX
    this.rangeXMarge = rangeXMarge
    this.zIncr = zIncr

    if (this.#mode === MODE.EXPLORE) {
      const instanceId = this.#avail.length
      const abstract = this._createAbstract(instanceId)
      this.#avail.push(abstract)
      return abstract
    }

    // non-EXPLORE: clone-based (unchanged)
    const mesh = this.#mesh.clone()
    mesh.hitbox = this.#hitbox
    mesh.hitboxTarget = this.#hitboxTarget
    this.#avail.push(mesh)
    return mesh
  }

  getAvail({ i, z, slotX, mode, gridPos }) {
    if (mode === MODE.EXPLORE) {
      const abstract = this.#avail[0]
      if (!abstract) return null

      abstract.dummy.position.set(gridPos.x, 0, gridPos.y)
      abstract.initPos.x = gridPos.x
      abstract.initPos.y = 0
      abstract.initPos.z = gridPos.y
      abstract.dummy.rotation.y = randInt(-Math.PI, Math.PI)
      abstract.isTargeting = false
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
      // Kill targetPlayer tweens (they run on initPos and rotation, not position)
      gsap.killTweensOf(abstract.initPos)
      gsap.killTweensOf(abstract.dummy.rotation)
      abstract.isTargeting = false
      abstract.dummy.position.set(0, -9999, 0)
      abstract._syncMatrix()
      this.#avail.push(abstract)
      return
    }
    this.#avail.push(abstract)
  }

  targetPlayer(mesh, playerX, playerZ) {
    if (!mesh.isTargeting) {
      mesh.isTargeting = true
      const tl = new gsap.timeline()

      // mesh.position = dummy.position, mesh.rotation = dummy.rotation
      // Both are live references so GSAP tweens them in-place; _syncMatrix picks up changes each frame
      const rota = Math.atan2(0 - mesh.position.z, 0 + mesh.position.x) % (2 * Math.PI)
      const target = rota + degToRad(-180)
      const current = mesh.rotation.y
      let delta = target - current
      delta = (((delta % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI

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
