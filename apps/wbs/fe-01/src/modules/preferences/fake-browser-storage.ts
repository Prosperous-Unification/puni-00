import type { BrowserStorage } from './contract';

/** What the fake answers beside the port's own members. */
export interface HeldByFake {
  /** Everything the fake holds, for asserting on the bytes rather than the reading. */
  readonly held: () => Record<string, string>;
}

/** An in-memory store, for tests and for the injected-fault proofs. */
export function fakeBrowserStorage(seed: Record<string, string> = {}): BrowserStorage & HeldByFake {
  const held = new Map<string, string>(Object.entries(seed));
  return {
    read: (key) => held.get(key) ?? null,
    write: (key, value) => {
      held.set(key, value);
    },
    forget: (key) => {
      held.delete(key);
    },
    held: () => Object.fromEntries(held),
  };
}
