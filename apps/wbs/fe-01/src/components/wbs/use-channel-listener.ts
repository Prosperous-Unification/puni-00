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
  useLayoutEffect(() => {
    latest.current = listener;
  });
  useLayoutEffect(
    () =>
      channel.subscribe((event) => {
        latest.current(event);
      }),
    [channel],
  );
}
