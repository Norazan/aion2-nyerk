<script setup lang="ts">
// A switch. The Radix shape: a track in the accent when on, a border step
// when off, and a white knob either way. Keyboard-operable.
defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :class="[
      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition',
      modelValue ? 'border-accent bg-accent' : 'border-lighter bg-lighter',
    ]"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      :class="[
        'inline-block size-3.5 rounded-full bg-white shadow-sm transition',
        modelValue ? 'translate-x-[18px]' : 'translate-x-[2px]',
      ]"
    />
  </button>
</template>
