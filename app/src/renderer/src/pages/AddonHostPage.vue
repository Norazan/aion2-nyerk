<script setup lang="ts">
// The hidden window's page (windows.ts setAddonHost): a frame for each background script switched
// on. A reload (a new generation) builds them all again.
import { computed } from 'vue'
import AddonFrame from '@/components/AddonFrame.vue'
import { useApp } from '@/stores/app.ts'
import { ADDON_BACKGROUND_PAGE } from '@shared/addons.ts'

const store = useApp()
const running = computed(() => (store.addons?.addons ?? []).filter((a) => a.state === 'on' && a.background && a.id))
</script>

<template>
  <div>
    <AddonFrame v-for="a in running" :key="`${a.id}@${store.addons?.generation}`" :addon="a.id!" :page="ADDON_BACKGROUND_PAGE" />
  </div>
</template>
