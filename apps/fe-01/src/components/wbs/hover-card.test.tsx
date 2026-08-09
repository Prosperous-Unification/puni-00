import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HoverCard, surfacePlacement } from './hover-card';
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

  itDom('renders a body that is not a work item’s notes', () => {
    // The generalization this change is about: the card is placement and the
    // body is whatever the mark has to say. The Name cell's preview is one
    // body; a Gantt bar's facts are another, and neither is built into this.
    render(
      <HoverCard label="Facts for 3.2">
        <p>Dev · Kat</p>
      </HoverCard>,
    );

    expect(screen.getByRole('tooltip').textContent).toBe('Dev · Kat');
  });

  itDom('places an anchored card out of the document, fixed, under its mark', () => {
    // jsdom measures nothing, so the card's own size is 0×0 here and the
    // placement is the anchor's own left and bottom. What this asserts is the
    // wiring the arithmetic below cannot: that an anchored card leaves the
    // component's own subtree for the document, and is `fixed` rather than
    // `absolute`. Where it lands once it has a size is a browser fact
    // (`e2e/gantt.spec.ts`).
    const { container } = render(
      <HoverCard label="Facts for 3.2" anchor={{ left: 120, top: 200, bottom: 228 }}>
        <p>Dev · Kat</p>
      </HoverCard>,
    );

    const surface = screen.getByRole('tooltip');
    expect(container.contains(surface)).toBe(false);
    expect(document.body.contains(surface)).toBe(true);
    expect(surface.style.position).toBe('fixed');
    expect(surface.style.left).toBe('120px');
  });
});

describe('an anchored surface stays inside the viewport', () => {
  const SCREEN = { width: 1000, height: 800 };
  const CARD = { width: 300, height: 120 };

  itDom('opens under its mark when there is room below', () => {
    expect(surfacePlacement({ left: 100, top: 200, bottom: 228 }, CARD, SCREEN)).toEqual({
      left: 100,
      top: 234,
    });
  });

  itDom('flips above a mark near the bottom of the screen', () => {
    // Proof: the flip removed — `top` fixed at `anchor.bottom + gap` — `2
    // failed | 6 passed`, this one on `expected { left: 100, top: 780 } to
    // deeply equal { left: 100, top: 624 }`, a card hanging 100px off the
    // bottom of the screen, and the last test in this block with it. The
    // browser's own half of the same fault is
    // `flips a surface above a bar near the bottom of the window`. Watched,
    // 2026-08-09.
    expect(surfacePlacement({ left: 100, top: 750, bottom: 774 }, CARD, SCREEN)).toEqual({
      left: 100,
      top: 624,
    });
  });

  itDom('clamps a mark near the right edge back inside the screen', () => {
    // Proof: the whole clamp dropped, so `left` is the anchor's own — `2
    // failed | 6 passed`, this one on `expected { left: 950, top: 234 } to
    // deeply equal { left: 700, top: 234 }`, a card whose right edge is 1250 on
    // a 1000px screen, and the last test in this block with it. The browser's
    // half is `clamps the right-most bar's surface inside the window`.
    // Watched, 2026-08-09.
    expect(surfacePlacement({ left: 950, top: 200, bottom: 228 }, CARD, SCREEN)).toEqual({
      left: 700,
      top: 234,
    });
  });

  itDom('never places a card off the left edge or above the top one', () => {
    // Both clamps at once, on a screen too small for the card in either
    // direction: the `Math.max(0, …)` pair is what keeps the two corrections
    // above from overshooting into a card nobody can see.
    //
    // Proof, twice, each with the test above it: the flip removed, this failed
    // on `expected { left: +0, top: 64 } to deeply equal { left: +0, top: +0 }`
    // — no top clamp to reach; the clamp on `left` dropped, on `expected {
    // left: 10, top: +0 } to deeply equal { left: +0, top: +0 }`. Watched,
    // 2026-08-09.
    expect(
      surfacePlacement({ left: 10, top: 30, bottom: 58 }, CARD, { width: 200, height: 100 }),
    ).toEqual({ left: 0, top: 0 });
  });
});
