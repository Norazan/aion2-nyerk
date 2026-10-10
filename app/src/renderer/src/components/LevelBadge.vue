<script setup lang="ts">
import type { Pet } from '@shared/tracker.ts'

defineProps<{ pet: Pet }>()
const TONES = ['border-light text-darkest', 'border-green/50 text-green', 'border-blue/50 text-blue', 'border-yellow/60 text-yellow']
</script>

<template>
  <span
    :class="['inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[11px] font-semibold tabular-nums', TONES[Math.min(pet.level, 3)]]"
    :title="pet.levelEstimated ? 'Estimated from the souls: not synced from the server yet' : 'Insight level, from the server'"
  >
    Lv{{ pet.level }}<span v-if="pet.levelEstimated" class="opacity-60">?</span>
  </span>
</template>
