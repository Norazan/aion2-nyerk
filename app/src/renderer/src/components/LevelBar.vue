<script setup lang="ts">
// Souls towards the next level, the same count the text beside it shows (12/25 fills half), as the
// Pets menu's bar does. Full once capped. The level shown is the server's (`00 90`).
import { computed } from 'vue'
import { levelProgress, MAX_LEVEL, type Pet } from '@shared/tracker.ts'

const props = defineProps<{ pet: Pet; thin?: boolean }>()
const pct = computed(() => Math.round(levelProgress(props.pet) * 100))
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
