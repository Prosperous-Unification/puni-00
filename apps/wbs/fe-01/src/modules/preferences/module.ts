import { DiBag } from 'di-bag';

import { revocableStorage } from './browser-storage.repository';
import {
  type BrowserStorage,
  type Preferences,
  PREFERENCES_LABEL,
  type RememberedPreferences,
  type RevocableBrowserStorage,
} from './contract';
import { createRememberedPreferences } from './preferences.feature';
import { createPreferences } from './preferences.resource';

/**
 * Preferences as a sealed DI Bag module.
 *
 * Two exports, and the reasons differ: `remembered` is the feature-service
 * delivery is allowed to see, and `preferences` is the resource beneath it,
 * exported for one non-React caller and recorded as debt — see
 * {@link import('./contract').PreferencesExports}.
 *
 * `preferencesStore` stays private, so a host cannot name it — resolving it
 * answers `DI_BAG_MISSING_REGISTRATION` — and it is the module's **one owned
 * disposable**: the revocable store, given back when the installation closes.
 * The raw adapter it wraps is a host requirement rather than a private binding,
 * which is what makes a host that forgets it say which module asked:
 * `Cannot resolve "frontend.preferences/preferencesStore": dependency
 * "browserStore" is not registered.`
 */
export const preferencesModule = DiBag.createBuilder()
  .register({
    preferencesStore: DiBag.withDisposal(
      DiBag.fromSyncFactory(
        ({ browserStore }: { browserStore: BrowserStorage }): RevocableBrowserStorage =>
          revocableStorage(browserStore),
      ),
      (store) => {
        store.revoke();
      },
    ),
  })
  .register({
    preferences: DiBag.fromSyncFactory(
      ({ preferencesStore }: { preferencesStore: RevocableBrowserStorage }): Preferences =>
        createPreferences(preferencesStore),
    ),
  })
  .register({
    remembered: DiBag.fromSyncFactory(
      ({ preferences }: { preferences: Preferences }): RememberedPreferences =>
        createRememberedPreferences(preferences),
    ),
  })
  .buildModule(['preferences', 'remembered'], { label: PREFERENCES_LABEL });
