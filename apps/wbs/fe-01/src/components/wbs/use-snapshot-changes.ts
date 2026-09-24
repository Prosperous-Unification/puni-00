import { useLayoutEffect, useRef } from 'react';

import type { Store } from '@/modules/store';

/**
 * Calls `onChange` once for every change of a store's snapshot, with the
 * snapshot it replaced, for as long as the component is mounted.
 *
 * For the presentation a change **causes** rather than the value it shows — the
 * table's hover card settled against rows that moved, drafts dropped for a step
 * that went. The value itself is selected with `useSyncExternalStore`; this is
 * the side effect, run synchronously inside the store's own notification, which
 * is the same pass the change was made in.
 *
 * The four things it keeps, each an example test in
 * `use-snapshot-changes.test.tsx`:
 *
 * - **Nothing missed between the render and the subscription.** The last
 *   snapshot handed on is remembered across subscriptions, and a subscription
 *   first catches up with any change made since — a child's layout effect runs
 *   before this one does.
 * - **Nothing twice.** A notification whose snapshot is the one already handed
 *   on calls nothing.
 * - **The callback of the latest render**, read through a ref, so a superseded
 *   callback is never called and a new identity costs no resubscription.
 * - **One subscription per store.** A store replaced while mounted is left, and
 *   its replacement's snapshot is a change; unmounting leaves it.
 *
 * It never catches: `onChange`'s failure reaches whoever changed the store.
 */
export function useSnapshotChanges<T>(
  store: Store<T>,
  onChange: (next: T, previous: T) => void,
): void {
  const latest = useRef(onChange);
  const handedOn = useRef(store.snapshot());
  // Proof: on 2026-09-24, this effect deleted, `calls the callback of the latest render and never
  // a superseded one` failed on `expected [ 1 ] to deeply equal []`.
  useLayoutEffect(() => {
    latest.current = onChange;
  });
  useLayoutEffect(() => {
    const catchUp = (): void => {
      const next = store.snapshot();
      const previous = handedOn.current;
      // Proof: on 2026-09-24, this line deleted, `hands on nothing when told of a change that
      // left the snapshot as it was` failed on `expected [ [ +0, +0 ], [ +0, +0 ] ] to deeply
      // equal []`.
      if (next === previous) return;
      handedOn.current = next;
      latest.current(next, previous);
    };
    const unsubscribe = store.subscribe(catchUp);
    // Proof: on 2026-09-24, this call deleted, `catches up with a change made between its render
    // and its subscription` failed on `expected [] to deeply equal [ [ 5, +0 ] ]`.
    catchUp();
    // Proof: on 2026-09-24, written as `void unsubscribe`, `hands on nothing once it is
    // unmounted` failed on `expected [ 1 ] to deeply equal []`.
    return unsubscribe;
    // Proof: on 2026-09-24, written with `[]` dependencies, `follows a store replaced while it
    // stays mounted, and leaves the old one` failed on `expected [ [ 1, +0 ] ] to deeply equal
    // [ [ 7, +0 ], [ 8, 7 ] ]`.
  }, [store]);
}
