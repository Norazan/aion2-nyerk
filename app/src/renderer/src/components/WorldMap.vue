<script setup lang="ts">
// A zone map with spawn points: the zone image and an SVG layer of dots in one 1000x1000 "map
// space", moved and scaled as one. Wheel zooms around the pointer, dragging pans, and the view
// fits whatever `focus` is (the selected monster's spawns) whenever it changes.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { mapImage, project, type World } from '@/lib/spawns.ts'

export interface MapLayer {
  key: string | number
  points: [number, number][]
  color: string
  active: boolean
}

const props = defineProps<{ world: World; layers: MapLayer[]; focus: [number, number][]; you?: [number, number] | null }>()

const SIZE = 1000
const box = ref<HTMLElement | null>(null)
const view = ref({ k: 1, x: 0, y: 0 })
const loaded = ref(false)

const youXY = computed(() => (props.you ? project(props.world, props.you).map((v) => v * SIZE) : null))
const projected = computed(() =>
  props.layers.map((l) => ({ ...l, xy: l.points.map((p) => project(props.world, p).map((v) => v * SIZE) as [number, number]) })),
)

function boxSize(): { w: number; h: number } {
  const r = box.value?.getBoundingClientRect()
  return { w: r?.width || 400, h: r?.height || 300 }
}

/** Fit the focus points (or the whole zone) into the box, with a margin. */
function fit(): void {
  const { w, h } = boxSize()
  const pts = props.focus.map((p) => project(props.world, p).map((v) => v * SIZE))
  let [x0, y0, x1, y1] = [0, 0, SIZE, SIZE]
  if (pts.length) {
    x0 = Math.min(...pts.map((p) => p[0]!))
    x1 = Math.max(...pts.map((p) => p[0]!))
    y0 = Math.min(...pts.map((p) => p[1]!))
    y1 = Math.max(...pts.map((p) => p[1]!))
    // Never closer than a ninth of the zone, so a single spawn keeps some context around it.
    const minSpan = SIZE / 9
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const span = Math.max(x1 - x0, y1 - y0, minSpan) * 1.35
    ;[x0, x1, y0, y1] = [cx - span / 2, cx + span / 2, cy - span / 2, cy + span / 2]
  }
  const k = Math.min(w / (x1 - x0), h / (y1 - y0))
  view.value = { k, x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k }
}

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const r = box.value!.getBoundingClientRect()
  const px = e.clientX - r.left
  const py = e.clientY - r.top
  const { k, x, y } = view.value
  const { w, h } = boxSize()
  const minK = Math.min(w, h) / SIZE / 1.5
  const next = Math.min(40, Math.max(minK, k * Math.exp(-e.deltaY * 0.0015)))
  // Keep the map point under the pointer where it is.
  view.value = { k: next, x: px - ((px - x) / k) * next, y: py - ((py - y) / k) * next }
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  const start = { ...view.value, px: e.clientX, py: e.clientY }
  const move = (ev: PointerEvent): void => {
    view.value = { k: start.k, x: start.x + ev.clientX - start.px, y: start.y + ev.clientY - start.py }
  }
  const up = (ev: PointerEvent): void => {
    el.releasePointerCapture(ev.pointerId)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
}

watch(() => [props.world.key, props.focus], fit, { deep: false })
let observer: ResizeObserver | null = null
onMounted(() => {
  fit()
  // The panel grows when a map opens: fit again once the box has its new size.
  observer = new ResizeObserver(() => fit())
  if (box.value) observer.observe(box.value)
})
onBeforeUnmount(() => observer?.disconnect())

defineExpose({ fit })
</script>

<template>
  <div
    ref="box"
    class="relative h-full w-full cursor-grab touch-none overflow-hidden rounded-lg bg-[#c9bfa6] active:cursor-grabbing"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @dblclick="fit"
  >
    <div
      class="absolute left-0 top-0 origin-top-left"
      :style="{ width: `${SIZE}px`, height: `${SIZE}px`, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }"
    >
      <img
        :src="mapImage(world)"
        alt=""
        draggable="false"
        class="absolute inset-0 size-full select-none"
        @load="loaded = true"
      />
      <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" class="absolute inset-0 size-full overflow-visible">
        <!-- Inactive layers first, so the selected monster's dots draw on top. -->
        <template v-for="layer in [...projected].sort((a, b) => Number(a.active) - Number(b.active))" :key="layer.key">
          <circle
            v-for="(p, i) in layer.xy"
            :key="i"
            :cx="p[0]"
            :cy="p[1]"
            :r="(layer.active ? 5.5 : 3.5) / view.k"
            :fill="layer.color"
            :fill-opacity="layer.active ? 0.95 : 0.55"
            stroke="#0e101d"
            :stroke-width="(layer.active ? 1.5 : 1) / view.k"
          />
        </template>
        <!-- You: a ring with a dot, drawn last so nothing covers it. -->
        <g v-if="youXY">
          <circle :cx="youXY[0]" :cy="youXY[1]" :r="11 / view.k" fill="none" stroke="#ffffff" :stroke-width="3 / view.k" />
          <circle :cx="youXY[0]" :cy="youXY[1]" :r="11 / view.k" fill="none" stroke="#4f3cdd" :stroke-width="1.5 / view.k" />
          <circle :cx="youXY[0]" :cy="youXY[1]" :r="4 / view.k" fill="#ffffff" stroke="#4f3cdd" :stroke-width="1.5 / view.k" />
        </g>
      </svg>
    </div>
    <div v-if="!loaded" class="absolute inset-0 flex items-center justify-center text-xs text-black/60">Loading map…</div>
    <div class="pointer-events-none absolute bottom-1.5 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white/80">
      scroll to zoom · drag to pan · double-click to fit
    </div>
  </div>
</template>
