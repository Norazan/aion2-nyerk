import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// Three builds from one config: main and preload are Node targets, the renderer a Vite web build.
// `@shared` resolves from all three, so the IPC contract is one file rather than three copies.
const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
  },
  renderer: {
    // Minified output ships no comments: the built CSS is what an installed copy carries.
    build: { minify: 'esbuild', cssMinify: 'esbuild' },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': shared,
      },
    },
    plugins: [vue()],
  },
})
