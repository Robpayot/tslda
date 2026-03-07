import LoaderManager from '../../../managers/LoaderManager'
import { createTriforceShardMaterial } from './TriforceShardsMaterials'

export default class TriforceShards {
  #material
  #mesh
  #hitbox = 16
  #scale = 0.023
  #baseY = 2
  #shards = []
  constructor(scene) {
    const gltf = LoaderManager.get('triforce_shards').gltf

    for (let i = 0; i < 3; i++) {
      const mesh = this._createMeshMat(gltf, i)
      this.#shards.push(mesh)
      scene.add(mesh)
    }
  }

  get shards() {
    return this.#shards
  }

  _createMeshMat(gltf, index) {
    const shard = gltf.scene.getObjectByName(`tri${index + 1}`).clone()

    const mapTexture = shard.children[0].material?.map ?? LoaderManager.defaultTexture
    shard.children[0].material = createTriforceShardMaterial(mapTexture)

    shard.position.y = this.#baseY
    shard.scale.set(this.#scale, this.#scale, this.#scale)

    return shard
  }
}
