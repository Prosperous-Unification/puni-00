import { browserStorage } from './browser-storage.repository';
import type { Preferences, RememberedPreferences } from './contract';
import { createRememberedPreferences } from './preferences.feature';
import { createPreferences } from './preferences.resource';

/**
 * The one preferences resource this app runs on.
 *
 * Exported because `apps/wbs/fe-01/src/lib/remembered.ts` still offers the
 * generic factory to the layout module, which builds a store per project id and
 * so cannot be a fixed named answer. Nothing that imports React may import this;
 * delivery takes {@link rememberedPreferences}.
 */
export const browserPreferences: Preferences = createPreferences(browserStorage());

/** The named answers, which is what delivery imports. */
export const rememberedPreferences: RememberedPreferences =
  createRememberedPreferences(browserPreferences);
