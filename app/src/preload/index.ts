/**
 * Exposes `window.a2t`: typed invoke/on over an allow-list of channels. The renderer never sees
 * ipcRenderer itself.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type Bridge, type EventChannel, type InvokeChannel } from '../shared/ipc.ts'

const bridge: Bridge = {
  platform: process.platform,
  invoke(channel, ...args) {
    if (!INVOKE_CHANNELS.includes(channel as InvokeChannel)) throw new Error(`unknown channel ${channel}`)
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel, listener) {
    if (!EVENT_CHANNELS.includes(channel as EventChannel)) throw new Error(`unknown event ${channel}`)
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown): void => listener(payload as never)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld('a2t', bridge)
