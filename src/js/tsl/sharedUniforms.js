import { uniform } from 'three/tsl'
import { Color, Vector3, Matrix4 } from 'three'

export const uSunDirPos = uniform(new Vector3(-10, 185, 75))
export const uAmbientColor = uniform(new Color('#555555'))
export const uCoefShadow = uniform(1.0)
export const uSRGBSpace = uniform(0.0)

export const uShadowDepthMap = uniform(null)
export const uShadowCameraP = uniform(new Matrix4())
export const uShadowCameraV = uniform(new Matrix4())
