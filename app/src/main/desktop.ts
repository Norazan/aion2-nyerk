import type { BrowserWindowConstructorOptions } from 'electron'

/** Desktop startup configuration, before app readiness or the first BrowserWindow. */
interface DesktopApp {
  commandLine: { getSwitchValue(name: string): string }
  setAppUserModelId(id: string): void
  disableHardwareAcceleration(): void
  relaunch(options: { args: string[] }): void
  exit(code: number): void
}

export function configureDesktop(
  app: DesktopApp,
  platform: NodeJS.Platform = process.platform,
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // Apply the supported software-rendering mode before app readiness. This also avoids the
  // initial GPU startup attempt on drivers that cannot load Mesa/GBM inside Chromium.
  if (argv.includes('--disable-gpu') || env['NYERK_SOFTWARE_RENDERING'] === '1') app.disableHardwareAcceleration()
  if (platform === 'linux') {
    // Electron initializes Ozone before loading JavaScript. Changing this switch here can make
    // browser windows use Wayland widgets while rendering tries to treat them as X11 window IDs.
    // Relaunch with the flag on the actual command line instead; no windows/helper exist yet.
    if (app.commandLine.getSwitchValue('ozone-platform') !== 'x11') {
      if (argv.includes('--ozone-platform=x11')) {
        console.error('Nyerk could not initialize X11. Check DISPLAY and that X11/XWayland is installed.')
        app.exit(1)
        return false
      }
      const args: string[] = []
      for (let i = 1; i < argv.length; i++) {
        const arg = argv[i]!
        if (arg === '--ozone-platform') { i++; continue }
        if (!arg.startsWith('--ozone-platform=')) args.push(arg)
      }
      args.push('--ozone-platform=x11')
      app.relaunch({ args })
      app.exit(0)
      return false
    }
  } else if (platform === 'win32') {
    app.setAppUserModelId('com.xcrov.aion2-drop-tracker')
  }
  return true
}

/** The collection panel must work as a normal window even when desktop alpha compositing fails. */
export function panelDesktopOptions(platform: NodeJS.Platform = process.platform): BrowserWindowConstructorOptions {
  return platform === 'linux'
    ? { transparent: false, backgroundColor: '#0f101a', skipTaskbar: false, minimizable: true }
    : {}
}

interface PanelWindow {
  webContents: { isLoading(): boolean }
  once(event: 'ready-to-show', listener: () => void): unknown
}

export function revealPanel(win: PanelWindow, reveal: () => void, platform: NodeJS.Platform = process.platform): void {
  // A hidden window's first GPU paint may never arrive when the driver is crashing. The opaque
  // Linux panel can be mapped immediately and paint its contents when loading finishes.
  if (platform === 'linux' || !win.webContents.isLoading()) reveal()
  else win.once('ready-to-show', reveal)
}

interface HudWindow {
  setIgnoreMouseEvents(ignore: boolean): void
  setFocusable(focusable: boolean): void
  isFocused(): boolean
  blur(): void
}

/** End both mouse and keyboard interaction when an overlay leaves move mode. */
export function applyHudInputMode(win: HudWindow, editing: boolean, platform: NodeJS.Platform = process.platform): void {
  win.setIgnoreMouseEvents(!editing)
  if (platform === 'linux') {
    // Linux cannot change focusability after construction. Mouse click-through alone leaves
    // an edited HUD holding keyboard focus; blur only that HUD, preserving any focused panel.
    if (!editing && win.isFocused()) win.blur()
  } else {
    win.setFocusable(editing)
  }
}
