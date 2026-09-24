import type { Claim, Remembered } from '@/modules/preferences/contract';
import { type ApplicationServices, applicationSlot } from '@/runtime/application-runtime';
import type { LifetimeSlot } from '@/runtime/lifetime-slot';

export type { Claim, Remembered };

/**
 * A remembered answer as it stood at the instant it was asked for, and whether a
 * live runtime was there to answer.
 *
 * `persists: false` is the visible degradation rule R5 asks for when the page
 * has no live runtime: `value` is then the caller's own documented default —
 * exactly what an unread key already produces — and nothing was read, dropped or
 * written. A caller that shows `value` either way still has the answer to "is
 * this being remembered" in its hands, rather than a default it cannot tell
 * apart from a stored one.
 */
export interface Recalled<T> {
  readonly value: T;
  readonly persists: boolean;
}

/**
 * One JSON-written key, resolved against the runtime the page's slot is
 * publishing **at the instant of each call** — never at the instant the handle
 * was built.
 *
 * Every member reads `slot.snapshot()` first and reaches that runtime's own
 * preferences resource only while it is `live`. So a handle built at module
 * load — `remembered-layout.ts`'s browser-wide `storedMermaidSectionMode`,
 * before any runtime exists — and kept for the life of the page follows every
 * replacement, and never reaches a runtime that has been withdrawn, retired or
 * replaced: it holds no store to go stale.
 */
export interface RuntimeRemembered<T> {
  /**
   * The stored value, dropping a key whose contents are no longer a `T` — or
   * `null` where none is stored. Not persisted, and nothing read or dropped,
   * when no runtime is live.
   */
  readAndDrop(): Recalled<T | null>;
  /** Writes `value`, answering whether a live runtime took it. */
  write(value: T): boolean;
  /** Removes the key, answering whether a live runtime was there to remove it from. */
  forget(): boolean;
}

/**
 * The store for one key, judged by one guard, over the page's own runtime — see
 * {@link RuntimeRemembered} for when that runtime is resolved.
 *
 * Kept as a free function at this path because the layout module builds a store
 * per project id and imports it here, and an extraction that renamed every call
 * site would be a diff nobody can review against "no behaviour changed". The
 * knowledge moved; the spelling did not.
 *
 * It reads the runtime's `preferences` resource — the generic factory, which is
 * the one reason that resource is a public export of the preferences module and
 * of `ApplicationServices` (recorded K2 debt: see `PreferencesExports`). That is
 * also why this is not a React hook: the per-project layout stores are called
 * from effects, handlers and lazy initialisers alike, and the resource is never
 * published into a React context.
 *
 * `slot` defaults to the page's one slot; a test passes its own, and nothing
 * else does.
 *
 * @throws whatever a live runtime's store throws — a browser with site data
 * blocked — unchanged. With no runtime live, nothing throws: the typed
 * {@link Recalled} and the `false` a write answers are the outcome.
 */
export function remembered<T>(
  key: string,
  isValid: (claimed: unknown) => claimed is T,
  slot: LifetimeSlot<ApplicationServices> = applicationSlot,
): RuntimeRemembered<T> {
  /** The live runtime's own store for this key, right now — or none. */
  // Proof: on 2026-09-24, resolving the store once when the handle is built
  // failed `answers and stores exactly what the model says, under generated interleavings` after 8 runs on `write(outline): what the handle answered:
  // expected false to deeply equal true`. Keeping the last live store for when
  // nothing is live failed it after 13 runs on `read: what the handle answered:
  // expected PreferenceStoreLifecycleError … to deeply equal
  // { value: null, persists: false }`.
  const storeNow = (): Remembered<T> | null => {
    const state = slot.snapshot();
    return state.status === 'live' ? state.services.preferences.json(key, isValid) : null;
  };
  return {
    readAndDrop: () => {
      const store = storeNow();
      // Proof: on 2026-09-24, answering `persists: true` here failed
      // `answers and stores exactly what the model says, under generated interleavings` after 2 runs on `read: what the handle answered: expected
      // { value: null, persists: true } to deeply equal { value: null, persists: false }`.
      if (store === null) return { value: null, persists: false };
      // Proof: on 2026-09-24, `readAndDrop` replaced by `read` failed
      // `answers and stores exactly what the model says, under generated interleavings` after 106 runs on `stored bytes in B: expected '7' to be undefined`.
      return { value: store.readAndDrop(), persists: true };
    },
    write: (value) => {
      const store = storeNow();
      // Proof: on 2026-09-24, answering `true` here failed `answers and stores exactly what the model says, under generated interleavings` after
      // 2 runs on `write(outline) while acquiring: what the handle answered:
      // expected true to deeply equal false`.
      if (store === null) return false;
      // Proof: on 2026-09-24, catching the store's failure and answering `false`
      // failed `answers and stores exactly what the model says, under generated interleavings` after 18 runs on `write(outline): an ordinary storage
      // failure did not propagate unchanged: expected false to be Error: write denied`.
      store.write(value);
      return true;
    },
    forget: () => {
      const store = storeNow();
      if (store === null) return false;
      store.forget();
      return true;
    },
  };
}
