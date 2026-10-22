/**
 * Keeping the overlays alive, and leaving a trace when they are not.
 *
 * The windows froze in play on 2026-10-10 (the HUD stopped changing and the bubble stopped
 * opening the panel) while the tracker kept counting. Two causes fit, and both are handled here:
 *
 * - a window's renderer or the GPU process dying under a heavy game. Chromium starts a new GPU
 *   process by itself, but transparent windows can be left without a picture: each window is
 *   reloaded so it repaints, and a dead renderer gets its window reloaded too;
 * - the main process blocked, which the event-loop lag check logs when it goes over a second.
 *
 * Everything lands in logs/tracker.log.
 */
import { app, BrowserWindow, type WebContents } from 'electron'
import { log } from './tracker.ts'
import { rebuildWindow } from './windows.ts'

const LAG_CHECK_MS = 1000
const LAG_REPORT_MS = 1000
const HANG_CHECK_MS = 15_000
const HANG_MS = 5_000
const MAX_WINDOW_NOTES = 32
const MAX_RENDER_ERRORS = 10

/** Keep diagnostic records short and on one line. */
const detail = (value: string): string => value.replace(/\s+/g, ' ').slice(0, 700)

/** Electron can forward a child frame's console as the main frame: also check its script URL. */
function ownRendererSource(contents: WebContents, sourceId: string): boolean {
  try {
    const page = new URL(contents.getURL())
    const source = new URL(sourceId)
    if (source.protocol !== page.protocol || source.host !== page.host) return false
    return source.pathname === page.pathname
      || source.pathname.startsWith(new URL('./assets/', page).pathname)
      || (!app.isPackaged && source.pathname.startsWith(new URL('./src/', page).pathname))
  } catch {
    return false
  }
}

/**
 * Each window's page, as last loaded. A renderer that was killed loses it: `reload()` on it then
 * navigates nowhere (the HUD came back blank in testing), so recovery loads this instead.
 */
const pages = new Map<number, string>()

function label(contents: WebContents): string {
  const route = (pages.get(contents.id) ?? contents.getURL()).split('#/')[1] || 'window'
  return `${route}#${contents.id}`
}

function restore(contents: WebContents, why: string): void {
  if (contents.isDestroyed()) return
  const url = pages.get(contents.id)
  log(`health: reloading ${label(contents)} (${why})`)
  if (url) void contents.loadURL(url)
  else contents.reload()
}

/** A fresh window in place of one whose renderer is gone or frozen (see rebuildWindow). */
function rebuild(contents: WebContents, why: string): void {
  const win = contents.isDestroyed() ? null : BrowserWindow.fromWebContents(contents)
  if (!win) return
  const which = rebuildWindow(win)
  log(`health: rebuilt ${which ?? label(contents)} (${why})`)
}

function reloadAll(why: string): void {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) restore(win.webContents, why)
}

export function startHealthWatch(): void {
  const softwareRequested = app.commandLine.hasSwitch('disable-gpu') || process.env['NYERK_SOFTWARE_RENDERING'] === '1'
  log(`health: desktop ${process.platform}; Electron ${process.versions.electron}; display backend ${app.commandLine.getSwitchValue('ozone-platform') || 'default'}; software rendering requested=${softwareRequested}`)
  let lastGPUStatus = ''
  const logGPUStatus = (): void => {
    const features = app.getGPUFeatureStatus()
    const status = JSON.stringify({
      hardwareAcceleration: app.isHardwareAccelerationEnabled(),
      compositing: features.gpu_compositing,
      rasterization: features.rasterization,
      webgl: features.webgl,
    })
    if (status !== lastGPUStatus) {
      lastGPUStatus = status
      log(`health: graphics ${status}`)
    }
  }
  app.on('gpu-info-update', logGPUStatus)
  logGPUStatus()
  app.on('child-process-gone', (_event, details) => {
    log(`health: ${details.type} process gone: ${details.reason} (exit ${details.exitCode})`)
    if (details.type === 'GPU') {
      // Give Chromium a moment to start the new GPU process, then make every window repaint.
      setTimeout(() => reloadAll('the GPU process restarted'), 1500)
    }
  })

  app.on('render-process-gone', (_event, contents, details) => {
    log(`health: ${label(contents)} renderer gone: ${details.reason} (exit ${details.exitCode})`)
    if (details.reason !== 'clean-exit') setTimeout(() => rebuild(contents, 'its renderer was gone'), 500)
  })

  app.on('browser-window-created', (_event, win) => {
    const contents = win.webContents
    let windowNotes = 0
    let renderErrors = 0
    const noteWindow = (event: string): void => {
      if (win.isDestroyed()) return
      if (windowNotes++ < MAX_WINDOW_NOTES) {
        const { x, y, width, height } = win.getBounds()
        log(`health: ${label(contents)} ${event}; visible=${win.isVisible()} minimized=${win.isMinimized()} bounds=${x},${y} ${width}x${height}`)
      } else if (windowNotes === MAX_WINDOW_NOTES + 1) {
        log(`health: ${label(contents)} further visibility notes suppressed`)
      }
    }
    contents.on('did-start-loading', () => { renderErrors = 0 })
    contents.on('did-finish-load', () => {
      const url = contents.getURL()
      if (url) pages.set(contents.id, url)
      noteWindow('loaded')
    })
    contents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
      if (mainFrame) log(`health: ${label(contents)} main page failed to load (${code} ${detail(description)})`)
    })
    contents.on('preload-error', (_event, _path, error) => {
      log(`health: ${label(contents)} preload failed: ${detail(error.message)}`)
    })
    contents.on('console-message', (event) => {
      // Addon frames can log arbitrary application data. Only record errors from Nyerk's own
      // main frame, capped per load, so a broken renderer is visible without dumping consoles.
      if (event.level !== 'error' || contents.isDestroyed() || event.frame !== contents.mainFrame || !ownRendererSource(contents, event.sourceId)) return
      if (renderErrors++ < MAX_RENDER_ERRORS) {
        log(`health: ${label(contents)} renderer error: ${detail(event.message)}`)
      } else if (renderErrors === MAX_RENDER_ERRORS + 1) {
        log(`health: ${label(contents)} further renderer errors suppressed`)
      }
    })
    win.on('ready-to-show', () => noteWindow('ready to show'))
    win.on('show', () => noteWindow('shown'))
    win.on('hide', () => noteWindow('hidden'))
    win.on('minimize', () => noteWindow('minimized'))
    win.on('restore', () => noteWindow('restored'))
    win.on('closed', () => pages.delete(contents.id))
    win.on('unresponsive', () => log(`health: ${label(win.webContents)} is not responding`))
    win.on('responsive', () => log(`health: ${label(win.webContents)} is responding again`))
  })

  // A hung renderer. Electron's 'unresponsive' only fires on input a page fails to handle, and the
  // HUD is click-through, so it never gets any: a HUD frozen this way was never noticed. Each
  // window is asked to run a trivial script; one that cannot answer in time is replaced by a new
  // window. Found 2026-10-10 by freezing the HUD's renderer on purpose (CDP Page.crash): reload,
  // loadURL and killing the process all left it frozen; a rebuilt window came back.
  const busy = new Set<number>()
  setInterval(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      const contents = win.webContents
      if (win.isDestroyed() || contents.isLoading() || busy.has(contents.id)) continue
      busy.add(contents.id)
      let answered = false
      void contents.executeJavaScript('1', true).then(() => (answered = true), () => (answered = true))
      setTimeout(() => {
        busy.delete(contents.id)
        if (answered || contents.isDestroyed()) return
        log(`health: ${label(contents)} did not answer for ${HANG_MS / 1000} s`)
        rebuild(contents, 'its renderer stopped answering')
      }, HANG_MS).unref()
    }
  }, HANG_CHECK_MS).unref()

  // The main process's own event loop: a timer that fires late means something held it up.
  let expected = Date.now() + LAG_CHECK_MS
  setInterval(() => {
    const lag = Date.now() - expected
    if (lag > LAG_REPORT_MS) log(`health: main process was blocked for ${lag} ms`)
    expected = Date.now() + LAG_CHECK_MS
  }, LAG_CHECK_MS).unref()
}
