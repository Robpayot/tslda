import { REPEAT_OCEAN } from '../Ocean'
import LoaderManager from '../../managers/LoaderManager'
import { createEntityToonMaterial } from '../../tsl-nodes/entityToon'
import { MathUtils } from 'three'
const { degToRad } = MathUtils
import gsap from 'gsap'

const offsetZ = 258
export default class Walls {
  #material
  #availLeft = []
  #availRight = []
  #mesh
  #scale = 950
  resetZ = offsetZ
  constructor(scene, rangeX, side) {
    this.rangeX = rangeX
    this.#mesh = this._createMeshMat()
  }

  get availRight() {
    return this.#availRight
  }

  get availLeft() {
    return this.#availLeft
  }

  get mesh() {
    return this.#mesh
  }

  _createMeshMat() {
    const gltf = LoaderManager.get('wall').gltf
    const wallGroup = gltf.scene.getObjectByName('wall')

    wallGroup.scale.set(this.#scale, this.#scale * 0.62, this.#scale)
    wallGroup.position.y += 5
    wallGroup.rotation.y = degToRad(90)
    wallGroup.name = 'wall'

    const mesh1 = wallGroup.children[0]
    mesh1.material = createEntityToonMaterial({
      mapTexture: mesh1.material.map,
      name: 'wall',
    })

    const mesh2 = wallGroup.children[1]
    mesh2.material = createEntityToonMaterial({
      mapTexture: mesh2.material.map,
      name: 'wall',
    })

    const mesh3 = wallGroup.children[2]
    mesh3.material = createEntityToonMaterial({
      mapTexture: mesh3.material.map,
      name: 'wall',
    })

    wallGroup.visible = false

    return wallGroup
  }

  add(i, side) {
    const mesh = this.#mesh.clone()
    mesh.position.x = (side * this.rangeX * REPEAT_OCEAN) / 1.5
    mesh.position.z = i * -offsetZ
    if (side === 1) {
      mesh.rotation.y = degToRad(-90)
    }
    mesh.initPos = mesh.position.clone()

    mesh.visible = true
    mesh.canVisible = true

    if (side === 1) {
      this.#availRight.push(mesh)
    } else {
      this.#availLeft.push(mesh)
    }

    return mesh
  }

  reset(z, side) {
    const avail = side === 1 ? this.#availRight : this.#availLeft
    const mesh = avail[0]

    avail.shift()
    mesh.canVisible = false
    mesh.visible = false
    mesh.position.x = (side * this.rangeX * REPEAT_OCEAN) / 1.5
    mesh.position.z = z
    if (side === 1) {
      mesh.rotation.y = degToRad(-90)
    }
    mesh.initPos = mesh.position.clone()

    avail.push(mesh)

    const tl = gsap.timeline()
    tl.add(() => {
      mesh.canVisible = true
      mesh.visible = true
    }, 0.2)
  }
}
