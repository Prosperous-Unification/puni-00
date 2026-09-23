import {
  type BrowserStorage,
  PreferenceStoreLifecycleError,
  type RevocableBrowserStorage,
} from './contract';

/**
 * The adapter over this browser's own store.
 *
 * The store is reached **per call** and never captured when this module loads.
 * Two reasons, both load-bearing: the fast test tier has no browser store at all
 * and must be able to import anything above this without it throwing on load,
 * and the shared jsdom setup installs its stand-in after the module graph is
 * built.
 *
 * Proof: capturing the store at module load made the production composition
 * suite fail collection with `ReferenceError: localStorage is not defined`.
 * Observed 2026-09-20.
 *
 * @throws whatever the browser throws on access. A store that refuses — site
 * data blocked, a private session — is not recovered from here; see
 * {@link BrowserStorage}.
 */
export function browserStorage(): BrowserStorage {
  return {
    read: (key) => localStorage.getItem(key),
    write: (key, value) => {
      localStorage.setItem(key, value);
    },
    forget: (key) => {
      // Proof: making this a no-op failed the adapter case on `expected 'held'
      // to be null` and three chart-detail drop cases, including the retired
      // key on `expected 'true' to be null`. Observed 2026-09-20.
      localStorage.removeItem(key);
    },
  };
}

/**
 * What a revoked store answers: nothing, ever again.
 *
 * Thrown rather than ignored, and this is rule R5 rather than strictness for its
 * own sake: a preference written after the runtime that owned the store was
 * retired is a write whose owner is gone, and a silent no-op would leave the
 * screen showing a choice the browser never kept.
 */
const REVOKED = 'the preferences store was revoked with its runtime';

/**
 * The same store, until the runtime that owns it gives it back.
 *
 * The one owned disposable of the preferences module: {@link BrowserStorage} on
 * its own has nothing to close, and a module whose close did nothing would be a
 * close nobody could prove. After `revoke` every member throws, so a component
 * that outlived its runtime cannot reach the reader's browser through a
 * `Remembered` it captured.
 *
 * @throws once revoked, from `read`, `write` and `forget` alike.
 */
export function revocableStorage(store: BrowserStorage): RevocableBrowserStorage {
  let revoked = false;
  /** The one guard, so all three members refuse in the same place. */
  const held = (): BrowserStorage => {
    // Proof: on 2026-09-22, handing the store back either way made 'refuses every
    // access once the store has been given back' receive no throw (5 failed, 37 passed).
    // Proof: on 2026-09-23, replacing the typed refusal with a plain Error made
    // 'a revoked store refuses with a lifecycle refusal of kind revoked' fail on expected false to be true.
    if (revoked) throw new PreferenceStoreLifecycleError(REVOKED, 'revoked');
    return store;
  };
  return {
    read: (key) => held().read(key),
    write: (key, value) => {
      held().write(key, value);
    },
    forget: (key) => {
      held().forget(key);
    },
    revoke: () => {
      revoked = true;
    },
  };
}
