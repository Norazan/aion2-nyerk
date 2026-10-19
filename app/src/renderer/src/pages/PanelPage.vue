<script setup lang="ts">
// The panel the bubble opens: the collection, this session, the timers, addons' tabs, and settings.
// Escape or × hides it.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AddonFrame from '@/components/AddonFrame.vue'
import CollectionTab from '@/components/panel/CollectionTab.vue'
import PetDetail from '@/components/panel/PetDetail.vue'
import SessionTab from '@/components/panel/SessionTab.vue'
import PvpLogTab from '@/components/panel/PvpLogTab.vue'
import SettingsTab from '@/components/panel/SettingsTab.vue'
import TimersTab from '@/components/panel/TimersTab.vue'
import StatusDot, { statusText } from '@/components/StatusDot.vue'
import { bridge } from '@/lib/bridge.ts'
import { useApp } from '@/stores/app.ts'
import { builtinOn, type BuiltinAddon } from '@shared/addons.ts'
import { DISPLAY_NAME } from '@shared/app.ts'

const store = useApp()
// The Timers and the PvP Log are built-in addons: their tabs show while they are switched on.
const APP_TABS: { id: string; label: string; addon?: BuiltinAddon }[] = [
  { id: 'collection', label: 'Collection' },
  { id: 'session', label: 'Session' },
  { id: 'timers', label: 'Timers', addon: 'timers' },
  { id: 'pvp', label: 'PvP Log', addon: 'pvp-log' },
]
const appTabs = computed(() => APP_TABS.filter((t) => !t.addon || builtinOn(store.settings.addons.enabled, t.addon)))
// Addons' tabs (`addon:<id>`) go after the app's own, before Settings.
const addonTabs = computed(() =>
  (store.addons?.addons ?? [])
    .filter((a) => a.state === 'on' && a.tab && a.id)
    .map((a) => ({ id: `addon:${a.id}`, label: a.tab!.label, addon: a.id!, page: a.tab!.page })),
)
const TABS = computed(() => [...appTabs.value, ...addonTabs.value, { id: 'settings', label: 'Settings' }])
const tab = ref<string>('collection')
const addonTab = computed(() => addonTabs.value.find((t) => t.id === tab.value) ?? null)
// An addon tab asked for (after an update restart) before the addons are known: shown once they are.
let wanted: string | null = null
watch(addonTabs, () => {
  if (wanted && addonTabs.value.some((t) => t.id === wanted)) {
    tab.value = wanted
    wanted = null
  } else if (tab.value.startsWith('addon:') && !addonTab.value) tab.value = 'collection'
})
// A built-in addon switched off while its tab is open (in Settings, so rarely): back to the collection.
watch(appTabs, () => {
  if (APP_TABS.some((t) => t.id === tab.value) && !appTabs.value.some((t) => t.id === tab.value)) tab.value = 'collection'
})
// Main keeps the tab, so an update restart reopens the panel where it was.
watch(tab, (t) => void bridge().invoke('panel:tab', t), { immediate: true })

// The update banner's countdown to the restart.
const clock = ref(Date.now())
const ticker = setInterval(() => (clock.value = Date.now()), 250)
onBeforeUnmount(() => clearInterval(ticker))
const restartIn = computed(() => {
  const at = store.update.restartAt
  return store.update.state === 'restarting' && at ? Math.max(0, Math.ceil((at - clock.value) / 1000)) : 0
})

const hide = (): void => void bridge().invoke('panel:hide')
const onKey = (e: KeyboardEvent): void => {
  if (e.key !== 'Escape' || e.target instanceof HTMLInputElement) return
  // Escape backs out of a pet's map first, then hides the panel.
  if (store.openPetId !== null) store.openPet(null)
  else hide()
}
// A pet clicked in the merchant window: its drop locations, as a click in the collection opens.
let offShowPet: (() => void) | null = null
// The bubble clicked during an alert: the Timers tab, on the timers that alerted.
let offShowTimers: (() => void) | null = null
// Back from an update restart: the tab it was on.
let offShowTab: (() => void) | null = null
onMounted(() => {
  window.addEventListener('keydown', onKey)
  offShowPet = bridge().on('panel:showPet', (pet) => store.openPet(pet))
  offShowTimers = bridge().on('panel:showTimers', (ids) => {
    if (!builtinOn(store.settings.addons.enabled, 'timers')) return
    store.openPet(null)
    tab.value = 'timers'
    store.timerFocus = { ids, at: Date.now() }
  })
  offShowTab = bridge().on('panel:showTab', (id) => {
    const found = TABS.value.find((t) => t.id === id)
    if (found) tab.value = found.id
    else if (id.startsWith('addon:')) wanted = id
  })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  offShowPet?.()
  offShowTimers?.()
  offShowTab?.()
})
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden rounded-xl border border-card bg-app shadow-card">
    <header class="flex items-center gap-2.5 border-b border-card px-3 py-2.5">
      <img src="/icon.png" alt="" class="size-7" draggable="false" />
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold leading-tight">{{ DISPLAY_NAME }}</div>
        <div class="flex items-center gap-1.5 text-xs text-darker">
          <StatusDot :status="store.status" />
          <span class="truncate">{{ statusText(store.status) }}</span>
          <span v-if="store.status?.character" class="truncate text-dark" title="The character whose pets these are">· {{ store.status.character }}</span>
          <span v-if="store.sessionSouls" class="text-green">· +{{ store.sessionSouls }} souls</span>
        </div>
      </div>
      <button
        type="button"
        title="Hide (Esc)"
        class="flex size-7 items-center justify-center rounded-md text-darker transition hover:bg-light hover:text-default"
        @click="hide"
      >
        <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </header>

    <div
      v-if="['available', 'downloading', 'ready', 'restarting'].includes(store.update.state)"
      class="flex items-center gap-2 border-b border-card bg-accent-soft/60 px-3 py-2 text-xs"
    >
      <span class="min-w-0 flex-1 text-dark">
        <template v-if="store.update.state === 'available'">Version {{ store.update.version }} is available.</template>
        <template v-else-if="store.update.state === 'downloading'">Update {{ store.update.version }} found. Downloading… {{ store.update.percent ?? 0 }}%</template>
        <template v-else-if="store.update.state === 'restarting'">
          Update {{ store.update.version }} found. Restarting to install it{{ restartIn ? ` in ${restartIn} s` : '' }}…
        </template>
        <template v-else>Version {{ store.update.version }} is ready.</template>
      </span>
      <button
        v-if="store.update.state === 'available'"
        type="button"
        class="rounded bg-accent px-2 py-0.5 font-semibold text-white hover:bg-accent-hover"
        @click="bridge().invoke('update:download')"
      >
        Download
      </button>
      <button
        v-if="store.update.state === 'ready'"
        type="button"
        class="rounded bg-accent px-2 py-0.5 font-semibold text-white hover:bg-accent-hover"
        @click="bridge().invoke('update:install')"
      >
        Restart to install
      </button>
    </div>

    <nav v-if="store.openPetId === null" :class="['flex border-b border-card pt-1.5', TABS.length > 5 ? 'gap-0.5 px-1.5' : 'gap-1 px-2']">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        :class="[
          '-mb-px whitespace-nowrap border-b-2 pb-2 pt-1 font-medium transition',
          // Room for addons' tabs: a little tighter once there are more than the app's five.
          TABS.length > 5 ? 'px-2 text-[13px]' : 'px-2.5 text-sm',
          tab === t.id ? 'border-accent text-default' : 'border-transparent text-darker hover:text-default',
          // Settings sits apart, at the right end.
          t.id === 'settings' && 'ml-auto',
        ]"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <!-- An addon's page scrolls itself, inside its frame. -->
    <main :class="['min-h-0 flex-1', addonTab && store.openPetId === null ? 'overflow-hidden' : 'overflow-y-auto']">
      <div v-if="!store.ready" class="p-6 text-center text-sm text-darker">Loading…</div>
      <PetDetail v-else-if="store.openPetId !== null" :id="store.openPetId" />
      <CollectionTab v-else-if="tab === 'collection'" />
      <SessionTab v-else-if="tab === 'session'" />
      <TimersTab v-else-if="tab === 'timers'" />
      <PvpLogTab v-else-if="tab === 'pvp'" />
      <AddonFrame v-else-if="addonTab" :key="`${addonTab.addon}@${store.addons?.generation}`" :addon="addonTab.addon" :page="addonTab.page" />
      <SettingsTab v-else />
    </main>
  </div>
</template>
