<script setup lang="ts">
// Settings → Addons: the addons folder, a reload, and each addon found there with its switch and
// the settings it declares. Switching one on asks first, listing what it may do.
import { computed, ref } from 'vue'
import Button from '@/components/Button.vue'
import SettingRow from '@/components/SettingRow.vue'
import Slider from '@/components/Slider.vue'
import Toggle from '@/components/Toggle.vue'
import { bridge } from '@/lib/bridge.ts'
import { useApp } from '@/stores/app.ts'
import { ADDON_PERMISSIONS, type AddonInfo } from '@shared/addons.ts'

const store = useApp()
const status = computed(() => store.addons)
const reloading = ref(false)
/** The addon whose switch-on is waiting for a yes. */
const confirming = ref<string | null>(null)

async function reload(): Promise<void> {
  reloading.value = true
  confirming.value = null
  try {
    store.addons = await bridge().invoke('addons:reload')
  } finally {
    reloading.value = false
  }
}

function toggle(addon: AddonInfo, on: boolean): void {
  if (!addon.id) return
  if (on) confirming.value = addon.id
  else void bridge().invoke('addons:setEnabled', addon.id, false)
}

function confirm(addon: AddonInfo): void {
  confirming.value = null
  if (addon.id) void bridge().invoke('addons:setEnabled', addon.id, true)
}

const setSetting = (addon: AddonInfo, key: string, value: unknown): void => {
  if (addon.id) void bridge().invoke('addons:setSetting', addon.id, key, value)
}

const found = (n: number): string => (n === 0 ? 'No addons found.' : n === 1 ? '1 addon found.' : `${n} addons found.`)
</script>

<template>
  <section>
    <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-darkest">Addons</h3>
    <div class="divide-y divide-[color:var(--gray-4)] rounded-lg border border-card bg-card px-3">
      <SettingRow label="Addons folder" hint="Each addon goes in a folder of its own in here.">
        <Button size="sm" @click="bridge().invoke('addons:openFolder')">Open folder</Button>
      </SettingRow>
      <SettingRow
        label="Reload addons"
        :hint="status?.changed ? 'The folder has changed since the last reload.' : status ? found(status.addons.length) : undefined"
      >
        <Button size="sm" :intent="status?.changed ? 'primary' : 'default'" :loading="reloading" @click="reload">Reload</Button>
      </SettingRow>

      <div v-for="addon in status?.addons ?? []" :key="addon.folder" class="py-2">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-baseline gap-1.5 text-sm">
              <span class="truncate">{{ addon.name }}</span>
              <span v-if="addon.version" class="text-xs tabular-nums text-darker">{{ addon.version }}</span>
              <span v-if="addon.isNew" class="rounded bg-accent-soft px-1 text-[10px] font-semibold uppercase text-accent-text">New</span>
            </div>
            <div v-if="addon.author" class="text-xs text-darker">by {{ addon.author }}</div>
            <div v-if="addon.description" class="text-xs leading-snug text-darker">{{ addon.description }}</div>
            <div v-if="addon.problem" class="text-xs leading-snug text-danger">
              {{ addon.state === 'incompatible' ? 'Not for this version' : 'Cannot load' }}: {{ addon.problem }}.
            </div>
            <template v-else>
              <div v-if="addon.tab" class="text-xs text-darker">Adds a {{ addon.tab.label }} tab.</div>
              <div v-if="addon.native" class="text-xs leading-snug text-warning">Runs inside the tracker, with full access.</div>
              <div v-if="addon.state === 'on' && addon.error" class="break-words text-xs leading-snug text-danger">Error: {{ addon.error }}</div>
            </template>
          </div>
          <Toggle
            v-if="addon.state === 'on' || addon.state === 'off'"
            :model-value="addon.state === 'on' || confirming === addon.id"
            @update:model-value="toggle(addon, $event)"
          />
        </div>

        <div v-if="confirming === addon.id" class="mt-2 space-y-1.5 rounded-md border border-light bg-default p-2.5 text-xs">
          <div class="font-medium">Switch on {{ addon.name }}?</div>
          <ul v-if="addon.permissions.length || addon.network.length" class="list-disc space-y-0.5 pl-4 text-darker">
            <li v-for="p in addon.permissions" :key="p">{{ ADDON_PERMISSIONS[p] }}</li>
            <li v-for="n in addon.network" :key="n">Connect to {{ n }}</li>
          </ul>
          <div v-else class="text-darker">It asks for no permissions.</div>
          <div v-if="addon.native" class="leading-snug text-warning">
            Part of it runs inside the tracker, with the same access to your computer as Nyerk itself. Only switch on addons you trust.
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <Button size="sm" @click="confirming = null">Cancel</Button>
            <Button size="sm" :intent="addon.native ? 'danger' : 'primary'" @click="confirm(addon)">Switch on</Button>
          </div>
        </div>

        <!-- The settings it declares, while it is on. -->
        <div v-if="addon.state === 'on' && addon.settings.length" class="mt-1 border-l-2 border-card pl-3">
          <SettingRow v-for="def in addon.settings" :key="def.key" :label="def.label" :hint="def.hint ?? undefined">
            <Toggle v-if="def.type === 'toggle'" :model-value="addon.values[def.key] === true" @update:model-value="setSetting(addon, def.key, $event)" />
            <Slider
              v-else-if="def.type === 'slider'"
              :model-value="Number(addon.values[def.key])"
              :min="def.min"
              :max="def.max"
              :step="def.step"
              :format="(v: number) => v.toLocaleString('en-US')"
              @update:model-value="setSetting(addon, def.key, $event)"
            />
            <select
              v-else-if="def.type === 'select'"
              :value="addon.values[def.key]"
              class="h-7 rounded-md border border-light bg-default px-2 text-sm"
              @change="setSetting(addon, def.key, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="o in def.options" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <input
              v-else
              :value="addon.values[def.key]"
              class="h-7 w-36 rounded-md border border-light bg-default px-2 text-xs"
              @change="setSetting(addon, def.key, ($event.target as HTMLInputElement).value)"
            />
          </SettingRow>
        </div>
      </div>
    </div>
  </section>
</template>
