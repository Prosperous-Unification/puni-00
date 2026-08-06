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
