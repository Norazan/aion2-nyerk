<script setup lang="ts">
// Where a pet's souls drop: every monster that drops its soul, with its level, zone and spawns,
// and a map of them. Monster names link to questlog.gg's page for that monster.
import { computed, onMounted, ref, watch } from 'vue'
import GenusPill from '@/components/GenusPill.vue'
import LevelBadge from '@/components/LevelBadge.vue'
import PetIcon from '@/components/PetIcon.vue'
import WorldMap, { type MapLayer } from '@/components/WorldMap.vue'
import { displayName, monsterName } from '@/lib/petDb.ts'
import { currentWorld, levelFit, LEVEL_GAP, loadSpawns, npcUrl, sortDroppers, type Dropper } from '@/lib/spawns.ts'
import { useApp } from '@/stores/app.ts'
import { blankPet } from '@shared/tracker.ts'

const props = defineProps<{ id: number }>()
const store = useApp()

type Data = Awaited<ReturnType<typeof loadSpawns>>
const data = ref<Data | null>(null)
const error = ref<string | null>(null)
onMounted(async () => {
  try {
    data.value = await loadSpawns()
  } catch (e) {
    error.value = String(e)
  }
})

const pet = computed(() => store.pets.find((p) => p.id === props.id) ?? blankPet(props.id))
const droppers = computed<Dropper[]>(() =>
  data.value ? sortDroppers(data.value.pets[props.id] ?? [], data.value, store.settings.faction, store.settings.playerLevel) : [],
)

/** One colour per monster: the selected one in the accent, the others in a muted set. */
const PALETTE = ['#f76b15', '#30a46c', '#0090ff', '#ffc53d', '#e54666', '#12a594', '#ab4aba', '#8e8c99']
const colorOf = (i: number): string => PALETTE[i % PALETTE.length]!

const selected = ref<number | null>(null)
watch(
  droppers,
  (list) => {
    if (!list.some((d) => d.npc === selected.value)) {
      // The monster the souls were actually farmed from, when we know it; else the best fit.
      const farmed = list.find((d) => d.name === pet.value.name && d.worlds.length)
      selected.value = (farmed ?? list.find((d) => d.worlds.length) ?? list[0])?.npc ?? null
    }
  },
  { immediate: true },
)
const current = computed(() => droppers.value.find((d) => d.npc === selected.value) ?? null)

const worldId = ref<number | null>(null)
watch(current, (d) => (worldId.value = d?.worlds[0]?.world ?? null), { immediate: true })
const worldName = (id: number): string => data.value?.worlds[id]?.name ?? `#${id}`
const world = computed(() => (data.value && worldId.value !== null ? data.value.worlds[worldId.value] ?? null : null))
/** The zones the selected monster spawns in, for the tabs above the map. */
const worldTabs = computed(() => current.value?.worlds.map((w) => ({ id: w.world, name: data.value?.worlds[w.world]?.name ?? `#${w.world}` })) ?? [])

const layers = computed<MapLayer[]>(() =>
  droppers.value.flatMap((d, i) => {
    const w = d.worlds.find((x) => x.world === worldId.value)
    return w ? [{ key: d.npc, points: w.points, color: d.npc === selected.value ? '#a3acff' : colorOf(i), active: d.npc === selected.value }] : []
  }),
)
/** You, on this map, when you are in this zone and the tracker knows where. */
const you = computed<[number, number] | null>(() => {
  if (!data.value || !store.nearby.position) return null
  return currentWorld(store.nearby, data.value) === worldId.value ? store.nearby.position : null
})
/** How many of each monster are loaded around you right now. */
const nearCount = computed(() => new Map(store.nearby.monsters.map((m) => [m.npc, m.count])))
const focus = computed(() => current.value?.worlds.find((w) => w.world === worldId.value)?.points ?? [])

const FIT_TEXT = { good: 'good drop rate', low: `over ${LEVEL_GAP} levels below you: rare drops`, high: 'above your level' }
const FIT_CLASS = { good: 'text-green', low: 'text-red', high: 'text-yellow' }

const level = ref(store.settings.playerLevel === null ? '' : String(store.settings.playerLevel))
function saveLevel(): void {
  const n = Number(level.value)
  void store.set('playerLevel', level.value.trim() && Number.isInteger(n) && n > 0 ? Math.min(99, n) : null)
}
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-3">
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="flex size-7 shrink-0 items-center justify-center rounded-md text-darker transition hover:bg-light hover:text-default"
        title="Back to the collection"
        @click="store.openPet(null)"
      >
        <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 3L5 8l5 5" />
        </svg>
      </button>
      <PetIcon :id="id" :size="48" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate text-base font-semibold">{{ displayName(pet) }}</span>
          <GenusPill :id="id" />
        </div>
        <div class="flex items-center gap-2 text-xs text-darker">
          <span class="tabular-nums">{{ pet.souls }} souls</span>
          <LevelBadge :pet="pet" />
          <span v-if="pet.session" class="text-green">+{{ pet.session }} this session</span>
          <span v-if="monsterName(pet)" class="truncate">· farmed from {{ monsterName(pet) }}</span>
        </div>
      </div>
      <label class="flex shrink-0 items-center gap-1.5 text-xs text-darker">
        Your level
        <input
          v-model="level"
          inputmode="numeric"
          class="h-7 w-11 rounded-md border border-light bg-default px-1.5 text-center text-sm tabular-nums text-default"
          placeholder="?"
          @change="saveLevel"
          @keydown.enter="saveLevel"
        />
      </label>
    </div>

    <p v-if="error" class="text-sm text-red">Could not load the drop locations: {{ error }}</p>
    <p v-else-if="!data" class="text-sm text-darker">Loading drop locations…</p>
    <p v-else-if="!droppers.length" class="text-sm text-darker">
      No monster drops this pet's soul: it comes from chests, events or the shop.
    </p>

    <div v-else class="flex min-h-0 flex-1 gap-3">
      <ul class="w-[300px] shrink-0 space-y-1 overflow-y-auto pr-1">
        <li
          v-for="(d, i) in droppers"
          :key="d.npc"
          :class="[
            'cursor-pointer rounded-lg border px-2.5 py-2 transition',
            d.npc === selected ? 'border-accent bg-accent-soft/50' : 'border-card bg-card hover:border-light',
          ]"
          @click="selected = d.npc"
        >
          <div class="flex items-center gap-2">
            <span class="size-2.5 shrink-0 rounded-full" :style="{ background: d.npc === selected ? '#a3acff' : colorOf(i) }" />
            <a
              :href="npcUrl(d.npc)"
              target="_blank"
              class="min-w-0 truncate text-sm font-medium hover:text-accent hover:underline"
              :title="`Open ${d.name} on questlog.gg`"
              @click.stop
            >
              {{ d.name }}
            </a>
            <svg viewBox="0 0 12 12" class="size-2.5 shrink-0 text-darkest" fill="none" stroke="currentColor" stroke-width="1.4">
              <path d="M5 2H2v8h8V7M7 2h3v3M10 2L5.5 6.5" />
            </svg>
            <span class="ml-auto shrink-0 text-xs font-semibold tabular-nums">Lv{{ d.level }}</span>
          </div>
          <div class="mt-0.5 flex items-center gap-1.5 pl-[18px] text-[11px] text-darker">
            <span v-if="d.worlds.length" class="truncate">
              {{ d.worlds.map((w) => [worldName(w.world), w.area].filter(Boolean).join(' · ')).join(', ') }}
            </span>
            <span v-else class="italic">not on the map</span>
            <span v-if="d.worlds.length" class="ml-auto shrink-0 tabular-nums text-darkest">
              {{ d.worlds.reduce((n, w) => n + w.points.length, 0) }} spawns
            </span>
          </div>
          <div class="flex gap-2 pl-[18px] text-[11px]">
            <span v-if="levelFit(d.level, store.settings.playerLevel)" :class="FIT_CLASS[levelFit(d.level, store.settings.playerLevel)!]">
              {{ FIT_TEXT[levelFit(d.level, store.settings.playerLevel)!] }}
            </span>
            <span v-if="nearCount.get(d.npc)" class="font-semibold text-green">{{ nearCount.get(d.npc) }} around you</span>
            <span v-if="d.name === pet.name" class="text-accent">you farmed here</span>
          </div>
        </li>
      </ul>

      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div v-if="worldTabs.length > 1" class="flex gap-1">
          <button
            v-for="t in worldTabs"
            :key="t.id"
            type="button"
            :class="[
              'rounded-md border px-2 py-0.5 text-xs transition',
              t.id === worldId ? 'border-accent bg-accent-soft text-accent' : 'border-light text-darker hover:text-default',
            ]"
            @click="worldId = t.id"
          >
            {{ t.name }}
          </button>
        </div>
        <div class="min-h-0 flex-1">
          <WorldMap v-if="world" :world="world" :layers="layers" :focus="focus" :you="you" />
          <div v-else class="flex h-full items-center justify-center rounded-lg border border-card text-sm text-darker">
            This monster has no spawn points on the map.
          </div>
        </div>
        <p class="text-[11px] text-darkest">
          Drop sources, spawns and maps:
          <a :href="data?.source" target="_blank" class="hover:text-default hover:underline">questlog.gg</a> ({{ data?.fetched }})
        </p>
      </div>
    </div>
  </div>
</template>
