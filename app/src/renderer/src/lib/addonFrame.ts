/**
 * The window's half of an addon frame's line to main. The frame (on its own `nyerk-addon://<id>`
 * origin, with the SDK: main/addonSdk.ts) posts calls here; this checks they come from that frame
 * and that origin, so the addon is who the browser says it is, then passes them to main, which
 * checks the addon's permissions. Main's events for that addon go back the same way.
 */
import { ADDON_SCHEME } from '@shared/addons.ts'
import { bridge } from '@/lib/bridge.ts'

/** Electron's wrapping of an error thrown in a main handler, taken off for the addon's page. */
const unwrap = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')

export function connectAddonFrame(frame: HTMLIFrameElement, addon: string): () => void {
  const origin = `${ADDON_SCHEME}://${addon}`
  const post = (message: Record<string, unknown>): void => frame.contentWindow?.postMessage({ nyerk: 1, ...message }, origin)

  const onMessage = async (event: MessageEvent): Promise<void> => {
    if (event.source !== frame.contentWindow || event.origin !== origin) return
    const m = event.data as { nyerk?: number; kind?: string; id?: number; method?: unknown; args?: unknown }
    if (m?.nyerk !== 1 || m.kind !== 'call' || typeof m.method !== 'string') return
    try {
      const result = await bridge().invoke('addons:call', addon, m.method, Array.isArray(m.args) ? m.args : [])
      post({ kind: 'reply', id: m.id, result })
    } catch (error) {
      post({ kind: 'reply', id: m.id, error: unwrap(error) })
    }
  }
  window.addEventListener('message', onMessage)
  const off = bridge().on('addons:event', (ev) => {
    if (ev.addon === addon) post({ kind: 'event', name: ev.name, data: ev.data })
  })
  return () => {
    window.removeEventListener('message', onMessage)
    off()
  }
}
