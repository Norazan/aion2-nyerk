/** Native helper locations and process cleanup, kept independent of Electron. */
import { spawnSync, type ChildProcess } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

export function validHelperOverride(path: string): boolean {
  try {
    if (!isAbsolute(path) || !statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function helperExecutable(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'aion2-tracker.exe' : 'aion2-tracker'
}

export function venvPython(root: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? join(root, '.venv', 'Scripts', 'python.exe') : join(root, '.venv', 'bin', 'python')
}

/** POSIX helpers are spawned in their own process group, including PyInstaller's children. */
export function killTrackerTree(proc: ChildProcess, platform: NodeJS.Platform = process.platform): void {
  if (proc.pid === undefined) return
  if (platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true })
    return
  }
  try {
    process.kill(-proc.pid, 'SIGKILL')
  } catch (err) {
    // A helper which has already exited has nothing left to kill.
    if ((err as NodeJS.ErrnoException).code !== 'ESRCH') proc.kill('SIGKILL')
  }
}

/** Retain gracefully stopping helpers until exit, including when the app itself is quitting. */
export class TrackerCleanup {
  private pending = new Set<ChildProcess>()

  waitForExit(proc: ChildProcess, timeoutMs = 1500): void {
    if (proc.exitCode !== null || proc.signalCode !== null) return
    this.pending.add(proc)
    const timer = setTimeout(() => {
      if (this.pending.delete(proc)) killTrackerTree(proc)
    }, timeoutMs)
    timer.unref()
    proc.once('exit', () => {
      clearTimeout(timer)
      this.pending.delete(proc)
    })
  }

  killAll(): void {
    for (const proc of this.pending) killTrackerTree(proc)
    this.pending.clear()
  }
}

/** The existing feed publishes Windows builds; Linux installs update manually. */
export function supportsAutomaticUpdates(platform: NodeJS.Platform, packaged: boolean): boolean {
  return packaged && platform === 'win32'
}
