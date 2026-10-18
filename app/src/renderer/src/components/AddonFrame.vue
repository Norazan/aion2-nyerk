<script setup lang="ts">
// One addon page in a sandboxed frame: its own nyerk-addon:// origin, no Node and no bridge. Its
// calls and events go through lib/addonFrame.ts.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { connectAddonFrame } from '@/lib/addonFrame.ts'
import { ADDON_SCHEME } from '@shared/addons.ts'

const props = defineProps<{ addon: string; page: string }>()
const frame = ref<HTMLIFrameElement | null>(null)
let disconnect: (() => void) | null = null
onMounted(() => {
  if (frame.value) disconnect = connectAddonFrame(frame.value, props.addon)
})
onBeforeUnmount(() => disconnect?.())
</script>

<template>
  <iframe
    ref="frame"
    :src="`${ADDON_SCHEME}://${addon}/${page}`"
    :title="addon"
    sandbox="allow-scripts allow-same-origin"
    class="block h-full w-full border-0 bg-transparent"
  />
</template>
