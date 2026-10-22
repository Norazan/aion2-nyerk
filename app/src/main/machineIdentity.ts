/** Read and hash the host identity locally; raw system identifiers must never be transmitted. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Keep this salt stable across upgrades and platforms.
const SALT = 'aion2-pet-tracker/machine/v1'

export function linuxMachineId(files: readonly string[] = ['/etc/machine-id', '/var/lib/dbus/machine-id']): string | null {
  for (const file of files) {
    try {
      const id = readFileSync(file, 'utf8').trim().toLowerCase()
      if (/^[0-9a-f]{32}$/.test(id) && !/^0+$/.test(id)) return id
    } catch {
      // Try the standard dbus fallback, then let the caller use a persistent random id.
    }
  }
  return null
}

export function systemMachineId(): string | null {
  if (process.platform === 'linux') return linuxMachineId()
  if (process.platform !== 'win32') return null
  try {
    const out = execFileSync(
      join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'reg.exe'),
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 },
    )
    return /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/.exec(out)?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

export function hashMachineId(id: string): string {
  return createHash('sha256').update(`${SALT}:${id}`).digest('hex')
}
