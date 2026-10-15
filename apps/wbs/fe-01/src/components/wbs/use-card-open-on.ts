import { useSyncExternalStore } from 'react';

import type { CellCards } from './cell-card-store';

/**
 * Whether this cell is the one whose card is on screen.
 *
 * A boolean and not the key, so a card opening three rows away tells this cell
 * nothing: `useSyncExternalStore` compares what the getter returns, and every
 * cardable cell on a five-hundred-row plan subscribes. The server snapshot is
 * closed, even if the store already has an open card.
 *
 * Proof: replacing the client snapshot with false failed both selected-cell
 * tests in use-card-open-on.test.tsx; replacing the server snapshot with true
 * failed its server-rendering test on `<span>true</span>`. Watched 2026-10-15.
 */
export function useCardOpenOn(cards: CellCards, cell: string): boolean {
  return useSyncExternalStore(
    cards.subscribe,
    () => cards.openCard() === cell,
    () => false,
  );
}
