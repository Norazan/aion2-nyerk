<script setup lang="ts">
// The tracker's state as a colour: green tracking, amber waiting, red broken, grey in between.
import { computed } from 'vue'
import type { TrackerStatus } from '@shared/tracker.ts'

const props = defineProps<{ status: TrackerStatus | null }>()

const tone = computed(() => statusTone(props.status))
</script>

<script lang="ts">
export function statusTone(s: TrackerStatus | null): 'green' | 'amber' | 'red' | 'gray' {
  if (!s) return 'gray'
  if (s.state === 'error') return 'red'
  if (s.state === 'locked' && s.gameActive) return 'green'
  if (s.state === 'locked' || s.state === 'listening' || s.state === 'stopped') return 'amber'
  return 'gray'
}

export function statusText(s: TrackerStatus | null): string {
  if (!s) return 'Connecting…'
  switch (s.state) {
    case 'starting':
      return 'Starting the tracker…'
    case 'listening':
      return 'Waiting for the game'
    case 'locked':
      return s.gameActive ? (s.replay ? 'Replaying a capture' : 'Tracking') : 'Game connection idle'
    case 'idle':
      return 'Asleep until Aion 2 starts'
    case 'stopped':
      return 'Replay finished'
    case 'exited':
      return 'Tracker restarting'
    case 'error':
      return 'Tracker error'
  }
}
</script>

<template>
  <span
    :class="[
      'inline-block size-2 shrink-0 rounded-full',
      { green: 'bg-green shadow-[0_0_6px] shadow-green', amber: 'bg-yellow', red: 'bg-red', gray: 'bg-darkest' }[tone],
    ]"
  />
</template>
