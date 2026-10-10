<script setup lang="ts">
// Three intents, two sizes, a loading state that also disables. The shapes
// come from the Radix reference: a solid accent for the one primary action,
// a soft surface for the rest, and danger as a tinted outline that fills.
withDefaults(
  defineProps<{
    intent?: 'default' | 'primary' | 'danger'
    size?: 'sm' | 'md'
    loading?: boolean
    disabled?: boolean
  }>(),
  { intent: 'default', size: 'md', loading: false, disabled: false },
)

const INTENTS = {
  default: 'border-light bg-default text-default hover:border-lighter hover:bg-light',
  primary: 'border-accent bg-accent text-white hover:border-accent-hover hover:bg-accent-hover',
  danger: 'border-danger/50 bg-danger/10 text-danger hover:border-danger hover:bg-danger/20',
} as const

const SIZES = { sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3.5 text-sm' } as const
</script>

<template>
  <button
    type="button"
    :disabled="disabled || loading"
    :class="[
      'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border font-medium transition',
      INTENTS[intent],
      SIZES[size],
      (disabled || loading) && '!cursor-not-allowed !opacity-50',
    ]"
  >
    <span v-if="loading" class="size-3 animate-spin rounded-full border border-current border-t-transparent" />
    <slot />
  </button>
</template>
