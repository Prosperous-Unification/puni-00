import '@testing-library/jest-dom/vitest';

// Under Bun + jsdom 24 the window is there, the origin is set, and
// `window.localStorage` is still undefined (probed, not assumed). Real
// browsers have it; tests get the same contract from this in-memory stand-in,
// installed only when it is missing so a runtime that grows one keeps its own.
if (typeof window !== 'undefined' && typeof window.localStorage === 'undefined') {
  const backing = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return backing.size;
    },
    clear: () => {
      backing.clear();
    },
    getItem: (key) => backing.get(key) ?? null,
    key: (index) => [...backing.keys()][index] ?? null,
    removeItem: (key) => {
      backing.delete(key);
    },
    setItem: (key, value) => {
      backing.set(key, value);
    },
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}

/**
 * A `MediaQueryList` a test can drive.
 *
 * The extra method is the whole reason this stand-in is worth having: the fault
 * it has to be able to show is **the app's subscription coming loose**, and a
 * stub that answers `false` for ever cannot show it — which is
 * `plan-renderer.ts`'s own objection to stubbing `matchMedia`, written down
 * there in 2026-08-09. What a browser makes of `(prefers-color-scheme: dark)`
 * is Chromium's business and is asserted in `e2e/dark-mode.spec.ts` through
 * Playwright's `emulateMedia`; what jsdom is asked here is only whether this
 * app listens to the answer and re-paints on it.
 */
export interface DriveableMediaQueryList extends MediaQueryList {
  /** Flips the answer and tells every live listener, exactly as a platform does. */
  setMatches(matches: boolean): void;
}

/**
 * jsdom 24 ships **no `window.matchMedia` at all** — probed 2026-08-09, and
 * `plan-renderer.ts` carries the note. `lib/theme.ts` throws rather than
 * guessing when it is missing, because "what has this machine been set to" has
 * exactly one source and a `false` in its place is a light page shown to
 * somebody who asked for a dark one. So the test environment grows one instead
 * of the app growing a branch for the test environment.
 *
 * One list per query string, cached: two `matchMedia` calls with the same query
 * must be the same object here, or a test would drive one list while the app
 * listened to another and the assertion would be about the stub.
 *
 * Installed only when it is missing, like the storage above, so a runtime that
 * grows its own keeps it.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  const lists = new Map<string, DriveableMediaQueryList>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): DriveableMediaQueryList => {
      const already = lists.get(query);
      if (already !== undefined) return already;
      const listeners = new Set<(event: MediaQueryListEvent) => void>();
      const list = {
        media: query,
        matches: false,
        onchange: null,
        addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
          if (type === 'change') listeners.add(listener);
        },
        removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
          if (type === 'change') listeners.delete(listener);
        },
        addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
        removeListener: (listener: (event: MediaQueryListEvent) => void) =>
          listeners.delete(listener),
        dispatchEvent: () => true,
        setMatches: (matches: boolean) => {
          list.matches = matches;
          for (const listener of [...listeners]) {
            listener({ matches, media: query } as MediaQueryListEvent);
          }
        },
      } as unknown as DriveableMediaQueryList & { matches: boolean };
      lists.set(query, list);
      return list;
    },
  });
}

// jsdom *has* a `window.scrollTo`, and all it does is print "Not implemented:
// window.scrollTo" to its virtual console — so unlike the storage above this is
// replaced rather than filled in, and unconditionally: a `typeof` guard here
// would be a branch that never runs. The router scrolls to the top on every
// navigation, which is 66 lines of stderr per suite about a scroll position no
// jsdom test asserts on. The scrolling that matters is measured in `e2e/`, by a
// browser that really does it.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', { value: () => undefined, configurable: true });
}
