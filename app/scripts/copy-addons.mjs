/**
 * Copy the addons that come with Nyerk (app/addons/) to out/addons, where main/addons.ts looks for
 * them in the installed app and in a bundle (scripts/build-bundle.mjs packs out/addons too).
 */
import { cp, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
await rm(join(APP, 'out', 'addons'), { recursive: true, force: true })
await cp(join(APP, 'addons'), join(APP, 'out', 'addons'), { recursive: true })
