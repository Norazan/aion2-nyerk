/**
 * Compile the bundle loader: src/loader/index.ts -> out/loader/index.js, one self-contained CommonJS
 * file (as marnis-app's scripts/build-loader.mjs).
 *
 * Not built by electron-vite, because of where it must not end up: electron-vite writes out/main,
 * and out/main is inside the bundle. The loader belongs to the shell, so it is built beside it.
 * esbuild is already here as Vite's own. `npm run build` runs this first: package.json's `main`
 * points at its output.
 */
import { build } from 'esbuild'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))

await build({
  entryPoints: [join(APP, 'src/loader/index.ts')],
  outfile: join(APP, 'out/loader/index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  legalComments: 'none',
  logLevel: 'warning',
})
console.log('loader built')
