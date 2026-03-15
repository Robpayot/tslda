import { NodeMaterial } from 'three/webgpu'
import {
  Fn,
  If,
  Discard,
  uniform,
  float,
  vec3,
  vec4,
  uv,
  positionWorld,
  mix,
  step,
} from 'three/tsl'
import { Color, DoubleSide } from 'three'
import EnvManager from '../../../managers/EnvManager'
import LoaderManager from '../../../managers/LoaderManager'
import Settings from '../../../utils/Settings'
import { createReceiveShadowNode } from '../../../tsl-nodes/receiveShadowToon'

/**
 * Creates a TSL splash material with shadow receiving.
 * Uses same shadow logic as Ocean (createReceiveShadowNode).
 */
export function createSplashMaterial() {
  const uColor = uniform(new Color(EnvManager.settingsOcean?.color ?? '#4c6ed4'))
  const uPower = uniform(0.91)
  const uAlphaTex = uniform(EnvManager.settingsOcean?.alphaTex ?? 1)

  const depthMapTex =
    Settings.castShadows && EnvManager.sunShadowMap?.map?.texture
      ? EnvManager.sunShadowMap.map.texture
      : LoaderManager.defaultTexture

  const shadowCam = EnvManager.sunShadowMap?.camera
  const uShadowCameraP = uniform(shadowCam?.projectionMatrix)
  const uShadowCameraV = uniform(shadowCam?.matrixWorldInverse)
  const mapW = EnvManager.sunShadowMap?.map?.width ?? 512
  const uShadowMapTexelSize = uniform(1 / mapW)

  const colorFn = Fn(() => {
    // Hide if under water
    If(positionWorld.y.lessThan(-3.0), () => {
      Discard()
    })

    const vUv = uv()
    const threshold = step(uPower, vUv.y)
    const color = mix(
      vec3(uColor),
      vec3(1.0, 1.0, 1.0).mul(uAlphaTex),
      threshold
    )

    const receivedShadow =
      Settings.castShadows && shadowCam
        ? createReceiveShadowNode({
            depthMapTex,
            uShadowCameraP,
            uShadowCameraV,
            uShadowMapTexelSize,
          })
        : float(1.0)
    const finalColor = color.mul(receivedShadow)

    return vec4(finalColor, 1.0)
  })

  const material = new NodeMaterial()
  material.name = 'toon'
  material.colorNode = colorFn()
  material.side = DoubleSide
  material.uColor = uColor
  material.uPower = uPower
  material.uAlphaTex = uAlphaTex

  return material
}
