/**
 * The key app bundles are signed with (shared/bundle.ts), as in marnis-app (tools/bundle-keys.mjs).
 *
 *   node scripts/bundle-keys.mjs            print the public half of the key that exists
 *   node scripts/bundle-keys.mjs --create   make one, once; refuses to make a second
 *
 * Ed25519 from node:crypto. The private half is written outside the repository,
 * `%USERPROFILE%\.nyerk\bundle-signing.key` (or wherever NYERK_BUNDLE_KEY says), and is never on the
 * update host: the host serves what it is given, and the signature says who gave it.
 *
 * Back the file up. Losing it locks nobody out (an installer release can ship a new public key), but
 * no bundle can be published until that installer is out.
 */
import { createPublicKey, generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export function keyPath() {
  return process.env['NYERK_BUNDLE_KEY'] ?? join(homedir(), '.nyerk', 'bundle-signing.key')
}

/** The private key (PEM). Throws, with the fix in the message, when there is none. */
export function signingKey() {
  const path = keyPath()
  if (!existsSync(path)) throw new Error(`No bundle signing key at ${path}. Make one with: node scripts/bundle-keys.mjs --create`)
  return readFileSync(path, 'utf8')
}

/** The public half as base64 SPKI: the form BUNDLE_PUBLIC_KEY in src/shared/bundle.ts takes. */
export function publicKeyBase64() {
  return createPublicKey(signingKey()).export({ format: 'der', type: 'spki' }).toString('base64')
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/bundle-keys.mjs')) {
  const path = keyPath()
  if (process.argv.includes('--create')) {
    if (existsSync(path)) {
      console.error(`A key is already at ${path}. Refusing to replace it: installs that trust it would refuse bundles signed by a new one.`)
      process.exit(2)
    }
    const { privateKey } = generateKeyPairSync('ed25519')
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 })
    console.log(`Wrote ${path}. Back it up somewhere that is not this machine and not the update host.\n`)
  }
  if (!existsSync(path)) {
    console.error(`No key at ${path}. Make one with: node scripts/bundle-keys.mjs --create`)
    process.exit(2)
  }
  console.log(`export const BUNDLE_PUBLIC_KEY = '${publicKeyBase64()}'`)
}
