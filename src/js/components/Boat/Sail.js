import ControllerManager from '../../managers/ControllerManager'
import EnvManager from '../../managers/EnvManager'
import LoaderManager from '../../managers/LoaderManager'
import { createSailMaterial } from './SailMaterials'

export default class Sail {
  #mesh
  #mirrorMesh
  #material
  #mastBone
  constructor(parent) {
    this.#mastBone = parent.getObjectByName('j_fn_sail1')
    this.#mesh = parent.getObjectByName('boat-sail')
    const mapTexture = this.#mesh.material?.map ?? LoaderManager.defaultTexture

    this.#mesh.morphTargetInfluences[0] = 1

    this.#material = createSailMaterial(mapTexture)
    this.#mesh.material = this.#material
    this.#mesh.castCustomShadow = true
    // WebGPU batches differently than WebGL; higher renderOrder ensures sail draws after ocean/clouds
    this.#mesh.renderOrder = 50

    this.#mesh.scale.x = 0.1
  }

  get mesh() {
    return this.#mesh
  }

  get mirrorMesh() {
    return this.#mirrorMesh
  }

  get mastBone() {
    return this.#mastBone
  }

  update({ time, delta }) {
    if (!this.#material?.uTime || !ControllerManager.boat) return
    this.#material.uTime.value += (delta / 16) * (0.01 + ControllerManager.boat.velocityP * 0.025)
    this.#material.uVelocity.value = ControllerManager.boat.velocityP
  }
}
