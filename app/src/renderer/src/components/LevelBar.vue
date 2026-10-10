<script setup lang="ts">
// Souls towards the 105 the guides give for the cap, with the level beside it. The bar is a guide
// only: the level shown is the server's (`00 90`).
import { computed } from 'vue'
import { capProgress, MAX_LEVEL, type Pet } from '@shared/tracker.ts'

const props = defineProps<{ pet: Pet; thin?: boolean }>()
const pct = computed(() => Math.round(capProgress(props.pet) * 100))
const maxed = computed(() => props.pet.level >= MAX_LEVEL)
</script>

<template>
  <div :class="['w-full overflow-hidden rounded-full bg-black/40', thin ? 'h-1' : 'h-1.5']">
    <div
      :class="['h-full rounded-full transition-[width] duration-500', maxed ? 'bg-yellow' : 'bg-accent']"
      :style="{ width: `${pct}%` }"
    />
  </div>
</template>
