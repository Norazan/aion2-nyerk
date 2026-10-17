/**
 * App bundles: updates that do not need the installer (marnis-app's docs/23-app-bundles.md).
 *
 * An install is two pieces that version separately. The **shell** is what the NSIS installer puts
 * on disk: Electron, the tracker helper (resources/sidecar), the loader. It changes rarely. The
 * **bundle** is the compiled app, `out/main`, `out/preload` and `out/renderer`, a few megabytes, and
 * it is what almost every release changes. A bundle is an asar the running app fetches, verifies and
 * adopts on a restart: no uninstall, no extraction, nothing rewritten but one file and a line of
 * JSON, and a restart about as quick as opening the app.
 *
 * Everything here is pure, and it is the one file the two sides agree on:
 * - `src/loader/index.ts` is shell code: compiled into the installer, so it may be much older than
 *   the bundle it starts;
 * - `src/main/bundles.ts` is bundle code: whatever was published last;
 * - `scripts/publish-bundle.mjs` imports it too, so a manifest is signed over exactly the bytes the
 *   app verifies.
 *
 * So **`<userData>/bundles/state.json` may gain fields and may never change the meaning of one**: an
 * old loader must be able to read what a new bundle wrote.
 */

/** Where the manifest and the bundles live, beside the installers (served under the same gate). */
export const BUNDLE_FEED_URL = 'https://nyerk.app/updates/bundle/'

/**
 * The key manifests are signed with (Ed25519, SPKI, base64); the private half is only on the
 * publishing machine (scripts/bundle-keys.mjs). A bundle is code that runs with no installer and no
 * prompt, so "it came from the right URL" is not enough to run it.
 */
export const BUNDLE_PUBLIC_KEY = 'MCowBQYDK2VwAyEAuoGpkMabmxdmYIvrJkun8emhOl9NOAgbk0U3+qOZbyI='

/**
 * Launches a bundle may fail before the loader stops trying it: the first can be a locked file or a
 * shutdown mid-start, the third is a pattern.
 */
export const MAX_BUNDLE_FAILURES = 3

/** Nobody should be asked to download a bundle this big (the real one is a few MB). */
export const MAX_BUNDLE_SIZE = 64 * 1024 * 1024

/** What the feed says should be running. */
export interface BundleManifest {
  /** The app version this bundle is: on one line with shell versions. */
  version: string
  /** The bundle's file name, in the manifest's folder. */
  file: string
  size: number
  /** Base64 SHA-512 of the file, as latest.yml spells hashes. */
  sha512: string
  /**
   * The oldest shell that may run it. A bundle that needs a new Electron or a new tracker helper
   * names the installer that carries them, and older installs are offered that installer instead.
   */
  minShell: string
  /** Base64 Ed25519 signature over `bundleSigningPayload`. */
  signature: string
  releaseDate?: string
  notes?: string
}

/** A bundle on this machine: written by the app, read by the loader. */
export interface InstalledBundle {
  version: string
  minShell: string
  sha512: string
  installedAt: number
  /**
   * Launches begun and not seen through: the loader adds one before handing over, the app clears it
   * once it has started. At MAX_BUNDLE_FAILURES the bundle is set aside for good.
   */
  failures: number
}

/** `<userData>/bundles/state.json`. Keep it small, and never change what a field means. */
export interface BundleState {
  /** The version the loader should run; null for the one in the install. */
  active: string | null
  bundles: Record<string, InstalledBundle>
}

/** Which bundle is running, published by the loader for the app to read back. */
export interface ActiveBundle {
  version: string
  source: 'builtin' | 'downloaded'
  /** The main entry the app was loaded from. */
  path: string
}

const ACTIVE_KEY = '__nyerkActiveBundle'

/** Told once by the loader, before the app's own entry is required. */
export function publishActiveBundle(active: ActiveBundle): void {
  ;(globalThis as Record<string, unknown>)[ACTIVE_KEY] = active
}

/** Null under `node --test`, in development, and anywhere the loader did not start the app. */
export function readActiveBundle(): ActiveBundle | null {
  const value = (globalThis as Record<string, unknown>)[ACTIVE_KEY]
  if (!value || typeof value !== 'object') return null
  const active = value as Partial<ActiveBundle>
  if (typeof active.version !== 'string' || typeof active.path !== 'string') return null
  return { version: active.version, source: active.source === 'downloaded' ? 'downloaded' : 'builtin', path: active.path }
}

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const FILE_NAME = /^[A-Za-z0-9._-]+\.asar$/
const BASE64_64_BYTES = /^[A-Za-z0-9+/]{86}==$/

/**
 * Order two versions: dotted numbers, a prerelease below the release it leads to, its parts compared
 * numerically where numeric. Small on purpose: the loader carries it, and a dependency would too.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string): { numbers: number[]; pre: string } => {
    const [core = '', ...rest] = value.trim().split('-')
    return { numbers: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre: rest.join('-') }
  }
  const left = parts(a)
  const right = parts(b)
  for (let i = 0; i < Math.max(left.numbers.length, right.numbers.length); i++) {
    const difference = (left.numbers[i] ?? 0) - (right.numbers[i] ?? 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  if (left.pre === right.pre) return 0
  if (left.pre === '') return 1
  if (right.pre === '') return -1
  const l = left.pre.split('.')
  const r = right.pre.split('.')
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    const x = l[i]
    const y = r[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn && Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
    if (xn !== yn) return xn ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * The exact bytes a signature covers: the fields in a fixed order, as an array, so no key order or
 * whitespace can differ between signing and verifying. A field added later goes on the end.
 */
export function bundleSigningPayload(manifest: Omit<BundleManifest, 'signature'>): string {
  return JSON.stringify([
    manifest.version,
    manifest.file,
    manifest.size,
    manifest.sha512,
    manifest.minShell,
    manifest.releaseDate ?? '',
    manifest.notes ?? '',
  ])
}

/** A manifest, or null for anything that is not exactly one. Nothing is coerced. */
export function parseBundleManifest(text: string): BundleManifest | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { version, file, size, sha512, minShell, signature, releaseDate, notes } = value as Record<string, unknown>
  if (typeof version !== 'string' || !VERSION.test(version)) return null
  if (typeof minShell !== 'string' || !VERSION.test(minShell)) return null
  // The name becomes a URL and a path: anything with a separator in it is not a name.
  if (typeof file !== 'string' || !FILE_NAME.test(file)) return null
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0 || size > MAX_BUNDLE_SIZE) return null
  if (typeof sha512 !== 'string' || !BASE64_64_BYTES.test(sha512)) return null
  if (typeof signature !== 'string' || !BASE64_64_BYTES.test(signature)) return null
  if (releaseDate !== undefined && typeof releaseDate !== 'string') return null
  if (notes !== undefined && typeof notes !== 'string') return null
  const manifest: BundleManifest = { version, file, size, sha512, minShell, signature }
  if (releaseDate !== undefined) manifest.releaseDate = releaseDate
  if (notes !== undefined) manifest.notes = notes
  return manifest
}

/**
 * The state file, as tolerantly as it can be read: missing, truncated or written by a newer app, it
 * must still leave the loader something it can run.
 */
export function parseBundleState(text: string): BundleState {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { active: null, bundles: {} }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { active: null, bundles: {} }
  const raw = value as Record<string, unknown>
  const bundles: Record<string, InstalledBundle> = {}
  const listed = raw['bundles']
  if (listed && typeof listed === 'object' && !Array.isArray(listed)) {
    for (const [key, entry] of Object.entries(listed as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue
      const item = entry as Record<string, unknown>
      const version = typeof item['version'] === 'string' ? item['version'] : key
      if (!VERSION.test(version)) continue
      const minShell = typeof item['minShell'] === 'string' && VERSION.test(item['minShell']) ? item['minShell'] : '0.0.0'
      const sha512 = typeof item['sha512'] === 'string' ? item['sha512'] : ''
      const installedAt = typeof item['installedAt'] === 'number' ? item['installedAt'] : 0
      const failures = typeof item['failures'] === 'number' && item['failures'] >= 0 ? Math.floor(item['failures']) : 0
      bundles[version] = { version, minShell, sha512, installedAt, failures }
    }
  }
  const active = typeof raw['active'] === 'string' && VERSION.test(raw['active']) ? raw['active'] : null
  return { active, bundles }
}

export interface ChooseBundleInput {
  state: BundleState
  /** The version compiled into the install, which is the shell's. */
  builtinVersion: string
  shellVersion: string
  /** False for a bundle whose file is gone or no longer matches its hash. */
  present?: (version: string) => boolean
  /** `--builtin-bundle`, or NYERK_BUILTIN=1. */
  forceBuiltin?: boolean
}

export interface BundleChoice {
  version: string
  source: 'builtin' | 'downloaded'
  /** Why the built-in one runs, when a downloaded one was named. */
  reason?: 'none' | 'forced' | 'missing' | 'quarantined' | 'needs-newer-shell' | 'older-than-builtin'
}

/**
 * Which bundle to run. Every refusal falls back to the one in the install, which is always there and
 * always runnable: the worst case is an app a release behind, never one that will not start.
 */
export function chooseBundle(input: ChooseBundleInput): BundleChoice {
  const builtin: BundleChoice = { version: input.builtinVersion, source: 'builtin' }
  if (input.forceBuiltin) return { ...builtin, reason: 'forced' }
  const active = input.state.active
  if (!active) return { ...builtin, reason: 'none' }
  const entry = input.state.bundles[active]
  if (!entry) return { ...builtin, reason: 'missing' }
  if (entry.failures >= MAX_BUNDLE_FAILURES) return { ...builtin, reason: 'quarantined' }
  if (input.present && !input.present(active)) return { ...builtin, reason: 'missing' }
  if (compareVersions(entry.minShell, input.shellVersion) > 0) return { ...builtin, reason: 'needs-newer-shell' }
  // A shell reinstalled past a downloaded bundle carries a newer app than the download.
  if (compareVersions(entry.version, input.builtinVersion) <= 0) return { ...builtin, reason: 'older-than-builtin' }
  return { version: entry.version, source: 'downloaded' }
}

export interface BundleOfferInput {
  manifest: BundleManifest
  /** The version running now, bundle or built-in. */
  running: string
  builtinVersion: string
  shellVersion: string
  /** Versions on disk, whole. */
  installed: string[]
  /** Versions this machine has proved it cannot start. */
  quarantined?: string[]
}

export interface BundleOffer {
  version: string
  notes?: string
  /** False when the version is on disk already, or is the built-in one. */
  needsDownload: boolean
  /** The feed points installs back at an older bundle. */
  isRollback: boolean
}

/**
 * What, if anything, the feed asks this install to run. The manifest names the version that should
 * be running rather than the newest that exists, which makes a rollback real: point it back at an
 * older bundle and every install moves back.
 */
export function bundleOffer(input: BundleOfferInput): BundleOffer | null {
  const { manifest } = input
  // Needs a newer shell: the installer's job, not ours.
  if (compareVersions(manifest.minShell, input.shellVersion) > 0) return null
  // Behind the install itself: the shell was reinstalled past the feed.
  if (compareVersions(manifest.version, input.builtinVersion) < 0) return null
  if (manifest.version === input.running) return null
  if (input.quarantined?.includes(manifest.version)) return null
  const onDisk = manifest.version === input.builtinVersion || input.installed.includes(manifest.version)
  const offer: BundleOffer = {
    version: manifest.version,
    needsDownload: !onDisk,
    isRollback: compareVersions(manifest.version, input.running) < 0,
  }
  if (manifest.notes !== undefined) offer.notes = manifest.notes
  return offer
}
