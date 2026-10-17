/**
 * Fold the npm dependencies into the built main process and preload, in place (as marnis-app's
 * scripts/inline-deps.mjs).
 *
 * A bundle runs from `<userData>/bundles/<version>/bundle.asar`, and Node resolves a bare
 * `require('electron-store')` by walking up from there, never reaching the install's node_modules.
 * So nothing may be left to resolve at run time but `electron` and Node's own modules; anything else
 * fails the build here rather than an update in the field. It runs on every build, so the installer
 * and a bundle carry the same bytes.
 */
import { build } from 'esbuild'
import { rename, stat } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
const TARGETS = ['out/main/index.js', 'out/preload/index.js']
const external = ['electron', ...builtinModules.flatMap((m) => [m, `node:${m}`])]
const allowed = new Set(external)

for (const relative of TARGETS) {
  const path = join(APP, relative)
  const before = (await stat(path)).size
  const flat = `${path}.flat`
  const result = await build({
    entryPoints: [path],
    outfile: flat,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external,
    legalComments: 'none',
    logLevel: 'warning',
    metafile: true,
  })
  const unresolved = new Set()
  for (const output of Object.values(result.metafile.outputs)) {
    for (const imported of output.imports ?? []) if (imported.external && !allowed.has(imported.path)) unresolved.add(imported.path)
  }
  if (unresolved.size > 0) {
    console.error(`${relative} would still resolve these at run time: ${[...unresolved].join(', ')}`)
    process.exit(1)
  }
  await rename(flat, path)
  console.log(`${relative}  ${(before / 1024).toFixed(0)} kB -> ${((await stat(path)).size / 1024).toFixed(0)} kB`)
}
