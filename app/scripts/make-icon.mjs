/**
 * Draw the app icon: a violet disc with a pale soul flame, in the theme's colours.
 *
 *   node scripts/make-icon.mjs
 *
 * Writes build/icon.ico (exe, installer) and build/icon.png (256 px), and copies the PNG to
 * src/renderer/public/icon.png (the bubble, the tray and the window icon). No dependencies: the
 * shapes are signed distance fields sampled 4×4 per pixel, and the PNG is encoded with zlib.
 *
 * Replace with real artwork whenever there is some: anything that writes those two files works.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const RIM = hex('#4f3cdd') // violet-9
const DISC_TOP = hex('#312d81') // violet-5
const DISC_BOTTOM = hex('#141528') // violet-2
const FLAME_OUTER = hex('#a3acff') // violet-11
const FLAME_INNER = hex('#ffffff')

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

/** Signed distance (negative inside) to a soul flame in unit coordinates, centred at 0,0. */
function flame(x, y) {
  // A circle for the body, a curved tip drawn up and to the right, smoothly unioned.
  const body = Math.hypot(x, y - 0.18) - 0.3
  const t = Math.min(Math.max((0.18 - y) / 0.75, 0), 1) // 0 at the body, 1 at the tip
  const cx = 0.16 * Math.sin(t * Math.PI * 0.9) // the tip leans right, then back
  const width = 0.24 * (1 - t) ** 1.2
  const tip = Math.abs(x - cx) - width
  const tipLimit = Math.max(tip, y - 0.18, -0.57 - y)
  const k = 0.16
  const h = Math.min(Math.max(0.5 + (0.5 * (tipLimit - body)) / k, 0), 1)
  return tipLimit * (1 - h) + body * h - k * h * (1 - h)
}

function pixel(px, py, size) {
  const S = 4
  let acc = [0, 0, 0, 0]
  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      // -1..1 across the icon
      const x = ((px + (sx + 0.5) / S) / size) * 2 - 1
      const y = ((py + (sy + 0.5) / S) / size) * 2 - 1
      const r = Math.hypot(x, y)
      let rgb = null
      let a = 0
      if (r <= 0.97) {
        a = 1
        rgb = r > 0.88 ? RIM : mix(DISC_TOP, DISC_BOTTOM, (y + 1) / 2)
        const f = flame(x / 0.95, y / 0.95)
        if (f < 0) rgb = mix(FLAME_OUTER, FLAME_INNER, Math.min(1, -f / 0.16))
      }
      if (a) acc = [acc[0] + rgb[0], acc[1] + rgb[1], acc[2] + rgb[2], acc[3] + 1]
    }
  }
  const n = acc[3]
  return n ? [acc[0] / n, acc[1] / n, acc[2] / n, (255 * n) / (S * S)].map(Math.round) : [0, 0, 0, 0]
}

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size)
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4)
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** An .ico of PNG entries (Vista and later read these; it is what the exe and installer need). */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bit count
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

const images = SIZES.map((size) => ({ size, data: png(size) }))
mkdirSync(join(APP, 'build'), { recursive: true })
writeFileSync(join(APP, 'build', 'icon.ico'), ico(images))
writeFileSync(join(APP, 'build', 'icon.png'), images.at(-1).data)
mkdirSync(join(APP, 'src', 'renderer', 'public'), { recursive: true })
copyFileSync(join(APP, 'build', 'icon.png'), join(APP, 'src', 'renderer', 'public', 'icon.png'))
console.log(`icon: ${SIZES.join(', ')} px -> build/icon.ico, build/icon.png, src/renderer/public/icon.png`)
