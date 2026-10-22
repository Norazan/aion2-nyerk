import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyHudInputMode, configureDesktop, panelDesktopOptions, revealPanel } from '../src/main/desktop.ts'

const fakeApp = (backend = 'x11') => {
  const ids: string[] = []
  const relaunches: string[][] = []
  const exits: number[] = []
  let software = false
  return {
    ids, relaunches, exits,
    commandLine: { getSwitchValue: () => backend },
    setAppUserModelId: (id: string) => { ids.push(id) },
    disableHardwareAcceleration: () => { software = true },
    relaunch: ({ args }: { args: string[] }) => { relaunches.push(args) },
    exit: (code: number) => { exits.push(code) },
    software: () => software,
  }
}

test('Linux keeps its initialized X11 backend without changing it after startup', () => {
  const app = fakeApp()
  assert.equal(configureDesktop(app, 'linux', [], {}), true)
  assert.deepEqual(app.relaunches, [])
  assert.deepEqual(app.exits, [])
  assert.deepEqual(app.ids, [])
  assert.equal(app.software(), false)
})

test('Windows retains its existing taskbar identity without forcing a Linux display backend', () => {
  const app = fakeApp()
  configureDesktop(app, 'win32', [], {})
  assert.deepEqual(app.ids, ['com.xcrov.aion2-drop-tracker'])
  assert.deepEqual(app.relaunches, [])
})

test('software rendering can be selected before startup by flag or environment', () => {
  const byFlag = fakeApp()
  configureDesktop(byFlag, 'linux', ['nyerk', '--disable-gpu'], {})
  assert.equal(byFlag.software(), true)
  assert.deepEqual(byFlag.relaunches, [])
  const byEnv = fakeApp()
  configureDesktop(byEnv, 'linux', [], { NYERK_SOFTWARE_RENDERING: '1' })
  assert.equal(byEnv.software(), true)
})

test('Wayland startup relaunches with X11 before loading the app, preserving other flags', () => {
  const app = fakeApp('wayland')
  assert.equal(configureDesktop(app, 'linux', ['electron', '/app', '--ozone-platform=wayland', '--disable-gpu', '--builtin-bundle'], {}), false)
  assert.deepEqual(app.relaunches, [['/app', '--disable-gpu', '--builtin-bundle', '--ozone-platform=x11']])
  assert.deepEqual(app.exits, [0])
  assert.equal(app.software(), true)
  const next = fakeApp('x11')
  assert.equal(configureDesktop(next, 'linux', ['electron', ...app.relaunches[0]!], {}), true)
  assert.deepEqual(next.relaunches, [])
})

test('X11 relaunch replaces a separated ozone option and its value', () => {
  const app = fakeApp('wayland')
  configureDesktop(app, 'linux', ['electron', '/app', '--ozone-platform', 'wayland', '--disable-gpu'], {})
  assert.deepEqual(app.relaunches, [['/app', '--disable-gpu', '--ozone-platform=x11']])
})

test('unsupported X11 initialization exits instead of repeatedly relaunching', (t) => {
  t.mock.method(console, 'error', () => {})
  const app = fakeApp('wayland')
  assert.equal(configureDesktop(app, 'linux', ['nyerk', '--ozone-platform=x11'], {}), false)
  assert.deepEqual(app.relaunches, [])
  assert.deepEqual(app.exits, [1])
})

test('Linux panel is opaque and reachable from the taskbar', () => {
  assert.deepEqual(panelDesktopOptions('linux'), {
    transparent: false, backgroundColor: '#0f101a', skipTaskbar: false, minimizable: true,
  })
  assert.deepEqual(panelDesktopOptions('win32'), {})
})

test('Linux panel becomes visible even when the renderer never reaches its first paint', () => {
  let revealed = false
  const window = {
    webContents: { isLoading: () => true },
    once: () => { throw new Error('Waiting for first paint would keep the panel hidden') },
  }
  revealPanel(window, () => { revealed = true }, 'linux')
  assert.equal(revealed, true)
})

test('Windows panel still waits for readiness while loading', () => {
  let ready: (() => void) | undefined
  let revealed = false
  const window = {
    webContents: { isLoading: () => true },
    once: (event: 'ready-to-show', listener: () => void) => {
      assert.equal(event, 'ready-to-show')
      ready = listener
    },
  }
  revealPanel(window, () => { revealed = true }, 'win32')
  assert.equal(revealed, false)
  assert.ok(ready)
  ready()
  assert.equal(revealed, true)
})

const fakeHud = (focused: boolean) => {
  const ignored: boolean[] = []
  const focusable: boolean[] = []
  let blurCount = 0
  return {
    ignored, focusable,
    setIgnoreMouseEvents: (value: boolean) => { ignored.push(value) },
    setFocusable: (value: boolean) => { focusable.push(value) },
    isFocused: () => focused,
    blur: () => { focused = false; blurCount++ },
    blurCount: () => blurCount,
  }
}

test('ending Linux HUD move mode releases held keyboard focus as well as mouse input', () => {
  const hud = fakeHud(true)
  applyHudInputMode(hud, false, 'linux')
  assert.deepEqual(hud.ignored, [true])
  assert.deepEqual(hud.focusable, [])
  assert.equal(hud.isFocused(), false)
  assert.equal(hud.blurCount(), 1)
})

test('Linux HUD input changes preserve focus in another window and allow move mode', () => {
  const hud = fakeHud(false)
  applyHudInputMode(hud, false, 'linux')
  assert.equal(hud.blurCount(), 0)
  const editedHud = fakeHud(true)
  applyHudInputMode(editedHud, true, 'linux')
  assert.deepEqual(editedHud.ignored, [false])
  assert.equal(editedHud.isFocused(), true)
  assert.equal(editedHud.blurCount(), 0)
})

test('Windows HUD move mode keeps the supported focusability behavior', () => {
  const hud = fakeHud(true)
  applyHudInputMode(hud, false, 'win32')
  applyHudInputMode(hud, true, 'win32')
  assert.deepEqual(hud.ignored, [true, false])
  assert.deepEqual(hud.focusable, [false, true])
  assert.equal(hud.blurCount(), 0)
})
