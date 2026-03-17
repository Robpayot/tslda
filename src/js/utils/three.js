import { BufferAttribute, Matrix4, Vector3, InstancedMesh } from 'three'

/**
 * Sort instances back-to-front by camera depth (for transparent InstancedMesh).
 * Reorders instanceMatrix and instanced attributes (offset, speed, etc.) to match.
 */
export function sortInstancedMesh(mesh, camera) {
  if (!mesh.isInstancedMesh) return
  const count = mesh.count
  const { geometry, instanceMatrix } = mesh
  const vector = new Vector3()
  const sortArray = []
  const tempMatrix = new Matrix4()

  for (let i = 0; i < count; i++) {
    mesh.getMatrixAt(i, tempMatrix)
    vector.setFromMatrixPosition(tempMatrix)
    vector.applyMatrix4(mesh.matrixWorld)
    vector.applyMatrix4(camera.matrixWorldInverse)
    sortArray.push([vector.z, i])
  }

  sortArray.sort((a, b) => b[0] - a[0])

  const matrixArray = instanceMatrix.array
  const matrixCopy = new Float32Array(matrixArray)

  const attrs = ['offset', 'speed']
  const attrCopies = {}
  attrs.forEach((name) => {
    const attr = geometry.getAttribute(name)
    if (attr) attrCopies[name] = new Float32Array(attr.array)
  })

  for (let i = 0; i < count; i++) {
    const src = sortArray[i][1]
    for (let j = 0; j < 16; j++) matrixArray[i * 16 + j] = matrixCopy[src * 16 + j]
    attrs.forEach((name) => {
      const attr = geometry.getAttribute(name)
      if (attr && attrCopies[name]) attr.array[i] = attrCopies[name][src]
    })
  }

  instanceMatrix.needsUpdate = true
  attrs.forEach((name) => {
    const attr = geometry.getAttribute(name)
    if (attr) attr.needsUpdate = true
  })
}

export function hexToRgb(hex) {
  let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}
