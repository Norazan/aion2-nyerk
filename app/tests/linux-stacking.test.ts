import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LinuxStacking } from '../src/main/linuxStacking.ts'

const handle = (id = 0x240001, bytes = 8): Buffer => {
  const value = Buffer.alloc(bytes)
  value.writeUInt32LE(id)
  return value
}

test('KDE overlays set only their own window type using a fixed xprop argument list', () => {
  const calls: string[][] = []
  const stacking = new LinuxStacking('linux', { XDG_CURRENT_DESKTOP: 'KDE' }, (args) => { calls.push(args) })
  assert.match(stacking.apply(handle())!, /applied to window 0x240001/)
  assert.deepEqual(calls, [[
    '-id', '0x240001', '-f', '_NET_WM_WINDOW_TYPE', '32a', '-set', '_NET_WM_WINDOW_TYPE',
    '_KDE_NET_WM_WINDOW_TYPE_CRITICAL_NOTIFICATION',
  ]])
  assert.match(stacking.apply(handle(0x240002, 4))!, /applied to window 0x240002/)
  assert.equal(calls.length, 2)
})

test('KDE and Plasma desktop tokens and full-session flag are recognized', () => {
  for (const env of [
    { XDG_CURRENT_DESKTOP: 'foo:KDE;bar' },
    { XDG_CURRENT_DESKTOP: ' plasma ' },
    { KDE_FULL_SESSION: 'true' },
    { KDE_FULL_SESSION: '1' },
  ]) {
    let calls = 0
    new LinuxStacking('linux', env, () => { calls++ }).apply(handle())
    assert.equal(calls, 1)
  }
})

test('other platforms and desktop environments never invoke xprop', () => {
  const fail = (): never => { throw Error('xprop must not run') }
  assert.equal(new LinuxStacking('win32', { XDG_CURRENT_DESKTOP: 'KDE' }, fail).apply(handle()), null)
  assert.equal(new LinuxStacking('darwin', { KDE_FULL_SESSION: 'true' }, fail).apply(handle()), null)
  for (const env of [{}, { XDG_CURRENT_DESKTOP: 'GNOME' }, { XDG_CURRENT_DESKTOP: 'notkde', KDE_FULL_SESSION: 'false' }]) {
    assert.equal(new LinuxStacking('linux', env, fail).apply(handle()), null)
  }
})

test('missing or unusable xprop is diagnosed once and cached for subsequent overlays', () => {
  for (const code of ['ENOENT', 'EACCES', 'ETIMEDOUT']) {
    let calls = 0
    const stacking = new LinuxStacking('linux', { XDG_CURRENT_DESKTOP: 'KDE' }, () => {
      calls++
      throw Object.assign(new Error('tool failed'), { code })
    })
    assert.match(stacking.apply(handle())!, code === 'ENOENT' ? /install xorg-xprop/ : /unavailable/)
    assert.equal(stacking.apply(handle(0x240002)), null)
    assert.equal(calls, 1)
  }
})

test('invalid handles never invoke xprop or disable later valid overlays', () => {
  let calls = 0
  const stacking = new LinuxStacking('linux', { KDE_FULL_SESSION: 'true' }, () => { calls++ })
  const oversized = handle()
  oversized.writeUInt32LE(1, 4)
  for (const value of [Buffer.alloc(0), Buffer.alloc(3), Buffer.alloc(5), handle(0), oversized]) {
    assert.match(stacking.apply(value)!, /invalid native X11/)
  }
  assert.equal(calls, 0)
  assert.match(stacking.apply(handle())!, /applied/)
  assert.equal(calls, 1)
})

test('a single stale window does not prevent other overlays receiving priority', () => {
  let calls = 0
  const stacking = new LinuxStacking('linux', { XDG_CURRENT_DESKTOP: 'KDE' }, () => {
    if (++calls === 1) throw Object.assign(new Error('BadWindow'), { status: 1 })
  })
  assert.match(stacking.apply(handle())!, /could not be applied.*xprop exit 1/)
  assert.match(stacking.apply(handle(0x240002))!, /applied to window 0x240002/)
})
