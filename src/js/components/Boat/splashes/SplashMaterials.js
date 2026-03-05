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
  texture,
  positionWorld,
  mix,
  step,
  select,
} from 'three/tsl'
import { Color, DoubleSide } from 'three'
import EnvManager from '../../../managers/EnvManager'
import LoaderManager from '../../../managers/LoaderManager'
import Settings from '../../../utils/Settings'

const BIT_SHIFT = vec4(
  1.0 / (256.0 * 256.0 * 256.0),
  1.0 / (256.0 * 256.0),
  1.0 / 256.0,
  1.0,
)

function unpackRGBAToDepth(color) {
  return color.dot(BIT_SHIFT)
}

/**
 * Creates a TSL splash material with shadow receiving.
 * Matches splash.vert / splash.frag behavior.
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

    let finalColor = color
    if (Settings.castShadows && shadowCam) {
      const shadowCoord4 = uShadowCameraP.mul(uShadowCameraV).mul(vec4(positionWorld, 1.0))
      const shadowCoord = shadowCoord4.xyz.div(shadowCoord4.w).mul(0.5).add(0.5)

      const depthShadowCoord = shadowCoord.z
      const depthMapSample = texture(depthMapTex, shadowCoord.xy)
      const depthDepthMap = unpackRGBAToDepth(depthMapSample)

      const bias = float(0.01)
      const shadowFactor = step(depthShadowCoord.sub(bias), depthDepthMap)

      const inFrustum = shadowCoord.x
        .greaterThanEqual(0.0)
        .and(shadowCoord.x.lessThanEqual(1.0))
        .and(shadowCoord.y.greaterThanEqual(0.0))
        .and(shadowCoord.y.lessThanEqual(1.0))
        .and(shadowCoord.z.lessThanEqual(1.0))
      const clampedFactor = select(inFrustum, shadowFactor, float(1.0))

      const shadowDarkness = float(0.5)
      const shadow = mix(float(1.0).sub(shadowDarkness), float(1.0), clampedFactor)
      finalColor = color.mul(shadow)
    }

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
