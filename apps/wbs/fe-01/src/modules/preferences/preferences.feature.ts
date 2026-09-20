import type { Preferences, Remembered, RememberedPreferences } from './contract';
import {
  GANTT_DETAIL_KEY,
  PROJECT_KEY,
  projectSettingsSectionKey,
  RETIRED_GANTT_ARROWS_KEY,
  THEME_KEY,
} from './preference-keys';

/**
 * Proof: accepting strings instead failed `the chart detail refuses anything
 * that is not a boolean` on `expected { status: 'held', value: 'yes' } to
 * deeply equal { status: 'refused' }`. Observed 2026-09-20.
 */
const holdsBoolean = (claimed: unknown): claimed is boolean => typeof claimed === 'boolean';

/**
 * The named answers delivery asks for, each over the one key that holds it.
 *
 * This is the whole of rule K2 for preferences: a component or a hook imports
 * this and never the resource, so no screen names a storage key and no screen
 * picks between the JSON shape and the bare-text one.
 */
export function createRememberedPreferences(preferences: Preferences): RememberedPreferences {
  return {
    themeChoice: <T extends string>(isValid: (claimed: unknown) => claimed is T): Remembered<T> =>
      preferences.json(THEME_KEY, isValid),
    ganttDetail: preferences.json(GANTT_DETAIL_KEY, holdsBoolean),
    retiredGanttArrows: preferences.unchecked(RETIRED_GANTT_ARROWS_KEY),
    lastOpenedProject: preferences.unchecked(PROJECT_KEY),
    projectSettingsSection: <T extends string>(
      projectId: string,
      isValid: (stored: string) => stored is T,
    ): Remembered<T> => preferences.text(projectSettingsSectionKey(projectId), isValid),
  };
}
