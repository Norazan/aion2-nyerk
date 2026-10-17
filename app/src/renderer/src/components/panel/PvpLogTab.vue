<script setup lang="ts">
// The PvP kill feed: every player killed by a player around you this session, newest first, as the
// game credits it (the killing blow). Your kills in green, your deaths in red; players from other
// servers carry their server's tag ([LUM]).
import { computed, onBeforeUnmount, ref } from 'vue'
import Button from '@/components/Button.vue'
import { bridge } from '@/lib/bridge.ts'
import { useApp } from '@/stores/app.ts'
import { serverTag } from '@shared/servers.ts'
import type { PvpKill } from '@shared/tracker.ts'

const store = useApp()
const kills = computed(() => [...store.pvp].reverse())
const myServer = computed(() => store.status?.server ?? null)
const tag = (server: number | null): string | null => (server === null || server === myServer.value ? null : serverTag(server))
// One filter at a time; clicking the active one shows everything again.
type Filter = 'mine' | 'legion'
const filters: { id: Filter; label: string; title: string; empty: string }[] = [
  { id: 'mine', label: 'Mine', title: 'Your kills and deaths', empty: 'No kills or deaths of yours yet.' },
  { id: 'legion', label: 'My Guild', title: "Kills and deaths of your legion's members, yours included", empty: 'No kills or deaths of your legion yet.' },
]
const filter = ref<Filter | null>(null)
function pick(id: Filter): void {
  filter.value = filter.value === id ? null : id
  limit.value = PAGE
}
const filtered = computed(() =>
  filter.value === 'mine' ? kills.value.filter((k) => k.mine || k.died) : filter.value === 'legion' ? kills.value.filter((k) => k.legion) : kills.value,
)
// The newest rows only (a siege lists thousands); more on request.
const PAGE = 200
const limit = ref(PAGE)
const shown = computed(() => filtered.value.slice(0, limit.value))
const counts = computed(() => ({
  kills: store.pvp.filter((k) => k.mine).length,
  deaths: store.pvp.filter((k) => k.died).length,
}))

// "2 min ago": redrawn every 15 s.
const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 15_000)
onBeforeUnmount(() => clearInterval(ticker))
const time = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
function ago(ms: number): string {
  const s = Math.max(0, Math.round((now.value - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min ago` : time(ms)
}
const rowClass = (k: PvpKill): string =>
  k.mine ? 'bg-green/10 border-l-2 border-green' : k.died ? 'bg-danger/10 border-l-2 border-danger' : 'border-l-2 border-transparent'
const clear = (): void => void bridge().invoke('tracker:clearPvp')
/** The kill feed over the game (its own small window). */
const hudOpen = computed(() => store.settings.killFeed.open)
const toggleHud = (): void => void bridge().invoke(hudOpen.value ? 'killfeed:close' : 'killfeed:open')
</script>

<template>
  <div class="space-y-3 p-3">
    <div class="flex items-center gap-2 text-xs">
      <span class="rounded-md bg-card px-2 py-1"><span class="font-semibold text-green">{{ counts.kills }}</span> kills</span>
      <span class="rounded-md bg-card px-2 py-1"><span class="font-semibold text-danger">{{ counts.deaths }}</span> deaths</span>
      <Button size="sm" class="ml-auto" :disabled="!store.pvp.length" @click="clear">Clear</Button>
      <Button size="sm" :intent="hudOpen ? 'default' : 'primary'" :title="hudOpen ? 'Close the kill feed over the game' : 'A small kill feed over the game'" @click="toggleHud">
        {{ hudOpen ? 'Close HUD' : 'Open HUD' }}
      </Button>
    </div>

    <div class="flex items-center gap-1.5 text-xs">
      <button
        v-for="f in filters"
        :key="f.id"
        type="button"
        :title="f.title"
        :class="['rounded-full border px-2.5 py-0.5', filter === f.id ? 'border-accent bg-accent/15 text-default' : 'border-light text-darker hover:text-dark']"
        @click="pick(f.id)"
      >
        {{ f.label }}
      </button>
      <!-- How many kills the list below holds (with the filter). -->
      <span class="ml-auto rounded-full bg-card px-2 py-0.5 tabular-nums text-dark" :title="`${filtered.length} kill${filtered.length === 1 ? '' : 's'} in the list`">{{ filtered.length }}</span>
    </div>

    <ul v-if="filtered.length" class="divide-y divide-[color:var(--gray-4)] overflow-hidden rounded-lg border border-card bg-card">
      <li v-for="(k, i) in shown" :key="`${k.at}-${i}`" :class="['flex items-center gap-2 px-3 py-2 text-sm', rowClass(k)]">
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-1.5">
            <span class="truncate font-medium" :class="k.mine && 'text-green'">{{ k.killer.name }}</span>
            <span v-if="tag(k.killer.server)" class="shrink-0 text-[11px] text-yellow">[{{ tag(k.killer.server) }}]</span>
            <svg viewBox="0 0 16 16" class="size-3.5 shrink-0 text-darker" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path d="M3 8h9M9 4.5 12.5 8 9 11.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="truncate font-medium" :class="k.died && 'text-danger'">{{ k.victim?.name ?? 'a player out of view' }}</span>
            <span v-if="k.victim && tag(k.victim.server)" class="shrink-0 text-[11px] text-yellow">[{{ tag(k.victim.server) }}]</span>
          </div>
          <div v-if="k.killer.guild" class="truncate text-[11px] text-darker">{{ k.killer.guild }}</div>
        </div>
        <span class="shrink-0 text-[11px] tabular-nums text-darker" :title="time(k.at)">{{ ago(k.at) }}</span>
      </li>
    </ul>
    <button
      v-if="filtered.length > shown.length"
      type="button"
      class="w-full rounded-lg border border-card bg-card py-1.5 text-xs text-darker hover:text-dark"
      @click="limit += PAGE"
    >
      Show older ({{ filtered.length - shown.length }} more)
    </button>
    <p v-if="!filtered.length" class="rounded-lg border border-card bg-card px-3 py-6 text-center text-sm text-darker">
      {{ filters.find((f) => f.id === filter)?.empty ?? 'No player kills seen yet.' }}
    </p>

    <p class="text-[11px] text-darkest">
      Player kills around you, as the game credits them: the killing blow only, so an assist is not
      a kill here. Kept until you clear them, across restarts.
    </p>
  </div>
</template>
