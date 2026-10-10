<script setup lang="ts">
// Since the tracker started: souls per pet, and what the tracker sees of the game.
import { computed } from 'vue'
import GenusPill from '@/components/GenusPill.vue'
import LevelBadge from '@/components/LevelBadge.vue'
import PetIcon from '@/components/PetIcon.vue'
import StatusDot, { statusText } from '@/components/StatusDot.vue'
import { displayName } from '@/lib/petDb.ts'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const gained = computed(() => store.pets.filter((p) => p.session > 0).sort((a, b) => b.session - a.session))
const lastPacket = computed(() => {
  const ago = store.status?.lastPacketAgo
  return ago === null || ago === undefined ? 'never' : ago < 5 ? 'just now' : `${Math.round(ago)} s ago`
})
</script>

<template>
  <div class="space-y-3 p-3">
    <div class="rounded-lg bg-card p-3 text-center">
      <div class="text-3xl font-semibold tabular-nums text-accent">{{ store.sessionSouls }}</div>
      <div class="text-xs text-darker">souls this session, across {{ gained.length }} pet{{ gained.length === 1 ? '' : 's' }}</div>
    </div>

    <ul v-if="gained.length" class="divide-y divide-[color:var(--gray-4)] rounded-lg border border-card bg-card">
      <li
        v-for="pet in gained"
        :key="pet.id"
        class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition hover:bg-dark"
        title="Show where its souls drop"
        @click="store.openPet(pet.id)"
      >
        <PetIcon :id="pet.id" :size="28" />
        <span class="flex min-w-0 flex-1 items-center gap-1.5">
          <span class="truncate">{{ displayName(pet) }}</span>
          <GenusPill :id="pet.id" />
        </span>
        <span class="tabular-nums text-green">+{{ pet.session }}</span>
        <span class="w-10 text-right font-semibold tabular-nums">{{ pet.souls }}</span>
        <LevelBadge :pet="pet" />
      </li>
    </ul>
    <p v-else class="py-4 text-center text-sm text-darker">No souls yet this session.</p>

    <div class="space-y-1.5 rounded-lg border border-card p-3 text-xs">
      <div class="flex items-center gap-2 font-medium">
        <StatusDot :status="store.status" /> {{ statusText(store.status) }}
      </div>
      <div v-if="store.status?.detail" class="break-words text-darker">{{ store.status.detail }}</div>
      <div class="text-darker">Last game packet: {{ lastPacket }}</div>
      <div v-if="store.status?.replay" class="text-yellow">Replaying a saved capture (A2T_REPLAY): counts are not saved.</div>
    </div>
  </div>
</template>
