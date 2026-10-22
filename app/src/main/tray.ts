/** The tray icon: left-click opens the panel, the menu holds everything else. Quit is the only exit. */
import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { DISPLAY_NAME } from '../shared/app.ts'
import { settings } from './settings.ts'
import { tracker } from './tracker.ts'
import { updates } from './update.ts'
import { hudIsEditing, markQuitting, setHudEditing, showPanel, togglePanel } from './windows.ts'

let tray: Tray | null = null

function menu(): Menu {
  const hud = settings.get('hud')
  return Menu.buildFromTemplate([
    { label: 'Open panel', click: () => showPanel() },
    {
      label: 'Show HUD',
      type: 'checkbox',
      checked: hud.enabled,
      click: (item) => settings.set('hud', { ...settings.get('hud'), enabled: item.checked }),
    },
    { label: hudIsEditing() ? 'Done moving HUD' : 'Move HUD…', click: () => setHudEditing(!hudIsEditing()) },
    { label: 'Restart tracker', click: () => tracker.restart() },
    ...(updates.status().state === 'ready'
      ? [{ label: `Restart to install ${updates.status().version}`, click: () => updates.install() }]
      : []),
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        markQuitting()
        app.quit()
      },
    },
  ])
}

export function createTray(): Tray {
  if (tray) return tray
  let image = nativeImage.createFromPath(join(__dirname, '../renderer/icon.png'))
  image = image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16, quality: 'best' })
  tray = new Tray(image)
  tray.setToolTip(DISPLAY_NAME)
  tray.on('click', () => togglePanel())
  if (process.platform === 'linux') {
    // AppIndicator hosts use the exported context menu instead of Electron's right-click
    // event. Reassign it after state changes, as required by Electron's Linux Tray API.
    const refresh = (): void => tray?.setContextMenu(menu())
    refresh()
    settings.onChanged(refresh)
    // HUD edit mode may change without a persisted setting changing.
    setInterval(refresh, 5_000).unref()
  }
  // Rebuilt on open so the checkbox and the HUD item reflect the current state.
  if (process.platform !== 'linux') tray.on('right-click', () => tray?.popUpContextMenu(menu()))
  return tray
}

/** Keep the tooltip saying what the tracker is doing. */
export function setTrayTooltip(text: string): void {
  tray?.setToolTip(text)
}
