/** The app's own updates: what the panel shows of them. */

export type UpdateState =
  | 'idle' // nothing checked yet
  | 'unsupported' // a development run: there is no feed to update from
  | 'checking'
  | 'none' // up to date
  | 'available' // a newer version is on the feed; nothing downloaded yet
  | 'downloading'
  | 'ready' // downloaded: a restart installs it
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  current: string
  /** The version on offer (available, downloading, ready). */
  version: string | null
  percent: number | null
  error: string | null
  checkedAt: number | null
}

export const initialUpdateStatus = (current: string): UpdateStatus => ({
  state: 'idle',
  current,
  version: null,
  percent: null,
  error: null,
  checkedAt: null,
})
