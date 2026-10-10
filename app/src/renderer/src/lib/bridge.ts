/** The preload bridge. Missing means the window was created without it: a wiring bug, so it throws. */
import type { Bridge } from '@shared/ipc.ts'

export function bridge(): Bridge {
  const found = (globalThis as { a2t?: Bridge }).a2t
  if (!found) throw new Error('the preload bridge (window.a2t) is not available')
  return found
}
