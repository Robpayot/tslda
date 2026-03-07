---
name: TSL conversion
description: Use it when you need to convert a Threejs Material using GLSL shaders to TSL node materials
---

# My Skill
You're the best TSL developer in the world

# TSL (Three.js Shading Language) Rules for AI

Always check the doc! @.cursor/skills/tsl/references/TSL-DOC.md and @.cursor/skills/tsl/references/TSL-WIKI.md


**STOP. Read this section first. These will cause errors or warnings.**

| ❌ DO NOT USE | ✅ USE INSTEAD |
|---------------|----------------|
| `timerGlobal` | `time` |
| `timerLocal` | `time` |
| `timerDelta` | `deltaTime` |
| `import from 'three/nodes'` | `import from 'three/tsl'` |
| `import * as THREE from 'three'` | `import * as THREE from 'three/webgpu'` |
| `oscSine(timerGlobal)` | `oscSine(time)` or `oscSine()` |
| `oscSquare(timerGlobal)` | `oscSquare(time)` or `oscSquare()` |
| `oscTriangle(timerGlobal)` | `oscTriangle(time)` or `oscTriangle()` |
| `oscSawtooth(timerGlobal)` | `oscSawtooth(time)` or `oscSawtooth()` |

---

## CRITICAL: What TSL Is

TSL is JavaScript that builds shader node graphs. Code executes at TWO times:
- **Build time**: JavaScript runs, constructs node graph
- **Run time**: Compiled WGSL/GLSL executes on GPU

    // BUILD TIME: JavaScript conditional (runs once when shader compiles)
    if (material.transparent) { return transparent_shader; }

    // RUN TIME: TSL conditional (runs every pixel/vertex on GPU)
    If(value.greaterThan(0.5), () => { result.assign(1.0); });

---

## TSL conversion

- Please comment anything related to shadow casting for now

- Please run `npm run dev` and check for JS errors after conversion.

- To avoid this error: "THREE.TSL: NodeError: THREE.TSL: `texture( value )` function expects a valid instance of THREE.Texture()."
  - **In this project, `texture(...)` expects a real `THREE.Texture` as its first argument** (see `Lightnings`, `Stars`, etc). Do **not** do `texture( uniform(tex), uv )`.
  - Use `LoaderManager.getTexture('name')` to guarantee a valid texture (falls back to a 1×1 `DataTexture` until loaded), then sample with `texture(mapTexture, uv())`.

### Component + Material folder structure

When a component has its own TSL material in a separate file, use a dedicated folder named after the component:

    Boat/
    ├── index.js
    ├── BoatMaterials.js          # shared boat materials
    ├── sail/
    │   ├── Sail.js               # component logic
    │   └── SailMaterials.js      # TSL sail material
    ├── splashes/
    │   ├── Splashes.js           # component logic
    │   └── SplashMaterials.js    # TSL splash material
    └── ...

- **Folder name**: lowercase, singular (e.g. `sail`, `splashes`)
- **Component file**: PascalCase (e.g. `Sail.js`, `Splashes.js`)
- **Material file**: `*Materials.js` (e.g. `SailMaterials.js`, `SplashMaterials.js`)
- Import from parent: `import Sail from './sail/Sail'`

## Imports

### NPM (Preferred)

    import * as THREE from 'three/webgpu';
    import { Fn, vec3, float, uniform, /* ... */ } from 'three/tsl';


### WRONG Import Patterns

    // WRONG: Old path
    import { vec3 } from 'three/nodes';
    // CORRECT:
    import { vec3 } from 'three/tsl';

    // WRONG: WebGL renderer with TSL
    import * as THREE from 'three';
    // CORRECT: WebGPU renderer
    import * as THREE from 'three/webgpu';

---

## Renderer Initialization

**CRITICAL: Always await renderer.init() before first render or compute.**

    const renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // REQUIRED before any rendering
    await renderer.init();

    // Now safe to render/compute
    renderer.render(scene, camera);

---

## Type Constructors

| Constructor | Input | Output |
|-------------|-------|--------|
| `float(x)` | number, node | float |
| `int(x)` | number, node | int |
| `uint(x)` | number, node | uint |
| `bool(x)` | boolean, node | bool |
| `vec2(x,y)` | numbers, nodes, Vector2 | vec2 |
| `vec3(x,y,z)` | numbers, nodes, Vector3, Color | vec3 |
| `vec4(x,y,z,w)` | numbers, nodes, Vector4 | vec4 |
| `color(hex)` | hex number | vec3 |
| `color(r,g,b)` | numbers 0-1 | vec3 |
| `ivec2/3/4` | integers | signed int vector |
| `uvec2/3/4` | integers | unsigned int vector |
| `mat2/3/4` | numbers, Matrix | matrix |

### Type Conversions

    node.toFloat()  node.toInt()  node.toUint()  node.toBool()
    node.toVec2()   node.toVec3() node.toVec4()  node.toColor()

---

## Operators

### Arithmetic (method chaining)

    a.add(b)      // a + b (supports multiple: a.add(b, c, d))
    a.sub(b)      // a - b
    a.mul(b)      // a * b
    a.div(b)      // a / b
    a.mod(b)      // a % b
    a.negate()    // -a

### Assignment (for mutable variables)

    v.assign(x)        // v = x
    v.addAssign(x)     // v += x
    v.subAssign(x)     // v -= x
    v.mulAssign(x)     // v *= x
    v.divAssign(x)     // v /= x

### Comparison (returns bool node)

    a.equal(b)           // a == b
    a.notEqual(b)        // a != b
    a.lessThan(b)        // a < b
    a.greaterThan(b)     // a > b
    a.lessThanEqual(b)   // a <= b
    a.greaterThanEqual(b)// a >= b

### Logical

    a.and(b)   a.or(b)   a.not()   a.xor(b)

### Bitwise

    a.bitAnd(b)  a.bitOr(b)  a.bitXor(b)  a.bitNot()
    a.shiftLeft(n)  a.shiftRight(n)

### Swizzle

    v.x  v.y  v.z  v.w          // single component
    v.xy  v.xyz  v.xyzw         // multiple components
    v.zyx  v.bgr                // reorder
    v.xxx                       // duplicate
    // Aliases: xyzw = rgba = stpq

---

## Variables

### RULE: TSL nodes are immutable by default

    // WRONG: Cannot modify immutable node
    const pos = positionLocal;
    pos.y = pos.y.add(1);  // ERROR

    // CORRECT: Use .toVar() for mutable variable
    const pos = positionLocal.toVar();
    pos.y.assign(pos.y.add(1));  // OK

### Variable Types

    const v = expr.toVar();           // mutable variable
    const v = expr.toVar('name');     // named mutable variable
    const c = expr.toConst();         // inline constant
    const p = property('float');      // uninitialized property

---

## Uniforms

    // Create
    const u = uniform(initialValue);
    const u = uniform(new THREE.Color(0xff0000));
    const u = uniform(new THREE.Vector3(1, 2, 3));
    const u = uniform(0.5);

    // Update from JS
    u.value = newValue;

    // Auto-update callbacks
    u.onFrameUpdate(() => value);                    // once per frame
    u.onRenderUpdate(({ camera }) => value);         // once per render
    u.onObjectUpdate(({ object }) => object.position.y); // per object

---

## Functions

### Fn() Syntax

    // Array parameters
    const myFn = Fn(([a, b, c]) => { return a.add(b).mul(c); });

    // Object parameters
    const myFn = Fn(({ color = vec3(1), intensity = 1.0 }) => {
      return color.mul(intensity);
    });

    // With defaults
    const myFn = Fn(([t = time]) => { return t.sin(); });

    // Access build context (second param or first if no inputs)
    const myFn = Fn(([input], { material, geometry, object, camera }) => {
      // JS conditionals here run at BUILD time
      if (material.transparent) { return input.mul(0.5); }
      return input;
    });

### Calling Functions

    myFn(a, b, c)           // array params
    myFn({ color: red })    // object params
    myFn()                  // use defaults

### Inline Functions (no Fn wrapper)

    // OK for simple expressions, no variables/conditionals
    const simple = (t) => t.sin().mul(0.5).add(0.5);

---

## Conditionals

### If/ElseIf/Else (CAPITAL I)

    // WRONG
    if(condition, () => {})    // lowercase 'if' is JavaScript

    // CORRECT (inside Fn())
    If(a.greaterThan(b), () => {
      result.assign(a);
    }).ElseIf(a.lessThan(c), () => {
      result.assign(c);
    }).Else(() => {
      result.assign(b);
    });

### Switch/Case

    Switch(mode)
      .Case(0, () => { out.assign(red); })
      .Case(1, () => { out.assign(green); })
      .Case(2, 3, () => { out.assign(blue); })  // multiple values
      .Default(() => { out.assign(white); });
    // NOTE: No fallthrough, implicit break

### select() - Ternary (Preferred)

    // Works outside Fn(), returns value directly
    const result = select(condition, valueIfTrue, valueIfFalse);

    // EQUIVALENT TO: condition ? valueIfTrue : valueIfFalse

    // Example: clamp value with custom logic
    const clamped = select(x.greaterThan(max), max, x);

### Math-Based (Preferred for Performance)

    step(edge, x)           // x < edge ? 0 : 1
    mix(a, b, t)            // a*(1-t) + b*t
    smoothstep(e0, e1, x)   // smooth 0→1 transition
    clamp(x, min, max)      // constrain range
    saturate(x)             // clamp(x, 0, 1)

    // Pattern: conditional selection without branching
    mix(valueA, valueB, step(threshold, selector))

---

## Loops

    // Basic
    Loop(count, ({ i }) => { /* i is loop index */ });

    // With options
    Loop({ start: int(0), end: int(10), type: 'int', condition: '<' }, ({ i }) => {});

    // Nested
    Loop(10, 5, ({ i, j }) => {});

    // Backward
    Loop({ start: 10 }, ({ i }) => {});  // counts down

    // While-style
    Loop(value.lessThan(10), () => { value.addAssign(1); });

    // Control
    Break();     // exit loop
    Continue();  // skip iteration

---

## Math Functions

    // All available as: func(x) OR x.func()

    // Basic
    abs(x) sign(x) floor(x) ceil(x) round(x) trunc(x) fract(x)
    mod(x,y) min(x,y) max(x,y) clamp(x,min,max) saturate(x)

    // Interpolation
    mix(a,b,t) step(edge,x) smoothstep(e0,e1,x)

    // Trig
    sin(x) cos(x) tan(x) asin(x) acos(x) atan(y,x)

    // Exponential
    pow(x,y) exp(x) exp2(x) log(x) log2(x) sqrt(x) inverseSqrt(x)

    // Vector
    length(v) distance(a,b) dot(a,b) cross(a,b) normalize(v)
    reflect(I,N) refract(I,N,eta) faceforward(N,I,Nref)

    // Derivatives (fragment only)
    dFdx(x) dFdy(x) fwidth(x)

    // TSL extras (not in GLSL)
    oneMinus(x)     // 1 - x
    negate(x)       // -x
    saturate(x)     // clamp(x, 0, 1)
    reciprocal(x)   // 1/x
    cbrt(x)         // cube root
    lengthSq(x)     // squared length (no sqrt)
    difference(x,y) // abs(x - y)
    equals(x,y)     // x == y
    pow2(x) pow3(x) pow4(x) // x^2, x^3, x^4

---

## Oscillators

    oscSine(t = time)      // sine wave 0→1→0
    oscSquare(t = time)    // square wave 0/1
    oscTriangle(t = time)  // triangle wave
    oscSawtooth(t = time)  // sawtooth wave

---

## Blend Modes

    blendBurn(a, b)    // color burn
    blendDodge(a, b)   // color dodge
    blendScreen(a, b)  // screen
    blendOverlay(a, b) // overlay
    blendColor(a, b)   // normal blend

---

## UV Utilities

    uv()                                        // default UV coordinates (vec2, 0-1)
    uv(index)                                   // specific UV channel
    matcapUV                                    // matcap texture coords
    rotateUV(uv, rotation, center = vec2(0.5))  // rotate UVs
    spherizeUV(uv, strength, center = vec2(0.5))// spherical distortion
    spritesheetUV(count, uv = uv(), frame = 0)  // sprite animation
    equirectUV(direction = positionWorldDirection) // equirect mapping

---

## Reflect

    reflectView    // reflection in view space
    reflectVector  // reflection in world space

---

## Interpolation Helpers

    remap(node, inLow, inHigh, outLow = 0, outHigh = 1)      // remap range
    remapClamp(node, inLow, inHigh, outLow = 0, outHigh = 1) // remap + clamp

---

## Random

    hash(seed)      // pseudo-random float [0,1]
    range(min, max) // random attribute per instance

---

## Arrays

    // Constant array
    const arr = array([vec3(1,0,0), vec3(0,1,0), vec3(0,0,1)]);
    arr.element(i)    // dynamic index
    arr[0]            // constant index only

    // Uniform array (updatable from JS)
    const arr = uniformArray([new THREE.Color(0xff0000)], 'color');
    arr.array[0] = new THREE.Color(0x00ff00);  // update

---

## Varyings

    // Compute in vertex, interpolate to fragment
    const v = varying(expression, 'name');

    // Optimize: force vertex computation
    const v = vertexStage(expression);

---

## Textures

    texture(tex)                    // sample at default UV
    texture(tex, uv)                // sample at UV
    texture(tex, uv, level)         // sample with LOD
    cubeTexture(tex, direction)     // cubemap
    triplanarTexture(texX, texY, texZ, scale, pos, normal)

---

## Shader Inputs

### Position

    positionGeometry      // raw attribute
    positionLocal         // after skinning/morphing
    positionWorld         // world space
    positionView          // camera space
    positionWorldDirection // normalized
    positionViewDirection  // normalized

### Normal

    normalGeometry   normalLocal   normalView   normalWorld

**⚠️ SkinnedMesh + NodeMaterial: `normalWorld` and `normalView` can be wrong** (flat/white lighting). Use `normalLocal` and transform the light direction to model space instead:

    // Sun/light direction with SkinnedMesh – use normalLocal + modelWorldMatrixInverse
    const sunDirWorld = normalize(uSunDir.sub(positionWorld))
    const sunDirLocal = normalize(modelWorldMatrixInverse.mul(vec4(sunDirWorld, 0)).xyz)
    const shadow = dot(normalLocal, sunDirLocal)

Pass `uSunDir` as `uniform(light.position)` (reference, not clone) so updates are reflected.

### Position and normal spaces — understand the logic

**Be careful:** choose the right space for your calculation. See @.cursor/skills/tsl/references/TSL-DOC.md and @.cursor/skills/tsl/references/TSL-WIKI.md for full details.

| Node | Space | When to use |
|------|--------|-------------|
| **positionLocal** | Object/model space (vertex position after skinning/morphing, before model matrix). | Vertex displacement, custom `.positionNode`, logic that should move with the object. |
| **positionWorld** | World space (position after `modelWorldMatrix`). | Lighting (e.g. distance to light), world-space effects, sampling world-aligned textures. |
| **positionGeometry** | Raw attribute (before any transform). | When you need the original mesh attribute. |
| **normalLocal** | Object space normal (after skinning, before model matrix). | With SkinnedMesh (prefer over `normalWorld`), or when you transform light to model space. |
| **normalWorld** | World space normal. | Standard lighting in fragment (e.g. `dot(normalWorld, lightDir)`), fresnel, world-aligned effects. |

- **`.positionNode`** must return a **vec3 in local space**; the engine applies model/view/projection after. Use `positionLocal` (or a modification of it) there.
- For **world-space** math (e.g. heightmap UV from world XZ), use `positionWorld` or `modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz`.
- **SkinnedMesh:** `normalWorld` / `normalView` can be wrong; use `normalLocal` and transform the light direction to model space (see SkinnedMesh note above).

### Camera

    cameraPosition  cameraNear  cameraFar
    cameraViewMatrix  cameraProjectionMatrix  cameraNormalMatrix

### Screen

    screenUV          // normalized [0,1]
    screenCoordinate  // pixels
    screenSize        // pixels
    viewportUV  viewport  viewportCoordinate  viewportSize

### Time

    time              // elapsed time in seconds (float)
    deltaTime         // time since last frame (float)

### Model

    modelDirection         // vec3
    modelViewMatrix        // mat4
    modelNormalMatrix      // mat3
    modelWorldMatrix       // mat4
    modelPosition          // vec3
    modelScale             // vec3
    modelViewPosition      // vec3
    modelWorldMatrixInverse // mat4

### Other

    uv()  uv(index)           // texture coordinates
    vertexColor()             // vertex colors
    attribute('name', 'type') // custom attribute
    instanceIndex             // instance/thread ID (for instancing and compute)

---

## NodeMaterial Types

### Available Materials

    MeshBasicNodeMaterial      // unlit, fastest
    MeshStandardNodeMaterial   // PBR with roughness/metalness
    MeshPhysicalNodeMaterial   // PBR + clearcoat, transmission, etc.
    MeshPhongNodeMaterial      // Blinn-Phong shading
    MeshLambertNodeMaterial    // Lambert diffuse
    MeshToonNodeMaterial       // cel-shaded
    MeshMatcapNodeMaterial     // matcap shading
    MeshNormalNodeMaterial     // visualize normals
    SpriteNodeMaterial         // billboarded quads
    PointsNodeMaterial         // point clouds
    LineBasicNodeMaterial      // solid lines
    LineDashedNodeMaterial     // dashed lines

### All Materials - Common Properties

    .colorNode      // vec4 - base color
    .opacityNode    // float - opacity
    .positionNode   // vec3 - vertex position (local space)
    .normalNode     // vec3 - surface normal
    .outputNode     // vec4 - final output
    .fragmentNode   // vec4 - replace entire fragment stage
    .vertexNode     // vec4 - replace entire vertex stage

### MeshStandardNodeMaterial

    .roughnessNode  // float
    .metalnessNode  // float
    .emissiveNode   // vec3 color
    .aoNode         // float
    .envNode        // vec3 color

### MeshPhysicalNodeMaterial (extends Standard)

    .clearcoatNode  .clearcoatRoughnessNode  .clearcoatNormalNode
    .sheenNode  .transmissionNode  .thicknessNode
    .iorNode  .iridescenceNode  .iridescenceThicknessNode
    .anisotropyNode  .specularColorNode  .specularIntensityNode

### SpriteNodeMaterial

    .positionNode   // vec3 - world position of sprite center
    .colorNode      // vec4 - color and alpha
    .scaleNode      // float - sprite size (or vec2 for non-uniform)
    .rotationNode   // float - rotation in radians

### PointsNodeMaterial

    .positionNode   // vec3 - point position
    .colorNode      // vec4 - color and alpha
    .sizeNode       // float - point size in pixels

### Converting Points / point-like particles (use SpriteNodeMaterial, no billboardToCamera)

When converting a material that uses `new Points()` or point-like billboarded particles to TSL, use **SpriteNodeMaterial** so billboarding is handled by the material and **no `billboardToCamera`** is needed:

1. **Geometry:** `PlaneGeometry(1, 1)` with `setAttribute('instancePosition', new InstancedBufferAttribute(positionArray, 3))` and any other per-instance attributes (e.g. `offset`, `speed`).
2. **Material:** `SpriteNodeMaterial` with:
   - `positionNode = attribute('instancePosition', 'vec3')` (or add displacement, e.g. heightmap, in the same Fn)
   - `scaleNode = float(SPRITE_SCALE)` or a uniform
   - `colorNode` = your fragment logic (use `uv()` instead of `gl_PointCoord`)
3. **Mesh:** `new InstancedMesh(planeGeo, material, count)` — no `setMatrixAt`, no manual instance matrices.
4. **API:** Keep a no-op `billboardToCamera()` if callers still invoke it, to avoid breaking changes.

Examples in this project: **Stars**, **Lightnings**, **Waves**.

---

## Compute Shaders

### Basic Compute (Standalone)

    import { Fn, instanceIndex, storage } from 'three/tsl';

    // Create storage buffer
    const count = 1024;
    const array = new Float32Array(count * 4);
    const bufferAttribute = new THREE.StorageBufferAttribute(array, 4);
    const buffer = storage(bufferAttribute, 'vec4', count);

    // Define compute shader
    const computeShader = Fn(() => {
      const idx = instanceIndex;
      const data = buffer.element(idx);
      buffer.element(idx).assign(data.mul(2));
    })().compute(count);

    // Execute
    renderer.compute(computeShader);              // synchronous (per-frame)
    await renderer.computeAsync(computeShader);   // async (heavy one-off tasks)

### Compute → Render Pipeline

When compute shader output needs to be rendered (e.g., simulations, procedural geometry), use `StorageInstancedBufferAttribute` with `storage()` for writing and `attribute()` for reading.

    import { Fn, instanceIndex, storage, attribute, vec4 } from 'three/tsl';

    const COUNT = 1000;

    // 1. Create typed array and storage attribute
    const dataArray = new Float32Array(COUNT * 4);
    const dataAttribute = new THREE.StorageInstancedBufferAttribute(dataArray, 4);

    // 2. Create storage node for compute shader (write access)
    const dataStorage = storage(dataAttribute, 'vec4', COUNT);

    // 3. Define compute shader
    const computeShader = Fn(() => {
      const idx = instanceIndex;
      const current = dataStorage.element(idx);

      // Modify data...
      const newValue = current.xyz.add(vec3(0.01, 0, 0));

      dataStorage.element(idx).assign(vec4(newValue, current.w));
    })().compute(COUNT);

    // 4. Attach attribute to geometry for rendering
    const geometry = new THREE.BufferGeometry();
    // ... set up base geometry ...
    geometry.setAttribute('instanceData', dataAttribute);

    // 5. Read in material using attribute()
    const material = new THREE.MeshBasicNodeMaterial();
    material.positionNode = Fn(() => {
      const data = attribute('instanceData', 'vec4');
      return positionLocal.add(data.xyz);
    })();

    // 6. Create mesh
    const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
    scene.add(mesh);

    // 7. Animation loop
    await renderer.init();
    function animate() {
      renderer.compute(computeShader);
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();

### Updating Buffers from JavaScript

    // Modify the underlying array
    for (let i = 0; i < COUNT; i++) {
      dataArray[i * 4] = Math.random();
    }
    // Flag for GPU upload
    dataAttribute.needsUpdate = true;

---

## Example: Basic Material Shader

    import * as THREE from 'three/webgpu';
    import { Fn, uniform, vec3, vec4, float, uv, time,
             normalWorld, positionWorld, cameraPosition,
             mix, pow, dot, normalize, max } from 'three/tsl';

    // Uniforms
    const baseColor = uniform(new THREE.Color(0x4488ff));
    const fresnelPower = uniform(3.0);

    // Create material
    const material = new THREE.MeshStandardNodeMaterial();

    // Custom color with fresnel rim lighting
    material.colorNode = Fn(() => {
      // Calculate fresnel
      const viewDir = normalize(cameraPosition.sub(positionWorld));
      const NdotV = max(dot(normalWorld, viewDir), 0.0);
      const fresnel = pow(float(1.0).sub(NdotV), fresnelPower);

      // Mix base color with white rim
      const rimColor = vec3(1.0, 1.0, 1.0);
      const finalColor = mix(baseColor, rimColor, fresnel);

      return vec4(finalColor, 1.0);
    })();

    // Animated vertex displacement
    material.positionNode = Fn(() => {
      const pos = positionLocal.toVar();
      const wave = sin(pos.x.mul(4.0).add(time.mul(2.0))).mul(0.1);
      pos.y.addAssign(wave);
      return pos;
    })();

---

## Example: Compute Shader Structure

    import * as THREE from 'three/webgpu';
    import { Fn, instanceIndex, storage, uniform, vec4, float, sin, time } from 'three/tsl';

    const COUNT = 10000;

    // Storage buffer
    const dataArray = new Float32Array(COUNT * 4);
    const dataAttribute = new THREE.StorageBufferAttribute(dataArray, 4);
    const dataBuffer = storage(dataAttribute, 'vec4', COUNT);

    // Uniforms for compute
    const speed = uniform(1.0);

    // Compute shader
    const updateCompute = Fn(() => {
      const idx = instanceIndex;
      const data = dataBuffer.element(idx);

      // Read current values
      const position = data.xyz.toVar();
      const phase = data.w;

      // Update logic
      const offset = sin(time.mul(speed).add(phase)).mul(0.1);
      position.y.addAssign(offset);

      // Write back
      dataBuffer.element(idx).assign(vec4(position, phase));
    });

    const computeNode = updateCompute().compute(COUNT);

    // In animation loop:
    // renderer.compute(computeNode);

---

## Common Error Patterns

### ERROR: "If is not defined"

    // WRONG
    if(condition, () => {})
    // CORRECT
    If(condition, () => {})  // capital I

### ERROR: Cannot assign

    // WRONG
    const v = vec3(1,2,3);
    v.x = 5;
    // CORRECT
    const v = vec3(1,2,3).toVar();
    v.x.assign(5);

### ERROR: Type mismatch

    // WRONG
    sqrt(intValue)
    // CORRECT
    sqrt(intValue.toFloat())

### ERROR: Uniform not changing

    // WRONG
    myUniform = newValue;
    // CORRECT
    myUniform.value = newValue;

### ERROR: Import not found

    // WRONG
    import { vec3 } from 'three/nodes';
    import * as THREE from 'three';
    // CORRECT
    import { vec3 } from 'three/tsl';
    import * as THREE from 'three/webgpu';

### ERROR: Compute data not visible in render

    // WRONG: Using storage() in render material
    material.positionNode = storage(attr, 'vec4', count).element(idx).xyz;

    // CORRECT: Use attribute() to read in render shaders
    geometry.setAttribute('myData', attr);
    material.positionNode = attribute('myData', 'vec4').xyz;

### ERROR: Nothing renders

    // WRONG: Rendering before init
    renderer.render(scene, camera);

    // CORRECT: Always await init first
    await renderer.init();
    renderer.render(scene, camera);

---

## Quick Patterns

### Fresnel

    const fresnel = Fn(() => {
      const NdotV = normalize(cameraPosition.sub(positionWorld)).dot(normalWorld).max(0);
      return pow(float(1).sub(NdotV), 5);
    });

### Wave Displacement

    material.positionNode = Fn(() => {
      const p = positionLocal.toVar();
      p.y.addAssign(sin(p.x.mul(5).add(time)).mul(0.2));
      return p;
    })();

### UV Scroll

    material.colorNode = texture(map, uv().add(vec2(time.mul(0.1), 0)));

### Conditional Value

    const result = select(value.greaterThan(0.5), valueA, valueB);
    // OR branchless:
    const result = mix(valueB, valueA, step(0.5, value));

### Gradient Mapping

    const t = smoothstep(float(0.0), float(1.0), inputValue);
    const colorA = vec3(0.1, 0.2, 0.8);
    const colorB = vec3(1.0, 0.5, 0.2);
    const gradient = mix(colorA, colorB, t);

### Soft Falloff

    // Exponential falloff (good for glow, attenuation)
    const falloff = exp(distance.negate().mul(rate));

    // Inverse square falloff
    const attenuation = float(1.0).div(distance.mul(distance).add(1.0));

### Circular Mask (for sprites/points)

    const uvCentered = uv().sub(0.5).mul(2.0);  // -1 to 1
    const dist = length(uvCentered);
    const circle = smoothstep(float(1.0), float(0.8), dist);

---

## OceanHeightMap — Synchronizing Elements with the Ocean Surface

The project uses a render-to-texture heightmap (`OceanHeightMap`) to encode the live ocean surface height. Any element that needs to follow the ocean (waves, foam, floating objects, etc.) should sample this texture in its vertex shader.

### How the HeightMap Works

- An orthographic camera renders a `PlaneGeometry(1, 1, 200, 200)` scaled to `SCALE_OCEAN` (3000) in the XY plane.
- The vertex shader computes a wave `depth` from a sum-of-sines surface function and encodes it into varyings.
- The fragment shader writes to a `WebGLRenderTarget`:
  - **R** = `(depth + yStrength) / (2 * yStrength)` — normalized height [0,1]
  - **G** = same as R (average, for future use)
  - **B** = `yStrength / 100` — strength scaling factor
  - **A** = 1.0

### Uniforms Updated Each Frame (from Ocean `update()`)

    OceanHeightMap.uTimeWave.value  = this.uTimeWave.value
    OceanHeightMap.uDirTex.value    = GridManager.offsetUV
    OceanHeightMap.uYScale.value    = yScale
    OceanHeightMap.uYStrength.value = yStrength

### Sampling the HeightMap in a TSL positionNode

#### 1. Get the heightmap texture reference (at build time)

    import OceanHeightMap from '../Ocean/OceanHeightMap'
    const heightMapTex = OceanHeightMap.heightMap?.texture  // THREE.Texture from WebGLRenderTarget

#### 2. Map world X,Z to heightmap UV

The heightmap covers `[-SCALE_OCEAN/2, SCALE_OCEAN/2]` in world X and Z.

    // For a regular Mesh or Points:
    const wPos = modelWorldMatrix.mul(vec4(positionLocal, 1.0))

    // For an InstancedMesh — sample at instance CENTER, NOT per-vertex:
    const wCenter = modelWorldMatrix.mul(vec4(0.0, 0.0, 0.0, 1.0))

    const uScaleOcean = uniform(SCALE_OCEAN)
    const uvGrid = vec2(
      float(0.5).add(wCenter.x.div(uScaleOcean)),
      float(0.5).sub(wCenter.z.div(uScaleOcean)),
    )

**CRITICAL for InstancedMesh**: Use `vec4(0,0,0,1)` (instance origin) as the sampling point. Using `positionLocal` would sample at each vertex corner (±0.5 after scale), causing the quad to warp instead of displacing uniformly. The original GLSL `Points` shader used `position` which was the point center — `vec4(0,0,0,1)` is the equivalent for instanced geometry.

#### 3. 5-tap cross average (reduces flicker)

    const off = float(0.01)
    const hmC  = texture(heightMapTex, uvGrid)
    const hm1A = texture(heightMapTex, vec2(uvGrid.x.add(off), uvGrid.y))
    const hm1B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.add(off)))
    const hm2A = texture(heightMapTex, vec2(uvGrid.x.sub(off), uvGrid.y))
    const hm2B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.sub(off)))
    const avgH = hmC.r.add(hm1A.r).add(hm1B.r).add(hm2A.r).add(hm2B.r).div(5.0)

#### 4. Compute world-space Y displacement

    // Decode: (avgH - 0.5) * 2 * yStrength = depth (actual wave height)
    // B channel * 100 recovers yStrength
    const disp = avgH.sub(0.5).mul(2.0).mul(hmC.b.mul(100.0))

> **Note**: The original GLSL `waves.vert` used `(avgH - 0.5) * 2 * (B*100) * 2` because it applied the displacement in **clip space** (`gl_Position.y +=`), where the trailing `*2` gets naturally attenuated by perspective divide. In world space, omit the trailing `*2`.

#### 5. Apply displacement

**For a standard Mesh** (local Y ≈ world Y):

    const pos = positionLocal.toVar()
    pos.y.addAssign(disp)
    return pos

**For a billboarded InstancedMesh** (local Y ≠ world Y due to billboard rotation):

    // Transform world-Y displacement to instance-local space
    const worldDispVec = vec4(0.0, disp, 0.0, 0.0)  // w=0 for direction
    const localDisp = modelWorldMatrixInverse.mul(worldDispVec)
    return positionLocal.add(localDisp.xyz)

Required imports for this pattern:

    import { positionLocal, modelWorldMatrix, modelWorldMatrixInverse } from 'three/tsl'

### Complete positionNode Example (InstancedMesh with Billboard)

    const positionNodeFn = Fn(() => {
      const pos = positionLocal
      const wCenter = modelWorldMatrix.mul(vec4(0.0, 0.0, 0.0, 1.0))

      const uvGrid = vec2(
        float(0.5).add(wCenter.x.div(uScaleOcean)),
        float(0.5).sub(wCenter.z.div(uScaleOcean)),
      )

      const off = float(0.01)
      const hmC  = texture(heightMapTex, uvGrid)
      const hm1A = texture(heightMapTex, vec2(uvGrid.x.add(off), uvGrid.y))
      const hm1B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.add(off)))
      const hm2A = texture(heightMapTex, vec2(uvGrid.x.sub(off), uvGrid.y))
      const hm2B = texture(heightMapTex, vec2(uvGrid.x, uvGrid.y.sub(off)))

      const avgH = hmC.r.add(hm1A.r).add(hm1B.r).add(hm2A.r).add(hm2B.r).div(5.0)
      const disp = avgH.sub(0.5).mul(2.0).mul(hmC.b.mul(100.0))

      const worldDispVec = vec4(0.0, disp, 0.0, 0.0)
      const localDisp = modelWorldMatrixInverse.mul(worldDispVec)
      return pos.add(localDisp.xyz)
    })

    material.positionNode = positionNodeFn()

### Points → InstancedMesh Migration Notes

WebGPU does not support `gl_PointCoord` or variable `gl_PointSize` like WebGL. **`PointsNodeMaterial.sizeNode` has no effect** — points render as 1×1 pixel regardless. When converting `Points`-based effects:

**Preferred:** Use **SpriteNodeMaterial** with `InstancedMesh` + `PlaneGeometry(1, 1)` and `InstancedBufferAttribute` for `instancePosition` (see "Converting Points / point-like particles" above). Billboarding is then automatic; no CPU `billboardToCamera` or `setMatrixAt` needed.

If you cannot use SpriteNodeMaterial:

1. Replace `Points` with `InstancedMesh` using `PlaneGeometry(1, 1)`.
2. Replace `gl_PointCoord` with `uv()`.
3. Use `instanceIndex` or `InstancedBufferAttribute` for per-instance variation. Use `hash(instanceIndex)` for pseudo-random per-instance values.
4. Billboard rotation must be done on CPU (update instance matrices each frame with `lookAt` toward camera).
5. When billboarding on CPU, UV Y may need flipping: `float(1).sub(uv().y)`.
6. For transparent instances, sort back-to-front by camera depth each frame.

### Converting `gl_PointSize` to World-Space Scale

The original `gl_PointSize` formula gives a pixel size that shrinks with distance:

    gl_PointSize = uSize * (perspectiveFactor / -mvPosition.z)

For `InstancedMesh`, the quad scale is in **world units** and perspective is handled by the camera projection. Both `gl_PointSize` and world-space objects scale as `1/distance`, so the conversion is a constant factor.

**Formula:**

    SPRITE_SCALE = uSize * perspectiveFactor * 2 * tan(fov / 2) / screenHeight

Since `fov` and `screenHeight` are runtime values, derive the conversion factor `C` from one known-good conversion and apply to others:

    C = knownWorldScale / (knownUSize * knownPerspectiveFactor)
    newWorldScale = newUSize * newPerspectiveFactor * C

**This project's reference** (FOV = 50°):

| Component  | Original `uSize` | Perspective factor | K = uSize × factor | World scale (`SPRITE_SCALE`) |
|------------|-------------------|--------------------|---------------------|-------------------------------|
| Waves      | 450               | 100                | 45,000              | 15                            |
| Lightnings | 1000              | 400                | 400,000             | 133                           |
| Stars      | 50                | 100                | 5,000               | ~2                            |

    C = 15 / 45000 = 1/3000  →  SPRITE_SCALE = K / 3000

---

## GLSL → TSL Migration

| GLSL | TSL |
|------|-----|
| `position` | `positionGeometry` |
| `transformed` | `positionLocal` |
| `transformedNormal` | `normalLocal` |
| `vWorldPosition` | `positionWorld` |
| `vColor` | `vertexColor()` |
| `vUv` / `uv` | `uv()` |
| `vNormal` | `normalView` |
| `viewMatrix` | `cameraViewMatrix` |
| `modelMatrix` | `modelWorldMatrix` |
| `modelViewMatrix` | `modelViewMatrix` |
| `projectionMatrix` | `cameraProjectionMatrix` |
| `diffuseColor` | `material.colorNode` |
| `gl_FragColor` | `material.fragmentNode` |
| `texture2D(tex, uv)` | `texture(tex, uv)` |
| `textureCube(tex, dir)` | `cubeTexture(tex, dir)` |
| `gl_FragCoord` | `screenCoordinate` |
| `gl_PointCoord` | `uv()` in SpriteNodeMaterial/PointsNodeMaterial |
| `gl_InstanceID` | `instanceIndex` |
