/**
 * The pet database: name, genus and portrait for every pet id, from a questlog.gg snapshot
 * (scripts/fetch-pets.mjs). The ids are the game's, as the tracker reports them.
 */
import db from '@/data/pets.json'
import type { Pet } from '@shared/tracker.ts'

export type Genus = 'fera' | 'cogni' | 'natura' | 'varian' | 'special'

export interface PetInfo {
  id: number
  name: string
  genus: Genus
}

/** The genus names the English client uses, in the order the Pets menu lists them. */
export const GENERA: { id: Genus; label: string }[] = [
  { id: 'cogni', label: 'Cogni' },
  { id: 'fera', label: 'Fera' },
  { id: 'natura', label: 'Natura' },
  { id: 'varian', label: 'Varian' },
  { id: 'special', label: 'Special' },
]

export const GENUS_LABEL = Object.fromEntries(GENERA.map((g) => [g.id, g.label])) as Record<Genus, string>

const byId = new Map<number, PetInfo>((db.pets as PetInfo[]).map((p) => [p.id, p]))

export const PET_DB_SOURCE = db.source
export const PET_DB_DATE = db.fetched
export const PET_DB_SIZE = byId.size

export function petInfo(id: number): PetInfo | undefined {
  return byId.get(id)
}

/** Relative, so it resolves next to index.html both from the dev server and from file://. */
export function petIcon(id: number): string | null {
  return byId.has(id) ? `pets/${id}.webp` : null
}

/** The pet's own name from the database, else the monster learned from kills, else its id. */
export function displayName(pet: Pick<Pet, 'id' | 'name'>): string {
  return byId.get(pet.id)?.name ?? pet.name ?? `Pet #${pet.id}`
}

/** The monster name learned from kills, when it says something the pet name does not. */
export function monsterName(pet: Pick<Pet, 'id' | 'name'>): string | null {
  const own = byId.get(pet.id)?.name
  return pet.name && own && pet.name !== own ? pet.name : null
}
