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
// EXPLORE placement offset: negative = more submerged, positive = higher above water
const EXPLORE_BASE_Y = -3

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
  #capacity = 2000

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
    const geo1 = this._cleanGeo(child1, barrelGroup, s)
    const child2 = barrelGroup.children[1]
    const geo2 = this._cleanGeo(child2, barrelGroup, s)

    // Center both sub-meshes at y=0 using the combined bounding box so neither
    // floats above the waterline nor sinks below it independently.
    this._centerGeosY(geo1, geo2)

    const mat1 = createEntityToonMaterial({
      mapTexture: child1.material.map,
      heightMapTexture: OceanHeightMap.heightMap?.texture,
      scaleOcean: SCALE_OCEAN,
      name: 'barrel',
      isInstanced: true,
    })
    this.#iMesh1 = this._buildInstancedMesh(geo1, mat1, scene)

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

  // Builds a raw geometry (position + uv + index, transforms baked) without normals.
  // Caller must call _centerGeosY then computeVertexNormals + computeBoundingSphere.
  _cleanGeo(child, barrelGroup, s) {
    const src = child.geometry
    const geo = new BufferGeometry()
    geo.setAttribute('position', src.attributes.position.clone())
    if (src.attributes.uv) geo.setAttribute('uv', src.attributes.uv.clone())
    if (src.index) geo.setIndex(src.index.clone())
    const rotMatrix = new Matrix4().makeRotationFromEuler(barrelGroup.rotation)
    geo.applyMatrix4(new Matrix4().makeScale(s, s, s).multiply(rotMatrix).multiply(child.matrix))
    return geo
  }

  // Translates both geometries by the same Y offset so their combined bounding
  // box is centered at y=0, then finalises normals and bounding sphere.
  _centerGeosY(geo1, geo2) {
    geo1.computeBoundingBox()
    geo2.computeBoundingBox()
    const centerY =
      (Math.min(geo1.boundingBox.min.y, geo2.boundingBox.min.y) +
        Math.max(geo1.boundingBox.max.y, geo2.boundingBox.max.y)) /
      2
    geo1.translate(0, -centerY, 0)
    geo2.translate(0, -centerY, 0)
    geo1.computeVertexNormals()
    geo1.computeBoundingSphere()
    geo2.computeVertexNormals()
    geo2.computeBoundingSphere()
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
      initPos: { x: 0, y: EXPLORE_BASE_Y, z: 0 },
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

      abstract.dummy.position.set(gridPos.x, EXPLORE_BASE_Y, gridPos.y)
      abstract.dummy.rotation.y = randInt(-Math.PI, Math.PI)
      abstract.initPos.x = gridPos.x
      abstract.initPos.y = EXPLORE_BASE_Y
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
