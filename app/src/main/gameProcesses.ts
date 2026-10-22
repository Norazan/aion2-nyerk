/** Process-list helpers shared by the watcher and its tests; no game memory is read. */
import { readdir, readFile, readlink } from 'node:fs/promises'
import { join } from 'node:path'

const GAME_EXE = /^aion2(-win64-shipping)?\.exe$/i
const WINE_EXE = /^(wine(64)?(-preloader)?|wine-preloader)$/i

function executableName(path: string): string {
  return path.replace(/\\/g, '/').split('/').at(-1) ?? ''
}

export function isGameExecutable(path: string): boolean {
  return GAME_EXE.test(executableName(path))
}

/** Wine normally puts the Windows executable in argv[0], or directly after wine/wine64. */
export function isGameCommand(command: readonly string[]): boolean {
  const first = command[0]
  if (!first) return false
  if (isGameExecutable(first)) return true
  return WINE_EXE.test(executableName(first)) && Boolean(command[1] && isGameExecutable(command[1]))
}

/** Procfs entries may disappear or be inaccessible between enumeration and reading. */
export async function findLinuxGame(procRoot = '/proc'): Promise<number | null> {
  let entries: string[]
  try {
    entries = await readdir(procRoot)
  } catch {
    return null
  }
  for (const entry of entries) {
    if (!/^[1-9]\d*$/.test(entry)) continue
    const dir = join(procRoot, entry)
    try {
      // A native launcher may retain its own path here; Wine's argv identifies the guest.
      const exe = await readlink(join(dir, 'exe')).catch(() => '')
      if (isGameExecutable(exe)) return Number(entry)
      const command = (await readFile(join(dir, 'cmdline'), 'utf8')).split('\0')
      if (isGameCommand(command)) return Number(entry)
    } catch {
      // Exited processes and another user's protected processes are expected.
    }
  }
  return null
}

export function parseWindowsGamePid(output: string): number | null {
  for (const line of output.split(/\r?\n/)) {
    const match = /^"([^"]+)","(\d+)"/.exec(line)
    if (match && isGameExecutable(match[1]!)) return Number(match[2])
  }
  return null
}
