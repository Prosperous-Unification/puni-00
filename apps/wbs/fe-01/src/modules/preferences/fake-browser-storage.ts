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

/**
 * The same in-memory store, whose `write` raises one **retained** ordinary
 * storage failure.
 *
 * The "site data blocked" case {@link BrowserStorage}'s own JSDoc describes:
 * reads and forgets behave normally, so a runtime installed over this is live in
 * every other respect, and only the write refuses. It is **not** a lifecycle
 * refusal, so nothing above it may recover from it.
 *
 * `failure` is thrown by identity rather than constructed per call, so a caller
 * can assert that the very object the store raised is the one that reached it —
 * a message comparison would pass for a refusal some intermediate layer
 * rewrapped or replaced.
 */
export function writeRefusingBrowserStorage(
  failure: Error,
  seed: Record<string, string> = {},
): BrowserStorage & HeldByFake {
  const held = fakeBrowserStorage(seed);
  return {
    read: (key) => held.read(key),
    write: () => {
      throw failure;
    },
    forget: (key) => {
      held.forget(key);
    },
    held: () => held.held(),
  };
}

/**
 * The same in-memory store, whose **read** answers normally `readsBeforeFailing`
 * times and then raises one retained ordinary storage failure.
 *
 * What it is for: the only way to reach a delivery consumer's resynchronisation
 * effect with a failure that is not a lifecycle refusal. A store that refused
 * every read would refuse the render that precedes the effect as well, and a
 * store that refused only writes never reaches the effect at all — which is why
 * {@link writeRefusingBrowserStorage} cannot prove the effect's own rethrow.
 * `readsBeforeFailing: 1` lets `useTheme`'s lazy `useState` initialiser read once
 * and makes the resync effect's own read the first that fails.
 *
 * `forget` refuses on the same terms, because a refused claim reaches
 * `Remembered.readAndDrop`'s removal and that removal must propagate too.
 */
export function readRefusingBrowserStorage(
  failure: Error,
  readsBeforeFailing: number,
  seed: Record<string, string> = {},
): BrowserStorage & HeldByFake {
  const held = fakeBrowserStorage(seed);
  let reads = 0;
  const answerOrRefuse = <T>(answer: () => T): T => {
    reads += 1;
    if (reads > readsBeforeFailing) throw failure;
    return answer();
  };
  return {
    read: (key) => answerOrRefuse(() => held.read(key)),
    write: (key, value) => {
      held.write(key, value);
    },
    forget: (key) => {
      answerOrRefuse(() => {
        held.forget(key);
      });
    },
    held: () => held.held(),
  };
}
