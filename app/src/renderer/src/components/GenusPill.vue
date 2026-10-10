<script setup lang="ts">
// The pet's genus as a small coloured pill: Cogni, Fera, Natura, Varian or Special.
import { computed } from 'vue'
import { GENUS_LABEL, petInfo } from '@/lib/petDb.ts'

const props = defineProps<{ id: number }>()
const genus = computed(() => petInfo(props.id)?.genus)
</script>

<script lang="ts">
import type { Genus } from '@/lib/petDb.ts'

/** One colour per genus, used by the pill and the portrait tile. */
export const GENUS_PILL: Record<Genus, string> = {
  cogni: 'border-blue/40 bg-blue/10 text-blue',
  fera: 'border-orange/40 bg-orange/10 text-orange',
  natura: 'border-green/40 bg-green/10 text-green',
  varian: 'border-[#ab4aba]/50 bg-[#ab4aba]/10 text-[#e796f3]',
  special: 'border-yellow/50 bg-yellow/10 text-yellow',
}

export const GENUS_TILE: Record<Genus, string> = {
  cogni: 'border-blue/40 bg-blue/10',
  fera: 'border-orange/40 bg-orange/10',
  natura: 'border-green/40 bg-green/10',
  varian: 'border-[#ab4aba]/50 bg-[#ab4aba]/10',
  special: 'border-yellow/50 bg-yellow/10',
}
</script>

<template>
  <span
    v-if="genus"
    :class="['inline-flex h-4 shrink-0 items-center rounded-full border px-1.5 text-[10px] font-semibold uppercase tracking-wide', GENUS_PILL[genus]]"
  >
    {{ GENUS_LABEL[genus] }}
  </span>
</template>
