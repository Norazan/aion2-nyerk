/** KDE's ordinary ABOVE layer remains below active fullscreen games. */
import { execFileSync } from 'node:child_process'

const OVERLAY_TYPE = '_KDE_NET_WM_WINDOW_TYPE_CRITICAL_NOTIFICATION'
type RunXprop = (args: string[]) => void

function runXprop(args: string[]): void {
  execFileSync('xprop', args, { timeout: 1500, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

function kdeSession(env: NodeJS.ProcessEnv): boolean {
  const desktops = (env['XDG_CURRENT_DESKTOP'] ?? '').split(/[:;]/).map((name) => name.trim().toUpperCase())
  return desktops.some((name) => name === 'KDE' || name === 'PLASMA')
    || /^(true|1)$/i.test(env['KDE_FULL_SESSION'] ?? '')
}

export class LinuxStacking {
  private unavailable = false
  private platform: NodeJS.Platform
  private env: NodeJS.ProcessEnv
  private run: RunXprop

  constructor(
    platform: NodeJS.Platform = process.platform,
    env: NodeJS.ProcessEnv = process.env,
    run: RunXprop = runXprop,
  ) {
    this.platform = platform
    this.env = env
    this.run = run
  }

  /** Call while this Nyerk overlay is hidden, before its first map; never pass a game handle. */
  apply(nativeHandle: Buffer): string | null {
    if (this.platform !== 'linux' || !kdeSession(this.env) || this.unavailable) return null
    // Electron exposes the native X11 unsigned long: four bytes, or eight with a zero high word.
    if ((nativeHandle.length !== 4 && nativeHandle.length !== 8)
      || (nativeHandle.length === 8 && nativeHandle.readUInt32LE(4) !== 0)
      || nativeHandle.readUInt32LE(0) === 0) {
      return 'KDE overlay priority was not applied: invalid native X11 window handle.'
    }
    const id = `0x${nativeHandle.readUInt32LE(0).toString(16)}`
    try {
      // KWin supports this managed window type without advertising it in _NET_SUPPORTED.
      // Unlike its OSD type, it does not recenter a HUD whenever its content changes size.
      this.run(['-id', id, '-f', '_NET_WM_WINDOW_TYPE', '32a', '-set', '_NET_WM_WINDOW_TYPE', OVERLAY_TYPE])
      return `KDE overlay priority applied to window ${id}.`
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { status?: number }
      if (failure.code === 'ENOENT') {
        this.unavailable = true
        return 'KDE overlay priority unavailable: install xorg-xprop (Arch/CachyOS) or x11-utils (Debian/Ubuntu), then restart Nyerk.'
      }
      if (failure.code === 'EACCES' || failure.code === 'ETIMEDOUT') {
        this.unavailable = true
        return `KDE overlay priority unavailable: xprop ${failure.code === 'EACCES' ? 'could not be executed' : 'timed out'}; normal always-on-top remains in use.`
      }
      // One window can close during setup; do not disable priority for other valid overlays.
      return `KDE overlay priority could not be applied to window ${id}${typeof failure.status === 'number' ? ` (xprop exit ${failure.status})` : ''}.`
    }
  }
}
