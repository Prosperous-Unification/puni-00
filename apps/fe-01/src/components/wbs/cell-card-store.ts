import { useSyncExternalStore } from 'react';

/**
 * Which cell's hover card is on screen, held outside React state so that
 * moving the pointer across a cardable cell costs no render of the plan.
 *
 * `hoveredCell` and `focusedCell` were `useState`s at the top of `WbsTable`
 * until this change, and the address was the whole of the cost — the same cost
 * {@link createDepLights} and `pointed-row-store.ts` were written for. The
 * cells read their live state through `live.current` and rely on every parent
 * render reaching every cell, so one pointer move onto a Name cell re-rendered
 * every row, every cell and the whole Gantt to draw one card. `plan-cell-props`
 * said so in its own JSDoc — *"`hoveredCell` lives on the table, so every
 * boundary the pointer crosses costs one render of the whole of it"* — and
 * guarded the write on having something to show, which narrows the cost without
 * moving it. This is W2-7's cell half, deferred out of W4-4 in writing and
 * named there as R10's.
 *
 * **Two readings and one resolution**, exactly as the two states were. `hovered`
 * is the pointer's, `focused` is the keyboard's, they are set and cleared by
 * gestures that do not take turns, and the pointer wins while both are live
 * because it is the deliberate act of the moment. Both writers keep their
 * functional updaters — every one of them is guarded on the cell it belongs to,
 * because a leave lands after the next cell's enter — so
 * {@link CellCards.updateHovered} takes the same `(current) => next` a
 * `useState` setter did, and `hoveredCellAfterRefresh` still reads as one.
 *
 * Listeners are told only when the **resolved** cell changes: a hover that
 * writes the key already there, or a focus write underneath a live hover, wakes
 * nobody. Every cardable cell on screen is a subscriber, so waking them all to
 * answer "still not mine" is the render this store exists to stop.
 */
export interface CellCards {
  /** Tells `onChange` whenever the cell whose card is open changes. */
  subscribe: (onChange: () => void) => () => void;
  /**
   * The cell whose card is on screen, as a `cellKey`, or null.
   *
   * Read by the writers' own guards — which ask "is this still mine" — and by
   * {@link useCardOpenOn}. A cell that draws a card asks the hook, never this:
   * a subscription on the string would wake on every card anywhere.
   */
  openCard: () => string | null;
  /**
   * The pointer's reading, as a `useState` setter took it.
   *
   * Cancels any pending {@link CellCards.holdHovered}: a write means the
   * pointer has arrived somewhere, and the card it arrived on must not be
   * closed by a timer the previous cell started.
   */
  updateHovered: (next: (current: string | null) => string | null) => void;
  /**
   * Clears `cell` after a moment, unless something writes in the meantime.
   *
   * **The reach.** Every card a plan cell opens hangs diagonally off it since
   * 2026-09-10 — past the column so the column can be run down, past the row so
   * the row stays readable — so the hand going to a card a reader may point at
   * (the notes preview, which scrolls; the links card, whose lines are links)
   * leaves the cell on the way, and an immediate clear loses the card under it.
   * Dany: *"make it available to switch cursor and hover over the md preview if
   * moving cursor fast"*.
   *
   * In the store rather than in the cells because **arriving** is what cancels
   * it, and arriving is a write here: a cell that opens its own card cancels
   * the previous cell's hold without knowing it exists. The first cut put the
   * timer in the cells and the dependency cell's card died to a hold started
   * before the pointer came back — 120 seconds of `waiting for
   * locator('[role="tooltip"]')`, in Chromium.
   *
   * The same-cell guard is kept inside the hold: a leave lands after the next
   * cell's enter, and after a delay that is truer still.
   */
  holdHovered: (cell: string) => void;
  /**
   * Cancels a pending {@link CellCards.holdHovered} without writing anything.
   *
   * For the one arrival that is not a write: the pointer landing **on the card**
   * itself. A card is a child of its cell's wrapper, so entering it is entering
   * that wrapper — but the cell must not re-open a card the marker alone is
   * allowed to open (the Name cell's preview, Dany's rule since 2026-08-09), so
   * the enter cancels and says nothing else.
   *
   * Without it the hold runs out while the reader is reading: watched in
   * Chromium as `the card closed while walking to item 2`, three items into the
   * links card.
   */
  cancelHold: () => void;
  /** The keyboard's reading, likewise. */
  updateFocused: (next: (current: string | null) => string | null) => void;
}

/**
 * How long a cell's card is held after the pointer leaves it, in milliseconds.
 *
 * 300ms is the reach measured at speed and then some: 260px of travel at a
 * flick's ~2000px/s is 130ms. A card that outlives the pointer by a moment
 * costs nothing — any write cancels the hold, and the same-cell guard inside it
 * means a card another cell has opened is never the one closed.
 */
export const REACH_FOR_THE_CARD_MS = 300;

export function createCellCards(): CellCards {
  let hovered: string | null = null;
  let focused: string | null = null;
  let open: string | null = null;
  let holding: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const stopHolding = (): void => {
    if (holding === null) return;
    clearTimeout(holding);
    holding = null;
  };

  const settle = (): void => {
    const next = hovered ?? focused;
    if (next === open) return;
    open = next;
    for (const listener of listeners) listener();
  };

  return {
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    openCard: () => open,
    updateHovered: (next) => {
      stopHolding();
      hovered = next(hovered);
      settle();
    },
    cancelHold: stopHolding,
    holdHovered: (cell) => {
      stopHolding();
      holding = setTimeout(() => {
        holding = null;
        if (hovered !== cell) return;
        hovered = null;
        settle();
      }, REACH_FOR_THE_CARD_MS);
    },
    updateFocused: (next) => {
      focused = next(focused);
      settle();
    },
  };
}

/**
 * Whether this cell is the one whose card is on screen.
 *
 * A boolean and not the key, so a card opening three rows away tells this cell
 * nothing: `useSyncExternalStore` compares what the getter returns, and every
 * cardable cell on a five-hundred-row plan subscribes.
 */
export function useCardOpenOn(cards: CellCards, cell: string): boolean {
  return useSyncExternalStore(
    cards.subscribe,
    () => cards.openCard() === cell,
    () => false,
  );
}
