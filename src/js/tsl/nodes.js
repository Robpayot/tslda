import {
  Fn, uniform, varying, attribute,
  float, vec2, vec3, vec4, int, mat4, ivec4,
  positionLocal, positionWorld, normalLocal, normalView, uv,
  texture, textureSize,
  sin, cos, abs, pow, step, fract, mod, floor, clamp, max, min, exp,
  smoothstep, mix, dot, normalize, distance, length, cross,
  modelViewMatrix, modelWorldMatrix, modelNormalMatrix,
  cameraViewMatrix, cameraProjectionMatrix,
  add, sub, mul, div,
  lessThan, select, If,
} from 'three/tsl'

// =============================================
// TOON SHADING
// =============================================

export const calcSurfaceToLight = Fn(([pos_immutable, sunDir_immutable]) => {
  const pos = vec3(pos_immutable).toVar()
  const sunDir = vec3(sunDir_immutable).toVar()
  const surfaceToLightDir = modelViewMatrix.mul(vec4(pos, 1.0)).xyz
  const worldLightPos = cameraViewMatrix.mul(vec4(sunDir, 1.0)).xyz
  return normalize(worldLightPos.sub(surfaceToLightDir))
})

export const calcSurfaceToLightWorld = Fn(([pos_immutable, sunDir_immutable]) => {
  const pos = vec3(pos_immutable).toVar()
  const sunDir = vec3(sunDir_immutable).toVar()
  const surfaceToLightDir = modelViewMatrix.mul(vec4(pos, 1.0)).xyz
  const worldLightPos = modelViewMatrix.mul(vec4(sunDir, 1.0)).xyz
  return normalize(worldLightPos.sub(surfaceToLightDir))
})

export const calcSurfaceToLightFixed = Fn(() => {
  const fixSunDir = vec3(-10, 185, 75)
  const surfaceToLightDir = cameraViewMatrix.mul(vec4(vec3(0), 1.0)).xyz
  const worldLightPos = cameraViewMatrix.mul(vec4(fixSunDir, 1.0)).xyz
  return normalize(worldLightPos.sub(surfaceToLightDir))
})

export const toonFactor = Fn(([normal_immutable, surfaceToLight_immutable, coefShadow_immutable, ambientR_immutable]) => {
  const n = vec3(normal_immutable).toVar()
  const stl = vec3(surfaceToLight_immutable).toVar()
  const coef = float(coefShadow_immutable).toVar()
  const ambR = float(ambientR_immutable).toVar()
  const shadow = dot(n, stl)
  return smoothstep(0.0, 0.1, shadow).mul(0.9).mul(coef).add(ambR)
})

export const toonFactorWide = Fn(([normal_immutable, surfaceToLight_immutable, coefShadow_immutable, ambientR_immutable, smoothWidth_immutable]) => {
  const n = vec3(normal_immutable).toVar()
  const stl = vec3(surfaceToLight_immutable).toVar()
  const coef = float(coefShadow_immutable).toVar()
  const ambR = float(ambientR_immutable).toVar()
  const sw = float(smoothWidth_immutable).toVar()
  const shadow = dot(n, stl)
  return smoothstep(0.0, sw, shadow).mul(0.9).mul(coef).add(ambR)
})

export const linearToSRGB = Fn(([linearVal_immutable]) => {
  const v = float(linearVal_immutable).toVar()
  const higher = float(1.055).mul(pow(v, float(1.0 / 2.4))).sub(0.055)
  const lower = v.mul(12.92)
  return select(v.lessThan(0.0031308), lower, higher)
})

export const linearToSRGBVec3 = Fn(([rgb_immutable]) => {
  const rgb = vec3(rgb_immutable).toVar()
  return vec3(
    linearToSRGB(rgb.x),
    linearToSRGB(rgb.y),
    linearToSRGB(rgb.z)
  )
})

// =============================================
// SHADOW RECEIVING
// =============================================

export const unpackRGBAToDepth = Fn(([color_immutable]) => {
  const c = vec4(color_immutable).toVar()
  const bitShift = vec4(
    1.0 / (256.0 * 256.0 * 256.0),
    1.0 / (256.0 * 256.0),
    1.0 / 256.0,
    1.0
  )
  return dot(c, bitShift)
})

export const packDepthToRGBA = Fn(([depth_immutable]) => {
  const v = float(depth_immutable).toVar()
  const bitShift = vec4(
    256.0 * 256.0 * 256.0,
    256.0 * 256.0,
    256.0,
    1.0
  )
  const bitMask = vec4(
    0.0,
    1.0 / 256.0,
    1.0 / 256.0,
    1.0 / 256.0
  )
  const res = fract(v.mul(bitShift))
  return res.sub(res.mul(vec4(0, 1, 1, 1)).mul(vec4(1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0, 0)))
})

export const frustumTest = Fn(([shadowCoord_immutable, shadowFactor_immutable]) => {
  const sc = vec3(shadowCoord_immutable).toVar()
  const sf = float(shadowFactor_immutable).toVar()
  const inFrustum = sc.x.greaterThanEqual(0.0)
    .and(sc.x.lessThanEqual(1.0))
    .and(sc.y.greaterThanEqual(0.0))
    .and(sc.y.lessThanEqual(1.0))
    .and(sc.z.lessThanEqual(1.0))
  return select(inFrustum, sf, float(1.0))
})

export const calcShadowFactor = Fn(([shadowCoordVec4_immutable, depthMapTex]) => {
  const scRaw = vec4(shadowCoordVec4_immutable).toVar()
  const sc = scRaw.xyz.div(scRaw.w).mul(0.5).add(0.5)
  const depthSC = sc.z
  const depthDM = unpackRGBAToDepth(texture(depthMapTex, sc.xy))
  const bias = float(0.01)
  const sf = step(depthSC.sub(bias), depthDM)
  const tested = frustumTest(sc, sf)
  const shadowDarkness = float(0.5)
  return mix(float(1.0).sub(shadowDarkness), float(1.0), tested)
})

// =============================================
// HEIGHTMAP DISPLACEMENT
// =============================================

export const heightmapDisplacement = Fn(([heightMapTex, scaleOcean_immutable]) => {
  const scaleO = float(scaleOcean_immutable).toVar()
  const worldPos = modelWorldMatrix.mul(vec4(vec3(0), 1.0))
  const uvGrid = vec2(
    float(0.5).add(worldPos.x.div(scaleO)),
    float(0.5).add(worldPos.z.negate().div(scaleO))
  )
  const hm = texture(heightMapTex, uvGrid)
  const offset = float(0.01)
  const hm1A = texture(heightMapTex, vec2(uvGrid.x.add(offset), uvGrid.y))
  const hm1B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.add(offset)))
  const hm2A = texture(heightMapTex, vec2(uvGrid.x.sub(offset), uvGrid.y))
  const hm2B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.sub(offset)))
  const avgH = hm.x.add(hm1A.x).add(hm1B.x).add(hm2A.x).add(hm2B.x).div(5.0)
  return avgH.sub(0.5).mul(2.0).mul(hm.z.mul(100.0)).mul(2.0)
})

// =============================================
// OCEAN WAVE CALCULATION
// =============================================

export const calculateSurface = Fn(([x_immutable, z_immutable, yScale_immutable, timeWave_immutable]) => {
  const x = float(x_immutable).toVar()
  const z = float(z_immutable).toVar()
  const yScale = float(yScale_immutable).toVar()
  const tw = float(timeWave_immutable).toVar()
  const y1 = sin(x.div(yScale).add(tw)).add(sin(x.mul(2.3).div(yScale).add(tw.mul(1.5)))).add(sin(x.mul(3.3).div(yScale).add(tw.mul(0.4)))).div(3.0)
  const y2 = sin(z.mul(0.2).div(yScale).add(tw.mul(1.8))).add(sin(z.mul(1.8).div(yScale).add(tw.mul(1.8)))).add(sin(z.mul(2.8).div(yScale).add(tw.mul(0.8)))).div(3.0)
  return y1.add(y2)
})

// =============================================
// NOISE FUNCTIONS (simplex 2D approximation)
// =============================================

const mod289_3 = Fn(([x_immutable]) => {
  const x = vec3(x_immutable).toVar()
  return x.sub(floor(x.mul(1.0 / 289.0)).mul(289.0))
})

const mod289_2 = Fn(([x_immutable]) => {
  const x = vec2(x_immutable).toVar()
  return x.sub(floor(x.mul(1.0 / 289.0)).mul(289.0))
})

const permute = Fn(([x_immutable]) => {
  const x = vec3(x_immutable).toVar()
  return mod289_3(x.mul(34.0).add(1.0).mul(x))
})

export const snoise2 = Fn(([v_immutable]) => {
  const v = vec2(v_immutable).toVar()
  const C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439)
  const i = floor(v.add(dot(v, C.yy)))
  const x0 = v.sub(i).add(dot(i, C.xx))
  const i1 = select(x0.x.greaterThan(x0.y), vec2(1.0, 0.0), vec2(0.0, 1.0))
  const x12 = vec4(x0.x.sub(i1.x).add(C.x), x0.y.sub(i1.y).add(C.x), x0.x.add(C.z), x0.y.add(C.z))
  const ip = mod289_2(i)
  const p = permute(permute(ip.y.add(vec3(0.0, i1.y, 1.0))).add(ip.x).add(vec3(0.0, i1.x, 1.0)))
  const m = max(float(0.5).sub(vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw))), vec3(0.0))
  const m2 = m.mul(m)
  const m4 = m2.mul(m2)
  const x0n = x0.mul(float(2.0).mul(fract(p.x.mul(C.w))).sub(1.0))
  const x1n = x12.xy.mul(float(2.0).mul(fract(p.y.mul(C.w))).sub(1.0))
  const x2n = x12.zw.mul(float(2.0).mul(fract(p.z.mul(C.w))).sub(1.0))
  const gx = vec3(dot(x0, x0n.xy), dot(x12.xy, x1n.xy), dot(x12.zw, x2n.xy))
  return float(130.0).mul(dot(m4, gx))
})

export const pnoise2 = Fn(([period_immutable, pos_immutable]) => {
  const per = vec2(period_immutable).toVar()
  const p = vec2(pos_immutable).toVar()
  return snoise2(p.add(per.mul(0.1)))
})

// =============================================
// FOG
// =============================================

export const applyFog = Fn(([color_immutable, fogColor_immutable, fogDensity_immutable, fogDepth_immutable]) => {
  const col = vec3(color_immutable).toVar()
  const fc = vec3(fogColor_immutable).toVar()
  const fd = float(fogDensity_immutable).toVar()
  const depth = float(fogDepth_immutable).toVar()
  const fogFactor = float(1.0).sub(exp(fd.negate().mul(fd).mul(depth).mul(depth)))
  return mix(col, fc, fogFactor)
})

// =============================================
// ROTATION HELPER
// =============================================

export const rotateUV = Fn(([uvCoord_immutable, rotation_immutable, mid_immutable]) => {
  const uvc = vec2(uvCoord_immutable).toVar()
  const rot = float(rotation_immutable).toVar()
  const m = float(mid_immutable).toVar()
  const c = cos(rot)
  const s = sin(rot)
  return vec2(
    c.mul(uvc.x.sub(m)).add(s.mul(uvc.y.sub(m))).add(m),
    c.mul(uvc.y.sub(m)).sub(s.mul(uvc.x.sub(m))).add(m)
  )
})
