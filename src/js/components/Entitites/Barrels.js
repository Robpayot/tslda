import { BufferGeometry, InstancedMesh, MathUtils, Matrix4, Object3D } from 'three'
import { StorageInstancedBufferAttribute } from 'three/webgpu'
import OceanHeightMap from '../Ocean/OceanHeightMap'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import LoaderManager from '../../managers/LoaderManager'
import { createEntityToonMaterial } from '../../tsl-nodes/entityToon'
const { randInt } = MathUtils
import { MODE } from '../../utils/constants'

// y-offset matching the non-EXPLORE barrelGroup.position.y used in _createMeshMat
const BASE_Y = -11

export default class Barrels {
  #material
  #avail = []
  #mesh
  #iMesh1 = null // EXPLORE: InstancedMesh for first sub-mesh
  #iMesh2 = null // EXPLORE: InstancedMesh for second sub-mesh
  #materials = [] // EXPLORE: [mat1, mat2] for uniform updates
  #hitbox = 16
  #scale = 0.2
  #mode
  #capacity = 500

  constructor(scene, mode) {
    this.#mode = mode
    this.#scale = mode === MODE.EXPLORE ? 0.18 : 0.2

    // Always create the template mesh — BarrelRupees clones barrel.mesh regardless of mode.
    this.#mesh = this._createMeshMat()

    if (mode === MODE.EXPLORE) {
      this._createInstancedMeshes(scene)
    }
  }

  get mesh() {
    return this.#mesh
  }

  get materials() {
    return this.#materials
  }

  get capacity() {
    return this.#capacity
  }

  set avail(val) {
    this.#avail = val
  }

  _createMeshMat() {
    const gltf = LoaderManager.get('barrel').gltf
    const barrelGroup = gltf.scene.getObjectByName('skeleton_root').clone()

    const s = this.#scale
    barrelGroup.scale.set(s, s, s)
    barrelGroup.position.y = BASE_Y
    barrelGroup.name = 'barrel'

    const mesh1 = barrelGroup.children[0]
    const material1 = createEntityToonMaterial({
      mapTexture: mesh1.material.map,
      heightMapTexture: OceanHeightMap.heightMap.texture,
      scaleOcean: SCALE_OCEAN,
      name: 'barrel',
    })

    mesh1.geometry.computeVertexNormals()
    mesh1.material = material1

    const mesh2 = barrelGroup.children[1]
    const material2 = createEntityToonMaterial({
      mapTexture: mesh2.material.map,
      heightMapTexture: OceanHeightMap.heightMap.texture,
      scaleOcean: SCALE_OCEAN,
      name: 'barrel',
    })

    mesh2.geometry.computeVertexNormals()
    mesh2.material = material2

    barrelGroup.visible = false
    barrelGroup.canVisible = false

    return barrelGroup
  }

  _createInstancedMeshes(scene) {
    const gltf = LoaderManager.get('barrel').gltf
    const barrelGroup = gltf.scene.getObjectByName('skeleton_root').clone()
    const s = this.#scale

    const child1 = barrelGroup.children[0]
    const geo1 = this._cleanGeo(child1, s)
    geo1.computeBoundingBox()
    console.log('[Barrels] geo1 vertices:', geo1.attributes.position.count, 'bbox Y:', geo1.boundingBox.min.y.toFixed(2), '→', geo1.boundingBox.max.y.toFixed(2))
    const mat1 = createEntityToonMaterial({
      mapTexture: child1.material.map,
      heightMapTexture: OceanHeightMap.heightMap?.texture,
      scaleOcean: SCALE_OCEAN,
      name: 'barrel',
      isInstanced: true,
    })
    this.#iMesh1 = this._buildInstancedMesh(geo1, mat1, scene)

    const child2 = barrelGroup.children[1]
    const geo2 = this._cleanGeo(child2, s)
    const mat2 = createEntityToonMaterial({
      mapTexture: child2.material.map,
      heightMapTexture: OceanHeightMap.heightMap?.texture,
      scaleOcean: SCALE_OCEAN,
      name: 'barrel2',
      isInstanced: true,
    })
    this.#iMesh2 = this._buildInstancedMesh(geo2, mat2, scene)

    this.#materials = [mat1, mat2]
  }

  // Builds a minimal geometry (position + uv only, normals computed) from a skinned child mesh.
  // Only bakes group scale — child.matrix is intentionally skipped to match the ShipGrey/Rupees
  // pattern (get-mesh-directly → scale only). Avoids any GLTF rig transform surprises.
  _cleanGeo(child, s) {
    const src = child.geometry
    const geo = new BufferGeometry()
    geo.setAttribute('position', src.attributes.position.clone())
    if (src.attributes.uv) geo.setAttribute('uv', src.attributes.uv.clone())
    if (src.index) geo.setIndex(src.index.clone())
    geo.applyMatrix4(new Matrix4().makeScale(s, s, s))
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    return geo
  }

  _buildInstancedMesh(geo, material, scene) {
    const iMesh = new InstancedMesh(geo, material, this.#capacity)
    iMesh.name = 'barrel'
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

  _createAbstract(instanceId) {
    const iMesh1 = this.#iMesh1
    const iMesh2 = this.#iMesh2
    const dummy = new Object3D()
    dummy.position.set(0, -9999, 0)
    dummy.updateMatrix()

    return {
      dummy,
      instanceId,
      name: 'barrel',
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
      _syncMatrix() {
        dummy.updateMatrix()
        if (iMesh1) {
          iMesh1.setMatrixAt(instanceId, dummy.matrix)
          iMesh1.instanceMatrix.needsUpdate = true
        }
        if (iMesh2) {
          iMesh2.setMatrixAt(instanceId, dummy.matrix)
          iMesh2.instanceMatrix.needsUpdate = true
        }
      },
    }
  }

  add(rangeX, rangeXMarge, zIncr = 0) {
    this.rangeX = rangeX
    this.rangeXMarge = rangeXMarge
    this.zIncr = zIncr

    if (this.#mode === MODE.EXPLORE) {
      const instanceId = this.#avail.length
      const abstract = this._createAbstract(instanceId)
      this.#avail.push(abstract)
      return abstract
    }

    const mesh = this.#mesh.clone()
    mesh.hitbox = this.#hitbox

    this.#avail.push(mesh)

    return mesh
  }

  getAvail({ i, z, slotX, mode, gridPos }) {
    if (mode === MODE.EXPLORE) {
      const abstract = this.#avail[0]
      if (!abstract) return null

      abstract.dummy.position.set(gridPos.x, 0, gridPos.y)
      abstract.dummy.rotation.y = randInt(-Math.PI, Math.PI)
      abstract.initPos.x = gridPos.x
      abstract.initPos.y = 0
      abstract.initPos.z = gridPos.y
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

    mesh.initPos = mesh.position.clone()
    // remove from array
    this.#avail.shift()

    return mesh
  }

  free(object) {
    if (this.#mode === MODE.EXPLORE) {
      object.dummy.position.set(0, -9999, 0)
      object._syncMatrix()
      this.#avail.push(object)
      return
    }
    this.#avail.push(object)
  }
}
