import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// Three builds from one config: main and preload are Node targets, the renderer a Vite web build.
// `@shared` resolves from all three, so the IPC contract is one file rather than three copies.
//
// No externalizeDepsPlugin: the npm dependencies are compiled in (scripts/inline-deps.mjs makes
// sure of it after the build). out/ is an app bundle that can be published on its own
// (shared/bundle.ts), and a bundle runs from <userData>/bundles, where a bare
// require('electron-store') would never find the install's node_modules.
const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
  },
  preload: {
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
