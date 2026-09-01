import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HintLayer } from './hint';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** Two controls — one hinted, one not — and the layer that draws for them. */
function aPageWithAHint(): { hinted: HTMLElement; bare: HTMLElement } {
  render(
    <div>
      <HintLayer />
      <button type="button" data-hint="Undo your last change to this plan">
        Undo
      </button>
      <button type="button">Redo</button>
    </div>,
  );
  return {
    hinted: screen.getByRole('button', { name: 'Undo' }),
    bare: screen.getByRole('button', { name: 'Redo' }),
  };
}

/**
 * A `pointerover` of one kind or the other, built by hand.
 *
 * jsdom has no `PointerEvent`, so `fireEvent.pointerOver(node, { pointerType })`
 * builds a plain `Event` and **drops** the init's `pointerType`: the layer's
 * guard then reads `undefined`, refuses, and every assertion about the pointer
 * path passes because nothing was ever pointed. `wbs-table.test.tsx` and
 * `gantt-panel.test.tsx` carry the same helper for the same reason; all three
 * are the trap, not a preference.
 */
const pointAt = (node: HTMLElement, pointerType: 'mouse' | 'touch' = 'mouse'): void => {
  const event = new Event('pointerover', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  // Through `fireEvent` and not `node.dispatchEvent`: the former wraps the
  // dispatch in `act`, so the state the listener sets is flushed before the
  // assertion. Dispatched raw, the card is drawn a tick after it is looked for.
  fireEvent(node, event);
};

describe('every hint is drawn by the page and not by the browser', () => {
  itDom('opens the page’s own card on a pointer, with no timer to wait out', () => {
    const { hinted } = aPageWithAHint();

    // Nothing before the pointer arrives: the card is rendered, not hidden.
    expect(screen.queryByRole('tooltip')).toBeNull();

    pointAt(hinted);

    // Proof: `HintLayer`'s `pointerover` listener and its handler deleted —
    // the words then reach a reader only through an attribute nothing draws.
    // Watched failing on `Unable to find an accessible element with the role
    // "tooltip"`, which is `getByRole` on a card that was never opened.
    expect(screen.getByRole('tooltip').textContent).toBe('Undo your last change to this plan');
  });

  itDom('closes when the pointer moves to something with nothing to say', () => {
    const { hinted, bare } = aPageWithAHint();

    pointAt(hinted);
    expect(screen.queryByRole('tooltip')).not.toBeNull();

    // The seam this layer is built around: a `pointerover` on the control the
    // pointer moved **to** is what closes the last one, so there is no
    // departure to miss. Proof: `setOpen(hintAt(…))` replaced by an early
    // `return` where `hintAt` answers null — which is the per-control
    // `onMouseEnter`-only arrangement, and leaves the last card up for good.
    // Watched failing on `expected <div role="tooltip" …(2)></div> to be
    // null`.
    pointAt(bare);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  itDom('says nothing at all to a tap', () => {
    const { hinted } = aPageWithAHint();

    // The touch seam, as on the Gantt's bars and the table's rows: Chromium
    // synthesizes a whole mouse sequence from a tap and a tap has no departure
    // behind it, so a card opened on one is stuck on whatever was touched last.
    //
    // Proof: the `pointerType !== 'mouse'` guard deleted, watched failing on
    // `expected <div role="tooltip" …(2)></div> to be null`.
    pointAt(hinted, 'touch');

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  itDom('opens from the keyboard too, and points the control at what it says', () => {
    const { hinted } = aPageWithAHint();

    // A `title` on a focusable control is announced as its description, so a
    // card only a pointer can open is data withheld from anybody who does not
    // use one — `start-date-hover-card`'s own argument, one cell wider.
    //
    // Proof: the `focusin` listener and its handler deleted, watched failing
    // on `Unable to find an accessible element with the role "tooltip"` — the
    // `getByRole` below, on a card the keyboard could not open.
    fireEvent.focusIn(hinted);

    const card = screen.getByRole('tooltip');
    expect(hinted.getAttribute('aria-describedby')).toBe(card.id);
  });

  itDom('takes the description back off the control when the card goes', () => {
    const { hinted, bare } = aPageWithAHint();

    fireEvent.focusIn(hinted);
    expect(hinted.getAttribute('aria-describedby')).not.toBeNull();

    pointAt(bare);

    // A control that has been hinted is indistinguishable at rest from one that
    // never was — an `aria-describedby` left pointing at a card that is no
    // longer in the document is a broken reference, which a screen reader reads
    // as nothing at all rather than as an error.
    //
    // Proof: the cleanup's `removeAttribute` dropped, watched failing on
    // `expected 'hint-card' to be null`.
    expect(hinted.getAttribute('aria-describedby')).toBeNull();
  });

  itDom('closes on Escape without taking the pointer or the focus anywhere', () => {
    const { hinted } = aPageWithAHint();

    fireEvent.focusIn(hinted);
    expect(screen.queryByRole('tooltip')).not.toBeNull();

    // Proof: the `keydown` listener and its handler deleted, watched failing
    // on `expected <div role="tooltip" …(2)></div> to be null`.
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  itDom('an empty hint is a control with nothing to say, not a card with nothing in it', () => {
    render(
      <div>
        <HintLayer />
        <button type="button" data-hint="">
          Reset layout
        </button>
      </div>,
    );

    // The attribute is written from a value that may be absent — a toggle whose
    // reason is only there while it is off — so an empty one is not a fault.
    //
    // Proof: the `words === ''` half of the guard deleted, watched failing on
    // `expected <div role="tooltip" …(2)></div> to be null` — an empty card
    // under the pointer.
    pointAt(screen.getByRole('button', { name: 'Reset layout' }));

    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
