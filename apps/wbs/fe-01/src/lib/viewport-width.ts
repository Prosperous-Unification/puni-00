import { useSyncExternalStore } from 'react';

/** Reads this browser's current CSS viewport width; it has no server/default viewport. */
export function useViewportWidth(): number {
  return useSyncExternalStore(subscribeToWidth, readViewportWidth);
}

function subscribeToWidth(notify: () => void): () => void {
  window.addEventListener('resize', notify);
  return () => {
    window.removeEventListener('resize', notify);
  };
}

function readViewportWidth(): number {
  return window.innerWidth;
}
