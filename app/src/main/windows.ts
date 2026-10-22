/**
 * The app's three windows, all loading the same renderer on different routes:
 *
 *   bubble  #/bubble  a small floating icon: drag it anywhere, click it to open the panel
 *   panel   #/panel   the app itself: collection, session, settings; opens beside the bubble
 *   hud       #/hud       the in-game overlay: click-through, sized to its content
 *   merchant  #/merchant  the Black Cloud Merchant's pets worth buying: opened when a tab of the
 *                         shop is, always movable, closed with its X
 *   addonhud  #/addonhud/<id>  an addon's HUD section detached from the HUD: a HUD of its own,
 *                         click-through, sized to its content, moved like the HUD
 *
 * Windows overlays use the 'screen-saver' level; KDE overlays use its critical-notification
 * type to sit above the active fullscreen game. Other Linux desktops use normal always-on-top.
 * Overlays use showInactive() so they never take focus from the game, and each window is only
 * as large as what it shows. A big transparent window made the game drop frames on every alt-tab.
 *
 * While the game is closed the bubble and the HUD do not exist at all (idle.ts): the panel can
 * still be opened from the tray, where the bubble would be.
 */
import { app, BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { join } from 'node:path'
import { broadcast } from './broadcast.ts'
import { applyHudInputMode, panelDesktopOptions, revealPanel } from './desktop.ts'
import { featureOn } from './builtins.ts'
import { LinuxStacking } from './linuxStacking.ts'
import { settings } from './settings.ts'
import { log, tracker } from './tracker.ts'
import type { EventChannels } from '../shared/ipc.ts'
import type { Point } from '../shared/settings.ts'
import type { TimerId } from '../shared/timers.ts'

const BUBBLE_SIZE = 64
const PANEL_GAP = 8
/** The panel's size while a map is open in it. */
const PANEL_EXPANDED = { width: 900, height: 680 }
const EDGE = 24
const linuxStacking = new LinuxStacking()

let bubble: BrowserWindow | null = null
let panel: BrowserWindow | null = null
let hud: BrowserWindow | null = null
let merchant: BrowserWindow | null = null
let killFeed: BrowserWindow | null = null
let merchantSize = { width: 0, height: 0 }
let panelExpanded = false
let hudEditing = false
let hudSize = { width: 0, height: 0 }
/** The panel's tab, as the panel last said: an update restart reopens it there. */
let tab: string | null = null
let quitting = false
const panelListeners = new Set<(visible: boolean) => void>()

/** Told when the panel is shown or hidden. */
export function onPanelVisible(fn: (visible: boolean) => void): () => void {
  panelListeners.add(fn)
  return () => panelListeners.delete(fn)
}

export function panelVisible(): boolean {
  return alive(panel) && panel.isVisible() && !panel.isMinimized()
}

export function markQuitting(): void {
  quitting = true
}

const alive = (w: BrowserWindow | null): w is BrowserWindow => w !== null && !w.isDestroyed()

function overlayWindow(options: Electron.BrowserWindowConstructorOptions, overlay = true): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    icon: join(__dirname, '../renderer/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Overlays spend a lot of time hidden or behind the game; a throttled renderer stops
      // laying out and observing, and then never asks to be shown again.
      backgroundThrottling: false,
      // The timers' chime plays without a click first (Chromium's default wants one).
      autoplayPolicy: 'no-user-gesture-required',
    },
    ...options,
  })
  if (process.platform === 'linux') win.setAlwaysOnTop(options.alwaysOnTop ?? true)
  else win.setAlwaysOnTop(options.alwaysOnTop ?? true, 'screen-saver')
  if (overlay) {
    // KWin chooses a stacking layer when the window is first mapped. Set this while hidden;
    // the collection panel stays a normal window with taskbar access and keyboard focus.
    const note = linuxStacking.apply(win.getNativeWindowHandle())
    if (note) log(note)
  }
  // Electron only implements screen-capture exclusion on Windows and macOS.
  if (process.platform !== 'linux') win.setContentProtection(settings.get('hideFromCapture'))
  // Links go to the browser; the windows themselves never navigate away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (!(url.startsWith('file://') || (dev && url.startsWith(dev)))) event.preventDefault()
  })
  return win
}

function load(win: BrowserWindow, route: string): void {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && dev) void win.loadURL(`${dev}#/${route}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/${route}` })
}

/** Keep a rectangle on a display: on the one it mostly overlaps, inside its work area. */
function clampToDisplay(rect: Rectangle): Rectangle {
  const area = screen.getDisplayMatching(rect).workArea
  return {
    ...rect,
    x: Math.round(Math.min(Math.max(rect.x, area.x), area.x + area.width - rect.width)),
    y: Math.round(Math.min(Math.max(rect.y, area.y), area.y + area.height - rect.height)),
  }
}

// ---- bubble ---------------------------------------------------------------------------------

function bubbleBounds(at: Point | null): Rectangle {
  const area = screen.getPrimaryDisplay().workArea
  const p = at ?? { x: area.x + area.width - BUBBLE_SIZE - EDGE, y: area.y + area.height - BUBBLE_SIZE - EDGE }
  return clampToDisplay({ x: p.x, y: p.y, width: BUBBLE_SIZE, height: BUBBLE_SIZE })
}

export function createBubble(): BrowserWindow {
  if (alive(bubble)) return bubble
  // Focusable, unlike the HUD: with the game in front, Windows ate the mouse-down on a window that
  // can never be activated and passed on only the release, so clicks never opened the panel
  // (traced 2026-10-10: pointerup and mouseup arrived, pointerdown never). It still appears with
  // showInactive(), so it takes focus only when clicked, which opens the panel anyway.
  const win = overlayWindow({ ...bubbleBounds(settings.get('bubble')) })
  bubble = win
  win.once('ready-to-show', () => win.showInactive())
  win.on('closed', () => (bubble = null))
  load(win, 'bubble')
  return win
}

export function moveBubble(to: Point): void {
  if (!alive(bubble)) return
  bubble.setBounds(clampToDisplay({ x: to.x, y: to.y, width: BUBBLE_SIZE, height: BUBBLE_SIZE }))
  if (alive(panel) && panel.isVisible()) placePanel()
}

export function bubbleDragEnded(): void {
  if (!alive(bubble)) return
  const { x, y } = bubble.getBounds()
  settings.set('bubble', { x, y })
}

// ---- panel ----------------------------------------------------------------------------------

/**
 * Beside the bubble, on whichever side has room, aligned to the bubble's nearer edge. Where the
 * bubble would be while it is gone (the game is closed).
 */
function placePanel(): void {
  if (!alive(panel)) return
  const b = alive(bubble) ? bubble.getBounds() : bubbleBounds(settings.get('bubble'))
  const saved = settings.get('panel')
  const width = panelExpanded ? Math.max(saved.width, PANEL_EXPANDED.width) : saved.width
  const height = panelExpanded ? Math.max(saved.height, PANEL_EXPANDED.height) : saved.height
  const area = screen.getDisplayMatching(b).workArea
  const right = b.x + b.width / 2 > area.x + area.width / 2
  const lower = b.y + b.height / 2 > area.y + area.height / 2
  const x = right ? b.x - width - PANEL_GAP : b.x + b.width + PANEL_GAP
  const y = lower ? b.y + b.height - height : b.y
  panel.setBounds(clampToDisplay({ x, y, width, height }))
}

export function createPanel(): BrowserWindow {
  if (alive(panel)) return panel
  const { width, height } = settings.get('panel')
  const win = overlayWindow({
    width, height, alwaysOnTop: settings.get('panelOnTop'),
    ...panelDesktopOptions(),
  }, false)
  if (!settings.get('panelOnTop')) win.setAlwaysOnTop(false)
  panel = win
  win.on('close', (event) => {
    // The X hides it; only quitting closes it.
    if (quitting) return
    event.preventDefault()
    hidePanel()
  })
  win.on('closed', () => (panel = null))
  win.on('restore', () => {
    broadcast('panel:visible', true)
    for (const fn of panelListeners) fn(true)
    setHudEditing(true, false)
  })
  win.on('minimize', () => {
    broadcast('panel:visible', false)
    for (const fn of panelListeners) fn(false)
    setHudEditing(false)
  })
  load(win, 'panel')
  return win
}

export function showPanel(): void {
  const win = createPanel()
  placePanel()
  const reveal = (): void => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    broadcast('panel:visible', true)
    for (const fn of panelListeners) fn(true)
    // While the panel is open the HUD can be moved: it shows (even when empty) and takes the mouse.
    setHudEditing(true, false)
  }
  revealPanel(win, reveal)
}

/**
 * Open the panel on a pet's drop locations (a click in the merchant window). A panel that is still
 * loading is told once it has: its page listens from when it mounts.
 */
export function showPetInPanel(pet: number): void {
  sendToPanel('panel:showPet', pet)
}

/** The panel's page tells main which tab it is on; an update restart brings it back to it. */
export function setPanelTab(id: string): void {
  tab = id
}

export function panelTab(): string | null {
  return tab
}

/** Open the panel on a tab (after an update restart, the one it was on). */
export function showPanelTab(id: string): void {
  sendToPanel('panel:showTab', id)
}

/** The panel on its Timers tab, these timers highlighted: a click on the bubble during an alert. */
export function showTimersInPanel(ids: TimerId[]): void {
  sendToPanel('panel:showTimers', ids)
}

/** Show the panel (open if hidden, never toggled shut) and tell it what to show, once loaded. */
function sendToPanel<C extends 'panel:showPet' | 'panel:showTimers' | 'panel:showTab'>(channel: C, payload: EventChannels[C]): void {
  showPanel()
  const win = panel
  if (!alive(win)) return
  const send = (): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

/** Larger while a map is open; back to the saved size after. Not persisted. */
export function setPanelExpanded(expanded: boolean): void {
  if (panelExpanded === expanded) return
  panelExpanded = expanded
  placePanel()
}

export function hidePanel(): void {
  if (!alive(panel)) return
  // Keep a taskbar entry on Linux: some desktops have no system tray host at all.
  if (process.platform === 'linux') panel.minimize()
  else panel.hide()
  broadcast('panel:visible', false)
  for (const fn of panelListeners) fn(false)
  // Back to click-through, so the HUD never catches a click meant for the game.
  setHudEditing(false)
}

export function togglePanel(): void {
  if (panelVisible()) hidePanel()
  else showPanel()
}

// ---- hud ------------------------------------------------------------------------------------

function hudPosition(): Point {
  const saved = settings.get('hud').position
  if (saved) return saved
  const area = screen.getPrimaryDisplay().workArea
  return { x: area.x + area.width - Math.max(hudSize.width, 260) - EDGE, y: area.y + 120 }
}

export function createHud(): BrowserWindow {
  if (alive(hud)) return hud
  const p = hudPosition()
  const win = overlayWindow({ x: p.x, y: p.y, width: 280, height: 120, focusable: process.platform === 'linux' })
  win.setIgnoreMouseEvents(true)
  hud = win
  win.on('closed', () => (hud = null))
  win.webContents.once('did-finish-load', () => {
    // Made while the panel is open (the game started meanwhile): in move mode, like the panel's.
    if (panelVisible()) setHudEditing(true, false)
    refreshHud()
  })
  load(win, 'hud')
  for (const id of addonHudIds) createAddonHud(id)
  return win
}

/** Whether a HUD with this much to show is shown: in move mode always, else by the HUD's settings. */
function hudWanted(size: { width: number; height: number }): boolean {
  const cfg = settings.get('hud')
  const status = tracker.status()
  return hudEditing || (cfg.enabled && size.height > 0 && (!cfg.hideWithoutGame || status.gameActive || status.replay))
}

/** Size a HUD window to what it shows, at its place, and show or hide it. */
function placeHud(win: BrowserWindow, size: { width: number; height: number }, p: Point): void {
  if (size.width > 0 && size.height > 0) {
    const next = clampToDisplay({ x: p.x, y: p.y, width: size.width, height: size.height })
    const now = win.getBounds()
    if (next.x !== now.x || next.y !== now.y || next.width !== now.width || next.height !== now.height) win.setBounds(next)
  }
  const wanted = hudWanted(size)
  if (wanted && !win.isVisible()) win.showInactive()
  if (!wanted && win.isVisible()) win.hide()
}

/** Show or hide the HUD (and the addons' detached ones), apply mouse mode and size. Cheap when nothing changed. */
export function refreshHud(): void {
  for (const id of addonHuds.keys()) refreshAddonHud(id)
  if (!alive(hud)) return
  placeHud(hud, hudSize, hudPosition())
}

export function resizeHud(size: { width: number; height: number }): void {
  hudSize = { width: Math.ceil(size.width), height: Math.ceil(size.height) }
  refreshHud()
}

/**
 * `focus`: take the keyboard too (so Escape ends move mode). Not when the panel turned move mode
 * on: the panel keeps the focus it was just given.
 */
export function setHudEditing(editing: boolean, focus = true): void {
  if (!alive(hud) || hudEditing === editing) return
  hudEditing = editing
  // Edit mode is the only time the HUDs take the mouse: click-through the rest of the time.
  for (const win of [hud, ...addonHudWindows()]) {
    if (!alive(win)) continue
    applyHudInputMode(win, editing)
  }
  if (editing) {
    refreshHud()
    if (focus) hud.focus()
  }
  broadcast('hud:editing', editing)
  refreshHud()
}

export function hudIsEditing(): boolean {
  return hudEditing
}

export function moveHud(to: Point): void {
  if (!alive(hud)) return
  const next = clampToDisplay({ x: to.x, y: to.y, width: hudSize.width || 280, height: hudSize.height || 120 })
  hud.setBounds(next)
}

export function hudDragEnded(): void {
  if (!alive(hud)) return
  const { x, y } = hud.getBounds()
  settings.set('hud', { ...settings.get('hud'), position: { x, y } })
}

// ---- addons' detached HUDs ------------------------------------------------------------------

const ADDON_HUD_WIDTH = 332

/** The addons whose HUD section is detached (main/addons.ts), and their windows while the game runs. */
let addonHudIds: string[] = []
const addonHuds = new Map<string, { win: BrowserWindow; size: { width: number; height: number } }>()
const addonHudWindows = (): BrowserWindow[] => [...addonHuds.values()].map((h) => h.win)

function addonHudPosition(id: string): Point {
  const saved = settings.get('addons').hud[id]?.position
  if (saved) return saved
  // Below where the HUD starts, so a first detach does not land on top of it.
  const area = screen.getPrimaryDisplay().workArea
  return { x: area.x + area.width - ADDON_HUD_WIDTH - EDGE, y: area.y + 420 }
}

function createAddonHud(id: string): void {
  if (addonHuds.has(id)) return
  const p = addonHudPosition(id)
  const win = overlayWindow({ x: p.x, y: p.y, width: ADDON_HUD_WIDTH, height: 60, focusable: process.platform === 'linux' || hudEditing })
  win.setIgnoreMouseEvents(!hudEditing)
  addonHuds.set(id, { win, size: { width: 0, height: 0 } })
  win.on('closed', () => {
    if (addonHuds.get(id)?.win === win) addonHuds.delete(id)
  })
  // Made while the HUD is in move mode (detached with the panel open): its page is told so.
  win.webContents.once('did-finish-load', () => {
    if (alive(win)) win.webContents.send('hud:editing', hudEditing)
  })
  load(win, `addonhud/${id}`)
}

function destroyAddonHud(id: string): void {
  const h = addonHuds.get(id)
  addonHuds.delete(id)
  if (h && alive(h.win)) h.win.destroy()
}

/** Which addons have a detached HUD. Their windows exist while the HUD does (the game running). */
export function setAddonHuds(ids: string[]): void {
  addonHudIds = ids
  for (const id of [...addonHuds.keys()]) if (!ids.includes(id)) destroyAddonHud(id)
  if (alive(hud)) for (const id of ids) createAddonHud(id)
}

function refreshAddonHud(id: string): void {
  const h = addonHuds.get(id)
  if (h && alive(h.win)) placeHud(h.win, h.size, addonHudPosition(id))
}

export function resizeAddonHud(id: string, size: { width: number; height: number }): void {
  const h = addonHuds.get(id)
  if (!h) return
  h.size = { width: Math.ceil(size.width), height: Math.ceil(size.height) }
  refreshAddonHud(id)
}

export function moveAddonHud(id: string, to: Point): void {
  const h = addonHuds.get(id)
  if (!h || !alive(h.win)) return
  const { width, height } = h.win.getBounds()
  h.win.setBounds(clampToDisplay({ x: to.x, y: to.y, width, height }))
}

/** Where it was dropped, kept with the addon's HUD place: it comes back there after a restart. */
export function addonHudDragEnded(id: string): void {
  const h = addonHuds.get(id)
  if (!h || !alive(h.win)) return
  const { x, y } = h.win.getBounds()
  saveAddonHudPosition(id, { x, y })
}

function saveAddonHudPosition(id: string, position: Point): void {
  const stored = settings.get('addons')
  const place = stored.hud[id]
  if (place) settings.set('addons', { ...stored, hud: { ...stored.hud, [id]: { ...place, position } } })
}

// ---- merchant -------------------------------------------------------------------------------

const MERCHANT_WIDTH = 400

function merchantPosition(): Point {
  const saved = settings.get('merchantWindow')
  if (saved) return saved
  const area = screen.getPrimaryDisplay().workArea
  return { x: Math.round(area.x + area.width / 2 - MERCHANT_WIDTH / 2), y: area.y + 120 }
}

/**
 * Open the merchant window (a tab of the shop was just opened), unless the setting is off. It
 * shows once its page has measured itself, and stays hidden while there is nothing worth buying.
 */
export function showMerchant(): void {
  if (!settings.get('hud').merchant) return
  if (alive(merchant)) return refreshMerchant()
  const p = merchantPosition()
  const win = overlayWindow({ x: p.x, y: p.y, width: MERCHANT_WIDTH, height: 200 })
  merchant = win
  merchantSize = { width: 0, height: 0 }
  win.on('closed', () => (merchant = null))
  load(win, 'merchant')
}

/** The X: closed until a tab of the shop is opened again (a closed window frees its renderer). */
export function closeMerchant(): void {
  if (alive(merchant)) merchant.destroy()
  merchant = null
}

function refreshMerchant(): void {
  if (!alive(merchant)) return
  const { width, height } = merchantSize
  if (width > 0 && height > 0) {
    const p = merchantPosition()
    merchant.setBounds(clampToDisplay({ x: p.x, y: p.y, width, height }))
    if (!merchant.isVisible()) merchant.showInactive()
  } else if (merchant.isVisible()) {
    merchant.hide()
  }
}

export function merchantOpen(): boolean {
  return alive(merchant)
}

export function resizeMerchant(size: { width: number; height: number }): void {
  merchantSize = { width: Math.ceil(size.width), height: Math.ceil(size.height) }
  refreshMerchant()
}

export function moveMerchant(to: Point): void {
  if (!alive(merchant)) return
  const { width, height } = merchant.getBounds()
  merchant.setBounds(clampToDisplay({ x: to.x, y: to.y, width, height }))
}

export function merchantDragEnded(): void {
  if (!alive(merchant)) return
  const { x, y } = merchant.getBounds()
  settings.set('merchantWindow', { x, y })
}

// ---- kill feed --------------------------------------------------------------------------------

const KILL_FEED_WIDTH = 312

function killFeedPosition(): Point {
  const saved = settings.get('killFeed').position
  if (saved) return saved
  const area = screen.getPrimaryDisplay().workArea
  return { x: area.x + area.width - KILL_FEED_WIDTH - 24, y: area.y + 120 }
}

/** The kill feed window, if the PvP Log has it open (and is on): made with the other overlays. */
export function createKillFeed(): void {
  if (!featureOn('pvp-log') || !settings.get('killFeed').open || alive(killFeed)) return
  const p = killFeedPosition()
  const win = overlayWindow({ x: p.x, y: p.y, width: KILL_FEED_WIDTH, height: 40 })
  killFeed = win
  win.on('closed', () => (killFeed = null))
  load(win, 'killfeed')
  win.webContents.once('did-finish-load', () => alive(win) && win.showInactive())
}

/** PvP Log → Open HUD / the window's X. Remembered, so it comes back with the game. */
export function setKillFeedOpen(open: boolean): void {
  settings.set('killFeed', { ...settings.get('killFeed'), open })
  if (open) createKillFeed()
  else if (alive(killFeed)) {
    killFeed.destroy()
    killFeed = null
  }
}

export function resizeKillFeed(size: { width: number; height: number }): void {
  if (!alive(killFeed) || size.width <= 0 || size.height <= 0) return
  const { x, y } = killFeed.getBounds()
  killFeed.setBounds(clampToDisplay({ x, y, width: Math.ceil(size.width), height: Math.ceil(size.height) }))
}

export function moveKillFeed(to: Point): void {
  if (!alive(killFeed)) return
  const { width, height } = killFeed.getBounds()
  killFeed.setBounds(clampToDisplay({ x: to.x, y: to.y, width, height }))
}

export function killFeedDragEnded(): void {
  if (!alive(killFeed)) return
  const { x, y } = killFeed.getBounds()
  settings.set('killFeed', { ...settings.get('killFeed'), position: { x, y } })
}

// ---- all ------------------------------------------------------------------------------------

/**
 * Before an update restart: where each overlay is now, for any that was placed by hand. They are
 * saved at the end of every drag already; this covers one caught mid-drag.
 */
export function saveWindowPlaces(): void {
  const at = (w: BrowserWindow | null): Point | null => (alive(w) ? { x: w.getBounds().x, y: w.getBounds().y } : null)
  const b = at(bubble)
  if (b && settings.get('bubble')) settings.set('bubble', b)
  const h = at(hud)
  if (h && settings.get('hud').position) settings.set('hud', { ...settings.get('hud'), position: h })
  const m = at(merchant)
  if (m && settings.get('merchantWindow')) settings.set('merchantWindow', m)
  const k = at(killFeed)
  if (k && settings.get('killFeed').position) settings.set('killFeed', { ...settings.get('killFeed'), position: k })
  for (const [id, h] of addonHuds) {
    const p = at(h.win)
    if (p && settings.get('addons').hud[id]?.position) saveAddonHudPosition(id, p)
  }
}

const ON_TOP_EVERY_MS = 5_000

/**
 * Keep the overlays above the game. Windows can leave an always-on-top window below a game that
 * takes the foreground, with its topmost flag still set (seen 2026-10-13: the bubble 10 places below
 * the borderless game window, invisible, while the app thought it was showing). So every few seconds
 * each visible overlay is put back on top; moveTop() does not take the focus, and the game keeps it.
 * The panel is left alone: it is a window to click into, and has its own on-top setting.
 */
export function startOnTopWatch(): void {
  setInterval(() => {
    for (const win of [bubble, hud, merchant, killFeed, ...addonHudWindows()]) {
      if (!alive(win) || !win.isVisible()) continue
      if (process.platform === 'linux') win.setAlwaysOnTop(true)
      else win.setAlwaysOnTop(true, 'screen-saver')
      win.moveTop()
    }
  }, ON_TOP_EVERY_MS).unref()
}

/** Settings that change how the windows behave, applied live. */
export function applyWindowSettings(): void {
  const hidden = settings.get('hideFromCapture')
  if (process.platform !== 'linux') {
    for (const w of [bubble, panel, hud, merchant, killFeed, ...addonHudWindows()]) if (alive(w)) w.setContentProtection(hidden)
  }
  if (!settings.get('hud').merchant) closeMerchant()
  // The PvP Log addon switched off or on: its kill feed goes, or comes back while the overlays show.
  if (!featureOn('pvp-log') && alive(killFeed)) {
    killFeed.destroy()
    killFeed = null
  } else if (alive(bubble)) createKillFeed()
  if (alive(panel)) {
    const onTop = settings.get('panelOnTop')
    if (process.platform === 'linux') panel.setAlwaysOnTop(onTop)
    else panel.setAlwaysOnTop(onTop, 'screen-saver')
    if (panel.isVisible()) placePanel()
  }
  refreshHud()
}

/**
 * Close the bubble, the HUD and the merchant window, and the panel if it is hidden: a window that
 * is only hidden keeps its renderer process. An open panel stays open.
 */
export function closeOverlays(): void {
  for (const win of [bubble, hud, merchant, killFeed, ...addonHudWindows()]) if (alive(win)) win.destroy()
  addonHuds.clear()
  bubble = null
  hud = null
  merchant = null
  killFeed = null
  hudEditing = false
  hudSize = { width: 0, height: 0 }
  // Linux's minimized panel is the fallback launcher on desktops without a tray.
  if (process.platform !== 'linux' && alive(panel) && !panel.isVisible()) {
    panel.destroy()
    panel = null
  }
}

/**
 * Replace a window whose renderer cannot be brought back: destroy it and build a fresh one in the
 * same state. A frozen renderer survived reload(), loadURL() and killing its process in testing;
 * a new window always comes back. Returns which window it was.
 */
export function rebuildWindow(win: BrowserWindow): string | null {
  if (win === addonHost) {
    win.destroy()
    addonHost = null
    setAddonHost(true)
    return 'addons'
  }
  if (win === bubble) {
    win.destroy()
    bubble = null
    createBubble()
    return 'bubble'
  }
  if (win === hud) {
    const editing = hudEditing
    win.destroy()
    hud = null
    hudEditing = false
    createHud()
    if (editing) hud!.webContents.once('did-finish-load', () => setHudEditing(true, false))
    return 'hud'
  }
  if (win === merchant) {
    win.destroy()
    merchant = null
    showMerchant()
    return 'merchant'
  }
  if (win === killFeed) {
    win.destroy()
    killFeed = null
    createKillFeed()
    return 'killfeed'
  }
  for (const [id, h] of addonHuds) {
    if (h.win !== win) continue
    destroyAddonHud(id)
    createAddonHud(id)
    return `addonhud/${id}`
  }
  if (win === panel) {
    const visible = win.isVisible()
    win.destroy()
    panel = null
    if (visible) showPanel()
    return 'panel'
  }
  return null
}

// ---- addon host -----------------------------------------------------------------------------

/** Never shown: the addons' background scripts, each in a sandboxed frame (pages/AddonHostPage). */
let addonHost: BrowserWindow | null = null

/** Open the addon host while some addon has a background script switched on; close it otherwise. */
export function setAddonHost(needed: boolean): void {
  if (needed && !alive(addonHost)) {
    addonHost = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Hidden for good: without this its timers would slow to once a minute.
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    })
    addonHost.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    addonHost.webContents.on('will-navigate', (event) => event.preventDefault())
    load(addonHost, 'addons')
  } else if (!needed && alive(addonHost)) {
    addonHost.destroy()
    addonHost = null
  }
}
