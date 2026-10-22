import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { helperExecutable, killTrackerTree, supportsAutomaticUpdates, TrackerCleanup, validHelperOverride, venvPython } from '../src/main/trackerPlatform.ts'

test('tracker paths select native executables', () => {
  const root = join(tmpdir(), 'nyerk-repo')
  assert.equal(helperExecutable('linux'), 'aion2-tracker')
  assert.equal(helperExecutable('win32'), 'aion2-tracker.exe')
  assert.equal(venvPython(root, 'linux'), join(root, '.venv', 'bin', 'python'))
  assert.equal(venvPython(root, 'win32'), join(root, '.venv', 'Scripts', 'python.exe'))
})

test('Linux never consumes the Windows update feed', () => {
  assert.equal(supportsAutomaticUpdates('linux', true), false)
  assert.equal(supportsAutomaticUpdates('win32', false), false)
  assert.equal(supportsAutomaticUpdates('win32', true), true)
})

test('helper override rejects directories, missing files and non-executable files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nyerk-helper-'))
  try {
    assert.equal(validHelperOverride(dir), false)
    assert.equal(validHelperOverride(join(dir, 'missing')), false)
    assert.equal(validHelperOverride('relative-helper'), false)
    const file = join(dir, 'helper')
    writeFileSync(file, 'native executable', { mode: 0o600 })
    if (process.platform !== 'win32') assert.equal(validHelperOverride(file), false)
    chmodSync(file, 0o700)
    assert.equal(validHelperOverride(file), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('app exit still kills a helper awaiting graceful shutdown', { skip: process.platform === 'win32', timeout: 5000 }, async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  const cleanup = new TrackerCleanup()
  try {
    await once(child, 'spawn')
    const exited = once(child, 'exit')
    // Simulate stopTracker clearing its active reference, followed immediately by app exit.
    cleanup.waitForExit(child, 60_000)
    cleanup.killAll()
    const [code, signal] = await exited
    assert.equal(code, null)
    assert.equal(signal, 'SIGKILL')
  } finally {
    killTrackerTree(child)
  }
})

test('POSIX cleanup terminates the detached helper process group', { skip: process.platform === 'win32', timeout: 5000 }, async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  try {
    await once(child, 'spawn')
    const exited = once(child, 'exit')
    killTrackerTree(child)
    const [code, signal] = await exited
    assert.equal(code, null)
    assert.equal(signal, 'SIGKILL')
    assert.throws(() => process.kill(-child.pid!, 0), { code: 'ESRCH' })
    // Cleanup is also safe when the process has already gone.
    killTrackerTree(child)
  } finally {
    if (child.exitCode === null && child.signalCode === null) killTrackerTree(child)
  }
})
