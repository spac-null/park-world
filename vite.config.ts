import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
  },
  assetsInclude: ['**/*.wasm'],
})
