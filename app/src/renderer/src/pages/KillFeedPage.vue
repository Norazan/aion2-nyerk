<script setup lang="ts">
// The kill feed over the game: a small window opened from the PvP Log tab. Its title bar holds
// this session's kills and deaths (all it shows between kills), moves the window and closes it;
// each player kill around you slides in under it and falls off after a few seconds, as the HUD's
// soul lines do.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { bridge } from '@/lib/bridge.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import { serverTag } from '@shared/servers.ts'
import type { PvpKill } from '@shared/tracker.ts'

const SHOW_MS = 8000
const MAX_LINES = 5

const store = useApp()
const root = ref<HTMLElement | null>(null)
const counts = computed(() => ({
  kills: store.pvp.filter((k) => k.mine).length,
  deaths: store.pvp.filter((k) => k.died).length,
}))
const tag = (server: number | null): string | null =>
  server === null || server === (store.status?.server ?? null) ? null : serverTag(server)

/** The kills on show: each added as it comes, and dropped SHOW_MS later. */
const lines = ref<PvpKill[]>([])
let known = -1
watch(
  () => store.pvp,
  (all) => {
    // Until the store is ready the list is the past (the window just opened), counted below once
    // ready: only what comes after is shown. A shorter list is a Clear.
    if (!store.ready || known < 0 || all.length < known) {
      if (store.ready) known = all.length
      return
    }
    for (const k of all.slice(known)) {
      // Raw objects on both sides: the store's list and this one hold reactive proxies, and a proxy
      // never equals its object (the HUD's toasts found this out).
      const raw = toRaw(k)
      lines.value = [...lines.value, raw].slice(-MAX_LINES)
      setTimeout(() => (lines.value = lines.value.filter((x) => toRaw(x) !== raw)), SHOW_MS)
    }
    known = all.length
  },
  { immediate: true },
)
watch(() => store.ready, (ready) => ready && known < 0 && (known = store.pvp.length))

const drag = windowDrag({ move: 'killfeed:moveTo', end: 'killfeed:dragEnd' })
const close = (): void => void bridge().invoke('killfeed:close')

/** Tell main how big the window is: it is sized to its content. */
let sent = ''
function report(): void {
  const r = root.value?.getBoundingClientRect()
  if (!r) return
  const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`
  if (key === sent) return
  sent = key
  void bridge().invoke('killfeed:resize', { width: r.width, height: r.height })
}
watch([lines, counts], () => void nextTick(report), { deep: true })
let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(report)
  if (root.value) observer.observe(root.value)
  report()
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <div class="m-1.5 w-[300px] rounded-lg border border-card bg-darker/90 shadow-card">
        <header class="flex cursor-move items-center gap-2 px-2.5 py-1.5" title="Drag to move" @pointerdown="drag.onPointerDown">
          <svg viewBox="0 0 16 16" class="size-3.5 text-danger" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M3 13 13 3M9.5 3H13v3.5M3 3l4 4M13 13l-3-3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="text-[11px] font-semibold uppercase tracking-wide text-darker">PvP</span>
          <span class="text-xs tabular-nums"><span class="font-semibold text-green">{{ counts.kills }}</span> kills</span>
          <span class="text-xs tabular-nums"><span class="font-semibold text-danger">{{ counts.deaths }}</span> deaths</span>
          <button
            type="button"
            class="ml-auto flex size-5 items-center justify-center rounded text-darker hover:bg-dark hover:text-default"
            title="Close (the PvP Log tab opens it again)"
            @pointerdown.stop
            @click="close"
          >
            <svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
            </svg>
          </button>
        </header>
        <TransitionGroup v-if="lines.length" tag="div" name="toast" class="space-y-1 border-t border-card px-2.5 py-1.5">
          <div v-for="k in lines" :key="`${k.at}-${k.killer.name}`" class="flex min-w-0 items-center gap-1 text-xs">
            <span :class="['truncate font-semibold', k.mine ? 'text-green' : 'text-dark']">{{ k.killer.name }}</span>
            <span v-if="tag(k.killer.server)" class="shrink-0 text-[10px] text-yellow">[{{ tag(k.killer.server) }}]</span>
            <span class="shrink-0 text-darker">→</span>
            <span :class="['truncate font-semibold', k.died ? 'text-danger' : 'text-dark']">{{ k.victim?.name ?? 'a player' }}</span>
            <span v-if="k.victim && tag(k.victim.server)" class="shrink-0 text-[10px] text-yellow">[{{ tag(k.victim.server) }}]</span>
          </div>
        </TransitionGroup>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 300ms ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(12px);
}
.toast-leave-to {
  opacity: 0;
}
</style>
