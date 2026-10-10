<script setup lang="ts">
// A pet's portrait from the database snapshot, in a rounded tile tinted by its genus. A pet the
// snapshot does not know (newer than it) gets a neutral tile with a question mark.
import { computed, ref } from 'vue'
import { petIcon, petInfo } from '@/lib/petDb.ts'
import { GENUS_TILE } from './GenusPill.vue'

const props = withDefaults(defineProps<{ id: number; size?: number }>(), { size: 32 })
const src = computed(() => petIcon(props.id))
const genus = computed(() => petInfo(props.id)?.genus)
const broken = ref(false)
</script>

<template>
  <div
    :class="['relative shrink-0 overflow-hidden rounded-md border', genus ? GENUS_TILE[genus] : 'border-light bg-default']"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <img
      v-if="src && !broken"
      :src="src"
      alt=""
      draggable="false"
      loading="lazy"
      class="size-full object-cover"
      @error="broken = true"
    />
    <span v-else class="flex size-full items-center justify-center text-xs text-darkest">?</span>
  </div>
</template>
