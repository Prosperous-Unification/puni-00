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
