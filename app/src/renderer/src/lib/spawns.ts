/**
 * Where each pet's souls drop: the monsters that drop them, their level, and their spawn points,
 * with the zone maps to draw them on. A questlog.gg snapshot (scripts/fetch-spawns.mjs, then
 * scripts/shrink-maps.py), loaded on first use: it is only needed when a pet's map is opened.
 */
import { shallowRef } from 'vue'
import type { Nearby } from '@shared/tracker.ts'

export interface World {
  name: string
  group: string
  key: string
  /** [x0, y0, nx, ny, size]: the zone spans x0..x0+nx*size and y0..y0+ny*size. */
  sectors: [number, number, number, number, number]
}

export interface DropperWorld {
  world: number
  /** The named region most of its spawns are in. */
  area: string | null
  points: [number, number][]
}

export interface Dropper {
  /** The monster's code: the same as the tracker reads from spawn records. */
  npc: number
  name: string
  level: number
  chance: number
  worlds: DropperWorld[]
}

export interface SpawnData {
  source: string
  fetched: string
  worlds: Record<string, World>
  pets: Record<string, Dropper[]>
}

let loading: Promise<SpawnData> | null = null

export function loadSpawns(): Promise<SpawnData> {
  loading ??= fetch('maps/spawns.json').then((r) => {
    if (!r.ok) throw new Error(`maps/spawns.json: HTTP ${r.status}`)
    return r.json() as Promise<SpawnData>
  })
  return loading
}

/** Relative, so it resolves next to index.html from the dev server and from file:// alike. */
export const mapImage = (w: World): string => `maps/${w.key}.webp`

/**
 * A spawn's place on the zone image, 0..1 from the top left. questlog.gg stores y negated,
 * hence the flip (checked against their own render).
 */
export function project(w: World, [x, y]: [number, number]): [number, number] {
  const [x0, y0, nx, ny, size] = w.sectors
  return [(x - x0) / (nx * size), 1 + (y0 - y) / (ny * size)]
}

/** questlog.gg's page for a monster: its drops, and a map of where it spawns. */
export const npcUrl = (npc: number): string => `https://questlog.gg/aion-2/en/db/npc/${npc}`

/** Souls drop much less often from monsters more than this many levels below you. */
export const LEVEL_GAP = 10

export type LevelFit = 'good' | 'low' | 'high' | null

export function levelFit(monster: number, player: number | null): LevelFit {
  if (player === null) return null
  if (monster < player - LEVEL_GAP) return 'low'
  if (monster > player + 5) return 'high'
  return 'good'
}

const FACTION_GROUP: Record<'elyos' | 'asmodians', string> = { elyos: 'elyos', asmodians: 'asmodians' }

/**
 * Your side's zones first, then the Abyss, then the other side's; within that, monsters close to
 * your level before the rest, then by level.
 */
export function sortDroppers(list: Dropper[], data: SpawnData, faction: 'elyos' | 'asmodians', player: number | null): Dropper[] {
  const rank = (d: Dropper): number => {
    const groups = d.worlds.map((w) => data.worlds[w.world]?.group)
    if (groups.includes(FACTION_GROUP[faction])) return 0
    if (groups.includes('abyss')) return 1
    if (groups.length === 0) return 3
    return 2
  }
  const fit = (d: Dropper): number => ({ good: 0, high: 1, low: 2 })[levelFit(d.level, player) ?? 'good']
  return [...list].sort((a, b) => rank(a) - rank(b) || fit(a) - fit(b) || a.level - b.level || a.name.localeCompare(b.name))
}

// ---- around you ----------------------------------------------------------------------------

const shared = shallowRef<SpawnData | null>(null)

/** The spawn data as a ref, loaded on first use and shared by every component. */
export function useSpawns(): typeof shared {
  if (!shared.value) void loadSpawns().then((d) => (shared.value = d))
  return shared
}

export interface NearbyMonster {
  npc: number
  name: string
  level: number
  count: number
}

export interface NearbyPet {
  pet: number
  monsters: NearbyMonster[]
  /** Soul monsters of this pet loaded around you. */
  count: number
}

/** Which monster codes drop which pets' souls (a monster can drop more than one). */
function dropIndex(data: SpawnData): Map<number, { pet: number; d: Dropper }[]> {
  const index = new Map<number, { pet: number; d: Dropper }[]>()
  for (const [pet, list] of Object.entries(data.pets)) {
    for (const d of list) index.set(d.npc, [...(index.get(d.npc) ?? []), { pet: Number(pet), d }])
  }
  return index
}
const indexes = new WeakMap<SpawnData, ReturnType<typeof dropIndex>>()

/** The pets whose souls the monsters around you drop, most of them first. */
export function nearbyPets(near: Nearby, data: SpawnData): NearbyPet[] {
  let index = indexes.get(data)
  if (!index) indexes.set(data, (index = dropIndex(data)))
  const byPet = new Map<number, NearbyPet>()
  for (const { npc, count } of near.monsters) {
    for (const { pet, d } of index.get(npc) ?? []) {
      const entry = byPet.get(pet) ?? { pet, monsters: [], count: 0 }
      entry.monsters.push({ npc, name: d.name, level: d.level, count })
      entry.count += count
      byPet.set(pet, entry)
    }
  }
  return [...byPet.values()].sort((a, b) => b.count - a.count || a.pet - b.pet)
}

/**
 * The zone you are in: the last zone load's, else the one the soul monsters around you spawn in
 * (a tracker started mid-session has not seen a zone load).
 */
export function currentWorld(near: Nearby, data: SpawnData): number | null {
  if (near.world !== null) return near.world
  const votes = new Map<number, number>()
  for (const p of nearbyPets(near, data)) {
    for (const m of p.monsters) {
      for (const w of data.pets[p.pet]?.find((d) => d.npc === m.npc)?.worlds ?? []) {
        votes.set(w.world, (votes.get(w.world) ?? 0) + m.count)
      }
    }
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
