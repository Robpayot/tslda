import { BufferGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, MathUtils, Object3D } from 'three'
import { StorageInstancedBufferAttribute } from 'three/webgpu'
import { REPEAT_OCEAN, SCALE_OCEAN } from '../Ocean'
import OceanHeightMap from '../Ocean/OceanHeightMap'
import LoaderManager from '../../managers/LoaderManager'
import { createEntityToonMaterial } from '../../tsl-nodes/entityToon'
import DATA_RUPEES from '../../data/rupees_score.json'
import { MODE } from '../../utils/constants'

const { randInt } = MathUtils

const RUPEE_COLORS = [
  new Color(0, 0.314, 0),
  new Color('#365ad3'),
  new Color('#bfc84e'),
  new Color('#f54c4b'),
  new Color('#8561ab'),
  new Color('#ed7f21'),
  new Color('#f0f0f0'),
]

const BARREL_SCALE = 0.18
const RUPEE_SCALE = 0.16
const RUPEE_Y_OFFSET = 19
// EXPLORE placement offset: negative = more submerged, positive = higher above water
const BARREL_BASE_Y = -3

export default class BarrelRupees {
  #avail = []
  #mesh = null
  #rupee
  #hitbox = 15
  #mode
  // EXPLORE: InstancedMesh for barrel (2 sub-meshes) + rupee
  #iMeshBarrel1 = null
  #iMeshBarrel2 = null
  #iMeshRupee = null
  #iColorArray = null
  #iColorAttr = null
  #capacity = 2000

  constructor(scene, rupee, barrel, mode) {
    this.#mode = mode
    this.#rupee = rupee

    if (mode !== MODE.EXPLORE) {
      this.#mesh = this._createMesh(rupee, barrel)
      scene.add(this.#mesh)
    } else {
      this._createInstancedMeshes(scene)
    }
  }

  set avail(val) {
    this.#avail = val
  }

  // ─── Non-EXPLORE clone path ───────────────────────────────────────────────

  _createMesh(rupee, barrel) {
    const rupeeMesh = rupee.mesh.clone()
    rupeeMesh.visible = true
    rupeeMesh.position.y += 5

    const barrelMesh = barrel.mesh.clone()
    barrelMesh.visible = true

    const mesh = new Object3D()
    mesh.name = 'barrelRupee'
    mesh.add(rupeeMesh)
    mesh.add(barrelMesh)
    mesh.visible = false
    mesh.canVisible = false

    return mesh
  }

  // ─── EXPLORE InstancedMesh path ───────────────────────────────────────────

  _createInstancedMeshes(scene) {
    // Barrel (barrel2.glb: skeleton_root with 2 SkinnedMesh children)
    const barrelGltf = LoaderManager.get('barrel').gltf
    const barrelGroup = barrelGltf.scene.getObjectByName('skeleton_root').clone()
    const s = BARREL_SCALE

    const child1 = barrelGroup.children[0]
    const geo1 = this._cleanBarrelGeo(child1, barrelGroup, s)
    const child2 = barrelGroup.children[1]
    const geo2 = this._cleanBarrelGeo(child2, barrelGroup, s)

    // Center both sub-meshes at y=0 (same logic as Barrels._centerGeosY)
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

    const mat1 = createEntityToonMaterial({
      mapTexture: child1.material.map,
      heightMapTexture: OceanHeightMap.heightMap?.texture,
      scaleOcean: SCALE_OCEAN,
      name: 'barrelRupee_barrel',
      isInstanced: true,
    })
    this.#iMeshBarrel1 = this._buildInstancedMesh(geo1, mat1, scene, this.#capacity, 'barrelRupee')

    const mat2 = createEntityToonMaterial({
      mapTexture: child2.material.map,
      heightMapTexture: OceanHeightMap.heightMap?.texture,
      scaleOcean: SCALE_OCEAN,
      name: 'barrelRupee_barrel2',
      isInstanced: true,
    })
    this.#iMeshBarrel2 = this._buildInstancedMesh(geo2, mat2, scene, this.#capacity, 'barrelRupee')

    // Rupee
    const rupeeGltf = LoaderManager.get('rupee').gltf
    const rupeeMesh = rupeeGltf.scene.getObjectByName('rupee').clone()
    const rupeeGeo = rupeeMesh.geometry.clone()
    const rs = RUPEE_SCALE
    rupeeGeo.applyMatrix4(new Matrix4().makeScale(rs, rs, rs))
    rupeeGeo.computeVertexNormals()

    const iColorArray = new Float32Array(this.#capacity * 4)
    const iColorAttr = new InstancedBufferAttribute(iColorArray, 4)
    const c0 = RUPEE_COLORS[0]
    for (let i = 0; i < this.#capacity; i++) {
      iColorArray[i * 4] = c0.r
      iColorArray[i * 4 + 1] = c0.g
      iColorArray[i * 4 + 2] = c0.b
    }
    rupeeGeo.setAttribute('iColor', iColorAttr)
    this.#iColorArray = iColorArray
    this.#iColorAttr = iColorAttr

    const rupeeMat = createEntityToonMaterial({
      useInstanceColor: true,
      heightMapTexture: OceanHeightMap.heightMap?.texture,
      scaleOcean: SCALE_OCEAN,
      smoothstepMax: 0.8,
      ambientMul: 0.5,
      name: 'barrelRupee_rupee',
      isInstanced: true,
    })
    this.#iMeshRupee = this._buildInstancedMesh(rupeeGeo, rupeeMat, scene, this.#capacity, 'barrelRupee')
  }

  // Bake scale + skeleton_root rotation + child local matrix into a raw geometry.
  // Caller must center via bounding box then call computeVertexNormals + computeBoundingSphere.
  _cleanBarrelGeo(child, barrelGroup, s) {
    const src = child.geometry
    const geo = new BufferGeometry()
    geo.setAttribute('position', src.attributes.position.clone())
    if (src.attributes.uv) geo.setAttribute('uv', src.attributes.uv.clone())
    if (src.index) geo.setIndex(src.index.clone())
    const rotMatrix = new Matrix4().makeRotationFromEuler(barrelGroup.rotation)
    geo.applyMatrix4(new Matrix4().makeScale(s, s, s).multiply(rotMatrix).multiply(child.matrix))
    return geo
  }

  _buildInstancedMesh(geo, material, scene, capacity, name) {
    const iMesh = new InstancedMesh(geo, material, capacity)
    iMesh.name = name
    iMesh.instanceMatrix = new StorageInstancedBufferAttribute(iMesh.instanceMatrix.array, 16)
    iMesh.frustumCulled = false

    const hideDummy = new Object3D()
    hideDummy.position.set(0, -9999, 0)
    hideDummy.updateMatrix()
    for (let i = 0; i < capacity; i++) {
      iMesh.setMatrixAt(i, hideDummy.matrix)
    }
    iMesh.instanceMatrix.needsUpdate = true

    scene.add(iMesh)
    return iMesh
  }

  _createAbstract(instanceId) {
    const iMeshBarrel1 = this.#iMeshBarrel1
    const iMeshBarrel2 = this.#iMeshBarrel2
    const iMeshRupee = this.#iMeshRupee
    const iColorArray = this.#iColorArray
    const iColorAttr = this.#iColorAttr

    const barrelDummy = new Object3D()
    barrelDummy.position.set(0, -9999, 0)
    barrelDummy.updateMatrix()

    const rupeeDummy = new Object3D()
    rupeeDummy.position.set(0, -9999, 0)
    rupeeDummy.updateMatrix()

    // Proxy for rupee "child" — ExploreManager reads .visible and .rotation.y
    const rupeeChild = {
      _visible: true,
      get visible() {
        return this._visible
      },
      set visible(v) {
        this._visible = v
        if (!v) {
          rupeeDummy.position.set(0, -9999, 0)
          rupeeDummy.updateMatrix()
          if (iMeshRupee) {
            iMeshRupee.setMatrixAt(instanceId, rupeeDummy.matrix)
            iMeshRupee.instanceMatrix.needsUpdate = true
          }
        }
      },
      rotation: { y: 0 },
    }

    return {
      barrelDummy,
      rupeeDummy,
      instanceId,
      name: 'barrelRupee',
      get position() {
        return barrelDummy.position
      },
      initPos: { x: 0, y: BARREL_BASE_Y, z: 0 },
      visible: false,
      canVisible: false,
      collision: false,
      hitbox: this.#hitbox,
      score: 0,
      rupeeScored: false,
      children: [rupeeChild],
      _setColor(color) {
        const off = instanceId * 4
        iColorArray[off] = color.r
        iColorArray[off + 1] = color.g
        iColorArray[off + 2] = color.b
        iColorAttr.needsUpdate = true
      },
      _syncMatrix() {
        barrelDummy.updateMatrix()
        if (iMeshBarrel1) {
          iMeshBarrel1.setMatrixAt(instanceId, barrelDummy.matrix)
          iMeshBarrel1.instanceMatrix.needsUpdate = true
        }
        if (iMeshBarrel2) {
          iMeshBarrel2.setMatrixAt(instanceId, barrelDummy.matrix)
          iMeshBarrel2.instanceMatrix.needsUpdate = true
        }
        if (rupeeChild._visible) {
          rupeeDummy.position.set(
            barrelDummy.position.x,
            barrelDummy.position.y + RUPEE_Y_OFFSET,
            barrelDummy.position.z
          )
          rupeeDummy.rotation.y = rupeeChild.rotation.y
          rupeeDummy.updateMatrix()
          if (iMeshRupee) {
            iMeshRupee.setMatrixAt(instanceId, rupeeDummy.matrix)
            iMeshRupee.instanceMatrix.needsUpdate = true
          }
        }
      },
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

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
    mesh.children[0].rotation.y = randInt(0, 2 * Math.PI)
    mesh.hitbox = this.#hitbox
    mesh.children[0].geometry.computeVertexNormals()
    mesh.initPos = mesh.position.clone()
    this.#avail.push(mesh)
    return mesh
  }

  getAvail({ i, z, slotX, mat = 0, mode, gridPos }) {
    if (mode === MODE.EXPLORE) {
      const abstract = this.#avail[0]
      if (!abstract) return null

      abstract.barrelDummy.position.set(gridPos.x, BARREL_BASE_Y, gridPos.y)
      abstract.barrelDummy.rotation.y = randInt(-Math.PI, Math.PI)
      abstract.children[0]._visible = true
      abstract.children[0].rotation.y = randInt(0, 2 * Math.PI)
      abstract.initPos.x = gridPos.x
      abstract.initPos.y = BARREL_BASE_Y
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
    mesh.children[0].material = this.#rupee.materials[mat]
    mesh.children[0].rotation.y = randInt(0, 2 * Math.PI)
    mesh.score = DATA_RUPEES[mat]
    mesh.initPos = mesh.position.clone()
    this.#avail.shift()
    return mesh
  }

  free(object) {
    if (this.#mode === MODE.EXPLORE) {
      const { barrelDummy, rupeeDummy, instanceId } = object

      barrelDummy.position.set(0, -9999, 0)
      barrelDummy.updateMatrix()
      if (this.#iMeshBarrel1) {
        this.#iMeshBarrel1.setMatrixAt(instanceId, barrelDummy.matrix)
        this.#iMeshBarrel1.instanceMatrix.needsUpdate = true
      }
      if (this.#iMeshBarrel2) {
        this.#iMeshBarrel2.setMatrixAt(instanceId, barrelDummy.matrix)
        this.#iMeshBarrel2.instanceMatrix.needsUpdate = true
      }

      rupeeDummy.position.set(0, -9999, 0)
      rupeeDummy.updateMatrix()
      if (this.#iMeshRupee) {
        this.#iMeshRupee.setMatrixAt(instanceId, rupeeDummy.matrix)
        this.#iMeshRupee.instanceMatrix.needsUpdate = true
      }

      object.children[0]._visible = true // reset for next use
      this.#avail.push(object)
      return
    }

    this.#avail.push(object)
  }
}
