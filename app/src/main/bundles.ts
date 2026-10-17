/**
 * Fetch an app bundle, verify it, keep it for the next start (shared/bundle.ts). marnis-app's
 * main/bundle/updater.ts, with one feed.
 *
 * No Electron here: the folder and `fetch` are handed in, so tests run it against a temporary folder
 * and a fake host. The rules:
 * - the manifest is **signed**; an unsigned or wrongly signed one is not read further;
 * - the file must be the manifest's size and hash, checked before it is written where the loader
 *   looks;
 * - it is written under a `.part` name and renamed into place, so a crash leaves nothing a loader
 *   could pick up;
 * - state.json is written last, and naming the version there (`activateBundle`) is the only thing
 *   that makes a bundle live.
 */
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto'
import { mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { withoutAsar } from '../shared/asar.ts'
import {
  BUNDLE_PUBLIC_KEY,
  bundleOffer,
  bundleSigningPayload,
  compareVersions,
  MAX_BUNDLE_FAILURES,
  parseBundleManifest,
  parseBundleState,
  type BundleManifest,
  type BundleOffer,
  type BundleState,
} from '../shared/bundle.ts'

export interface BundleFetchResponse {
  ok: boolean
  status: number
  text(): Promise<string>
  bytes(): Promise<Uint8Array>
}

export interface BundleDeps {
  /** The feed folder, with a trailing slash. */
  feed: string
  fetch: (url: string) => Promise<BundleFetchResponse>
  /** `<userData>/bundles`. */
  root: string
  /** The install: what minShell is measured against, and the built-in bundle's version. */
  shellVersion: string
  /** What is running now: the built-in app, or a bundle adopted earlier. */
  runningVersion: string
  /** Overridden only by tests, which sign with a key of their own. */
  verify?: (payload: string, signature: string) => boolean
  onWarning?: (message: string) => void
  now?: () => number
}

export type BundleCheck = { outcome: 'none' } | { outcome: 'offer'; offer: BundleOffer; manifest: BundleManifest } | { outcome: 'error'; error: string }

const statePath = (root: string): string => join(root, 'state.json')
const bundleDir = (root: string, version: string): string => join(root, version)
const bundlePath = (root: string, version: string): string => join(bundleDir(root, version), 'bundle.asar')

/** Ed25519 against the key compiled into this build. */
export function verifyManifestSignature(payload: string, signature: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(BUNDLE_PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' })
    return verifySignature(null, Buffer.from(payload, 'utf8'), key, Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}

export async function readBundleState(root: string): Promise<BundleState> {
  try {
    return parseBundleState(await readFile(statePath(root), 'utf8'))
  } catch {
    return { active: null, bundles: {} }
  }
}

/** Never in place: the loader reads this before the app exists, and cannot recover from half a file. */
export async function writeBundleState(root: string, state: BundleState): Promise<void> {
  await mkdir(root, { recursive: true })
  const partial = `${statePath(root)}.part`
  await writeFile(partial, JSON.stringify(state, null, 2))
  withoutAsar(() => renameSync(partial, statePath(root)))
}

/** The versions whose file is where the state says. */
export function installedBundles(root: string, state: BundleState): string[] {
  return Object.keys(state.bundles).filter((version) => {
    try {
      return withoutAsar(() => statSync(bundlePath(root, version)).isFile())
    } catch {
      return false
    }
  })
}

/**
 * Ask the feed what this install should be running. No manifest (404), one that does not parse and
 * one not signed by this build's key are all "none": not a network problem, and nothing the user
 * could act on.
 */
export async function checkForBundle(deps: BundleDeps): Promise<BundleCheck> {
  let response: BundleFetchResponse
  try {
    response = await deps.fetch(`${deps.feed}manifest.json`)
  } catch (error) {
    return { outcome: 'error', error: error instanceof Error ? error.message : String(error) }
  }
  if (response.status === 404) return { outcome: 'none' }
  if (!response.ok) return { outcome: 'error', error: `HTTP ${response.status}` }
  const manifest = parseBundleManifest(await response.text())
  if (!manifest) {
    deps.onWarning?.('the bundle manifest is malformed; ignoring it')
    return { outcome: 'none' }
  }
  if (!(deps.verify ?? verifyManifestSignature)(bundleSigningPayload(manifest), manifest.signature)) {
    deps.onWarning?.('the bundle manifest is not signed by this build’s key; ignoring it')
    return { outcome: 'none' }
  }
  const state = await readBundleState(deps.root)
  const offer = bundleOffer({
    manifest,
    running: deps.runningVersion,
    builtinVersion: deps.shellVersion,
    shellVersion: deps.shellVersion,
    installed: installedBundles(deps.root, state),
    quarantined: Object.values(state.bundles)
      .filter((b) => b.failures >= MAX_BUNDLE_FAILURES)
      .map((b) => b.version),
  })
  return offer ? { outcome: 'offer', offer, manifest } : { outcome: 'none' }
}

/** Put a bundle on disk, verified, and record it. Nothing is made active here. */
export async function downloadBundle(deps: BundleDeps, manifest: BundleManifest): Promise<void> {
  const response = await deps.fetch(`${deps.feed}${manifest.file}`)
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${manifest.file}`)
  const bytes = await response.bytes()
  if (bytes.byteLength !== manifest.size) throw new Error(`${manifest.file} is ${bytes.byteLength} bytes, not ${manifest.size}`)
  if (createHash('sha512').update(bytes).digest('base64') !== manifest.sha512) throw new Error(`${manifest.file} does not match the manifest's hash`)

  const final = bundlePath(deps.root, manifest.version)
  await mkdir(bundleDir(deps.root, manifest.version), { recursive: true })
  await writeFile(`${final}.part`, bytes)
  withoutAsar(() => renameSync(`${final}.part`, final))

  const state = await readBundleState(deps.root)
  await writeBundleState(deps.root, {
    ...state,
    bundles: {
      ...state.bundles,
      [manifest.version]: { version: manifest.version, minShell: manifest.minShell, sha512: manifest.sha512, installedAt: (deps.now ?? Date.now)(), failures: 0 },
    },
  })
}

/** Point the loader at a bundle (null: the built-in app). The next start runs it. */
export async function activateBundle(root: string, version: string | null): Promise<void> {
  const state = await readBundleState(root)
  // Chosen on purpose, a bundle starts again from a clean count.
  const chosen = version === null ? undefined : state.bundles[version]
  const bundles = chosen ? { ...state.bundles, [chosen.version]: { ...chosen, failures: 0 } } : state.bundles
  await writeBundleState(root, { ...state, active: version, bundles })
}

/** The launch worked: the loader's count goes back to zero. */
export async function markBundleStarted(root: string, version: string): Promise<void> {
  const state = await readBundleState(root)
  const bundle = state.bundles[version]
  if (!bundle || bundle.failures === 0) return
  await writeBundleState(root, { ...state, bundles: { ...state.bundles, [version]: { ...bundle, failures: 0 } } })
}

/**
 * Tidy up: drop downloads that were superseded and let go of an active bundle the install has
 * overtaken. Kept: what is running and what is active. The **record** of a bundle that was counted
 * out is kept even when its file goes, or the feed would offer the same broken version at the next
 * check, forever.
 */
export async function reconcileBundles(deps: Pick<BundleDeps, 'root' | 'shellVersion' | 'runningVersion'>): Promise<void> {
  mkdirSync(deps.root, { recursive: true })
  const state = await readBundleState(deps.root)
  const active = state.active && compareVersions(state.active, deps.shellVersion) > 0 ? state.active : null
  const keep = new Set([deps.runningVersion, ...(active ? [active] : [])])
  const bundles: BundleState['bundles'] = {}
  for (const [version, entry] of Object.entries(state.bundles)) {
    if (keep.has(version) || entry.failures >= MAX_BUNDLE_FAILURES) bundles[version] = entry
  }
  for (const entry of await readdir(deps.root, { withFileTypes: true })) {
    if (!entry.isDirectory() || keep.has(entry.name)) continue
    try {
      withoutAsar(() => rmSync(join(deps.root, entry.name), { recursive: true, force: true }))
    } catch {
      // Held open: next start.
    }
  }
  if (active !== state.active || Object.keys(bundles).length !== Object.keys(state.bundles).length) {
    await writeBundleState(deps.root, { active, bundles })
  }
}
