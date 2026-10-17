<script setup lang="ts">
// The Black Cloud Merchant's pets worth buying, in a window of their own: main opens it when a tab
// of the shop is opened, it moves by its header, and the X closes it until the next time. It lists
// the tab on screen only (the one opened last). Each pet says what buying does and where its soul
// monsters spawn; the list goes by priority (merchant.ts), and pinned pets and unlocks stand out.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GenusPill from '@/components/GenusPill.vue'
import PetIcon from '@/components/PetIcon.vue'
import petItems from '@/data/petItems.json'
import { bridge } from '@/lib/bridge.ts'
import { HIGH_PRIORITY, PRIORITIES, merchantOffers, offerPriority, shownStock, sortOffers, type MerchantOffer } from '@/lib/merchant.ts'
import { displayName } from '@/lib/petDb.ts'
import { CONTINENTS, petContinents, useSpawns, type Continent } from '@/lib/spawns.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import { blankPet, nextLevelSouls, type Pet } from '@shared/tracker.ts'

const store = useApp()
const root = ref<HTMLElement | null>(null)
const spawns = useSpawns()

// Ticks so the restock countdown, and offers past it, keep up while the window stays open.
const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 30_000)

const shown = computed(() => shownStock(store.shop, now.value))
const pinned = computed(() => new Set(store.settings.hud.pinned))
const priority = (o: MerchantOffer): number =>
  offerPriority(o, { pinned: pinned.value.has(o.pet), spawns: spawns.value ? where(o.pet) : null, side: side.value })
const offers = computed(() =>
  sortOffers(
    merchantOffers(
      shown.value ? [shown.value] : [],
      (id) => store.pets.find((p) => p.id === id)?.level ?? null,
      now.value,
      petItems,
    ),
    priority,
  ),
)
const high = (o: MerchantOffer): boolean => priority(o) <= HIGH_PRIORITY
const info = ref(false)
const pet = (id: number): Pet => store.pets.find((p) => p.id === id) ?? blankPet(id)
const progress = (o: MerchantOffer): string => {
  const need = nextLevelSouls(pet(o.pet))
  return need === null ? '' : ` · ${pet(o.pet).souls}/${need}`
}
const kina = (n: number): string => n.toLocaleString('en-US')

/** Where each pet's soul monsters spawn, and whether that makes it hard to farm from your side. */
const continents = computed(() => (spawns.value ? petContinents(spawns.value) : new Map<number, Set<string>>()))
const SHORT: Record<Continent, string> = { elyos: 'Elyos', asmodians: 'Asmodian', abyss: 'Abyss' }
const where = (id: number): Continent[] => CONTINENTS.map((c) => c.id).filter((c) => continents.value.get(id)?.has(c))
const side = computed(() => store.settings.faction)
/** Why a pet is hard to get, or null: no known spawn, or none on your side's continent. */
const hard = (id: number): string | null => {
  if (!spawns.value) return null
  const at = where(id)
  if (!at.length) return 'no known spawn'
  return at.includes(side.value) ? null : `not on ${SHORT[side.value]}`
}

const restockIn = computed(() => {
  const next = shown.value?.nextAt
  if (next == null) return null
  const min = Math.max(0, Math.ceil((next - now.value) / 60_000))
  // Stock that came just past its restock time (the game is a little late changing it).
  if (min === 0) return 'restocking now'
  return min < 60 ? `restocks in ${min} min` : `restocks in ${Math.floor(min / 60)} h ${min % 60} min`
})

const drag = windowDrag({ move: 'merchant:moveTo', end: 'merchant:dragEnd' })
const close = (): void => void bridge().invoke('merchant:close')
/** Where the pet's soul monsters spawn: the panel's map of it, as the collection shows it. */
const showPet = (id: number): void => void bridge().invoke('panel:showPet', id)

/** Tell main how big the window is; nothing worth buying measures 0, and main keeps it hidden. */
let sent = ''
function report(): void {
  const el = root.value
  const r = el && offers.value.length ? el.getBoundingClientRect() : { width: 0, height: 0 }
  const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`
  if (key === sent) return
  sent = key
  void bridge().invoke('merchant:resize', { width: r.width, height: r.height })
}
watch([offers, continents, info, () => store.ready], () => void nextTick(report), { deep: true })

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(report)
  if (root.value) observer.observe(root.value)
  report()
})
onBeforeUnmount(() => {
  clearInterval(ticker)
  observer?.disconnect()
})
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <div v-if="offers.length" class="m-1.5 w-[388px] rounded-lg border border-yellow/40 bg-darker/95 shadow-card">
        <header
          class="flex cursor-move items-center gap-2 border-b border-card px-3 py-2"
          title="Drag to move"
          @pointerdown="drag.onPointerDown"
        >
          <span class="size-1.5 rounded-full bg-yellow" />
          <span class="text-[11px] font-semibold uppercase tracking-wide text-yellow">Black Cloud Merchant</span>
          <span v-if="restockIn" class="ml-auto text-[11px] text-darker">{{ restockIn }}</span>
          <button
            type="button"
            :class="[
              'flex size-6 items-center justify-center rounded hover:bg-dark hover:text-default',
              info ? 'text-yellow' : 'text-darker',
              !restockIn && 'ml-auto',
            ]"
            :title="info ? 'Hide the explanation' : 'How this list works'"
            @pointerdown.stop
            @click="info = !info"
          >
            <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4">
              <circle cx="8" cy="8" r="6.3" />
              <path d="M8 7.2v3.9" stroke-linecap="round" />
              <circle cx="8" cy="4.9" r="0.5" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            class="flex size-6 items-center justify-center rounded text-darker hover:bg-dark hover:text-default"
            title="Close (it opens again with the shop)"
            @pointerdown.stop
            @click="close"
          >
            <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div v-if="info" class="space-y-1.5 border-b border-card px-3 py-2 text-[11px] text-darker">
          <p>
            The pets worth buying in the Black Cloud Merchant tab you opened last: the ones you do not
            have yet, or that still need souls. A pet item unlocks a pet you do not have, and adds one
            soul otherwise. Each tab's stock is kept until it restocks.
          </p>
          <p class="font-semibold text-default">Sorted by priority, highest first:</p>
          <ol class="list-decimal space-y-0.5 pl-4">
            <li v-for="(label, i) in PRIORITIES" :key="label" :class="i <= HIGH_PRIORITY && 'text-yellow'">
              {{ label }}
            </li>
          </ol>
          <p>
            Ties go to the biggest discount, then the lowest price. Highlighted: pinned pets and unlocks.
            Pin pets in the Collection; your continent ({{ SHORT[side] }}) is in Settings → You. Click
            a pet for where its soul monsters spawn.
          </p>
        </div>

        <!-- A fixed cap, not vh: the window is sized to this list, so vh would shrink with it. -->
        <ul class="max-h-[520px] space-y-1 overflow-y-auto px-2 py-2">
          <li
            v-for="o in offers"
            :key="o.pet"
            :class="[
              'flex cursor-pointer items-center gap-2 rounded-md border-l-2 px-1.5 py-1 transition hover:bg-dark',
              high(o) ? 'border-yellow bg-yellow/5' : 'border-transparent',
            ]"
            title="Show where its soul monsters spawn"
            @click="showPet(o.pet)"
          >
            <PetIcon :id="o.pet" :size="28" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 text-[13px]">
                <span class="truncate font-medium text-dark">{{ displayName(pet(o.pet)) }}</span>
                <GenusPill :id="o.pet" />
                <span v-if="pinned.has(o.pet)" class="shrink-0 text-[10px] font-semibold text-yellow">pinned</span>
                <span class="ml-auto shrink-0 tabular-nums">
                  {{ kina(o.price) }}<span v-if="o.discount" class="text-yellow"> −{{ o.discount }}%</span>
                </span>
              </div>
              <div class="mt-0.5 flex items-center gap-1.5 text-[11px]">
                <span v-if="o.gives === 'unlock'" class="rounded bg-green/20 px-1 font-bold text-green">unlocks</span>
                <span v-else class="text-darker">+1 soul{{ progress(o) }}</span>
                <span class="ml-auto flex shrink-0 items-center gap-1">
                  <span v-for="c in where(o.pet)" :key="c" class="rounded border border-light px-1 text-[10px] text-darker">
                    {{ SHORT[c] }}
                  </span>
                  <span v-if="hard(o.pet)" :class="['text-[10px] font-semibold', high(o) ? 'text-yellow' : 'text-darker']">{{ hard(o.pet) }}</span>
                </span>
              </div>
            </div>
          </li>
        </ul>

      </div>
    </div>
  </div>
</template>
