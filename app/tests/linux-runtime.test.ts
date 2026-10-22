import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { findLinuxGame, isGameCommand, isGameExecutable, parseWindowsGamePid } from '../src/main/gameProcesses.ts'
import { hashMachineId, linuxMachineId } from '../src/main/machineIdentity.ts'

test('matches only supported game executable basenames on Linux and Windows paths', () => {
  for (const name of ['AION2.exe', 'C:\\NC\\Aion 2\\AION2.exe', '/games/Aion 2/Aion2-Win64-Shipping.exe']) {
    assert.equal(isGameExecutable(name), true, name)
  }
  for (const name of ['Aion2DropTracker.exe', 'AION2.exe.bak', '/AION2.exe/helper', 'NotAION2.exe', '']) {
    assert.equal(isGameExecutable(name), false, name)
  }
})

test('recognizes Wine and Proton command lines without matching arbitrary arguments', () => {
  assert.equal(isGameCommand(['Z:\\games\\AION2.exe', '-dx11']), true)
  assert.equal(isGameCommand(['/usr/bin/wine64', '/games/Aion 2/AION2-Win64-Shipping.exe']), true)
  assert.equal(isGameCommand(['/opt/proton/files/bin/wine64-preloader', 'C:\\Games\\AION2.exe']), true)
  assert.equal(isGameCommand(['/usr/bin/editor', 'AION2.exe']), false)
  assert.equal(isGameCommand(['python', 'capture.py', 'AION2.exe']), false)
  assert.equal(isGameCommand(['wine', 'notepad.exe', 'AION2.exe']), false)
  assert.equal(isGameCommand([]), false)
})

test('finds the Wine game pid through procfs, tolerating vanished entries', { skip: process.platform !== 'linux' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'nyerk-proc-'))
  try {
    for (const entry of ['4', '15', '38', 'self']) await mkdir(join(root, entry))
    await writeFile(join(root, '4', 'cmdline'), 'Aion2DropTracker.exe\0')
    await writeFile(join(root, '38', 'cmdline'), 'C:\\NC\\AION2.exe\0-dx11\0')
    await symlink('/opt/proton/files/bin/wine64-preloader', join(root, '38', 'exe'))
    assert.equal(await findLinuxGame(root), 38)
    await rm(join(root, '38'), { recursive: true })
    assert.equal(await findLinuxGame(root), null)
    assert.equal(await findLinuxGame(join(root, 'missing')), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('finds a process by executable symlink when its command line is unavailable', { skip: process.platform !== 'linux' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'nyerk-proc-'))
  try {
    await mkdir(join(root, '123'))
    await symlink('/games/AION2.exe', join(root, '123', 'exe'))
    assert.equal(await findLinuxGame(root), 123)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Windows tasklist still uses exact executable names', () => {
  const output = '"Aion2DropTracker.exe","15","Console","1","20,000 K"\r\n"AION2.exe","99","Console","1","4,000,000 K"\r\n'
  assert.equal(parseWindowsGamePid(output), 99)
  assert.equal(parseWindowsGamePid('"Aion2DropTracker.exe","15"'), null)
})

test('Linux machine identity validates input and falls back to the dbus file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nyerk-id-'))
  const primary = join(root, 'machine-id')
  const fallback = join(root, 'dbus-machine-id')
  try {
    const id = '1234567890ABCDEF1234567890ABCDEF'
    await writeFile(primary, 'uninitialized\n')
    await writeFile(fallback, `${id}\n`)
    assert.equal(linuxMachineId([primary, fallback]), id.toLowerCase())
    await writeFile(primary, '00000000000000000000000000000000')
    assert.equal(linuxMachineId([primary]), null)
    await writeFile(primary, `${id}\n`)
    assert.equal(linuxMachineId([primary]), id.toLowerCase())
    assert.equal(linuxMachineId([join(root, 'missing')]), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('machine hashes remain stable, salted and distinct from the raw identity', () => {
  const id = '0123456789abcdef0123456789abcdef'
  const hash = hashMachineId(id)
  assert.match(hash, /^[a-f0-9]{64}$/)
  assert.equal(hash, 'b3774ecb4694819be79c5a74fa78c0d8fafd69cd3b03e80084c09b81511724b8')
  assert.notEqual(hashMachineId(id + '1'), hash)
})
