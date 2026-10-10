<script setup lang="ts">
// The floating icon. Drag it anywhere (it stays where it is dropped); click it to open or close
// the panel. The ring says what the tracker is doing; the badge counts this session's souls and
// the icon pulses when one drops.
import { computed, ref, watch } from 'vue'
import { statusText, statusTone } from '@/components/StatusDot.vue'
import { bridge } from '@/lib/bridge.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const tone = computed(() => statusTone(store.status))
const RING = { green: 'ring-green', amber: 'ring-yellow', red: 'ring-red', gray: 'ring-darkest' } as const

const pulse = ref(0)
watch(
  () => store.toasts.length,
  (n, was) => {
    if (n > was) pulse.value++
  },
)

const drag = windowDrag({
  move: 'bubble:moveTo',
  end: 'bubble:dragEnd',
  onClick: () => void bridge().invoke('panel:toggle'),
})

const title = computed(() => `${statusText(store.status)} · ${store.sessionSouls} souls this session`)
</script>

<template>
  <div class="flex h-full w-full items-center justify-center">
    <button
      type="button"
      :title="title"
      :class="[
        'relative size-12 cursor-grab touch-none rounded-full ring-2 ring-offset-2 ring-offset-transparent transition active:cursor-grabbing',
        RING[tone],
        store.panelVisible ? 'scale-95' : 'hover:scale-105',
      ]"
      @pointerdown="drag.onPointerDown"
      @pointerup="drag.onPointerUp"
    >
      <img :key="pulse" src="/icon.png" alt="" draggable="false" :class="['size-12 rounded-full', pulse && 'animate-soul']" />
      <span
        v-if="store.sessionSouls > 0"
        class="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold tabular-nums text-white shadow"
      >
        {{ store.sessionSouls > 99 ? '99+' : store.sessionSouls }}
      </span>
    </button>
  </div>
</template>

<style scoped>
@keyframes soul {
  0% {
    transform: scale(1);
    filter: brightness(1);
  }
  35% {
    transform: scale(1.18);
    filter: brightness(1.6);
  }
  100% {
    transform: scale(1);
    filter: brightness(1);
  }
}
.animate-soul {
  animation: soul 700ms ease-out;
}
</style>
