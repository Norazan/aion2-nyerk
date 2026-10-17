/**
 * Game servers by the id the game uses (in kill credits and player records): their short tag, as
 * the game shows cross-server players ("xKanekii [LUM]"). Learned one at a time: an id not here
 * shows as its number. Kaisinel 1104 from the owner's character (2026-10-13), LUM 2104 from the
 * owner reading the tag on a player whose records say 2104 (pvp_kills.pcap).
 */
export const SERVER_TAGS: Record<number, string> = {
  1104: 'KAI',
  2104: 'LUM',
}

export const serverTag = (id: number): string => SERVER_TAGS[id] ?? String(id)
