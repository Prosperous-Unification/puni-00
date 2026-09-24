import { useLayoutEffect, useRef } from 'react';

import type { Channel } from '@/modules/channel';

/**
 * Listens to one project channel for as long as the component is mounted, with
 * the listener of the latest render.
 *
 * Three things a naive `useEffect(() => channel.subscribe(listener))` gets
 * wrong, each an example test in `use-channel-listener.test.tsx`:
 *
 * - **Subscribed before any passive effect of the commit runs.** A layout
 *   effect, so an event a sibling's or a child's `useEffect` publishes on mount
 *   — the plan feed's first read is started from one — is heard rather than
 *   published into nobody.
 * - **The listener of the latest render, without resubscribing.** Read through a
 *   ref written in a layout effect, so a listener superseded by a re-render is
 *   never called again, and a new listener identity costs no unsubscribe.
 * - **One subscription per channel.** A channel replaced while the component
 *   stays mounted is left before the new one is joined, in the same commit, and
 *   unmounting leaves it; nothing published afterwards reaches this component.
 *
 * It never catches: a listener's failure reaches whoever published, which is
 * {@link Channel}'s rule.
 */
export function useChannelListener<T>(channel: Channel<T>, listener: (event: T) => void): void {
  const latest = useRef(listener);
  // Proof: on 2026-09-24, dropping this ref write failed `calls the listener of
  // the latest render and never a superseded one` on `expected [ 'after the
  // re-render' ] to deeply equal []`.
  useLayoutEffect(() => {
    latest.current = listener;
  });
  // Proof: on 2026-09-24, subscribing in a passive `useEffect` instead failed
  // `hears an event a child publishes from its own mount effect` on `expected []
  // to deeply equal [ 'first read refused' ]`.
  useLayoutEffect(
    () =>
      // Proof: on 2026-09-24, dropping the returned unsubscribe failed `hears
      // nothing once it is unmounted, and a publication then throws nothing` on
      // `expected [ 'after the unmount' ] to deeply equal []`.
      channel.subscribe((event) => {
        // Proof: on 2026-09-24, catching and swallowing here failed `lets a
        // listener’s own failure reach the publisher by identity` on `expected
        // null to be Error: the toast stack is gone`.
        latest.current(event);
      }),
    // Proof: on 2026-09-24, `[]` here failed `follows a channel replaced while it
    // stays mounted, and leaves the old one` on `expected [ 'from the replaced
    // channel' ] to deeply equal [ 'from the replacement' ]`.
    [channel],
  );
}
