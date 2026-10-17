/**
 * Handling an asar as a file rather than as a folder (marnis-app's shared/asar.ts).
 *
 * Electron patches `fs` so that a path through a `.asar` is a path inside the archive: that is what
 * makes `require('…/bundle.asar/main/index.js')` work. It is exactly wrong when the archive itself is
 * the thing being handled: hashing it, renaming it into place, deleting its folder. `statSync` on a
 * bundle says it is a directory, and marnis-app's loader once decided a bundle it had just been
 * given was missing because of it.
 *
 * `process.noAsar` is Electron's own switch for this. It is global, so it is only set around
 * synchronous work and put back as it was. Outside Electron it means nothing, so the same code runs
 * under `node --test`.
 */
const asarAware = process as NodeJS.Process & { noAsar?: boolean }

export function withoutAsar<T>(fn: () => T): T {
  const previous = asarAware.noAsar === true
  asarAware.noAsar = true
  try {
    return fn()
  } finally {
    asarAware.noAsar = previous
  }
}
