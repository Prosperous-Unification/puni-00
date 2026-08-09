import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HoverCard } from './hover-card';
import { HoverPreview } from './hover-preview';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

describe('a hover card hangs over the rows below without touching them', () => {
  itDom('does not take the pointer', () => {
    // The rule the browser found and no amount of reading found: a card opens
    // over the row beneath it, and one that takes the mouse eats a click aimed
    // at that row. Read-only content has no business doing so.
    //
    // Proof: the default flipped to `pointerEvents: 'auto'` — this failed on
    // `expected 'auto' to be 'none'`, and the browser's own
    // `a click through an open card lands on the row beneath`
    // (`e2e/hover-cards.spec.ts`) failed with it. Watched, 2026-08-09.
    render(<HoverCard label="Dev for 010">4.8 days</HoverCard>);

    expect(screen.getByRole('tooltip').style.pointerEvents).toBe('none');
  });

  itDom('lets the one card that scrolls take the wheel back', () => {
    // The exception, and the whole of it: a preview taller than 320px is
    // unreadable unless it can be scrolled, and scrolling is a pointer event.
    // Asserted through the Name cell's preview rather than through the prop,
    // because the preview asking for it is the fact that matters.
    //
    // Proof: `scrolls` dropped from `HoverPreview`'s card — failed on
    // `expected 'none' to be 'auto'` and `expected '' to be 'auto'`. Watched,
    // 2026-08-09.
    render(<HoverPreview name="Strip" notes={'- one\n- two'} number="010" />);

    const preview = screen.getByRole('tooltip');
    expect(preview.style.pointerEvents).toBe('auto');
    expect(preview.style.overflowY).toBe('auto');
    expect(preview.style.maxHeight).toBe('320px');
  });
});
