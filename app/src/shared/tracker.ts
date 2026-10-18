/**
 * What the Python tracker (aion2_tracker.sidecar) tells the app, and what the app keeps of it.
 * The wire format is documented in that module; these types mirror it.
 */

/** One pet of the collection, as the sidecar reports it. */
export interface Pet {
  id: number
  /** The monster it belongs to; null until learned from a kill or named by hand. */
  name: string | null
  souls: number
  level: number
  /** True when the level was worked out from the souls rather than sent by the server. */
  levelEstimated: boolean
  /** Genus crystals collected since the pet reached the cap (counted by the tracker this way). */
  crystals: number
  /** Souls gained since the tracker started. */
  session: number
}

export type TrackerState =
  | 'starting' // the sidecar is being launched
  | 'listening' // capturing, the game connection not found yet
  | 'locked' // reading the game connection
  | 'idle' // not capturing: the game is closed
  | 'stopped' // the capture ended (a replay finished)
  | 'error' // the sidecar reported an error, or could not be started
  | 'exited' // the sidecar process ended

export interface TrackerStatus {
  state: TrackerState
  detail: string | null
  /** Seconds since the last game packet, or null if none was ever seen. */
  lastPacketAgo: number | null
  /** Game traffic seen within GAME_ACTIVE_S. */
  gameActive: boolean
  /** The sidecar is replaying a capture rather than watching the game. */
  replay: boolean
  /** The last login sync: when, how many pets, how many souls. */
  synced: { at: number; pets: number; souls: number } | null
  /** Where the collection is saved. */
  dataFile: string | null
  /** The character whose collection this is (pet levels are per character); null until seen. */
  character: string | null
  /** That character's game server (Kaisinel 1104); null until seen. */
  server: number | null
}

/** What is loaded around you, from the tracker: monsters by code, your zone and position. */
export interface Nearby {
  /** The zone (questlog.gg world id), from the last zone load; null until one is seen. */
  world: number | null
  /** Where you are, in the map data's coordinates; from zone loads, teleports and your casts. */
  position: [number, number] | null
  /** When the position last changed (ms since epoch, stamped by main); null while unknown. */
  positionAt: number | null
  /** Your height (game units, 100 to a metre) where the position's record gave it. */
  height?: number | null
  monsters: { npc: number; count: number }[]
}

export const NO_NEARBY: Nearby = { world: null, position: null, positionAt: null, monsters: [] }

/** A pet the collection has no record of yet (seen nearby, or opened from the map). */
export const blankPet = (id: number): Pet => ({ id, name: null, souls: 0, level: 0, levelEstimated: true, crystals: 0, session: 0 })

/** A player killed by a player around you (the killing blow), as the PvP Log lists it. */
export interface PvpKill {
  at: number
  killer: { name: string; server: number; guild: string | null }
  /** Null when the victim was never in view (no name to give). */
  victim: { name: string; server: number | null; guild?: string | null } | null
  /** You were the killer. */
  mine: boolean
  /** You were the victim. */
  died: boolean
  /** Your legion was the killer's or the victim's (you included). */
  legion: boolean
}

/** A soul as the HUD toasts it. */
export interface SoulToast {
  pet: Pet
  amount: number
  at: number
  /** This soul took the pet to its next level. */
  levelUp: boolean
  /** The pet is capped: this was a genus crystal (its own message, `11 90`), not a soul. */
  crystal: boolean
}

/** Without game packets for this long, the game is taken to be closed (or at character select). */
export const GAME_ACTIVE_S = 15

/** Pet Insight caps at level 3 on the global version. */
export const MAX_LEVEL = 3

/**
 * Souls to go from Lv0 to 1, 1 to 2 and 2 to 3. The count restarts at 0 on each level-up, which
 * is the number the Pets menu shows; at MAX_LEVEL souls stop and genus crystals take over.
 */
export const LEVEL_NEED = [5, 25, 75] as const

/** The souls the current level needs, or null once capped. */
export function nextLevelSouls(pet: Pick<Pet, 'level' | 'souls'>): number | null {
  return pet.level >= MAX_LEVEL ? null : (LEVEL_NEED[pet.level] ?? null)
}

/**
 * 0..1 of the way through the current level, like the Pets menu's bar: 12/25 is about half. Full
 * once capped. (It was the way to the cap, all 105 souls together, which looked wrong beside the
 * per-level count: GitHub issue #3.)
 */
export function levelProgress(pet: Pick<Pet, 'souls' | 'level'>): number {
  const need = nextLevelSouls(pet)
  return need === null ? 1 : Math.min(1, pet.souls / need)
}

/** One item in the Black Cloud Merchant's stock, as the tab's `91 56` record gives it. */
export interface ShopItem {
  slot: number
  /** The game's item id (questlog.gg's): see renderer/src/data/petItems.json for the pet ones. */
  item: number
  quantity: number
  currency: number
  base: number
  price: number
}

/** One tab of the merchant's stock, from the last time it was opened. */
export interface ShopStock {
  tab: number
  /** When the stock changes next (ms since epoch); null if the record did not say. */
  nextAt: number | null
  /** When the tab was opened (ms since epoch, stamped by main). */
  at: number
  items: ShopItem[]
}

/**
 * How long a stock that came at or after its own restock time is kept: for a minute or two past
 * the hour the game still sends the old stock, restock time and all, and shows it (2026-10-14:
 * the Pets tab at 23:00:01-23:00:16 said "restocks 23:00", the new stock came at 23:01:59).
 */
export const LATE_STOCK_KEEP_MS = 5 * 60_000

/** The stock has changed since this tab was opened (a newer opening replaces it anyway). */
export function stockExpired(stock: ShopStock, now: number): boolean {
  if (stock.nextAt === null) return false
  if (stock.at < stock.nextAt) return stock.nextAt <= now
  return now >= stock.at + LATE_STOCK_KEEP_MS
}
