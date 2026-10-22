import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyHudInputMode, configureDesktop } from '../src/main/desktop.ts'

const fakeApp = () => {
  const switches: [string, string][] = []
  const ids: string[] = []
  return { switches, ids, commandLine: { appendSwitch: (name: string, value: string) => { switches.push([name, value]) } }, setAppUserModelId: (id: string) => { ids.push(id) } }
}

test('Linux overlays select X11/XWayland without disabling the Chromium sandbox', () => {
  const app = fakeApp()
  configureDesktop(app, 'linux')
  assert.deepEqual(app.switches, [['ozone-platform', 'x11']])
  assert.deepEqual(app.ids, [])
})

test('Windows retains its existing taskbar identity without forcing a Linux display backend', () => {
  const app = fakeApp()
  configureDesktop(app, 'win32')
  assert.deepEqual(app.ids, ['com.xcrov.aion2-drop-tracker'])
  assert.deepEqual(app.switches, [])
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
