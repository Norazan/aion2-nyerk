/** Desktop startup configuration, before app readiness or the first BrowserWindow. */
interface DesktopApp {
  commandLine: { appendSwitch(name: string, value: string): void }
  setAppUserModelId(id: string): void
}

export function configureDesktop(app: DesktopApp, platform: NodeJS.Platform = process.platform): void {
  if (platform === 'linux') {
    // Native Wayland deliberately forbids global window placement and raising windows. The HUD
    // needs both, so use native Linux Electron's X11 backend (XWayland on a Wayland desktop).
    // Never disable Chromium's sandbox to achieve this.
    app.commandLine.appendSwitch('ozone-platform', 'x11')
  } else if (platform === 'win32') {
    app.setAppUserModelId('com.xcrov.aion2-drop-tracker')
  }
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
