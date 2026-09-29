import { useEffect, useRef } from 'react';

/** How often a visible spaces page re-reads what others may have changed (design memo §7). */
export const SPACES_REFRESH_MS = 60_000;

/**
 * Re-reads a spaces page when the reader comes back and every
 * {@link SPACES_REFRESH_MS} while the tab is visible: no socket carries space
 * changes, so polling is the freshness.
 *
 * Both return events, as the directory page listens to them: `focus` for a
 * window brought forward, `visibilitychange` for a tab switched back to in a
 * window that kept focus. A read still in flight is not started again, so a
 * focus landing on a poll costs one read, not two.
 *
 * Proof, observed 2026-09-29: with the in-flight check removed, `starts no
 * second read while one is in flight` in `use-spaces-polling.test.tsx` counted
 * two reads.
 */
export function useSpacesPolling(read: () => Promise<void>): void {
  const reading = useRef(false);
  useEffect(() => {
    const again = () => {
      if (reading.current) return;
      reading.current = true;
      void read().finally(() => {
        reading.current = false;
      });
    };
    const whenVisible = () => {
      if (document.visibilityState === 'visible') again();
    };
    const timer = window.setInterval(whenVisible, SPACES_REFRESH_MS);
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [read]);
}
