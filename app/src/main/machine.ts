/**
 * This PC's hash, sent as X-A2-Machine with everything the app asks of nyerk.app (updates, the
 * shared timers): what the server's ban list keys on, so a ban outlasts reinstalling the app.
 *
 * SHA-256 of Linux's machine-id or Windows' MachineGuid with this app's salt: the raw id
 * never leaves the PC, and the hash matches nothing another app sends for the same machine. Where
 * the system identity cannot be read, a random id kept in userData stands in.
 */
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hashMachineId, systemMachineId } from './machineIdentity.ts'

let cached: string | null = null

function fallbackId(): string {
  const file = join(app.getPath('userData'), 'machine-id')
  try {
    const id = readFileSync(file, 'utf8').trim()
    if (id) return id
  } catch {
    // made below
  }
  const id = randomUUID()
  try {
    writeFileSync(file, id)
  } catch {
    // this run only
  }
  return id
}

export function machineHash(): string {
  cached ??= hashMachineId(systemMachineId() ?? fallbackId())
  return cached
}
