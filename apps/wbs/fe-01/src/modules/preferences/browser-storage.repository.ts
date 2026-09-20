import type { BrowserStorage } from './contract';

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
