import { browserStorage } from './browser-storage.repository';
import type { Preferences, RememberedPreferences } from './contract';
import { createRememberedPreferences } from './preferences.feature';
import { createPreferences } from './preferences.resource';

/**
 * The module-load preferences resource delivery still imports.
 *
 * **Staged, and recorded as debt.** The page's runtime now installs this same
 * module through `installApplicationRuntime`, which is where preferences will be
 * read from once delivery takes them out of a context. Until then there are two
 * instances of a service that holds **no state** — every preference lives in the
 * reader's browser and the adapter reaches it per call — so the two agree by
 * construction, and `composition-agreement.test.ts` is what says so. What the
 * runtime's instance has and this one has not is an owner: retiring it revokes
 * its store.
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
