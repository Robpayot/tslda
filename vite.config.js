import { defineConfig } from 'vite'
import glslify from 'rollup-plugin-glslify'
import * as path from 'path'

export default ({ mode }) => {
  return defineConfig({
    root: 'src',
    base: mode === 'development' ? '/zelda-project/' : './',
    build: {
      outDir: '../dist',
      sourcemap: true,
    },
    server: {
      host: true,
    },
    resolve: {
      alias: [
        { find: '@glsl', replacement: path.resolve(__dirname, './src/js/glsl') },
        { find: '@', replacement: path.resolve(__dirname, './src') },
        { find: /^three$/, replacement: path.resolve(__dirname, 'node_modules/three/build/three.webgpu.js') },
        { find: /^three\/tsl$/, replacement: path.resolve(__dirname, 'node_modules/three/build/three.tsl.js') },
      ],
    },
    plugins: [glslify()],
  })
}
