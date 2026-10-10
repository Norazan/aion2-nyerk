/**
 * Snapshot questlog.gg's Aion 2 pet database: names, genus and portrait for every pet id.
 *
 *   node scripts/fetch-pets.mjs [--force]
 *
 * Writes src/renderer/src/data/pets.json (bundled into the renderer) and
 * src/renderer/public/pets/<id>.webp (served next to it). Re-run after a game patch adds pets;
 * existing portraits are kept unless --force. The ids are the game's own pet ids, the same ones
 * the `0d 90` soul and `00 90` collection records carry.
 *
 * Source: https://questlog.gg/aion-2/en/db/pets (global client, `en`). Their data, used with
 * credit; it is a one-time snapshot, not something the app fetches while it runs. Requests are
 * sequential with a pause between them.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(APP, 'src', 'renderer', 'src', 'data', 'pets.json')
const ICONS = join(APP, 'src', 'renderer', 'public', 'pets')
const API = 'https://questlog.gg/aion-2/api/trpc/database.getPets'
const CDN = 'https://cdn.questlog.gg/aion-2'
const LANGUAGE = 'en'
const HEADERS = { 'user-agent': 'aion2-drop-tracker (personal pet collection tracker)', accept: 'application/json' }
const PAUSE_MS = 250
const force = process.argv.includes('--force')

/** questlog's category keys, and the genus names the English client and guides use. */
const GENUS = { feral: 'fera', intellect: 'cogni', nature: 'natura', trans: 'varian', special: 'special' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function page(n) {
  const url = `${API}?input=${encodeURIComponent(JSON.stringify({ language: LANGUAGE, page: n }))}`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return (await res.json()).result.data
}

/** `/assets/.../UT_X_01.UT_X_01` (an Unreal object path) -> `${CDN}/assets/.../UT_X_01.webp` */
const iconUrl = (icon) => `${CDN}${icon.replace(/\.[^/]+$/, '')}.webp`

const first = await page(1)
let entries = first.pageData
for (let n = 2; n <= first.pageCount; n++) {
  await sleep(PAUSE_MS)
  entries = entries.concat((await page(n)).pageData)
}

const pets = entries
  .filter((e) => e.dbType === 'pet' && !e.isDisabled)
  .map((e) => {
    const genus = GENUS[e.mainCategory]
    if (!genus) throw new Error(`pet ${e.id}: unknown category ${e.mainCategory}`)
    return { id: Number(e.id), name: e.name, genus, iconUrl: iconUrl(e.icon) }
  })
  .sort((a, b) => a.id - b.id)

mkdirSync(ICONS, { recursive: true })
let fetched = 0
let bytes = 0
for (const pet of pets) {
  const file = join(ICONS, `${pet.id}.webp`)
  if (existsSync(file) && !force) continue
  const res = await fetch(pet.iconUrl)
  if (!res.ok) {
    console.warn(`pet ${pet.id} ${pet.name}: icon HTTP ${res.status}`)
    continue
  }
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(file, buf)
  fetched++
  bytes += buf.length
  await sleep(PAUSE_MS)
}

mkdirSync(dirname(DATA), { recursive: true })
const out = {
  source: `https://questlog.gg/aion-2/${LANGUAGE}/db/pets`,
  fetched: new Date().toISOString().slice(0, 10),
  pets: pets.map(({ id, name, genus }) => ({ id, name, genus })),
}
writeFileSync(DATA, JSON.stringify(out, null, 1) + '\n')

const byGenus = Object.fromEntries(Object.values(GENUS).map((g) => [g, pets.filter((p) => p.genus === g).length]))
console.log(`${pets.length} pets -> ${DATA}`)
console.log(`genus: ${JSON.stringify(byGenus)}`)
console.log(`icons: ${fetched} downloaded (${(bytes / 1024 / 1024).toFixed(1)} MB), ${pets.length - fetched} already present`)
