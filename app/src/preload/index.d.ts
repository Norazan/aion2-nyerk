import type { Bridge } from '../shared/ipc.ts'

declare global {
  interface Window {
    a2t: Bridge
  }
}

export {}
