import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCellCards, REACH_FOR_THE_CARD_MS } from './cell-card-store';

/**
 * The reach, as the store keeps it: a card is held for
 * {@link REACH_FOR_THE_CARD_MS} after the pointer leaves what opened it, and
 * only an **arrival** — back on the trigger, or on the card — keeps it past
 * that.
 *
 * Every case here is about the moment between the leave and the close, which
 * is where the 2026-09-11 fault lived: a cell the hand crossed on the
 * way out wrote the store a same-cell clear that changed nothing, and the store
 * read every write as an arrival. No unit test can walk a pointer through a
 * cell; `e2e/hover-cards.spec.ts` does, and this file says what the store
 * promised it.
 */
describe('the cell-card store’s reach', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes a held card when the reach runs out', () => {
    const cards = createCellCards();
    cards.arriveOn('a:name');
    cards.holdHovered('a:name');
    vi.advanceTimersByTime(REACH_FOR_THE_CARD_MS - 1);
    expect(cards.openCard()).toBe('a:name');
    vi.advanceTimersByTime(1);
    expect(cards.openCard()).toBeNull();
  });

  it('closes it however many cells the hand crosses on the way out', () => {
    // Dany, 2026-09-11: _"cursor away from notes icon & the preview pop-up
    // for N ms => remove the preview"_. A cell with no card of its own writes
    // a same-cell clear as the pointer leaves it — the guard every leave here
    // carries, because a leave lands after the next cell's enter — and that
    // is a departure, not an arrival: it must not touch a hold another cell
    // started.
    // Proof: `stopHolding()` put back at the top of `updateHovered` — this
    // failed on `expected 'a:name' to be null`. Watched, 2026-09-11.
    const cards = createCellCards();
    cards.arriveOn('a:name');
    cards.holdHovered('a:name');
    cards.updateHovered((current) => (current === 'a:depends' ? null : current));
    cards.updateHovered((current) => (current === 'b:depends' ? null : current));
    vi.advanceTimersByTime(REACH_FOR_THE_CARD_MS);
    expect(cards.openCard()).toBeNull();
  });

  it('keeps the card while the pointer is back on what opened it', () => {
    const cards = createCellCards();
    cards.arriveOn('a:name');
    cards.holdHovered('a:name');
    cards.arriveOn('a:name');
    vi.advanceTimersByTime(REACH_FOR_THE_CARD_MS);
    expect(cards.openCard()).toBe('a:name');
  });

  it('keeps the card the pointer arrived on, not the one it left', () => {
    const cards = createCellCards();
    cards.arriveOn('a:name');
    cards.holdHovered('a:name');
    cards.arriveOn('b:start');
    expect(cards.openCard()).toBe('b:start');
    vi.advanceTimersByTime(REACH_FOR_THE_CARD_MS);
    expect(cards.openCard()).toBe('b:start');
  });

  it('lets the card keep itself once the pointer lands on it', () => {
    const cards = createCellCards();
    cards.arriveOn('a:name');
    cards.holdHovered('a:name');
    cards.cancelHold();
    vi.advanceTimersByTime(REACH_FOR_THE_CARD_MS);
    expect(cards.openCard()).toBe('a:name');
  });

  it('closes a card its own cell clears at once, hold or no hold', () => {
    const cards = createCellCards();
    cards.arriveOn('a:depends');
    cards.holdHovered('a:depends');
    cards.updateHovered((current) => (current === 'a:depends' ? null : current));
    expect(cards.openCard()).toBeNull();
    vi.advanceTimersByTime(REACH_FOR_THE_CARD_MS);
    expect(cards.openCard()).toBeNull();
  });

  it('tells its subscribers when the held card goes, and not before', () => {
    // The card is drawn from a subscription ({@link useCardOpenOn}), so a
    // store that closed the card and told nobody would leave it on screen.
    // Proof: `stopHolding()` put back at the top of `updateHovered` — this
    // failed on `expected "vi.fn()" to be called 1 times, but got 0 times`.
    // Watched, 2026-09-11.
    const cards = createCellCards();
    cards.arriveOn('a:name');
    const told = vi.fn();
    cards.subscribe(told);
    cards.holdHovered('a:name');
    cards.updateHovered((current) => (current === 'a:depends' ? null : current));
    expect(told).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REACH_FOR_THE_CARD_MS);
    expect(told).toHaveBeenCalledTimes(1);
  });
});
