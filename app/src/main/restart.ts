/**
 * What an update restart carries across, so the app comes back as it was: `<userData>/restart.json`,
 * written just before the restart and taken (read and deleted) at the next start.
 *
 * The session's souls per pet live in the tracker helper, which restarts with the app; the Kina,
 * the merchant's stock and the alerts already seen live in main. Window positions are settings and
 * survive anyway (saveWindowPlaces makes sure a window being dragged keeps where it is); what is
 * not a setting is whether the panel and the merchant window were open, and on which tab.
 *
 * Only a fresh file is used: one left by a restart that never happened (the installer failed, the
 * machine was turned off) must not bring a stale session into tomorrow's.
 *
 * Also here: the count of attempts to install each version, so an update that does not take (the
 * same version offered again after the restart) is tried twice and then left to the user's click,
 * rather than restarting the app at every launch.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { KinaSession } from '../shared/kina.ts'
import type { ShopStock } from '../shared/tracker.ts'

/** An installer restart takes a minute at most; anything older did not come from a restart. */
export const RESTART_STATE_MAX_AGE_MS = 10 * 60_000
/** Automatic tries per version before it waits for a click. */
export const MAX_AUTO_ATTEMPTS = 2

/** Session souls per character ('' before one is known), per pet id. */
export type SessionCounts = Record<string, Record<string, number>>

export interface RestartState {
  /** When it was written. */
  at: number
  from: string
  to: string
  panel: { visible: boolean; tab: string | null }
  merchantOpen: boolean
  kina: KinaSession | null
  shop: ShopStock[]
  /** From the tracker helper; null when it was not running or could not say. */
  sessions: SessionCounts | null
  world: number | null
  position: [number, number] | null
  /** Timer alerts already announced or dismissed, as `${id}@${start}`. */
  timers: { done: string[]; alerting: string[] }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])

function sessionCounts(v: unknown): SessionCounts | null {
  if (!isObject(v)) return null
  const out: SessionCounts = {}
  for (const [who, counts] of Object.entries(v)) {
    if (!isObject(counts)) continue
    const pets: Record<string, number> = {}
    for (const [pet, n] of Object.entries(counts)) if (/^\d+$/.test(pet) && Number.isInteger(n) && (n as number) > 0) pets[pet] = n as number
    out[who] = pets
  }
  return out
}

/** The state in a file, or null when it is not one, or too old to be from a restart just now. */
export function parseRestartState(text: string, now: number): RestartState | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(raw) || typeof raw['at'] !== 'number') return null
  if (now - raw['at'] > RESTART_STATE_MAX_AGE_MS || raw['at'] > now + 60_000) return null
  const panel = isObject(raw['panel']) ? raw['panel'] : {}
  const timers = isObject(raw['timers']) ? raw['timers'] : {}
  const position = raw['position']
  return {
    at: raw['at'],
    from: typeof raw['from'] === 'string' ? raw['from'] : '',
    to: typeof raw['to'] === 'string' ? raw['to'] : '',
    panel: { visible: panel['visible'] === true, tab: typeof panel['tab'] === 'string' ? panel['tab'] : null },
    merchantOpen: raw['merchantOpen'] === true,
    kina: isObject(raw['kina']) && typeof raw['kina']['earned'] === 'number' ? (raw['kina'] as unknown as KinaSession) : null,
    shop: Array.isArray(raw['shop']) ? (raw['shop'] as ShopStock[]).filter((s) => isObject(s) && Array.isArray(s.items)) : [],
    sessions: sessionCounts(raw['sessions']),
    world: typeof raw['world'] === 'number' ? raw['world'] : null,
    position:
      Array.isArray(position) && position.length === 2 && position.every((n) => typeof n === 'number' && Number.isFinite(n))
        ? [position[0] as number, position[1] as number]
        : null,
    timers: { done: strings(timers['done']), alerting: strings(timers['alerting']) },
  }
}

const stateFile = (dir: string): string => join(dir, 'restart.json')
const attemptFile = (dir: string): string => join(dir, 'update-attempt.json')

export function writeRestartState(dir: string, state: RestartState): void {
  writeFileSync(stateFile(dir), JSON.stringify(state))
}

/** Read the state left by the last restart, and delete it: it is for one start only. */
export function takeRestartState(dir: string, now = Date.now()): RestartState | null {
  let text: string
  try {
    text = readFileSync(stateFile(dir), 'utf8')
  } catch {
    return null
  }
  rmSync(stateFile(dir), { force: true })
  return parseRestartState(text, now)
}

interface Attempt {
  version: string
  tries: number
}

function readAttempt(dir: string): Attempt | null {
  try {
    const raw = JSON.parse(readFileSync(attemptFile(dir), 'utf8')) as Partial<Attempt>
    return typeof raw.version === 'string' && typeof raw.tries === 'number' ? { version: raw.version, tries: raw.tries } : null
  } catch {
    return null
  }
}

export const attempts = {
  /** Count one automatic or clicked install of `version`. */
  record(dir: string, version: string): void {
    const previous = readAttempt(dir)
    const tries = previous?.version === version ? previous.tries + 1 : 1
    writeFileSync(attemptFile(dir), JSON.stringify({ version, tries }))
  },
  /** At start: the version running is the one tried, so it worked and the count goes. */
  settle(dir: string, running: string): void {
    if (readAttempt(dir)?.version === running) rmSync(attemptFile(dir), { force: true })
  },
  /** Tried MAX_AUTO_ATTEMPTS times and still offered: leave it to a click. */
  exhausted(dir: string, version: string): boolean {
    const attempt = readAttempt(dir)
    return attempt?.version === version && attempt.tries >= MAX_AUTO_ATTEMPTS
  },
}
