/**
 * Is Aion 2 running? Answered from the process list only: nothing here touches the game.
 *
 * While the game is closed, `tasklist` is asked every POLL_MS (about 170 ms of a process start
 * each time, so not often). Once the game is found, only its pid is checked, which costs nothing,
 * until it is gone.
 *
 * The client is C:\Program Files (x86)\NC\AION 2\Aion2\Binaries\Win64\AION2.exe; the Unreal
 * shipping name is accepted too. The tracker's own Aion2DropTracker.exe also matches tasklist's
 * "aion2*" filter, so names are checked exactly.
 */
import { execFile } from 'node:child_process'

const GAME_EXE = /^aion2(-win64-shipping)?\.exe$/i
const POLL_MS = 10_000
const PID_CHECK_MS = 5_000
const RECHECK_EVERY = 24

let pid: number | null = null
let timer: NodeJS.Timeout | null = null
const listeners = new Set<(running: boolean) => void>()

/** The game's pid, or null; tasklist failing counts as not running. */
export function findGame(): Promise<number | null> {
  return new Promise((done) => {
    execFile('tasklist', ['/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq aion2*'], { windowsHide: true, timeout: 10_000 }, (err, out) => {
      if (err) return done(null)
      for (const line of out.split(/\r?\n/)) {
        const m = /^"([^"]+)","(\d+)"/.exec(line)
        if (m && GAME_EXE.test(m[1]!)) return done(Number(m[2]))
      }
      done(null)
    })
  })
}

function alive(p: number): boolean {
  try {
    process.kill(p, 0)
    return true
  } catch (err) {
    // EPERM: it exists, we may just not signal it.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function set(next: number | null): void {
  const was = pid !== null
  pid = next
  if (was !== (pid !== null)) for (const fn of listeners) fn(pid !== null)
}

let ticks = 0
async function tick(): Promise<void> {
  // Now and then a full look while running too: Windows reuses pids.
  if (pid !== null && (!alive(pid) || ++ticks % RECHECK_EVERY === 0)) set(await findGame())
  else if (pid === null) set(await findGame())
  timer = setTimeout(() => void tick(), pid === null ? POLL_MS : PID_CHECK_MS)
}

export const game = {
  running: (): boolean => pid !== null,
  pid: (): number | null => pid,
  /** Look now, then keep watching. Resolves once the first look is done. */
  async watch(): Promise<void> {
    if (timer) return
    set(await findGame())
    timer = setTimeout(() => void tick(), pid === null ? POLL_MS : PID_CHECK_MS)
  },
  onChange(fn: (running: boolean) => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
