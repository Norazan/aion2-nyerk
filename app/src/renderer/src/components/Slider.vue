<script setup lang="ts">
// A range input in the accent colour, with its value shown beside it.
defineProps<{ modelValue: number; min: number; max: number; step: number; format?: (v: number) => string }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <div class="flex items-center gap-2">
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      class="w-28 accent-[color:var(--violet-9)]"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
    <span class="w-10 text-right text-xs tabular-nums text-darker">{{ format ? format(modelValue) : modelValue }}</span>
  </div>
</template>
