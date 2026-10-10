/**
 * Build the tracker helper the installed app runs: PyInstaller over packaging/sidecar.spec, into
 * ../build/sidecar/aion2-tracker (no Python needed on the user's PC). Needs the repo's .venv with
 * pyinstaller (`pip install pyinstaller`).
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const pyinstaller = join(ROOT, '.venv', 'Scripts', 'pyinstaller.exe')
if (!existsSync(pyinstaller)) throw new Error(`${pyinstaller} not found: pip install pyinstaller in the repo's .venv`)
execFileSync(
  pyinstaller,
  ['sidecar.spec', '--noconfirm', '--distpath', join(ROOT, 'build', 'sidecar'), '--workpath', join(ROOT, 'build', 'pyi')],
  { cwd: join(ROOT, 'packaging'), stdio: 'inherit' },
)
