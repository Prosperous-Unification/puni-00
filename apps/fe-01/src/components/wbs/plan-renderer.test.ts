import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CARDS_BELOW, rendererForWidth, useRendererForViewport } from './plan-renderer';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** jsdom's own default, which is what every other test in this app runs at. */
const LAPTOP = 1024;
const PHONE = 390;

/**
 * Resizes the window the way a rotation does: the width first, then the event
 * the page hears about it through.
 *
 * `window.innerWidth` is writable in jsdom 24 (probed, 2026-08-09) and
 * `matchMedia` is not there at all — which is why the hook under test reads the
 * one and not the other.
 */
function resizeTo(width: number): void {
  act(() => {
    (window as unknown as { innerWidth: number }).innerWidth = width;
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(() => {
  cleanup();
  (window as unknown as { innerWidth: number }).innerWidth = LAPTOP;
});

describe('which renderer draws the plan', () => {
  /**
   * The boundary itself, which is the only interesting part of the arithmetic
   * and the only part a test can hold still.
   *
   * Proof: the comparison widened to `<=`, `768 is the table` failed on
   * `expected 'cards' to be 'table'` — a laptop window one pixel wide enough
   * for the table drawn as cards. Watched, 2026-08-09.
   */
  it('is cards below 768 and the table at it', () => {
    expect(rendererForWidth(CARDS_BELOW - 1)).toBe('cards');
    expect(rendererForWidth(CARDS_BELOW)).toBe('table');
  });

  it('is cards on a phone and the table on a laptop', () => {
    expect(rendererForWidth(PHONE)).toBe('cards');
    expect(rendererForWidth(1400)).toBe('table');
  });

  /**
   * The hook, and the whole reason it is a hook rather than a read: a window
   * that becomes narrow becomes cards without a reload, which is what a phone
   * being turned is.
   *
   * Proof: `subscribeToResize` replaced by one that registers nothing and
   * returns a no-op, `follows the window across the breakpoint, both ways`
   * failed on `expected 'table' to be 'cards'` — the renderer stuck at the
   * width the page was opened at. Watched, 2026-08-09.
   */
  itDom('follows the window across the breakpoint, both ways', () => {
    const held = renderHook(() => useRendererForViewport());
    expect(held.result.current).toBe('table');

    resizeTo(PHONE);
    expect(held.result.current).toBe('cards');

    resizeTo(LAPTOP);
    expect(held.result.current).toBe('table');
  });
});
