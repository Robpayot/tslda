/**
 * Classic Perlin noise, periodic variant (pnoise)
 * Port of Stefan Gustavson's GLSL implementation to TSL.
 * Original: https://github.com/ashima/webgl-noise
 *
 * @param {import('three/tsl').Node} P - vec2 sampling position
 * @param {import('three/tsl').Node} rep - vec2 period for periodic noise
 * @returns {import('three/tsl').Node} float noise value
 */
import { Fn, float, vec2, vec3, vec4, floor, fract, mix, max, select } from 'three/tsl'

const C1 = 1.0 / 289.0
const C2 = 34.0
const C3 = 1.79284291400159
const C4 = 0.85373472095314

function mod289(x) {
  return x.sub(floor(x.mul(C1)).mul(289.0))
}

function permute(x) {
  return mod289(x.mul(C2).add(1.0).mul(x))
}

// permute for vec3 (used by snoise)
function permuteVec3(x) {
  return vec3(
    permute(x.x),
    permute(x.y),
    permute(x.z)
  )
}

function taylorInvSqrt(r) {
  return float(C3).sub(float(C4).mul(r))
}

function fade(t) {
  return t.mul(t).mul(t).mul(t.mul(t.mul(6.0).sub(15.0)).add(10.0))
}

// Build vec4(P.x, P.y, P.x, P.y) for P.xyxy (vec2 has no .xyxy in TSL)
function xyxy(v) {
  return vec4(v.x, v.y, v.x, v.y)
}

export const pnoise = Fn(([P, rep]) => {
  const P4 = xyxy(P)
  const rep4 = xyxy(rep)
  const Pi = floor(P4).add(vec4(0.0, 0.0, 1.0, 1.0))
  const Pf = fract(P4).sub(vec4(0.0, 0.0, 1.0, 1.0))
  const PiMod = Pi.mod(rep4)
  const Pi289 = mod289(PiMod)
  const ix = vec4(Pi289.x, Pi289.z, Pi289.x, Pi289.z)
  const iy = vec4(Pi289.y, Pi289.y, Pi289.w, Pi289.w)
  const fx = vec4(Pf.x, Pf.z, Pf.x, Pf.z)
  const fy = vec4(Pf.y, Pf.y, Pf.w, Pf.w)

  const i = permute(permute(ix).add(iy))

  const gx = fract(i.mul(1.0 / 41.0)).mul(2.0).sub(1.0)
  const gy = gx.abs().sub(0.5)
  const tx = floor(gx.add(0.5))
  const gx2 = gx.sub(tx)

  const g00 = vec2(gx2.x, gy.x)
  const g10 = vec2(gx2.y, gy.y)
  const g01 = vec2(gx2.z, gy.z)
  const g11 = vec2(gx2.w, gy.w)

  const norm = taylorInvSqrt(
    vec4(g00.dot(g00), g01.dot(g01), g10.dot(g10), g11.dot(g11))
  )
  const g00n = g00.mul(norm.x)
  const g01n = g01.mul(norm.y)
  const g10n = g10.mul(norm.z)
  const g11n = g11.mul(norm.w)

  const n00 = g00n.dot(vec2(fx.x, fy.x))
  const n10 = g10n.dot(vec2(fx.y, fy.y))
  const n01 = g01n.dot(vec2(fx.z, fy.z))
  const n11 = g11n.dot(vec2(fx.w, fy.w))

  const fade_xy = fade(vec2(Pf.x, Pf.y))
  const n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x)
  const n_xy = mix(n_x.x, n_x.y, fade_xy.y)
  return float(2.3).mul(n_xy)
})

// Simplex 2D noise (snoise) - TSL conversion of Gustavson's implementation
const C_SNOISE = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439)

export const snoise = Fn(([v]) => {
  const C_yy = vec2(C_SNOISE.y, C_SNOISE.y)
  const C_xx = vec2(C_SNOISE.x, C_SNOISE.x)
  const C_xxzz = vec4(C_SNOISE.x, C_SNOISE.x, C_SNOISE.z, C_SNOISE.z)

  const i = floor(v.add(v.dot(C_yy)))
  const x0 = v.sub(i).add(vec2(i.dot(C_xx), i.dot(C_xx)))
  const i1 = select(x0.x.greaterThan(x0.y), vec2(1.0, 0.0), vec2(0.0, 1.0))

  const x0_xyxy = vec4(x0.x, x0.y, x0.x, x0.y)
  const x12 = x0_xyxy.add(C_xxzz)
  const x12_xy = vec2(x12.x, x12.y).sub(i1)
  const x12_updated = vec4(x12_xy.x, x12_xy.y, x12.z, x12.w)

  const iMod = vec2(i.x.mod(289.0), i.y.mod(289.0))
  const p = permuteVec3(
    permuteVec3(
      vec3(0.0, i1.y, 1.0).add(iMod.y)
    ).add(vec3(0.0, i1.x, 1.0).add(iMod.x))
  )

  const d0 = x0.dot(x0)
  const d1 = vec2(x12_updated.x, x12_updated.y).dot(vec2(x12_updated.x, x12_updated.y))
  const d2 = vec2(x12_updated.z, x12_updated.w).dot(vec2(x12_updated.z, x12_updated.w))
  const m = max(
    vec3(0.5, 0.5, 0.5).sub(vec3(d0, d1, d2)),
    vec3(0.0, 0.0, 0.0)
  )
  const m2 = m.mul(m).mul(m).mul(m)

  const x = fract(p.mul(C_SNOISE.w)).mul(2.0).sub(1.0)
  const h = x.abs().sub(0.5)
  const ox = floor(x.add(0.5))
  const a0 = x.sub(ox)
  const mScaled = m2.mul(
    float(C3).sub(float(C4).mul(a0.mul(a0).add(h.mul(h))))
  )

  const gx = a0.x.mul(x0.x).add(h.x.mul(x0.y))
  const gy = a0.y.mul(x12_updated.x).add(h.y.mul(x12_updated.y))
  const gz = a0.z.mul(x12_updated.z).add(h.z.mul(x12_updated.w))
  const g = vec3(gx, gy, gz)

  return float(130.0).mul(mScaled.dot(g))
})
