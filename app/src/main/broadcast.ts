/** Typed sends from main to the renderer windows. */
import { BrowserWindow } from 'electron'
import type { EventChannel, EventPayload } from '../shared/ipc.ts'

export function send<C extends EventChannel>(win: BrowserWindow | null, channel: C, payload: EventPayload<C>): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

/** Told of everything broadcast: addons get the events their permissions allow (main/addons.ts). */
let tap: ((channel: EventChannel, payload: unknown) => void) | null = null
export function tapBroadcast(fn: (channel: EventChannel, payload: unknown) => void): void {
  tap = fn
}

/** To every open window: the bubble, the panel and the HUD all render from the same state. */
export function broadcast<C extends EventChannel>(channel: C, payload: EventPayload<C>): void {
  for (const win of BrowserWindow.getAllWindows()) send(win, channel, payload)
  tap?.(channel, payload)
}
