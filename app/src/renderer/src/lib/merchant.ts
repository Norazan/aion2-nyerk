/**
 * The Black Cloud Merchant's pets worth buying: from the stock of the tabs opened (main keeps the
 * latest of each until its restock time), the "Pet: <name>" and "Soul: <name>" items whose pet is
 * not at the cap. A pet item unlocks a pet you do not have yet, and gives one soul otherwise; a
 * soul item gives one soul. Items are matched to pets by petItems.json (scripts/fetch-pet-items.mjs),
 * which the caller passes in (this file imports types only, so the tests can run it).
 */
import { MAX_LEVEL, stockExpired, type ShopStock } from '../../../shared/tracker.ts'

export interface MerchantOffer {
  pet: number
  /** What buying does: unlock the pet, or add one soul to it. */
  gives: 'unlock' | 'soul'
  price: number
  base: number
  /** Percent off the base price, rounded. */
  discount: number
}

export interface ItemTable {
  pets: Record<string, number>
  souls: Record<string, number>
}

/**
 * The offers worth buying, best first: pets you do not have yet, then by the biggest discount.
 * `level(pet)` is the pet's level, or null for a pet the collection has never seen.
 */
export function merchantOffers(
  stocks: ShopStock[],
  level: (pet: number) => number | null,
  now: number,
  table: ItemTable,
): MerchantOffer[] {
  const best = new Map<number, MerchantOffer>()
  for (const stock of stocks) {
    if (stockExpired(stock, now)) continue // restocked since
    for (const it of stock.items) {
      const petItem = table.pets[String(it.item)]
      const pet = petItem ?? table.souls[String(it.item)]
      if (pet === undefined) continue
      const lv = level(pet)
      if (lv !== null && lv >= MAX_LEVEL) continue
      const offer: MerchantOffer = {
        pet,
        gives: petItem !== undefined && (lv === null || lv === 0) ? 'unlock' : 'soul',
        price: it.price,
        base: it.base,
        discount: it.base > 0 ? Math.round((1 - it.price / it.base) * 100) : 0,
      }
      const seen = best.get(pet)
      if (!seen || offer.price < seen.price) best.set(pet, offer)
    }
  }
  return [...best.values()].sort(
    (a, b) => Number(b.gives === 'unlock') - Number(a.gives === 'unlock') || b.discount - a.discount || a.price - b.price,
  )
}

/**
 * The tab on screen: the stock opened last that has not restocked since. The window shows that
 * tab only, so the Special tab lists its pets and the Pets tab its own.
 */
export function shownStock(stocks: ShopStock[], now: number): ShopStock | null {
  let shown: ShopStock | null = null
  for (const s of stocks) if (!stockExpired(s, now) && (!shown || s.at > shown.at)) shown = s
  return shown
}

/** What decides an offer's place in the list, and whether it is highlighted. */
export interface OfferFacts {
  pinned: boolean
  /** The continents its soul monsters spawn on; null while the spawn data has not loaded. */
  spawns: string[] | null
  /** The continent of your side. */
  side: string
}

/** Each priority's label, best first; the info panel lists them in this order. */
export const PRIORITIES = [
  'Pinned pets',
  'Unlocks with no known spawn',
  'Unlocks that spawn on your continent',
  'Unlocks that spawn only on other continents (the Abyss counts)',
  'All other unlocks',
  'Pets with no known spawn',
  'The rest',
] as const

/** The offer's priority: an index into PRIORITIES, 0 the most wanted. */
export function offerPriority(o: MerchantOffer, f: OfferFacts): number {
  if (f.pinned) return 0
  const known = f.spawns !== null
  const none = known && f.spawns!.length === 0
  if (o.gives === 'unlock') {
    if (none) return 1
    if (known && f.spawns!.includes(f.side)) return 2
    if (known) return 3
    return 4 // spawns not loaded yet
  }
  return none ? 5 : 6
}

/** Pinned pets and unlocks: the ones highlighted. */
export const HIGH_PRIORITY = 4

/** Offers by priority, then the biggest discount, then the lowest price. */
export function sortOffers(offers: MerchantOffer[], priority: (o: MerchantOffer) => number): MerchantOffer[] {
  return offers
    .map((o) => ({ o, p: priority(o) }))
    .sort((a, b) => a.p - b.p || b.o.discount - a.o.discount || a.o.price - b.o.price)
    .map(({ o }) => o)
}
