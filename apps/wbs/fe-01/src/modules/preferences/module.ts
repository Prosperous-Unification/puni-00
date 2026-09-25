import { DiBag } from 'di-bag';

import { revocableStorage } from './browser-storage.repository';
import {
  type BrowserStorage,
  type IsRuntimeLive,
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
 * answers `DI_BAG_UNKNOWN_SERVICE_KEY` — and it is the module's **one owned
 * disposable**: the revocable store, given back when the installation closes.
 * The raw adapter it wraps is a host requirement rather than a private binding,
 * which is what makes a host that forgets it say which module asked:
 * `Cannot resolve "frontend.preferences/preferencesStore": dependency
 * "browserStore" is not registered.`
 *
 * `isLive` is the module's second host requirement: a synchronous predicate
 * `preferences.resource.ts` re-checks around every caller-supplied validator,
 * on both its accepting and refusing branches, so a runtime withdrawn while
 * `isValid` is still on the stack cannot have its own answer trusted either
 * way. `application-runtime.ts` is the one host that wires it to a real
 * lifetime slot; every other host — including this module's own tests —
 * registers `() => true`. This is a **required** registration of the module
 * itself, not a fallback: `createPreferences`'s own always-`true` default
 * only applies to code that calls it directly, bypassing this module.
 */
export const preferencesModule = DiBag.createBuilder()
  .withServices({
    // Proof: on 2026-09-22, dropping this disposal made 'gives the store back when
    // its host graph closes' receive no throw (4 failed, 38 passed).
    preferencesStore: DiBag.providerWithDisposal({
      provider: DiBag.createProvider(
        ({ browserStore }: { browserStore: BrowserStorage }): RevocableBrowserStorage =>
          revocableStorage(browserStore),
        { factoryReturnKind: 'sync-value' },
      ),
      disposeService: (store) => {
        store.revoke();
      },
    }),
  })
  .withServices({
    // `preferencesStore` destructured before `isLive`: a host that supplies
    // neither is told about the missing `browserStore` behind `preferencesStore`
    // first, matching this module's own established resolution-order fact —
    // see module.test.ts's "names itself when a host omits the browser store".
    // Proof: on 2026-09-22, destructuring `isLive` first failed that test with
    // missing dependency "isLive" instead of the labelled missing browser store.
    preferences: DiBag.createProvider(
      ({
        preferencesStore,
        isLive,
      }: {
        preferencesStore: RevocableBrowserStorage;
        isLive: IsRuntimeLive;
      }): Preferences => createPreferences(preferencesStore, isLive),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    remembered: DiBag.createProvider(
      ({ preferences }: { preferences: Preferences }): RememberedPreferences =>
        createRememberedPreferences(preferences),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof: on 2026-09-22, exporting `preferencesStore` made 'keeps its owned store
  // out of a host graph' receive no throw (4 failed, 38 passed).
  // Proof: on 2026-09-22, dropping the label made the graph omit
  // `frontend.preferences/preferencesStore` (2 failed, 40 passed).
  .buildModule({
    exportedServiceKeys: ['preferences', 'remembered'],
    moduleLabel: PREFERENCES_LABEL,
  });
