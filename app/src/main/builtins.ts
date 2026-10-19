/**
 * The app's features that come as addons (app/addons/, shared/addons.ts BUILTIN_ADDONS): whether
 * each is switched on. Read from the settings alone, so the code each one gates can ask without
 * importing main/addons.ts.
 */
import { builtinOn, type BuiltinAddon } from '../shared/addons.ts'
import { settings } from './settings.ts'

export const featureOn = (id: BuiltinAddon): boolean => builtinOn(settings.get('addons').enabled, id)
