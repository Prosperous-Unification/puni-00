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
  useLayoutEffect(() => {
    latest.current = onChange;
  });
  useLayoutEffect(() => {
    const catchUp = (): void => {
      const next = store.snapshot();
      const previous = handedOn.current;
      if (next === previous) return;
      handedOn.current = next;
      latest.current(next, previous);
    };
    const unsubscribe = store.subscribe(catchUp);
    catchUp();
    return unsubscribe;
  }, [store]);
}
