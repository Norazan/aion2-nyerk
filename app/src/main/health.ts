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

/**
 * Each window's page, as last loaded. A renderer that was killed loses it: `reload()` on it then
 * navigates nowhere (the HUD came back blank in testing), so recovery loads this instead.
 */
const pages = new Map<number, string>()

function label(contents: WebContents): string {
  return (pages.get(contents.id) ?? contents.getURL()).split('#/')[1] || 'window'
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
    contents.on('did-finish-load', () => {
      const url = contents.getURL()
      if (url) pages.set(contents.id, url)
    })
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
