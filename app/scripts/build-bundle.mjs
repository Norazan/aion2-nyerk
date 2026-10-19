/**
 * Pack the built app into a bundle: out/main, out/preload, out/renderer and out/addons into
 * dist-bundle/bundle-<version>.asar (as marnis-app's scripts/build-bundle.mjs).
 *
 *   node scripts/build-bundle.mjs      after `npm run build`
 *
 * The layout inside the asar is the layout inside out/, so main/index.js finds ../preload and
 * ../renderer exactly as it does in the install. Left out is the shell: Electron, the tracker helper
 * and out/loader. dist-bundle/ rather than dist/, which electron-builder empties.
 */
import { createPackage } from '@electron/asar'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
const PARTS = ['main', 'preload', 'renderer', 'addons']

export async function buildBundle() {
  const { version } = JSON.parse(await readFile(join(APP, 'package.json'), 'utf8'))
  for (const part of PARTS) if (!existsSync(join(APP, 'out', part))) throw new Error(`out/${part} is not there. Run: npm run build`)
  const staging = await mkdtemp(join(tmpdir(), 'nyerk-bundle-'))
  try {
    for (const part of PARTS) await cp(join(APP, 'out', part), join(staging, part), { recursive: true })
    await mkdir(join(APP, 'dist-bundle'), { recursive: true })
    const file = `bundle-${version}.asar`
    const path = join(APP, 'dist-bundle', file)
    await rm(path, { force: true })
    await createPackage(staging, path)
    const bytes = await readFile(path)
    return { version, file, path, size: (await stat(path)).size, sha512: createHash('sha512').update(bytes).digest('base64') }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/build-bundle.mjs')) {
  const bundle = await buildBundle()
  console.log(`${bundle.file}  ${(bundle.size / 1e6).toFixed(2)} MB\n${bundle.path}`)
}
