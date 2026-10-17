/**
 * There are two versions (shared/bundle.ts). `app.getVersion()` is the **shell**, what the installer
 * put on disk and what electron-updater compares with latest.yml. The version someone is running,
 * that Settings shows and the log is headed with, is the **bundle**, usually ahead of its shell.
 */
import { app } from 'electron'
import { readActiveBundle } from '../shared/bundle.ts'

/** The install: Electron and the tracker helper. Changes only with an installer. */
export function shellVersion(): string {
  return app.getVersion()
}

/** The app running: the shell's own until a bundle has been adopted. */
export function appVersion(): string {
  return readActiveBundle()?.version ?? app.getVersion()
}
