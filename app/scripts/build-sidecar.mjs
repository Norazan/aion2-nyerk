/**
 * Build the tracker helper the installed app runs: PyInstaller over packaging/sidecar.spec, into
 * ../build/sidecar/aion2-tracker (no Python needed on the user's PC). Run on the target OS:
 * PyInstaller cannot cross-compile a Windows helper from Linux or vice versa.
 * Needs the repo's .venv with pyinstaller (`python -m pip install pyinstaller`).
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const python = process.platform === 'win32'
  ? join(ROOT, '.venv', 'Scripts', 'python.exe')
  : join(ROOT, '.venv', 'bin', 'python')
if (!existsSync(python)) throw new Error(`${python} not found: create the repo's .venv and install pyinstaller`)
execFileSync(
  python,
  ['-m', 'PyInstaller', 'sidecar.spec', '--noconfirm', '--distpath', join(ROOT, 'build', 'sidecar'), '--workpath', join(ROOT, 'build', 'pyi')],
  { cwd: join(ROOT, 'packaging'), stdio: 'inherit' },
)
